'use strict';
// A mirrored disco ball, raymarched: every tile is a flat mirror that reflects coloured stage
// lights, so it glitters as it spins. Its reflections sweep across the room as light spots;
// confetti cannons, fireworks, a beat-synced rainbow bubble and a perspective dance floor.
const { strWidth, wrap, reveal, totalChars, clamp, mix, hsl, bubbleSize, drawBubble, hash3,
  rand, pick, sstep, easeOutBack, scale, norm3, clock, smin } = require('./util');
const { render3d } = require('./render3d');
const { bubble, backdrop, glow, cadence, revealWrapped, vignette, loopTimes, visibleCount } = require('./ui');

const CPS = 28;
const BEAT = 60 / 124;
const PARTY = [[255, 85, 160], [255, 210, 60], [70, 215, 255], [130, 255, 110], [255, 140, 50], [185, 120, 255]];
const SPIN = [['■', '▬', '-', '▬'], ['│', '╱', '─', '╲'], ['●', '◖', '|', '◗'], ['✦', '✧', '·', '✧']];
const LIGHTS = [
  { d: norm3(-0.65, 0.45, 0.6), c: [255, 70, 165] },
  { d: norm3(0.7, 0.35, 0.6), c: [60, 200, 255] },
  { d: norm3(0.05, 0.8, 0.6), c: [255, 225, 130] },
  { d: norm3(-0.25, -0.35, 0.9), c: [160, 110, 255] },
  { d: norm3(0.45, -0.2, 0.85), c: [120, 255, 150] },
];
const KEY = norm3(-0.5, 0.6, 0.65);
let NB = 12; // latitude bands of mirror tiles (scaled to the ball's size)
const R = 0.62;

const B = { y: 0, rot: 0, cr: 1, sr: 0, kick: 0, t: 0 };
function sdf(x, y, z) {
  y -= B.y;
  const ball = Math.hypot(x, y, z) - R;
  const cap = Math.max(Math.hypot(x, z) - 0.09, Math.abs(y - R - 0.02) - 0.07);
  return smin(ball, cap, 0.03);
}

// which mirror tile a (ball-local) direction falls on -> facet normal + grout distance + id
function tile(lx, ly, lz) {
  const lat = Math.asin(clamp(ly, -1, 1));
  const bf = ((lat / Math.PI) + 0.5) * NB, band = Math.min(NB - 1, Math.floor(bf));
  const latc = ((band + 0.5) / NB - 0.5) * Math.PI;
  const nT = Math.max(4, Math.round(NB * 2 * Math.cos(latc)));
  const lon = Math.atan2(lx, lz), tf = ((lon + Math.PI) / (2 * Math.PI)) * nT, j = Math.floor(tf) % nT;
  const lonc = ((j + 0.5) / nT) * 2 * Math.PI - Math.PI;
  const grout = Math.min(bf - band, 1 - (bf - band), (tf - Math.floor(tf)) * 1.0, 1 - (tf - Math.floor(tf)));
  return { n: [Math.cos(latc) * Math.sin(lonc), Math.sin(latc), Math.cos(latc) * Math.cos(lonc)], grout, id: band * 97 + j };
}

let SPARKS = [];
function material(x, y, z, nx, ny, nz, ao) {
  if (y - B.y > R - 0.02) { // the cap
    const d = clamp(nx * KEY[0] + ny * KEY[1] + nz * KEY[2], 0, 1);
    return { b: 0.25 + 0.5 * d, c: mix([60, 60, 70], [200, 200, 215], d) };
  }
  // into ball-local space (spin around y)
  const lx = nx * B.cr - nz * B.sr, lz = nx * B.sr + nz * B.cr;
  const T = tile(lx, ny, lz);
  // facet normal back to world
  const fx = T.n[0] * B.cr + T.n[2] * B.sr, fy = T.n[1], fz = -T.n[0] * B.sr + T.n[2] * B.cr;
  // mirror reflection of the view ray (0,0,-1)
  const rx = 2 * fz * fx, ry = 2 * fz * fy, rz = -1 + 2 * fz * fz;
  let peak = 0, pc = null;
  for (const L of LIGHTS) {
    const s = Math.pow(Math.max(0, rx * L.d[0] + ry * L.d[1] + rz * L.d[2]), 60) * (1 + 0.5 * B.kick);
    if (s > peak) { peak = s; pc = L.c; }
  }
  const h = hash3(T.id, 3, 5);
  const twinkle = Math.max(0, Math.sin(B.t * (3 + h * 5) + h * 40)) ** 30;   // random tiles flash
  const diff = clamp((nx * KEY[0] + ny * KEY[1] + nz * KEY[2] + 0.3) / 1.3, 0, 1);
  const env = 0.1 + 0.18 * clamp(ry * 0.5 + 0.5, 0, 1) + 0.12 * h;            // dim room reflected in the mirror
  let b = env + 0.35 * diff * ao + peak * 0.9 + twinkle * 0.7;
  let c = mix([40, 42, 58], [175, 182, 210], clamp(env * 1.6 + diff * 0.45, 0, 1));
  if (pc) c = mix(c, peak > 1.1 ? mix(pc, [255, 255, 255], 0.5) : pc, Math.min(1, peak * 1.3));
  if (twinkle > 0.05) c = mix(c, [255, 255, 255], twinkle);
  if (T.grout < 0.07) { b *= 0.5; c = scale(c, 0.5); }
  if (peak + twinkle > 0.85) SPARKS.push([x, y]);
  return { b: clamp(b, 0, 1), c };
}

function party(ctx) {
  const typeStart = 1.3;
  const rich = ctx.rich !== false, deep = !!ctx.truecolor;
  const cad = cadence(ctx.message, CPS, typeStart);
  const total = Array.from(ctx.message).length;
  // ball drops, cannons, speech -> hold -> words pop away in confetti puffs -> ball rises -> repeat
  const T = loopTimes({ typeEnd: cad.end, hold: 4.8, erase: total * 0.03 + 0.8, exit: 1.5, gap: 0.5 });
  const eraseDone = T.holdEnd + T.erase * 0.8;
  const tick = clock();
  let confetti = [], rockets = [], sparks = [], fired = false, nextRocket = 1.6, cycle = -1, prevN = 0;
  const spots = Array.from({ length: 70 }, () => ({ lat: rand(-1.1, 1.1), lon: rand(0, Math.PI * 2), c: pick(LIGHTS).c }));
  const piece = (x, y, vx, vy) => ({ x, y, vx, vy, a: rand(0, 4), spin: rand(4, 14) * (Math.random() < 0.5 ? -1 : 1), set: pick(SPIN), c: pick(PARTY), ph: rand(0, 6) });

  return {
    duration: T.holdEnd, timeline: T,
    frame(cv, t, final) {
      const dt = tick(t);
      const lt = final ? T.holdEnd : T.local(t);
      if (!final && T.cycle(t) !== cycle) { cycle = T.cycle(t); fired = false; }
      const exitK = final ? 0 : clamp((lt - eraseDone - 0.3) / 1.1, 0, 1);
      const tt = final ? 0 : t;
      const beatPhase = (t / BEAT) % 1, beatN = Math.floor(t / BEAT);
      const kick = final ? 0 : Math.exp(-beatPhase * 6);
      const noText = !!ctx.noText;
      const lines = noText ? [] : wrap(ctx.message, clamp(cv.w - 12, 8, 44));
      const nVis = final ? Infinity : visibleCount(cad, T, lt, total);
      const shown = revealWrapped(lines, ctx.message, nVis);
      const bw = noText ? 0 : Math.max(...lines.map(strWidth)) + 6, bh = noText ? -2 : lines.length + 2;

      // ---- layout: ball on top, bubble, dance floor ----
      const floorH = final ? 2 : clamp(Math.floor(cv.h * 0.14), 2, 6);
      const room = cv.h - bh - floorH - 2;
      let GH = final ? 16 : clamp(room, 7, 40);
      GH = Math.min(GH, Math.floor((cv.w - 4) / 2.1));
      const upr = 1.55 / GH;
      NB = clamp(Math.round(GH / 2.4), 7, 16);
      const cx = cv.w / 2, cy = GH * 0.56 + (final ? 0 : Math.max(0, (room - GH) / 2));
      const drop = final ? 1 : easeOutBack(clamp((lt - 0.05) / 1.1, 0, 1), 1.2) * (1 - exitK);
      B.y = final ? 0 : (1 - easeOutBack(clamp((lt - 0.05) / 1.1, 0, 1), 1.2)) * 2.4 + (exitK * exitK) * 2.8; B.t = tt; B.kick = kick;
      B.rot = final ? 0.35 : t * 0.75; B.cr = Math.cos(B.rot); B.sr = Math.sin(B.rot);
      const ballRow = cy - B.y / upr;
      const bubbleTop = Math.round(cy + (R + 0.12) / upr) + 2;

      // ---- the room: purple dark, vignette, a glow around the ball ----
      if (deep && !final) {
        backdrop(cv, (x, y) => scale(mix([24, 10, 40], [7, 4, 15], y / cv.h), 0.4 + 0.6 * vignette(cv, x, y)));
        glow(cv, cx, ballRow, GH * 1.5, GH * 0.75, [34, 26, 60], drop * (0.7 + 0.3 * kick));
      }

      // ---- light spots thrown on the walls by the ball ----
      if (!final) {
        for (const s of spots) {
          const a = s.lon + B.rot, facing = -Math.cos(a);
          if (facing < 0.1) continue;
          const x = cx + Math.sin(a) * cv.w * 0.62, y = ballRow - Math.sin(s.lat) * cv.h * 0.6;
          const k = facing * (0.45 + 0.55 * kick) * drop;
          if (deep) glow(cv, x, y, 4.5, 2, s.c, 0.32 * k);                // soft coloured light on the wall
          cv.put(x, y, k > 0.6 ? '•' : '·', scale(s.c, 0.35 + 0.65 * k), k > 0.6);
        }
      }

      // ---- confetti + fireworks ----
      if (!final) {
        if (!fired && lt > 0.9 && lt < T.holdEnd) {
          fired = true;
          for (let i = 0; i < Math.min(160, cv.w * 1.2); i++) {
            const s = i % 2 ? 1 : -1;
            confetti.push(piece(s > 0 ? 1 : cv.w - 2, cv.h - 1, s * rand(cv.w * 0.4, cv.w * 1.6), -rand(cv.h * 2.6, cv.h * 4.8)));
          }
        }
        if (t > 1 && Math.random() < dt * cv.w * 0.15) confetti.push(piece(rand(0, cv.w), -1, rand(-2, 2), rand(1, 4)));
        for (const p of confetti) {
          p.vy += 30 * dt; const drag = Math.exp(-dt * 3.2); p.vx *= drag; p.vy *= drag;
          p.x += (p.vx + Math.sin(t * 3 + p.ph) * 3) * dt; p.y += p.vy * dt; p.a += p.spin * dt;
        }
        confetti = confetti.filter((p) => p.y < cv.h && p.x > -2 && p.x < cv.w + 2);
        if (t > nextRocket) {
          nextRocket = t + rand(0.9, 1.9);
          const side = Math.random() < 0.5 ? rand(0.05, 0.3) : rand(0.7, 0.95);
          rockets.push({ x: cv.w * side, y: cv.h - 1, vy: -rand(cv.h * 1.1, cv.h * 1.5), c: pick(PARTY), fuse: rand(0.45, 0.7) });
        }
        for (const r of rockets) {
          r.y += r.vy * dt; r.vy += cv.h * 0.9 * dt; r.fuse -= dt;
          cv.put(r.x, r.y, '|', [255, 230, 180], true); cv.put(r.x, r.y + 1, '·', [180, 120, 60]);
          if (r.fuse <= 0) {
            const m = 26 + ((Math.random() * 14) | 0), sp = rand(9, 15);
            for (let i = 0; i < m; i++) { const a = (i / m) * Math.PI * 2, v = sp * rand(0.55, 1); sparks.push({ x: r.x, y: r.y, vx: Math.cos(a) * v * 2, vy: Math.sin(a) * v, life: 1, c: Math.random() < 0.2 ? [255, 255, 255] : r.c }); }
          }
        }
        rockets = rockets.filter((r) => r.fuse > 0);
        for (const s of sparks) { const drag = Math.exp(-dt * 2.2); s.vx *= drag; s.vy = s.vy * drag + 9 * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt * 0.9; }
        sparks = sparks.filter((s) => s.life > 0);
        for (const s of sparks) cv.put(s.x, s.y, s.life > 0.7 ? '✦' : s.life > 0.4 ? '+' : s.life > 0.2 ? '·' : '.', scale(s.c, 0.25 + 0.75 * s.life), s.life > 0.7);
      }

      // ---- the string + the ball ----
      const topRow = Math.round(ballRow - (R + 0.09) / upr);
      for (let r = 0; r < topRow; r++) cv.put(Math.floor(cx), r, '│', [90, 90, 105]);
      SPARKS = [];
      render3d(cv, { sdf, material, cx, cy, upr, bx: 0, by: B.y + 0.04, br: R + 0.12 });
      // star flares on the brightest glints
      for (const [x, y] of SPARKS.slice(0, 6)) {
        const col = Math.round(cx + x / (upr / 2)), row = Math.round(cy - y / upr);
        if ((col * 7 + row * 13 + beatN) % 3) continue;
        cv.put(col, row, '✦', [255, 255, 255], true);
        cv.put(col - 2, row, '─', [200, 200, 230]); cv.put(col + 2, row, '─', [200, 200, 230]);
        cv.put(col - 1, row, '-', [255, 255, 255]); cv.put(col + 1, row, '-', [255, 255, 255]);
        cv.put(col, row - 1, '│', [220, 220, 245]); cv.put(col, row + 1, '│', [220, 220, 245]);
      }

      // confetti draws in front of the ball
      for (const p of confetti) {
        const f = ((Math.floor(p.a) % 4) + 4) % 4;
        cv.put(p.x, p.y, p.set[f], scale(p.c, f === 2 ? 0.55 : f === 0 ? 1 : 0.8), f === 0);
      }

      // ---- bubble ----
      const bx = Math.floor((cv.w - bw) / 2);
      const by = final ? bubbleTop : Math.min(bubbleTop, cv.h - floorH - bh - 2);
      const floorTop = final ? by + bh + 1 : cv.h - floorH;
      if (final) {
        for (let i = 0; i < 16; i++) {
          const x = bx - 8 + Math.floor(hash3(i, 1, 2) * (bw + 16)), y = by - 2 + Math.floor(hash3(i, 3, 4) * (bh + 3));
          if (x < bx - 1 || x > bx + bw || y < by || y >= by + bh) if (Math.abs(x - cx) > 12 || y > by) cv.put(x, y, SPIN[i % 4][0], PARTY[i % PARTY.length]);
        }
      }
      const shownChars = shown.reduce((a, l) => a + Array.from(l).length, 0);
      let ci = 0;
      if (!noText) bubble(cv, {
        x: bx, y: by, lines, shown, rich, tail: [cx + 1, ballRow + (R + 0.04) / upr + 0.6],
        appear: final ? 1 : clamp((lt - (typeStart - 0.45)) / 0.4, 0, 1) * (1 - clamp((lt - eraseDone - 0.05) / 0.35, 0, 1)) * (1 + 0.04 * kick),
        fill: [250, 246, 255], shadow: deep && !final ? [8, 4, 16] : null, bold: true,
        ink: (c, r, col) => (shownChars - ci++ < 2 && !final ? [120, 120, 140] : hsl(tt * 120 + col * 13 + r * 30, 0.85, 0.45)),
        cursor: !final && ((lt < cad.end + 0.2) || (lt > T.holdEnd && lt < eraseDone)) && (t * 2.4) % 2 < 1.4 ? [180, 80, 200] : null,
        outline: [220, 140, 255], outlineInk: [255, 240, 255],
      });

      // each erased character pops in a tiny puff of confetti
      if (!final && lt > T.holdEnd && nVis < prevN) {
        let r = shown.length - 1; while (r > 0 && !shown[r]) r--;
        const px = bx + 3 + strWidth(shown[r] || ''), py = by + 1 + r;
        for (let k = 0; k < (prevN - nVis) * 3; k++) confetti.push(piece(px + rand(-0.5, 1.5), py, rand(-12, 12), -rand(4, 14)));
      }
      if (!final) prevN = nVis;

      // ---- perspective dance floor ----
      for (let k = 0; k < floorH; k++) {
        const row = floorTop + k, tw = 4 + k * 2;
        for (let i = -Math.ceil(cv.w / tw) - 1, x; (x = Math.round(cx + i * tw - tw / 2)) < cv.w; i++) {
          const lit = final ? (i + k) % 2 === 0 : (hash3(i, k, beatN) < 0.3 || (i + k + beatN) % 4 === 0);
          const c = PARTY[(((i * 3 + k + (final ? 0 : beatN)) % 6) + 6) % 6];
          const k2 = lit ? 0.55 + 0.45 * kick : 0.13 + 0.05 * (k / floorH);
          if (final && (x < bx - 4 || x + tw > bx + bw + 4)) continue;
          const col = scale(c, k2 * (0.55 + 0.45 * (k + 1) / floorH));
          if (deep && !final) {     // lit glass tiles: filled cells with a brighter top edge
            for (let j = 0; j < tw - 1; j++) { cv.setBg(x + j, row, col); cv.put(x + j, row, '▔', scale(col, 1.5)); }
            cv.setBg(x + tw - 1, row, [6, 3, 12]);
          } else cv.text(x, row, '▀'.repeat(tw - 1), col);
        }
      }
    },
  };
}

module.exports = { party };
