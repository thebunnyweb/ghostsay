'use strict';
// New York at night from across the river: One World Trade, the Empire State with its lit
// crown cycling colours, the Chrysler's stacked arches, a forest of towers, Lady Liberty with
// her torch, a ferry crossing the water and every light trembling in the reflection.
const S = require('../scene');

const WARM = [[255, 214, 130], [255, 200, 110], [235, 235, 210], [170, 210, 255]];
const DARK = [16, 15, 30];

// local units: ly 0 = base .. 1 = top, lx = 0 at the centre (square units)
const empire = (lx, ly) => {
  const a = Math.abs(lx);
  if (ly < 0.48) return a < 0.13;
  if (ly < 0.6) return a < 0.095;
  if (ly < 0.68) return a < 0.065;
  if (ly < 0.75) return a < 0.042;
  if (ly < 0.82) return a < 0.024;
  return ly < 1 && a < 0.008 + 0.012 * (1 - ly) / 0.18;
};
const chrysler = (lx, ly) => {
  const a = Math.abs(lx);
  if (ly < 0.62) return a < 0.075 - (ly > 0.5 ? 0.012 : 0);
  if (ly < 0.86) { const k = (ly - 0.62) / 0.24; return a < 0.063 * Math.sqrt(Math.max(0, 1 - k * k)) + 0.01; }   // the crown
  return ly < 1 && a < 0.008;
};
const wtc = (lx, ly) => {
  const a = Math.abs(lx);
  if (ly < 0.06) return a < 0.11;
  if (ly < 0.78) return a < 0.11 - 0.055 * (ly - 0.06) / 0.72;
  return ly < 1 && a < 0.006;
};
const liberty = (lx, ly) => {
  const a = Math.abs(lx);
  if (ly < 0.12) return a < 0.17;                                     // star-shaped fort
  if (ly < 0.38) return a < 0.1 - (ly > 0.3 ? 0.015 : 0);             // pedestal
  if (ly < 0.7) return a < 0.035 + (0.7 - ly) * 0.06;                 // robe
  if (ly < 0.78) return a < 0.026;                                    // head
  if (ly < 0.82 && a < 0.05) return Math.abs(lx * 40 % 1) < 0.5;      // crown rays
  if (lx > 0.03 && lx < 0.062 && ly > 0.6 && ly < 0.98) return true;  // raised arm
  return lx < -0.035 && lx > -0.075 && ly > 0.5 && ly < 0.6;          // tablet
};

module.exports = S.makeScene({
  horizon: 0.68, still: 4,
  message: { style: 'neon', border: [255, 200, 40], ink: [255, 245, 210] },
  draw(e) {
    const { W, H, hz, t, cv } = e;
    S.sky(e, [[0, [4, 6, 22]], [0.55, [16, 18, 50]], [1, [70, 44, 80]]]);
    S.stars(e, Math.round((W * hz) / 90), hz * 0.45);
    S.moon(e, W * 0.12, Math.max(2, H * 0.12), Math.max(2, H * 0.05));
    S.addGlow(e, W * 0.55, hz, W * 0.6, H * 0.4, [50, 26, 40], 1);
    S.skyline(e, { seed: 11, base: hz, minH: hz * 0.18, maxH: hz * 0.5, minW: 3, maxW: 7, gaps: 0, color: [30, 30, 58], glyph: '▒', win: { frac: 0.25, color: [130, 120, 150], sx: 2, sy: 2 } });

    const s = hz * 0.86, crown = Math.floor(t / 3) % 3;
    const crownC = [[255, 60, 60], [240, 240, 255], [70, 120, 255]][crown];
    const lm = [
      [W * 0.27, wtc, 1.0, 0.12],
      [W * 0.5, empire, 0.96, 0.14],
      [W * 0.64, chrysler, 0.84, 0.09],
    ];
    S.skyline(e, { seed: 12, base: hz, minH: hz * 0.1, maxH: hz * 0.36, minW: 4, maxW: 9, color: [20, 19, 38], glyph: '▒', win: { frac: 0.4, color: WARM, sx: 2, sy: 1 } });
    for (const [x, f, k, hw] of lm) {
      const sc = s * k;
      const color = (col, row) => {
        const ly = (hz - row) / sc;
        if (f === empire && ly > 0.68 && ly < 0.84) return crownC;
        if (f === chrysler && ly > 0.62 && ly < 0.88) return [150, 155, 175];
        return DARK;
      };
      const ins = S.landmark(e, x, hz, sc, f, hw, 1.05, color, '▓');
      S.windows(e, ins, x - hw * 2 * sc, hz - sc * 0.66, x + hw * 2 * sc, hz, { frac: 0.45, color: WARM, sx: 2, sy: 1, seed: (x | 0) });
      if (f === chrysler) for (let r = 0; r < 4; r++) { const row = Math.round(hz - sc * (0.66 + r * 0.05)); cv.put(x, row, '^', [255, 250, 220]); }
      if (Math.sin(t * 2 + x) > 0) cv.put(x, Math.round(hz - sc * 1.0), '•', [255, 50, 50]);
    }
    S.skyline(e, { seed: 13, base: hz, minH: hz * 0.04, maxH: hz * 0.2, minW: 5, maxW: 11, color: [10, 10, 22], glyph: '▓', win: { frac: 0.5, color: WARM, sx: 2, sy: 1 } });

    // the river
    S.water(e, hz, H, { far: [16, 16, 40], near: [6, 8, 20], wave: [70, 80, 120], speed: 0.25 });
    const lights = [];
    for (let x = 0; x < W; x += 2) if (S.H1(x, 5) < 0.45) lights.push({ x, c: WARM[(S.H1(x, 6) * 4) | 0] });
    S.reflections(e, hz, Math.max(2, Math.round((H - hz) * 0.7)), lights);
    // Liberty on her island, torch flickering
    const ls = Math.max(6, hz * 0.34), lx = W * 0.09, base = hz + Math.max(1, (H - hz) * 0.25);
    S.rect(e, lx - ls * 0.6, base - 0.5, lx + ls * 0.6, base + 0.5, [18, 26, 24], ' ');
    S.landmark(e, lx, base, ls, liberty, 0.2, 1.05, (c, r) => ((base - r) > ls * 0.38 ? [70, 140, 120] : [40, 52, 60]), '▓');
    S.addGlow(e, lx + 0.092 * ls, base - ls * 1.0, 4, 2, [140, 90, 20], 0.8 + 0.2 * Math.sin(t * 9));
    cv.put(lx + 0.092 * ls, base - ls * 1.0, '♦', [255, 200, 80], true);
    // a ferry crossing
    const fx = Math.round(S.mod(t * 2.2, W + 30) - 15), fy = Math.round(hz + (H - hz) * 0.55);
    if (fy < H) {
      cv.text(fx, fy - 1, ' ▗▄▄▖', [230, 140, 50]);
      cv.text(fx, fy, '▀█▓▓██▀', [200, 120, 40]);
      for (let k = 2; k < 6; k += 1) if (S.H1(k, 77) < 0.7) cv.put(fx + k, fy - 1, '▪', [255, 230, 150]);
    }
  },
});
