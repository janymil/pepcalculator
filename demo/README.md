# Hand-drawn explainer

`explainer.html` is a self-contained, hand-drawn ("kreslené") animation that shows what
PepCalculator does: **~38 seconds, 9 scenes, in English, Slovak and Spanish**.

One file, **no dependencies, no build step, no assets** — open it in a browser:

```
start demo\explainer.html
```

Everything on screen is drawn with canvas code (`strokeSketch`, `drawText`), which is why the
lines look pen-drawn and appear one stroke at a time.

## Getting an actual video file

Three ways, best first:

1. **Built-in export.** Press **Export video (.webm)** — the page records its own canvas
   (`canvas.captureStream()` + `MediaRecorder`) and downloads
   `pepcalculator-explainer-<lang>.webm`. Recording runs in real time, so it takes ~38 s.
   Works in Chrome, Edge and Firefox.
2. **Screen recording.** Press **Play**, then record the window with Xbox Game Bar (`Win+G`),
   OBS, or your phone. Press `F11` first for a clean full-screen capture. This gives you MP4
   directly.
3. **Convert the `.webm`** to `.mp4` (HandBrake, VLC, CloudConvert) if a platform insists on
   MP4 — WhatsApp, Instagram, some ad networks.

## Controls

| Control | What it does |
| --- | --- |
| Play / Pause | Play the animation |
| Restart | Back to the first frame |
| Timeline slider | Scrub to any moment |
| EN / SK / ES | Switch the on-screen copy |
| Export video (.webm) | Record the whole animation to a file |

## Deep links (for stills and cover images)

| URL | Result |
| --- | --- |
| `explainer.html?lang=sk` | Start in Slovak |
| `explainer.html?at=15200` | Jump to 15.2 s and hold that frame |

`?at=` is how a cover/thumbnail can be generated without a video editor.

## How it works

- `strokeSketch()` reveals a polyline up to a `progress` value and adds **deterministic**
  wobble (`rnd(seed)`), so a line looks hand-drawn but never shimmers from frame to frame.
- `drawText()` "writes" text by clipping a window that grows left→right.
- Each scene is `{ dur, draw(ctx, t) }`, where `t` runs 0→1. Because drawing is a pure
  function of time, scrubbing is free and the same renderer both plays on screen and gets
  recorded.

## Checking it

```
node demo\check.mjs
```

Runs the explainer against a stub canvas: draws **every scene at 11 progress points**, renders
a mid-timeline frame, and verifies every `tr('…')` key exists in all three languages. Exits
non-zero on failure.

## Adding or changing a scene

1. Add the copy to the `en`, `sk` **and** `es` objects in `LANGS` — all three are required.
2. Push a scene onto `SCENES`:

```js
SCENES.push({
  dur: 4000,                        // milliseconds
  draw(ctx, t) {                    // t goes 0 -> 1
    drawText(ctx, tr('my_key'), 640, 300, {
      size: 48,
      align: 'center',
      progress: seg(t, 0, 0.4),
    });
  },
});
```

3. Run `node demo\check.mjs` — it reports a missing key or a scene that throws.

> **Naming note:** inside a scene `t` is the *progress* value, so the translation helper is
> called `tr()` on purpose — it cannot be shadowed by that parameter. (This was a real bug:
> `draw(ctx, t)` silently shadowed `t()` and every text label vanished.)

## Long-form voice-over version

See [storyboard.md](./storyboard.md) for a scene-by-scene narration script in English and
Slovak, with timings — the animation can be used as-is under a recorded voice-over.
