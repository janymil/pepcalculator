# Storyboard & narration script

For a version with a recorded voice-over (YouTube, Instagram, a clinic waiting-room loop, an
app-store preview). The animation in `explainer.html` is the visual track — the timings below
are its real scene lengths, so a voice can be laid straight over it.

**Master:** 16:9 · 1280 × 720 · 54.6 s · 9 scenes · no on-screen voice, all copy is written.

Every scene is **drawing, then hold**. The drawing completes at `t = 1`, so without a hold the
last stroke lands on the scene's final frame and is gone before it can be read — which is exactly
how it looked when the video was first framed inside the app. Each scene therefore sits finished
for `HOLD` (1.8 s) and dips to paper over the last `FADE` (0.32 s), so scenes never hard-cut.
**The table below is printed by `node demo/check.mjs`** — regenerate it from there when a `dur`
or `HOLD` changes, rather than editing it by hand.

## Timing map

| # | Start | Draw | Hold | Scene | On screen |
| --- | --- | --- | --- | --- | --- |
| 1 | 0.0 s | 3.4 s | 1.8 s | Title | Vial and syringe sketch themselves, "PepCalculator" is written |
| 2 | 5.2 s | 4.4 s | 1.8 s | The problem | Three inputs on the left, a circled "how many units?" on the right |
| 3 | 11.4 s | 5.2 s | 1.8 s | The maths | Concentration → volume → units, then a teal underline |
| 4 | 18.4 s | 4.4 s | 1.8 s | The answer | "DRAW TO 10 units", syringe fills to 10 % with a dashed target line |
| 5 | 24.6 s | 4.4 s | 1.8 s | Today | A card with the compound, the time and the draw, circled |
| 6 | 30.8 s | 4.8 s | 1.8 s | Separate stacks | Two labelled boxes of vials, dashed red divider, ✕ "never mixed" |
| 7 | 37.4 s | 4.4 s | 1.8 s | Plans & calendar | 5-week grid with dose dots, three ticked outcomes |
| 8 | 43.6 s | 3.6 s | 1.8 s | Offline & private | Three ticked lines in circles |
| 9 | 49.0 s | 3.8 s | 1.8 s | Close | Framed card, product name, "not medical advice" |

## Narration — English

> **1 · Title**
> This is PepCalculator. You know your dose — it tells you how far to draw.

> **2 · The problem**
> Here's the usual problem. A five-milligram vial, two millilitres of bacteriostatic water, and
> you want two hundred and fifty micrograms. How many units is that?

> **3 · The maths**
> The app does it for you. Five milligrams in two millilitres is two point five milligrams per
> millilitre. Your volume: nought point two five milligrams is nought point one millilitres.
> And on a U-100 syringe, that's ten units.

> **4 · The answer**
> So you draw to ten units — one tenth of a millilitre. No mental arithmetic at the counter.

> **5 · Today**
> Today's doses sit on top, with the time and the exact draw. One tap loads those numbers back
> into the calculator.

> **6 · Separate stacks**
> Stacks stay separate. Your vials and your partner's vials never mix, and each side keeps its
> own history.

> **7 · Plans and calendar**
> Plan a course and see what's left: doses remaining, how many vials to order, and the
> twenty-eight-day use-by date.

> **8 · Offline and private**
> It works with no signal, and nothing ever leaves your device. Backup and syncing happen
> through a code you control.

> **9 · Close**
> Peptides and anabolic oils. This isn't medical advice — it just does the maths. PepCalculator.

## Narration — Slovenčina

> **1 · Titulok**
> Toto je PepCalculator. Dávku poznáte — on vám povie, po koľko natiahnuť.

> **2 · Problém**
> Známy problém. Fľaštička s piatimi miligramami, dva mililitre bakteriostatickej vody a vy
> chcete dvestopäťdesiat mikrogramov. Koľko je to jednotiek?

> **3 · Výpočet**
> Výpočet spraví za vás. Päť miligramov v dvoch mililitroch je dva a pol miligramu na
> mililiter. Váš objem: nula celá dvestopäť miligramu je nula celá jedna mililitra. A na
> U-100 striekačke je to desať jednotiek.

> **4 · Odpoveď**
> Natiahnete teda po desať jednotiek — jednu desatinu mililitra. Žiadne počítanie v hlave.

> **5 · Dnes**
> Dnešné dávky máte navrchu, s časom aj presným počtom jednotiek. Jedným klikom sa čísla
> načítajú späť do kalkulačky.

> **6 · Oddelené zásoby**
> Zásoby zostávajú oddelené. Vaše fľaštičky a fľaštičky partnera sa nikdy nemiešajú a každý má
> vlastnú históriu.

> **7 · Plány a kalendár**
> Naplánujte kúru a vidíte, čo zostáva: počet dávok, koľko fľaštičiek objednať a dvadsaťosem
> dňovú exspiráciu.

> **8 · Offline a v súkromí**
> Funguje bez signálu a nič neopúšťa vaše zariadenie. Záloha a synchronizácia idú cez kód,
> ktorý máte pod kontrolou.

> **9 · Záver**
> Peptidy aj anabolické oleje. Nie je to lekárska rada — robí len výpočet. PepCalculator.

## Production notes

- **Pace.** Every scene ends with the same 1.8 s hold, which is what makes its last stroke
  readable. If one scene still feels rushed, lengthen its `dur` (drawing time) or `HOLD` (all
  scenes at once) in `SCENES` — the timeline, the dots, the clock and the exported video all
  follow automatically. Nothing else needs editing.
- **Music.** Soft, calm, no percussion — the content is medical-adjacent. Duck it under the
  voice, or leave it out.
- **Voice.** Keep it slow and neutral. Never say "inject this amount" — always "draw to", so
  the calculator is clearly a calculation tool, not advice.
- **Disclaimer.** Keep the closing line on screen. The app itself is not medical advice, and
  the video should not look like a prescription.
- **Vertical cut (9:16).** Re-render with `--window-size` and crop to the middle 405 px of the
  canvas; the layout keeps its headings left-of-centre and nothing critical sits in the outer
  eighth of the frame.
- **Localising.** `?lang=sk` / `?lang=es` re-renders the same animation in another language, so
  one export per language is enough — no re-editing.
- **Stills.** `explainer.html?at=4300` (the finished title card) and `?at=22000` (the "10 units"
  frame) work well as a cover image at 16:9. A frame inside a scene's hold is always complete.

## Audio: what is possible

The animation has **no audio track at all** today, including the exported `.webm`. Three routes,
in increasing cost:

| Route | Needs | Can it be exported? | Notes |
| --- | --- | --- | --- |
| **Synthesised music** (WebAudio: oscillators → filter → slow chord pad) | ~60 lines of JS, no files, no licences | **Yes** — the same graph can feed a `MediaStreamAudioDestinationNode` mixed into the `MediaRecorder` | Fully offline and dependency-free, in keeping with the rest of the file. Browser autoplay rules mean it can only start on a click (the Play button is a natural trigger). Taste is the risk: it must stay very soft, and it should be off by default inside the app |
| **Voice-over, browser TTS** (`speechSynthesis`) | The narration in this file, already written in 3 languages | **No** — `speechSynthesis` cannot be routed into WebAudio, so it would be live-only | Zero assets, but the voice, accent and quality are whatever the device offers; it also cannot be scrubbed with the timeline |
| **Voice-over, a real recording** | A human reading the script below, plus one audio file per language (~1–3 MB, committed) | **Yes** — decoded into an `AudioBuffer`, started with the timeline, and mixed into the recorder | The only route that sounds professional, and the only one right for YouTube/social. The script is already timed to the scene table above |

Until one of those is chosen, the file stays deliberately silent, and the written copy in the
video stands on its own — which is also why it works as a looping clinic-waiting-room clip.
