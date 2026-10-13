# Proposal — the "trust bundle": show the maths, check itself, prove it

**Status:** **shipped** — all three parts built, tested and green (see `PROPOSALS.md` §F). One
roadmap for three features that share a single idea: **a dose calculator that does not ask you to
take its word for it.**

**Why this bundle.** "Offline / no account" is a feature every competitor can copy in a weekend.
The one thing they cannot copy is *trust* — and this repo has already spent its entire architecture
earning it: a pure, unit-tested engine, warnings that are **codes, not text**, an explicit refusal to
invent a number (`mixedUnits`, the missing-half-life refusal in `ProtocolPlot`, "no IU row" in the
converter), molecules not brands, and the promise repeated on every surface: *"it only does the
maths."* The bundle turns that principle into three things a user can **see**, **rely on**, and
**verify**:

| Part | One line | Effort |
| --- | --- | --- |
| **A — Show the maths** | The arithmetic, with the user's own numbers, under the result | Small |
| **B — Two routes, or it refuses** | Compute the answer twice by independent routes; withhold it if they disagree | Medium |
| **C — Provable privacy** | A privacy statement backed by a public page of the worked examples the tests use | Small |

Parts A and C reuse one new module, `src/lib/workedExamples.ts` — the single source of truth for the
canonical cases (tests **and** the in-app proof page read the same list). Part B reuses the
engine's existing outputs, so **no formula changes** — the maths the repo says must not change does
not change.

**Repo rules this proposal obeys (non-negotiable):**

- All logic in **pure, UI-free** modules under `src/lib/`, unit-tested first.
- Components never do maths. The engine returns **structured data / codes**, the UI formats them.
- Every string in **three languages** (`en`, `sk`, `es`); `i18n.test.ts` enforces identical keys
  *and* identical `{placeholders}` across all three.
- **No new runtime dependencies.** `react` + `react-dom` only.
- A feature nobody can find is not shipped → each part adds a README "Where to find things" row, a
  `HANDOFF.md` entry, and a `PROPOSALS.md` row in the same change.

---

## Part A — "Show the maths"

**What.** Under the result, render the calculation as the line a nurse writes on a sticky note,
with **the user's numbers substituted** — not a generic formula, the actual arithmetic:

```
1 mg ÷ 2 mL            = 500 mcg/mL      (concentration)
250 mcg ÷ 500 mcg/mL   = 0.5 mL          (volume)
0.5 mL × 100           = 50 units        (U-100 syringe)
```

**Why it differentiates.** Every competitor hands you a number in a black box. This hands you the
*working*. It lets a user catch their own typo before injecting, it audits the app in public, and it
is the literal embodiment of "it only does the maths." It is also copy-pasteable — a proof you can
send to a partner or a nurse.

**Why it is cheap.** `assemble()` in `src/lib/calc.ts` already returns every intermediate
(`concentrationPerMl`, `doseBase`, `volumeMl`, `units`, `unitsPerMl`, `clicks`, `clicksPerMl`). The
only value not currently returned is the water volume — supplied by the caller (it is already in
scope as `parseNumber(reconstituted.waterMl)` in `App.tsx`). So this is a **presentational** feature
plus a tiny pure helper.

### New module — `src/lib/derive.ts` (pure)

```ts
export type DerivationKind = 'concentration' | 'volume' | 'units' | 'clicks';

export interface DerivationStep {
  kind: DerivationKind;
  /** Values substituted into the matching i18n template. Numbers, not text. */
  params: Record<string, number | string>;
}

export interface DerivationInput {
  mode: ModeId;                 // peptide | hormone | anabolic | glp1
  measure: MeasureSystem;       // insulin | volume | clicks
  baseUnitLabel: string;        // 'mg' | 'mcg' | 'IU' (vial family)
  vialAmountBase: number;       // only for reconstituted modes
  waterMl: number;              // only for reconstituted modes
  doseUnit: string;             // the unit the user typed the dose in
}

/** Ordered steps that reproduce the headline answer. Empty when !result.ok. */
export function buildDerivation(result: CalcResult, input: DerivationInput): DerivationStep[];
```

Rules (mirroring the engine's own honesty):

- Returns `[]` (render nothing) whenever `!result.ok` — never show working for a withheld answer.
- Reconstituted (`peptide`, `hormone`): `concentration` → `volume` → `units`.
- Labelled (`anabolic`): `volume` only (there is no reconstitution step — do not invent one).
- Pen (`glp1`): `volume` → `clicks`.
- Uses `fromBase` so the concentration line shows the number the user recognises (mcg vs mg),
  exactly as `ResultPanel`'s stats already do.

### New component — `src/components/Derivation.tsx`

- Renders an ordered list (`<ol className="derivation">`) of `buildDerivation(...)` results, each
  `<li>` through `interpolate(strings.derivation[kind], step.params)`.
- Placed in `ResultPanel.tsx` right after the `<dl className="stats">` block, so it sits with the
  numbers it explains. Rendered only when `result.ok`.
- **Not** count-up animated (the `hero` number is; the working should be still and readable).
- Wrapped in a `<details>`/`<summary>` using `strings.derivation.toggle` so power users can hide it;
  open by default so the trust signal is visible without a click.

### i18n — new `derivation` block (all three dictionaries)

```ts
derivation: {
  title: string;         // 'How this was worked out'
  toggle: string;        // 'Show the maths' / 'Hide'
  concentration: string; // '{vial} {unit} ÷ {water} mL = {conc} {unit}/mL'
  volume: string;        // '{dose} {unit} ÷ {conc} {unit}/mL = {volume} mL'
  units: string;         // '{volume} mL × {perMl} units/mL = {units} units'
  clicks: string;        // '{volume} mL × {perMl} clicks/mL = {count} clicks'
}
```

**Placeholders must be byte-identical in `en`, `sk`, `es`** — `i18n.test.ts` ("uses the same
{placeholders} in every language") fails the build otherwise. Word order differs per language; the
placeholder **set** may not.

### Tests

- `src/lib/derive.test.ts` (pure): peptide → 3 steps in order with the right params; anabolic → 1
  step; pen → volume + clicks; `!ok` → `[]`; crucially, **the working evaluated by hand equals
  `result.volumeMl` / `result.units`** (that is the whole point — the displayed working must equal
  the displayed answer).
- `ResultPanel.test.tsx`: assert the rendered HTML contains `class="derivation"` and the `units`
  step for the U-100 peptide case — same `renderToString` style as the existing cases.

---

## Part B — "Two routes, or it refuses"

**What.** Compute the answer **twice, by independent arrangements of the arithmetic**, and only show
a result when the two agree within a rounding tolerance. If they ever disagree, withhold the answer
and say so — the same posture the app already takes for `mixedUnits` and a missing half-life.

**Why it differentiates.** A calculator that can **detect its own inconsistency** is a safety
property no competitor advertises, and none can honestly claim without the pure, testable engine to
back it. It is the natural next step from "refuses rather than invents."

**Where.** `src/lib/calc.ts` — a private `selfCheck()` called inside `assemble()`, storing the
verdict on the result. No formula is changed; a second, algebraically independent arrangement is
added **alongside** the primary one and compared.

### The two routes (reconstituted: peptide / hormone)

```
primary      : units = (doseBase / (totalBase / waterMl)) × unitsPerMl
               (concentration first, then volume — what the app shows)
independent  : units = (doseBase / totalBase) × (waterMl × unitsPerMl)
               (fraction-of-the-vial × units the whole vial holds — a ratio, no concentration term)
```

These are different expressions (one divides a concentration; the other multiplies two ratios), so
they catch a real class of ordering/scale mistakes. A third sanity check reuses the existing inverse
path: `doseFromVolume(units ÷ unitsPerMl)` must round-trip back to `doseBase`.

**Honesty note (important).** For a **labelled** workflow (`anabolic`, `glp1`) there is only one
meaningful route — `volume = dose ÷ concentration`. We must **not** fake an "independent" route there
by restating the same division. For those modes the check degrades honestly to the **round-trip
inverse only**, and the result is marked `skipped` rather than `ok`. This is stated in code comments
and in this file, so the feature cannot quietly overclaim.

### Result shape

```ts
export type SelfCheck = 'ok' | 'mismatch' | 'skipped';
// added to CalcResult:
selfCheck: SelfCheck;
```

New `WarningCode` member `internalMismatch` (severity `error`), pushed when `selfCheck === 'mismatch'`.
Because `ok = ready && no error warnings`, a mismatch **withholds** the headline automatically — no
change to that rule, it already does the right thing.

- Tolerance: **relative**, e.g. `|a - b| <= 1e-9 * max(1, |a|, |b|)`. Absolute-only epsilons
  false-positive on 0.02 mL draws; relative ones do not. Pinned by a test.
- `skipped` never shows a warning; it simply carries no assurance.

### i18n — one new warning string (all three dictionaries)

```ts
warnings: {
  internalMismatch: string; // 'The two ways of working this out gave different answers, so the app is not showing one. Check your entries, or ask a pharmacist.'
}
```

### Tests

- `calc.test.ts`: the sample cases still return `selfCheck: 'ok'` (the primary and
  independent routes agree); a **deliberately perturbed** internal input yields `'mismatch'` and
  `ok: false` with the `internalMismatch` warning; an anabolic yields `'skipped'`.
- Construct the mismatch case by exporting the pure comparer (e.g. `selfCheckAgrees(a, b)`) and
  testing it directly with `a`/`b` that differ by more than the epsilon — no need to corrupt the
  formula to test the guard.

### Effort / risk

Medium. The risk is a **false positive** (withholding a correct answer), mitigated by the relative
epsilon and by running the whole existing suite — every current peptide/hormone test must keep
passing unchanged. The `skipped` honesty is what keeps this from being an overclaim.

---

## Part C — "Provable privacy" (and the shared proof page)

**What.** Turn "no account, nothing leaves your device, it only does the maths" from a claim into a
**demonstration**, in two small pieces that share the `workedExamples` module with Part A.

### C1 — A "Privacy" card on the Settings page

A new `<section className="card">` in `SettingsPage.tsx` (same shape as the existing Display card),
rendered from pure copy — no logic, nothing to get wrong:

```ts
settings: {
  privacy: string;      // 'Privacy'
  privacyBody: string;  // 'No account, no cloud, no analytics. Your numbers stay in this browser. The app makes no network request except sync, and only to the address you enter.'
  privacyProof: string; // 'Every answer is checked; see the worked examples.'
}
```

Honest and narrow: it says exactly what is true. It does **not** add a fake "0 requests" counter
(a live counter cannot see service-worker traffic or same-origin loads, so it would be a *dishonest*
gauge). The proof lives in the next item instead.

### C2 — `src/lib/workedExamples.ts` + a "Verified examples" tab

The single source of truth for the canonical hand-worked cases:

```ts
export interface WorkedExample {
  id: string;
  mode: ModeId;
  /** Human label, e.g. '5 mg in 2 mL, 250 mcg dose'. */
  labelKey: string;              // i18n key, not free text (3 languages)
  input: /* the *Input union used by calc.ts */;
  /** The drawing an expert would write down. */
  expected: { volumeMl: number; units?: number; clicks?: number };
}
export const WORKED_EXAMPLES: readonly WorkedExample[];
```

Two consumers, one list:

1. **Tests** — `calc.test.ts` iterates `WORKED_EXAMPLES` and asserts the engine reproduces every
   `expected` value. The cases a user sees are literally the cases the build enforces.
2. **The app** — a new **"Verified examples"** section on the Reference page (it already has a
   section switcher: `Compounds / Converter / Your protocol`; this adds a fourth), rendering each
   example as *input → draw*, with a short line pointing to `npm test`. Optional reinforcement: each
   row can reuse Part A's `buildDerivation` to show its working.

**Why it differentiates.** No black-box competitor can ship a page listing the exact arithmetic the
product is tested against — they have no such list. This is the "publish the proofs" moat, made
concrete and in-app.

### C3 — One honest line in the footer / Guide

Extend the footer disclaimer (or the explainer's closing scene in `public/explainer.html`) with
`strings.proof.line`: *"Every figure is checked against {count} worked examples, run on every
build."* `{count}` = `WORKED_EXAMPLES.length`, so the number can never drift from reality.

### Tests

- `src/lib/workedExamples.test.ts` (or extend `calc.test.ts`): every example's `expected` matches
  the engine; ids are unique; every `labelKey` exists in all three dictionaries (the existing i18n
  test already covers key parity once the keys are added).
- `ReferencePage.test.tsx`: the new tab exists and renders the examples (same pattern as the existing
  "tabs exist and tools are not rendered twice" assertion).
- `SettingsPage.test.tsx`: the Privacy card renders.

### Effort

Small. Mostly copy + one data list + one reference tab. No new dependency.

---

## Cross-cutting checklist (applies to A, B and C)

- [x] **i18n parity** — every new key is in `en.ts`, `sk.ts` **and** `es.ts`; `i18n.test.ts` passes
      (it fails on missing keys *and* mismatched `{placeholders}`).
- [x] **Type-check** — `npm run typecheck` (strict; `noUnusedLocals`/`noUnusedParameters`) — exit 0.
- [x] **Full suite stays green** — `npm test` (**492 passing / 43 files**, up from 473).
- [x] **Docs** — README "Where to find things" rows; a `HANDOFF.md` section; the **PROPOSALS.md** §F
      rows; this file.
- [x] **No new runtime dependency** — `dependencies` stays `react` + `react-dom`.
- [x] **CSS** — `.derivation*`, `.proof`, `.app-footer__proof` added to `src/styles/global.css`
      using the existing tokens (`--space-*`, `--fs-*`, `--font-mono`), never raw values.

## Suggested sequencing

| # | Milestone | Deliverable | Gate |
| --- | --- | --- | --- |
| 0 | **Foundation** | `src/lib/workedExamples.ts` + tests reading it | engine reproduces every example |
| 1 | **Part A** | `lib/derive.ts`, `Derivation.tsx`, wired into `ResultPanel`, i18n | derive test + ResultPanel test green |
| 2 | **Part B** | `selfCheck` in `calc.ts`, `internalMismatch` warning, i18n | whole existing suite still green |
| 3 | **Part C** | Settings Privacy card, Reference "Verified examples" tab, footer line | reference/settings tests green |
| 4 | **Housekeeping** | README, HANDOFF, PROPOSALS rows | docs match shipped reality |

Milestone 0 first because A and C both consume it, and it is the thing that makes "provable" true.

## What this bundle is NOT (kept deliberately out)

- **Not a new formula or a new workflow.** The maths is unchanged; B only *checks* what already
  exists.
- **Not a live "0 requests" gauge** — it cannot be made truthful, so it is refused (C1).
- **Not a medical claim.** A, B and C make the app **more conservative** (it withholds more, never
  advises more), which is the only direction consistent with the existing disclaimer.
- **Not a reason to add dependencies** — every piece is hand-rolled to match the repo.

## One-line positioning this bundle unlocks

> *"The dose calculator that shows its work, checks itself, and proves it — no account, no cloud,
> nothing leaves your device."*
