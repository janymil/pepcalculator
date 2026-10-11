# HANDOFF — PepCalculator

**Read this first.** A self-contained brief so a brand-new chat (or a new developer) can
continue without re-reading the whole history.

---

## What this is

An **installable, offline-first web app** (five pages: Calculator · My vials · Calendar · Reference · Settings)
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
| Tests | `npm test` | ✅ **240 passing / 24 files** |
| Build | `npm run build` | ✅ ~337 kB JS / 103 kB gzip · ~38 kB CSS |

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
│                        TodayDose, MobileSummaryBar, FirstRunCard, ReferencePage, Toast, DangerZone
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

**Five pages** (see `lib/views.ts`): `ViewTabs` switches between **Calculator** (`ModeTabs` →
`CalculatorForm` + `ResultPanel` + `SaveVialForm`), **My vials** (`SavedVials`: list, kind filter,
backup), **Calendar** (`AgendaPage`, every plan by day and hour), **Reference** (`ReferencePage`:
static compound data + half-life charts) and **Settings** (`SettingsPage`: sync + reminders + your
data). The page is mirrored in the URL hash (`#calendar`), so the back button and a
PWA relaunch both work.

**In-app flow:** `App.tsx` owns all state → passes props down → `ResultPanel` renders the
answer → `SaveVialForm` (on the calculator) writes a vial → `SavedVials` looks after them.
`VialCard` = the rich card for scheduled vials. `VialCardLegacy` (inside `SavedVials.tsx`)
= fallback for vials saved with no plan; it still exists on purpose.

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
11. **Five pages, no router library.** `lib/views.ts` models `calculator` + `vials` + `calendar`
    + `reference` + `settings`, and `App.tsx` mirrors the active one in the URL hash (`#calendar`) so
    back/forward and a PWA relaunch behave. Views are also kept in `localStorage` for the case
    where the hash is absent. `AgendaPage` renders entirely from `lib/agenda.ts` — no date maths
    in the JSX.
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
agenda**, the **page split** (Calculator · My vials · Calendar · Reference · Settings),
**saved anabolics** with kind filters and per-vial calendar colours, and the **tombstone purge**
(90-day retention, swept on open and after every merge, with the trade-off documented).

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

1. **Conflict awareness** — merges are silent last-write-wins; consider surfacing
   "changed on another device".
2. **Server hardening** — rate limiting, `ALLOWED_ORIGIN` locked to a real origin, request logs.
3. **Deploy** — Dockerfile for the server + host config; static app to any HTTPS host.
4. **True background reminders** — the current timer only fires while the app is alive. A push
   server (or Notification Triggers, where supported) would be needed for a closed app.
5. **Print / export** — a physical vial label showing the expiry date, and a protocol PDF. The
   Calendar page is the natural place to hang an "export the protocol" button.
6. **Interval schedules & multi-compound plans** — `VialSchedule` supports daily / chosen
   weekdays only; add `repeat: 'interval'` (+ `intervalDays`) and a split-dose model.
7. **IU dose unit** — HGH/HCG/insulin need `'IU'` in `DoseUnit` with a `v2` storage migration.
8. Optional only if real accounts are ever wanted: swap the sync layer for Supabase + RLS.
   Recovery-code sync was chosen **deliberately** instead of email/password.

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
  strip and the hash routing follow automatically.
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


