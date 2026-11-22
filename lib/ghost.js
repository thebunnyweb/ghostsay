'use strict';
// A real 3D ghost: a signed-distance model, sphere-traced per terminal cell with an
// orthographic camera, lit with key / rim / specular / ambient occlusion, then mapped to
// a character density ramp. Silhouettes are 2x2 supersampled so the outline picks
// shape-aware glyphs ( / \ ( ) _ ' ) instead of jagged stair-steps.
const { wrap, strWidth, clamp, mix, scale } = require('./util');
const { bubble, backdrop, glow, cadence, revealWrapped, vignette, loopTimes, eased, visibleCount } = require('./ui');
const { render3d } = require('./render3d');

const CPS = 26;
const TAU = Math.PI * 2;

const smin = (a, b, k) => { const h = clamp(0.5 + (0.5 * (b - a)) / k, 0, 1); return b * (1 - h) + a * h - k * h * (1 - h); };
const smax = (a, b, k) => -smin(-a, -b, k);
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const easeOutBack = (t) => { t = clamp(t, 0, 1); const c = 1.6; return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2; };
const easeOut = (t) => 1 - (1 - clamp(t, 0, 1)) ** 3;
const easeIn = (t) => clamp(t, 0, 1) ** 2;
const norm3 = (x, y, z) => { const m = Math.hypot(x, y, z); return [x / m, y / m, z / m]; };

const KEY = norm3(-0.5, 0.75, 0.55);
const HALF = norm3(KEY[0], KEY[1], KEY[2] + 1);

// pose shared by the sdf (set once per frame)
const P = { x: 0, y: 0, t: 0, s: 1, sy: 1, cy: 1, sy_: 0, cp: 1, sp: 0, cr: 1, sr: 0, lagX: 0, lagZ: 0, armL: 0, armR: 0 };
// head-local coordinates of the last sdf evaluation (for face features)
let LX = 0, LY = 0, LZ = 0;

function sdf(wx, wy, wz) {
  // world -> local: translate, un-roll (z), un-pitch (x), un-yaw (y), un-scale
  let x = (wx - P.x) / P.s, y = (wy - P.y) / P.s, z = wz / P.s;
  let t = x * P.cr + y * P.sr; y = -x * P.sr + y * P.cr; x = t;
  t = y * P.cp - z * P.sp; z = y * P.sp + z * P.cp; y = t;
  t = x * P.cy - z * P.sy_; z = x * P.sy_ + z * P.cy; x = t;
  y /= P.sy; const k = Math.sqrt(P.sy); x *= k; z *= k;   // volume-preserving squash
  LX = x; LY = y; LZ = z;

  // the skirt trails behind the head
  const below = Math.max(0, 0.25 - y), lag = below * below;
  const bx = x - P.lagX * lag, bz = z - P.lagZ * lag;

  const head = Math.hypot(x, y - 0.3, z) - 0.5;
  const r = 0.46 + 0.11 * sstep(0.1, -0.75, y);
  let body = Math.hypot(bx, bz) - r;
  const a = Math.atan2(bz, bx);
  const hem = -0.68 + 0.1 * Math.sin(a * 6 + P.t * 2.6) + 0.035 * Math.sin(a * 3 - P.t * 1.7);
  body = smax(body, hem - y, 0.07);
  body = smax(body, y - 0.35, 0.05);
  let d = smin(head, body, 0.1);

  const al = Math.hypot((x + 0.58) * 1.05, (y + 0.05 - P.armL) * 0.8, z - 0.05) - 0.13;
  const ar = Math.hypot((x - 0.58) * 1.05, (y + 0.05 - P.armR) * 0.8, z - 0.05) - 0.13;
  d = smin(d, Math.min(al, ar), 0.09);
  return d * P.s * Math.min(P.sy, 1 / Math.sqrt(P.sy)) * 0.85;
}

// material of a hit point -> { b (0..1 brightness), c (rgb) }
function shade(u, v, z, nx, ny, nz, ao, face) {
  sdf(u, v, z); // refresh local coords for the face
  const lx = LX, ly = LY, lz = LZ;

  const dot = nx * KEY[0] + ny * KEY[1] + nz * KEY[2];
  const wrapL = clamp((dot + 0.45) / 1.45, 0, 1);
  const spec = Math.pow(Math.max(0, nx * HALF[0] + ny * HALF[1] + nz * HALF[2]), 28) * sstep(0.1, 0.45, ly);
  const fres = Math.pow(1 - clamp(nz, 0, 1), 3);
  const sss = sstep(-0.1, -0.7, ly) * 0.18;                   // the skirt glows faintly, like it's thin
  const lit = wrapL * ao * (0.82 + 0.18 * sstep(-0.3, 0.4, ly)); // a touch dimmer toward the hem
  let br = 0.08 + 0.74 * lit + 0.4 * spec + 0.22 * fres + sss;

  let col = mix([34, 40, 105], [228, 234, 255], Math.pow(lit, 0.8));
  col = mix(col, [150, 175, 255], sss * 2);
  col = mix(col, [110, 185, 255], fres * 0.85);
  col = mix(col, [255, 255, 255], spec);

  // face, on the front of the head
  if (lz > 0) {
    const ex = Math.abs(lx) - 0.17, ey = ly - 0.35;
    const eye = Math.hypot(ex / 0.08, ey / (0.12 * face.blink));
    const mo = Math.hypot(lx / (0.05 + 0.02 * face.mouth), (ly - 0.16) / (0.035 + 0.05 * face.mouth));
    const hole = 1 - sstep(0.85, 1.15, Math.min(eye, mo));
    if (hole > 0) {
      br *= 1 - hole;
      col = mix(col, [14, 14, 34], hole);
    }
    const blush = Math.exp(-(((Math.abs(lx) - 0.3) / 0.075) ** 2 + ((ly - 0.2) / 0.045) ** 2));
    if (blush > 0.04) col = mix(col, [255, 135, 190], blush * 0.75);
  }
  return { b: clamp(br, 0, 1), c: col };
}

function ghost(ctx) {
  const rich = ctx.rich !== false, deep = !!ctx.truecolor, noText = !!ctx.noText;
  const typeStart = 1.7;
  const cad = cadence(ctx.message, CPS, typeStart);
  const typeEnd = cad.end, total = Array.from(ctx.message).length;
  // intro + speak -> tricks (spin, look around, wave, hop) -> un-say it -> sink away -> repeat
  const T = loopTimes({ typeEnd, hold: 6.2, erase: total * 0.03 + 0.8, exit: 1.5, gap: 0.6 });
  const eraseDone = () => T.holdEnd + T.erase * 0.8;
  let motes = [], last = 0;

  return {
    duration: T.holdEnd, timeline: T,
    frame(cv, t, final) {
      const dt = clamp(t - last, 0, 0.1); last = t;
      const lt = final ? T.holdEnd : T.local(t);
      const W = cv.w, H = final ? 40 : cv.h;
      const n = final ? Infinity : visibleCount(cad, T, lt, total);
      const erasing = !final && lt > T.holdEnd && lt < eraseDone() + 0.1;
      const typing = !final && !noText && ((lt > typeStart - 0.05 && lt < typeEnd + 0.15) || erasing);
      const talk = final || noText ? 0 : Math.max(
        sstep(typeStart - 0.6, typeStart, lt) * (1 - sstep(typeEnd + 0.3, typeEnd + 1.0, lt)),
        sstep(T.holdEnd - 0.6, T.holdEnd, lt) * (1 - sstep(eraseDone() + 0.2, eraseDone() + 0.7, lt)));

      // ---- layout: a big Boo, speech bubble beside (or above) the head ----
      const gw = (gh) => Math.ceil(gh * 1.22);
      let GH = final ? 22 : clamp(Math.floor(H * 0.84), 9, 70);
      let lines = wrap(ctx.message, clamp(Math.floor(W * 0.36) - 4, 14, 44));
      let bw = Math.max(...lines.map(strWidth)) + 6;
      let side = gw(GH) + bw + 5 <= W;
      if (!side) {
        const gh2 = Math.floor((W - bw - 5) / 1.22);
        if (gh2 >= Math.max(12, GH * 0.7)) { GH = gh2; side = true; }
      }
      if (!side) {
        lines = wrap(ctx.message, clamp(W - 10, 10, 52)); bw = Math.max(...lines.map(strWidth)) + 6;
        GH = clamp(H - lines.length - 6, 8, 70);
      }
      if (noText) { side = false; lines = []; GH = final ? 22 : clamp(Math.floor(H * 0.84), 9, 70); }
      GH = Math.min(GH, Math.floor((W - 4) / 1.22));
      const bh = noText ? 0 : lines.length + 2;
      const upr = 2.3 / GH, upc = upr / 2;
      let cx, cy, bx, by;
      if (side) {
        const total = gw(GH) + 3 + bw, left = Math.floor((W - total) / 2);
        cx = left + gw(GH) / 2; cy = Math.floor((H - GH) / 2) + GH * 0.44;
        bx = left + gw(GH) + 3;
        by = clamp(Math.round(cy - 0.75 / upr - bh / 2), 1, H - bh - 2);
      } else if (noText) {
        cx = W / 2; cy = Math.floor((H - GH) / 2) + GH * 0.44; bx = by = 0;
      } else {
        const top = Math.max(0, Math.floor((H - bh - 3 - GH) / 2));
        bx = Math.floor((W - bw) / 2); by = top;
        cy = top + bh + 2 + 0.88 / upr; cx = W / 2;
      }

      // ---- pose: pure functions of t, so loops and speed changes stay smooth ----
      const tt = final ? 0.9 : t;
      const appear = final ? 1 : clamp((lt - 0.15) / 1.2, 0, 1);
      const exitK = final ? 0 : clamp((lt - eraseDone() - 0.45) / (T.exit - 0.1), 0, 1);
      const vis = final ? 1 : easeOut((lt - 0.1) / 1.3) * (1 - exitK ** 1.5);
      const pop = final ? 1 : easeOutBack(appear);
      // choreography while holding: a full spin, a look around with a wave, then a hop
      const h = final ? -9 : lt - (typeEnd + 1.0);
      const spin = eased(h / 1.5) * Math.PI * 2;
      const lookEnv = Math.sin(Math.PI * clamp((h - 1.9) / 1.9, 0, 1));
      const look = lookEnv * 0.75 * Math.sin(Math.PI * 2 * clamp((h - 1.9) / 1.9, 0, 1));
      const hopK = Math.sin(Math.PI * clamp((h - 4.1) / 0.75, 0, 1));
      const squash = Math.exp(-(((h - 4.1) / 0.09) ** 2)) + Math.exp(-(((h - 4.85) / 0.09) ** 2));
      const driftX = 0.1 * Math.sin(tt * 0.7), vx = 0.07 * Math.cos(tt * 0.7);
      const bob = 0.055 * Math.sin(tt * 1.9) + 0.015 * Math.sin(tt * 3.3);
      const vy = 0.1 * Math.cos(tt * 1.9);
      const turnTo = side ? 0.38 : 0;                                   // turn toward the bubble while talking
      const idle = 0.5 * Math.sin(tt * 0.55) + 0.12 * Math.sin(tt * 1.7);
      const yaw = final ? (side ? 0.3 : 0.25) : idle * (1 - talk) * (1 - lookEnv) + (turnTo + 0.06 * Math.sin(tt * 1.3)) * talk + spin + look;
      const pitch = 0.1 + 0.04 * Math.sin(tt * 1.9 + 0.8) - 0.05 * talk;
      const roll = final ? (side ? -0.05 : 0.04) : -vx * 0.7 + 0.03 * Math.sin(tt * 1.3) - 0.06 * talk * (side ? 1 : 0);
      P.x = final ? 0 : driftX;
      P.y = (final ? 0 : bob + hopK * 0.3) - (1 - pop) * 1.3 - easeIn(exitK) * 1.6;
      P.t = tt; P.s = 0.75 + 0.25 * pop - 0.2 * exitK;
      P.sy = final ? 1 : 1 + 0.035 * Math.sin(tt * 3.8) + vy * 0.25 + 0.12 * hopK - 0.16 * squash;
      P.cy = Math.cos(yaw); P.sy_ = Math.sin(yaw);
      P.cp = Math.cos(pitch); P.sp = Math.sin(pitch);
      P.cr = Math.cos(roll); P.sr = Math.sin(roll);
      P.lagX = final ? -0.1 : -vx * 1.3 + 0.06 * Math.sin(tt * 1.3 - 1);
      P.lagZ = 0.08 * Math.sin(tt * 1.1);
      P.armL = final ? 0.02 : 0.04 * Math.sin(tt * 3);
      P.armR = final ? 0.12 : 0.04 * Math.sin(tt * 3 + 1) + talk * (0.12 + 0.06 * Math.sin(tt * 7)) + lookEnv * (0.26 + 0.1 * Math.sin(tt * 13));   // gestures, waves
      P.armL += hopK * 0.15;
      const bl = (tt % 3.9) / 3.9;
      // the mouth opens on each typed letter and closes on spaces / pauses
      const lastIdx = Math.min(n, cad.times.length) - 1;
      const lastAge = lastIdx >= 0 ? lt - cad.times[lastIdx] : 9;
      const lastCh = lastIdx >= 0 ? Array.from(ctx.message)[lastIdx] : ' ';
      const open = erasing ? 0.5 + 0.5 * Math.sin(tt * 21) : typing && !/[\s.,!?;:]/.test(lastCh) ? Math.max(0, 1 - lastAge * 9) : 0;
      const face = {
        blink: final ? 1 : 1 - 0.9 * Math.max(0, 1 - Math.abs(bl - 0.96) / 0.025),
        mouth: final ? 0.25 : 0.2 + 0.8 * Math.max(open, typing ? 0.25 + 0.2 * Math.sin(tt * 23) : 0),
      };

      // ---- backdrop: night gradient, vignette, a soft glow around Boo ----
      if (deep && !final) {
        backdrop(cv, (x, y) => scale(mix([13, 15, 36], [4, 5, 13], y / H), 0.45 + 0.55 * vignette(cv, x, y)));
        glow(cv, cx + P.x / upc, cy - 0.1 / upr, GH * 1.25, GH * 0.62, [16, 24, 66], vis * (0.85 + 0.15 * Math.sin(tt * 1.9)));
      }

      // ---- ground shadow ----
      const groundRow = cy + 0.9 / upr;
      const lift = clamp((P.y + 0.05) / 0.12, -1, 3);
      const srx = (0.6 - 0.05 * lift) * P.s / upc, sry = Math.max(0.9, GH / 30);
      for (let row = Math.floor(groundRow - sry); row <= Math.ceil(groundRow + sry); row++) {
        for (let col = Math.floor(cx + P.x / upc - srx - 1); col <= Math.ceil(cx + P.x / upc + srx + 1); col++) {
          const q = ((col + 0.5 - cx - P.x / upc) / srx) ** 2 + ((row + 0.5 - groundRow) / sry) ** 2;
          const k = (1 - q) * vis * (0.7 - 0.1 * lift) * pop;
          if (k > 0.08) cv.put(col, row, ' .·:-='[clamp(Math.round(k * 5), 1, 5)], mix([8, 10, 26], [52, 58, 105], k));
        }
      }

      // ---- motes ----
      if (!final) {
        if (Math.random() < dt * 11) motes.push({ x: cx + (Math.random() - 0.5) * GH * 3.2, y: cy + GH * (0.2 + Math.random() * 0.4), vy: -(0.8 + Math.random() * 1.8), ph: Math.random() * TAU, life: 1 });
        for (const m of motes) { m.y += m.vy * dt; m.x += Math.sin(t * 1.3 + m.ph) * dt * 1.2; m.life -= dt * 0.3; }
        motes = motes.filter((m) => m.life > 0 && m.y > 0);
        for (const m of motes) {
          const tw = 0.6 + 0.4 * Math.sin(t * 7 + m.ph * 3), k = Math.sin(m.life * Math.PI) * tw * vis;
          cv.put(m.x, m.y, k > 0.75 ? '+' : k > 0.45 ? '·' : '.', mix([10, 14, 36], [120, 150, 255], k));
        }
      }

      // ---- raymarch the ghost ----
      render3d(cv, {
        sdf, cx, cy, upr, vis, bx: P.x, by: P.y - 0.1 * P.s, br: 1.15 * P.s,
        material: (u, v, z, nx, ny, nz, ao) => shade(u, v, z, nx, ny, nz, ao, face),
        put: (col, row, ch, c, b) => cv.put(col, row, ch, mix([4, 6, 18], c, 0.25 + 0.75 * vis), b > 0.82),
      });

      // ---- speech bubble, its tail on Boo's mouth ----
      const headX = cx + (P.x + 0.3 * Math.sin(yaw) * P.s) / upc;
      const tail = side
        ? [cx + (P.x + 0.6 * P.s) / upc, cy - (P.y + 0.3 * P.s) / upr]
        : [headX, cy - (P.y + 0.86 * P.s) / upr];
      if (noText) return;
      const shown = revealWrapped(lines, ctx.message, n);
      bubble(cv, {
        x: bx, y: by, lines, shown, tail, rich,
        appear: final ? 1 : clamp((lt - (typeStart - 0.45)) / 0.4, 0, 1) * (1 - clamp((lt - eraseDone() - 0.05) / 0.35, 0, 1)),
        fill: [236, 240, 255], ink: [24, 28, 64], shadow: deep && !final ? [3, 4, 11] : null, bold: true,
        cursor: typing && !final && (t * 2.4) % 2 < 1.4 ? [70, 90, 200] : null,
        outline: [150, 165, 255], outlineInk: [235, 240, 255],
      });
    },
  };
}

module.exports = { ghost };
