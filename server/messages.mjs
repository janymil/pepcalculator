/**
 * Every word the server says, in the three languages the app speaks.
 *
 * Why the server has its own table rather than importing the app's. The app's
 * dictionaries are ~30 kB each and live in TypeScript under `src/i18n/`, which
 * the server cannot load (see `recurrence.mjs` for the same problem, and the
 * agreement test that guards it). The server needs about fifteen messages, not
 * six hundred, so it carries exactly those — and only those.
 *
 * The rules for this text, which are the same rules as the reminder itself:
 *   - nothing medical. No condition, no benefit, no advice. This is a personal
 *     planner, so it says "your planned time", never "take your medication".
 *   - every message the user can act on says how to stop.
 *   - plain sentences, no jargon, no exclamation marks.
 */

import { zonedNow } from './recurrence.mjs';

/** The languages the app speaks, so the server never answers in a fourth. */
export const LANGUAGES = ['en', 'sk', 'es'];

/** Used when the language is unknown — an unlinked number, or a bare payload. */
export const DEFAULT_LANGUAGE = 'en';

/**
 * A language tag reduced to one the server has: `sk-SK` and `SK` are both `sk`.
 * Anything not recognised falls back rather than throwing.
 */
export function resolveLanguage(raw) {
  const tag = String(raw ?? '')
    .trim()
    .toLowerCase()
    .split(/[-_]/)[0];
  return LANGUAGES.includes(tag) ? tag : DEFAULT_LANGUAGE;
}

/**
 * Joins lines, dropping `null`/`undefined` entirely and keeping `''` as a real
 * blank line.
 *
 * Every language needs this, because "Dose: …" is dropped when there is no dose
 * but the blank line around it must stay. Doing it per language rather than with
 * one shared template is deliberate: word order is not universal, and a
 * translator should be able to rearrange a sentence without touching code.
 */
function lines(...parts) {
  return parts.filter((part) => part !== null && part !== undefined).join('\n');
}

/* ---------- English ---------- */

const en = {
  fields: { dose: 'Dose', time: 'Time', status: 'Status' },

  /** For the digest's heading and for the day in a "next dose" line. */
  days: { today: 'today', tomorrow: 'tomorrow' },

  /**
   * The heading that divides a digest by person, and the word used for the
   * device's own owner when they have not saved a name.
   */
  digestFor: ({ name }) => `For ${name}`,
  you: 'you',

  statusWords: {
    active: 'on',
    paused: 'paused',
    stopped: 'stopped',
    pending: 'waiting to be linked',
    error: 'stopped after repeated delivery failures',
  },

  /*
   * The daily digest — every dose due today, in one message.
   *
   * `entries` arrives already laid out by `digestEntries`, because arranging a
   * list is not a translation problem. The words around it are, so they live
   * here where a translator can move them.
   */
  digest: ({ entries, more }) =>
    lines(
      'Pepstool — your doses today',
      '',
      entries,
      more ? `…and ${more} more today — open the app to see them.` : null,
      '',
      'Reply STOP to stop these messages, PAUSE to pause, STATUS for what is on.',
    ),

  finished: ({ label }) =>
    lines(
      'Pepstool reminder',
      '',
      label ? `${label} has reached the end of its plan.` : 'Your plan has reached its end.',
      'No more reminders will be sent for it.',
      '',
      'Reply HELP if you want to set up another one.',
    ),

  help: ({ manageUrl }) =>
    lines(
      'Pepstool WhatsApp reminders',
      '',
      'STOP — stop these messages',
      'PAUSE — pause for now',
      'RESUME — start them again',
      'STATUS — what is currently on',
      '08:00 — change the reminder time',
      '',
      'To start a plan, send: START and the code shown next to your plan.',
      manageUrl ? `\nYour plans: ${manageUrl}` : null,
    ),

  notLinked: ({ manageUrl }) =>
    lines(
      'Pepstool WhatsApp reminders',
      '',
      'This number is not set up for reminders yet.',
      'Open your plan, tap "Remind me on WhatsApp", and send the code it shows.',
      manageUrl ? `\nYour plans: ${manageUrl}` : null,
    ),

  badCode: () =>
    lines(
      'That code is not valid any more.',
      '',
      'Open your plan and tap "Remind me on WhatsApp" to get a fresh one.',
      'Reply HELP for the list of commands.',
    ),

  linked: ({ label, dose, draw, time }) =>
    lines(
      'Reminders are on.',
      label || null,
      dose ? `Dose: ${[dose, draw].filter(Boolean).join(' · ')}` : null,
      `Next one: ${time} (your time zone).`,
      '',
      'Reply STOP to stop these messages.',
    ),

  alreadyLinked: ({ label, time }) =>
    lines(
      'Reminders are already on for this number.',
      label || null,
      time ? `Next one: ${time}.` : null,
      '',
      'Reply STOP to stop these messages, STATUS for what is on.',
    ),

  stopped: () =>
    lines(
      'Stopped. You will not get any more reminders on this number.',
      '',
      'Send START with your code if you want them back.',
    ),

  paused: () =>
    lines(
      'Paused. No reminders until you send RESUME.',
      '',
      'Send STOP at any time to stop completely.',
    ),

  resumed: ({ time }) =>
    lines(
      'Reminders are on again.',
      time ? `Next one: ${time} (your time zone).` : null,
      '',
      'Reply STOP to stop these messages.',
    ),

  timeChanged: ({ time, label }) =>
    lines(
      `Done — reminders will come at ${time} from now on.`,
      label ? `(${label})` : null,
      '',
      'Send another time like 08:00 to change it again, or STOP to stop.',
    ),

  chooseWhich: ({ plans }) =>
    lines(
      'Which one? This number has more than one plan.',
      '',
      plans,
      '',
      'Reply with the number and the time, for example: 2 20:00',
    ),


  status: ({ plans, count }) =>
    lines(
      count === 1 ? 'Pepstool reminders' : `Pepstool reminders (${count})`,
      '',
      plans,
      '',
      'Reply HELP for the list of commands.',
    ),

  noPlans: () =>
    lines(
      'Pepstool reminders',
      '',
      'Nothing is on for this number at the moment.',
      '',
      'Reply HELP for the list of commands.',
    ),
};

/* ---------- Slovak ---------- */

const sk = {
  fields: { dose: 'Dávka', time: 'Čas', status: 'Stav' },

  days: { today: 'dnes', tomorrow: 'zajtra' },

  digestFor: ({ name }) => `Pre ${name}`,
  you: 'teba',

  statusWords: {
    active: 'zapnuté',
    paused: 'pozastavené',
    stopped: 'zastavené',
    pending: 'čaká na prepojenie',
    error: 'zastavené po opakovaných chybách doručenia',
  },

  digest: ({ entries, more }) =>
    lines(
      'Pepstool — dnešné dávky',
      '',
      entries,
      more ? `…a ešte ${more} dnes — otvor aplikáciu.` : null,
      '',
      'Pre zastavenie správ pošli STOP, pre pauzu PAUSE, pre prehľad STATUS.',
    ),

  finished: ({ label }) =>
    lines(
      'Pepstool pripomienka',
      '',
      label ? `${label} dosiahol koniec svojho plánu.` : 'Tvoj plán dosiahol koniec.',
      'Ďalšie pripomienky už nebudú chodiť.',
      '',
      'Ak si chceš nastaviť ďalší, pošli HELP.',
    ),

  help: ({ manageUrl }) =>
    lines(
      'Pripomienky Pepstool na WhatsApp',
      '',
      'STOP — zastaviť tieto správy',
      'PAUSE — pozastaviť',
      'RESUME — znovu spustiť',
      'STATUS — čo je práve aktívne',
      '08:00 — zmeniť čas pripomienky',
      '',
      'Pre spustenie plánu pošli: START a kód, ktorý vidíš pri svojom pláne.',
      manageUrl ? `\nTvoje plány: ${manageUrl}` : null,
    ),

  notLinked: ({ manageUrl }) =>
    lines(
      'Pripomienky Pepstool na WhatsApp',
      '',
      'Toto číslo zatiaľ nemá nastavené pripomienky.',
      'Otvor si plán, klikni na „Pripomínaj na WhatsApp“ a pošli kód, ktorý sa zobrazí.',
      manageUrl ? `\nTvoje plány: ${manageUrl}` : null,
    ),

  badCode: () =>
    lines(
      'Tento kód už nie je platný.',
      '',
      'Otvor si plán a klikni na „Pripomínaj na WhatsApp“, dostaneš nový kód.',
      'Pre zoznam príkazov pošli HELP.',
    ),

  linked: ({ label, dose, draw, time }) =>
    lines(
      'Pripomienky sú zapnuté.',
      label || null,
      dose ? `Dávka: ${[dose, draw].filter(Boolean).join(' · ')}` : null,
      `Ďalšia: ${time} (tvoje časové pásmo).`,
      '',
      'Pre zastavenie správ pošli STOP.',
    ),

  alreadyLinked: ({ label, time }) =>
    lines(
      'Pripomienky už na tomto čísle zapnuté sú.',
      label || null,
      time ? `Ďalšia: ${time}.` : null,
      '',
      'Pre zastavenie pošli STOP, pre prehľad STATUS.',
    ),

  stopped: () =>
    lines(
      'Zastavené. Na toto číslo už žiadne pripomienky neprídu.',
      '',
      'Ak ich chceš späť, pošli START s kódom.',
    ),

  paused: () =>
    lines(
      'Pozastavené. Pripomienky nebudú chodiť, kým nepošleš RESUME.',
      '',
      'Úplne zastaviť môžeš kedykoľvek cez STOP.',
    ),

  resumed: ({ time }) =>
    lines(
      'Pripomienky sú opäť zapnuté.',
      time ? `Ďalšia: ${time} (tvoje časové pásmo).` : null,
      '',
      'Pre zastavenie správ pošli STOP.',
    ),

  timeChanged: ({ time, label }) =>
    lines(
      `Hotovo — pripomienky budú odteraz chodiť o ${time}.`,
      label ? `(${label})` : null,
      '',
      'Ďalším časom ako 08:00 to zmeníš znova, STOP všetko zastaví.',
    ),

  chooseWhich: ({ plans }) =>
    lines(
      'Ktorý z nich? Toto číslo má viac plánov.',
      '',
      plans,
      '',
      'Pošli číslo a čas, napríklad: 2 20:00',
    ),


  status: ({ plans, count }) =>
    lines(
      count === 1 ? 'Pripomienky Pepstool' : `Pripomienky Pepstool (${count})`,
      '',
      plans,
      '',
      'Pre zoznam príkazov pošli HELP.',
    ),

  noPlans: () =>
    lines(
      'Pripomienky Pepstool',
      '',
      'Na tomto čísle momentálne nič nie je aktívne.',
      '',
      'Pre zoznam príkazov pošli HELP.',
    ),
};

/* ---------- Spanish ---------- */

const es = {
  fields: { dose: 'Dosis', time: 'Hora', status: 'Estado' },

  days: { today: 'hoy', tomorrow: 'mañana' },

  digestFor: ({ name }) => `Para ${name}`,
  you: 'ti',

  statusWords: {
    active: 'activo',
    paused: 'en pausa',
    stopped: 'detenido',
    pending: 'esperando vinculación',
    error: 'detenido tras varios fallos de envío',
  },

  digest: ({ entries, more }) =>
    lines(
      'Pepstool — tus dosis de hoy',
      '',
      entries,
      more ? `…y ${more} más hoy — ábrela en la app.` : null,
      '',
      'Envía STOP para detener estos mensajes, PAUSE para pausar, STATUS para ver qué está activo.',
    ),

  finished: ({ label }) =>
    lines(
      'Recordatorio de Pepstool',
      '',
      label ? `${label} ha llegado al final de su plan.` : 'Tu plan ha llegado a su fin.',
      'No se enviarán más recordatorios.',
      '',
      'Envía HELP si quieres configurar otro.',
    ),

  help: ({ manageUrl }) =>
    lines(
      'Recordatorios de Pepstool en WhatsApp',
      '',
      'STOP — detener estos mensajes',
      'PAUSE — pausar por ahora',
      'RESUME — volver a activarlos',
      'STATUS — qué está activo ahora',
      '08:00 — cambiar la hora del recordatorio',
      '',
      'Para empezar un plan, envía: START y el código que aparece junto a tu plan.',
      manageUrl ? `\nTus planes: ${manageUrl}` : null,
    ),

  notLinked: ({ manageUrl }) =>
    lines(
      'Recordatorios de Pepstool en WhatsApp',
      '',
      'Este número todavía no tiene recordatorios configurados.',
      'Abre tu plan, toca "Recordarme por WhatsApp" y envía el código que aparece.',
      manageUrl ? `\nTus planes: ${manageUrl}` : null,
    ),

  badCode: () =>
    lines(
      'Ese código ya no es válido.',
      '',
      'Abre tu plan y toca "Recordarme por WhatsApp" para obtener uno nuevo.',
      'Envía HELP para ver la lista de comandos.',
    ),

  linked: ({ label, dose, draw, time }) =>
    lines(
      'Los recordatorios están activos.',
      label || null,
      dose ? `Dosis: ${[dose, draw].filter(Boolean).join(' · ')}` : null,
      `El siguiente: ${time} (tu zona horaria).`,
      '',
      'Envía STOP para detener estos mensajes.',
    ),

  alreadyLinked: ({ label, time }) =>
    lines(
      'Los recordatorios ya están activos en este número.',
      label || null,
      time ? `El siguiente: ${time}.` : null,
      '',
      'Envía STOP para detenerlos, STATUS para ver qué está activo.',
    ),

  stopped: () =>
    lines(
      'Detenido. No recibirás más recordatorios en este número.',
      '',
      'Envía START con tu código si quieres recuperarlos.',
    ),

  paused: () =>
    lines(
      'En pausa. No habrá recordatorios hasta que envíes RESUME.',
      '',
      'Envía STOP cuando quieras detenerlo del todo.',
    ),

  resumed: ({ time }) =>
    lines(
      'Los recordatorios vuelven a estar activos.',
      time ? `El siguiente: ${time} (tu zona horaria).` : null,
      '',
      'Envía STOP para detener estos mensajes.',
    ),

  timeChanged: ({ time, label }) =>
    lines(
      `Listo — los recordatorios llegarán a las ${time} desde ahora.`,
      label ? `(${label})` : null,
      '',
      'Envía otra hora como 08:00 para cambiarla, o STOP para detenerlos.',
    ),

  chooseWhich: ({ plans }) =>
    lines(
      '¿Cuál? Este número tiene más de un plan.',
      '',
      plans,
      '',
      'Responde con el número y la hora, por ejemplo: 2 20:00',
    ),


  status: ({ plans, count }) =>
    lines(
      count === 1 ? 'Recordatorios de Pepstool' : `Recordatorios de Pepstool (${count})`,
      '',
      plans,
      '',
      'Envía HELP para ver la lista de comandos.',
    ),

  noPlans: () =>
    lines(
      'Recordatorios de Pepstool',
      '',
      'Ahora mismo no hay nada activo en este número.',
      '',
      'Envía HELP para ver la lista de comandos.',
    ),
};

export const MESSAGES = { en, sk, es };

/**
 * The table for a language tag, always a real one. A language we do not have
 * falls back rather than throwing, because an unrecognised tag is a display
 * problem, not a reason to drop somebody's reminder on the floor.
 */
export function tableFor(lang) {
  return MESSAGES[resolveLanguage(lang)];
}

/**
 * One plan, as a block of lines — used by both `status` and `chooseWhich`.
 *
 * Formatting, not prose: the field *names* come from the language table, so a
 * translated list stays aligned without the layout being translated too.
 */
export function planBlock(lang, plan, index) {
  const table = tableFor(lang);
  return lines(
    `${index + 1}. ${plan.label || '?'}`,
    plan.dose ? `   ${table.fields.dose}: ${plan.dose}` : null,
    `   ${table.fields.time}: ${plan.time}`,
    `   ${table.fields.status}: ${table.statusWords[plan.status] ?? plan.status}`,
  );
}

/** Every plan as one block, blank line between them. */
export function planList(lang, plans) {
  return plans.map((plan, index) => planBlock(lang, plan, index)).join('\n\n');
}

/** The same plans as one short line each, for "which one did you mean?". */
export function planChoices(lang, plans) {
  return plans
    .map((plan, index) => `${index + 1}. ${plan.label || '?'} — ${plan.time}`)
    .join('\n');
}

/* ---------- the digest, and the day it is for ---------- */

/** Locales for `Intl`, so no weekday or month name is ever hand-written. */
const DATE_LOCALES = { en: 'en-GB', sk: 'sk-SK', es: 'es-ES' };

/** The next calendar day, from a `YYYY-MM-DD`. Anchored at noon to dodge DST. */
function nextIsoDay(iso) {
  const day = new Date(`${iso}T12:00:00Z`);
  day.setUTCDate(day.getUTCDate() + 1);
  return day.toISOString().slice(0, 10);
}

/**
 * The day a dose falls on, in words: "today", "tomorrow", or "Friday 16 Oct".
 *
 * This exists because of a real message. Sent on a Wednesday at 12:34, it said
 * "next one at 10:00" with no day at all, and read as tomorrow morning. The dose
 * was Friday. Naming the day is the difference between a reminder and a puzzle —
 * and the date is there too, because "Friday" is ambiguous when it *is* Friday.
 */
export function localDay({ atMs, nowMs, timeZone, lang }) {
  if (atMs === null || atMs === undefined) return '';
  const zone = timeZone || 'UTC';
  const table = tableFor(lang);
  const today = zonedNow(nowMs, zone).iso;
  const target = zonedNow(atMs, zone).iso;

  if (target === today) return table.days.today;
  if (target === nextIsoDay(today)) return table.days.tomorrow;

  return new Intl.DateTimeFormat(DATE_LOCALES[resolveLanguage(lang)], {
    timeZone: zone,
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  }).format(new Date(atMs));
}

/**
 * The body of a digest: every dose of the day, divided by person.
 *
 * One person's digest is the plain list. The moment a second person appears —
 * a partner on the same device — a flat list stops working: two doses at 08:00
 * with no way to tell whose is whose. So the heading appears only when it is
 * needed to tell them apart, which keeps the common case free of a label that
 * answers a question nobody asked.
 *
 * `person` is the name the app holds for that person, and '' for the device's
 * own owner — who gets the local word for "you" rather than a blank.
 *
 * Layout, not prose: the field *name* comes from the language table, so a
 * translated digest stays aligned without the layout being translated.
 */
export function digestEntries(lang, rows) {
  const table = tableFor(lang);

  // Grouped in the order each person first appears, and the rows arrive sorted
  // by time — so the people come out in the order their day starts.
  const groups = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const person = String(row.person ?? '').trim();
    let group = groups.find((candidate) => candidate.person === person);
    if (!group) {
      group = { person, entries: [] };
      groups.push(group);
    }
    group.entries.push(row);
  }

  const body = (group) =>
    group.entries
      .map((entry) =>
        lines(
          `${entry.time} · ${entry.label || '?'}`,
          entry.dose
            ? `${table.fields.dose}: ${[entry.dose, entry.draw].filter(Boolean).join(' · ')}`
            : null,
        ),
      )
      .join('\n\n');

  if (groups.length <= 1) return groups.map(body).join('\n\n');

  return groups
    .map((group) =>
      lines(table.digestFor({ name: group.person || table.you }), '', body(group)),
    )
    .join('\n\n');
}



