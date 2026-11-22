'use strict';
// A snowy night: the northern lights rippling over snowy hills, frosted pines, a log cabin with
// a warm window and smoke curling out of the chimney, and snow falling and falling.
const S = require('../scene');

function pine(e, x, base, h, c) {
  const tri = (lx, ly) => {
    if (ly < 0.12) return Math.abs(lx) < 0.03;
    for (let k = 0; k < 3; k++) {
      const y0 = 0.12 + k * 0.26, y1 = y0 + 0.42;
      if (ly >= y0 && ly < y1 && Math.abs(lx) < (0.22 - k * 0.05) * (1 - (ly - y0) / (y1 - y0))) return true;
    }
    return false;
  };
  S.landmark(e, x, base, h, tri, 0.25, 1, (col, row) => {
    const ly = (base - row) / h, k = ((ly - 0.12) % 0.26) / 0.26;
    return ly > 0.12 && k > 0.55 ? [225, 235, 250] : c;     // snow on each tier
  }, '▓');
}

module.exports = S.makeScene({
  horizon: 0.66, still: 5,
  message: { style: 'card', fill: [235, 245, 255], ink: [30, 50, 100], shadow: null },
  draw(e) {
    const { W, H, hz, t, cv } = e;
    S.sky(e, [[0, [4, 8, 28]], [0.7, [18, 30, 70]], [1, [40, 60, 110]]]);
    // aurora: curtains of green and violet rippling across the sky
    if (e.rich) for (let y = 0; y < hz; y++) for (let x = 0; x < W; x++) {
      const c = hz * (0.32 + 0.12 * Math.sin(x * 0.045 + t * 0.25) + 0.06 * Math.sin(x * 0.11 - t * 0.4));
      const d = (y - c) / (hz * 0.22);
      if (d < -1.2 || d > 1) continue;
      const curtain = 0.45 + 0.55 * S.noise3(x * 0.22, t * 0.35, 3.3);
      const a = Math.exp(-d * d * 3) * curtain * (d < 0 ? 0.55 : 1);
      if (a < 0.03) continue;
      const i = y * cv.w + x, b = cv.bg[i] || [0, 0, 0], col = S.mix([40, 230, 140], [150, 70, 220], S.clamp(-d, 0, 1));
      cv.bg[i] = [b[0] + col[0] * a * 0.5, b[1] + col[1] * a * 0.5, b[2] + col[2] * a * 0.5];
    }
    S.stars(e, Math.round((W * hz) / 50), hz);
    S.moon(e, W * 0.86, Math.max(2, H * 0.12), Math.max(2, H * 0.05), 0);
    // hills of snow
    const far = (x) => hz - H * 0.06 - H * 0.12 * S.noise3(x * 0.03, 2, 0);
    S.ridge(e, far, (c, r) => S.mix([120, 140, 190], [80, 100, 160], (r - far(c)) / 6), '░');
    for (let i = 0; i < W / 4; i++) { const x = S.H1(i, 1, 4) * W; pine(e, x, far(x) + 1.5, H * (0.08 + 0.05 * S.H1(i, 2, 4)), [30, 50, 70]); }
    const near = (x) => hz + H * 0.08 - H * 0.08 * S.noise3(x * 0.04, 5, 0);
    S.ridge(e, near, (c, r) => S.mix([215, 228, 250], [140, 160, 210], (r - near(c)) / (H - near(c))), ' ');
    // the cabin
    const cx = Math.round(W * 0.62), cw = Math.max(10, Math.round(H * 0.45)), base = Math.round(near(cx) + 1.5), ch = Math.max(4, Math.round(cw * 0.32));
    S.rect(e, cx - cw / 2, base - ch, cx + cw / 2, base, (c, r) => ((r % 2) ? [90, 50, 30] : [110, 64, 38]), '▓');
    S.paint(e, (x, y) => y < base - ch + 0.5 && y > base - ch - cw * 0.3 && Math.abs(x - cx) < (cw / 2 + 1.5) * (1 - (base - ch - y) / (cw * 0.3)), cx - cw / 2 - 2, base - ch - cw * 0.3, cx + cw / 2 + 2, base - ch + 1, [235, 240, 255], '█');
    S.rect(e, cx + cw * 0.22, base - ch - cw * 0.3, cx + cw * 0.32, base - ch - cw * 0.08, [70, 50, 50], '▓');
    const wx = cx - cw * 0.3, glowK = 0.85 + 0.15 * S.noise3(t * 3, 1, 1);
    S.addGlow(e, wx + 1.5, base - ch / 2, 9, 3.5, [120, 70, 10], glowK);
    S.rect(e, wx, base - ch * 0.7, wx + 3, base - ch * 0.25, S.scale([255, 200, 100], glowK), '#');
    S.rect(e, cx + cw * 0.1, base - ch * 0.75, cx + cw * 0.1 + 2, base, [60, 35, 25], '|');
    // chimney smoke
    const smx = cx + cw * 0.27, smy = base - ch - cw * 0.3 - 1;
    for (let k = 0; k < 14; k++) {
      const age = S.mod(t * 1.2 + k * 0.5, 7), y = smy - age * 1.1, x = smx + Math.sin(age * 0.9 + t * 0.5) * age * 0.5 + age * 0.6;
      if (y < 0) continue;
      cv.put(x, y, age < 2 ? '○' : age < 4.5 ? 'o' : '·', S.mix([200, 205, 220], [60, 70, 100], age / 7));
    }
    pine(e, W * 0.12, H + 1, H * 0.5, [20, 45, 50]);
    pine(e, W * 0.9, H + 1, H * 0.4, [20, 45, 50]);
    S.fall(e, { kind: 'snow', n: Math.round(W * H / 25), speed: 3.2, wind: 0.6, near: [255, 255, 255], far: [130, 150, 200], seed: 1 });
  },
});
