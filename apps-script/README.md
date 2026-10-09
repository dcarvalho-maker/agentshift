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
BUSY_CALENDAR_IDS: ['primary', 'contact@agentshift.pro'],
BOOKING_CALENDAR_ID: 'primary',
```

Plus une **propriété de script** `AGENDAS_OCCUPES` (Paramètres du projet →
Propriétés du script), qui ajoute des agendas sans publier leur adresse dans
le dépôt public. Valeur actuelle attendue : `agentshiftpro@gmail.com`.

**État déployé.** Le script s'exécute sous `contact@agentshift.pro` (relevé le
27/08/2026) : `primary` désigne l'agenda principal de ce compte, où atterrissent
les rendez-vous du site et ceux créés par Bob. Un agenda principal ne peut pas
être orphelin, contrairement à un agenda secondaire qui meurt avec son compte.

**Un créneau n'est proposé que s'il est libre dans tous les agendas listés**,
CONFIG et propriété réunis.

`BOOKING_CALENDAR_ID` est l'unique agenda où le rendez-vous est créé.

🔴 **L'agenda de réservation doit figurer aussi dans les agendas surveillés.**
Sans cela le script ne voit pas les rendez-vous qu'il a lui-même créés, et deux
prospects peuvent réserver le même créneau. `'primary'` y est pour cette raison.

### Lire un agenda d'un autre compte

Le script lit les disponibilités par l'API Freebusy. Deux conditions :

1. **Activer le service avancé** dans l'éditeur : Services → ➕ →
   *Google Calendar API* → Ajouter.
2. **Partager chaque agenda extérieur** avec le compte qui exécute le script,
   au niveau *Voir uniquement les disponibilités* au minimum (Google Agenda →
   Paramètres de l'agenda → Partager avec des personnes).

**Fermé par défaut** : si un agenda ne peut pas être lu, le script refuse de
proposer des créneaux plutôt que d'en proposer qui l'ignorent. Le widget
affiche alors une erreur. La fonction `testAgendas` de l'éditeur dit, agenda
par agenda, ce que le script arrive à lire.

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

7. **Tester** avant de communiquer l'adresse : `testAgendas` doit afficher OK
   pour chaque agenda, `?action=slots` doit renvoyer du JSON, et les fonctions `testRefusePasse` / `testRefuseHorsGrille` de
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
