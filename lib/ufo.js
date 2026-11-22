'use strict';
// A flying saucer, raymarched: brushed-metal hull with panel seams, a ring of colour-cycling
// rim lights, and a little alien behind the glass dome. It swoops in, switches on a tractor
// beam and beams your message down letter by letter; later it pulls the letters back up,
// does a barrel roll for the road and zips off — then the whole thing loops.
const { strWidth, wrap, clamp, mix, hsl, hash3, noise3, rand, sstep, easeOut, easeIn, scale, norm3, clock, smin } = require('./util');
const { render3d } = require('./render3d');
const { backdrop, glow, cadence, vignette, loopTimes, eased } = require('./ui');

const CPS = 16;
const KEY = norm3(-0.4, 0.8, 0.45);
const HALF = norm3(KEY[0], KEY[1], KEY[2] + 1);
const U = { x: 0, y: 0, cr: 1, sr: 0, cp: 1, sp: 0, spin: 0, t: 0, beam: 0 };
let LX = 0, LY = 0, LZ = 0;

function local(x, y, z) {
  x -= U.x; y -= U.y;
  let t = x * U.cr + y * U.sr; y = -x * U.sr + y * U.cr; x = t;   // un-roll
  t = y * U.cp - z * U.sp; z = y * U.sp + z * U.cp; y = t;        // un-pitch
  LX = x; LY = y; LZ = z;
}
function parts() {
  const r = Math.hypot(LX, LZ), y = LY;
  return {
    hull: (Math.hypot(r / 0.88, y / 0.17) - 1) * 0.15,
    rim: Math.hypot(r - 0.84, y) - 0.045,
    dome: Math.max(Math.hypot(r, y - 0.08) - 0.36, 0.06 - y),
    belly: (Math.hypot(r / 0.36, (y + 0.12) / 0.11) - 1) * 0.1,
    r,
  };
}
function sdf(x, y, z) {
  local(x, y, z);
  const p = parts();
  return Math.min(smin(smin(p.hull, p.belly, 0.05), p.dome, 0.03), p.rim) * 0.85;
}

function material(x, y, z, nx, ny, nz, ao) {
  local(x, y, z);
  const p = parts();
  const dot = nx * KEY[0] + ny * KEY[1] + nz * KEY[2];
  const diff = clamp((dot + 0.3) / 1.3, 0, 1);
  const spec = Math.pow(Math.max(0, nx * HALF[0] + ny * HALF[1] + nz * HALF[2]), 40);
  const fres = Math.pow(1 - clamp(nz, 0, 1), 3);
  const ang = Math.atan2(LZ, LX);
  const m = Math.min(p.hull, p.rim, p.dome, p.belly);

  if (m === p.dome) { // glass dome with the pilot inside
    let c = mix([25, 40, 70], [120, 170, 220], diff);
    let b = 0.25 + 0.4 * diff + 0.6 * spec + 0.4 * fres;
    if (LZ > 0) {
      const hx = LX, hy = LY - 0.14;
      const head = Math.hypot(hx / 0.16, hy / 0.15);
      if (head < 1) {
        const eye = Math.min(Math.hypot((hx - 0.065) / 0.05, (hy - 0.01 - (hx - 0.065) * 0.5) / 0.028), Math.hypot((hx + 0.065) / 0.05, (hy - 0.01 + (hx + 0.065) * 0.5) / 0.028));
        const alien = eye < 1 ? [10, 15, 10] : mix([40, 110, 50], [140, 240, 120], diff);
        c = mix(alien, c, 0.3); b = eye < 1 ? 0.1 : 0.35 + 0.45 * diff;
      }
    }
    c = mix(c, [255, 255, 255], spec);
    return { b: clamp(b, 0, 1), c };
  }
  if (m === p.rim) { // rim with rotating lights
    const n = 12, a = ((ang - U.spin) / (Math.PI * 2)) * n, k = Math.round(a), d = Math.abs(a - k);
    if (d < 0.22) {
      const c = hsl(k * 30 + U.t * 120, 0.9, 0.62);
      return { b: 1, c, ch: d < 0.12 ? '●' : 'o' };
    }
    return { b: 0.2 + 0.5 * diff + 0.4 * spec, c: mix([40, 42, 55], [190, 195, 210], diff) };
  }
  if (m === p.belly) { // the beam emitter underneath
    const c = mix(mix([30, 35, 45], [120, 125, 140], diff), [120, 255, 215], U.beam * (0.7 + 0.3 * Math.sin(U.t * 20)));
    return { b: 0.2 + 0.4 * diff + 0.7 * U.beam, c };
  }
  // brushed hull with radial panel seams and a concentric seam
  const seam = Math.abs((((ang - U.spin) / (Math.PI * 2)) * 16 % 1 + 1) % 1 - 0.5) > 0.44 || Math.abs(p.r - 0.55) < 0.018;
  let b = 0.1 + 0.62 * diff * ao + 0.55 * spec + 0.3 * fres;
  let c = mix([38, 42, 58], [215, 222, 238], clamp(diff * ao, 0, 1));
  c = mix(c, [130, 160, 220], fres * 0.6);
  c = mix(c, [255, 255, 255], spec);
  if (LY < -0.02 && U.beam > 0) c = mix(c, [90, 220, 190], 0.25 * U.beam);   // beam light on the underside
  if (seam) { b *= 0.45; c = scale(c, 0.5); }
  return { b: clamp(b, 0, 1), c };
}

function ufo(ctx) {
  const rich = ctx.rich !== false, deep = !!ctx.truecolor;
  const msg = Array.from(ctx.message);
  const typeStart = 2.3, FLY = 0.75;
  const cad = cadence(ctx.message, CPS, typeStart);
  const T = loopTimes({ typeEnd: cad.end + FLY, hold: 4.6, erase: msg.length * 0.045 + 0.8, exit: 1.6, gap: 0.5 });
  const tick = clock();
  const stars = Array.from({ length: 90 }, () => ({ x: Math.random(), y: Math.random(), ph: rand(0, 6), s: Math.random() }));
  let motes = [];

  return {
    duration: T.holdEnd, timeline: T,
    frame(cv, t, final) {
      const dt = tick(t);
      const lt = final ? T.holdEnd - 1.5 : T.local(t);
      const W = cv.w, H = final ? 26 : cv.h;

      // ---- layout ----
      const lines = wrap(ctx.message, clamp(W - 10, 10, 50));
      const UW = clamp(Math.floor(W * 0.42), 22, Math.max(22, Math.floor(H * 2.4)));
      const upc = 1.8 / UW, upr = upc * 2;
      const hoverRow = final ? 0.55 / upr + 1 : clamp(Math.round(H * 0.25), 0.55 / upr + 1, H);
      const textTop = final ? Math.round(hoverRow + 0.24 / upr + 1) : Math.max(Math.round(hoverRow + 0.3 / upr + 5), H - lines.length - 4);
      const groundRow = textTop + lines.length + 1;
      const cx = W / 2, cy = hoverRow;

      // ---- flight path (world units, origin at the hover point) ----
      const inK = clamp(lt / 1.8, 0, 1), outK = clamp((lt - T.eraseEnd - 0.4) / (T.exit - 0.2), 0, 1);
      const flyIn = 1 - easeOut(inK);
      const zip = easeIn(outK) ** 1.6;
      const trick = clamp((lt - (T.typeEnd + 0.6)) / 1.3, 0, 1);         // barrel roll while holding
      const hop = Math.sin(Math.PI * clamp((lt - (T.typeEnd + 2.4)) / 0.9, 0, 1));
      U.x = (final ? 0 : 0.18 * Math.sin(lt * 0.8)) - flyIn * (cx * upc + 1.2) + zip * (cx * upc + 1.4);
      U.y = (final ? 0 : 0.05 * Math.sin(lt * 2.3)) + flyIn * flyIn * 0.9 + zip * 0.5 + hop * 0.22;
      const roll = (final ? 0.05 : 0.07 * Math.sin(lt * 1.7)) + flyIn * 0.45 - zip * 0.5 - eased(trick) * Math.PI * 2;
      const pitch = -0.22 - 0.04 * Math.sin(lt * 1.3) + hop * 0.1;   // seen from slightly above
      U.cr = Math.cos(roll); U.sr = Math.sin(roll); U.cp = Math.cos(pitch); U.sp = Math.sin(pitch);
      U.spin = lt * (1.6 + 4 * Math.sin(Math.PI * trick)); U.t = lt;
      const beamOn = final ? 0 : sstep(typeStart - 0.6, typeStart - 0.1, lt) * (1 - sstep(T.eraseEnd - 0.1, T.eraseEnd + 0.3, lt));
      U.beam = beamOn * (0.85 + 0.15 * noise3(lt * 6, 0, 0));
      const ux = cx + U.x / upc, uyRow = cy - U.y / upr;

      // ---- sky, hills, ground ----
      if (deep && !final) {
        const hill = (x) => groundRow - 2.5 - 3 * noise3(x * 0.035, 1.3, 0) - 1.5 * noise3(x * 0.11, 2.1, 0);
        backdrop(cv, (x, y) => {
          const v = 0.5 + 0.5 * vignette(cv, x, y);
          if (y >= groundRow) return scale(mix([12, 16, 14], [4, 6, 6], (y - groundRow) / Math.max(1, H - groundRow)), v);
          if (y >= hill(x)) return scale([9, 13, 20], v);
          return scale(mix([3, 4, 14], [16, 18, 40], (y / groundRow) ** 1.4), v);
        });
        glow(cv, W * 0.8, H * 0.12, 8, 4, [40, 40, 50], 0.8);               // the moon's halo
      }
      if (!final) {
        for (const s of stars) {
          const x = s.x * W, y = s.y * (groundRow - 5);
          const k = (0.3 + 0.7 * Math.max(0, Math.sin(t * (0.5 + s.s) + s.ph))) * s.s;
          if (k > 0.15) cv.put(x, y, k > 0.6 ? '+' : '·', mix([10, 10, 20], [170, 180, 230], k));
        }
        cv.put(W * 0.8, H * 0.12, '●', [235, 235, 210]);
      }

      // ---- the tractor beam ----
      const textW = Math.max(...lines.map(strWidth));
      const beamTop = uyRow + 0.18 / upr, topHW = 0.3 / upc, botHW = Math.max(textW / 2 + 3, 0.5 / upc);
      if (beamOn > 0.01) {
        for (let row = Math.ceil(beamTop); row <= groundRow; row++) {
          const k = (row - beamTop) / Math.max(1, groundRow - beamTop);
          const hw = topHW + (botHW - topHW) * k, bc = ux + (cx - ux) * k;
          for (let col = Math.floor(bc - hw); col <= Math.ceil(bc + hw); col++) {
            const e = 1 - Math.abs(col + 0.5 - bc) / hw;
            if (e <= 0) continue;
            const f = beamOn * (0.55 + 0.45 * Math.sin(row * 0.9 - lt * 9) ** 2) * (0.35 + 0.65 * e);
            if (deep && !final) { const b = cv.getBg(col, row) || [0, 0, 0]; cv.setBg(col, row, [b[0] + 10 * f, b[1] + 60 * f, b[2] + 50 * f]); }
            else if (e < 0.12) cv.put(col, row, col < bc ? '/' : '\\', scale([90, 220, 190], 0.3 + 0.4 * beamOn));
          }
        }
        if (deep && !final) glow(cv, cx, groundRow + 0.5, botHW + 4, 2.2, [20, 90, 75], beamOn);
        // sparkles drifting along the beam (down while delivering, up while collecting)
        if (!final && Math.random() < dt * 30 * beamOn) motes.push({ k: lt > T.holdEnd ? 1 : 0, u: rand(-1, 1), v: rand(0.25, 0.7) * (lt > T.holdEnd ? -1 : 1), life: 1 });
      }
      for (const m of motes) { m.k += m.v * dt; m.life -= dt * 0.6; }
      motes = motes.filter((m) => m.k >= 0 && m.k <= 1 && m.life > 0);
      for (const m of motes) {
        const row = beamTop + (groundRow - beamTop) * m.k, hw = topHW + (botHW - topHW) * m.k, bc = ux + (cx - ux) * m.k;
        cv.put(bc + m.u * hw * 0.8, row, m.life > 0.5 ? '✦' : '·', mix([10, 40, 40], [180, 255, 235], m.life * beamOn));
      }

      // ---- the saucer ----
      if (outK < 1) render3d(cv, { sdf, material, cx, cy, upr, bx: U.x, by: U.y, br: 0.95 });
      if (deep && !final && outK < 1) glow(cv, ux, uyRow, 0.9 / upc, 0.4 / upr, [26, 30, 50], 1);

      // ---- letters: beamed down one by one, later pulled back up ----
      if (ctx.noText) return;
      const pos = []; let idx = 0;
      lines.forEach((line, r) => {
        let x = Math.floor(cx - strWidth(line) / 2);
        for (const c of Array.from(line)) { pos.push([x, textTop + r, c]); x += strWidth(c); }
      });
      const srcIdx = []; { let k = 0; for (const [, , c] of pos) { while (k < msg.length && msg[k] !== c && /\s/.test(msg[k])) k++; srcIdx.push(k++); } }
      const n = pos.length;
      for (let i = 0; i < n; i++) {
        const [tx, ty, c] = pos[i];
        if (c === ' ') continue;
        const ti = cad.times[srcIdx[i]] ?? typeStart;
        const te = T.holdEnd + (n - 1 - i) * 0.045;
        let x = tx, y = ty, col, k;
        if (final) { cv.putc(x, y, c, [200, 255, 240], true); continue; }
        if (lt < ti) continue;
        if (lt < ti + FLY) {                      // falling down the beam
          k = easeOut((lt - ti) / FLY);
          x = ux + (tx - ux) * k + Math.sin((lt - ti) * 9 + i) * 2 * (1 - k); y = beamTop + (ty - beamTop) * k;
          col = mix([120, 255, 230], [255, 255, 255], k);
          cv.putc(x, y, k < 0.25 ? '·' : c, col, true);
        } else if (lt < te) {                     // landed
          const land = lt - ti - FLY;
          cv.putc(x, y - (land < 0.15 ? 0 : 0), c, mix([255, 255, 255], [200, 255, 240], clamp(land / 0.5, 0, 1)), true);
        } else if (lt < te + 0.7) {               // pulled back up
          k = easeIn((lt - te) / 0.7);
          x = tx + (ux - tx) * k + Math.sin((lt - te) * 9 + i) * 2 * k; y = ty + (beamTop - ty) * k;
          cv.putc(x, y, k > 0.75 ? '·' : c, mix([200, 255, 240], [60, 160, 140], k), k < 0.5);
        }
        idx++;
      }
    },
  };
}

module.exports = { ufo };
