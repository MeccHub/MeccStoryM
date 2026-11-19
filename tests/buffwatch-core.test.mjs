// node tests/buffwatch-core.test.mjs
import assert from 'node:assert/strict';
import { toGray, prepBoth, prepFrame, find, calibrate, step } from '../assets/js/buffwatch-core.js';

// Noise background 200×60 with a distinctive 24×24 icon pasted at (130, 20).
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const W = 200, H = 60, icon = { g: new Float32Array(24 * 24).map((_, i) => ((i % 24) ^ (i / 24 | 0)) * 9 % 255), w: 24, h: 24 };
const frame = (withIcon, ox = 130, oy = 20) => {
  const g = new Float32Array(W * H).map(() => rnd() * 255);
  if (withIcon) for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) g[(oy + y) * W + ox + x] = icon.g[y * 24 + x];
  return { g, w: W, h: H };
};
const T = prepBoth(icon);
const on = frame(true), hit = find(prepFrame(on), T, null);
assert.ok(hit.score > 0.99 && hit.x === 130 && hit.y === 20, `found at ${hit.x},${hit.y} score ${hit.score}`);
const odd = frame(true, 131, 21), oddHit = find(prepFrame(odd), T, null);
assert.ok(oddHit.x === 131 && oddHit.y === 21 && oddHit.score > 0.99, 'odd offsets still found');
const moved = frame(true, 133, 22), near = find(prepFrame(moved), T, { x: 130, y: 20 });
assert.ok(near.x === 133 && near.y === 22 && near.score > 0.99, 'nearby search follows a shifted icon');
const off = frame(false), miss = find(prepFrame(off), T, { x: 130, y: 20 });
assert.ok(miss.score < 0.5, `absent score ${miss.score}`);

const g = toGray({ data: new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 255]), width: 2, height: 1 });
assert.ok(Math.abs(g.g[0] - 76.245) < 0.01 && Math.abs(g.g[1] - 29.07) < 0.01);

const c = calibrate(Array(36).fill(0).map((_, i) => 0.93 + i * 0.001), Array(36).fill(0).map((_, i) => 0.4 + i * 0.003));
assert.equal(c.quality, 'Excellent'); assert.equal(c.debounce, 2); assert.ok(c.threshold > 0.6 && c.threshold < 0.93);
assert.equal(calibrate([0.6, 0.6], [0.7, 0.7]).quality, 'Poor / overlapping');

const s = { on: true }, cfg = { debounce: 3, grace: 250 };
assert.equal(step(s, false, 0, cfg), false); assert.equal(step(s, false, 100, cfg), false);
assert.equal(step(s, false, 200, cfg), false, 'debounce met but grace not');
assert.equal(step(s, false, 300, cfg), true); assert.equal(s.on, false);
assert.equal(step(s, true, 400, cfg), false); assert.equal(step(s, false, 500, cfg), false, 'flicker resets streak');
console.log('buffwatch-core ok');

const { timerAlerts } = await import('../assets/js/buffwatch-core.js');
const ds = { name: 'DS', mode: 'cooldown', duration: 15, cooldown: 30 }, t1 = {};
assert.deepEqual(timerAlerts(ds, t1, true, 'on', 0), []);
assert.deepEqual(timerAlerts(ds, t1, false, 'off', 15000), [], 'cooldown mode is quiet when it ends');
assert.deepEqual(timerAlerts(ds, t1, false, null, 29900), []);
assert.deepEqual(timerAlerts(ds, t1, false, null, 30000), ['DS ready']);
assert.deepEqual(timerAlerts(ds, t1, false, null, 31000), [], 'ready said once');
const ft = { name: 'Fair Trade', mode: 'keep', repeat: 10 }, t2 = {};
assert.deepEqual(timerAlerts(ft, t2, false, null, 100000), ['Fair Trade missing']);
assert.deepEqual(timerAlerts(ft, t2, false, null, 105000), []);
assert.deepEqual(timerAlerts(ft, t2, false, null, 110000), ['Fair Trade missing'], 'nags every repeat s');
assert.deepEqual(timerAlerts(ft, t2, true, 'on', 111000), []);
assert.deepEqual(timerAlerts(ft, t2, false, 'off', 112000), ['Fair Trade missing'], 'nags again right away after a fresh drop');
assert.deepEqual(timerAlerts({ name: 'Seal', mode: 'appear' }, {}, true, 'on', 0), ['Seal']);
assert.deepEqual(timerAlerts({ name: 'HS', mode: 'off' }, {}, false, 'off', 0), ['HS off']);
console.log('timerAlerts ok');

const { detectIcons, iconCrop } = await import('../assets/js/buffwatch-core.js');
// Grey bar 400×110 with two rows of 40px colourful icons every 48px, one gap in row 2.
const BW = 400, BH = 110, bar = new Uint8ClampedArray(BW * BH * 4).map((_, i) => (i % 4 === 3 ? 255 : 90));
const paint = (ox, oy, hue) => { for (let y = 0; y < 40; y++) for (let x = 0; x < 40; x++) { const i = ((oy + y) * BW + ox + x) * 4; bar[i] = (hue * 50 + x * 3) % 256; bar[i + 1] = 30; bar[i + 2] = 200 - y * 2; } };
for (let k = 0; k < 7; k++) paint(10 + k * 48, 8, k);
for (const k of [0, 1, 3, 4, 5]) paint(10 + k * 48, 60, k + 7);
const cells = detectIcons({ data: bar, width: BW, height: BH });
assert.equal(cells.length, 12, `found ${cells.length} icons`);
assert.ok(cells.every(c => Math.abs((c.x - 10) % 48) <= 4 || Math.abs((c.x - 10) % 48 - 48) <= 4), 'cells snap onto icons');
assert.ok(cells.every(c => c.w >= 36 && c.w <= 44), 'icon size from spacing');
const cr = iconCrop(cells[0]); assert.ok(cr.w < cells[0].w && cr.h < cells[0].w);
console.log('detectIcons ok');
// Same bar inside a 1920-wide top strip (the default area): 3 icons in one row must still be found.
const SW = 1920, strip = new Uint8ClampedArray(SW * BH * 4).map((_, i) => (i % 4 === 3 ? 255 : 90));
for (let k = 0; k < 3; k++) for (let y = 0; y < 40; y++) for (let x = 0; x < 40; x++) { const i = ((8 + y) * SW + 700 + k * 48 + x) * 4; strip[i] = (k * 50 + x * 3) % 256; strip[i + 1] = 30; strip[i + 2] = 200 - y * 2; }
const wide = detectIcons({ data: strip, width: SW, height: BH });
assert.equal(wide.length, 3, `found ${wide.length} icons in a wide strip`);
console.log('detectIcons wide ok');
