import type { ModeId, WarningCode } from '../lib/calc';
import type { MeasureField } from '../lib/measure';
import type { SiteId } from '../lib/sites';
import type { WorkedExampleId } from '../lib/workedExamples';

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

/** One titled step of a routine or a check list. */
export interface StepCopy {
  title: string;
  body: string;
}

/** One measurement point: what it is called, and how to find it on the body. */
export interface PointCopy {
  label: string;
  /** Where on the body, and how — the part people actually get wrong. */
  how: string;
}

/** A device routine: its own heading and its ordered steps. */
export interface RoutineCopy {
  title: string;
  steps: StepCopy[];
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
  sections: { inputs: string; syringe: string; pen: string; results: string };
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
    /** Pen dial resolution: how many clicks make 1 mL. */
    clicksPerMl: FieldCopy;
    /** Total volume the pen holds, for the optional doses-per-pen figure. */
    penVolume: FieldCopy;
  };
  results: {
    drawUnitsLabel: string;
    drawVolumeLabel: string;
    /** Headline label for a pen: "Dial to". */
    drawClicksLabel: string;
    drawUnitsSub: string;
    volume: string;
    concentration: string;
    totalInVial: string;
    dosesPerVial: string;
    /** Row label for the dose. The unit is appended by the UI (mg or IU). */
    doseInBase: string;
    empty: string;
    emptyHint: string;
    unitsWord: string;
    /** The pen word, e.g. "clicks". */
    clicksWord: string;
    notApplicable: string;
    /**
     * The concrete fix offered beside the "hard to measure" warning.
     * Placeholders: `{water}` (mL to add) and `{units}` (units that would show).
     */
    waterHint: string;
    /**
     * Secondary reading of the same volume in syringe graduations, for workflows
     * whose headline is mL. Placeholder: `{scale}` (e.g. `U-100`).
     */
    syringeReading: string;
  };
  syringeVisual: { ariaLabel: string };
  /**
   * The "working" shown under the result: the arithmetic that produced it, with
   * the user's own numbers. Rendered from `lib/derive.ts` steps.
   */
  derivation: {
    title: string;
    /** Summary toggle label. */
    toggle: string;
    /** `{vial}` `{unit}` `{water}` `{conc}` */
    concentration: string;
    /** `{dose}` `{unit}` `{conc}` `{volume}` */
    volume: string;
    /** `{volume}` `{perMl}` `{units}` */
    units: string;
    /** `{volume}` `{perMl}` `{count}` */
    clicks: string;
  };
  warnings: Record<WarningCode, string>;
  actions: { reset: string; /** Applies the suggested water volume. `{water}` */ useWater: string };
  validation: {
    /** Shown under a field whose text is not a usable positive number. */
    invalidNumber: string;
  };
  units: {
    mg: string;
    mcg: string;
    ml: string;
    /** International units (activity). */
    IU: string;
    /** Centimetres — the unit a circumference is logged in. */
    cm: string;
    /** Kilograms — the unit weight is logged in. */
    kg: string;
  };
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
    /** Opens the full-screen pre-draw check card. */
    check: string;
    taken: string;
    /**
     * Heading over the other vials due at the same moment. A sitting can be two
     * compounds, and the card has to name them rather than showing one line of it.
     */
    also: string;
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
  toast: {
    dismiss: string;
    vialDeleted: string;
    /** Toast after removing one body-measurement entry. */
    measurementDeleted: string;
    deletedAll: string;
    undo: string;
  };
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
    /** Cost per month at the plan's cadence, derived from the vial price. */
    costPerMonth: string;
    /** Two vials share a name but were mixed differently — a drawing hazard. */
    ratioMismatch: string;
    /** Heading of the step-up table on a card and on the printed sheet. */
    phases: string;
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
  /** More than one person drawing from the same bottle (see `lib/shares.ts`). */
  shares: {
    /** Toggle on the save/edit form: "this vial is shared". */
    title: string;
    /** What sharing means — including that everyone's doses count against it. */
    hint: string;
    /** Heading above the list of people to share with. */
    with: string;
    /** Date label: the day sharing starts. */
    from: string;
    /** Checkbox on a share: follow the owner's dose and cadence. */
    samePlan: string;
    /** Dose label for a sharer who sets their own. */
    dose: string;
    /** Heading above a sharer's own dose plan. */
    theirPlan: string;
    /** On the vial card: "Shared with {names}". */
    sharedWith: string;
    /** On the vial card, beside a shared person: "from {date}". */
    since: string;
    /** On the vial card: how many doses are left *for that person*. `{count}` */
    dosesFor: string;
    /** A sharer's view: only the owner can change the bottle. `{name}` */
    ownerEdit: string;
    /** Shown when there is nobody else to share with yet. */
    addPeople: string;
  };
  schedule: {
    title: string;
    timesPerDay: string;
    repeat: string;
    repeatDaily: string;
    repeatWeekdays: string;
    /** A dose every N days (EOD, E3D, weekly…). */
    repeatInterval: string;
    /** Label for the gap between doses. */
    interval: string;
    intervalEod: string;
    intervalE3d: string;
    intervalE4d: string;
    intervalWeekly: string;
    intervalBiweekly: string;
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
    /** Toggle for a step-up (titration) protocol. */
    titration: string;
    /** Explains how the steps work. */
    titrationHint: string;
    /** Column label for how long a step lasts. */
    phaseWeeks: string;
    /** Column label for the dose during a step. */
    phaseDose: string;
    phaseAdd: string;
    phaseRemove: string;
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
    /** Shown when no backup has ever been downloaded on this device. */
    never: string;
    /** When the last backup was taken. Placeholder: `{when}`. */
    lastAt: string;
    /** Gentle reminder to take one again. Placeholder: `{days}`. */
    nudge: string;
    /** Optional passphrase; when set, the downloaded file is encrypted. */
    passphrase: string;
    passphraseHint: string;
    /** The chosen file is encrypted but no passphrase was entered. */
    errorEncrypted: string;
    errorWrongPassphrase: string;
    errorNoCrypto: string;
    /**
     * What a backup actually contains — every person on the device, not just the
     * one on screen. Said next to the button rather than discovered on restore.
     */
    scope: string;
  };
  /** Plots the user's own plan against a cited half-life. */
  plot: {
    title: string;
    subtitle: string;
    /** Shown when there is nothing that can honestly be plotted. */
    empty: string;
    choose: string;
    /** Unit of cadence on the facts line, e.g. "per week". */
    perWeek: string;
    /** Row label for the cited half-life. */
    halfLife: string;
    /** Explains that a step-up plan is drawn at the current step. */
    titration: string;
    /** Row label for the vial's strength. */
    strength: string;
    note: string;
  };
  /** The full-screen "check before you draw" card on the Today list. */
  check: {
    title: string;
    hint: string;
    vial: string;
    /**
     * Heading over the other vials in the same sitting. This card is read at
     * arm's length, so it lists every bottle that has to be drawn now.
     */
    also: string;
    site: string;
    when: string;
    /** Headline label for how much to draw. */
    dose: string;
    close: string;
  };
  /** The always-available converter at the foot of the Reference sheet. */
  tools: {
    title: string;
    subtitle: string;
    mass: string;
    draw: string;
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
    /**
     * Both devices edited the same vial; the newer copy won. `{count}`.
     */
    conflicts: string;
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
    /** Background (Web Push) status, shown under the reminder switch. */
    pushActive: string;
    pushNeedsCode: string;
    pushUnsupported: string;
    pushBlocked: string;
    pushInactive: string;
    pushError: string;
  };
  pair: {
    title: string;
    /** Shown when there is no sync code yet: the QR carries one. */
    needCode: string;
    intro: string;
    copyLink: string;
    copied: string;
    steps: string;
    noticeTitle: string;
    noticeBody: string;
    /** iOS, not installed: pushing needs the app on the home screen. */
    noticeInstalled: string;
    noticeEnable: string;
    noticeDismiss: string;
  };
  views: {
    /** Accessible name for the page switcher. */
    label: string;
    calculator: string;
    vials: string;
    calendar: string;
    /** Kept to five characters: this is the seventh tab in the phone bar. */
    glp1: string;
    reference: string;
    /** Kept short: the phone tab bar has to fit seven of these. */
    guide: string;
    settings: string;
  };
  /** The "How to use" page: the animated explainer, embedded. */
  guide: {
    title: string;
    subtitle: string;
    /** Opens the explainer standalone, outside the app shell. */
    open: string;
    /** How to save the video as a file. */
    saveHint: string;
  };
  /**
   * The GLP-1 care page: how to use it, what to check first, what to follow and
   * what to ask. Procedure, arithmetic and questions only — never a dose and
   * never a brand. Every list here is copy, not code: the page renders these in
   * order, so rewording or reordering a step is a dictionary change.
   */
  glp1: {
    title: string;
    subtitle: string;
    /** Button on a GLP-1 vial card that opens this page. */
    openPage: string;
    /** The strong reminder, in the same voice as the Reference page. */
    note: string;
    routine: {
      title: string;
      /** Shown above both routines: the leaflet is the authority, not this. */
      hint: string;
      pen: RoutineCopy;
      vial: RoutineCopy;
    };
    checks: {
      title: string;
      hint: string;
      items: StepCopy[];
    };
    /**
     * The measurement log. It stores what was measured and reports the change
     * since the first entry — it holds no target, by design.
     */
    track: {
      title: string;
      subtitle: string;
      /** How to measure so the numbers mean something. */
      hint: string;
      /** Heading over the per-point "where and how" notes. */
      where: string;
      date: string;
      /** Nudge that only what you measured needs filling in. */
      optional: string;
      add: string;
      empty: string;
      /** Heading over the list of entries. */
      log: string;
      /** Row label for the newest figure of a point. */
      latest: string;
      /** Heading over the change lines. */
      since: string;
      /** Shown for a point with only one entry. */
      needsTwo: string;
      /** The change line. Placeholders: `{from}`, `{to}`. */
      change: string;
      /** Accessible name for the remove button of an entry. `{date}` */
      remove: string;
      /** Chart label. `{field}` is a point's name. */
      trend: string;
    };
    ask: {
      title: string;
      subtitle: string;
      items: string[];
    };
    /** The six measurement points, in `MEASURE_FIELDS` order. */
    points: Record<MeasureField, PointCopy>;
  };
  kinds: {
    /** Accessible name for the kind filter. */
    label: string;
    all: string;
    peptide: string;
    anabolic: string;
    /** HGH/HCG are reconstituted, but filtered apart from plain peptides. */
    hormone: string;
    /** Ready-to-use GLP-1 solutions, dialled from a pen. */
    glp1: string;
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
  /**
   * The "provable" half of the trust bundle: a short claim in the footer, and the
   * worked examples the build checks against — shown on the Reference page as a
   * "Verified examples" section.
   */
  proof: {
    /** Footer line. `{count}` is the number of worked examples. */
    line: string;
    /** Reference-section tab label. */
    tab: string;
    title: string;
    subtitle: string;
    hint: string;
    /** A human label per worked example, keyed by its id. */
    examples: Record<WorkedExampleId, string>;
  };
  settings: {
    title: string;
    subtitle: string;
    /** Heading of the display/accessibility card. */
    display: string;
    readable: string;
    readableHint: string;
    /** Heading of the privacy card. */
    privacy: string;
    privacyBody: string;
    privacyProof: string;
  };
  reference: {
    title: string;
    /** One-line explanation under the page title. */
    subtitle: string;
    /** Section switcher at the top of the sheet. */
    tabCompounds: string;
    tabConverter: string;
    tabPlot: string;
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
    /** Badge on an entry that has no approved dose to cite (still in trials). */
    investigational: string;
    /** Shown in place of the decay chart when there is no cited range. */
    noRange: string;
    /** The strong reminder under the list that this is not advice. */
    note: string;
    /**
     * A neutral read of the user's own dose against the cited range. Offered as
     * context only — the wording must never sound like a recommendation.
     */
    range: {
      label: string;
      within: string;
      below: string;
      wellBelow: string;
      above: string;
    };
    /**
     * Which route the cited figures describe. A reconstituted vial and a
     * prescribed pen are not interchangeable, so a range that belongs to one
     * must never be read as the other.
     */
    route: {
      vial: string;
      pen: string;
      /** Said instead of a range verdict when the two routes do not match. */
      vialIsNotPen: string;
    };
  };
  /**
   * The supply outlook on the Vials page: how long the stack lasts, which vials
   * are running low and how many more to order.
   * Placeholders: `{date}`, `{days}`, `{count}`, `{doses}`.
   */
  supply: {
    title: string;
    subtitle: string;
    /** Vials currently in stock. `{count}` */
    inStock: string;
    /** The soonest date the stack runs out. `{date}` */
    runsOutOn: string;
    /** Days of supply left for one vial. `{days}` */
    daysOfSupply: string;
    /** Used when a plan has no end date. */
    ongoing: string;
    /** How many more vials the plans need. `{count}` */
    reorder: string;
    /** A vial will expire before it is used up. `{doses}` `{date}` */
    dosesAtRisk: string;
    /** A vial is nearly empty. `{count}` */
    lowLine: string;
    /** Shown when there is nothing to flag. */
    allGood: string;
    /** Shown when there are no vials at all. */
    empty: string;
  };
  /**
   * Injection-site rotation. Progress is derived from the plan, so the app can
   * name the next site without the user logging anything. `{site}` is filled
   * from `sites.names`.
   */
  sites: {
    label: string;
    /** e.g. "Next site: left abdomen". `{site}` */
    next: string;
    /** One-line explanation of why the app suggests a site. */
    hint: string;
    /** A label for every `SiteId`. */
    names: Record<SiteId, string>;
  };
  /**
   * The printable protocol sheet and the vial labels. Both are rendered from the
   * saved plans, so a copy stuck on the fridge can never drift from the app.
   * Placeholders: `{name}`, `{date}`, `{amount}`, `{water}`.
   */
  print: {
    /** Button on the Calendar page. */
    action: string;
    title: string;
    forPerson: string;
    generated: string;
    /** Column: the vial / compound. */
    plan: string;
    /** Column: how far to draw. */
    draw: string;
    /** Column: which clock times. */
    times: string;
    /** Column: which days the plan repeats on. */
    days: string;
    /** Column: first day to last day. */
    period: string;
    /** Column: how many vials that works out to. */
    vials: string;
    /** Heading of the sticker strip. */
    labels: string;
    /**
     * Heading of the GLP-1 checklist, printed only when a GLP-1 vial has a plan.
     */
    glp1Title: string;
    /** One line under it saying where the full wording lives. */
    glp1Hint: string;
    /** A vial label's ratio line, e.g. "5 mg in 2 mL". */
    labelRatio: string;
    empty: string;
  };
}
