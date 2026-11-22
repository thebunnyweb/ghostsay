'use strict';

// ---------- text width (handles CJK / emoji as 2 cells) ----------
function charWidth(c) {
  const cp = c.codePointAt(0);
  if (cp === 0x200d || cp === 0xfe0f || cp === 0xfe0e || (cp >= 0x300 && cp <= 0x36f)) return 0;
  if (cp < 0x1100) return 1;
  if (
    (cp <= 0x115f) || (cp >= 0x2e80 && cp <= 0x303e) || (cp >= 0x3041 && cp <= 0x33ff) ||
    (cp >= 0x3400 && cp <= 0x4dbf) || (cp >= 0x4e00 && cp <= 0x9fff) || (cp >= 0xa000 && cp <= 0xa4cf) ||
    (cp >= 0xac00 && cp <= 0xd7a3) || (cp >= 0xf900 && cp <= 0xfaff) || (cp >= 0xfe30 && cp <= 0xfe4f) ||
    (cp >= 0xff00 && cp <= 0xff60) || (cp >= 0xffe0 && cp <= 0xffe6) || (cp >= 0x1f300 && cp <= 0x1f64f) ||
    (cp >= 0x1f680 && cp <= 0x1f6ff) || (cp >= 0x1f900 && cp <= 0x1f9ff) || (cp >= 0x20000 && cp <= 0x3fffd)
  ) return 2;
  return 1;
}
const strWidth = (s) => { let w = 0; for (const c of s) w += charWidth(c); return w; };

function wrap(text, width) {
  width = Math.max(2, width);
  const out = [];
  for (const para of String(text).split(/\r?\n/)) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) { out.push(''); continue; }
    let line = '';
    for (let word of words) {
      while (strWidth(word) > width) {
        if (line) { out.push(line); line = ''; }
        const chars = Array.from(word);
        let chunk = '', cw = 0, i = 0;
        for (; i < chars.length; i++) {
          const w = charWidth(chars[i]);
          if (cw + w > width) break;
          chunk += chars[i]; cw += w;
        }
        out.push(chunk);
        word = chars.slice(i).join('');
      }
      if (!word) continue;
      if (!line) line = word;
      else if (strWidth(line) + 1 + strWidth(word) <= width) line += ' ' + word;
      else { out.push(line); line = word; }
    }
    if (line) out.push(line);
  }
  return out;
}

// typewriter: show only the first n characters across lines
function reveal(lines, n) {
  let left = Math.max(0, Math.floor(n));
  return lines.map((l) => {
    const chars = Array.from(l);
    if (left >= chars.length) { left -= chars.length; return l; }
    const s = chars.slice(0, left).join(''); left = 0; return s;
  });
}
const totalChars = (s) => Array.from(String(s)).length;

// ---------- color ----------
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const mix = (a, b, t) => [0, 1, 2].map((i) => a[i] + (b[i] - a[i]) * clamp(t, 0, 1));
function hsl(h, s, l) {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

// ---------- speech bubble ----------
const BORDERS = {
  round: ['╭', '╮', '╰', '╯', '─', '│'],
  double: ['╔', '╗', '╚', '╝', '═', '║'],
  square: ['┌', '┐', '└', '┘', '─', '│'],
};
function bubbleSize(lines) {
  const inner = Math.max(1, ...lines.map(strWidth));
  return { w: inner + 4, h: lines.length + 2 };
}
// full = all lines (fixes bubble size), shown = typewritten subset
function drawBubble(cv, x, y, full, shown, o = {}) {
  const { w, h } = bubbleSize(full);
  const b = BORDERS[o.style || 'round'];
  const bc = typeof o.border === 'function' ? o.border : () => o.border;
  const tc = typeof o.text === 'function' ? o.text : () => o.text;
  cv.fill(x, y, w, h);
  cv.put(x, y, b[0], bc(0, 0)); cv.put(x + w - 1, y, b[1], bc(w - 1, 0));
  cv.put(x, y + h - 1, b[2], bc(0, h - 1)); cv.put(x + w - 1, y + h - 1, b[3], bc(w - 1, h - 1));
  for (let i = 1; i < w - 1; i++) { cv.put(x + i, y, b[4], bc(i, 0)); cv.put(x + i, y + h - 1, b[4], bc(i, h - 1)); }
  let cursorDrawn = false;
  for (let r = 0; r < full.length; r++) {
    const yy = y + 1 + r;
    cv.put(x, yy, b[5], bc(0, r + 1)); cv.put(x + w - 1, yy, b[5], bc(w - 1, r + 1));
    let cx = x + 2, i = 0;
    for (const c of Array.from(shown[r] || '')) cx += cv.putc(cx, yy, c, tc(c, r, cx - x - 2, i++), o.bold);
    if (o.cursor && !cursorDrawn && (shown[r] || '') !== full[r]) { cv.put(cx, yy, '▌', o.cursor); cursorDrawn = true; }
  }
  if (o.tail != null) {
    const dir = o.tailDir || 1;
    for (let k = 0; k < (o.tailLen || 2); k++) cv.put(x + o.tail + k * dir, y + h + k, dir > 0 ? '╲' : '╱', bc(0, 0));
  }
  return { w, h };
}

// ---------- smooth value noise ----------
function hash3(x, y, z) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 1440662683)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
function noise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const u = fade(x - xi), v = fade(y - yi), w = fade(z - zi);
  const l = (a, b, t) => a + (b - a) * t;
  return l(
    l(l(hash3(xi, yi, zi), hash3(xi + 1, yi, zi), u), l(hash3(xi, yi + 1, zi), hash3(xi + 1, yi + 1, zi), u), v),
    l(l(hash3(xi, yi, zi + 1), hash3(xi + 1, yi, zi + 1), u), l(hash3(xi, yi + 1, zi + 1), hash3(xi + 1, yi + 1, zi + 1), u), v),
    w);
}
function fbm(x, y, z, oct = 3) {
  let s = 0, a = 0.5, n = 0;
  for (let i = 0; i < oct; i++) { s += a * noise3(x, y, z); n += a; x *= 2.03; y *= 2.03; z *= 1.7; a *= 0.5; }
  return s / n;
}
// multi-stop gradient: stops = [[pos, [r,g,b]], ...]
function ramp(stops, t) {
  t = clamp(t, 0, 1);
  for (let i = 1; i < stops.length; i++) if (t <= stops[i][0]) return mix(stops[i - 1][1], stops[i][1], (t - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0]));
  return stops[stops.length - 1][1];
}

// ---------- small animation / geometry helpers ----------
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const easeOut = (t) => 1 - (1 - clamp(t, 0, 1)) ** 3;
const easeIn = (t) => clamp(t, 0, 1) ** 2;
const easeOutBack = (t, c = 1.6) => { t = clamp(t, 0, 1); return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2; };
const scale = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
const norm3 = (x, y, z) => { const m = Math.hypot(x, y, z) || 1; return [x / m, y / m, z / m]; };
// frame-delta helper that survives loops / pauses
const clock = () => { let last = 0; return (t) => { const dt = clamp(t - last, 0, 0.1); last = t; return dt; }; };
// signed distances
const smin = (a, b, k) => { const h = clamp(0.5 + (0.5 * (b - a)) / k, 0, 1); return b * (1 - h) + a * h - k * h * (1 - h); };
const smax = (a, b, k) => -smin(-a, -b, k);
function sdBox(x, y, z, hx, hy, hz, r = 0) {
  const qx = Math.abs(x) - hx + r, qy = Math.abs(y) - hy + r, qz = Math.abs(z) - hz + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - r;
}
function sdCapsule(x, y, z, ax, ay, az, bx, by, bz, r) {
  const px = x - ax, py = y - ay, pz = z - az, dx = bx - ax, dy = by - ay, dz = bz - az;
  const h = clamp((px * dx + py * dy + pz * dz) / (dx * dx + dy * dy + dz * dz), 0, 1);
  return Math.hypot(px - dx * h, py - dy * h, pz - dz * h) - r;
}

module.exports = {
  charWidth, strWidth, wrap, reveal, totalChars, clamp, mix, hsl, bubbleSize, drawBubble, hash3, noise3, fbm, ramp,
  rand, pick, sstep, easeOut, easeIn, easeOutBack, scale, norm3, clock, smin, smax, sdBox, sdCapsule,
};
