// node tests/buffwatch-core.test.mjs
import assert from 'node:assert/strict';
import { toGray, integrals, prepTemplate, find, calibrate, step } from '../assets/js/buffwatch-core.js';

// Noise background 200×60 with a distinctive 24×24 icon pasted at (130, 20).
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const W = 200, H = 60, icon = { g: new Float32Array(24 * 24).map((_, i) => ((i % 24) ^ (i / 24 | 0)) * 9 % 255), w: 24, h: 24 };
const frame = (withIcon, ox = 130, oy = 20) => {
  const g = new Float32Array(W * H).map(() => rnd() * 255);
  if (withIcon) for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) g[(oy + y) * W + ox + x] = icon.g[y * 24 + x];
  return { g, w: W, h: H };
};
const T = prepTemplate(icon);
const on = frame(true), hit = find(on, integrals(on), T, null);
assert.ok(hit.score > 0.99 && hit.x === 130 && hit.y === 20, `found at ${hit.x},${hit.y} score ${hit.score}`);
const moved = frame(true, 133, 22), near = find(moved, integrals(moved), T, { x: 130, y: 20 });
assert.ok(near.x === 133 && near.y === 22 && near.score > 0.99, 'nearby search follows a shifted icon');
const off = frame(false), miss = find(off, integrals(off), T, { x: 130, y: 20 });
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
