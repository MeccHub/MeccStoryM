import assert from 'node:assert/strict';
const { findBar, readBar, widen } = await import('../assets/js/darknell-hp.js');
// 1000×200 pink frame; a 9px-tall green bar from x=300 filled to x=599 (of 300..799), plus a short green party bar at the left.
const W = 1000, H = 200, d = new Uint8ClampedArray(W * H * 4);
for (let i = 0; i < W * H; i++) d.set([200, 60, 150, 255], i * 4);
const paint = (x0, x1, y0, y1) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) d.set([60, 235, 20, 255], (y * W + x) * 4); };
paint(300, 599, 100, 108); paint(20, 160, 50, 56);
const img = { data: d, width: W, height: H };
const seen = findBar(img);
assert.deepEqual(seen, { x0: 300, x1: 599, y: 104 }, 'finds the boss bar, centre row, not the party bar');
const bar = widen(seen, { x0: 300, x1: 799, y: 104 }); // a later sighting at full HP widens the lock
assert.equal(bar.x1, 799);
assert.equal(readBar(img, bar), 0.6);
assert.equal(widen(bar, { x0: 300, x1: 650, y: 104 }), bar, 'a shorter sighting never shrinks it');
console.log('darknell-hp ok');
