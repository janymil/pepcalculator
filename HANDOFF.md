# HANDOFF — PepCalculator

**Read this first.** A self-contained brief so a brand-new chat (or a new developer) can
continue without re-reading the whole history.

---

## What this is

A single-page web app that turns a **desired dose** into the **exact amount to draw on a
syringe** — for reconstituted **peptides** and ready-to-use **anabolic oils**. Offline-first:
no accounts, everything works from the browser. An optional tiny Node server adds
**recovery-code sync** between devices.

⚠️ **It is not medical advice** — a disclaimer is required and must stay in the UI.

---

## ⚠️ Do this first

**This project is NOT under version control.** There is no `.git` directory yet.

```bash
git init && git add -A && git commit -m "Initial commit"
```

`.gitignore` already covers `node_modules`, `dist`, `server/data`, `.env` (keeps `.env.example`).

---

## Current status — all green

| Check | Command | Result |
| --- | --- | --- |
| Types | `npm run typecheck` | ✅ strict, exit 0 |
| Tests | `npm test` | ✅ **133 passing / 10 files** |
| Build | `npm run build` | ✅ 46 modules, ~284 kB JS / 88 kB gzip |

## Run it

```bash
npm install
npm run dev        # app      → http://localhost:8137
npm run server     # sync API → http://localhost:8787   (optional)
npm test           # vitest run
```

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
│  ├─ vials.ts           saved-vial model: status, expiry, merge, tombstones
│  ├─ schedule.ts        dose plan: times/day, weekday pattern, duration, calendar maths
│  ├─ dates.ts           tiny yyyy-mm-dd helpers (+ addMonths, startOfWeek)
│  ├─ format.ts          number parsing/formatting, localized dates & weekday names
│  ├─ backup.ts          JSON export/import of vials
│  └─ sync.ts            recovery-code sync: code gen, salted SHA-256, HTTP client
├─ config/
│  ├─ modes.ts           MODE REGISTRY — workflows + per-mode syringe setup
│  └─ defaults.ts        default form values, storage keys, DEFAULT_SYNC_SERVER
├─ i18n/                 en.ts / sk.ts / es.ts + types.ts (the `Strings` contract)
├─ components/           Header, ModeTabs, CalculatorForm, ResultPanel, SyringeVisual,
│                        AlertList, SavedVials, VialCard, VialEditor, ScheduleForm,
│                        DoseCalendar, SyncPanel, SegmentedControl, NumberField, Footer
├─ hooks/useLocalStorage.ts
├─ styles/global.css     design tokens + ALL styling (data-theme / data-mode driven)
├─ App.tsx               state + wiring only
└─ main.tsx

server/
├─ server.mjs            zero-dependency sync API (GET/PUT /api/sync/:key)
├─ README.md             config, hosting, security model
└─ data/sync.sqlite      created on first run — gitignored, this IS everyone's data
```

**In-app flow:** `App.tsx` owns all state → passes props down → `ResultPanel` renders the
answer → `SavedVials` owns the vials list (+ add/restore/edit/sync UI).
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
  id, name, reconstitutedOn: 'yyyy-mm-dd',
  vialAmount, vialUnit: 'mg' | 'mcg',
  waterMl, doseAmount, doseUnit,
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
`pepcalc.v1.{peptide, anabolic, syringe, lang, theme, mode, vials, syncCode, syncServer, syncLast}`

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

---

## Gotchas that will bite you

- **Tests use `renderToString`.** Effects do **not** run, so no `fetch` / `setInterval` fires in
  tests. Don't write effect-dependent tests without changing that strategy.
- **`App.tsx` holds a 1-minute `setInterval` clock** (for accurate "next dose") and two sync
  effects. Both are SSR-safe only because effects don't run during `renderToString`.
- **Large single file writes get truncated** — split a big new file into create-then-append.
- **`server/data/sync.sqlite` is gitignored but is real data.** Back it up in production.
- **`VialCardLegacy`** exists only for vials saved *without* a schedule. Don't remove it without
  checking old data.
- **Never edit `dist/`** — it is a build artifact.
- **`VITE_SYNC_SERVER`** is inlined at build time (`config/defaults.ts`). Set it in `.env` before
  `npm run build` so a fresh device gets your server URL instead of `localhost`.

## Open items / roadmap (priority order)

1. **`git init` + first commit** — nothing is version-controlled yet. Do this first.
2. **PWA + service worker** — installable on the phone, offline shell, and **dose notifications**
   at the scheduled times. This is the biggest missing user-facing feature.
3. **Tombstone purge** — tombstones accumulate forever. Needs a "delete once older than N days"
   sweep, with the trade-off documented.
4. **Conflict awareness** — merges are silent last-write-wins; consider surfacing
   "changed on another device".
5. **Server hardening** — rate limiting, `ALLOWED_ORIGIN` locked to a real origin, request logs.
6. **Deploy** — Dockerfile for the server + host config; static app to any HTTPS host.
7. **Global agenda** — a "today across ALL vials" view: every plan's doses in one list.
8. **Print / export** — a physical vial label showing the expiry date, and a protocol PDF.
9. Optional only if real accounts are ever wanted: swap the sync layer for Supabase + RLS.
   Recovery-code sync was chosen **deliberately** instead of email/password.

## How to extend safely

- **New workflow** (HGH, HCG, insulin, blends): add the id to `ModeId` + a `calculateXxx()` in
  `lib/calc.ts`, add a `ModeMeta` entry to `MODES`, add the copy to all three dictionaries, then
  render its fields in `CalculatorForm.tsx`. Tabs, headings and syringe options self-render.
- **New language**: add a dictionary implementing `Strings`, add its code to `Lang`, register it
  in `i18n/index.ts`. TypeScript then lists every missing string.
- **New warning**: add the code to `WarningCode` plus a sentence in each dictionary — the i18n
  test enforces all three stay in sync.
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
```


