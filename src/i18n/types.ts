import type { ModeId, WarningCode } from '../lib/calc';

export type Lang = 'en' | 'sk' | 'es';

export interface ModeCopy {
  /** Short name shown on the tab, e.g. "Peptides". */
  title: string;
  /** One-line explanation under the title. */
  desc: string;
  /** Tiny badge, e.g. "Needs reconstitution". */
  tag: string;
}

export interface FieldCopy {
  label: string;
  hint: string;
}

/**
 * The complete set of UI strings. Every dictionary (`en`, `sk`, `es`) must
 * implement this interface, so adding a new string immediately surfaces a type
 * error in every language that is missing it. That is the whole point: it makes
 * adding languages and features safe.
 */
export interface Strings {
  appName: string;
  tagline: string;
  theme: { light: string; dark: string; label: string; themeColor: string };
  language: { label: string };
  sections: { inputs: string; syringe: string; results: string };
  modes: Record<ModeId, ModeCopy>;
  fields: {
    vialAmount: FieldCopy;
    waterMl: FieldCopy;
    concentration: FieldCopy;
    dose: FieldCopy;
    vialSize: FieldCopy;
    syringeType: FieldCopy;
    syringeCapacity: FieldCopy;
    vialPrice: FieldCopy;
  };
  results: {
    drawUnitsLabel: string;
    drawVolumeLabel: string;
    drawUnitsSub: string;
    volume: string;
    concentration: string;
    totalInVial: string;
    dosesPerVial: string;
    doseInMg: string;
    empty: string;
    emptyHint: string;
    unitsWord: string;
    notApplicable: string;
  };
  syringeVisual: { ariaLabel: string };
  warnings: Record<WarningCode, string>;
  actions: { reset: string };
  validation: {
    /** Shown under a field whose text is not a usable positive number. */
    invalidNumber: string;
  };
  units: { mg: string; mcg: string; ml: string };
  disclaimer: { title: string; body: string; pointOfUse: string };
  firstRun: {
    title: string;
    body: string;
    exampleLabel: string;
    /** Example chips, shown above the mode tabs on a first visit. */
    examplePeptide: string;
    exampleAnabolic: string;
    dismiss: string;
  };
  today: {
    title: string;
    next: string;
    none: string;
    load: string;
    markTaken: string;
    taken: string;
    /** Joins a time to a day label, e.g. "09:00 · Today". */
    timeSeparator: string;
  };
  summary: { draw: string; nothing: string };
  inverse: {
    /** Toggle/label for the "I drew X, what is that?" mode. */
    title: string;
    /** Hint under the drawn-volume input. */
    hint: string;
    /** Label above the derived dose. */
    dose: string;
    /** Placeholder for the drawn-volume input. */
    volumePlaceholder: string;
  };
  toast: { dismiss: string; vialDeleted: string; deletedAll: string; undo: string };
  danger: {
    title: string;
    note: string;
    clear: string;
    confirm: string;
    cleared: string;
  };
  footer: { note: string; version: string };
  vials: {
    title: string;
    empty: string;
    emptyHint: string;
    save: string;
    nameLabel: string;
    namePlaceholder: string;
    untitled: string;
    dateLabel: string;
    /** Date field label for anabolic vials (they are never "reconstituted"). */
    dateLabelAnabolic: string;
    dosesLeft: string;
    volumeLeft: string;
    perDose: string;
    reconstitutedOn: string;
    useBy: string;
    daysLeft: string;
    lastDay: string;
    expired: string;
    /** Shown instead of a use-by date for anabolics, which have no 28-day BUD. */
    noExpiry: string;
    load: string;
    addDose: string;
    removeDose: string;
    delete: string;
    budNote: string;
    /** Cost of one dose, derived from the optional vial price. */
    costPerDose: string;
    /** Cost to finish the whole saved plan, derived from the vial price. */
    planCost: string;
    /** Accessible label for the button that expands a vial card's detail. */
    details: string;
    /** Placeholder for the vial search box. */
    search: string;
    /** Label for the sort control. */
    sortLabel: string;
    sortNewest: string;
    sortName: string;
    sortExpiry: string;
  };
  schedule: {
    title: string;
    timesPerDay: string;
    repeat: string;
    repeatDaily: string;
    repeatWeekdays: string;
    weekdays: string;
    duration: string;
    duration4w: string;
    duration8w: string;
    duration12w: string;
    duration3m: string;
    duration4m: string;
    durationOngoing: string;
    draw: string;
    nextDose: string;
    today: string;
    tomorrow: string;
    dosesDone: string;
    planEnds: string;
    planOngoing: string;
    needsVials: string;
    calendar: string;
    prevMonth: string;
    nextMonth: string;
    viewMonth: string;
    viewWeek: string;
    viewDay: string;
    noDose: string;
    earlier: string;
  };
  edit: {
    title: string;
    save: string;
    cancel: string;
    name: string;
    date: string;
    vialAmount: string;
    water: string;
    dose: string;
    syringe: string;
  };
  backup: {
    title: string;
    note: string;
    download: string;
    restore: string;
    done: string;
    restored: string;
    errorInvalidJson: string;
    errorNotABackup: string;
    errorNoVials: string;
  };
  sync: {
    title: string;
    intro: string;
    warning: string;
    create: string;
    useExisting: string;
    codeInputLabel: string;
    codePlaceholder: string;
    serverLabel: string;
    codeLabel: string;
    copy: string;
    copied: string;
    syncNow: string;
    syncing: string;
    forget: string;
    never: string;
    lastSynced: string;
    okUpToDate: string;
    okPulled: string;
    /**
     * Explains how long a deleted vial is remembered before the tombstone is
     * swept away. Placeholder: `{days}`.
     */
    retention: string;
    errorInvalidCode: string;
    errorNetwork: string;
    errorServer: string;
    errorBadPayload: string;
    errorUnavailable: string;
  };
  reminders: {
    title: string;
    intro: string;
    enable: string;
    disable: string;
    allow: string;
    permissionGranted: string;
    permissionDefault: string;
    permissionDenied: string;
    permissionUnsupported: string;
    /** e.g. "Next: {name}" — the following date/time is appended by the UI. */
    nextUp: string;
    noneUpcoming: string;
    today: string;
    tomorrow: string;
    installedHint: string;
    keepOpenHint: string;
    /** Title of the OS notification. */
    notifyTitle: string;
    /** Body of the OS notification. */
    notifyBody: string;
  };
  views: {
    /** Accessible name for the page switcher. */
    label: string;
    calculator: string;
    vials: string;
    calendar: string;
    reference: string;
    settings: string;
  };
  kinds: {
    /** Accessible name for the peptide/anabolic filter. */
    label: string;
    all: string;
    peptide: string;
    anabolic: string;
  };
  people: {
    /** Accessible name for the person switcher. */
    label: string;
    /** Fallback name for the first (unnamed) person. */
    me: string;
    add: string;
    namePlaceholder: string;
    save: string;
    cancel: string;
    /** Settings panel heading. */
    title: string;
    subtitle: string;
    /** Vial count next to a person, e.g. "{count} vials". */
    vials: string;
    remove: string;
    /** Shown when a person still holds vials and cannot be removed. */
    removeBlocked: string;
  };
  emptyCta: {
    /** Button on the Vials empty state that jumps to the calculator. */
    goToCalculator: string;
    /** Button on the Calendar empty state that jumps to the calculator. */
    createPlan: string;
  };
  agenda: {
    subtitle: string;
    empty: string;
    calendarAria: string;
    today: string;
    upcoming: string;
    upcomingNone: string;
    plans: string;
    /** e.g. "Days: {days}". */
    onDays: string;
    /** e.g. "Times: {times}". */
    atTimes: string;
    /** Overflow marker inside a day cell, e.g. "+{count}". */
    more: string;
  };
  settings: {
    title: string;
    subtitle: string;
  };
  reference: {
    title: string;
    /** One-line explanation under the page title. */
    subtitle: string;
    /** Row label for the cited typical range of a compound. */
    typical: string;
    /** Row label for how often it is usually taken. */
    cadence: string;
    /** Row label for the elimination half-life. */
    halfLife: string;
    /** Row label for common reconstitution volumes. */
    water: string;
    /** Unit for a half-life under a day, e.g. "h". */
    halfLifeUnit: string;
    /** Unit for a half-life of a day or more, e.g. "days". */
    halfLifeDaysUnit: string;
    /** The strong reminder under the list that this is not advice. */
    note: string;
  };
}
