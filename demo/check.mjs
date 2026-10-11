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
const html = readFileSync(join(dir, 'explainer.html'), 'utf8');
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

  console.log('scenes:      ' + SCENES.length + ' (' + (total / 1000).toFixed(1) + 's)');
  console.log('copy keys:   ' + used.size + ' used x ' + langs.length + ' languages');
  console.log('frames:      ' + SCENES.length * 11 + ' drawn');
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
