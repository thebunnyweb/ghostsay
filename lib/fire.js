'use strict';
// A campfire at night. The logs and the ring of stones are raymarched and lit by the
// flickering fire itself (with glowing ember cracks in the bark); the flames are a
// domain-warped noise field shaped into tongues; embers, smoke and stars around it.
// Your message hangs above it in letters that ignite as they're typed.
const { strWidth, wrap, totalChars, clamp, mix, hash3, noise3, fbm, ramp, rand, easeOut, norm3, clock, sdCapsule, smin, scale } = require('./util');
const { render3d } = require('./render3d');
const { backdrop, glow, vignette, loopTimes } = require('./ui');

const CPS = 28;
const FIRE = [[0, [20, 2, 2]], [0.18, [120, 12, 2]], [0.38, [215, 45, 0]], [0.58, [255, 120, 10]], [0.78, [255, 195, 50]], [0.92, [255, 240, 170]], [1, [255, 255, 245]]];
const FLAME_CH = ' .,:;~=+*xo#%@';

// camera looks slightly down at the fire
const PITCH = 0.42, CP = Math.cos(PITCH), SP = Math.sin(PITCH);
const F = { flick: 1, t: 0 };
const LOGS = [
  [-0.78, 0.1, 0.22, 0.74, 0.16, -0.24, 0.115],
  [-0.72, 0.13, -0.32, 0.76, 0.1, 0.24, 0.11],
  [-0.12, 0.09, 0.58, 0.1, 0.24, -0.5, 0.1],
];
const STONES = Array.from({ length: 11 }, (_, i) => {
  const a = (i / 11) * Math.PI * 2 + 0.2;
  return [Math.cos(a) * 1.0, 0.04, Math.sin(a) * 0.95, 0.12 + 0.04 * hash3(i, 2, 3)];
});
const toWorld = (x, y, z) => [x, y * CP + z * SP, -y * SP + z * CP];

function parts(x, y, z) {
  const [wx, wy, wz] = toWorld(x, y, z);
  let logs = 1e9;
  for (const L of LOGS) logs = Math.min(logs, sdCapsule(wx, wy, wz, L[0], L[1], L[2], L[3], L[4], L[5], L[6]));
  let stones = 1e9;
  for (const S of STONES) stones = Math.min(stones, Math.hypot((wx - S[0]) / 1.3, (wy - S[1]) / 0.75, (wz - S[2]) / 1.1) * 0.75 - S[3] * 0.75);
  return { logs, stones, wx, wy, wz };
}
const sdf = (x, y, z) => { const p = parts(x, y, z); return Math.min(smin(p.logs, p.logs, 0.01), p.stones); };

function material(x, y, z, nx, ny, nz, ao) {
  const p = parts(x, y, z);
  const [wnx, wny, wnz] = toWorld(nx, ny, nz);
  // light from the heart of the fire
  const lx = -p.wx, ly = 0.45 - p.wy, lz = -p.wz, ld = Math.hypot(lx, ly, lz);
  const diff = clamp((wnx * lx + wny * ly + wnz * lz) / ld, 0, 1);
  const atten = (F.flick * 1.5) / (1 + ld * ld * 0.7);
  const moon = clamp(wny * 0.6 + wnx * -0.2, 0, 1) * 0.12;           // faint cold fill from the night sky
  if (p.logs < p.stones) {
    const grain = noise3(p.wx * 3, p.wy * 30, p.wz * 30);            // bark grain
    const crack = noise3(p.wx * 9 + 3, p.wy * 9, p.wz * 9 + F.t * 0.3);
    const ember = clamp((crack - 0.6) / 0.15, 0, 1) * clamp(1.2 - Math.hypot(p.wx, p.wz) * 1.1, 0, 1) * (0.7 + 0.3 * Math.sin(F.t * 4 + p.wx * 9));
    const lit = clamp(diff * atten * 1.6 * (0.4 + 0.6 * ao) + 0.12 * atten, 0, 1);
    let b = 0.06 + 0.7 * lit * (0.75 + 0.25 * grain) + moon + ember * 0.9;
    let c = mix([22, 12, 8], [240, 130, 55], clamp(lit * (0.8 + 0.3 * grain), 0, 1));
    c = mix(c, [60, 70, 110], moon * 2);
    if (ember > 0) c = mix(c, ramp(FIRE, 0.55 + 0.4 * ember), ember);
    return { b: clamp(b, 0, 1), c };
  }
  const lit = clamp(diff * atten * 1.5 * (0.4 + 0.6 * ao) + 0.1 * atten, 0, 1);
  const b = 0.1 + 0.8 * lit + moon * 1.4;
  let c = mix([24, 22, 24], [235, 150, 90], clamp(lit, 0, 1));
  c = mix(c, [70, 80, 120], moon * 2.5);
  return { b: clamp(b, 0, 1), c };
}

function fire(ctx) {
  const typeStart = 1.0, nChars = totalChars(ctx.message);
  // ignite -> hold -> letters burn away from the end -> fire dies to embers -> relight
  const T = loopTimes({ typeEnd: typeStart + nChars / CPS, hold: 4.5, erase: nChars * 0.05 + 0.9, exit: 1.8, gap: 0.6 });
  const burnAt = (i) => T.holdEnd + (nChars - 1 - i) * 0.05;
  const tick = clock();
  const deep = !!ctx.truecolor;
  let embers = [], typed = 0, burned = 0, cycle = -1;
  const stars = Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random(), ph: rand(0, 6), s: Math.random() }));
  const ember = (x, y, hot) => ({ x, y, vx: rand(-2, 2), vy: -rand(4, 11), life: 1, decay: rand(0.3, 0.7), hot, ph: rand(0, 6) });

  return {
    duration: T.holdEnd, timeline: T,
    frame(cv, t, final) {
      const dt = tick(t);
      const lt = final ? T.holdEnd : T.local(t);
      if (!final && T.cycle(t) !== cycle) { cycle = T.cycle(t); typed = 0; burned = nChars; }
      const tt = final ? 3.7 : t;
      const noText = !!ctx.noText;
      const lines = noText ? [] : wrap(ctx.message, clamp(cv.w - 10, 8, 50));
      const inner = noText ? 0 : Math.max(...lines.map(strWidth));
      const blockH = noText ? -1 : lines.length + 2;

      // ---- layout: message on top, campfire below ----
      let GH = final ? 13 : clamp(cv.h - blockH - 3, 8, 42);
      GH = Math.min(GH, Math.floor((cv.w - 4) / 1.4));
      const top = Math.max(0, Math.floor((cv.h - blockH - 1 - GH) / 2));
      const by = top, sceneTop = top + blockH + 1;
      const upr = 2.7 / GH, upc = upr / 2;
      const cx = cv.w / 2, cy = sceneTop + GH - 0.62 / upr;   // world origin (fire base) near the bottom
      // relights from glowing logs, dies back down to them: both ends meet at 0.18 so the loop is seamless
      const rise = final ? 1 : 0.18 + 0.82 * easeOut((lt - 0.1) / 1.4) * (1 - clamp((lt - T.eraseEnd + 0.3) / 1.6, 0, 1));
      F.t = tt; F.flick = (0.8 + 0.25 * noise3(tt * 3, 1.7, 0) + 0.1 * noise3(tt * 9, 4.2, 0)) * (0.35 + 0.65 * rise);

      // ---- backdrop: night sky down to the horizon, dark earth, firelight washing over both ----
      if (deep && !final) {
        const horizon = cy - 0.55 / upr;
        backdrop(cv, (x, y) => {
          const v = 0.45 + 0.55 * vignette(cv, x, y);
          if (y < horizon) return scale(mix([4, 5, 17], [24, 13, 16], (y / horizon) ** 1.6), v);
          return scale(mix([17, 10, 7], [5, 3, 3], (y - horizon) / Math.max(1, cv.h - horizon)), v);
        });
        const fl = F.flick * rise;
        glow(cv, cx, cy - 0.35 / upr, 2.2 / upc, 1.25 / upr, [95, 38, 8], fl);
        glow(cv, cx, cy - 0.05 / upr, 1.0 / upc, 0.45 / upr, [70, 30, 6], fl);
        if (!noText) glow(cv, cv.w / 2, by + blockH / 2, inner * 0.7 + 6, blockH + 1.5, [55, 16, 2], 0.6 + 0.25 * noise3(t * 2, 0.3, 0));
      }

      // ---- night sky ----
      if (!final) for (const s of stars) {
        const x = s.x * cv.w, y = s.y * Math.max(1, sceneTop + GH * 0.35);
        const k = (0.35 + 0.65 * Math.max(0, Math.sin(t * (0.6 + s.s) + s.ph))) * s.s;
        if (k > 0.12) cv.put(x, y, k > 0.55 ? '+' : '·', mix([8, 8, 16], [150, 160, 210], k));
      }

      // ---- warm glow on the ground ----
      for (let row = Math.floor(cy - 0.5 / upr); row <= Math.min(cv.h - 1, Math.ceil(cy + 0.75 / upr)); row++) {
        for (let col = Math.floor(cx - 1.5 / upc); col <= Math.ceil(cx + 1.5 / upc); col++) {
          const dx = (col - cx) * upc / 1.35, dy = (row - cy) * upr / (0.65 * CP + 0.05);
          const k = (1 - Math.hypot(dx, dy)) * F.flick;
          if (k > 0.05) cv.put(col, row, k > 0.55 ? '-' : k > 0.3 ? ',' : '.', mix([10, 4, 2], [150, 60, 15], k));
        }
      }

      // ---- logs and stones ----
      const solid = new Uint8Array(cv.w * cv.h);
      render3d(cv, {
        sdf, material, cx, cy, upr, bx: 0, by: 0.05, br: 1.35,
        put: (col, row, ch, c, b) => { cv.put(col, row, ch, c, b > 0.8); solid[row * cv.w + col] = 1; },
      });

      // ---- flames ----
      const fh = 1.75 / upr * (final ? 0.75 : 0.5 + 0.5 * rise);            // flame height in rows
      const baseRow = cy - 0.05 / upr, halfW = 0.72 / upc;
      for (let row = Math.floor(baseRow - fh * 1.1); row <= Math.ceil(baseRow + 0.25 / upr); row++) {
        const h = (baseRow - row) / fh;
        for (let col = Math.floor(cx - halfW * 1.2); col <= Math.ceil(cx + halfW * 1.2); col++) {
          const xn = (col - cx) / halfW;
          const nx = col * upc * 2.6, ny = row * upr * 2.6;
          const warp = noise3(nx * 0.6, ny * 0.6 + tt * 1.1, tt * 0.3);
          const n = fbm(nx + warp * 1.5, ny + tt * 3.2, tt * 0.6, 3);
          const tongue = 0.7 + 0.65 * noise3(col * upc * 3.2, tt * 0.9, 5.5);   // several separate tongues
          const width = Math.max(0.05, Math.max(0, 1 - h) ** 0.45) * (0.85 + 0.25 * noise3(row * 0.2, tt * 1.5, 2));
          let heat = (n - 0.5) * 2.8 + 1.35 * tongue - Math.max(0, h) * 1.25 - (xn / width) ** 2 * 0.85;
          if (h < 0) heat -= (-h) * 2.5;                                    // the flames sit inside the log pile
          heat = clamp(heat * F.flick * 0.88, 0, 1);
          if (heat < 0.07) continue;
          const i = row * cv.w + col;
          if (row >= 0 && row < cv.h && solid[i] && heat < 0.8 && h < 0.3) continue;   // logs in front of weaker flame
          cv.put(col, row, FLAME_CH[Math.round(heat * (FLAME_CH.length - 1))], ramp(FIRE, heat * 0.95 + 0.05), heat > 0.72);
        }
      }

      // ---- smoke + embers ----
      if (!final) {
        for (let row = Math.floor(baseRow - fh * 2.1); row < baseRow - fh * 0.85; row++) {
          for (let col = Math.floor(cx - halfW); col <= cx + halfW; col++) {
            const up = (baseRow - fh * 0.85 - row) / (fh * 1.25);
            const s = fbm(col * 0.09 - tt * 0.3, row * 0.18 + tt * 0.9, 7.7, 2) - 0.5 - up * 0.3 - (Math.abs(col - cx) / halfW) ** 2 * 0.3;
            if (s > 0.02 && row >= 0 && !cv.fg[row * cv.w + col]) cv.put(col, row, s > 0.08 ? '~' : '.', mix([10, 10, 12], [70, 66, 70], clamp(s * 6, 0, 1) * (1 - up)));
          }
        }
        if (Math.random() < dt * 14 * rise) embers.push(ember(cx + rand(-halfW, halfW) * 0.6, baseRow - fh * rand(0.2, 0.7), false));
        embers.forEach((e) => { e.x += (e.vx + Math.sin(t * 2 + e.ph) * 3) * dt; e.y += e.vy * dt; e.vy *= 1 - dt * 0.3; e.life -= e.decay * dt; });
        embers = embers.filter((e) => e.life > 0 && e.y > -1);
        embers.forEach((e) => {
          const k = e.life * (0.75 + 0.25 * Math.sin(t * 20 + e.ph * 5));
          cv.put(e.x, e.y, k > 0.7 ? '•' : k > 0.35 ? '·' : '.', ramp(FIRE, k * (e.hot ? 1 : 0.9)), k > 0.7);
        });
      }

      // ---- the message ----
      if (noText) return;
      const bx = Math.floor((cv.w - inner - 6) / 2);
      const shownN = final ? Infinity : (lt - typeStart) * CPS;
      // the rules sweep in from the centre and burn away from the edges
      const ruleK = final ? 1 : easeOut((lt - 0.5) / 0.6) * (1 - clamp((lt - T.eraseEnd + 0.2) / 0.6, 0, 1));
      const rw = inner + 6, show = (i) => Math.abs(i - rw / 2 + 0.5) < (rw / 2) * ruleK;
      const ruleCol = (row) => (c, i) => ramp(FIRE, final ? 0.6 : 0.45 + 0.4 * noise3(i * 0.25, t * 4, row));
      for (let i = 0; i < rw; i++) if (show(i)) { cv.put(bx + i, by, '━', ruleCol(0)('', i)); cv.put(bx + i, by + blockH - 1, '━', ruleCol(1)('', i)); }
      let idx = 0;
      lines.forEach((line, r) => {
        let x = bx + 3 + Math.floor((inner - strWidth(line)) / 2);
        for (const c of line) {
          const age = shownN - idx, burn = final ? -1 : lt - burnAt(idx);
          if (age >= 0 && burn < 0.45) {
            if (!final && idx >= typed && c !== ' ' && Math.random() < 0.6 && burn < 0) { const e = ember(x, by + 1 + r, true); e.vy *= 0.5; e.decay *= 1.8; embers.push(e); }
            let heat = final ? 0.78 : age < 6 ? 1 - (age / 6) * 0.25 : 0.62 + 0.3 * noise3(idx * 0.9, t * 5, 9.3);
            if (burn >= 0) {                    // burning away: flares white-hot, cools to dark red, crumbles
              if (idx < burned && c !== ' ') { for (let k = 0; k < 4; k++) embers.push(ember(x, by + 1 + r, true)); }
              heat = burn < 0.12 ? 1 : 0.9 - (burn - 0.12) * 2.2;
            }
            cv.putc(x, by + 1 + r, burn > 0.3 ? (c === ' ' ? ' ' : '·') : c, ramp(FIRE, heat), true);
          }
          x += strWidth(c); idx++;
        }
      });
      if (!final) { typed = Math.max(typed, Math.floor(shownN)); burned = Math.min(burned, nChars); for (let i = 0; i < nChars; i++) if (lt >= burnAt(i)) burned = Math.min(burned, i); }
    },
  };
}

module.exports = { fire };
