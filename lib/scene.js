'use strict';
// Shared engine for the "place" presets (city, beach, dubai, ...). A place is a painted 2D
// scene: sky gradients, sun / moon with glows, drifting noise clouds, animated water, skylines
// with twinkling windows, weather, haze, traffic. Shapes are rasterised with quadrant blocks
// (2x2 sub-cell resolution) and solid areas become background colour, so scenes look painted
// in colour terminals and fall back to glyphs with --no-color.
//
// makeScene(def) turns a scene definition into a preset factory:
//   def = { horizon: 0..1, still: t for the final frame, draw(e), message: { style, ...colours } }
//   style: 'card' (filled bubble, typed), 'neon' (flickering sign, typed), 'banner' (towed by a plane)
const { strWidth, wrap, clamp, mix, hash3, noise3, fbm, ramp, scale, easeOut, easeIn, easeOutBack, drawBubble } = require('./util');
const { QUAD, bubble, glow, cadence, revealWrapped, loopTimes, visibleCount } = require('./ui');

const H1 = (i, s = 0, k = 0) => hash3(i | 0, s | 0, 7919 + (k | 0));
const mod = (a, n) => ((a % n) + n) % n;

// ---------- rasterising ----------
function cell(e, col, row, m, c, glyph) {
  if (col < 0 || row < 0 || col >= e.W || row >= e.H || !m) return;
  const cv = e.cv;
  if (m === 15) {
    if (e.rich) { cv.setBg(col, row, c); cv.put(col, row, ' ', null); }
    else cv.put(col, row, glyph == null ? '█' : glyph, null);
  } else cv.put(col, row, QUAD[m], c);
}

/** Fill inside(x, y) (continuous col / row coords) over a bounding box. color: rgb or (col,row)=>rgb */
function paint(e, inside, x0, y0, x1, y1, color, glyph) {
  const c0 = Math.max(0, Math.floor(x0)), c1 = Math.min(e.W - 1, Math.ceil(x1));
  const r0 = Math.max(0, Math.floor(y0)), r1 = Math.min(e.H - 1, Math.ceil(y1));
  const fn = typeof color === 'function';
  for (let row = r0; row <= r1; row++) for (let col = c0; col <= c1; col++) {
    const m = (inside(col + 0.25, row + 0.25) ? 8 : 0) | (inside(col + 0.75, row + 0.25) ? 4 : 0) |
      (inside(col + 0.25, row + 0.75) ? 2 : 0) | (inside(col + 0.75, row + 0.75) ? 1 : 0);
    if (m) cell(e, col, row, m, fn ? color(col, row) : color, glyph);
  }
}

/** A height field: everything below top(x) (rows, float) down to `bottom` is filled. */
function ridge(e, top, color, glyph, bottom = e.H - 1) {
  const W = e.W, A = new Float64Array(W), B = new Float64Array(W);
  let min = Infinity;
  for (let c = 0; c < W; c++) { A[c] = top(c + 0.25); B[c] = top(c + 0.75); min = Math.min(min, A[c], B[c]); }
  const fn = typeof color === 'function';
  for (let row = Math.max(0, Math.floor(min)); row <= Math.min(e.H - 1, bottom); row++) {
    const a = row + 0.25, b = row + 0.75;
    for (let c = 0; c < W; c++) {
      const m = (a >= A[c] ? 8 : 0) | (a >= B[c] ? 4 : 0) | (b >= A[c] ? 2 : 0) | (b >= B[c] ? 1 : 0);
      if (m) cell(e, c, row, m, fn ? color(c, row) : color, glyph);
    }
  }
}

const rect = (e, x0, y0, x1, y1, color, glyph) =>
  paint(e, (x, y) => x >= x0 && x < x1 && y >= y0 && y < y1, x0, y0, x1, y1, color, glyph);

/** circle of radius r (in columns; rows count double so it looks round) */
const disc = (e, cx, cy, r, color, clipRow = Infinity, glyph) =>
  paint(e, (x, y) => y < clipRow && ((x - cx) / r) ** 2 + (((y - cy) * 2) / r) ** 2 < 1, cx - r, cy - r / 2, cx + r, cy + r / 2, color, glyph);

/** A landmark: inside(lx, ly) in square local units, ly = 0 at the base, 1 = `s` rows up. */
function landmark(e, cx, base, s, inside, hw, ht, color, glyph) {
  const f = (x, y) => inside((x - cx) / (2 * s), (base - y) / s);
  paint(e, f, cx - hw * 2 * s - 1, base - ht * s - 1, cx + hw * 2 * s + 1, base, color, glyph);
  return f;
}
/** lit windows scattered over a painted shape */
function windows(e, f, x0, y0, x1, y1, o) {
  for (let row = Math.max(0, Math.ceil(y0)); row < Math.min(e.H, y1); row += o.sy || 1) {
    for (let col = Math.max(0, Math.ceil(x0)); col < Math.min(e.W, x1); col += o.sx || 2) {
      if (!f(col + 0.5, row + 0.5) || !f(col + 0.5, row - 0.4) || !f(col - 0.5, row + 0.5) || !f(col + 1.5, row + 0.5)) continue;
      const lit = H1(col * 31 + row, o.seed || 3, 5) < o.frac;
      const ph = Math.floor(e.t / (o.period || 7) + H1(col, row, 7) * 5);
      if (lit !== H1(col + row * 7, ph, 8) < (o.toggle == null ? 0.06 : o.toggle)) {
        const c = Array.isArray(o.color[0]) ? o.color[(H1(col, row, 9) * o.color.length) | 0] : o.color;
        e.cv.put(col, row, e.rich ? (o.ch || '▪') : '.', c);
      }
    }
  }
}

/** Mini raster for strokes (cables, fronds, trunks) at 2x2 sub-cell resolution. */
function pix(e) {
  const map = new Map();
  const plot = (sx, sy, c) => {
    sx = Math.floor(sx); sy = Math.floor(sy);
    if (sx < 0 || sy < 0 || sx >= e.W * 2 || sy >= e.H * 2) return;
    const col = sx >> 1, row = sy >> 1, k = row * e.W + col;
    let v = map.get(k);
    if (!v) map.set(k, (v = { m: 0, c, col, row }));
    v.m |= sy & 1 ? (sx & 1 ? 1 : 2) : (sx & 1 ? 4 : 8);
  };
  const api = {
    plot: (x, y, c) => plot(x * 2, y * 2, c),
    /** stroke from (x0,y0) to (x1,y1), thickness r in sub-cells */
    line(x0, y0, x1, y1, c, r = 0) {
      const n = Math.ceil(Math.max(Math.abs(x1 - x0) * 2, Math.abs(y1 - y0) * 2)) + 1;
      for (let i = 0; i <= n; i++) {
        const x = (x0 + ((x1 - x0) * i) / n) * 2, y = (y0 + ((y1 - y0) * i) / n) * 2;
        if (r <= 0) plot(x, y, c);
        else for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r + 0.5) plot(x + dx, y + dy, c);
      }
    },
    /** polyline through f(s), s in 0..1 */
    curve(f, c, r = 0, steps = 40) { let p = f(0); for (let i = 1; i <= steps; i++) { const q = f(i / steps); api.line(p[0], p[1], q[0], q[1], c, r); p = q; } },
    flush(glyph) { for (const v of map.values()) cell(e, v.col, v.row, v.m, v.c, glyph); map.clear(); },
  };
  return api;
}

// ---------- sky & light ----------
function sky(e, stops, bottom = e.H) {
  if (!e.rich) return;
  for (let y = 0; y < Math.min(bottom, e.H); y++) {
    const c = ramp(stops, y / Math.max(1, e.hz));
    for (let x = 0; x < e.W; x++) e.cv.setBg(x, y, c);
  }
}
const addGlow = (e, x, y, rx, ry, c, k = 1) => { if (e.deep) glow(e.cv, x, y, rx, ry, c, k); };

function sun(e, x, y, r, color, halo, clipRow) {
  if (halo) { addGlow(e, x, y, r * 4.5, r * 1.7, halo, 0.9); addGlow(e, x, y, r * 2, r * 0.8, halo, 0.7); }
  disc(e, x, y, r, color, clipRow, '@');
}
function moon(e, x, y, r, phase = 0.5) {
  addGlow(e, x, y, r * 4, r * 1.6, [40, 42, 60], 0.9);
  // a crescent: the disc minus an offset disc
  paint(e, (px, py) => {
    const a = ((px - x) / r) ** 2 + (((py - y) * 2) / r) ** 2, b = ((px - x - r * phase * 1.25) / r) ** 2 + (((py - y) * 2 + r * 0.2) / r) ** 2;
    return a < 1 && (phase <= 0 || b > 1.05);
  }, x - r, y - r / 2, x + r, y + r / 2, [240, 236, 210], '@');
}

function stars(e, n, maxRow, k = 1) {
  const { cv, W, t } = e;
  for (let i = 0; i < n; i++) {
    const x = Math.floor(H1(i, 1) * W), y = Math.floor(H1(i, 2) * maxRow);
    if (y < 0 || y >= e.H || cv.ch[y * cv.w + x] !== ' ') continue;
    const tw = (0.35 + 0.65 * Math.max(0, Math.sin(t * (0.5 + H1(i, 3)) + H1(i, 4) * 6))) * H1(i, 5) * k;
    if (tw > 0.14) cv.put(x, y, tw > 0.62 ? '+' : tw > 0.3 ? '·' : '.', mix([20, 20, 40], [210, 215, 255], tw));
  }
}

/** soft noise clouds blended into the background between rows y0..y1 */
function clouds(e, o) {
  const { cv, W, t } = e, y0 = Math.max(0, Math.floor(o.y0)), y1 = Math.min(e.H - 1, Math.ceil(o.y1));
  const sx = o.scale || 0.05;
  for (let y = y0; y <= y1; y++) {
    const v = (y - o.y0) / Math.max(1, o.y1 - o.y0), band = Math.sin(Math.PI * clamp(v, 0, 1));
    const c = mix(o.color, o.shade || o.color, v);
    for (let x = 0; x < W; x++) {
      const d = (fbm(x * sx + t * (o.speed || 0.02), y * sx * 2.4, o.seed || 1.3, 3) - (o.thr || 0.5)) * band;
      if (d <= 0) continue;
      const a = clamp(d * (o.k || 5), 0, o.alpha || 0.9), i = y * cv.w + x;
      if (e.rich) cv.bg[i] = mix(cv.bg[i] || [0, 0, 0], c, a);
      else if (a > 0.45 && cv.ch[i] === ' ') cv.put(x, y, '░', null);
    }
  }
}

/** fade whatever is already drawn toward `color` by k(col,row) — fog, mist, heat haze */
function haze(e, y0, y1, k, color) {
  if (!e.rich) return;
  const cv = e.cv;
  for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(e.H - 1, Math.ceil(y1)); y++) {
    for (let x = 0; x < e.W; x++) {
      const a = clamp(k(x, y), 0, 1);
      if (a < 0.01) continue;
      const i = y * cv.w + x;
      cv.bg[i] = mix(cv.bg[i] || [0, 0, 0], color, a);
      if (cv.fg[i]) cv.fg[i] = mix(cv.fg[i], color, a);
      if (a > 0.88) cv.ch[i] = ' ';
    }
  }
}

// ---------- water ----------
/** o = { far, near, wave, speed, glint: { x, w, color } } */
function water(e, top, bottom, o) {
  const { cv, t } = e;
  top = Math.max(0, Math.round(top)); bottom = Math.min(e.H, Math.round(bottom));
  for (let row = top; row < bottom; row++) {
    const k = (row - top) / Math.max(1, bottom - top - 1), base = mix(o.far, o.near, k), zs = 1 / (0.3 + k);
    for (let col = 0; col < e.W; col++) {
      if (o.skip && o.skip(col, row)) continue;
      if (e.rich) cv.setBg(col, row, scale(base, 0.9 + 0.18 * noise3(col * 0.07 * zs, row * 0.8, t * 0.4)));
      const n = noise3(col * 0.17 * zs + t * (o.speed || 0.3), row * 1.7, t * 0.6);
      if (n > 0.64) cv.put(col, row, n > 0.72 ? '~' : '-', mix(base, o.wave, clamp((n - 0.6) * 3.5, 0, 1)));
      else cv.put(col, row, ' ', null);
      if (o.glint) {
        const g = o.glint, dx = Math.abs(col + 0.5 - g.x) / (g.w * (0.3 + k * 1.3));
        if (dx < 1 && noise3(col * 0.55, row * 2.3, t * 2.6) > 0.34 + dx * 0.32) cv.put(col, row, dx < 0.4 ? '━' : '─', mix(base, g.color, 1 - dx * 0.6), dx < 0.3);
      }
    }
  }
}
/** shimmering vertical streaks under lights (lights: [{ x, c }]) */
function reflections(e, top, len, lights) {
  for (const L of lights) {
    for (let r = 0; r < len; r++) {
      const row = top + r, n = noise3(L.x * 0.7, row * 1.6, e.t * 3);
      if (n > 0.42 + r / len * 0.3) e.cv.put(L.x + Math.round((n - 0.5) * 2), row, n > 0.6 ? '-' : '~', scale(L.c, 0.85 - (r / len) * 0.55));
    }
  }
}

// ---------- city pieces ----------
/** a row of buildings standing on `base`. returns the buildings ({ x, w, top }) */
function skyline(e, o) {
  const out = [], seed = o.seed || 0, x1 = o.x1 == null ? e.W : o.x1;
  let x = (o.x0 || 0) - Math.floor(H1(seed, 9) * 4), i = 0;
  while (x < x1) {
    const w = Math.round(o.minW + H1(i, 1, seed) * (o.maxW - o.minW));
    const h = o.minH + H1(i, 2, seed) ** (o.pow || 1) * (o.maxH - o.minH);
    out.push({ x, w, top: Math.round((o.base - h) * 2) / 2, i, roof: H1(i, 4, seed) });
    x += w + (H1(i, 3, seed) < (o.gaps == null ? 0.25 : o.gaps) ? 1 : 0); i++;
  }
  for (const b of out) {
    const color = typeof o.color === 'function' ? o.color(b) : o.color, mid = b.x + b.w / 2;
    const f = (px, py) => {
      if (px < b.x || px >= b.x + b.w || py >= o.base) return false;
      if (py >= b.top) return true;
      if (b.roof < 0.22 && b.w >= 5) return py >= b.top - 1.5 && px >= b.x + 1 && px < b.x + b.w - 1;   // set-back
      if (b.roof < 0.36) return py >= b.top - 3 && Math.abs(px - mid) < 0.26;                       // antenna
      if (b.roof < 0.46) return py >= b.top - ((px - b.x) / b.w) * 1.5;                             // slanted
      return false;
    };
    paint(e, f, b.x, b.top - 3, b.x + b.w, o.base, color, o.glyph);
    if (o.win) windows(e, f, b.x + 1, b.top + 1, b.x + b.w - 1, o.base - (o.win.bottom || 0), { seed: seed * 13 + b.i, ...o.win });
    if (o.beacon && b.roof >= 0.22 && b.roof < 0.36 && Math.sin(e.t * 2.5 + b.i * 1.7) > 0.3) e.cv.put(Math.floor(mid), Math.floor(b.top - 3), '•', [255, 50, 50]);
  }
  return out;
}

/** cars along a road row. o = { n, speed, dir, seed, colors, jam: stop-and-go, draw(i, body) -> [[ch, rgb], ...] } */
function traffic(e, row, o) {
  const span = e.W + 12, dir = o.dir || 1;
  // stop-and-go: the whole lane surges and brakes together, so cars keep their spacing
  const p = o.jam ? e.t - (0.92 * Math.sin(e.t * 0.8 + (o.seed || 0))) / 0.8 : e.t;
  for (let i = 0; i < o.n; i++) {
    const v = o.jam ? 1 : 0.75 + 0.5 * H1(i, 1, o.seed);
    const x = Math.round(mod(H1(i, 2, o.seed) * span + dir * p * o.speed * v, span) - 6);
    const body = o.colors[(H1(i, 3, o.seed) * o.colors.length) | 0];
    const front = [255, 245, 200], back = [255, 40, 40];
    const parts = o.draw ? o.draw(i, body, dir) : dir > 0 ? [['▪', back], ['▄', body], ['▄', body], ['▪', front]] : [['▪', front], ['▄', body], ['▄', body], ['▪', back]];
    parts.forEach(([c, col], k) => { if (c !== ' ') e.cv.put(x + k, row, e.rich ? c : c === '▪' ? 'o' : '=', col); });
  }
}

/** a few birds: 'v' flapping to '-' */
function birds(e, o) {
  const span = e.W + 30;
  for (let i = 0; i < o.n; i++) {
    const d = H1(i, 1, o.seed);
    const x = mod(H1(i, 2, o.seed) * span + (o.dir || 1) * e.t * o.speed * (0.6 + 0.6 * d), span) - 15;
    const y = o.y0 + H1(i, 3, o.seed) * (o.y1 - o.y0) + Math.sin(e.t * 0.9 + i) * 0.7;
    const flap = Math.sin(e.t * (5 + d * 4) + i * 1.7);
    e.cv.put(x, y, flap > -0.2 ? 'v' : '-', o.color);
  }
}

/** snow or rain. o = { n, speed, wind, kind, near, far, seed, floor(x) -> row } */
function fall(e, o) {
  const span = e.H + 4;
  for (let i = 0; i < o.n; i++) {
    const d = H1(i, 1, o.seed), spd = o.speed * (0.45 + 0.8 * d);
    const y = mod(H1(i, 2, o.seed) * span + e.t * spd, span) - 2;
    let x = H1(i, 3, o.seed) * e.W + e.t * (o.wind || 0) * spd * 0.5;
    if (o.kind === 'snow') x += Math.sin(e.t * (0.7 + d) + i) * 1.3;
    x = mod(x, e.W);
    if (o.floor && y > o.floor(x)) continue;
    const c = mix(o.far, o.near, d);
    if (o.kind === 'snow') e.cv.put(x, y, d > 0.82 ? '*' : d > 0.5 ? '•' : '·', c);
    else e.cv.put(x, y, o.wind ? '/' : d > 0.6 ? '│' : '|', c);
  }
}

// ---------- the message ----------
function plane(e, x, y, o) {
  const prop = ['|', '/', '-', '\\'][Math.floor(e.t * 24) % 4];
  const rows = ['     __  |\\', prop + '=<(__)==|'];
  rows.forEach((r, k) => e.cv.text(x, y + k, r, (c) => (c === prop && k === 1 ? [220, 220, 230] : c === '(' || c === ')' || c === '_' ? o.body : o.trim), true));
}

function banner(e, lines, lt, T, o) {
  const { cv } = e;
  const inner = Math.max(...lines.map(strWidth)), bw = inner + 4, bh = lines.length + 2;
  const total = 11 + 3 + bw, y = o.y == null ? 1 : o.y;
  const target = Math.floor((e.W - total) / 2);
  let x;
  if (e.final) x = target;
  else if (lt < T.typeEnd) x = e.W + 1 - (e.W + 1 - target) * easeOut(lt / T.typeEnd);
  else if (lt < T.eraseEnd) x = target + Math.sin((lt - T.typeEnd) * 0.9) * 0.6;
  else x = target - (target + total + 2) * easeIn((lt - T.eraseEnd) / T.exit);
  x = Math.round(x);
  const bob = e.final ? 0 : Math.round(Math.sin(e.t * 1.4) * 0.5);
  plane(e, x, y + bob, o);
  const rope = x + 11, bx = rope + 3, by = y + bob - Math.floor((bh - 2) / 2);
  cv.text(rope, y + 1 + bob, '~-~', o.rope || [200, 200, 200]);
  if (!e.rich) { drawBubble(cv, bx, by, lines, lines, { style: 'square', border: null, text: null, bold: true }); return; }
  for (let r = 0; r < bh; r++) for (let c = 0; c < bw; c++) {
    const w = e.final ? 1 : 0.86 + 0.14 * Math.sin(c * 0.55 - e.t * 7 + r * 0.3);
    cv.setBg(bx + c, by + r, scale(c === bw - 1 || r === 0 || r === bh - 1 ? o.hem : o.cloth, w));
    cv.put(bx + c, by + r, ' ', null);
  }
  lines.forEach((l, r) => cv.text(bx + 2 + Math.floor((inner - strWidth(l)) / 2), by + 1 + r, l, o.ink, true));
}

function neonSign(e, lines, shown, on, o, typing, n) {
  const { cv, t } = e, inner = Math.max(...lines.map(strWidth)), w = inner + 6, h = lines.length + 2;
  const x = Math.floor((e.W - w) / 2), y = o.y;
  if (on <= 0) return;
  const flick = (k) => (e.final || on >= 1 ? 1 : H1(Math.floor(t * 18), k, 31) < on * 1.2 ? 1 : 0.15);
  const lit = flick(1), bc = mix(scale(o.border, 0.15), o.border, lit), buzz = e.final ? 1 : 0.9 + 0.1 * noise3(t * 9, 0, 0);
  if (e.rich) {
    addGlow(e, x + w / 2, y + h / 2, w * 0.75, h * 1.2, scale(o.border, 0.22), lit * buzz);
    for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) { const i = (y + r) * cv.w + x + c; if (y + r >= 0 && y + r < e.H && x + c >= 0 && x + c < e.W) cv.bg[i] = mix(cv.bg[i] || [0, 0, 0], o.plate || [10, 6, 20], 0.85); }
  }
  const B = ['╭', '╮', '╰', '╯', '─', '│'];
  cv.fill(x, y, w, h);
  cv.put(x, y, B[0], bc, true); cv.put(x + w - 1, y, B[1], bc, true); cv.put(x, y + h - 1, B[2], bc, true); cv.put(x + w - 1, y + h - 1, B[3], bc, true);
  for (let i = 1; i < w - 1; i++) { cv.put(x + i, y, B[4], bc, true); cv.put(x + i, y + h - 1, B[4], bc, true); }
  let idx = 0;
  for (let r = 0; r < lines.length; r++) {
    cv.put(x, y + 1 + r, B[5], bc, true); cv.put(x + w - 1, y + 1 + r, B[5], bc, true);
    let cx = x + 3 + Math.floor((inner - strWidth(lines[r])) / 2);
    for (const c of Array.from(shown[r] || '')) {
      // the newest letters stutter on, like a tube warming up
      const k2 = typing && idx >= n - 2 && H1(Math.floor(t * 20), idx, 33) < 0.45 ? 0.2 : 1;
      cx += cv.putc(cx, y + 1 + r, c, mix(scale(o.ink, 0.15), o.ink, Math.min(lit, k2) * buzz), true);
      idx++;
    }
  }
}

// ---------- the preset factory ----------
const CPS = 24;
function makeScene(def) {
  return (ctx) => {
    const noText = !!ctx.noText || !ctx.message;
    const msg = noText ? '' : ctx.message, total = Array.from(msg).length;
    const style = (def.message && def.message.style) || 'card';
    const typeStart = 1.2;
    const cad = cadence(msg, CPS, typeStart);
    let T;
    if (noText) T = loopTimes({ typeEnd: 4, hold: 6, erase: 0.01, exit: 0.01, gap: 0.01 });
    else if (style === 'banner') T = loopTimes({ typeEnd: 3.6, hold: 5 + total * 0.04, erase: 0.01, exit: 3.4, gap: 1.2 });
    else T = loopTimes({ typeEnd: cad.end, hold: 5, erase: total * 0.03 + 0.8, exit: 0.9, gap: 0.6 });
    const eraseDone = T.holdEnd + T.erase * 0.8;
    let last = 0;

    return {
      duration: T.holdEnd, timeline: T,
      frame(cv, t, final) {
        const dt = clamp(t - last, 0, 0.1); last = t;
        const lt = final ? T.holdEnd : T.local(t);
        const W = final ? Math.min(cv.w, 76) : cv.w;
        const lines = noText ? [] : wrap(msg, clamp(W - (style === 'banner' ? 24 : 12), 10, style === 'banner' ? 40 : 46));
        const H = final ? (noText ? 16 : 18 + lines.length) : cv.h;
        const e = {
          cv, W, H, t: final ? (def.still == null ? 2 : def.still) : t, lt, dt, final, ctx,
          rich: !!ctx.rich, deep: !!ctx.truecolor, hz: Math.round(H * (def.horizon || 0.7)),
          top: noText ? 0 : (final ? 1 : clamp(Math.round(H * 0.07), 1, 4)) + lines.length + 2,
        };
        def.draw(e);
        if (!noText) drawMessage(e, lines, lt);
        // the still postcard is smaller than the canvas: clip sprites that wandered outside it
        if (W < cv.w || H < cv.h) for (let y = 0; y < cv.h; y++) for (let x = y < H ? W : 0; x < cv.w; x++) {
          const i = y * cv.w + x; cv.ch[i] = ' '; cv.fg[i] = null; cv.bg[i] = null;
        }
        // additive glows can push channels past 255; clamp so 256-colour quantising stays right
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          const b = cv.bg[y * cv.w + x];
          if (b && (b[0] > 255 || b[1] > 255 || b[2] > 255)) cv.bg[y * cv.w + x] = [Math.min(255, b[0]), Math.min(255, b[1]), Math.min(255, b[2])];
        }
      },
    };

    function drawMessage(e, lines, lt) {
      const { cv, W, H, final, t } = e, m = def.message || {};
      const y = final ? 1 : clamp(Math.round(H * 0.07), 1, 4);
      const n = final ? Infinity : visibleCount(cad, T, lt, total);
      const shown = revealWrapped(lines, msg, n);
      const typing = !final && ((lt > typeStart - 0.05 && lt < T.typeEnd + 0.15) || (lt > T.holdEnd && lt < eraseDone + 0.1));
      const appear = final ? 1 : clamp((lt - (typeStart - 0.45)) / 0.4, 0, 1) * (1 - clamp((lt - eraseDone - 0.05) / 0.35, 0, 1));
      if (style === 'banner') banner(e, lines, lt, T, { y: m.y == null ? y : m.y, body: m.body || [235, 235, 240], trim: m.trim || [200, 40, 40], cloth: m.cloth || [250, 244, 225], hem: m.hem || [220, 60, 50], ink: m.ink || [200, 30, 40], rope: m.rope });
      else if (style === 'neon') neonSign(e, lines, shown, final ? 1 : clamp((lt - (typeStart - 0.7)) / 0.6, 0, 1) * (1 - clamp((lt - eraseDone - 0.05) / 0.5, 0, 1)), { ...m, y }, typing, n);
      else {
        const bw = Math.max(...lines.map(strWidth)) + 6;
        bubble(cv, {
          x: Math.floor((W - bw) / 2), y, lines, shown, tail: null, rich: e.rich, appear,
          fill: m.fill || [250, 250, 255], ink: m.ink || [30, 30, 50], shadow: e.rich && m.shadow ? m.shadow : null, bold: true,
          cursor: typing && (t * 2.4) % 2 < 1.4 ? (m.cursor || m.ink || [80, 80, 200]) : null,
          outline: m.outline || [200, 200, 220], outlineInk: [240, 240, 250],
        });
      }
    }
  };
}

module.exports = {
  makeScene, H1, mod, cell, paint, ridge, rect, disc, landmark, windows, pix, sky, addGlow, sun, moon, stars, clouds, haze,
  water, reflections, skyline, traffic, birds, fall, noise3, fbm, mix, scale, clamp, ramp, hash3, easeOut, easeIn, easeOutBack,
};
