# Backend de réservation — Google Apps Script

`Code.gs` est le backend qui alimente le widget de prise de rendez-vous du site :
il expose les créneaux libres et crée l'événement dans Google Calendar.

Le widget l'appelle sur deux actions :

| Action | Effet |
|---|---|
| `?action=slots` | renvoie les créneaux libres des `DAYS_AHEAD` prochains jours |
| `?action=book` | crée l'événement, invite les participants, notifie par mail |

---

## ⚠️ Le script s'exécute sous le compte qui le déploie

Déployé en « Exécuter en tant que : Moi », il tourne avec les droits du compte
Google qui a créé le déploiement. **Si ce compte est supprimé, la prise de
rendez-vous du site s'arrête sans aucun avertissement** : l'URL `/exec` devient
invalide et le widget échoue silencieusement.

C'est exactement le risque en cours : le script vit historiquement sous
`d.carvalho@l2concept.com`, compte qui ferme avec la liquidation de L2concept.

---

## Configuration

```js
BUSY_CALENDAR_IDS: ['primary'],
BOOKING_CALENDAR_ID: 'primary',
```

**État déployé au 27/08/2026.** Le script s'exécutant sous
`contact@agentshift.pro`, `primary` désigne l'agenda principal de ce compte.
Les rendez-vous du site **et** ceux créés par Bob y atterrissent, décision du
27/08 : un agenda principal ne peut pas être orphelin, contrairement à un
agenda secondaire qui meurt avec le compte qui l'a créé.

Corollaire heureux : `BOOKING_CALENDAR_ID` figurant par construction dans
`BUSY_CALENDAR_IDS`, la double réservation décrite plus bas devient impossible.

Les deux clés **peuvent** différer, et le reste de cette section explique
pourquoi on pourrait le vouloir un jour.

`BUSY_CALENDAR_IDS` — tous les agendas consultés pour savoir quand vous êtes
occupé. En oublier un fait proposer aux prospects des créneaux déjà pris.

`BOOKING_CALENDAR_ID` — l'unique agenda où le rendez-vous est créé.

🔴 **L'agenda de réservation doit figurer aussi dans `BUSY_CALENDAR_IDS`.**
Sans cela le script ne voit pas les rendez-vous qu'il a lui-même créés, et deux
prospects peuvent réserver le même créneau.

---

## Migrer vers un nouveau compte

1. **Créer l'agenda depuis le compte cible** — pas depuis un autre puis le
   partager : Google ne transfère pas la propriété d'un agenda entre comptes,
   et il serait supprimé avec son compte d'origine.

2. **Récupérer son ID** : Paramètres de l'agenda → Intégrer l'agenda →
   *ID de l'agenda* (`…@group.calendar.google.com`).

3. **Renseigner `CONFIG`** avec cet ID dans les deux clés ci-dessus.

4. **Déployer** : script.google.com → nouveau projet → coller `Code.gs` →
   Déployer → Application Web → *Exécuter en tant que : Moi*, *Accès : Tout le monde*.

5. **Reporter la nouvelle URL `/exec`** dans `index.html` (constante
   `APPS_SCRIPT_URL` sur `main`, variable d'environnement `APPS_SCRIPT_URL` du
   projet Cloudflare Pages sur `feat/rdv-supabase`).

6. **Vérifier la visio.** Le lien Google Meet n'est pas créé par ce script mais
   par un réglage de l'agenda. Sur un agenda neuf, contrôler qu'il est actif —
   sinon les invitations partent sans lien de connexion.

7. **Tester** avant de communiquer l'adresse : `?action=slots` doit renvoyer du
   JSON, et les fonctions `testRefusePasse` / `testRefuseHorsGrille` de
   l'éditeur doivent toutes deux échouer proprement.

---

## Voir les rendez-vous dans l'app Calendrier d'Apple

L'application Calendrier n'est pas iCloud : c'est une interface, iCloud est un
stockage. Ajouter le compte Google dans **Calendrier → Réglages → Comptes**
affiche les rendez-vous sur Mac et iPhone, en lecture **et** en écriture, avec
synchronisation immédiate — tout en gardant les données chez Google, seul moyen
de détecter les conflits en temps réel.

Tenir l'agenda dans iCloud casserait cette détection : Google ne peut s'y
abonner qu'en ICS, avec 8 à 24 h de latence.

---

## Limites connues

**Aucun filtrage d'origine possible.** Apps Script ne permet pas de définir
d'en-têtes sur `ContentService` : une liste d'origines autorisées y serait sans
effet (l'ancienne version en contenait une, purement décorative). Le filtrage
doit se faire en amont, dans la Cloudflare Function.

**L'URL de déploiement vaut authentification.** Qui la connaît peut créer des
rendez-vous. Sur `main` elle est en clair dans le HTML public ; sur
`feat/rdv-supabase` elle est côté serveur, derrière Turnstile.

**`sendInvites: true` envoie un vrai mail** à chaque adresse de `guests`.
Attention en test.
