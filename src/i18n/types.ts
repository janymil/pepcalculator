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
  theme: { light: string; dark: string; label: string };
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
  units: { mg: string; mcg: string; ml: string };
  disclaimer: { title: string; body: string };
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
    settings: string;
  };
  kinds: {
    /** Accessible name for the peptide/anabolic filter. */
    label: string;
    all: string;
    peptide: string;
    anabolic: string;
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
}
