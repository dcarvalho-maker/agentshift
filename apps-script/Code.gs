/**
 * AgentShift — Booking Backend (Google Apps Script)
 *
 * DEPLOIEMENT :
 * 1. https://script.google.com → Nouveau projet
 * 2. Coller ce code dans Code.gs
 * 3. Renseigner CONFIG ci-dessous
 * 4. Déployer → Nouveau déploiement → Application Web
 *    - Exécuter en tant que : Moi
 *    - Accès : Tout le monde
 * 5. Copier l'URL /exec → la reporter dans le widget du site
 *
 * ⚠️ Le script s'exécute sous le compte qui le déploie. Si ce compte
 *    est supprimé, la réservation du site s'arrête sans avertissement.
 */

// ============================================
// CONFIGURATION
// ============================================

const CONFIG = {
  // Agendas CONSULTÉS pour détecter les indisponibilités.
  // Un créneau n'est proposé que s'il est libre dans TOUS ces agendas.
  // Les adresses à ne pas publier (le dépôt est public) se mettent dans la
  // propriété de script AGENDAS_OCCUPES, séparées par des virgules : elles
  // s'ajoutent à cette liste. Voir getBusyCalendarIds().
  BUSY_CALENDAR_IDS: ['primary', 'contact@agentshift.pro'],

  // Agenda où le rendez-vous est CRÉÉ.
  // Peut différer des précédents : on lit les occupations partout,
  // on écrit à un seul endroit.
  BOOKING_CALENDAR_ID: 'primary',

  NOTIFICATION_EMAIL: 'contact@agentshift.pro',

  AVAILABLE_HOURS: { start: 9, end: 18 },
  SLOT_DURATION: 45,
  BUFFER: 15,
  WORKING_DAYS: [1, 2, 3, 4, 5],
  DAYS_AHEAD: 28,
  MIN_NOTICE_HOURS: 24,
  TIMEZONE: 'Europe/Paris',
  EVENT_TITLE_PREFIX: 'Diagnostic AgentShift —'
};

// NOTE CORS — Apps Script ne permet pas de définir d'en-têtes sur
// ContentService : toute liste d'origines autorisées y serait sans
// effet. L'ancien getCorsHeaders() calculait des en-têtes que
// jsonResponse() ignorait, donnant une fausse impression de contrôle.
// Le filtrage d'origine doit se faire en amont (Cloudflare Function).

// ============================================
// POINTS D'ENTRÉE
// ============================================

function doGet(e) {
  try {
    const action = e.parameter.action;

    if (action === 'slots') {
      return jsonResponse({ success: true, slots: getAvailableSlots() });
    }

    if (action === 'book') {
      return jsonResponse(bookSlot({
        start:   e.parameter.start,
        name:    e.parameter.name,
        email:   e.parameter.email,
        company: e.parameter.company || '',
        size:    e.parameter.size || '',
        message: e.parameter.message || '',
        guests:  e.parameter.guests || ''
      }));
    }

    return jsonResponse({ success: false, error: 'Action inconnue' });

  } catch (error) {
    Logger.log('GET Error: ' + error.toString());
    return jsonResponse({ success: false, error: error.toString() });
  }
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    if (data.action === 'book') return jsonResponse(bookSlot(data));
    return jsonResponse({ success: false, error: 'Action inconnue' });
  } catch (error) {
    Logger.log('POST Error: ' + error.toString());
    return jsonResponse({ success: false, error: error.toString() });
  }
}

// ============================================
// LOGIQUE MÉTIER
// ============================================

/**
 * Agendas surveillés : CONFIG + propriété de script AGENDAS_OCCUPES,
 * dédoublonnés. Exemple de propriété : "agentshiftpro@gmail.com".
 */
function getBusyCalendarIds() {
  var extra = PropertiesService.getScriptProperties().getProperty('AGENDAS_OCCUPES') || '';
  var ids = CONFIG.BUSY_CALENDAR_IDS.concat(extra.split(','));
  var seen = {}, out = [];
  ids.forEach(function (id) {
    id = String(id).trim();
    if (id && !seen[id.toLowerCase()]) { seen[id.toLowerCase()] = true; out.push(id); }
  });
  return out;
}

/**
 * Plages occupées, tous agendas confondus, entre from et to : [{start, end}].
 *
 * Passe par l'API Freebusy (service avancé « Google Calendar API », à activer
 * dans l'éditeur) : elle suffit d'un partage « disponibilités uniquement » et
 * ignore les événements marqués « disponible ». Sans le service avancé, repli
 * sur CalendarApp, qui exige un accès en lecture aux événements.
 *
 * Fermé par défaut : si UN agenda ne peut pas être lu, on lève une erreur
 * plutôt que de proposer des créneaux qui ignorent cet agenda.
 */
function getBusyIntervals(from, to, onlyIds) {
  var ids = onlyIds || getBusyCalendarIds();
  var busy = [];

  if (typeof Calendar !== 'undefined' && Calendar.Freebusy) {
    var resp = Calendar.Freebusy.query({
      timeMin: from.toISOString(),
      timeMax: to.toISOString(),
      timeZone: CONFIG.TIMEZONE,
      items: ids.map(function (id) { return { id: id }; })
    });
    ids.forEach(function (id) {
      var cal = resp.calendars && resp.calendars[id];
      if (!cal || (cal.errors && cal.errors.length)) {
        throw new Error('Agenda illisible : ' + id + ' ('
          + (cal && cal.errors ? cal.errors.map(function (e) { return e.reason; }).join(', ') : 'absent')
          + '). Partager ses disponibilités avec le compte qui exécute le script.');
      }
      (cal.busy || []).forEach(function (b) {
        busy.push({ start: new Date(b.start), end: new Date(b.end) });
      });
    });
    return busy;
  }

  ids.forEach(function (id) {
    var cal = CalendarApp.getCalendarById(id);
    if (!cal) {
      throw new Error('Agenda illisible : ' + id
        + '. Activer le service avancé « Google Calendar API », ou partager cet agenda en lecture.');
    }
    cal.getEvents(from, to).forEach(function (ev) {
      busy.push({ start: ev.getStartTime(), end: ev.getEndTime() });
    });
  });
  return busy;
}

function overlaps(start, end, busy) {
  return busy.some(function (b) { return start < b.end && end > b.start; });
}

function getAvailableSlots() {
  const now = new Date();
  const minBookingTime = new Date(now.getTime() + CONFIG.MIN_NOTICE_HOURS * 3600 * 1000);
  const slots = [];
  const totalSlotMinutes = CONFIG.SLOT_DURATION + CONFIG.BUFFER;

  // Une seule lecture des agendas pour toute la période.
  const rangeEnd = new Date(now);
  rangeEnd.setDate(rangeEnd.getDate() + CONFIG.DAYS_AHEAD + 1);
  const busy = getBusyIntervals(now, rangeEnd);

  for (let d = 0; d < CONFIG.DAYS_AHEAD; d++) {
    const date = new Date(now);
    date.setDate(date.getDate() + d);
    if (!CONFIG.WORKING_DAYS.includes(date.getDay())) continue;

    const dayStart = new Date(date);
    dayStart.setHours(CONFIG.AVAILABLE_HOURS.start, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(CONFIG.AVAILABLE_HOURS.end, 0, 0, 0);

    const daySlotsCount = Math.floor(
      (CONFIG.AVAILABLE_HOURS.end - CONFIG.AVAILABLE_HOURS.start) * 60 / totalSlotMinutes
    );
    const daySlots = [];

    for (let s = 0; s < daySlotsCount; s++) {
      const slotStart = new Date(dayStart);
      slotStart.setMinutes(slotStart.getMinutes() + s * totalSlotMinutes);
      const slotEnd = new Date(slotStart.getTime() + CONFIG.SLOT_DURATION * 60000);

      if (slotStart < minBookingTime) continue;

      if (!overlaps(slotStart, slotEnd, busy)) {
        daySlots.push({
          start: slotStart.toISOString(),
          end: slotEnd.toISOString(),
          display: formatTime(slotStart) + ' – ' + formatTime(slotEnd)
        });
      }
    }

    if (daySlots.length > 0) {
      slots.push({
        date: formatDate(dayStart),
        dateISO: Utilities.formatDate(dayStart, CONFIG.TIMEZONE, 'yyyy-MM-dd'),
        weekday: formatWeekday(dayStart),
        slots: daySlots
      });
    }
  }
  return slots;
}

/**
 * Le créneau demandé fait-il partie de ceux réellement proposés ?
 * Seul garde-fou fiable : une seule source de vérité, getAvailableSlots().
 * Sans cette vérification, n'importe quelle date est réservable —
 * y compris dans le passé, la nuit ou un dimanche.
 */
function isSlotOffered(slotStart) {
  const wanted = slotStart.getTime();
  const days = getAvailableSlots();
  for (var i = 0; i < days.length; i++) {
    for (var j = 0; j < days[i].slots.length; j++) {
      if (new Date(days[i].slots[j].start).getTime() === wanted) return true;
    }
  }
  return false;
}

/** Normalise une liste d'invités : dédoublonne et écarte les adresses invalides. */
function normalizeGuests(primaryEmail, extra) {
  const re = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;
  var raw = [primaryEmail];
  if (extra) {
    raw = raw.concat(Array.isArray(extra) ? extra : String(extra).split(/[,;]/));
  }
  const seen = {}, out = [];
  raw.forEach(function (a) {
    const addr = String(a).trim().toLowerCase();
    if (addr && re.test(addr) && !seen[addr]) { seen[addr] = true; out.push(addr); }
  });
  return out;
}

function bookSlot(data) {
  if (!data.start || !data.name || !data.email) {
    return { success: false, error: 'Champs requis : start, name, email' };
  }

  const slotStart = new Date(data.start);
  if (isNaN(slotStart.getTime())) {
    return { success: false, error: 'Date invalide.' };
  }

  // Garde-fou : refuse tout créneau qui n'est pas réellement proposé.
  if (!isSlotOffered(slotStart)) {
    return {
      success: false,
      error: 'Ce créneau n\'est pas disponible. Veuillez en choisir un autre.'
    };
  }

  const slotEnd = new Date(slotStart.getTime() + CONFIG.SLOT_DURATION * 60000);

  // Double-vérification anti-collision, sur tous les agendas surveillés.
  if (overlaps(slotStart, slotEnd, getBusyIntervals(slotStart, slotEnd))) {
    return {
      success: false,
      error: 'Ce créneau vient d\'être réservé. Veuillez en choisir un autre.'
    };
  }

  const guests = normalizeGuests(data.email, data.guests);

  const bookingCal = CalendarApp.getCalendarById(CONFIG.BOOKING_CALENDAR_ID);
  if (!bookingCal) {
    return { success: false, error: 'Agenda de réservation introuvable.' };
  }

  const description = [
    '--- Diagnostic AgentShift ---',
    '',
    'Nom : ' + data.name,
    'Email : ' + data.email,
    'Entreprise : ' + (data.company || 'Non renseigné'),
    'Effectif : ' + (data.size || 'Non renseigné'),
    'Message : ' + (data.message || 'Aucun'),
    guests.length > 1 ? 'Participants : ' + guests.join(', ') : '',
    '',
    '---',
    'Réservé via le site agentshift.pro'
  ].filter(String).join('\n');

  const event = bookingCal.createEvent(
    CONFIG.EVENT_TITLE_PREFIX + ' ' + data.name,
    slotStart, slotEnd,
    { description: description, guests: guests.join(','), sendInvites: true }
  );

  sendNotificationEmail(data, slotStart, slotEnd, guests);

  return {
    success: true,
    message: 'Votre créneau est confirmé.',
    eventId: event.getId(),
    date: formatDate(slotStart),
    time: formatTime(slotStart) + ' – ' + formatTime(slotEnd),
    guests: guests
  };
}

function sendNotificationEmail(data, start, end, guests) {
  const body = [
    'Nouveau diagnostic réservé.',
    '',
    'Qui : ' + data.name + ' (' + data.email + ')',
    'Entreprise : ' + (data.company || 'Non renseigné'),
    'Effectif : ' + (data.size || 'Non renseigné'),
    'Quand : ' + formatDate(start) + ' à ' + formatTime(start) + ' – ' + formatTime(end),
    'Message : ' + (data.message || '—'),
    (guests && guests.length > 1) ? 'Participants : ' + guests.join(', ') : '',
    '',
    'L\'invitation Google Calendar a été envoyée automatiquement.',
    '',
    '— L\'équipe AgentShift'
  ].filter(String).join('\n');

  MailApp.sendEmail({
    to: CONFIG.NOTIFICATION_EMAIL,
    subject: 'Nouveau RDV AgentShift — ' + data.name,
    body: body
  });
}

// ============================================
// UTILITAIRES
// ============================================

function formatTime(date)    { return Utilities.formatDate(date, CONFIG.TIMEZONE, 'HH:mm'); }
function formatDate(date)    { return Utilities.formatDate(date, CONFIG.TIMEZONE, 'EEEE d MMMM yyyy'); }
function formatWeekday(date) { return Utilities.formatDate(date, CONFIG.TIMEZONE, 'EEE'); }

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================
// TESTS (à exécuter manuellement dans l'éditeur)
// ============================================

/** Dit, agenda par agenda, si le script le lit, et combien de plages occupées il y voit sur 7 jours. */
function testAgendas() {
  var from = new Date(), to = new Date(from.getTime() + 7 * 86400000);
  Logger.log('Mode : ' + ((typeof Calendar !== 'undefined' && Calendar.Freebusy) ? 'Freebusy (service avancé)' : 'CalendarApp (repli)'));
  getBusyCalendarIds().forEach(function (id) {
    try { Logger.log('OK    ' + id + ' : ' + getBusyIntervals(from, to, [id]).length + ' plage(s) occupée(s) sur 7 jours'); }
    catch (e) { Logger.log('ÉCHEC ' + id + ' : ' + e.message); }
  });
}

function testGetSlots() {
  Logger.log(JSON.stringify(getAvailableSlots(), null, 2));
}

/** Doit échouer : créneau dans le passé. */
function testRefusePasse() {
  Logger.log(JSON.stringify(bookSlot({
    start: '2020-01-01T09:00:00.000Z', name: 'Test', email: 'test@example.com'
  })));
}

/** Doit échouer : heure hors grille. */
function testRefuseHorsGrille() {
  const d = new Date(Date.now() + 72 * 3600 * 1000);
  d.setHours(3, 47, 0, 0);
  Logger.log(JSON.stringify(bookSlot({
    start: d.toISOString(), name: 'Test', email: 'test@example.com'
  })));
}
