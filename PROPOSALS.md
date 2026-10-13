# Proposals — every one, and what actually happened to it

**Why this file exists.** Proposals in this repo have lived in `HANDOFF.md` (a numbered roadmap),
in `PROPOSAL-glp1-companion.md`, and in the "still open" notes written after each round. That made
it genuinely hard to answer a fair question: *"you suggested things — where are they?"* This is the
single list. It is updated in the same commit that changes an item's status, and every "shipped"
line names the code rather than a promise.

| Status | Meaning |
| --- | --- |
| **Shipped** | In the app, tested, and reachable by a user — with the file that carries it |
| **Refused** | Decided against, with the reason. Not an oversight |
| **Open** | Agreed, not built yet, with what it would take |
| **Waiting on you** | Needs a decision, a device or a printer this machine does not have |

---

## A · The numbered roadmap (`HANDOFF.md` → "Open items / roadmap")

| # | Item | Status | Where it is / why not |
| --- | --- | --- | --- |
| 1 | **Conflict awareness** — surface "changed on another device" instead of silent last-write-wins | **Shipped** | `mergeWithConflicts` in `src/lib/sync.ts`; Settings reports how many edits were resolved newest-wins |
| 2 | **Server hardening** — rate limiting, `ALLOWED_ORIGIN` locked, request logs | **Shipped** | `server/guard.mjs` + `createSyncServer()` in `server/server.mjs`: 403 for a foreign origin, 429 + `Retry-After`, one redacted log line per call. 27 tests (14 unit + 13 over real HTTP) |
| 3 | **Deploy** — Dockerfile, host config, static app anywhere | **Shipped, unbuilt here** | `Dockerfile`, `.dockerignore`, `docker-compose.yml`. **No Docker on this machine**, so the image is written and reviewed, never built |
| 4 | **True background reminders** — fire while the app is closed | **Shipped** | Web Push: `server/push.mjs` (scheduler) + `server/webpush.mjs` (lazy `web-push`) + `src/lib/push.ts` + `src/hooks/usePushReminders.ts` + a `push` handler in `public/sw.js`. The client uploads its upcoming doses as a pre-rendered queue; the server delivers them with the app closed. VAPID keys via `npm run vapid`. Tested (pure + HTTP) but **not run against a live push service here** |
| 5 | **IU dose unit** — HGH/HCG/insulin | **Shipped** | `DoseUnit 'IU'` + base-unit families in `src/lib/calc.ts`; HGH/HCG is its own workflow; no `v2` migration was needed |
| 6 | **Pen devices / GLP-1** — clicks, plus titration phases | **Shipped** | `MeasureSystem 'clicks'`, `DEFAULT_CLICKS_PER_ML`, `DosePhase[]` in `src/lib/schedule.ts` — drawn on the card, in the supply outlook and on the printed sheet |
| 7 | **Multi-compound plans** — draw two compounds in one session | **Shipped** | `src/lib/session.ts` — `groupSessions` / `nextSession`; the Today card says "Also at this time", the check card lists every bottle |
| 8 | **Plot the user's own protocol** | **Shipped** | `PkChart` extracted from the Reference page; `ProtocolPlot` draws the user's own plan and refuses — with a reason — when a half-life, cadence or mg dose is missing |
| 9 | **Readability mode** — bigger type, non-colour marker | **Shipped** | Settings toggle; `vialPatternAngle` stripes on every vial dot |
| 10 | **Draw-mode check card** | **Shipped** | `components/DrawCheck.tsx`, plus its `also` list for a two-vial sitting |
| 11 | **Unit converter** | **Shipped** | `src/lib/convert.ts` and the Converter tab. **No IU row, deliberately** — there is no honest mg↔IU factor |
| 12 | **QR code for sync pairing** | **Refused, with a reason** | See section D: a symbol the app cannot read is not pairing |
| 13 | **Supabase + RLS instead of recovery codes** | **Refused** | Only if real accounts are wanted one day; recovery-code sync was chosen deliberately (no email, no password, no recovery) |

## B · The GLP-1 companion (`PROPOSAL-glp1-companion.md`)

| Item | Status | Where it is / why not |
| --- | --- | --- |
| Phase 1 — pen routine + pre-use checks | **Shipped** | The GLP-1 page (`components/Glp1Page.tsx`), plus `PrintSheet`'s printed checklist |
| Phase 2 — body measurements + trend | **Shipped** | `src/lib/measure.ts`, `pepcalc.v1.measurements`, with "where and how" for every point |
| Phase 3 — prescriber questions | **Shipped** | The GLP-1 page's last section, × 3 languages |
| Phase 4 — a "general principles" card (training, nutrition) | **Refused** | The app's whole claim is "not medical advice, it only does the maths". The proposal's own conditions stand: a clinician's name on the content and a lawyer's eye on the wording first, and kept out of print and export |
| `route` field (reconstituted vial vs prescribed pen) | **Shipped** | `CompoundRoute` in `src/lib/reference.ts` + `rangeAppliesTo()`, which now *refuses* to compare a vial range against a pen dose; the Reference card shows the route |
| Does `semaglutide` stay in `reference.ts`? | **Waiting on you** | Kept: removing the row would stop `matchCompound` matching existing vials named after it, taking their half-life plot with them. It comes out only if you say so |
| Routine + checks on the printed sheet | **Shipped** | `PrintSheet` prints the checklist and the routine for the device in use, and only when a GLP-1 vial has a plan |
| A link from a GLP-1 vial card to the page | **Shipped** | "How to use it safely", outside the collapsed detail — a link behind a tap is a link nobody finds |
| Brands, anywhere | **Refused** | Molecules only: the UI, the data, the docs and the video |

## C · Round notes that were left open

| Item | Status | Where it is / why not |
| --- | --- | --- |
| A backup exported only the person on screen | **Shipped** | `SavedVials` now takes `allVials` / `allMeasurements`, and the card says what a backup contains |
| The explainer did not show newer features | **Shipped** | Scenes 9–11 added: IU + pens, step-up plans, and a six-line list of the rest. 12 scenes / 75.6 s / 28 keys × 3 languages |
| Audio for the explainer | **Refused** | Asked and answered: it stays silent on purpose, so it works muted, in three languages, as a waiting-room loop |
| Measurement sync | **Shipped** | `SyncPayload.measurements` is an *optional* field, merged with `mergeMeasurements` on the vials' rule (union by id, newest wins, removals as tombstones). Optional on both ends on purpose: an older record has no log, which merges as "nothing to add", never as a deletion. Verified end-to-end against a live server |
| Verify the printed sheet by actually printing it | **Waiting on you** | `@media print` can only be confirmed at a printer. Rendering it to PDF here gave a 2-page sheet (protocol + labels, then the GLP-1 checklist) — as far as this machine goes |

## G · Shared vials — one bottle, one plan per person

**What.** A household draws from one bottle. Two people, one vial: the powder, the water,
the strength and the use-by date are the same for everybody, but the dose and the days need
not be. Asked for by the user, who was right about both halves of the gap: the second person
could not even *see* the vial, and "how much is left" only ever subtracted one person's doses.

| Item | Status | Where it is |
| --- | --- | --- |
| The model: one bottle, a plan per person | **Shipped** | `SavedVial.shares: VialShare[]` in `src/lib/shares.ts` — `{ ownerId, from, doseAmount?, doseUnit?, schedule? }`. Absent on every record saved before this, so nothing regresses |
| "Shared from *when*" | **Shipped** | `VialShare.from`. A share is a time-bounded claim, not a property of the bottle — the user's own case (alone for four injections, then joined) is the reason it exists. Clamped so a share can never predate the mix date |
| Ask at save time, and edit later | **Shipped** | `components/ShareForm.tsx`, used by both `SaveVialForm` (save the numbers in the calculator) and `VialEditor` (join a bottle already in use) |
| The owner writes the sharer's plan | **Shipped** | "Same plan as mine" stores *only* the start date, so a later change to the owner's plan carries the sharer. Untick it and the owner fills in their dose and cadence |
| The vial appears in her stack | **Shipped** | `filterByParticipant` in `src/lib/owners.ts`; the card says "Shared with …", and only the bottle's owner gets Edit/Delete |
| "Koľko vo vial zostalo" is finally right | **Shipped** | `usedBase` / `runOutDate` / `extraVialsFor` in `src/lib/supply.ts` sum **every** participant's draws. `remainingBase` is one number for the bottle; `dosesLeft` is per person |
| Her dose and cadence, everywhere | **Shipped** | `viewVial(vial, viewerId)` resolves *whose* plan is in force once, so Today, Calendar, Supply, the printed sheet and the vial card are right for that person without knowing about shares |
| A person who only shares is not deletable | **Shipped** | `countVialsForOwner` counts shares; `ownersFromVials` creates a sharer the device has not met, so a backup or sync never orphans one |
| Sharer sets her *own* plan from her tab | **Open** | Asked for, then withdrawn in favour of "the owner writes it" (her tab is read-only). Additive whenever it is wanted: the same `VialShare` object plus a write path — no migration |
| Reminders for a shared bottle | **Open** | `useDoseReminders` still runs off every person's vials, so a sharer's own cadence does not drive the timer. Device-level notifications, and out of scope here |
| Splitting the vial's cost between people | **Open** | `cost.ts` still prices the bottle once. Honest, but a household would like to see their half |
| A "shared until" date | **Open** | With no injection log anywhere, removing a share rewrites past consumption. One more optional field would make history stable |
| The Reference page's protocol plot | **Open** | `ReferencePage` is handed *every* person's vials, so a shared bottle plots at its owner's dose. Pre-existing — that page was never person-scoped — and left alone rather than half-fixed |


## D · What was refused, and the reasoning

- **A brand → clicks/mg table.** It contradicts a documented decision (`0e7d37c`): dial resolution
  is an input (`DEFAULT_CLICKS_PER_ML`). A brand table is a table that goes stale, and going stale
  here means a wrong dose.
- **A QR code for pairing** (roadmap 12) — **refused at first, then shipped, for a better reason than it
  was refused.** The original objection was real: the app has no scanner, and `BarcodeDetector` is
  Chromium-only, so a symbol we drew could not be read back on Safari or Firefox. The way out was to
  stop treating the QR as data the app reads: it holds a **URL**, so the **phone's own camera app**
  scans it and opens the link. No in-app scanner, no camera permission, works on iOS and Android. The
  encoder is hand-rolled (`src/lib/qr.ts`) and verified by decoding its own output with a real decoder
  (`jsqr`, a dev-only dependency) in `qr.test.ts` — the "trusting it" half that was missing before.
  The remaining cost is honest and stated in the UI: a QR of the sync code makes the secret *visible*,
  so it lives only in the URL hash (never sent to a server) and is cleared the moment the page reads it.
- **Automated training/diet guidance** (GLP-1 Phase 4). Questions to a prescriber instead.
- **Manual "I took a dose" logging.** Rejected by the user as unrealistic; adherence is derived from
  the schedule, so there is nothing to log after injecting.

## E · Open, honestly

| Item | What it would take |
| --- | --- |
| `semaglutide` | One word from you: keep, or remove |
| Printing on paper | A printer |

## F · The trust bundle (`PROPOSAL-trust-bundle.md`)

The differentiator is **trust**, not offline — the app never asks you to take a number on faith.
One proposal, three shipped parts, all pure-logic + three languages + no new dependency.

| Item | Status | Where it is / why not |
| --- | --- | --- |
| **A — Show the maths** | **Shipped** | `src/lib/derive.ts` (`buildDerivation`, steps as data) + `components/Derivation.tsx`, wired into `ResultPanel` via `App.tsx`. Renders the arithmetic with the user's own numbers under the result; empty when the answer is withheld |
| **B — Two routes, or it refuses** | **Shipped** | `computeSelfCheck` + `selfCheckAgrees` in `src/lib/calc.ts`; `CalcResult.selfCheck: 'ok' \| 'mismatch' \| 'skipped'`; new `WarningCode 'internalMismatch'` withholds a mismatched answer. An oil/pen has one honest route, so it is honestly `'skipped'` rather than faking a second |
| **C — Provable privacy** | **Shipped** | `src/lib/workedExamples.ts` (one list read by the tests **and** the Reference "Verified examples" tab); footer proof line (`{count}` = the list length); Settings → *Privacy* card. A live "0 requests" gauge was **refused** — it cannot be made truthful |
| Verified examples as a **live** gauge of requests | **Refused** | A counter cannot see service-worker or same-origin traffic, so it would lie. The worked-examples page is the honest proof instead |
