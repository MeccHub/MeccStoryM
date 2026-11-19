// Buff Watcher core: grayscale template matching and calibration.
// Ported from BuffWatcher v0.4.2 (OpenCV TM_CCOEFF_NORMED + PRESENT/ABSENT calibration), no dependencies.

/** RGBA ImageData-like {data, width, height} → {g: Float32Array, w, h} */
export function toGray({ data, width, height }) {
  const g = new Float32Array(width * height);
  for (let i = 0, j = 0; j < g.length; i += 4, j++) g[j] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  return { g, w: width, h: height };
}

/** Summed-area tables of values and squares, (w+1)×(h+1). */
export function integrals({ g, w, h }) {
  const W = w + 1, s = new Float64Array(W * (h + 1)), s2 = new Float64Array(W * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0, row2 = 0;
    for (let x = 0; x < w; x++) {
      const v = g[y * w + x]; row += v; row2 += v * v;
      s[(y + 1) * W + x + 1] = s[y * W + x + 1] + row;
      s2[(y + 1) * W + x + 1] = s2[y * W + x + 1] + row2;
    }
  }
  return { s, s2, W };
}

/** Template prepared once: mean-subtracted pixels and their energy. */
export function prepTemplate({ g, w, h }) {
  const n = w * h, mean = g.reduce((a, b) => a + b, 0) / n, t = new Float32Array(n);
  let e = 0;
  for (let i = 0; i < n; i++) { t[i] = g[i] - mean; e += t[i] * t[i]; }
  return { t, w, h, n, e };
}

/** Normalized cross-correlation (TM_CCOEFF_NORMED) of template at (x, y). */
function score(img, ii, T, x, y) {
  const { s, s2, W } = ii, x2 = x + T.w, y2 = y + T.h;
  const sum = s[y2 * W + x2] - s[y * W + x2] - s[y2 * W + x] + s[y * W + x];
  const sum2 = s2[y2 * W + x2] - s2[y * W + x2] - s2[y2 * W + x] + s2[y * W + x];
  const v = sum2 - (sum * sum) / T.n;
  if (v < 1e-3 || T.e < 1e-3) return 0;
  let c = 0;
  for (let ty = 0, k = 0; ty < T.h; ty++) {
    const row = (y + ty) * img.w + x;
    for (let tx = 0; tx < T.w; tx++, k++) c += T.t[k] * img.g[row + tx];
  }
  return c / Math.sqrt(v * T.e);
}

/** Best match in [x0..x1]×[y0..y1] sampled every `step` px. */
function scan(img, ii, T, x0, y0, x1, y1, step) {
  let best = { score: -1, x: 0, y: 0 };
  for (let y = Math.max(0, y0); y <= Math.min(img.h - T.h, y1); y += step)
    for (let x = Math.max(0, x0); x <= Math.min(img.w - T.w, x1); x += step) {
      const v = score(img, ii, T, x, y);
      if (v > best.score) best = { score: v, x, y };
    }
  return best;
}

/** 2×2 box-averaged copy: widens match peaks so a coarse pass can't step over them. */
export function half({ g, w, h }) {
  const W = w >> 1, H = h >> 1, o = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = 2 * y * w + 2 * x;
    o[y * W + x] = (g[i] + g[i + 1] + g[i + w] + g[i + w + 1]) / 4;
  }
  return { g: o, w: W, h: H };
}

/** Template plus its half-size version, prepared once. */
export function prepBoth(t) { return { ...prepTemplate(t), small: prepTemplate(half(t)) }; }

/** Image plus integrals at full and half size, built once per frame. */
export function prepFrame(img) { const s = half(img); return { img, ii: integrals(img), s, sii: integrals(s) }; }

/**
 * Finds the template (from prepBoth) in a frame (from prepFrame). Searches near `last` first (icons shift
 * as buffs come and go), then the whole area at half size, refining the best 3 spots at full size.
 * With full=false a failed nearby search returns {skipped: true}, so callers can ration whole-area scans.
 */
export function find(F, T, last, threshold = 0.85, full = true) {
  const { img, ii } = F;
  if (T.w > img.w || T.h > img.h) return { score: 0, x: 0, y: 0 };
  if (last) {
    const near = scan(img, ii, T, last.x - 6, last.y - 6, last.x + 6, last.y + 6, 1);
    if (near.score >= threshold) return near;
    if (!full) return { ...near, skipped: true };
  }
  if (!full) return { score: 0, x: 0, y: 0, skipped: true };
  const S = T.small, cands = [];
  for (let y = 0; y <= F.s.h - S.h; y++) for (let x = 0; x <= F.s.w - S.w; x++) {
    const v = score(F.s, F.sii, S, x, y);
    if (cands.length < 3 || v > cands[2].v) { cands.push({ v, x, y }); cands.sort((a, b) => b.v - a.v); cands.length = Math.min(3, cands.length); }
  }
  let best = { score: -1, x: 0, y: 0 };
  for (const c of cands) {
    const m = scan(img, ii, T, 2 * c.x - 2, 2 * c.y - 2, 2 * c.x + 2, 2 * c.y + 2, 1);
    if (m.score > best.score) best = m;
  }
  return best;
}

const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))))];

/** Same rules as BuffWatcher's auto-calibration: present p10 vs absent p95. */
export function calibrate(present, absent) {
  const ps = [...present].sort((a, b) => a - b), ns = [...absent].sort((a, b) => a - b);
  const floor = pct(ps, 10), ceiling = pct(ns, 95), gap = floor - ceiling;
  const median = pct(ps, 50), mean = ps.reduce((a, b) => a + b, 0) / ps.length;
  const std = Math.sqrt(ps.reduce((a, b) => a + (b - mean) ** 2, 0) / ps.length);
  let [quality, debounce, grace] =
    gap >= 0.15 ? ["Excellent", 2, 150] : gap >= 0.08 ? ["Good", 3, 225] : gap >= 0.03 ? ["Marginal", 4, 325] : ["Poor / overlapping", 5, 450];
  let threshold = gap > 0 ? (floor + ceiling) / 2 - Math.min(0.015, gap * 0.1) : Math.max(ceiling + 0.01, Math.min(median - 0.02, 0.95));
  threshold = Math.max(0.45, Math.min(0.98, threshold));
  if (std > 0.06) { debounce += 1; grace += 100; }
  return { threshold, debounce: Math.min(12, debounce), grace: Math.min(2000, grace), quality, gap };
}

/**
 * Debounced on/off state for one buff. Switches after `debounce` agreeing frames;
 * turning off also needs the icon missing for `grace` ms.
 */
export function step(state, seen, now, { debounce, grace }) {
  if (seen === state.on) { state.streak = 0; state.since = now; return false; }
  state.streak = (state.streak || 0) + 1;
  if (state.streak === 1) state.since = now;
  if (state.streak < debounce || (!seen && now - state.since < grace)) return false;
  state.on = seen; state.streak = 0;
  return true;
}

/**
 * Spoken alerts for one buff after this frame. `change` is "on"/"off" when the debounced state just flipped.
 * Modes: "off" = say when it ends; "cooldown" = say "ready" `cooldown` s after it turned on;
 * "keep" = must always be on, nag every `repeat` s while missing; "appear" = say its name when it shows up (boss debuffs).
 * `t` holds this buff's timers between frames.
 */
export function timerAlerts(b, t, on, change, now) {
  const out = [];
  if (b.mode === "off" && change === "off") out.push(`${b.name} off`);
  if (b.mode === "appear" && change === "on") out.push(b.name);
  if (b.mode === "cooldown") {
    if (change === "on") { t.readyAt = now + b.cooldown * 1000; t.endAt = now + b.duration * 1000; }
    if (t.readyAt && now >= t.readyAt) { out.push(`${b.name} ready`); t.readyAt = 0; }
  }
  if (b.mode === "keep") {
    if (on) t.nagAt = 0;
    else if (now - (t.nagAt || 0) >= b.repeat * 1000) { out.push(`${b.name} missing`); t.nagAt = now; }
  }
  return out;
}

/**
 * Latest frame of a screen-share track, for drawImage. Chrome pauses a muted, unseen <video> while its tab is in the
 * background (i.e. whenever you're looking at the game), so frames read through it freeze. ImageCapture reads the
 * track itself and keeps working; browsers without it fall back to the video element.
 */
export function frameSource(track, video) {
  const ic = typeof ImageCapture === "function" ? new ImageCapture(track) : null;
  let last = null;
  return async () => {
    if (ic) {
      try { const b = await ic.grabFrame(); last?.close(); last = b; return b; } catch (e) { /* fall back below */ }
    }
    return video;
  };
}
