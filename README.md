# PepCalculator 💊

> 🆕 **Picking this up in a new session? Read [`HANDOFF.md`](HANDOFF.md) first** — it is a
> one-file brief with the architecture, decisions, gotchas and roadmap.

An offline-first, single-page web app that turns the **dose you want** into the **exact amount to draw on a syringe** — for reconstituted peptides and ready-to-use anabolic oils.

> ⚕️ **Not medical advice.** The app only does the maths. It does not replace a doctor or pharmacist.

---

## What it does

Type what's on your vial and the app answers, live, with the volume (mL) and insulin units to draw — plus a syringe graphic and friendly warnings when a dose doesn't fit.

### Two modes

| Mode | Who it's for | Inputs | Formula |
| --- | --- | --- | --- |
| 🧬 **Peptides** | Lyophilized powder you reconstitute | 1. mg (or mcg) in the vial<br>2. mL of bacteriostatic water added<br>3. desired dose | `concentration = vial ÷ water`<br>`volume = dose ÷ concentration` |
| 💉 **Anabolics** | Oils that are already mixed | 1. concentration (mg/mL)<br>2. desired dose<br>3. vial size (optional) | `volume = dose ÷ concentration` |

Anabolics need **no reconstitution**, so the app asks for the label concentration directly instead of vial + water.

### Shared features

- **Syringe aware, per workflow** — peptides are drawn with an **insulin syringe**, so you pick the scale (**U-100 / U-40 / U-50**) and the size (0.3–3 mL) and the app answers in **units**. Anabolic oils are drawn with a **plain mL syringe** (1–10 mL), so the answer is simply the **volume in mL** — no insulin units involved. Either way, it warns if the dose won't fit in one syringe.
- **Live results** — headline units, volume, concentration, total in vial and doses per vial, plus a syringe illustration that fills proportionally.
- **Smart warnings** — dose larger than the vial, volume larger than the syringe, or a dose so small it's hard to measure accurately.
- **English / Slovak / Spanish** with automatic language detection, and a **light / dark** theme.
- **Remembers your numbers** in the browser (localStorage) and updates everything as you type.
- **Saved vials** — save a reconstitution (name, amounts, date) and the app remembers the ratio forever, so it can always show **"draw X units"** — no more guessing whether that vial was mixed with 1 mL or 2 mL. Includes the **28-day expiry** and one-click reload into the calculator.
- **Dose calendar & plan** — when you save a vial, tell the app **how many times a day**, at **which times**, on **which days** and **for how long** (4/8/12 weeks, 3/4 months, ongoing). It then works everything out by itself: a month **calendar**, the **next dose**, **doses done / left**, and **how many vials the whole plan needs**. Nothing to log after an injection.
- **Backup & restore** — download every vial as a JSON file and merge it back on any device. Because everything lives in the browser, this protects you from cleared cookies (or Safari's 7-day eviction) and doubles as data portability.
- **Sync between devices (recovery code)** — no email, no password. The app generates one long random code; type it on your phone and the same vials come across. Runs against the tiny included Node server (`npm run server`). Edits push **automatically** about 1.5 s after you make them, and **deletions travel too** thanks to soft-delete tombstones.

---

## Getting started

```bash
npm install
npm run dev        # app on http://localhost:8137
npm run server     # optional: recovery-code sync on http://localhost:8787
```

Other scripts:

```bash
npm run build      # type-check + production build into dist/
npm run preview    # serve the production build
npm test           # run the calculation-engine unit tests
npm run typecheck  # TypeScript only
```

### Deploying

1. **Server:** host `server/server.mjs` on anything running Node 22+ (Render, Railway, Fly, a VPS). Set `PORT`, `DB_PATH` **on a persistent volume**, and `ALLOWED_ORIGIN` to your app's URL.
2. **App:** host `dist/` on any HTTPS host (Netlify, Vercel, Cloudflare Pages, GitHub Pages). HTTPS is required for sync, because `crypto.subtle` only exists in a secure context.
3. **Point the app at the server:** copy `.env.example` to `.env`, set `VITE_SYNC_SERVER=https://your-sync-host`, then `npm run build`. The URL is baked into the bundle so new devices pick it up with no typing.

---

## Project structure

```
src/
├─ lib/
│  ├─ calc.ts            # pure calculation engine (no React, no DOM)
│  ├─ calc.test.ts       # unit tests for the engine
│  ├─ vials.ts           # saved-vial logic: doses left, volume left, expiry
│  ├─ schedule.ts        # dose plan: times, repeat, duration, calendar, next dose
│  ├─ backup.ts          # export / import saved vials as JSON
│  ├─ sync.ts            # recovery-code sync: code, hash, merge client
│  ├─ dates.ts           # tiny dependency-free date helpers
│  └─ format.ts          # formatting, input parsing, dates
├─ config/
│  ├─ modes.ts           # MODE REGISTRY: workflows + per-mode syringe setup
│  └─ defaults.ts        # default form values + storage keys
├─ i18n/
│  ├─ en.ts / sk.ts / es.ts   # dictionaries (must satisfy `Strings`)
│  ├─ types.ts           # the `Strings` contract
│  ├─ index.ts           # language detection + interpolation
│  └─ I18nContext.tsx    # `useI18n()` hook
├─ components/           # Header, ModeTabs, CalculatorForm, ResultPanel, …
├─ hooks/useLocalStorage.ts
├─ styles/global.css     # design tokens + all styling
├─ App.tsx               # state + wiring
└─ main.tsx
```

The optional sync backend sits beside `src/`:

- `server/server.mjs` — zero-dependency sync API (Node `http` + `node:sqlite`)
- `server/data/sync.sqlite` — created on first run; **this file is everyone's synced data**, so back it up
- `server/README.md` — configuration, hosting options and the security model

The **calculation engine is pure and unit-tested**, and the **UI renders from the mode registry** — so the app is built to grow.

---

## Built to be extended

Everything below was deliberately left easy to add.

### Add a new workflow (e.g. HGH, HCG, insulin, blends)

1. Add an id to `ModeId` and a `calculateXxx()` function in `src/lib/calc.ts`.
2. Add one entry to `MODES` in `src/config/modes.ts` (icon, `measure` system and syringe sizes).
3. Add the copy in `src/i18n/en.ts` and `src/i18n/sk.ts` (TypeScript will list what's missing).
4. Render its fields in `src/components/CalculatorForm.tsx`.

Tabs, headings and layout update themselves.

### Add a language

Add a dictionary file, add its code to `Lang`, and register it in `src/i18n/index.ts` (see `es.ts` for a complete example). TypeScript will immediately list any missing or mistyped strings, and `src/i18n/i18n.test.ts` fails the build if a dictionary is incomplete.

### Ideas already anticipated by the structure

- Half-life / blood-level chart (the engine already returns every intermediate value).
- Dose reminders / notifications for a saved vial (PWA + service worker).
- Export or print a protocol — or a physical vial label with the expiry date.
- Multi-vial inventory for anabolic oils (the saved-vial model is generic).
- Additional syringe types and pen devices.

---

## Health & safety

This tool performs arithmetic only. Always verify the vial label, your syringe and your dose with a qualified professional, and never share or reuse needles.
