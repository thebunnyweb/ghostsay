'use strict';
// Polished UI pieces shared by every preset: vector shapes rasterised with quadrant blocks
// (2x2 sub-cell resolution), filled comic speech bubbles with a tail that points at the
// speaker, background gradients / glows, and natural typing cadence.
const { strWidth, clamp, mix, hash3, drawBubble, easeOutBack } = require('./util');

// quadrant glyph from a 2x2 coverage mask: TL=8 TR=4 BL=2 BR=1
const QUAD = [' ', '▗', '▖', '▄', '▝', '▐', '▞', '▟', '▘', '▚', '▌', '▙', '▀', '▜', '▛', '█'];

/** Fill a vector shape. inside(x, y) uses continuous cell coordinates (x cols, y rows). */
function shape(cv, inside, x0, y0, x1, y1, color) {
  for (let row = Math.max(0, Math.floor(y0)); row <= Math.min(cv.h - 1, Math.ceil(y1)); row++) {
    for (let col = Math.max(0, Math.floor(x0)); col <= Math.min(cv.w - 1, Math.ceil(x1)); col++) {
      const m = (inside(col + 0.25, row + 0.25) ? 8 : 0) | (inside(col + 0.75, row + 0.25) ? 4 : 0) |
        (inside(col + 0.25, row + 0.75) ? 2 : 0) | (inside(col + 0.75, row + 0.75) ? 1 : 0);
      if (!m) continue;
      if (m === 15) { cv.setBg(col, row, color); cv.put(col, row, ' ', null); }
      else cv.put(col, row, QUAD[m], color);
    }
  }
}

// signed distances in "square" units (1 col = 1, 1 row = 2)
function sdRoundRect(px, py, cx, cy, hw, hh, r) {
  const qx = Math.abs(px - cx) - hw + r, qy = Math.abs(py - cy) - hh + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}
function sdTri(px, py, ax, ay, bx, by, cx, cy) {
  const e = [[bx - ax, by - ay, ax, ay], [cx - bx, cy - by, bx, by], [ax - cx, ay - cy, cx, cy]];
  let d = Infinity, s = 0;
  for (const [ex, ey, vx, vy] of e) {
    const wx = px - vx, wy = py - vy, h = clamp((wx * ex + wy * ey) / (ex * ex + ey * ey), 0, 1);
    d = Math.min(d, Math.hypot(wx - ex * h, wy - ey * h));
    if (ex * wy - ey * wx > 0) s++;
  }
  return s === 3 || s === 0 ? -d : d;
}

/**
 * A filled speech bubble.
 * o = { x, y: top-left cell, lines, shown, tail: [col, row] | null, fill, ink, shadow, appear 0..1,
 *       cursor: colour | null, bold, rich: false -> classic outline bubble }
 * returns { w, h }
 */
function bubble(cv, o) {
  const inner = Math.max(1, ...o.lines.map(strWidth));
  const w = inner + 6, h = o.lines.length + 2;   // a row of padding top and bottom, 3 cols each side
  const { x, y } = o;
  if (!o.rich) {
    drawBubble(cv, x, y, o.lines, o.shown, { border: o.outline || [180, 180, 200], text: o.outlineInk || [240, 240, 250], bold: o.bold, cursor: o.cursor });
    return { w: inner + 4, h: o.lines.length + 2 };
  }
  const a = o.appear == null ? 1 : o.appear;
  if (a <= 0.02) return { w, h };
  const cx = x + w / 2, cy = (y + h / 2) * 2, hw = w / 2, hh = h, R = 2.6;
  let tip = null, base = null;
  if (o.tail) {
    const tx = o.tail[0], ty = o.tail[1] * 2;
    // base of the tail: on the bubble's edge, nearest the tip, kept away from the corners
    const bx = clamp(tx, x + 3, x + w - 3), by = clamp(ty, cy - hh + 3, cy + hh - 3);
    const dx = tx - bx, dy = ty - by;
    const horiz = Math.abs(dx) / (w / 2) > Math.abs(dy) / (hh * 1.2);
    const ex = horiz ? (dx > 0 ? x + w - 1 : x + 1) : bx, ey = horiz ? by : (dy > 0 ? cy + hh - 1 : cy - hh + 1);
    const len = Math.hypot(tx - ex, ty - ey) || 1, nx = -(ty - ey) / len, ny = (tx - ex) / len, bw = 2.4;
    base = [ex + nx * bw, ey + ny * bw, ex - nx * bw, ey - ny * bw];
    tip = [tx, ty];
  }
  const ox = tip ? tip[0] : cx, oy = tip ? tip[1] : cy;    // pop out of the tail tip
  const s = easeOutBack(a, 1.4);
  const inside = (dx, dy) => (px, py) => {
    const X = ox + (px - dx - ox) / s, Y = oy + ((py - dy) * 2 - oy) / s;
    if (sdRoundRect(X, Y, cx, cy, hw, hh, R) < 0) return true;
    return tip ? sdTri(X, Y, base[0], base[1], base[2], base[3], tip[0], tip[1]) < 0 : false;
  };
  const bx0 = Math.min(x, ox) - 2, bx1 = Math.max(x + w, ox) + 2, by0 = Math.min(y, oy / 2) - 1, by1 = Math.max(y + h + 1, oy / 2) + 1;
  if (o.shadow) shape(cv, inside(1, 0.5), bx0, by0, bx1 + 1, by1 + 1, o.shadow);
  shape(cv, inside(0, 0), bx0, by0, bx1, by1, o.fill);
  if (a < 0.85) return { w, h };
  // text
  let cursorDrawn = false;
  for (let r = 0; r < o.lines.length; r++) {
    let col = x + 3;
    for (const c of Array.from(o.shown[r] || '')) col += cv.putc(col, y + 1 + r, c, typeof o.ink === 'function' ? o.ink(c, r, col - x - 3) : o.ink, o.bold);
    if (o.cursor && !cursorDrawn && (o.shown[r] || '') !== o.lines[r]) { cv.put(col, y + 1 + r, '▏', o.cursor); cursorDrawn = true; }
  }
  return { w, h };
}

/** Paint every cell's background from fn(col, row) -> [r,g,b] | null. */
function backdrop(cv, fn) {
  for (let y = 0; y < cv.h; y++) for (let x = 0; x < cv.w; x++) { const c = fn(x, y); if (c) cv.bg[y * cv.w + x] = c; }
}
/** Additive soft glow on the background (rx, ry in cells). */
function glow(cv, cx, cy, rx, ry, color, k = 1) {
  for (let y = Math.max(0, Math.floor(cy - ry)); y <= Math.min(cv.h - 1, Math.ceil(cy + ry)); y++) {
    for (let x = Math.max(0, Math.floor(cx - rx)); x <= Math.min(cv.w - 1, Math.ceil(cx + rx)); x++) {
      const d = ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2;
      if (d >= 1) continue;
      const f = (1 - d) ** 2 * k, i = y * cv.w + x, b = cv.bg[i] || [0, 0, 0];
      cv.bg[i] = [b[0] + color[0] * f, b[1] + color[1] * f, b[2] + color[2] * f];
    }
  }
}

/** Typing cadence: per-character reveal times with natural pauses after punctuation. */
function cadence(text, cps, start = 0) {
  const chars = Array.from(String(text));
  const times = [];
  let t = start;
  chars.forEach((c, i) => {
    times.push(t);
    let d = (1 / cps) * (0.75 + 0.5 * hash3(i, 7, 3));
    if (/[.!?…]/.test(c)) d += 0.32; else if (/[,;:]/.test(c)) d += 0.16; else if (c === ' ') d *= 0.6;
    t += d;
  });
  return { times, end: t };
}
const typedCount = (cad, t) => { let n = 0; while (n < cad.times.length && cad.times[n] <= t) n++; return n; };
/** Map a count of characters across the whole message onto wrapped lines (spaces at wraps are skipped). */
function revealWrapped(lines, text, n) {
  const src = Array.from(String(text)); let k = 0;
  return lines.map((line) => {
    const out = [];
    for (const c of Array.from(line)) {
      while (k < src.length && src[k] !== c && /\s/.test(src[k])) k++;
      if (k < n) out.push(c); k++;
    }
    return out.join('');
  });
}

/**
 * Loop timeline: intro + typing (ends at typeEnd) -> hold -> erase (text vanishes backwards)
 * -> exit (the speaker leaves) -> gap -> repeat. local(t) maps wall time into one cycle.
 */
function loopTimes({ typeEnd, hold, erase, exit, gap }) {
  const holdEnd = typeEnd + hold, eraseEnd = holdEnd + erase, exitEnd = eraseEnd + exit, period = exitEnd + gap;
  return {
    typeEnd, hold, erase, exit, gap, holdEnd, eraseEnd, exitEnd, period,
    local: (t) => ((t % period) + period) % period,
    cycle: (t) => Math.floor(t / period),
  };
}
const eased = (t) => { t = clamp(t, 0, 1); return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2; };
/** Characters visible: typed in with cadence, then erased from the end during the erase phase. */
function visibleCount(cad, T, lt, total) {
  if (lt < T.holdEnd) return typedCount(cad, lt);
  return Math.round(total * (1 - clamp((lt - T.holdEnd) / (T.erase * 0.8), 0, 1)));
}

const vignette = (cv, x, y) => {
  const dx = (x + 0.5) / cv.w - 0.5, dy = ((y + 0.5) / cv.h - 0.5) * 0.9;
  return clamp(1 - (dx * dx + dy * dy) * 1.9, 0, 1);
};
const lerpBg = (a, b, t) => mix(a, b, t);

module.exports = { QUAD, shape, bubble, backdrop, glow, cadence, typedCount, revealWrapped, vignette, lerpBg, sdRoundRect, loopTimes, eased, visibleCount };
