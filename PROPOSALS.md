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
| 4 | **True background reminders** — fire while the app is closed | **Open** | Needs Web Push plus a subscription store on the server. The current timer is honest about firing only while the page is alive |
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

## D · What was refused, and the reasoning

- **A brand → clicks/mg table.** It contradicts a documented decision (`0e7d37c`): dial resolution
  is an input (`DEFAULT_CLICKS_PER_ML`). A brand table is a table that goes stale, and going stale
  here means a wrong dose.
- **A QR code for pairing** (roadmap 12). The original note said a hand-rolled encoder could not be
  verified without a decoder. That half is now surmountable — published ISO/IEC 18004 vectors can be
  fetched and checked, and could verify an encoder. It is refused for a **better** reason: **the app
  has no scanner.** `BarcodeDetector` exists in Chromium only, so on Safari and Firefox a symbol we
  draw could not be read back by the app at all; the user would need a third-party scanner, which
  merely displays the code to type by hand. And a QR of the sync code makes a secret *more* visible
  (shoulder-surfing a screen), not less. The honest fix for "typing the code is rough" is the
  affordance that already exists: copy the code, or restore from a file backup. If QR ever comes
  back, the shape is **scan-first** on a Chromium device — a pairing payload, `BarcodeDetector`, and
  a typed fallback — never a symbol nobody can read.
- **Automated training/diet guidance** (GLP-1 Phase 4). Questions to a prescriber instead.
- **Manual "I took a dose" logging.** Rejected by the user as unrealistic; adherence is derived from
  the schedule, so there is nothing to log after injecting.

## E · Open, honestly

| Item | What it would take |
| --- | --- |
| True background reminders (roadmap 4) | Bigger than it looks: the server would have to own the **schedule** to know when to push (a dose time is plan + the user's timezone, and today that logic is pure client-side in `lib/schedule.ts`). Plus a Web Push subscription store, VAPID keys and a `push` handler in `sw.js`. **Unverifiable here** anyway: it needs a real push service and a real device |
| `semaglutide` | One word from you: keep, or remove |
| Printing on paper | A printer |
