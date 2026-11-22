'use strict';
const { charWidth } = require('./util');

class Canvas {
  constructor(w, h) {
    this.w = w; this.h = h;
    const n = w * h;
    this.ch = new Array(n).fill(' ');
    this.fg = new Array(n).fill(null);
    this.bg = new Array(n).fill(null);
    this.bold = new Uint8Array(n);
  }
  put(x, y, c, fg, bold) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = y * this.w + x;
    this.ch[i] = c; this.fg[i] = fg || null; this.bold[i] = bold ? 1 : 0;
  }
  // background colour of a cell (null = terminal default)
  setBg(x, y, c) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.bg[y * this.w + x] = c;
  }
  getBg(x, y) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return null;
    return this.bg[y * this.w + x];
  }
  // put one char, returns cells used
  putc(x, y, c, fg, bold) {
    const w = charWidth(c);
    if (w === 0) return 0;
    this.put(x, y, c, fg, bold);
    if (w === 2) this.put(x + 1, y, '', fg, bold);
    return w;
  }
  text(x, y, str, fg, bold) {
    let cx = Math.round(x);
    for (const c of str) cx += this.putc(cx, y, c, typeof fg === 'function' ? fg(c, cx - x) : fg, bold);
    return cx - x;
  }
  // multi-line art; spaces are transparent
  sprite(x, y, lines, color, bold) {
    lines.forEach((line, r) => {
      let cx = Math.round(x);
      for (const c of line) {
        if (c !== ' ') this.putc(cx, y + r, c, typeof color === 'function' ? color(c, r) : color, bold);
        cx += charWidth(c);
      }
    });
  }
  fill(x, y, w, h, c = ' ') {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.put(x + i, y + j, c, null);
  }

  cell(i, x, x1, mode) {
    let c = this.ch[i];
    if (c === '') { if (x > 0 && charWidth(this.ch[i - 1]) === 2) return null; c = ' '; }
    else if (charWidth(c) === 2 && (x + 1 > x1 || this.ch[i + 1] !== '')) c = ' ';
    const bg = this.bg[i];
    const style = c === ' ' && !bg ? '' : styleOf(c === ' ' ? null : this.fg[i], c === ' ' ? 0 : this.bold[i], bg, mode);
    return [c, style];
  }

  // mode: 'truecolor' | '256' | 'none'
  render(mode, trim) {
    let x0 = 0, x1 = this.w - 1, y0 = 0, y1 = this.h - 1;
    if (trim) {
      x0 = Infinity; x1 = -1; y0 = Infinity; y1 = -1;
      for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
        const i = y * this.w + x, c = this.ch[i];
        if ((c !== ' ' && c !== '') || (this.bg[i] && mode !== 'none')) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      }
      if (x1 < 0) return [];
      x1 = Math.min(this.w - 1, x1 + 1);
    }
    const rows = [];
    for (let y = y0; y <= y1; y++) {
      let s = '', cur = '';
      for (let x = x0; x <= x1; x++) {
        const r = this.cell(y * this.w + x, x, x1, mode);
        if (!r) continue;
        if (r[1] !== cur) { s += (cur ? '\x1b[0m' : '') + r[1]; cur = r[1]; }
        s += r[0];
      }
      if (cur) s += '\x1b[0m';
      rows.push(trim ? s.replace(/ +$/, '') : s);
    }
    return rows;
  }

  // Emit only the cells that changed since `prev` (a Canvas of the same size, or null for a
  // full repaint). Keeps terminal bandwidth low so 60fps stays smooth even over ssh.
  diff(prev, mode) {
    const n = this.w * this.h;
    const keys = (this.keys = new Array(n));
    const full = !prev || prev.w !== this.w || prev.h !== this.h || !prev.keys;
    let out = full ? '\x1b[0m\x1b[2J' : '', cur = null, at = -1;
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const i = y * this.w + x;
        const r = this.cell(i, x, this.w - 1, mode);
        if (!r) { keys[i] = ''; continue; }
        const [c, style] = r;
        const key = (keys[i] = style + c);
        if (!full && prev.keys[i] === key) continue;
        if (full && key === ' ') continue;
        if (at !== i) out += `\x1b[${y + 1};${x + 1}H`;
        if (style !== cur) { out += '\x1b[0m' + style; cur = style; }
        out += c;
        const cw = charWidth(c);
        at = x + cw < this.w ? i + cw : -1;
      }
    }
    return out + (cur ? '\x1b[0m' : '');
  }
}

function to256([r, g, b]) {
  if (Math.abs(r - g) < 12 && Math.abs(g - b) < 12) {
    if (r < 8) return 16; if (r > 248) return 231;
    return Math.round(((r - 8) / 247) * 23) + 232;
  }
  const q = (v) => Math.round((v / 255) * 5);
  return 16 + 36 * q(r) + 6 * q(g) + q(b);
}
// backgrounds are quantised a little so slow gradients don't repaint every frame
const qb = (v) => Math.min(255, Math.max(0, Math.round(v / 3) * 3));
function styleOf(fg, bold, bg, mode) {
  if (mode === 'none') return '';
  let s = bold ? '\x1b[1m' : '';
  if (fg) s += mode === 'truecolor'
    ? `\x1b[38;2;${fg[0] | 0};${fg[1] | 0};${fg[2] | 0}m`
    : `\x1b[38;5;${to256(fg)}m`;
  if (bg) s += mode === 'truecolor'
    ? `\x1b[48;2;${qb(bg[0])};${qb(bg[1])};${qb(bg[2])}m`
    : `\x1b[48;5;${to256(bg)}m`;
  return s;
}

module.exports = { Canvas };
