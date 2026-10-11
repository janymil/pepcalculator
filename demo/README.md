# Hand-drawn explainer

`public/explainer.html` is a self-contained, hand-drawn ("kreslené") animation that shows what
PepCalculator does: **~55 seconds, 9 scenes, in English, Slovak and Spanish**.

It lives in `public/` because Vite copies that folder to the site root, so the app serves the
file at `/explainer.html` and its **Guide** page frames it. `demo/` holds the tooling —
the checker and the storyboard — and points at it there.

One file, **no dependencies, no build step, no assets** — open it in a browser:

```
start public\explainer.html
```

Everything on screen is drawn with canvas code (`strokeSketch`, `drawText`), which is why the
lines look pen-drawn and appear one stroke at a time.

## Getting an actual video file

Three ways, best first:

1. **Built-in export.** Press **Export video (.webm)** — the page records its own canvas
   (`canvas.captureStream()` + `MediaRecorder`) and downloads
   `pepcalculator-explainer-<lang>.webm`. Recording runs in real time, so it takes ~55 s.
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
| 1× / 0.5× | Playback speed. Half speed holds each scene twice as long — the scenes are dense and a phone screen is small. The clock and the slider keep showing real timeline milliseconds, and **export always records at 1×** |
| Timeline slider | Scrub to any moment |
| EN / SK / ES | Switch the on-screen copy |
| Export video (.webm) | Record the whole animation to a file |

## Deep links (for stills and cover images)

| URL | Result |
| --- | --- |
| `explainer.html?lang=sk` | Start in Slovak |
| `explainer.html?at=15200` | Jump to 15.2 s and hold that frame |
| `explainer.html?embed=1` | Tidy mode for framing: no heading, no note, transparent background, and its own language is left to the app |

`?at=` is how a cover/thumbnail can be generated without a video editor. `?embed=1` is what the
app's **Guide** page uses; it only hides the chrome around the stage, so the video is identical.

## How it works

- `strokeSketch()` reveals a polyline up to a `progress` value and adds **deterministic**
  wobble (`rnd(seed)`), so a line looks hand-drawn but never shimmers from frame to frame.
- `drawText()` "writes" text by clipping a window that grows left→right.
- Each scene is `{ dur, draw(ctx, t) }`, where `t` runs 0→1. Because drawing is a pure
  function of time, scrubbing is free and the same renderer both plays on screen and gets
  recorded.
- **Every scene holds its finished frame.** Each scene's drawing completes at exactly `t = 1`,
  so a scene that ends when its drawing ends shows its last stroke on its final frame and
  nothing more — inside the app that is what made the whole video feel rushed. Each scene
  therefore sits finished for `HOLD` (1.8 s) and dips to paper over the last `FADE` (0.32 s)
  instead of hard-cutting, and the last scene never fades because it is the frame the video
  ends on. `sceneAt()` pins `t` at 1 through the hold, so the scenes themselves know nothing
  about it. To retime the video, change `dur` or `HOLD` — the timeline, the dots, the clock,
  the exported file and `demo/storyboard.md`'s table all follow.
- **The frame clock is capped.** `frame(now)` advances the timeline by the real gap between
  frames, but never by more than `MAX_STEP` (100 ms), and it re-arms whenever playback
  starts. A browser may stop calling `requestAnimationFrame` for a while — a background tab,
  or an **offscreen iframe, which is exactly what this page is inside the app's Guide tab** —
  and wall-clock time keeps running through that gap. Uncapped, the whole gap was handed to
  the timeline in one step, so the video skipped forward through entire scenes instead of
  dropping a frame. A hidden page now pauses and resumes where it was. This is checked (see
  below), because it is invisible on a desktop and obvious on a phone.

## Checking it

```
node demo\check.mjs
```

Runs the explainer against a stub canvas: draws **every scene at 11 progress points**, renders
a mid-timeline frame, verifies every `tr('…')` key exists in all three languages, and
**simulates the frame loop** — one second of 60 fps frames must advance the timeline ~1000 ms,
and a 5-second stall of the frame loop must advance it by no more than `MAX_STEP`. Exits
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
