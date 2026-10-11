# Proposal — a "GLP-1 companion" for PepCalculator

**Status:** proposal only. Nothing here is built, and this file changes no behaviour. It exists so the
decision is made in one place instead of drifting into code.

**The ask:** a special function for the GLP-1 class (tirzepatide, retatrutide, and the prescribed
products such as Mounjaro and Wegovy) that tells the user

1. how to use the pen, if it is a pen,
2. what to check before using it,
3. which parts of the body to measure to follow changes,
4. what else to do while on it — training so muscle is not lost, and what to eat.

---

## Verdict, up front

**Items 1, 2 and 3 are a good fit and I recommend building them. Item 4, as written, is not — it
should ship as *questions to ask a prescriber* instead of instructions.**

The reason is not squeamishness, it is the app's only real asset. Every surface in this repo says the
same thing — footer, print sheet, the Reference stamps, the closing scene of the video: **"not medical
advice; it only does the maths."** A calculator that is trusted because it stays in its lane should not
quietly start prescribing training and diet for a prescription-only medicine. Items 1–3 keep that
promise (procedure, data, and questions). Item 4 breaks it, and it is also the item with legal
exposure: Mounjaro and Wegovy are prescription medicines in the EU/UK/US, and publishing usage and
nutrition guidance next to them edges into medicinal-product advertising rules — with liability that
lands on whoever wrote the sentence, not on the user.

There is also a second reason, specific to this class: **"what should I eat / how should I train" is
exactly where a general tool becomes a bad coach.** The well-established content (protein at meals,
resistance training, hydration, small portions, fibre, alcohol) is genuinely helpful *and* it is
already the prescriber's job to deliver it, individualised. The app's useful contribution is to make
sure the conversation happens — not to replace it with generic numbers.

---

## What exists today (verified in this repo, not assumed)

| Thing | Where it is | State |
| --- | --- | --- |
| GLP-1 workflow, answered in **clicks** | `ModeId 'glp1'`, `VialKind 'glp1'`, `MeasureSystem 'clicks'`, `ModeMeta` in `config/modes.ts` | **Exists.** Dial resolution is an input (`DEFAULT_CLICKS_PER_ML`), never a brand table |
| Titration (step-up) plans — how GLP-1s are actually started | `DosePhase[]` on `VialSchedule` (`lib/schedule.ts`) | **Exists** |
| Check-before-you-draw card | `components/DrawCheck.tsx` — vial, site, when, how much; big type, Escape, focus handling | **Exists** — shows *what*, not *how* |
| Injection-site rotation (6 sites, derived, no logging) | `lib/sites.ts`, surfaced on the Today card | **Exists** |
| Reference rows for the class | `lib/reference.ts` — `semaglutide`, `tirzepatide` present; **no `retatrutide`** | **Partial** — and the rows describe *reconstituted vials* (mcg + water volumes), which is the compounded route, not a prescribed pen |
| 28-day in-use warning | `lib/supply.ts` | **Exists** — but it is the reconstituted-peptide rule. A pen's in-use window is product-specific and must come from that product's leaflet |
| **Body / weight / measurement tracking** | — | **Does not exist anywhere.** Verified: zero matches outside CSS `font-weight` |
| Storage + backup + sync | `STORAGE_KEYS` in `config/defaults.ts` (`pepcalc.v1.*`) | Measurements would need a **new key** — the one case `HANDOFF.md` flags as migration-relevant (payloads must carry it, or an older client silently drops it) |

So of the four asks: **1 and 2 have a natural home that already exists**, **3 needs a new module**,
**4 should not be a feature**.

---

## The four asks, mapped

| Ask | Verdict | Shape |
| --- | --- | --- |
| 1. How to use the pen | **Build** | A short, numbered, **generic** pen routine shown on the draw-check card, and printable |
| 2. What to check before using | **Build** | Extend the existing check card with a pre-use list (expiry, storage, liquid, needle, dial, prime, hold, dispose) |
| 3. What to measure on the body | **Build** | A measurement log + trend for **waist first, then hip/neck/arm/thigh and weight**, with a "measure the same way each time" hint |
| 4. Training and food | **Reshape** | Questions to ask the prescriber. Positive content only as non-numeric, attributed general principles, and only if the boundary change below is accepted |

**Why a generic routine and not per-brand steps.** This is the same call the repo already made once:
`DEFAULT_CLICKS_PER_ML` is "always an input, never a brand table", because devices differ and brand
tables rot. Mounjaro's pen dials **mg**, Wegovy's dials **mg**, and compounded pens dial
clicks/units — a step list that pretends they are one device would be wrong for most users. So: a
routine that is true of pens in general, one prominent line saying *your device's own leaflet is the
authority*, and a first step of "read the leaflet that came with this pen".

---

## Proposed scope — four phases, each shippable on its own

### Phase 1 — Pen routine + pre-use check *(small, highest value, lowest risk)*

**Where:** `lib/pen.ts` (new, pure) + the existing `components/DrawCheck.tsx`, which already owns the
"moment of drawing" screen.

- `lib/pen.ts` holds the routine as **data**, not prose in JSX: an ordered list of steps, each with a
  title, an optional short body, and a flag for "this is a check, not an action".
- When the dose comes from a pen, the check card renders the routine as well as the numbers. A syringe
  keeps today's card unchanged.
- The pre-use list is what device leaflets and clinic guidance consistently say: **check the date and
  the in-use window**, **check the solution** (clear, no particles, right colour), **check the needle
  is new and firmly on**, **check the dial reads the prescribed amount**, **prime if the leaflet says
  so**, **hold after injecting**, **dispose in a sharps bin**. Where a number exists — hold seconds,
  in-use days, storage temperature — it comes from *the user's own leaflet*, phrased as "per your
  leaflet". We invent no numbers.
- The same routine prints, because a checklist is something you stick on the fridge. `PrintSheet`
  already exists.

**Tests:** the list is reachable, ordered and stable; every string exists in all three languages.
Nothing here tests medical facts — only that the list is the list we shipped.

### Phase 2 — Body measurement log + trend *(medium; the genuinely missing capability)*

**Where:** `lib/measure.ts` (new, pure) + a new storage key + a view. This is what "which part of the
body do I check" actually needs, and today the app has **nothing**.

- Record **date + optional circumference points + weight**, per owner (the owners model already
  exists). Points, in the order I would surface them: **waist at the navel** — the most meaningful one
  for this class, and what clinics use — then **hip** (widest), **neck**, **upper arm**, **thigh**,
  plus weight. All optional: logging one number has to be enough.
- Units: cm/kg by default, lb/in available, reusing the existing measure-system setting rather than
  adding a third unit concept.
- A **trend, not a scoreboard**: the change since the start of the current plan, and a small line
  chart. `PkChart`/`ProtocolPlot` already establish how this repo draws a series, so this is reuse.
- One honest hint: **measure the same way, same day, same time** — waist especially.
- Rides in the existing backup and sync payloads, and in "clear all data".

**Why it is safe:** it is storage and arithmetic, which is what this app already is. It tells you
*where* to measure and *what changed*; it never says whether the change is good enough.

**Tests:** pure module first — unit conversion, change calculation, sparse and partial entries,
ordering, rounding, empty state — then a component test for the empty → one entry → trend path.

### Phase 3 — "Ask your prescriber" *(small)*

**Where:** a section on the GLP-1 reference row and/or the Guide page — **not** the calculator.

- A list of **questions**, in the user's language: *ask about protein and resistance training to
  protect muscle while losing weight*, *ask what to do if you cannot keep food down*, *ask whether to
  change the dose*, *ask what the in-use window is for this pen*, *ask what to do before surgery or if
  you become pregnant*. Muscle and food live here — as prompts, which is what makes them both safe and
  still useful.
- Plus the standard, factual **contact a clinician** block that leaflets carry: persistent vomiting,
  signs of dehydration, severe abdominal pain, signs of an allergic reaction. This is the one place
  imperative wording is right, because it quotes safety information rather than inventing it.

### Phase 4 — "General principles" card *(only with an explicit decision — see the boundary section)*

Well-established content: hydration, small portions and eating slowly, protein at each meal,
resistance training, fibre, alcohol, and that nausea early on is common and usually settles. I would
ship it **only** if:

- you accept the change in what this app claims to be (next section),
- it is **non-numeric** — no grams, no calories, no sets, no targets, because numbers are the
  prescriber's call,
- it is visually separate from the calculator, with the disclaimer repeated **inside the card**, not
  only in the footer,
- it is attributed to public-health guidance rather than presented as our recommendation,
- a clinician or lawyer has looked at the wording, and it stays **out of the print sheet** and out of
  the exported protocol — the two surfaces people hand to a clinician.

---

## What I would not build, and why

- **A brand → clicks/mg table** (Mounjaro = N clicks, Wegovy = M). It contradicts a documented decision
  in this repo, it is wrong for compounded pens, it ages badly, and it is the version that reads as
  dosing advice for a prescription medicine.
- **Per-brand in-use windows and storage numbers** (30 days, 6 weeks, 2–8 °C). They differ per product
  and change with reformulation, so the app should ask the user for their leaflet's rule. The existing
  28-day rule must not simply be relabelled as "the pen rule".
- **Numeric nutrition or training prescriptions** (X g protein per kg, Y sessions a week). Not because
  the science is dubious — because individualising it is clinical work, and a calculator stating it
  invites people to treat it as a plan.
- **Anything that looks like guidance for an investigational compound.** Retatrutide is not an approved
  product; a routine or a range for it would look authoritative where nothing is authorised. Its
  reference row should say exactly that, and stop.
- **Goal/target features** (target weight, "X to go"). Different product, different failure mode.

---

## The boundary question — the only decision that really matters

Phases 1–3 keep the app's existing claim: **procedure, arithmetic, questions.** Phase 4 changes it to
**guidance.** Both are defensible; only one is the app as it stands today.

My recommendation: **ship 1–3, write 4 as questions.** If you want the positive content sooner,
publish it as a separate, clearly-labelled "well-established general principles" sheet — the Guide page
is the natural host, because it is what someone opens *before* acting rather than while drawing.

If Phase 4 goes into the app proper, I would want a clinician's name on the content and a lawyer's eye
on the wording first. Not because the content is controversial, but because the value of this app is
that people trust it to stay in its lane.

---

## Open decisions

1. **Who is the audience?** Prescribed pen users (Mounjaro/Wegovy), the compounded-vial crowd, or both?
   The app models the *vial* story for these compounds today and adds a pen workflow on top — worth
   deciding whether the companion follows the pen, the vial, or either.
2. **Do brand names appear anywhere in the UI?** Naming them descriptively is one thing; anything that
   looks like affiliation, or per-brand instructions, is another.
3. **Phase 4 in or out?** Phases 1–3 can proceed without that answer.

## Effort, in this repo's currency

| Phase | Size | Also means |
| --- | --- | --- |
| 1 — pen routine + pre-use check | small (one pure module, one component, one print path) | all copy × 3 languages — the i18n test enforces parity |
| 2 — measurements + trend | medium (pure module + a view + a storage key) | backup **and** sync payloads carry it; "clear all data"; a real test file |
| 3 — prescriber questions | small | × 3 languages |
| 4 — principles card | small to write, large to justify | clinical/legal review; kept out of print and export |

Each phase also needs the repo's usual companions: a `HANDOFF.md` entry, a row in the README "Where to
find things" table (a feature nobody can find is not shipped), and pure logic in `src/lib/` with its
test written first.

---

## Small corrections worth making regardless of this proposal

Two things I would fix independent of the above, because they are wrong today rather than merely
missing:

- **Add `retatrutide` to `lib/reference.ts`** with an explicit "investigational — no approved dosing"
  stamp, so its absence does not look like an oversight and its presence does not look like an
  endorsement.
- **Separate the two routes in the reference data.** The `semaglutide` and `tirzepatide` rows carry
  reconstituted-vial figures (mcg + water volumes), which is the compounded route, not the prescribed
  pen. A `route` field (`reconstituted vial` / `prescribed pen`) would stop the table implying the two
  are interchangeable — and stop a pen user reading a vial range as their dose.
