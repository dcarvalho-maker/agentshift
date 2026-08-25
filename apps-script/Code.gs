/**
 * AgentShift — Booking Backend (Google Apps Script)
 *
 * DEPLOIEMENT :
 * 1. Va sur https://script.google.com → Nouveau projet
 * 2. Colle ce code dans le fichier Code.gs
 * 3. Configure les variables ci-dessous
 * 4. Déployer → Nouvelle déploiement → Application Web
 *    - Exécuter en tant que : Moi
 *    - Accès : Tout le monde
 * 5. Copie l'URL de déploiement → colle-la dans le widget frontend
 */

// ============================================
// CONFIGURATION — À PERSONNALISER
// ============================================

const CONFIG = {
  // ID de ton Google Calendar (souvent ton email)
  CALENDAR_ID: 'primary',

  // Email de notification quand un RDV est pris
  NOTIFICATION_EMAIL: 'contact@agentshift.pro',

  // Créneaux disponibles (format 24h)
  AVAILABLE_HOURS: {
    start: 9,   // 9h00
    end: 18     // 18h00 (dernier créneau à 17h00)
  },

  // Durée du RDV en minutes
  SLOT_DURATION: 45,

  // Pause entre les RDV en minutes
  BUFFER: 15,

  // Jours ouvrés (0=Dim, 1=Lun, ... 6=Sam)
  WORKING_DAYS: [1, 2, 3, 4, 5],

  // Nombre de jours à afficher dans le futur
  DAYS_AHEAD: 28,

  // Délai minimum avant réservation (en heures)
  MIN_NOTICE_HOURS: 24,

  // Fuseau horaire
  TIMEZONE: 'Europe/Paris',

  // Titre de l'événement créé dans le calendrier
  EVENT_TITLE_PREFIX: 'Diagnostic AgentShift —',

  // Origines autorisées (CORS)
  ALLOWED_ORIGINS: [
    'https://dcarvalho-maker.github.io',
    'https://agentshift.pro',
    'http://localhost',
    'http://127.0.0.1'
  ]
};


// ============================================
// POINTS D'ENTRÉE (GET & POST)
// ============================================

function doGet(e) {
  const origin = e.parameter.origin || '';
  const headers = getCorsHeaders(origin);

  try {
    const action = e.parameter.action;

    if (action === 'slots') {
      const slots = getAvailableSlots();
      return jsonResponse({ success: true, slots: slots }, headers);
    }

    if (action === 'book') {
      const data = {
        start: e.parameter.start,
        name: e.parameter.name,
        email: e.parameter.email,
        company: e.parameter.company || '',
        size: e.parameter.size || '',
        message: e.parameter.message || ''
      };
      const result = bookSlot(data);
      return jsonResponse(result, headers);
    }

    return jsonResponse({ success: false, error: 'Action inconnue' }, headers);

  } catch (error) {
    Logger.log('GET Error: ' + error.toString());
    return jsonResponse({ success: false, error: error.toString() }, headers);
  }
}

function doPost(e) {
  const origin = e.parameter.origin || '';
  const headers = getCorsHeaders(origin);

  try {
    const data = JSON.parse(e.postData.contents);

    if (data.action === 'book') {
      const result = bookSlot(data);
      return jsonResponse(result, headers);
    }

    return jsonResponse({ success: false, error: 'Action inconnue' }, headers);

  } catch (error) {
    Logger.log('POST Error: ' + error.toString());
    return jsonResponse({ success: false, error: error.toString() }, headers);
  }
}


// ============================================
// LOGIQUE MÉTIER
// ============================================

/**
 * Récupère les créneaux disponibles sur les N prochains jours
 */
function getAvailableSlots() {
  const calendar = CalendarApp.getCalendarById(CONFIG.CALENDAR_ID);
  const now = new Date();
  const minBookingTime = new Date(now.getTime() + CONFIG.MIN_NOTICE_HOURS * 60 * 60 * 1000);

  const slots = [];
  const totalSlotMinutes = CONFIG.SLOT_DURATION + CONFIG.BUFFER;

  for (let d = 0; d < CONFIG.DAYS_AHEAD; d++) {
    const date = new Date(now);
    date.setDate(date.getDate() + d);

    // Vérifier que c'est un jour ouvré
    if (!CONFIG.WORKING_DAYS.includes(date.getDay())) continue;

    // Récupérer les événements de la journée
    const dayStart = new Date(date);
    dayStart.setHours(CONFIG.AVAILABLE_HOURS.start, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(CONFIG.AVAILABLE_HOURS.end, 0, 0, 0);

    const events = calendar.getEvents(dayStart, dayEnd);

    // Générer les créneaux possibles
    const daySlotsCount = Math.floor(
      (CONFIG.AVAILABLE_HOURS.end - CONFIG.AVAILABLE_HOURS.start) * 60 / totalSlotMinutes
    );

    const daySlots = [];

    for (let s = 0; s < daySlotsCount; s++) {
      const slotStart = new Date(dayStart);
      slotStart.setMinutes(slotStart.getMinutes() + s * totalSlotMinutes);

      const slotEnd = new Date(slotStart);
      slotEnd.setMinutes(slotEnd.getMinutes() + CONFIG.SLOT_DURATION);

      // Vérifier que le créneau est dans le futur (+ délai minimum)
      if (slotStart < minBookingTime) continue;

      // Vérifier qu'il n'y a pas de conflit avec un événement existant
      const hasConflict = events.some(event => {
        const eventStart = event.getStartTime();
        const eventEnd = event.getEndTime();
        return (slotStart < eventEnd && slotEnd > eventStart);
      });

      if (!hasConflict) {
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
        dateISO: dayStart.toISOString().split('T')[0],
        weekday: formatWeekday(dayStart),
        slots: daySlots
      });
    }
  }

  return slots;
}


/**
 * Réserve un créneau
 */
function bookSlot(data) {
  // Validation
  if (!data.start || !data.name || !data.email) {
    return { success: false, error: 'Champs requis : start, name, email' };
  }

  const calendar = CalendarApp.getCalendarById(CONFIG.CALENDAR_ID);
  const slotStart = new Date(data.start);
  const slotEnd = new Date(slotStart.getTime() + CONFIG.SLOT_DURATION * 60 * 1000);

  // Double-vérification qu'il n'y a pas de conflit
  const conflicts = calendar.getEvents(slotStart, slotEnd);
  if (conflicts.length > 0) {
    return {
      success: false,
      error: 'Ce créneau vient d\'être réservé. Veuillez en choisir un autre.'
    };
  }

  // Créer l'événement
  const title = CONFIG.EVENT_TITLE_PREFIX + ' ' + data.name;
  const description = [
    '--- Diagnostic AgentShift ---',
    '',
    'Nom : ' + data.name,
    'Email : ' + data.email,
    'Entreprise : ' + (data.company || 'Non renseigné'),
    'Effectif : ' + (data.size || 'Non renseigné'),
    'Message : ' + (data.message || 'Aucun'),
    '',
    '---',
    'Réservé via le site agentshift.pro'
  ].join('\n');

  const event = calendar.createEvent(title, slotStart, slotEnd, {
    description: description,
    guests: data.email,
    sendInvites: true
  });

  // Notification email à David
  sendNotificationEmail(data, slotStart, slotEnd);

  return {
    success: true,
    message: 'Votre créneau est confirmé.',
    eventId: event.getId(),
    date: formatDate(slotStart),
    time: formatTime(slotStart) + ' – ' + formatTime(slotEnd)
  };
}


/**
 * Envoie un email de notification au consultant
 */
function sendNotificationEmail(data, start, end) {
  const subject = '🟢 Nouveau RDV AgentShift — ' + data.name;
  const body = [
    'Nouveau diagnostic réservé !',
    '',
    'Qui : ' + data.name + ' (' + data.email + ')',
    'Entreprise : ' + (data.company || 'Non renseigné'),
    'Effectif : ' + (data.size || 'Non renseigné'),
    'Quand : ' + formatDate(start) + ' à ' + formatTime(start) + ' – ' + formatTime(end),
    'Message : ' + (data.message || '—'),
    '',
    'L\'invitation Google Calendar a été envoyée automatiquement.',
    '',
    '— Bob (AgentShift CEO)'
  ].join('\n');

  MailApp.sendEmail({
    to: CONFIG.NOTIFICATION_EMAIL,
    subject: subject,
    body: body
  });
}


// ============================================
// UTILITAIRES
// ============================================

function formatTime(date) {
  return Utilities.formatDate(date, CONFIG.TIMEZONE, 'HH:mm');
}

function formatDate(date) {
  return Utilities.formatDate(date, CONFIG.TIMEZONE, 'EEEE d MMMM yyyy');
}

function formatWeekday(date) {
  return Utilities.formatDate(date, CONFIG.TIMEZONE, 'EEE');
}

function getCorsHeaders(origin) {
  const isAllowed = CONFIG.ALLOWED_ORIGINS.some(o => origin.startsWith(o));
  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : CONFIG.ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
}

function jsonResponse(data, headers) {
  const output = ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
  return output;
}


// ============================================
// TEST (exécuter manuellement pour vérifier)
// ============================================

function testGetSlots() {
  const slots = getAvailableSlots();
  Logger.log(JSON.stringify(slots, null, 2));
}
