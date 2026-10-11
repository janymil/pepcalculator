# PepCalculator 💊

> 🆕 **Picking this up in a new session? Read [`HANDOFF.md`](HANDOFF.md) first** — it is a
> one-file brief with the architecture, decisions, gotchas and roadmap.

An **installable, offline-first** web app (six pages: Calculator · My vials · Calendar · Reference · Guide · Settings) that turns the **dose you want** into the **exact amount to draw on a syringe** — for reconstituted peptides and ready-to-use anabolic oils. It works with no network and installs to your home screen.

> ⚕️ **Not medical advice.** The app only does the maths. It does not replace a doctor or pharmacist.

---

## What it does

Type what's on your vial and the app answers, live, with the volume (mL) and insulin units to draw — plus a syringe graphic and friendly warnings when a dose doesn't fit.

### Four workflows

| Mode | Who it's for | Inputs | Formula |
| --- | --- | --- | --- |
| 🧬 **Peptides** | Lyophilized powder you reconstitute | 1. mg (or mcg) in the vial<br>2. mL of bacteriostatic water added<br>3. desired dose | `concentration = vial ÷ water`<br>`volume = dose ÷ concentration` |
| 💉 **Anabolics** | Oils that are already mixed | 1. concentration (mg/mL)<br>2. desired dose<br>3. vial size (optional) | `volume = dose ÷ concentration` |
| ✨ **HGH / HCG** | Hormones labelled and dosed in **IU** | the same as peptides, in IU | the same as peptides — but answered in **mL** |
| 💊 **GLP-1 pens** | Ready-to-use solutions you dial | 1. concentration printed on the pen<br>2. desired dose<br>3. the pen's dial (clicks per mL) | `volume = dose ÷ concentration` — answered in **clicks** |

Anabolics need **no reconstitution**, so the app asks for the label concentration directly instead of vial + water.

> **IU is an activity unit, not a mass.** One IU of HGH is a defined biological effect, not a number of milligrams, so the engine works in the **base unit of each family** (mg for mass, IU for activity) and **refuses to mix the two** rather than inventing a conversion factor it cannot know. An IU workflow answers in mL with the syringe graduations beside it, because "units" on a barrel would be confused with the IU printed on the vial — which is the whole reason it is a separate workflow.

### Shared features

- **Syringe aware, per workflow** — peptides are drawn with an **insulin syringe**, so you pick the scale (**U-100 / U-40 / U-50**) and the size (0.3–3 mL) and the app answers in **units**. Anabolic oils are drawn with a **plain mL syringe** (1–10 mL), so the answer is simply the **volume in mL** — no insulin units involved. Either way, it warns if the dose won't fit in one syringe.
- **Live results** — headline units, volume, concentration, total in vial and doses per vial, plus a syringe illustration that fills proportionally.
- **Smart warnings** — dose larger than the vial, volume larger than the syringe, or a dose so small it's hard to measure accurately.
- **English / Slovak / Spanish** with automatic language detection, and a **light / dark** theme.
- **Remembers your numbers** in the browser (localStorage) and updates everything as you type.
- **Saved vials** — save a reconstitution (name, amounts, date) and the app remembers the ratio forever, so it can always show **"draw X units"** — no more guessing whether that vial was mixed with 1 mL or 2 mL. Includes the **28-day expiry** and one-click reload into the calculator.
- **Dose calendar & plan** — when you save a vial, tell the app **how many times a day**, at **which times**, on **which days** and **for how long** (4/8/12 weeks, 3/4 months, ongoing). It then works everything out by itself: a month **calendar**, the **next dose**, **doses done / left**, and **how many vials the whole plan needs**. Nothing to log after an injection.
- **Supply outlook** — the Vials page answers "how long does this last, and what do I order?" It projects the day each vial runs out from its plan, warns when a vial will expire with doses still in it (and roughly how many), and totals the extra vials your plans will need.
- **Injection sites that rotate themselves** — the Today card names the next site (left abdomen, right thigh…) by counting doses from your plan, so rotating needs no logging — the same trick that already made the calendar free.
- **Interval plans** — along with daily and chosen weekdays, a plan can repeat **every N days**: every other day, every third day, weekly, or every two weeks.
- **Step-up (titration) plans** — a plan can change its dose over time: 0.25 mg for four weeks, then 0.5 mg until the end. The Today card draws **today's step**, the supply outlook subtracts what each day *actually* draws (so the same vial lasts longer while the dose is still low), the vial card shows the steps and marks the one you are in, and the printed sheet gets **one row per step** rather than a single misleading line.
- **Pen workflows (GLP-1)** — a pen is a third way of reading the same volume, so the answer can be in **dial clicks**. The dial resolution (clicks per mL) is an input with a plain default, never a table of brands the app could get wrong, and a dose smaller than one click warns instead of pretending to be measurable.
- **Check before you draw** — the Today card opens a full-screen card showing only the three things that have to match — **which vial, how much, and where** — in type big enough to read at arm's length.
- **Readability mode** — opt-in larger type, stronger borders, and a **stripe pattern on every vial dot** at one of four angles derived from the vial id, so two vials never have to be told apart by colour alone.
- **A converter** — mg ↔ mcg, and one draw shown in **mL, syringe graduations and pen clicks** side by side. There is deliberately no IU row: there is no factor to convert with.
- **Plot your own protocol** — the Reference sheet draws the decay curve for **your** plan (your dose, your cadence, the half-life cited for the compound the vial is named after), not just for a compound's typical dose. It says what is missing rather than guessing.
- **Sync tells you what it overwrote** — when both devices edited the same vial the newer copy still wins, but Settings now says **how many edits were resolved that way**, instead of letting one vanish silently.
- **A fix, not just a warning** — when a dose is too small to read off the syringe, the app works out a water volume that would put around 10 units on it and applies it with one tap.
- **Print a protocol and vial labels** — one page with the draw amount, times, repeat pattern and end date, plus a strip of stickers for the bottles (ratio, draw amount, use-by date). The copy in the fridge always matches the app.
- **Encrypted backups** — add a passphrase and the downloaded file is encrypted (PBKDF2 + AES-GCM); restoring asks for the same passphrase and refuses a wrong one.
- **Mix-up guard** — if two vials share a name but were mixed differently, both cards say so. That is the single most dangerous mistake at home.
- **Cost per month** and a gentle **backup reminder** ("last backup 43 days ago") — costs and data you can actually plan around.
- **Dose context** — a vial whose name matches a compound in the reference list shows where your dose sits against the commonly cited range. Context only, never advice.
- **Backup & restore** — download every vial as a JSON file and merge it back on any device. Because everything lives in the browser, this protects you from cleared cookies (or Safari's 7-day eviction) and doubles as data portability.
- **Sync between devices (recovery code)** — no email, no password. The app generates one long random code; type it on your phone and the same vials come across. Runs against the tiny included Node server (`npm run server`). Edits push **automatically** about 1.5 s after you make them, and **deletions travel too** thanks to soft-delete tombstones — which are then swept away automatically after 90 days (`TOMBSTONE_TTL_DAYS`), so the stored payload never grows forever.
- **Installable & offline (PWA)** — add it to your home screen and it runs full-screen with no network. A hand-rolled service worker caches the app shell, so the calculator keeps working with no signal.
- **Dose reminders** — turn reminders on and the app notifies you at the exact times of your saved plans (derived from the schedule — nothing to log). Reminders fire while the app is open or running in the background; a fully closed app would need a push server, which this offline-first app deliberately does not have.
- **Calendar page (all peptides at once)** — a second page collects **every** saved plan in one view: a month grid showing **which days** carry a dose (each day lists its peptides as small **colour-coded pills**, with the hours), the **hours** for the selected day with the amount to draw, a "coming up" strip, and a summary of each plan (repeat pattern, times and end date). Each peptide keeps its own colour everywhere, and **only today** gets a coloured background. Lives in the URL (`#calendar`) so the browser back button works.
- **Anabolics are saved too** — peptides and oils are both first-class saved vials: save an oil straight from anabolic mode and it appears on the Vials and Calendar pages, read in **mL** (no insulin units) and without a 28-day use-by. **All / Peptides / Anabolics** filters on both the list and the calendar keep them apart.
- **Today card** — the Calculator opens with **your next scheduled dose** and exactly how much to draw, with one tap to load those numbers into the calculator. The most common action is no longer buried three pages deep.
- **First-run welcome** — the sample numbers are clearly labelled as an example, and you can start from one with a tap or replace them with your own. The disclaimer is also repeated at the point of use, not only in the footer.
- **Live answer on your phone** — on narrow screens a compact summary bar stays pinned to the bottom, so the dose you must draw never scrolls out of sight while you type.
- **Inverse mode** — "I drew this much — what dose is that?" A toggle on the result panel turns a drawn volume back into a dose (`dose = concentration × volume`), for both peptides and oils.
- **Cost per dose** — add an optional price (and currency) to a vial and the app shows the **cost per dose** and the **cost of finishing the whole plan**.
- **Reference sheet** — a fifth page lists commonly cited **typical ranges, cadences and half-lives** for a set of peptides and anabolics, each with a small decay chart, every row stamped as educational only — never a target, never advice.
- **Undo & safe clearing** — deleting a vial offers an **Undo** snackbar, and Settings has a guarded **Clear all data** action for the escape hatch the app used to lack.
- **Six pages, everything in its place** — **Calculator** (the maths + "save this vial"), **My vials** (the saved list, filter and backup), **Calendar**, **Reference**, **Guide** (the video), and **Settings** (sync + reminders + your data). The page switcher sits at the top.
- **A modern, token-driven UI** — spacing/type/radius/elevation/motion tokens, a single accent colour with semantic states, a hand-rolled **SVG icon set** (no emoji), a **phone bottom tab bar**, gentle page motion, a count-up on the headline number and clean field-validity states.
- **Separate stacks per person** — a **Whose stack** switcher keeps your vials apart from your partner's or a family member's. Every page, the calendar and the saved-vial list belong to exactly **one** person (there is deliberately no "show everyone"), and the people travel with your data in backups and sync. Rename or remove them under **Settings → People**.

---

## Where to find things

Several features are easy to miss because they only appear once they have something to work with
(a saved vial, a planned dose). This is the map:

| What you want | Where it is |
| --- | --- |
| The dose calculation | **Calculator** — the page the app opens on |
| HGH / HCG, GLP-1 pens | **Calculator** → the workflow tabs at the top (4 workflows) |
| "What do I draw next?" + the arm's-length **check card** | **Calculator** → the **Today card** (appears when a planned dose is due within a week) |
| Save a vial, and its dose plan | **Calculator** → *Save this vial* (below the result) |
| **Step-up (titration) plans** | **My vials** → *Edit* a vial → tick **Step the dose up** in the plan editor |
| Supply outlook: run-out dates, expiry, reorder count | **My vials** — the *Supply* panel at the top, and a line on each card |
| **Print a protocol + vial labels** | **My vials** → **Print protocol & labels** (top-right) |
| Backup, restore, encrypt a backup | **My vials** → the *Backup* card at the bottom |
| Calendar of every plan, "coming up" | **Calendar** |
| Compound ranges, the **converter**, **your protocol plot** | **Reference** → the *Compounds / Converter / Your protocol* tabs |
| Sync (recovery code, conflict notice) | **Settings** → *Sync* |
| Dose reminders | **Settings** → *Reminders* |
| **Larger text + non-colour vial markers** | **Settings** → *Display* |
| **The 38-second explainer video** | **Guide** (its own page) — or `public/explainer.html` standalone |

If a feature seems to be missing, it is usually waiting for data: the supply outlook needs a vial
with a plan, the Today card needs a dose due this week, and the protocol plot needs a saved vial
named after a compound in the Reference list.

---

## Getting started

### The 38-second explainer

`public/explainer.html` is a self-contained, hand-drawn animation (English / Slovak / Spanish,
9 scenes) that shows what the app does. It lives in `public/` because the app serves it itself —
the **Guide** page frames it. No build step, no assets — just open it:

```
start public\explainer.html
```

It can record itself to a video file (**Export video (.webm)**), plays at 1× or 0.5×, and takes deep
links for stills and covers (`?lang=sk`, `?at=15200`). Full details in
[demo/README.md](./demo/README.md); the narration script is in
[demo/storyboard.md](./demo/storyboard.md).

> Note: GitHub shows `.html` files as source, so use the **Raw** button and save it, or clone and
> open it locally — it will not render inside the GitHub file view.

```bash
git clone https://github.com/janymil/pepcalculator.git   # private repo — needs your GitHub access
cd pepcalculator
npm install
npm run dev        # app on http://localhost:8137
npm run server     # optional: recovery-code sync on http://localhost:8787
```

Other scripts:

```bash
npm run build      # type-check + production build into dist/
npm run preview    # serve the production build (http://localhost:8138)
npm test           # run the unit tests
npm run typecheck  # TypeScript only
npm run icons      # regenerate the PWA icons in public/icons/ (only if you change the design)
```

> The service worker is only installed in the **production** build, so `npm run dev` behaves
> normally. To try the installable / offline experience, run `npm run build && npm run preview`.

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
│  ├─ vials.ts           # saved-vial logic: kind, doses, expiry, merge, tombstone purge
│  ├─ vialColors.ts      # stable colour per vial id (calendar pills, cards)
│  ├─ schedule.ts        # dose plan: times, repeat, duration, calendar, next dose
│  ├─ backup.ts          # export / import saved vials as JSON
│  ├─ sync.ts            # recovery-code sync: code, hash, merge client
│  ├─ reminders.ts       # pure: the next dose across all saved plans
│  ├─ agenda.ts          # pure: ALL plans by day & hour (the Calendar page)
│  ├─ today.ts           # pure: which doses fall today / what is next (the Today card)
│  ├─ owners.ts          # pure: "whose stack" — people registry + per-person filtering
│  ├─ pk.ts              # pure: one-compartment half-life decay for the reference chart
│  ├─ cost.ts            # pure: cost per dose + plan cost from an optional vial price
│  ├─ reference.ts       # static compound reference data (ranges, half-lives) — not advice
│  ├─ views.ts           # pure: the pages + URL-hash helpers
│  ├─ pwa.ts             # guarded service-worker + notification helpers
│  ├─ dates.ts           # tiny dependency-free date helpers
│  └─ format.ts          # formatting, input parsing, dates, money
├─ config/
│  ├─ modes.ts           # MODE REGISTRY: workflows + per-mode syringe setup
│  └─ defaults.ts        # default form values + storage keys
├─ i18n/
│  ├─ en.ts / sk.ts / es.ts   # dictionaries (must satisfy `Strings`)
│  ├─ types.ts           # the `Strings` contract
│  ├─ index.ts           # language detection + interpolation
│  └─ I18nContext.tsx    # `useI18n()` hook
├─ components/           # Header, ViewTabs, ModeTabs, CalculatorForm, ResultPanel, Icon,
│                        # OwnerTabs, PeoplePanel, TodayDose, MobileSummaryBar, FirstRunCard,
│                        # ReferencePage, Toast, DangerZone, SaveVialForm, SavedVials,
│                        # VialCard, AgendaPage, SettingsPage, …
├─ hooks/                # useLocalStorage.ts, useDoseReminders.ts, useCountUp.ts
├─ styles/global.css     # design tokens + all styling
├─ App.tsx               # state + wiring
└─ main.tsx

public/                  # copied verbatim to the site root (PWA assets)
├─ manifest.webmanifest
├─ sw.js                 # hand-rolled service worker (offline shell + notifications)
└─ icons/*.png           # generated by `npm run icons`

scripts/
└─ generate-icons.mjs    # zero-dependency PNG icon generator
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
3. Add the copy in `src/i18n/en.ts`, `sk.ts` **and** `es.ts` (TypeScript will list what's missing).
4. Render its fields in `src/components/CalculatorForm.tsx`.

Tabs, headings and layout update themselves.

### Add a new page

Add its id to `ViewId` + `VIEWS` in `src/lib/views.ts`, add the `views` copy to all three dictionaries, add its icon to `src/components/ViewTabs.tsx`, and render it in `App.tsx` (the `#reference` page is a compact example). The tab strip and hash routing follow automatically.

### Add a reference compound

Append an entry to `COMPOUNDS` in `src/lib/reference.ts` — name, class, typical range, common water volumes, half-life and cadence. The Reference page and its decay chart render from the list.

### Add a language

Add a dictionary file, add its code to `Lang`, and register it in `src/i18n/index.ts` (see `es.ts` for a complete example). TypeScript will immediately list any missing or mistyped strings, and `src/i18n/i18n.test.ts` fails the build if a dictionary is incomplete.

### Ideas already anticipated by the structure

- ~~Half-life / blood-level chart~~ — done: `src/lib/pk.ts` + the chart on the Reference page.
- True background reminders when the app is closed (Web Push or Notification Triggers).
- ~~Export or print a protocol~~ — done: `PrintSheet.tsx` renders the protocol page and the vial stickers. ~~Interval schedules~~ — done: `repeat: 'interval'`.
- Titration phases (a step-up plan that changes the dose after N weeks) and pen devices, for GLP-1 users.
- New workflows such as HGH, HCG and insulin need an **IU** dose unit added to `DoseUnit` (with a `v2` storage migration); the mode registry is otherwise ready for them.
- Multi-vial inventory for anabolic oils (the saved-vial model is generic).
- Additional syringe types and pen devices.

---

## Health & safety

This tool performs arithmetic only. Always verify the vial label, your syringe and your dose with a qualified professional, and never share or reuse needles.
