'use strict';
// Mountains at sunrise: four ranges fading into the distance with snow on the high peaks,
// mist drifting through the valleys, a pine ridge up close and a pair of birds riding the air.
const S = require('../scene');

module.exports = S.makeScene({
  horizon: 0.62, still: 4,
  message: { style: 'card', fill: [255, 250, 245], ink: [70, 50, 90] },
  draw(e) {
    const { W, H, hz, t } = e;
    S.sky(e, [[0, [40, 60, 130]], [0.55, [210, 140, 150]], [0.85, [255, 190, 140]], [1, [255, 220, 170]]]);
    const sx = W * 0.36, sr = Math.max(3, H * 0.09), sy = hz * 0.78 - Math.sin(t * 0.05) * 0.5;
    S.sun(e, sx, sy, sr, [255, 245, 215], [110, 70, 40]);
    S.clouds(e, { y0: hz * 0.15, y1: hz * 0.55, color: [255, 200, 190], shade: [190, 130, 160], thr: 0.6, k: 2.5, speed: 0.01, scale: 0.03, seed: 4.4, alpha: 0.6 });
    // a range = a handful of summits (pointy tents) roughened with noise
    const range = (x, n, amp, seed, o) => {
      let h = 0;
      for (let i = -1; i <= n; i++) {
        const X = ((i + 0.2 + 0.6 * S.H1(i, 1, seed)) / n) * W, A = amp * (0.55 + 0.45 * S.H1(i, 2, seed)), w = (W / n) * (0.7 + 0.5 * S.H1(i, 3, seed));
        h = Math.max(h, A * Math.max(0, 1 - Math.abs(x - X) / w) ** 1.15);
      }
      return h + (S.noise3(x * 0.25, seed, 0) - 0.5) * 1.6 + (S.noise3(x * 0.08, seed + 3, 0) - 0.5) * amp * 0.15 + (o || 0);
    };
    const peak = (x, f, a, o) => range(x, Math.max(3, Math.round(W * f)), a, o);
    // far range with snow caps
    const far = (x) => hz - H * 0.04 - peak(x, 0.035, H * 0.44, 15);
    const snow = (c, r) => r - far(c) < S.clamp((hz - H * 0.28 - far(c)) * 0.7, 0, 7) + (S.noise3(c * 0.5, 2, 0) - 0.5) * 2;
    S.ridge(e, far, (c, r) => (snow(c, r) ? S.mix([255, 235, 230], [210, 190, 215], c > 0 && far(c + 1) < far(c) ? 0.8 : 0) : S.mix([150, 120, 160], [120, 100, 150], (r - far(c)) / 8)), '░');
    S.haze(e, hz - H * 0.25, hz + 2, (x, y) => 0.45 * (1 - Math.abs(y - (hz - 1)) / (H * 0.25)) * (0.5 + S.noise3(x * 0.05 - t * 0.05, y * 0.3, 7)), [240, 180, 170]);
    const mid = (x) => hz + H * 0.05 - peak(x, 0.05, H * 0.28, 42);
    S.ridge(e, mid, (c, r) => S.mix([95, 80, 125], [70, 60, 100], (r - mid(c)) / 10), '▒');
    S.haze(e, hz - H * 0.05, hz + H * 0.15, (x, y) => 0.5 * (0.4 + S.noise3(x * 0.04 + t * 0.06, y * 0.25, 9) - Math.abs(y - hz - H * 0.06) / (H * 0.14)), [220, 160, 170]);
    const near = (x) => hz + H * 0.18 - peak(x, 0.07, H * 0.2, 77);
    S.ridge(e, near, [50, 45, 78], '▓');
    // pine ridge: a saw-tooth of little trees along the top
    const pine = (x) => {
      const base = H - H * 0.1 - H * 0.06 * S.noise3(x * 0.04, 9.1, 0);
      const k = S.mod(x, 3) / 3, tall = 1.3 + S.H1(Math.floor(x / 3), 3) * 1.6;
      return base - tall * (1 - Math.abs(k - 0.5) * 2);
    };
    S.ridge(e, pine, [22, 30, 40], '█');
    S.birds(e, { n: 2, y0: hz * 0.4, y1: hz * 0.6, speed: 2.5, color: [60, 40, 70], seed: 3 });
  },
});
