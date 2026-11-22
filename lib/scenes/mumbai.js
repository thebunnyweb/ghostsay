'use strict';
// Mumbai by night: Marine Drive's Queen's Necklace curving around the bay, a skyline of warm
// windows across the water, the Sea Link's cables in the distance, the city's glow on the
// monsoon clouds, a drizzle, and taxis streaming along the promenade.
const S = require('../scene');

const WARM = [[255, 210, 120], [255, 185, 90], [245, 235, 200], [255, 160, 80]];

module.exports = S.makeScene({
  horizon: 0.6, still: 3,
  message: { style: 'neon', border: [255, 140, 30], ink: [255, 230, 140] },
  draw(e) {
    const { W, H, hz, t, cv } = e;
    S.sky(e, [[0, [12, 12, 34]], [0.7, [40, 28, 56]], [1, [100, 56, 60]]]);
    S.clouds(e, { y0: 0, y1: hz * 0.8, color: [70, 50, 70], shade: [130, 80, 70], thr: 0.42, k: 3, speed: 0.02, scale: 0.035, seed: 6.1, alpha: 0.75 });
    // Bandra-Worli Sea Link on the right, low on the horizon
    const deck = Math.floor(hz - 1.5), x0 = Math.floor(W * 0.66), pyl = Math.round(W * 0.84), ph = Math.max(4, Math.round(hz * 0.34));
    const cableC = [100, 90, 120];
    for (let k = 1; k <= 4; k++) for (const sgn of [-1, 1]) {        // fan of stay cables, drawn as diagonal strokes
      const y0 = deck - ph * (0.55 + k * 0.1), span = k * Math.max(3, W * 0.03);
      for (let j = 1; j < span; j++) cv.put(pyl + sgn * j, Math.round(y0 + ((deck - y0) * j) / span), sgn > 0 ? '╲' : '╱', cableC);
    }
    for (let y = deck - ph; y < deck; y++) { const spread = Math.round(((y - (deck - ph)) / ph) * 1.2); cv.put(pyl - spread, y, '│', [160, 150, 170]); cv.put(pyl + spread, y, '│', [160, 150, 170]); }
    cv.put(pyl, deck - ph - 1, '•', Math.sin(t * 2) > 0 ? [255, 60, 60] : [120, 40, 40]);
    for (let x = x0; x < W; x++) cv.put(x, deck, '─', [150, 140, 160]);
    for (let x = Math.ceil(x0); x < W; x += 3) if (Math.sin(t * 1.5 + x) > -0.5) cv.put(x, Math.floor(deck), '·', [255, 220, 150]);
    // the skyline across the bay
    S.skyline(e, { seed: 31, base: hz, x1: W * 0.7, minH: hz * 0.12, maxH: hz * 0.55, pow: 1.4, minW: 3, maxW: 7, color: [26, 22, 44], glyph: '▒', beacon: true, win: { frac: 0.35, color: WARM, sx: 2, sy: 1 } });
    S.skyline(e, { seed: 32, base: hz, x1: W * 0.62, minH: hz * 0.05, maxH: hz * 0.22, minW: 4, maxW: 8, color: [16, 14, 28], glyph: '▓', win: { frac: 0.5, color: WARM, sx: 2, sy: 1 } });
    // the bay, and the curve of Marine Drive sweeping from the front-left round to the skyline
    const arc = (x) => hz + 0.8 + (H - hz - 1) * (1 - Math.min(1, x / (W * 0.95))) ** 1.8;
    S.water(e, hz, H, { far: [30, 26, 50], near: [10, 12, 28], wave: [120, 100, 120], speed: 0.2, skip: (c, r) => r > arc(c + 0.5) });
    const lights = [];
    for (let x = 0; x < W * 0.7; x += 2) if (S.H1(x, 3) < 0.5) lights.push({ x, c: WARM[(S.H1(x, 4) * 4) | 0] });
    S.reflections(e, hz, Math.max(2, Math.round((H - hz) * 0.45)), lights);
    S.ridge(e, (x) => arc(x) + 0.5, (c, r) => S.mix([30, 26, 32], [14, 12, 18], (r - arc(c)) / 4), ' ');
    // the necklace: streetlights every few columns, with halos
    for (let x = 1; x < W * 0.97; x += 3) {
      const y = arc(x) - 0.3;
      S.addGlow(e, x + 0.5, y + 0.3, 3.5, 1.4, [90, 60, 15], 0.9);
      cv.put(x, Math.floor(y), '•', [255, 215, 120], true);
    }
    // traffic along the promenade, in the black-and-yellow of the taxis
    const span = W + 10;
    for (let i = 0; i < Math.ceil(W / 7); i++) {
      const x = S.mod(S.H1(i, 1, 9) * span + t * 6 * (0.8 + 0.3 * S.H1(i, 2, 9)), span) - 5, y = Math.floor(arc(x) + 1.5);
      if (y >= H) continue;
      const taxi = S.H1(i, 3, 9) < 0.5;
      cv.put(x, y, '▄', taxi ? [250, 200, 30] : [40, 40, 50]); cv.put(x + 1, y, '▄', taxi ? [20, 20, 20] : [40, 40, 50]); cv.put(x + 2, y, '▪', [255, 245, 200]);
    }
    S.fall(e, { kind: 'rain', n: Math.round(W * H / 40), speed: 26, wind: 0.0, near: [140, 140, 170], far: [60, 60, 90], seed: 3 });
  },
});
