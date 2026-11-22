'use strict';
// Bengaluru in the evening: the garden city's rain trees, glass tech parks lighting up floor by
// floor, the Vidhana Soudha glowing gold, and traffic doing what Bengaluru traffic does best
// (inching along, honking).
const S = require('../scene');

const soudha = (lx, ly) => {
  const a = Math.abs(lx);
  if (ly < 0.32) return a < 0.62;                                                  // main block
  if (ly < 0.36) return a < 0.58;
  if (ly < 0.44 && a > 0.48 && a < 0.58) return true;                              // corner pavilions
  if (ly < 0.5 && a > 0.5 && a < 0.56) return Math.hypot((a - 0.53) / 0.03, (ly - 0.44) / 0.06) < 1;
  if (ly < 0.48) return a < 0.17;                                                  // central drum
  if (ly < 0.66) return Math.hypot(lx / 0.16, (ly - 0.48) / 0.18) < 1;              // the dome
  return ly < 0.74 && a < 0.012;                                                   // finial
};
const HONK = ['pom pom!', 'beep!', 'poooom', 'honk!'];

module.exports = S.makeScene({
  horizon: 0.64, still: 4,
  message: { style: 'card', fill: [255, 252, 240], ink: [120, 50, 40] },
  draw(e) {
    const { W, H, hz, t, cv } = e;
    S.sky(e, [[0, [44, 52, 110]], [0.55, [170, 110, 150]], [1, [250, 175, 120]]]);
    S.clouds(e, { y0: hz * 0.1, y1: hz * 0.7, color: [255, 180, 170], shade: [160, 100, 140], thr: 0.55, k: 4, speed: 0.02, scale: 0.04, seed: 3.3 });
    S.birds(e, { n: 5, y0: hz * 0.3, y1: hz * 0.55, speed: 3, color: [70, 40, 70], seed: 6 });
    // glass tech parks: horizontal bands of lit floors
    const parks = S.skyline(e, { seed: 41, base: hz, minH: hz * 0.18, maxH: hz * 0.48, minW: 6, maxW: 12, gaps: 0.6, color: (b) => S.mix([60, 90, 120], [80, 110, 150], S.H1(b.i, 2)), glyph: '▒' });
    for (const b of parks) for (let r = Math.ceil(b.top) + 1; r < hz; r += 2) {
      const on = S.H1(b.i, r, 4) < 0.55 + 0.35 * Math.sin(t * 0.2 + b.i);
      if (on) for (let x = b.x + 1; x < b.x + b.w - 1; x++) cv.put(x, r, '▁', [150, 220, 255]);
    }
    // Vidhana Soudha, lit gold
    const vs = Math.max(6, hz * 0.42), vx = W * 0.5;
    const f = S.landmark(e, vx, hz, vs, soudha, 0.64, 0.76, (c, r) => S.mix([255, 220, 140], [210, 160, 90], (hz - r) / vs), '▓');
    for (let x = Math.round(vx - vs * 0.3); x <= vx + vs * 0.3; x += 2) for (let r = Math.round(hz - vs * 0.3); r < hz; r++) if (f(x + 0.5, r + 0.5)) cv.put(x, r, '│', [150, 100, 50]);
    // rain trees: big rounded canopies
    for (let i = 0; i < W / 7; i++) {
      const x = S.H1(i, 1, 5) * W, r = 3 + S.H1(i, 2, 5) * 4, y = hz + 1 - r * 0.25;
      if (Math.abs(x - vx) < vs * 0.9 && S.H1(i, 3, 5) < 0.7) continue;
      S.rect(e, x - 0.5, y, x + 0.5, hz + 2, [50, 35, 30], '|');
      S.paint(e, (px, py) => { const d = Math.hypot((px - x) / r, ((py - y) * 2) / (r * 0.75)); return d < 0.85 + 0.25 * S.noise3(px * 0.5, py * 0.9, i); }, x - r * 1.2, y - r * 0.6, x + r * 1.2, y + r * 0.4, (c, row) => S.mix([60, 110, 60], [20, 55, 35], (row - y + r * 0.4) / r), '@');
    }
    // the road: a sidewalk, two lanes, a lot of patience
    const road = hz + 2;
    S.rect(e, 0, road, W, road + 1, [70, 60, 60], ' ');
    S.rect(e, 0, road + 1, W, H, [36, 34, 40], ' ');
    const auto = (i, body, dir) => (dir > 0 ? [['▪', [255, 60, 40]], ['▟', [30, 120, 60]], ['▙', [240, 200, 30]], ['▪', [255, 240, 190]]] : [['▪', [255, 240, 190]], ['▟', [240, 200, 30]], ['▙', [30, 120, 60]], ['▪', [255, 60, 40]]]);
    const lanes = [road + 2, road + 4].filter((r) => r < H);
    lanes.forEach((row, k) => {
      const dir = k ? 1 : -1;
      S.traffic(e, row, { n: Math.ceil(W / 7), speed: 4, dir, seed: 50 + k, jam: true, colors: [[200, 200, 210], [180, 40, 40], [50, 60, 120]] });
      S.traffic(e, row, { n: Math.ceil(W / 18), speed: 4, dir, seed: 60 + k, jam: true, colors: [[0, 0, 0]], draw: auto });
    });
    // somebody always honks
    if (lanes.length) {
      const k = Math.floor(t / 1.3), hx = S.H1(k, 1, 7) * (W - 10), age = t - k * 1.3;
      if (age < 0.8) cv.text(hx, lanes[0] - 1 - (age > 0.4 ? 1 : 0), HONK[(S.H1(k, 2, 7) * HONK.length) | 0], [255, 255, 255], true);
    }
  },
});
