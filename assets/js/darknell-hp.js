// Darknell boss HP bar: find it on screen and read how full it is. RGBA ImageData-like {data, width, height}.

/** Bar-fill green (the bar is a bright green gradient; the arena behind it is pink/purple). */
const green = (d, k) => d[k + 1] > 140 && d[k + 1] - d[k] > 30 && d[k + 1] - d[k + 2] > 45;

/**
 * Looks for the HP bar in an image of the top of the screen (the caller crops it): the longest horizontal run of bar green that is also green
 * a couple of rows above and below (so thin lines and text don't count), starting right of the party list's bars.
 * Returns {x0, x1, y} or null.
 * x1 is where the fill ends now, so a bar found below full HP is extended later by `widen`.
 */
export function findBar({ data, width: W, height: H }) {
  let best = null;
  for (let y = 2; y < H - 2; y++) {
    let s = -1, e = -1;
    for (let x = 0; x <= W; x++) {
      if (x < W && green(data, (y * W + x) * 4)) { if (s < 0) s = x; e = x; continue; }
      if (s >= 0 && x < W && x - e <= 3) continue; // tolerate a few off pixels (damage numbers, the bright tip)
      if (s >= 0) {
        const len = e - s + 1, mid = (y * W + ((s + e) >> 1)) * 4;
        if (len > W * 0.12 && s > W * 0.2 && green(data, mid - 2 * W * 4) && green(data, mid + 2 * W * 4) && (!best || len > best.x1 - best.x0 + 1))
          best = { x0: s, x1: e, y };
      }
      s = -1;
    }
  }
  // Use the middle row of the bar's thickness, so reading 5 rows around it stays inside the bar.
  if (best) {
    const col = (best.x0 + Math.min(best.x1, best.x0 + 40)) >> 1;
    let t = best.y, b = best.y;
    while (t > 0 && green(data, ((t - 1) * W + col) * 4)) t--;
    while (b < H - 1 && green(data, ((b + 1) * W + col) * 4)) b++;
    best.y = (t + b) >> 1;
  }
  return best;
}

/** Fill fraction of a locked bar: last green column (needs 3 of 5 rows) relative to the bar's full width. */
export function readBar({ data, width: W, height: H }, bar) {
  let last = -1;
  for (let x = bar.x0; x <= bar.x1; x++) {
    let c = 0;
    for (let y = bar.y - 2; y <= bar.y + 2; y++) if (y >= 0 && y < H && green(data, (y * W + x) * 4)) c++;
    if (c >= 3) last = x;
  }
  return last < 0 ? null : (last - bar.x0 + 1) / (bar.x1 - bar.x0 + 1);
}

/** A newer sighting of the same bar (same row ±3, same left end ±6) that reaches further right widens the lock. */
export function widen(bar, seen) {
  if (!bar) return seen;
  if (!seen || Math.abs(seen.y - bar.y) > 3 || Math.abs(seen.x0 - bar.x0) > 6 || seen.x1 <= bar.x1) return bar;
  return { ...bar, x1: seen.x1 };
}
