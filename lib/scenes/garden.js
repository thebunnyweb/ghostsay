'use strict';
// A garden on a sunny day: rolling hills, round trees, a white picket fence, flowers nodding
// in the breeze, butterflies and a busy bee.
const S = require('../scene');

const FLOWERS = [['✿', [255, 120, 170]], ['❀', [255, 230, 90]], ['✿', [200, 120, 255]], ['❁', [255, 255, 255]], ['✾', [255, 100, 80]], ['❀', [255, 170, 60]]];

module.exports = S.makeScene({
  horizon: 0.6, still: 2,
  message: { style: 'card', fill: [255, 255, 250], ink: [40, 100, 60] },
  draw(e) {
    const { W, H, hz, t, cv } = e;
    S.sky(e, [[0, [70, 140, 225]], [1, [190, 225, 250]]]);
    S.sun(e, W * 0.12, Math.max(3, H * 0.13), Math.max(3, H * 0.08), [255, 248, 200], [90, 80, 40]);
    S.clouds(e, { y0: 0, y1: hz * 0.75, color: [255, 255, 255], shade: [210, 220, 240], thr: 0.55, k: 5, speed: 0.025, scale: 0.04, seed: 1.7 });
    S.birds(e, { n: 3, y0: hz * 0.3, y1: hz * 0.6, speed: 3, color: [60, 70, 90], seed: 8 });
    const far = (x) => hz - H * 0.08 * S.noise3(x * 0.03, 1, 0) - 1;
    S.ridge(e, far, [120, 180, 110], '░');
    // round trees on the far hill
    for (let i = 0; i < W / 9; i++) {
      const x = S.H1(i, 1, 2) * W, r = 2 + S.H1(i, 2, 2) * 2.5, y = far(x) - r * 0.3;
      S.rect(e, x - 0.25, y, x + 0.25, y + r * 0.5, [90, 70, 50], '|');
      S.disc(e, x, y - r * 0.15, r, (c, row) => S.mix([90, 160, 80], [50, 110, 60], (row - y + r * 0.6) / r), Infinity, '@');
    }
    const mid = (x) => hz + H * 0.08 - H * 0.07 * S.noise3(x * 0.04, 3, 0);
    S.ridge(e, mid, (c, r) => S.mix([110, 190, 90], [80, 160, 70], (r - mid(c)) / 6), '▒');
    // picket fence
    const fy = Math.round(hz + (H - hz) * 0.42);
    S.paint(e, (x, y) => {
      const k = S.mod(x, 3);
      if (y > fy - 1.2 && y < fy - 0.7) return true;                         // rails
      if (y > fy + 0.6 && y < fy + 1.0) return true;
      return k < 1.5 && y < fy + 2 && y > fy - 2 + Math.abs(k - 0.75) * 1.2;  // pointed pickets
    }, 0, fy - 2.5, W, fy + 2, [250, 250, 245], '#');
    // the lawn
    S.rect(e, 0, fy + 2, W, H, (c, r) => S.mix([90, 170, 70], [50, 120, 50], (r - fy) / (H - fy)), ' ');
    for (let i = 0; i < W * 0.8; i++) {
      const x = S.H1(i, 3, 3) * W, y = fy + 2 + S.H1(i, 4, 3) * (H - fy - 2);
      cv.put(x, y, S.H1(i, 5, 3) < 0.5 ? '"' : '\'', [40, 110, 40]);
    }
    // flowers nodding in the breeze
    const n = Math.round(W / 2.6);
    for (let i = 0; i < n; i++) {
      const x = Math.round(S.H1(i, 6, 3) * W), y = Math.round(fy + 3 + S.H1(i, 7, 3) * (H - fy - 3));
      if (y >= H) continue;
      const sway = Math.sin(t * 1.6 + x * 0.25), lean = sway > 0.45 ? 1 : sway < -0.45 ? -1 : 0;
      const [g, c] = FLOWERS[(S.H1(i, 8, 3) * FLOWERS.length) | 0];
      cv.put(x, y, lean > 0 ? '/' : lean < 0 ? '\\' : '|', [40, 120, 40]);
      cv.put(x + lean, y - 1, e.rich ? g : '*', c, true);
    }
    // butterflies and a bee
    for (let i = 0; i < 3; i++) {
      const bx = W * (0.25 + 0.25 * i) + Math.sin(t * 0.5 + i * 2) * W * 0.15, by = fy - 2 + Math.sin(t * 0.9 + i) * (H - fy) * 0.35 - 1;
      const open = Math.sin(t * 14 + i) > 0, c = [[255, 160, 50], [120, 180, 255], [255, 120, 200]][i];
      cv.text(bx, by, e.rich ? (open ? 'ʚɞ' : '()') : (open ? '}{' : '||'), c, true);
    }
    const bx = W * 0.7 + Math.sin(t * 2.3) * 6 + Math.sin(t * 7) * 1.5, by = fy + 1 + Math.sin(t * 3.1) * 2;
    cv.text(bx, by, '•', [255, 210, 40], true); cv.put(bx + 1, by - 1, Math.sin(t * 30) > 0 ? '`' : '\'', [220, 230, 255]);
  },
});
