'use strict';
// Depth-layered digital rain. Out of the rain, a 3D key assembles itself from the code —
// raymarched and lit, but drawn with the rain's own glyphs. While your message decrypts it
// spins; when the last character locks, the key turns in the lock and flashes.
const { strWidth, wrap, totalChars, clamp, mix, hash3, rand, pick, sstep, easeOut, norm3, clock, smin, sdBox, scale } = require('./util');
const { render3d } = require('./render3d');
const { backdrop, glow, vignette, loopTimes } = require('./ui');

const GLYPHS = Array.from('ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ012345789Z:.=*+-<>¦|');
const BG = [2, 10, 5];
const KEY = norm3(-0.5, 0.7, 0.55);
const HALF = norm3(KEY[0], KEY[1], KEY[2] + 1);
const K = { cy: 1, sy: 0, cz: 1, sz: 0, cx: 1, sx: 0, flash: 0 };

function keySdf(x, y, z) {
  // world -> key-local: spin around y, then turn about the shaft (x), then the diagonal tilt (z)
  let t = x * K.cz + y * K.sz; y = -x * K.sz + y * K.cz; x = t;
  t = x * K.cy - z * K.sy; z = x * K.sy + z * K.cy; x = t;
  t = y * K.cx - z * K.sx; z = y * K.sx + z * K.cx; y = t;
  x += 0.12;
  const bow = Math.hypot(Math.hypot(x + 0.55, y) - 0.28, z) - 0.085;
  const inner = Math.hypot(Math.hypot(x + 0.55, y) - 0.12, z) - 0.03;           // decorative inner ring
  const spoke = sdBox(x + 0.55, y, z, 0.2, 0.025, 0.025);
  const collar = Math.hypot(Math.hypot(y, z) - 0.085, x + 0.2) - 0.035;
  const shaft = sdBox(x - 0.25, y, z, 0.5, 0.055, 0.055, 0.04);
  let teeth = 1e9;
  const H = [0.2, 0.12, 0.17, 0.09];
  for (let i = 0; i < 4; i++) teeth = Math.min(teeth, sdBox(x - (0.42 + i * 0.1), y + 0.05 + H[i] / 2, z, 0.04, H[i] / 2, 0.045, 0.01));
  let d = Math.min(bow, Math.min(inner, spoke));
  d = smin(d, shaft, 0.06);
  d = Math.min(d, collar, teeth);
  return d;
}
function keyMat(x, y, z, nx, ny, nz, ao) {
  const dot = nx * KEY[0] + ny * KEY[1] + nz * KEY[2];
  const wrapL = clamp((dot + 0.35) / 1.35, 0, 1);
  const spec = Math.pow(Math.max(0, nx * HALF[0] + ny * HALF[1] + nz * HALF[2]), 30);
  const fres = Math.pow(1 - clamp(nz, 0, 1), 3);
  const b = clamp(0.1 + 0.75 * wrapL * ao + 0.5 * spec + 0.3 * fres + K.flash * 0.6, 0, 1);
  let c = mix([0, 70, 25], [70, 255, 125], wrapL * ao);
  c = mix(c, [210, 255, 225], clamp(spec + fres * 0.4, 0, 1));
  c = mix(c, [255, 255, 255], K.flash);
  return { b, c };
}

function matrix(ctx) {
  const n = totalChars(ctx.message);
  const lockStart = 1.9, spread = Math.min(2.4, 0.5 + n * 0.045);
  const lockAt = Array.from({ length: n }, (_, i) => lockStart + (i / Math.max(1, n - 1)) * spread + rand(0, 0.45));
  const decEnd = Math.max(lockStart, ...lockAt) + 0.3;
  // decrypt -> hold -> re-encrypt from the end -> key dissolves back into the rain -> repeat
  const T = loopTimes({ typeEnd: decEnd, hold: 4.8, erase: 1.8, exit: 1.4, gap: 0.4 });
  const relockAt = Array.from({ length: n }, (_, i) => T.holdEnd + ((n - 1 - i) / Math.max(1, n - 1)) * 1.2 + rand(0, 0.25));
  const tick = clock();
  const rich = ctx.rich !== false, deep = !!ctx.truecolor;
  let W = 0, H = 0, g = null, drops = [];
  const newDrop = (initial) => {
    const z = Math.random() ** 0.7 * 0.8 + 0.2;
    return { x: (Math.random() * W) | 0, y: initial ? rand(-H * 1.5, 0) : rand(-H * 0.4, -1), z, speed: (5 + 26 * z) * rand(0.8, 1.2), len: (5 + rand(0.4, 1) * H * (0.3 + 0.6 * z)) | 0 };
  };

  return {
    duration: T.holdEnd, timeline: T,
    frame(cv, t, final) {
      const dt = tick(t);
      const lt = final ? T.holdEnd : T.local(t);
      const noText = !!ctx.noText;
      const lines = noText ? [] : wrap(ctx.message, clamp(cv.w - 10, 8, 50));
      const inner = Math.max(26, ...lines.map(strWidth));
      const bw = noText ? 0 : inner + 6, bh = noText ? 0 : lines.length + 5;
      const done = final || (lt >= decEnd && lt < T.holdEnd);

      // ---- layout: key above the panel ----
      const keyRows = final ? 11 : clamp(Math.floor((cv.h - bh - 2) * 0.8), 0, 34);
      const showKey = keyRows >= 8;
      const top = Math.max(0, Math.floor((cv.h - (showKey ? keyRows + 1 : 0) - bh) / 2));
      const bx = Math.floor((cv.w - bw) / 2), by = top + (showKey ? keyRows + 1 : 0);

      if (!g || cv.w !== W || cv.h !== H) {
        W = cv.w; H = cv.h; g = Array.from({ length: W * H }, () => pick(GLYPHS));
        drops = Array.from({ length: Math.ceil(W * 1.15) }, () => newDrop(true)).sort((a, b) => a.z - b.z);
      }
      for (let k = 0; k < W * H * 0.015; k++) g[(Math.random() * W * H) | 0] = pick(GLYPHS);

      // ---- CRT backdrop: dark green gradient, scanlines, a glow behind the key ----
      if (deep && !final) {
        backdrop(cv, (x, y) => scale(mix([0, 17, 8], [0, 5, 3], y / H), (0.4 + 0.6 * vignette(cv, x, y)) * (y % 2 ? 0.8 : 1)));
        if (showKey) glow(cv, cv.w / 2, top + keyRows / 2, keyRows * 1.6, keyRows * 0.7, [0, 34, 14], easeOut((lt - 0.5) / 1.5) * (1 - clamp((lt - T.eraseEnd) / 1.2, 0, 1)) * (1 + (done && !final ? 2 * Math.max(0, 1 - (lt - decEnd - 0.5) / 0.6) : 0)));
      }

      // ---- rain ----
      if (!final) {
        for (let i = 0; i < drops.length; i++) {
          const d = drops[i];
          d.y += d.speed * dt;
          if (d.y - d.len > H) { drops[i] = newDrop(false); drops[i].z = d.z; continue; }
          const hy = Math.floor(d.y), frac = d.y - hy, depth = 0.3 + 0.7 * d.z;
          if (hy + 1 >= 0 && hy + 1 < H) cv.put(d.x, hy + 1, g[(hy + 1) * W + d.x], mix(BG, [150, 255, 170], frac * 0.55 * depth));
          for (let k = 0; k <= d.len; k++) {
            const yy = hy - k;
            if (yy < 0 || yy >= H) continue;
            if (k === 0) { cv.put(d.x, yy, pick(GLYPHS), mix(BG, [225, 255, 230], depth), d.z > 0.6); continue; }
            const b = (1 - k / d.len) ** 1.5;
            const c = k < 3 ? mix([90, 255, 130], [20, 220, 80], k / 3) : mix([0, 40, 14], [20, 210, 75], b);
            cv.put(d.x, yy, g[yy * W + d.x], mix(BG, c, depth * (k < 3 ? 1 : 0.35 + 0.65 * b)));
          }
        }
        // fade in, and dim a soft halo around the panel and the key
        const fadeIn = easeOut(t / 1.4);
        const kcx = cv.w / 2, kcy = top + keyRows / 2;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          const i = y * W + x, f = cv.fg[i];
          if (!f) continue;
          const dx = Math.max(bx - x, x - (bx + bw - 1), 0) / 6, dy = Math.max(by - y, y - (by + bh - 1), 0) / 2.5;
          let k = noText ? 1 : 0.25 + 0.75 * sstep(0, 1, Math.hypot(dx, dy));
          if (showKey) k *= 0.45 + 0.55 * sstep(0.35, 1.1, Math.hypot((x - kcx) / (keyRows * 1.3), (y - kcy) / (keyRows * 0.55)));
          k *= fadeIn;
          if (k < 1) cv.fg[i] = mix(BG, f, k);
        }
      }

      // ---- the key, made of code ----
      if (showKey) {
        const spin = final ? 0.35 : 0.65 * Math.sin(t * 0.8);
        const turn = final ? 0 : easeOut((lt - decEnd) / 0.8) * Math.PI * 2;   // unlock: a full twist in the lock
        K.cy = Math.cos(spin); K.sy = Math.sin(spin);
        K.cx = Math.cos(turn); K.sx = Math.sin(turn);
        K.cz = Math.cos(-0.35); K.sz = Math.sin(-0.35);
        K.flash = final ? 0 : Math.max(0, 1 - Math.abs(lt - decEnd - 0.5) / 0.3) * 0.85;
        const upr = 1.4 / keyRows;
        const assemble = final ? 2 : clamp((lt - 0.6) / 1.3, 0, 1) * (1 - clamp((lt - T.eraseEnd + 0.3) / 1.1, 0, 1));
        render3d(cv, {
          sdf: keySdf, material: keyMat, cx: cv.w / 2, cy: top + keyRows / 2, upr, bx: 0, by: 0, br: 1.05,
          edges: false, ramp: ' .:-=+*#%@',
          put: (col, row, ch, c, b) => {
            const h = hash3(col, row, 1);
            if (h > assemble) {                    // not assembled yet: a dim flicker of code
              if (h < assemble + 0.25 && !final) cv.put(col, row, pick(GLYPHS), mix(BG, [30, 160, 70], 0.6));
              return;
            }
            const glyph = (b > 0.7 && !final) ? pick(GLYPHS) : g[row * W + col];
            cv.put(col, row, glyph, c, b > 0.62);
          },
        });
      }

      // ---- panel: a little terminal window ----
      if (noText) return;
      cv.fill(bx, by, bw, bh);
      const pulse = final ? 0.5 : 0.5 + 0.5 * Math.sin(t * 3);
      const border = (i) => mix([0, 110, 45], [60, 255, 120], final ? 0.4 : 0.25 * pulse + 0.6 * Math.exp(-(((i - ((t * 30) % (bw * 2 + 20))) / 4) ** 2)));
      const label = done ? 'transmission decoded' : lt >= T.eraseEnd ? 'connection closed' : lt >= T.holdEnd ? 'scrambling' : 'incoming transmission';
      if (rich) {
        for (let r = 0; r < bh; r++) for (let x = bx; x < bx + bw; x++) cv.setBg(x, by + r, r === 0 ? (done ? [40, 200, 100] : [0, 120, 55]) : [2, 18, 9]);
        cv.text(bx + 2, by, '● ● ●', (c, i) => [[0, 50, 20], [0, 70, 28], [0, 90, 36]][i >> 1]);
        cv.text(Math.max(bx + 9, bx + Math.floor((bw - label.length) / 2)), by, label, [0, 26, 10], true);
        cv.text(bx, by + bh - 1, '▀'.repeat(bw), [0, 70, 30]);
        for (let r = 1; r < bh - 1; r++) { cv.put(bx, by + r, '▏', border(bw + r)); cv.put(bx + bw - 1, by + r, '▕', border(bw + r)); }
      } else {
        cv.text(bx, by, '┌─ ' + label + ' ' + '─'.repeat(Math.max(0, bw - 5 - label.length)) + '┐', (c, i) => (i >= 3 && i < 3 + label.length ? [170, 255, 190] : border(i)));
        cv.text(bx, by + bh - 1, '└' + '─'.repeat(bw - 2) + '┘', (c, i) => border(bw * 2 - i));
        for (let r = 1; r < bh - 1; r++) { cv.put(bx, by + r, '│', border(bw + r)); cv.put(bx + bw - 1, by + r, '│', border(bw + r)); }
      }
      let idx = 0;
      lines.forEach((line, r) => {
        let cx = bx + 3 + Math.floor((inner - strWidth(line)) / 2);
        for (const c of line) {
          const s = lockAt[idx] || 0, e = relockAt[idx] || 0; idx++;
          if (c !== ' ') {
            if (final || (lt >= s && lt < e)) cv.putc(cx, by + 2 + r, c, mix([255, 255, 255], [175, 255, 195], (final ? 9 : lt - s) / 0.45), true);
            else if (lt >= e && lt < e + 0.5) {        // re-encrypting: scrambles, then fades out
              const k = 1 - (lt - e) / 0.5;
              cv.put(cx, by + 2 + r, GLYPHS[(hash3(idx, Math.floor(t * 18), 7) * GLYPHS.length) | 0], mix([0, 50, 18], [60, 240, 110], k), k > 0.6);
            } else if (lt > s - 1.3 && lt < s && lt > 0.6) {
              const k = clamp((lt - (s - 1.3)) / 1.3, 0, 1);
              cv.put(cx, by + 2 + r, GLYPHS[(hash3(idx, Math.floor(t * 18), 7) * GLYPHS.length) | 0], mix([0, 70, 25], [40, 230, 90], k), k > 0.8);
            }
          }
          cx += strWidth(c);
        }
      });
      const sy = by + bh - 2, sx = bx + 3;
      if (done) cv.text(sx, sy, '▸ access granted ✓', [90, 230, 125], true);
      else if (lt >= T.eraseEnd) cv.text(sx, sy, '▸ signal lost', (c, i) => mix([20, 70, 35], [70, 180, 100], 0.5 + 0.5 * Math.sin(t * 6)));
      else {
        const enc = lt >= T.holdEnd;
        const p = enc ? 1 - relockAt.filter((e) => lt >= e).length / Math.max(1, n) : clamp(lockAt.filter((s) => lt >= s).length / Math.max(1, n), 0, 1);
        const barW = Math.max(6, inner - 18), fillN = p * barW;
        cv.text(sx, sy, enc ? '▸ encrypting' : '▸ decrypting', [70, 200, 100]);
        for (let i = 0; i < barW; i++) {
          if (rich) {     // a solid bar with a sub-cell leading edge
            const f = clamp(fillN - i, 0, 1);
            cv.setBg(sx + 13 + i, sy, f >= 1 ? [50, 220, 105] : [0, 42, 18]);
            if (f > 0 && f < 1) cv.put(sx + 13 + i, sy, '▏▎▍▌▋▊▉'[Math.min(6, Math.floor(f * 7))], [50, 220, 105]);
          } else cv.put(sx + 13 + i, sy, i < fillN ? '▰' : '▱', i < fillN ? [80, 255, 130] : [0, 80, 30]);
        }
        cv.text(sx + 14 + barW, sy, String(Math.round(p * 100)).padStart(3) + '%', [150, 255, 170]);
      }
    },
  };
}

module.exports = { matrix };
