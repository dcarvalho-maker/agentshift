/**
 * POST /api/rdv — prise de rendez-vous AgentShift
 *
 * Cloudflare Pages Function. Tourne côté serveur : c'est ce qui permet de garder
 * SUPABASE_SERVICE_ROLE_KEY hors du navigateur et de vérifier Turnstile.
 *
 * Chaîne complète :
 *   navigateur ──POST JSON──► cette Function
 *        ├─ vérifie Turnstile (anti-bot)
 *        ├─ valide les champs
 *        ├─ INSERT Supabase  ──► webhook ──► Edge Function ──► push Expo
 *        └─ crée l'événement Google Calendar via Apps Script
 *
 * Variables d'environnement (Cloudflare Pages > Settings > Environment variables,
 * toutes en "Encrypted") :
 *   SUPABASE_URL              https://<projet>.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY clé service_role — JAMAIS exposée au client
 *   TURNSTILE_SECRET_KEY      clé secrète Turnstile
 *   APPS_SCRIPT_URL           URL /exec du script Google Calendar
 */

const DUREE_MIN = 45;
const CRENEAU_MIN_HEURES = 2;    // pas de RDV dans les 2 prochaines heures
const CRENEAU_MAX_JOURS = 90;
const MAX_LEN = { name: 120, email: 254, company: 160, size: 40, message: 4000 };

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

async function verifierTurnstile(token, secret, ip) {
  if (!token) return false;
  const body = new FormData();
  body.append('secret', secret);
  body.append('response', token);
  if (ip) body.append('remoteip', ip);
  try {
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body,
    });
    const data = await r.json();
    return data.success === true;
  } catch {
    return false;
  }
}

function valider(payload) {
  const erreurs = [];
  const champ = (k) => (typeof payload[k] === 'string' ? payload[k].trim() : '');

  const name = champ('name');
  const email = champ('email').toLowerCase();
  const company = champ('company');
  const size = champ('size');
  const message = champ('message');

  if (name.length < 2) erreurs.push('name');
  // Volontairement permissif : la seule vraie validation d'un email, c'est de lui écrire.
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email)) erreurs.push('email');
  for (const [k, v] of Object.entries({ name, email, company, size, message })) {
    if (v.length > MAX_LEN[k]) erreurs.push(k);
  }

  const debut = new Date(champ('start'));
  if (Number.isNaN(debut.getTime())) {
    erreurs.push('start');
  } else {
    const now = Date.now();
    if (debut.getTime() < now + CRENEAU_MIN_HEURES * 3600e3) erreurs.push('start');
    if (debut.getTime() > now + CRENEAU_MAX_JOURS * 86400e3) erreurs.push('start');
  }

  const fin = new Date(debut.getTime() + DUREE_MIN * 60e3);

  return {
    erreurs,
    ligne: {
      nom: name,
      email,
      societe: company || null,
      taille_societe: size || null,
      message: message || null,
      creneau: debut.toISOString(),
      fin: Number.isNaN(fin.getTime()) ? null : fin.toISOString(),
      source: 'site',
    },
  };
}

/** Crée l'événement Google Calendar. N'envoie QUE le minimum nécessaire à
 *  l'invitation : société, taille et message restent dans Supabase, hors des
 *  logs Google. Best-effort : un échec ici n'annule pas le rendez-vous. */
async function creerEvenement(env, ligne) {
  if (!env.APPS_SCRIPT_URL) return { ok: false, raison: 'non_configure' };
  const params = new URLSearchParams({
    action: 'book',
    origin: 'https://agentshift.pro',
    start: ligne.creneau,
    name: ligne.nom,
    email: ligne.email,
  });
  try {
    const r = await fetch(`${env.APPS_SCRIPT_URL}?${params}`, { redirect: 'follow' });
    const data = await r.json();
    return data.success ? { ok: true, id: data.eventId ?? null } : { ok: false, raison: data.error };
  } catch (e) {
    return { ok: false, raison: String(e) };
  }
}

async function traiterPost(request, env) {
  for (const k of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'TURNSTILE_SECRET_KEY']) {
    if (!env[k]) {
      console.error('variable manquante:', k);
      return json({ ok: false, erreur: 'configuration_incomplete' }, 500);
    }
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ ok: false, erreur: 'json_invalide' }, 400);
  }

  const ip = request.headers.get('CF-Connecting-IP');
  const humain = await verifierTurnstile(payload['cf-turnstile-response'], env.TURNSTILE_SECRET_KEY, ip);
  if (!humain) return json({ ok: false, erreur: 'turnstile_refuse' }, 403);

  const { erreurs, ligne } = valider(payload);
  if (erreurs.length) return json({ ok: false, erreur: 'champs_invalides', champs: erreurs }, 422);

  // service_role contourne la RLS, qui verrouille la table pour anon.
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rendez_vous`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'content-type': 'application/json',
      prefer: 'return=representation',
    },
    body: JSON.stringify(ligne),
  });

  if (!res.ok) {
    const detail = await res.text();
    // 23505 = violation d'unicité => le créneau vient d'être pris par quelqu'un d'autre.
    if (res.status === 409 || detail.includes('23505')) {
      return json({ ok: false, erreur: 'creneau_indisponible' }, 409);
    }
    console.error('supabase insert failed', res.status, detail);
    return json({ ok: false, erreur: 'enregistrement_impossible' }, 502);
  }

  const [rdv] = await res.json();

  // Le RDV est enregistré : à partir d'ici on ne renvoie plus d'échec au visiteur.
  const cal = await creerEvenement(env, ligne);
  if (rdv?.id) {
    await fetch(`${env.SUPABASE_URL}/rest/v1/rendez_vous?id=eq.${rdv.id}`, {
      method: 'PATCH',
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        calendar_sync: cal.ok ? 'ok' : 'failed',
        calendar_event_id: cal.id ?? null,
      }),
    }).catch((e) => console.error('patch calendar_sync', e));
    if (!cal.ok) console.error('calendar sync failed', cal.raison);
  }

  return json({ ok: true, id: rdv?.id, creneau: rdv?.creneau, calendrier: cal.ok }, 201);
}

// Handler unique : on dispatche nous-mêmes sur la méthode. Sans ça, une requête
// GET sur /api/rdv retombe sur le repli statique de Pages et renvoie la page
// d'accueil en 200 — trompeur pour un endpoint d'API.
export async function onRequest({ request, env }) {
  if (request.method === 'POST') return traiterPost(request, env);
  return new Response(JSON.stringify({ ok: false, erreur: 'methode_non_autorisee' }), {
    status: 405,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      allow: 'POST',
      'cache-control': 'no-store',
    },
  });
}
