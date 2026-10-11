/**
 * Checks demo/explainer.html without a browser.
 *
 * The explainer draws every frame with plain canvas code, so a small stub
 * context is enough to run it in Node and catch the two things that actually
 * break it:
 *
 *   1. a scene that throws while drawing, and
 *   2. a translation key that is used but missing from en/sk/es.
 *
 * Run with:  node demo/check.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dir = dirname(fileURLToPath(import.meta.url));
// The explainer lives in `public/` because the app serves it at `/explainer.html`
// for the "How to use" tab. One copy, so it can never drift from what users see.
const html = readFileSync(join(dir, '..', 'public', 'explainer.html'), 'utf8');
const match = html.match(/<script>([\s\S]*)<\/script>/);
if (!match) {
  console.error('FAIL: no <script> block found in explainer.html');
  process.exit(1);
}
const source = match[1];

/** A canvas 2D context that accepts every call and measures any text. */
const stubContext = new Proxy(
  {},
  {
    get(_target, prop) {
      if (prop === 'measureText') return () => ({ width: 42 });
      return () => {};
    },
    set() {
      return true;
    },
  },
);

const elements = new Map();
function makeElement(id) {
  if (!elements.has(id)) {
    elements.set(id, {
      id,
      textContent: '',
      value: '',
      disabled: false,
      classList: { toggle() {}, add() {}, remove() {} },
      addEventListener() {},
      getContext: () => stubContext,
      captureStream: () => ({}),
    });
  }
  return elements.get(id);
}

globalThis.document = {
  getElementById: makeElement,
  createElement: () => ({ click() {} }),
  addEventListener() {},
  hidden: false,
  documentElement: { classList: { toggle() {}, add() {}, remove() {} } },
};
globalThis.location = { search: '' };
globalThis.requestAnimationFrame = () => 0;
globalThis.window = globalThis;

const probe = `
  const failures = [];

  SCENES.forEach((scene, index) => {
    for (let step = 0; step <= 10; step++) {
      try {
        scene.draw(ctx, step / 10);
      } catch (err) {
        failures.push('scene ' + (index + 1) + ' at ' + step * 10 + '% threw: ' + err.message);
      }
    }
  });

  const total = SCENES.reduce((sum, scene) => sum + scene.dur, 0);
  try {
    render(Math.floor(total / 2));
  } catch (err) {
    failures.push('render() threw: ' + err.message);
  }

  const used = new Set();
  for (const hit of __SOURCE__.matchAll(/\\btr\\('([a-z0-9_]+)'\\)/g)) used.add(hit[1]);
  const langs = Object.keys(LANGS);
  const missing = [];
  used.forEach((key) => {
    langs.forEach((code) => {
      if (!LANGS[code][key]) missing.push(code + '.' + key);
    });
  });
  if (missing.length) failures.push('missing copy: ' + missing.join(', '));

  /*
   * Timeline accounting. elapsed IS the whole animation, so the two ways it can
   * go wrong are worth pinning down here rather than noticing them on a phone:
   *
   *   1. a normal frame rate must advance it at real time, and
   *   2. a stalled frame loop (a throttled offscreen iframe is the normal case,
   *      since the app frames this page) must NOT hand it the whole gap at once.
   */
  elapsed = 0;
  setPlaying(true);
  let simNow = 0;
  frame(simNow);
  for (let i = 0; i < 60; i++) {
    simNow += 16.7;
    frame(simNow);
  }
  const afterOneSecond = elapsed;
  if (Math.abs(afterOneSecond - 1000) > 40) {
    failures.push(
      '60 frames of 16.7 ms advanced the timeline by ' +
        Math.round(afterOneSecond) +
        ' ms instead of ~1000 ms',
    );
  }

  const beforeStall = elapsed;
  simNow += 5000;
  frame(simNow);
  const jumped = elapsed - beforeStall;
  if (jumped > MAX_STEP) {
    failures.push(
      'a 5 s stall jumped the timeline forward by ' +
        Math.round(jumped) +
        ' ms (max ' + MAX_STEP + ') — scenes would flash past',
    );
  }
  setPlaying(false);

  console.log('scenes:      ' + SCENES.length + ' (' + (total / 1000).toFixed(1) + 's)');
  console.log('copy keys:   ' + used.size + ' used x ' + langs.length + ' languages');
  console.log('frames:      ' + SCENES.length * 11 + ' drawn');
  console.log(
    'timeline:    1 s at 60 fps -> ' +
      Math.round(afterOneSecond) +
      ' ms; a 5 s stall -> +' +
      Math.round(jumped) +
      ' ms',
  );
  return failures;
`;

let failures;
try {
  failures = new Function('__SOURCE__', source + probe)(source);
} catch (err) {
  console.error('FAIL: the explainer script threw on load');
  console.error('  ' + err.message);
  process.exit(1);
}

if (failures.length) {
  console.error('FAIL');
  failures.forEach((failure) => console.error('  - ' + failure));
  process.exit(1);
}

console.log('OK');
