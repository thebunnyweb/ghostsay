'use strict';
// A beach at sunset: the sun melting into the sea with a glittering path of light, waves
// washing up the sand and sliding back, a palm tree swaying, gulls, and a little plane towing
// your message along the shore.
const S = require('../scene');

function palm(e, x, base, h, t, trunkC, leafC) {
  const p = S.pix(e), sway = Math.sin(t * 0.9) * 0.6 + Math.sin(t * 2.1) * 0.15;
  const top = [x + h * 0.35 + sway, base - h];
  p.curve((s) => [x + h * 0.35 * s * s + sway * s * s, base - h * s], trunkC, 1, 30);
  p.flush('▓');
  for (let k = 0; k < 7; k++) {
    const a = -Math.PI * 0.95 + (k / 6) * Math.PI * 0.9 + Math.sin(t * 1.3 + k) * 0.06, len = h * (0.55 + 0.15 * S.H1(k, 4));
    p.curve((s) => [top[0] + Math.cos(a) * len * s * 1.5, top[1] + Math.sin(a) * len * s * 0.45 + (s * s) * len * 0.6], leafC, 0, 24);
    // leaflets hanging off each frond
    for (let j = 2; j < 9; j++) {
      const s = j / 9, fx = top[0] + Math.cos(a) * len * s * 1.5, fy = top[1] + Math.sin(a) * len * s * 0.45 + s * s * len * 0.6;
      p.line(fx, fy, fx + Math.cos(a) * 0.8, fy + 1.1 * (1 - s * 0.3), leafC, 0);
    }
  }
  p.flush('▓');
}

module.exports = S.makeScene({
  horizon: 0.6, still: 3,
  message: { style: 'banner', cloth: [255, 248, 230], hem: [255, 120, 80], ink: [210, 50, 70] },
  draw(e) {
    const { W, H, hz, t, cv } = e;
    S.sky(e, [[0, [36, 26, 84]], [0.4, [150, 60, 120]], [0.75, [250, 120, 90]], [1, [255, 196, 120]]]);
    const sx = W * 0.62, sr = Math.max(4, H * 0.16);
    S.sun(e, sx, hz - sr * 0.12, sr, (c, r) => S.mix([255, 240, 170], [255, 120, 70], (r - (hz - sr * 0.6)) / (sr * 0.6)), [110, 50, 20], hz);
    S.clouds(e, { y0: hz * 0.25, y1: hz * 0.75, color: [255, 160, 140], shade: [150, 70, 110], thr: 0.56, k: 4, speed: 0.015, scale: 0.035, seed: 2.2 });
    S.birds(e, { n: 4, y0: hz * 0.35, y1: hz * 0.6, speed: 3, color: [40, 20, 40], seed: 5 });
    // the sea and the shore
    const shore = Math.round(hz + (H - hz) * 0.55);
    S.water(e, hz, shore + 2, { far: [80, 50, 100], near: [30, 50, 90], wave: [255, 190, 150], glint: { x: sx, w: sr * 1.1, color: [255, 220, 150] }, speed: 0.2 });
    // the wash: a foam edge rolling up the sand and back
    const wash = (x) => shore + 0.6 + 1.2 * (0.5 + 0.5 * Math.sin(t * 0.8)) + 0.6 * S.noise3(x * 0.08, t * 0.3, 1);
    S.ridge(e, wash, (c, r) => S.mix([235, 180, 130], [200, 140, 100], (r - shore) / Math.max(1, H - shore)), ' ');
    for (let x = 0; x < W; x++) { const y = Math.floor(wash(x + 0.5)); if (S.noise3(x * 0.4, t * 1.5, 3) > 0.35) cv.put(x, y - 0, '▀', [255, 245, 235]); }
    for (let i = 0; i < W / 3; i++) { const x = S.H1(i, 1, 9) * W, y = shore + 3 + S.H1(i, 2, 9) * (H - shore); if (y < H && y > wash(x) + 1) cv.put(x, y, '.', [170, 120, 90]); }
    palm(e, W * 0.07, H + 0.5, Math.max(8, (H - hz) + hz * 0.45), t, [40, 22, 30], [24, 30, 30]);
  },
});
