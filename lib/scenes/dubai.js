'use strict';
// Dubai at golden hour: the Burj Khalifa needling up past everything, glassy towers catching
// the last light, the Burj Al Arab's sail out on the water, heat haze, and a camel caravan
// plodding across the dunes in the foreground. A plane tows your message overhead.
const S = require('../scene');

const khalifa = (lx, ly) => {
  const a = Math.abs(lx);
  if (ly < 0.8) { const step = Math.floor(ly * 9) / 9; return a < 0.085 * (1 - step * 0.95) + (lx > 0 ? 0.01 : 0); }
  return ly < 1 && a < 0.012 * (1 - ly) / 0.2 + 0.003;
};
const sail = (lx, ly) => {
  if (ly < 0.06) return Math.abs(lx) < 0.2;                                       // island
  if (ly > 0.06 && ly < 0.86 && lx > -0.005 && lx < 0.03) return true;              // mast
  if (ly > 0.62 && ly < 0.66 && lx > 0.03 && lx < 0.12) return true;                // helipad
  const k = (ly - 0.06) / 0.72;
  return k > 0 && k < 1 && lx < 0 && lx > -0.26 * Math.sin(Math.PI * k) ** 0.8 * (1 - k * 0.35);
};
const CAMEL = [
  ['    ,^^.   _ ', '  _/    \\_/ \'', '   /\\   /\\   '],
  ['    ,^^.   _ ', '  _/    \\_/ \'', '   ||   ||   '],
];

module.exports = S.makeScene({
  horizon: 0.66, still: 3,
  message: { style: 'banner', cloth: [255, 250, 235], hem: [200, 160, 60], ink: [150, 100, 20], trim: [40, 120, 70] },
  draw(e) {
    const { W, H, hz, t, cv } = e;
    S.sky(e, [[0, [40, 54, 120]], [0.45, [190, 110, 130]], [0.8, [250, 170, 110]], [1, [255, 210, 140]]]);
    const sx = W * 0.22, sr = Math.max(3, H * 0.09);
    S.sun(e, sx, hz * 0.5, sr, [255, 235, 180], [120, 70, 20]);
    S.birds(e, { n: 3, y0: hz * 0.3, y1: hz * 0.5, speed: 2.5, color: [90, 50, 60], seed: 4 });
    S.skyline(e, { seed: 21, base: hz, minH: hz * 0.08, maxH: hz * 0.42, pow: 1.6, minW: 3, maxW: 7, color: (b) => S.mix([60, 70, 110], [110, 100, 140], S.H1(b.i, 7)), glyph: '▒', win: { frac: 0.2, color: [255, 220, 160], sx: 2, sy: 2 } });
    const s = hz * 0.97, kx = W * 0.47;
    const glass = (col, row) => (col - kx > 0 ? S.mix([80, 80, 120], [50, 55, 95], (hz - row) / s) : S.mix([200, 150, 120], [130, 110, 140], (hz - row) / s));
    const f = S.landmark(e, kx, hz, s, khalifa, 0.11, 1.02, glass, '▓');
    S.windows(e, f, kx - 0.2 * s, hz - s * 0.75, kx + 0.2 * s, hz, { frac: 0.3, color: [255, 230, 170], sx: 1, sy: 2, seed: 4 });
    if (Math.sin(t * 2) > 0) cv.put(kx, Math.round(hz - s), '•', [255, 60, 60]);
    S.skyline(e, { seed: 22, base: hz, x0: 0, x1: W * 0.68, minH: hz * 0.04, maxH: hz * 0.2, minW: 4, maxW: 8, color: [40, 40, 70], glyph: '▓', win: { frac: 0.35, color: [255, 220, 150], sx: 2, sy: 1 } });
    // the Gulf, with the sail hotel out on its island
    const sea = Math.round(hz + (H - hz) * 0.42);
    S.water(e, hz, sea + 1, { far: [180, 120, 120], near: [90, 80, 120], wave: [255, 220, 170], glint: { x: sx, w: sr, color: [255, 230, 170] }, speed: 0.15 });
    S.landmark(e, W * 0.8, hz + 1, hz * 0.5, sail, 0.27, 0.9, (c, r) => (c < W * 0.8 ? [235, 225, 235] : [150, 140, 170]), '▓');
    // heat haze shimmering over the horizon
    S.haze(e, hz - 3, hz + 1, (x, y) => 0.18 * (1 - Math.abs(y - hz + 1) / 3) * (0.5 + S.noise3(x * 0.2, y, t * 2)), [255, 210, 160]);
    // dunes
    const dune = (x) => sea + 1 + (H - sea) * 0.35 - (H - sea) * 0.5 * S.noise3(x * 0.035, 7.3, 0);
    S.ridge(e, dune, (c, r) => S.mix([235, 170, 100], [180, 110, 60], (r - dune(c)) / (H - dune(c) + 1) + (S.noise3(c * 0.08, 1, 1) - 0.5) * 0.5), ' ');
    for (let x = 0; x < W; x++) if (S.H1(x, 3) < 0.4) cv.put(x, dune(x + 0.5) + 1 + S.H1(x, 4) * 3, '~', [200, 130, 70]);
    // the caravan
    const span = W + 60, cxp = S.mod(t * 2.4, span) - 45;
    for (let k = 0; k < 3; k++) {
      const x = Math.round(cxp + k * 15), y = Math.round(dune(x + 6) - 2.4 + (k % 2) * 0.4);
      cv.sprite(x, y, CAMEL[(Math.floor(t * 3) + k) % 2], [60, 30, 30]);
    }
  },
});
