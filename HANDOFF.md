# HANDOFF — PepCalculator

**Read this first.** A self-contained brief so a brand-new chat (or a new developer) can
continue without re-reading the whole history.

---

## What this is

An **installable, offline-first web app** (seven pages: Calculator · My vials · Calendar · GLP-1 · Reference · Guide · Settings)
that turns a **desired dose** into the **exact amount to draw on a syringe** — for reconstituted
**peptides** and ready-to-use **anabolic oils**. No accounts, everything runs in the browser and
keeps working with no network. An optional tiny Node server adds **recovery-code sync** between
devices.

⚠️ **It is not medical advice** — a disclaimer is required and must stay in the UI.

---

## Repo & first run

Under version control, with a **private** remote:

- **GitHub (private):** https://github.com/janymil/pepcalculator
- **Remote:** `origin` → `https://github.com/janymil/pepcalculator.git`
- **Branch:** `main`, tracking `origin/main` — run `git log --oneline -5` for the latest commits

```bash
git clone https://github.com/janymil/pepcalculator.git   # private: needs your GitHub access
cd pepcalculator
npm install
```

`.gitignore` covers `node_modules`, `dist`, `server/data`, `.env` (keeps `.env.example`) and `*.log`.
**`.env` is deliberately NOT in the repo** — copy `.env.example` and set `VITE_SYNC_SERVER` if you
want sync to reach a real server. No user-specific data (vials, settings) is committed either;
those live in the browser.

After changes: `git add -A && git commit -m "…" && git push` (or VS Code's Source Control panel).

---

## Current status — all green

| Check | Command | Result |
| --- | --- | --- |
| Types | `npm run typecheck` | ✅ strict, exit 0 |
| Tests | `npm test` | ✅ **420 passing / 38 files** |
| Build | `npm run build` | ✅ ~413 kB JS / 126 kB gzip · ~52 kB CSS |
| Explainer | `node demo\check.mjs` | ✅ 9 scenes · 20 keys × 3 languages · 99 frames · timeline cap held |

## Run it

```bash
npm install
npm run dev        # app      → http://localhost:8137
npm run server     # sync API → http://localhost:8787   (optional)
npm test           # vitest run
npm run icons      # regenerate public/icons/*.png (only when the icon changes)
```

Test the installable / offline build with `npm run build && npm run preview` — the
**service worker is only registered in production** (`import.meta.env.PROD`), so the
dev server behaves normally.

Ports are pinned in `vite.config.ts` (dev **8137**, preview **8138**, `strictPort: true`) —
5173/3000 were already taken on this machine. The sync **server** uses **8787**.

## Stack / conventions

- **Vite 8 + React 19 + TypeScript 5.9**, strict, `verbatimModuleSyntax`, `noUnusedLocals`,
  `noUnusedParameters`. `import type` everywhere for types.
- Runtime deps: **only `react` + `react-dom`**. Do not add UI/date/utility libraries —
  everything is hand-rolled on purpose.
- **Vitest 5**, environment `node`. Tests render full trees with
  `react-dom/server`'s `renderToString` — **no jsdom, no testing-library**. Keep it that way.
- Server is **zero-dependency**: Node built-ins only (`node:http`, `node:sqlite`). Node 22+.
- All logic lives in **pure, UI-free modules** under `src/lib/`. Components never do maths.
- Every string goes through i18n in **three languages: `en`, `sk`, `es`**.

---

## Architecture map

```
src/
├─ lib/                  ← ALL business logic, pure + unit-tested (no React, no DOM)
│  ├─ calc.ts            dose engine: peptides (vial+water) & anabolics (mg/mL)
│  ├─ vials.ts           saved-vial model: kind (peptide/anabolic), status, expiry, merge,
│  │                     tombstone purge
│  ├─ vialColors.ts      stable colour per vial id (calendar pills, legend, cards)
│  ├─ schedule.ts        dose plan: times/day, weekday pattern, duration, calendar maths
│  ├─ dates.ts           tiny yyyy-mm-dd helpers (+ addMonths, startOfWeek)
│  ├─ format.ts          number parsing/formatting, localized dates & weekday names
│  ├─ backup.ts          JSON export/import of vials
│  ├─ sync.ts            recovery-code sync: code gen, salted SHA-256, HTTP client
│  ├─ reminders.ts       pure: next dose across all plans (used by notifications)
│  ├─ agenda.ts          pure: ALL plans by day & hour (the Calendar page)
│  ├─ today.ts           pure: today's doses + the next dose (the Today card)
│  ├─ supply.ts          pure: run-out dates, expiry waste, how many vials to reorder
│  ├─ sites.ts           pure: the injection-site rotation, derived from the dose number
│  ├─ measure.ts         pure: the body-measurement log (points, change since the first entry)
│  ├─ owners.ts          pure: "whose stack" — people registry + strict per-person filtering
│  ├─ pk.ts              pure: one-compartment half-life decay (reference chart)
│  ├─ cost.ts            pure: cost per dose + plan cost (optional vial price)
│  ├─ reference.ts       static compound reference data — educational only, not advice
│  ├─ views.ts           pure: the pages + URL-hash helpers (no router lib)
│  └─ pwa.ts             guarded platform seam: SW registration, notification, install
├─ config/
│  ├─ modes.ts           MODE REGISTRY — workflows + per-mode syringe setup
│  └─ defaults.ts        default form values, storage keys, DEFAULT_SYNC_SERVER
├─ i18n/                 en.ts / sk.ts / es.ts + types.ts (the `Strings` contract)
├─ components/           Header, ViewTabs, ModeTabs, CalculatorForm, ResultPanel, SyringeVisual,
│                        AlertList, SaveVialForm, SavedVials, VialCard, VialEditor, ScheduleForm,
│                        DoseCalendar, AgendaPage, KindFilterControl, SettingsPage, SyncPanel,
│                        RemindersPanel, SegmentedControl, NumberField, Footer, Icon,
│                        OwnerTabs, PeoplePanel, TodayDose, MobileSummaryBar, FirstRunCard,
│                        ReferencePage, Glp1Page, Toast, DangerZone
├─ hooks/                useLocalStorage.ts, useDoseReminders.ts (timer → notification), useCountUp.ts
├─ styles/global.css     design tokens + ALL styling (data-theme / data-mode driven)
├─ App.tsx               state + wiring only
└─ main.tsx

public/                  ← copied verbatim to the site root (not bundled)
├─ manifest.webmanifest  installable PWA metadata (standalone, icons)
├─ sw.js                 hand-rolled service worker: offline shell + notif. relay
├─ favicon.svg
└─ icons/*.png           generated by `npm run icons` (see scripts/)

scripts/
└─ generate-icons.mjs    zero-dep PNG icon generator (node:zlib only)

server/
├─ server.mjs            zero-dependency sync API (GET/PUT /api/sync/:key)
├─ README.md             config, hosting, security model
└─ data/sync.sqlite      created on first run — gitignored, this IS everyone's data
```

**Seven pages** (see `lib/views.ts`): `ViewTabs` switches between **Calculator** (`ModeTabs` →
`CalculatorForm` + `ResultPanel` + `SaveVialForm`), **My vials** (`SavedVials`: list, kind filter,
backup), **Calendar** (`AgendaPage`, every plan by day and hour), **GLP-1** (`Glp1Page`: the device
routines, the pre-use check, the body-measurement log and the prescriber questions), **Reference**
(`ReferencePage`: static compound data + half-life charts), **Guide** (`GuidePage`: frames
`public/explainer.html`, the animated explainer — see the note below) and **Settings**
(`SettingsPage`: sync + reminders + your data). The page is mirrored in the URL hash (`#calendar`),
so the back button and a PWA relaunch both work.

**The GLP-1 page is copy, not a second engine.** `Glp1Page` renders four lists straight from the
dictionary (`strings.glp1`): the pen routine, the vial routine, the pre-use checks and the questions
to ask a prescriber — plus `lib/measure.ts` behind the log. **There is no dose anywhere on it, and no
brand**: the page does procedure, the calculator does the numbers. Rewording a step is a dictionary
change, and the i18n test holds all three languages to the same step count.

**The body-measurement log is the only thing the app knows about the person.** `lib/measure.ts`
stores dated circumferences (waist first) and weight, per owner, and reports the change since the
**first entry that recorded that field** — its own baseline, because that is the only baseline it can
honestly know. It carries **no target and no verdict**: a smaller waist and a larger one are both just
the signed difference. Stored under `pepcalc.v1.measurements`, tombstoned on removal (with Undo),
wiped by "Clear all data", and carried in the JSON backup — **not** in sync, which by design only ever
moves the vials list.

**Every measurement point says where on the body it is, and how to take it.** The six points are not
just labels: `points[field]` is a `PointCopy` (`label` + `how`), so the page answers the question
people actually ask — belly, thighs, seat, arm, neck — in words rather than leaving them to guess at
"hip". The `how` line is *the* part that makes a series comparable ("around the navel, relaxed, at the
end of a normal breath"), and it is ordinary i18n copy in all three languages, so it can be corrected
without touching a component. The log, the trend label and the change list all read the same `label`,
so there is one place a point is named.

**The Guide page is a frame, not a port.** `public/explainer.html` is a self-contained canvas
animation (no dependencies, ~1000 lines, its own three languages). Rather than reimplement it in
React — which would mean two versions of the same video, and the standalone file is what the
export button records — `GuidePage` renders an `<iframe src="/explainer.html?embed=1&lang=…">`.
`?embed=1` hides the explainer's own heading and note (the host page owns those), the `lang` comes
from the app's language switcher, and `key={lang}` remounts the frame so the video restarts in the
new language. Two consequences worth remembering: the file must stay in `public/` (that is what
Vite copies to the site root, and `sw.js` pre-caches `/explainer.html` so the tab works offline),
and `demo/check.mjs` reads it from there.

**In-app flow:** `App.tsx` owns all state → passes props down → `ResultPanel` renders the
answer → `SaveVialForm` (on the calculator) writes a vial → `SavedVials` looks after them.
`VialCard` = the rich card for scheduled vials. `VialCardLegacy` (inside `SavedVials.tsx`)
= fallback for vials saved with no plan; it still exists on purpose.

**A dose is drawn in a *sitting*, not a line.** `lib/session.ts` groups the doses that share a
date **and a time** into a `DoseSession`, so the Today card can name the whole sitting and the
pre-draw check card can list every bottle in it. This is roadmap item 7 ("draw two compounds in
one session"), and it needed no new state: `groupSessions` reads the same `dosesOnDate` the
calendar and reminders already use. One bottle can never appear twice in a group — a vial's own
times are distinct slots, and two entries for one vial would read as "draw it twice", which the
unit test pins down.

---

## The maths (never change these without updating tests)

**Peptides** — lyophilized powder, reconstituted:

```
concentration = vial mg ÷ bacteriostatic water mL
volume (mL)   = dose ÷ concentration
units         = volume × unitsPerMl        (U-100 → 100, U-40 → 40, U-50 → 50)
doses/vial    = vial mg ÷ dose
```

**Anabolics** — already in oil, no reconstitution:

```
volume (mL) = dose ÷ (mg per mL from the label)
```

`mg ⇄ mcg` is handled by `toMg` / `fromMg`. The engine returns **codes, not text**
(`CalcWarning` + `WarningCode`) so the UI can translate them.

## Data model

```ts
SavedVial {
  id, name, reconstitutedOn: 'yyyy-mm-dd',   // start date: mixing day, or first use for oils
  kind: 'peptide' | 'anabolic',              // absent on old records → treated as peptide
  // --- peptides ---
  vialAmount, vialUnit: 'mg' | 'mcg', waterMl,
  // --- anabolics (0/undefined for peptides) ---
  concentrationMgPerMl?, vialMl?,
  // --- shared ---
  doseAmount, doseUnit,
  dosesTaken,                              // legacy manual counter (scheduled vials ignore it)
  syringeType: 'U100' | 'U40' | 'U50', syringeCapacityMl,
  schedule?: VialSchedule,                 // when present, everything is derived from the plan
  updatedAt?: string,                      // ISO — newest wins when merging
  deletedAt?: string                       // ISO — TOMBSTONE (soft delete)
}

VialSchedule {
  times: string[]                          // "HH:mm", one per daily dose → length = doses/day
  repeat: 'daily' | 'weekdays'
  weekdays: number[]                       // 0 = Sun … 6 = Sat
  startsOn: string                         // = the reconstitution date
  durationValue: number,                   // ignored when durationUnit is 'ongoing'
  durationUnit: 'weeks' | 'months' | 'ongoing'
}
```

**Storage keys** (`localStorage`, versioned — `config/defaults.ts`):
`pepcalc.v1.{peptide, anabolic, syringe, lang, theme, mode, vials, syncCode, syncServer, syncLast, reminders, view}`

`vialKind()` reads the kind (defaulting to `'peptide'`), `filterVialsByKind()` powers the
**All / Peptides / Anabolics** filters, and `vialStatus().expiresOn` is `null` for oils (the
28-day BUD is a bacteriostatic-water rule). `lib/vialColors.ts` gives each vial a stable colour
from its id, shared by the calendar pills, the legend and the vial cards.

**Sync API** (`server/server.mjs`):
`GET /api/health` · `GET /api/sync/:key` → `{payload, updatedAt}` | 404 · `PUT /api/sync/:key`
with `{payload: string}` → `{updatedAt}`. `:key` must match `^[a-f0-9]{64}$`.

## Key decisions — and why (don't undo these casually)

1. **No manual "I took a dose" logging.** Explicitly rejected as unrealistic by the user.
   Adherence is *derived from the schedule* (`elapsedDoses`). Zero interaction after injecting.
2. **"Draw X units" is the hero of every vial card.** The whole point is you never forget
   whether that vial was mixed with 1 mL or 2 mL.
3. **Anabolics are read in mL, not insulin units.** Peptides use insulin syringes
   (`measure: 'insulin'`), oils use plain mL syringes (`measure: 'volume'`). This is
   data-driven from `MODES` in `config/modes.ts` — add workflows **there**, not in components.
4. **Sync merges and never loses data.** Union by id, newest `updatedAt` wins. Deletions
   travel as **tombstones** (`deletedAt` + a fresh `updatedAt`), so they take part in the same
   comparison. `liveVials()` hides them from the UI; they stay in state and in sync payloads.
   Tombstones have a **90-day TTL** (`TOMBSTONE_TTL_DAYS`): `purgeTombstones()` sweeps older
   ones on open and after every merge, then the background push re-uploads the pruned list so
   the server converges. Never shorten the window below the longest realistic gap between two
   of your devices syncing — an offline device would push the live vial back and resurrect the
   deletion.
5. **The sync server never sees the code** — only `SHA-256(salt + code)`, 64 hex chars.
   The code IS the credential: no email, no password, **no recovery** → hence the JSON backup.
6. **Local-first, always.** The calculator must work with no network and no account. Sync is
   optional and only ever touches the vials list.
7. **`crypto.subtle` requires a secure context.** On plain HTTP (e.g. phone → laptop over LAN)
   hashing is impossible; `syncWithServer` returns `reason: 'unavailable'` rather than throwing.
   Deploy over **HTTPS** for real multi-device use.
8. **i18n is type-enforced.** `Strings` in `i18n/types.ts` must be satisfied by every
   dictionary, and `i18n.test.ts` asserts identical keys, no blank strings, and matching
   `{placeholders}` across languages.
9. **Auto-push is guarded, not naive.** `lastPushedRef` (JSON snapshot) + `inFlightRef` stop
   the push→state→push loop, because pushing never changes `savedVials`.
10. **PWA is hand-rolled — still zero runtime deps.** `public/sw.js` precaches the shell and
    does stale-while-revalidate for the hashed assets; it never touches cross-origin requests
    (the sync server). Icons are drawn by `scripts/generate-icons.mjs` (`npm run icons`), so
    there is no opaque binary asset. **Reminders are a browser timer, not push:** they fire
    while the app is alive (open or backgrounded, including an installed PWA on Android).
    A fully closed app would need a push server, which this offline-first app deliberately
    doesn't have — the Reminders panel says so in plain words.
11. **Seven pages, no router library.** `lib/views.ts` models `calculator` + `vials` + `calendar` +
    `glp1` + `reference` + `guide` + `settings`, and `App.tsx` mirrors the active one in the URL hash
    (`#calendar`) so back/forward and a PWA relaunch behave. Views are also kept in `localStorage`
    for the case where the hash is absent. `AgendaPage` renders entirely from `lib/agenda.ts` — no
    date maths in the JSX. Below 880px the same `ViewTabs` becomes a fixed bottom bar, which now
    holds **seven** tabs — measured, not assumed: at a true 390px the bar is 375px with **51px per
    tab and nothing overflowing** (inner width 375, offenders 0), and only the two longest labels
    ellipsise. So `glp1` is labelled **`GLP-1`** on purpose: five characters, and one of the only two
    labels that still fits unclipped.
12. **Anabolics are first-class saved vials.** `SavedVial.kind` (`'peptide' | 'anabolic'`,
    absent on old records → `vialKind()` returns `'peptide'`) lets oils be saved from anabolic
    mode, appear in the calendar and be filtered. `vialStatus()` branches: peptides use
    vial + water, oils use the label's mg/mL, and **oils get no BUD** (`expiresOn: null`) because
    the 28-day rule is about bacteriostatic water. The unused side of the record is zeroed so
    switching kinds stays tidy.
13. **Calendar colours are per-vial, not per-position.** `lib/vialColors.ts` hashes the vial id
    into a fixed palette, so the same peptide is the same colour in the day pills, the legend,
    the day list and the card — and it never shifts when the list changes. **Only today gets a
    coloured background**; other dose days are plain cells whose coloured pills say what is due.
14. **No brand names — the reference addresses molecules only.** The GLP-1 class it knows is
    `tirzepatide` and `retatrutide`; no marketing name appears in the data, the UI, the copy or the
    video. Same call as "a brand is never assumed" and "dial resolution is an input, never a brand
    table". A cited range is therefore also **optional** on a reference entry: `retatrutide` is stamped
    `investigational` and cites **no** dose range at all, because there is no approved one to cite. The
    three range fields are reachable only through `hasCitedRange()`, a **type guard**, so any caller
    that needs a range has to ask for it — `formatRange()` returns `null`, `rangeHint()` returns no
    verdict, and the Reference card puts an honest sentence where the decay curve would go rather than
    inventing a dose to plot. Verified **by mutation**: drop the guard and the tests catch
    `"undefined undefined"` printed on the card.
15. **The measurement log is local-only and backup-only — sync still moves vials and nothing else.**
    `pepcalc.v1.measurements` is the one new storage key. It rides in `serializeBackup`/`parseBackup`
    (an optional array on `BackupFile`, normalized on the way in, so a file written before it existed
    simply has none) and it is wiped by "Clear all data" — but it is deliberately **not** in the sync
    payload, because decision 6 is what keeps that merge simple enough to trust. If it is ever added
    there, give it the same `updatedAt` + `deletedAt` treatment the vials have and use
    `mergeMeasurements`, which is written and tested for exactly that.

---

## Gotchas that will bite you

- **Tests use `renderToString`.** Effects do **not** run, so no `fetch` / `setInterval` fires in
  tests. Don't write effect-dependent tests without changing that strategy.
- **`App.tsx` holds a 1-minute `setInterval` clock** (for accurate "next dose"), a reminder
  timer and two sync effects. All are SSR-safe only because effects don't run during
  `renderToString`.
- **The service worker registers in production only** (`main.tsx`, `import.meta.env.PROD`), so
  `npm run dev` stays HMR-friendly. Test offline/install with `npm run build && npm run preview`.
- **`useDoseReminders` deliberately returns no cleanup from its arming effect** — a cleanup
  would cancel the pending timer on every 1-minute clock tick. Unmount cleanup is a separate
  effect, and an `armedKeyRef` stops the same dose from re-arming each tick.
- **Reminders are not background push** — they fire only while the app/page is alive. Don't
  "fix" that with `setInterval` in the service worker; browsers kill idle workers.
- **Regenerate icons after editing the design**: `npm run icons` overwrites `public/icons/*.png`.
- **The page lives in the URL hash.** `App.test.tsx` renders the default (calculator) view, so
  the other pages are covered by their own tests (`AgendaPage.test.tsx`, `SavedVials.test.tsx`,
  `SettingsPage.test.tsx`). When new markup is added to a page, extend the matching test.
- **Oils have no expiry.** `vialStatus().expiresOn` / `daysUntilExpiry` are `null` for
  anabolics, so any badge/meta code must handle `null` (see `VialCard`). Don't reintroduce a
  blanket `+ BUD_DAYS`.
- **Tombstones expire after 90 days.** `purgeTombstones()` (`TOMBSTONE_TTL_DAYS`) runs on open
  and after every merge, and it is the **only** place a saved vial is really removed. Shortening
  the window can resurrect a deletion from a device that stayed offline longer than the window —
  that is the documented trade-off, not a bug.
- **Day cells carry pills, not a background.** In `AgendaPage` only `is-today` paints a
  background; the other dose days use the `has-doses` class plus coloured pills. The badge for
  anabolic vials is `vial__kind--anabolic`.
- **Large single file writes get truncated** — split a big new file into create-then-append.
- **`server/data/sync.sqlite` is gitignored but is real data.** Back it up in production.
- **`VialCardLegacy`** exists only for vials saved *without* a schedule. Don't remove it without
  checking old data.
- **Never edit `dist/`** — it is a build artifact.
- **`VITE_SYNC_SERVER`** is inlined at build time (`config/defaults.ts`). Set it in `.env` before
  `npm run build` so a fresh device gets your server URL instead of `localhost`.

## Open items / roadmap (priority order)

**Done:** **git + GitHub** (private repo `janymil/pepcalculator`, `origin` on `main`), **PWA +
service worker** (installable, offline shell, dose reminders), the **Calendar page / global
agenda**, the **page split** (Calculator · My vials · Calendar · Reference · Guide · Settings),
**saved anabolics** with kind filters and per-vial calendar colours, and the **tombstone purge**
(90-day retention, swept on open and after every merge, with the trade-off documented).

**Shipped since (387 tests, 36 files) — four workflows, everything that hung off them, and a
Guide page:**

- **IU as a first-class unit** (`lib/calc.ts`) — `DoseUnit` gained `'IU'`, and the engine now
  works in the **base unit of each family** (mg for mass, IU for activity) and **refuses to mix
  families** instead of inventing a factor. Derived fields were renamed
  `concentrationPerMl` / `doseBase` / `totalVialBase` to say what they actually hold. HGH/HCG is
  its own workflow and vial kind; it answers in **mL** with the graduations beside it, because
  "units" on a barrel collides with the IU on the label. **Additive schema only — no storage-key
  migration was needed** (the earlier note about a `v2` migration was over-cautious: a new
  *value* in an existing field needs no migration, only new *keys* would).
- **Pen workflows / GLP-1** — `MeasureSystem` gained `'clicks'`; the result carries clicks
  alongside units and mL. Dial resolution is always an input (`DEFAULT_CLICKS_PER_ML`), never a
  brand table. Saved pens remember `device: 'pen'`, so every surface says clicks.
- **Step-up (titration) plans** (`DosePhase[]` on `VialSchedule`) — the biggest remaining gap for
  GLP-1. `phaseDoseOn` / `phaseIndexOn` / `phaseWindows` are the whole API; `today.ts` asks for
  **the date's** dose, and `supply.ts` was rewritten to subtract **what each day actually draws**
  rather than a fixed dose, so a vial lasts longer while the dose is still low. The printed sheet
  emits one row per step — printing a single "draw to X" line would be actively misleading.
- **Sync conflict awareness** — `mergeWithConflicts` reports the cases where both devices changed
  the same vial to different things (including a deletion racing an edit). The merge itself is
  unchanged; Settings now says how many edits were resolved newest-wins.
- **A unit converter** — `lib/convert.ts`, pure: mg ↔ mcg, and one draw in mL / graduations /
  clicks. No IU row, on purpose.
- **Plot your own protocol** — `PkChart` was extracted from the Reference page so the same chart
  draws either a compound's typical dose or the user's actual plan. It refuses to draw when a
  half-life, a cadence or a mg dose is missing, and says what is missing.
- **Check before you draw** (`DrawCheck.tsx`) — a full-screen overlay: which vial, how much,
  where — and nothing else.
- **Readability mode** — opt-in larger type, stronger borders, and a **non-colour marker**: a
  stripe pattern on every vial dot whose angle comes from the vial id (`vialPatternAngle`).
- **Discoverability pass** (same round, after the user reported that features could not be found
  in the running app) — this is a **recurring failure mode of this build**, so read it before
  adding any new surface:
  - **Print** was a `btn--ghost` at the very bottom of the Vials page, *inside the Backup card* —
    the last place anyone looks for a protocol, and the easiest thing on the page to miss. It is
    now a labelled accent button with a printer icon in the **page header** (`vials__head`),
    disabled until at least one vial has a plan.
  - **The converter and the protocol plot** sat below the entire compound list, a page-height
    scroll away. The Reference sheet now has a **section switcher at the top** (Compounds /
    Converter / Your protocol) and renders only the open one.
  - Both are covered by tests (`ReferencePage.test.tsx` asserts the tabs exist and that the tools
    are not rendered twice), and the README gained a **"Where to find things"** table for the user.
  - **Watch for this pattern:** anything that appears only conditionally (Today card, supply panel,
    conflict notice) or that lives at the bottom of a page **will not be found**. Prefer the page
    header, and say what the button does in its label.
- **The scenes held nothing, so the drawing was never seen finished** (the more important half of the
  report whose first half is the *raced through its scenes* entry below). Every scene draws itself as a pure function of `t` and
  completes at **exactly `t = 1`** — scene 3's teal underline literally ran from `t = 0.86` to
  `t = 1`. With no hold, the cut to the next scene happened on the same frame the last stroke
  landed, so the finished composition (and every late element) was invisible, and hard cuts made the
  whole thing feel rushed. Fixed with two constants in `SCENES`' timeline, not by touching any scene:
  **`HOLD = 1800` ms** (each scene sits finished) and **`FADE = 320` ms** (the finished frame dips to
  paper, so scenes do not hard-cut; the last scene never fades, since it is the frame the video ends
  on). `sceneAt()` now returns `t` pinned at 1 through the hold, so `render()` needs no special case
  beyond applying the alpha. **The video is 54.6 s now, not 38.4 s** — every place that quoted the
  old length was updated, including the three `guide.subtitle` strings in the app. `demo/check.mjs`
  guards both halves ("scene N is not finished at the end of its drawing" / "does not hold its
  finished frame"), renders a frame inside a fade, and **prints the per-scene timing map that
  `demo/storyboard.md` documents**, so the doc cannot drift from the code.
- **The explainer is now reachable from inside the app** — a **Guide** page (`components/GuidePage.tsx`)
  frames `public/explainer.html` (moved there from `demo/` so Vite serves it and the service worker
  can pre-cache it). It follows the same discovery rule the pass above learned: the video used to
  exist only as a file in the repo, which is not a place a user looks. The app's language drives the
  video's language, `?embed=1` strips the explainer's own chrome, and a link keeps the standalone
  version one click away for sharing or recording.
- **The video raced through its scenes once it was framed** (reported straight after shipping the
  Guide page, which is what made it visible). The cause was in the animation, not the frame: the
  frame loop advanced the timeline by the **uncapped** `now - lastFrame`, and a browser is free to
  stop calling `requestAnimationFrame` for a while — a background tab, or an **offscreen iframe**,
  which is precisely what the Guide page creates. Each gap was charged to the timeline in one step,
  so the video skipped forward through whole scenes instead of dropping a frame. The fix is the
  standard one for rAF timelines: **cap the step at `MAX_STEP` (100 ms)**, **re-arm the clock when
  playback starts** so a resume never carries the paused time, and **pause on
  `visibilitychange`** and resume where it was. There is also a **1× / 0.5×** speed button now —
  the scenes are dense and a phone makes them small — and export always forces 1× so the file
  matches its label. `demo/check.mjs` gained the regression tests: 60 frames of 16.7 ms must
  advance the timeline ~1000 ms, and a 5 s stall by no more than `MAX_STEP`. **Restoring the old
  unclamped line makes the check fail with "a 5 s stall jumped the timeline forward by 5000 ms",
  which is how this was confirmed** — a browser was never needed to see it.

**Shipped earlier (326 tests, 31 files) — supply, sites, intervals:**

- **Supply outlook** (`lib/supply.ts`) — when each vial runs out, which ones will expire with
  doses left, how many doses that wastes, and how many **extra vials the plans need**. Shown as
  a panel on My vials plus a line on every card. Doses-remaining for a planned vial is derived
  from the plan, never from the stored `dosesTaken` — getting that wrong is the easy mistake here.
- **Injection-site rotation** (`lib/sites.ts`) — the next site on the Today card, derived from
  the dose number, so rotation needs **no logging at all**. No competitor does this.
- **Interval schedules** — `repeat: 'interval'` + `intervalDays`, with EOD/E3D/E4D/weekly/
  biweekly presets. Everything else followed for free because it all goes through `isDoseDay`.
- **A fix attached to "too small to measure"** (`suggestWaterMl` in `lib/calc.ts`) — the warning
  now offers a concrete water volume and applies it in one tap.
- **Printable protocol + vial labels** (`components/PrintSheet.tsx`) — a protocol page and a strip
  of stickers (ratio, draw amount, use-by) so the fridge copy cannot drift from the app.
- **Encrypted backups** — an optional passphrase wraps the JSON in PBKDF2-SHA256 (200k) + AES-GCM.
- **Cost per month** (`costPerMonth` + `dosesPerWeek`), and a **backup reminder** ("last backup
  {days} ago") that only appears after 30 days.
- **Mix-up guard** — two vials sharing a name but not a concentration are both flagged: the one
  mistake this app most exists to prevent.
- **Dose context** — a vial whose name matches a reference compound says where its dose sits
  against the commonly cited range (`matchCompound` / `rangeHint`). Context only, never advice.

**Improvement pass (all green, 240 tests):**

- **Today card** — the next scheduled dose + one-tap load, on the Calculator (`lib/today.ts`).
- **First-run welcome** with loadable examples, and the disclaimer repeated at point of use.
- **Mobile sticky summary bar** so the live answer never scrolls off-screen on a phone.
- **Undo** snackbar on delete, and a guarded **Clear all data** action in Settings.
- **Reference sheet** (new page) with typical ranges/half-lives (`lib/reference.ts`) and a
  half-life decay chart (`lib/pk.ts`).
- **Cost per dose / plan cost** from an optional per-vial price (`lib/cost.ts`).
- **Inverse mode** — a drawn volume back to a dose (`doseFromVolume` in `lib/calc.ts`).
- **Persisted kind filter**, empty-state CTAs, `aria-live` result, dynamic `theme-color`,
  larger tap targets and readable calendar pills.

**Design-system pass (modern, token-driven UI):**

- **Tokens for everything** — spacing (`--space-*`), type (`--fs-*`), radius, elevation and
  motion scales. Every `font-size` now comes from the scale (0.75rem floor for uppercase
  micro-labels); `--text-faint` was darkened to pass WCAG AA.
- **One accent, semantic colour only** — the accent is reserved for the key numbers and
  primary actions; statuses keep `--danger/--warn/--info/--ok`. The meshy gradient background
  was replaced by a single soft top glow, and cards are flat (border, not border + shadow).
- **Hand-rolled SVG icons** (`components/Icon.tsx`) replace every emoji — still zero runtime deps.
- **Phone bottom tab bar**: the five-tab switcher no longer overflows a narrow screen
  (icon over label, safe-area aware), plus page-entrance motion, a count-up on the headline
  number (`hooks/useCountUp.ts`, SSR-safe and reduced-motion aware) and field-level invalid states.
- **Instrument-grade visuals**: the syringe now has minor/major graduations and a dashed target
  marker; the reference decay chart gained gridlines, a baseline and dose markers.
- **Scanability**: saved vials are collapsible cards with **search + sort** (`searchVials` /
  `sortVials` in `lib/vials.ts`), and the per-vial palette is muted.

**People — one stack per person (never mixed):**

- A second axis beside the vial kind: an **owner** (`lib/owners.ts`) answers "*whose* stack is
  this?" — you, your partner, a family member. `ownerId` sits on each saved vial; pre-owner
  vials default to the first person.
- **`OwnerTabs`** at the top switches who you are looking at. It is **strictly single-select —
  there is deliberately no "all"**, so vials, the calendar, the Today card and "save this vial"
  are always scoped to exactly one person (the kind filter then narrows *within* that person).
- People travel with the data: `serializeBackup`/`parseBackup` and the sync payload carry the
  owner list, and every owner a vial references is implied on merge, so stacks survive a
  restore or a second device.
- **`PeoplePanel`** (Settings) renames people, shows their live vial count, and only allows
  removing someone who holds no vials (the last person can't be removed).

1. **Conflict awareness** — merges are silent last-write-wins; consider surfacing
   "changed on another device".
2. **Server hardening** — rate limiting, `ALLOWED_ORIGIN` locked to a real origin, request logs.
3. **Deploy** — Dockerfile for the server + host config; static app to any HTTPS host.
4. **True background reminders** — the current timer only fires while the app is alive. A push
   server (or Notification Triggers, where supported) would be needed for a closed app.
5. **IU dose unit** — HGH/HCG/insulin need `'IU'` in `DoseUnit` with a `v2` storage migration.
6. **Pen devices / GLP-1** — a third `MeasureSystem` (clicks per dose), plus **titration phases**
   for step-up protocols: a `phases[]` model carrying a dose per window. This is the biggest
   remaining gap for GLP-1 users and needs a `v2` migration.
7. **Multi-compound plans** — draw two compounds in one session.
8. **Plot the user's own protocol** — `lib/pk.ts` already models the curve, but the Reference
   chart still shows a generic one instead of the user's saved schedule.
9. **Readability mode** — a large-text toggle, and a non-colour marker on the vial colour chips
   (colour is currently the only differentiator in places).
10. **Draw-mode check card** — a full-screen, arm's-length confirmation before injecting.
11. **Unit converter** — mg ↔ mcg ↔ IU, mL ↔ units per scale, mg/mL ↔ %.
12. **QR code for sync pairing** — typing a 120-bit code is the roughest part of the UX. A
    hand-rolled encoder is possible, but it needs published spec vectors to verify against,
    because no QR decoder is available here.
13. Optional only if real accounts are ever wanted: swap the sync layer for Supabase + RLS.
    Recovery-code sync was chosen **deliberately** instead of email/password.

## Still open

The numbered roadmap above is the **current** list: items **1, 5, 6, 7, 8, 9, 10 and 11 shipped in
the round described under "Open items" (see the entries for sync conflicts, IU, pens + titration,
the protocol plot, readability mode, the draw check and the converter) — the numbers are kept so
the cross-references stay stable. **7** (multi-compound sessions) shipped later, as `lib/session.ts`
plus the "also at this time" block on the Today card and the `also` list on the check card. Still
unbuilt from the numbered list: **2** (server hardening), **3** (deploy), **4** (true background
reminders) and **12** (QR pairing), each for the reason given below.

- **QR pairing** — deliberately **not shipped** in this round. It needs a full QR encoder
  (versions, error correction, masking, Reed–Solomon) and there is **no decoder available in this
  environment to verify the output against**, so a produced symbol could not be checked by
  scanning it. The risky half of the work is not the encoder, it is *trusting* it. If it is
  picked up later: implement it against the published ISO/IEC 18004 vectors (the 1-M `01234567`
  example's nine data codewords and ten EC codewords are printed in the spec) **and** verify a
  real symbol with a real scanner before shipping. Anything less is a pairing feature nobody can
  debug.
- **Verify the printed sheet by actually printing it** — the last unverified surface in the app.
  `@media print` can only be confirmed at a printer, not in a headless browser.
- **The explainer covers the core, not every feature.** It is 9 scenes on the calculation and the
  daily workflow (the problem → the maths → the draw → Today → separate stacks → plans → offline).
  **Not shown:** the HGH/HCG (IU) and GLP-1 pen (clicks) workflows, anabolic oils beyond the closing
  line, inverse mode, cost per dose, titration/step-up plans, the Reference sheet, the converter,
  the protocol plot, printing, reminders, readability mode and the draw-check card. That is a
  reasonable first-touch video, but it is **not** a feature tour, and the user asked — so either the
  Reference/Guide pages carry those, or a second, longer cut needs 3–4 more scenes (the cheapest
  candidates: two workflow scenes for IU and pens, one for "what else is in it"). Decide before
  recording any voice-over, because the script has to match the scene list.
- **Audio for the explainer: decided — no audio.** Asked and answered: the video stays silent,
  including its exported `.webm`, and that is deliberate rather than an oversight. The written copy
  carries the meaning, so it works muted, in all three languages and as a waiting-room loop.
  `demo/storyboard.md` → "Audio: what is possible" keeps the three routes (synthesised music,
  browser TTS, a real recording) with their costs, for whoever wants one later — **none is
  half-built**. If music is ever picked up: it stays asset-free, it needs a click to start (autoplay
  policy), and its quality **cannot be verified in this environment** (no audio output), so audition
  it on a real device before shipping.

- **The GLP-1 companion is built — as a page, not a promise.** `PROPOSAL-glp1-companion.md` proposed it
  and most of it now exists: the **GLP-1** tab (`Glp1Page` + `lib/measure.ts` + `pepcalc.v1.measurements`).
  What shipped: the pen routine, the vial routine (these compounds are mostly vials, so both are there),
  the six pre-use checks, the body-measurement log with its trend, and the prescriber questions —
  training and nutrition deliberately as *questions*, because "not medical advice, it only does the
  maths" is the app's entire claim. Still open from that proposal: **(a)** does `semaglutide` stay in
  `lib/reference.ts`? It is a third molecule now that the class is scoped to `tirzepatide` +
  `retatrutide`; it is kept because dropping the row would stop `matchCompound` matching existing vials
  named after it, taking their half-life plot with them. **(b)** A `route` field to separate the
  reconstituted-vial figures from a prescribed pen. **(c)** The routine is **not on the printed sheet**
  yet — a checklist belongs on the fridge, and `PrintSheet` already exists. **(d)** The page is not
  linked from a GLP-1 vial card, so someone drawing a dose never passes it.
- **A backup exports only the person on screen.** `SavedVials` gets `scopedVials`, so `serializeBackup`
  writes one person's vials (plus *all* owners, which is incoherent) — and the measurement log was
  wired the same way on purpose, to match rather than to add a second convention. Restoring on a new
  device therefore does not bring the other people back. The fix is one line in `App.tsx` (pass the
  full `liveVials()` list and the full log); it is not done because it changes what existing backups
  contain, and that is worth deciding deliberately.

## How to extend safely

- **New workflow** (HGH, HCG, insulin, blends): add the id to `ModeId` + a `calculateXxx()` in
  `lib/calc.ts`, add a `ModeMeta` entry to `MODES`, add the copy to all three dictionaries, then
  render its fields in `CalculatorForm.tsx`. Tabs, headings and syringe options self-render.
- **New language**: add a dictionary implementing `Strings`, add its code to `Lang`, register it
  in `i18n/index.ts`. TypeScript then lists every missing string.
- **New warning**: add the code to `WarningCode` plus a sentence in each dictionary — the i18n
  test enforces all three stay in sync.
- **New reminder behaviour**: the maths belongs in `lib/reminders.ts` (pure, tested), the
  timer/notification wiring in `hooks/useDoseReminders.ts`, and the copy in the `reminders`
  i18n section. Keep the notification text localised at the call site — the service worker is
  deliberately language-free.
- **New page**: add its id to `ViewId` + `VIEWS` in `lib/views.ts`, add the `views` copy to the
  dictionaries, add its icon to `components/ViewTabs.tsx`, and render it in `App.tsx`. The tab
  strip and the hash routing follow automatically. **Keep the tab label short** — the phone bottom
  bar holds six of them at 390px before the longest labels start to ellipsise (`Guide`, not
  "How to use the app"; the page head carries the full wording).
- **New reference compound**: append an entry to `COMPOUNDS` in `lib/reference.ts` (name, class,
  typical range, water volumes, half-life, cadence). The Reference page and its decay chart
  render from that list — no component changes needed.
- **Always**: pure logic in `src/lib/` **with a unit test first**, then wire up the UI.

## Domain glossary

| Term | Meaning here |
| --- | --- |
| Reconstitution | Mixing lyophilized peptide powder with bacteriostatic water |
| Bacteriostatic water | The water used to dissolve the powder ("bac water") |
| Units | Insulin-syringe graduations — U-100 → 100 units = 1 mL |
| Vial | One bottle; "doses per vial" = how many injections it holds |
| BUD | Beyond-use date — 28 days after mixing (`BUD_DAYS` in `lib/vials.ts`) |
| Plan / protocol | A `VialSchedule`: times per day, which days, for how long |

## Self-check before handing back

```bash
npm run typecheck && npm test && npm run build   # all three must pass
git status                                       # then commit + push, so the next session starts clean
```

Also keep this file current: if you change the commands, the page list, the test count or the
roadmap, update the tables above in the same commit — a new session reads this before anything else.


