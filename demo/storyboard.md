# Storyboard & narration script

For a version with a recorded voice-over (YouTube, Instagram, a clinic waiting-room loop, an
app-store preview). The animation in `explainer.html` is the visual track — the timings below
are its real scene lengths, so a voice can be laid straight over it.

**Master:** 16:9 · 1280 × 720 · 38.4 s · 9 scenes · no on-screen voice, all copy is written.

## Timing map

| # | Start | Length | Scene | On screen |
| --- | --- | --- | --- | --- |
| 1 | 0.0 s | 3.4 s | Title | Vial and syringe sketch themselves, "PepCalculator" is written |
| 2 | 3.4 s | 4.4 s | The problem | Three inputs on the left, a circled "how many units?" on the right |
| 3 | 7.8 s | 5.2 s | The maths | Concentration → volume → units, then a teal underline |
| 4 | 13.0 s | 4.4 s | The answer | "DRAW TO 10 units", syringe fills to 10 % with a dashed target line |
| 5 | 17.4 s | 4.4 s | Today | A card with the compound, the time and the draw, circled |
| 6 | 21.8 s | 4.8 s | Separate stacks | Two labelled boxes of vials, dashed red divider, ✕ "never mixed" |
| 7 | 26.6 s | 4.4 s | Plans & calendar | 5-week grid with dose dots, three ticked outcomes |
| 8 | 31.0 s | 3.6 s | Offline & private | Three ticked lines in circles |
| 9 | 34.6 s | 3.8 s | Close | Framed card, product name, "not medical advice" |

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

- **Pace.** Scene 3 carries the most words (≈5.2 s). If the reader needs more room, lengthen
  that scene's `dur` in `SCENES` — the timeline, the dots and the exported video all follow
  automatically. Nothing else needs editing.
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
- **Stills.** `explainer.html?at=15200` (the "10 units" frame) and `?at=1700` (the title) work
  well as a cover image at 16:9.
