// Trade Station capture core: splits a boxed item list into cards and reads prices with digit templates.
// Works on RGBA ImageData-like {data, width, height}; boxes are {x, y, w, h} in those pixels.

const lum = (d, i) => (d[i] + d[i + 1] + d[i + 2]) / 3;

/** Runs of consecutive indices in [0, n) where f(i) is true, as [start, end]. */
const runs = (n, f) => {
  const o = []; let s = -1;
  for (let i = 0; i <= n; i++) { const v = i < n && f(i); if (v && s < 0) s = i; if (!v && s >= 0) { o.push([s, i - 1]); s = -1; } }
  return o;
};

/** Item cards inside the names box: white rows separated by the grey gaps. Returns [{y0, y1}] in image pixels, fully inside the box. */
export function cards({ data, width: W }, box) {
  // "White" is relative to the brightest pixel: captures are often a little dimmer or tinted than a screenshot.
  let top = 0;
  for (let y = 0; y < box.h; y++) for (let x = 0; x < box.w; x += 4) top = Math.max(top, lum(data, ((box.y + y) * W + box.x + x) * 4));
  const white = y => { let n = 0; for (let x = 0; x < box.w; x++) if (lum(data, ((box.y + y) * W + box.x + x) * 4) > top - 12) n++; return n > box.w * 0.5; };
  const all = runs(box.h, white).filter(([a, b]) => a > 0 && b < box.h - 1 && b - a > 20);
  // Cards clipped by the list's scroll edge are shorter than the rest: drop them.
  const hs = all.map(([a, b]) => b - a).sort((p, q) => p - q), full = hs[hs.length - 1] || 0;
  return all.filter(([a, b]) => b - a >= full * 0.9).map(([a, b]) => ({ y0: box.y + a, y1: box.y + b }));
}

/** Text lines and glyphs of dark text in a box. Each glyph gets a 10×16 shape vector plus its size/position in the line. */
export function glyphLines({ data, width: W }, box, dark = 150) {
  const on = (x, y) => lum(data, (y * W + x) * 4) < dark;
  const rows = runs(box.h, y => { for (let x = 0; x < box.w; x++) if (on(box.x + x, box.y + y)) return true; return false; }).filter(([a, b]) => b - a > 6);
  return rows.map(([a, b]) => {
    const y0 = box.y + a, h = b - a + 1;
    const cols = runs(box.w, x => { for (let y = 0; y < h; y++) if (on(box.x + x, y0 + y)) return true; return false; });
    return { y0, h, glyphs: cols.map(([c0, c1]) => {
      const x0 = box.x + c0, w = c1 - c0 + 1; let t = h, bt = 0;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (on(x0 + x, y0 + y)) { t = Math.min(t, y); bt = Math.max(bt, y); }
      const v = new Array(160);
      for (let j = 0; j < 16; j++) for (let k = 0; k < 10; k++)
        v[j * 10 + k] = Math.round(255 - lum(data, ((y0 + t + Math.floor((j + 0.5) * (bt - t + 1) / 16)) * W + x0 + Math.floor((k + 0.5) * w / 10)) * 4));
      return { v, gh: bt - t + 1, top: t / h };
    }) };
  });
}

// Commas and the "~" are much shorter than digits; the comma sits low, the tilde mid-line.
const mark = (g, h) => (g.gh < h * 0.45 ? (g.top > 0.5 ? "," : "~") : null);

const ncc = (a, b) => {
  let ma = 0, mb = 0;
  for (let i = 0; i < a.length; i++) { ma += a[i]; mb += b[i]; }
  ma /= a.length; mb /= b.length;
  let s = 0, sa = 0, sb = 0;
  for (let i = 0; i < a.length; i++) { const x = a[i] - ma, y = b[i] - mb; s += x * y; sa += x * x; sb += y * y; }
  return sa && sb ? s / Math.sqrt(sa * sb) : 0;
};

/** Reads one line with templates [{c, v}]. Unknown or unsure digits come back as "?". */
export function readLine(line, templates, min = 0.8) {
  return line.glyphs.map(g => {
    const m = mark(g, line.h);
    if (m) return m;
    let best = { s: -1, c: "?" };
    for (const t of templates) { const s = ncc(g.v, t.v); if (s > best.s) best = { s, c: t.c }; }
    return best.s >= min ? best.c : "?";
  }).join("");
}

/** Adds templates from a line whose true text the user typed. Returns false if the glyph count doesn't match. */
export function teach(line, text, templates, perChar = 4) {
  const want = text.replace(/\s/g, "");
  if (want.length !== line.glyphs.length) return false;
  line.glyphs.forEach((g, k) => {
    const c = want[k];
    if (!/\d/.test(c) || mark(g, line.h)) return;
    if (templates.filter(t => t.c === c).length < perChar) templates.push({ c, v: g.v });
  });
  return true;
}

/** "4,590,990,470~" → 4590990470; null unless it's a clean comma-grouped number. */
export function priceOf(s) {
  const t = s.replace(/~$/, "");
  return /^\d{1,3}(,\d{3})*$/.test(t) ? Number(t.replace(/,/g, "")) : null;
}

/** Prices of each card: the line ending in "~" is the low price, the next line the high one. `ok` is false if unreadable. */
export function cardPrices(rgba, card, priceBox, templates) {
  const lines = glyphLines(rgba, { x: priceBox.x, y: card.y0, w: priceBox.w, h: card.y1 - card.y0 + 1 });
  const read = lines.map(l => readLine(l, templates));
  const i = read.findIndex(s => s.endsWith("~"));
  const low = i >= 0 ? priceOf(read[i]) : null, high = i >= 0 && i + 1 < read.length ? priceOf(read[i + 1]) : null;
  // `raw` is what was read, shown on the preview when a row fails.
  return { raw: read.join(" "), ok: !!(low && high && low <= high), low, high };
}

/** Levenshtein distance, for snapping OCR'd names onto known item names. */
export function dist(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

/** Closest known name if it's within an OCR slip, else the OCR text as is. */
export function snap(text, names) {
  const t = text.replace(/\s+/g, " ").trim();
  let best = null, bd = Infinity;
  for (const n of names) { const d = dist(t.toLowerCase(), n.toLowerCase()); if (d < bd) { bd = d; best = n; } }
  // Tight on purpose: OCR slips are 1–2 letters, while real variants (Red vs Blue) differ by more.
  return best && bd <= (t.length >= 12 ? 2 : 1) ? best : t;
}
