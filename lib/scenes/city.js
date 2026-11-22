'use strict';
// A city at night: two layers of skyline with windows switching on and off, antenna beacons,
// streetlamps, and traffic streaming both ways. Your message lights up as a neon sign.
const S = require('../scene');

const WARM = [[255, 214, 130], [255, 190, 100], [240, 235, 200], [150, 200, 255]];

module.exports = S.makeScene({
  horizon: 0.8, still: 3,
  message: { style: 'neon', border: [255, 70, 180], ink: [110, 240, 255] },
  draw(e) {
    const { W, H, hz, t, cv } = e;
    S.sky(e, [[0, [5, 6, 22]], [0.6, [22, 16, 48]], [1, [86, 42, 86]]]);
    S.stars(e, Math.round((W * hz) / 70), hz * 0.55);
    S.moon(e, W * 0.84, Math.max(2, H * 0.13), Math.max(2.2, H * 0.06));
    // a plane's blinking lights crossing high up
    const px = S.mod(t * 6, W + 40) - 20, py = Math.max(1, H * 0.22);
    if (Math.sin(t * 7) > 0.4) cv.put(px, py, '•', [255, 60, 60]); else cv.put(px, py, '·', [230, 230, 255]);
    S.addGlow(e, W / 2, hz, W * 0.7, H * 0.35, [40, 18, 40], 1);
    S.skyline(e, { seed: 1, base: hz, minH: hz * 0.28, maxH: hz * 0.72, minW: 4, maxW: 9, color: [30, 28, 60], glyph: '▒', beacon: true, win: { frac: 0.2, color: [120, 110, 150], sx: 2, sy: 2 } });
    S.skyline(e, { seed: 2, base: hz, minH: hz * 0.12, maxH: hz * 0.42, minW: 5, maxW: 12, color: [13, 11, 26], glyph: '▓', win: { frac: 0.38, color: WARM, sx: 2, sy: 1, bottom: 1 } });
    // street: sidewalk, asphalt, lane markings, lamps, cars
    const sh = H - hz;
    S.rect(e, 0, hz, W, hz + 1, [46, 40, 54], ' ');
    S.rect(e, 0, hz + 1, W, H, [20, 19, 26], ' ');
    const laneA = hz + Math.max(1, Math.round(sh * 0.35)), laneB = hz + Math.max(2, Math.round(sh * 0.72)), mid = Math.round((laneA + laneB) / 2);
    if (mid > laneA && mid < laneB) for (let x = 0; x < W; x += 6) cv.text(x, mid, '──', [120, 110, 70]);
    for (let x = 6; x < W; x += 18) {
      S.addGlow(e, x + 0.5, hz, 6, 3, [70, 50, 20], 0.9);
      for (let y = hz - 3; y < hz; y++) cv.put(x, y, '│', [70, 70, 85]);
      cv.put(x, hz - 4, '◡', [255, 220, 150], true);
    }
    S.traffic(e, laneA, { n: Math.ceil(W / 14), speed: 9, dir: -1, seed: 3, colors: [[200, 40, 40], [40, 90, 200], [220, 220, 230], [240, 190, 40]] });
    if (laneB < H) S.traffic(e, laneB, { n: Math.ceil(W / 12), speed: 12, dir: 1, seed: 4, colors: [[60, 60, 70], [190, 50, 60], [240, 200, 40], [70, 150, 90]] });
  },
});
