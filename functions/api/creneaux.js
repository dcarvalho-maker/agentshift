/**
 * GET /api/creneaux — créneaux disponibles
 *
 * Proxifie les disponibilités Google Calendar (Apps Script) et en retire les
 * créneaux déjà réservés dans Supabase. Le navigateur ne parle plus jamais
 * directement à Google : l'URL du script reste côté serveur, et la réponse est
 * mise en cache 5 minutes au bord.
 *
 * Format de sortie identique à l'ancien endpoint Apps Script, pour que le
 * widget de réservation existant fonctionne sans réécriture :
 *   { success: true, slots: [ { date, dateISO, weekday, slots: [ {start,end,display} ] } ] }
 */

const CACHE_SECONDS = 300;

const json = (data, status = 200, cache = false) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': cache ? `public, max-age=${CACHE_SECONDS}` : 'no-store',
    },
  });

/** Créneaux déjà pris, en ISO. Un échec Supabase ne doit pas casser
 *  l'affichage : on préfère montrer trop de créneaux (l'index unique en base
 *  refusera la double réservation) plutôt qu'un widget vide. */
async function creneauxPris(env) {
  try {
    const depuis = new Date(Date.now() - 3600e3).toISOString();
    const url = `${env.SUPABASE_URL}/rest/v1/rendez_vous`
      + `?select=creneau&statut=neq.annule&creneau=gte.${depuis}`;
    const r = await fetch(url, {
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    });
    if (!r.ok) throw new Error(`supabase ${r.status}`);
    const rows = await r.json();
    return new Set(rows.map((x) => new Date(x.creneau).getTime()));
  } catch (e) {
    console.error('lecture creneaux pris', e);
    return new Set();
  }
}

export async function onRequestGet({ env }) {
  if (!env.APPS_SCRIPT_URL) return json({ success: false, error: 'configuration_incomplete' }, 500);

  let dispo;
  try {
    const r = await fetch(
      `${env.APPS_SCRIPT_URL}?action=slots&origin=${encodeURIComponent('https://agentshift.pro')}`,
      { redirect: 'follow' },
    );
    dispo = await r.json();
  } catch (e) {
    console.error('apps script slots', e);
    return json({ success: false, error: 'disponibilites_indisponibles' }, 502);
  }

  if (!dispo?.success || !Array.isArray(dispo.slots)) {
    return json({ success: false, error: 'disponibilites_indisponibles' }, 502);
  }

  const pris = await creneauxPris(env);

  const jours = dispo.slots
    .map((jour) => ({
      ...jour,
      slots: (jour.slots || []).filter((s) => !pris.has(new Date(s.start).getTime())),
    }))
    .filter((jour) => jour.slots.length > 0);

  return json({ success: true, slots: jours }, 200, true);
}
