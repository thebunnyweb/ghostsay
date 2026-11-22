'use strict';
// San Francisco on a foggy morning: the Golden Gate Bridge in International Orange with cars
// crossing, fog rolling in through the towers, the headlands, the Transamerica pyramid over the
// city, sailboats and gulls on the bay.
const S = require('../scene');

const ORANGE = [200, 64, 40], ORANGE_D = [150, 44, 30];

module.exports = S.makeScene({
  horizon: 0.66, still: 6,
  message: { style: 'card', fill: [255, 250, 245], ink: [170, 50, 30] },
  draw(e) {
    const { W, H, hz, t, cv } = e;
    S.sky(e, [[0, [110, 145, 190]], [0.7, [200, 200, 210]], [1, [235, 215, 200]]]);
    S.sun(e, W * 0.86, Math.max(3, H * 0.16), Math.max(2.5, H * 0.06), [255, 245, 220], [60, 50, 40]);
    // headlands and the city
    const left = (x) => hz - H * 0.18 * Math.exp(-((x / (W * 0.18)) ** 2)) - 1.5 * S.noise3(x * 0.15, 1, 0);
    S.ridge(e, left, (c, r) => S.mix([110, 120, 90], [80, 95, 70], (r - left(c)) / 6), '▓', hz);
    const right = (x) => hz - H * 0.13 * Math.exp(-(((x - W) / (W * 0.22)) ** 2)) - 0.8;
    S.ridge(e, right, [130, 130, 120], '▒', hz);
    S.skyline(e, { seed: 71, base: right(W * 0.9) + 1, x0: W * 0.82, minH: 1, maxH: hz * 0.12, minW: 2, maxW: 4, color: [175, 170, 170], glyph: '▒' });
    const tx = W * 0.92, tb = right(tx) + 1, th = hz * 0.34;
    S.paint(e, (x, y) => y < tb && y > tb - th && Math.abs(x - tx) < 1.6 * (tb - y < th * 0.85 ? (1 - (tb - y) / th) + 0.25 : 0.12), tx - 3, tb - th, tx + 3, tb, [215, 210, 210], '▓');
    // the bay
    S.water(e, hz, H, { far: [120, 140, 160], near: [40, 70, 100], wave: [235, 240, 245], speed: 0.3 });
    // the bridge
    const deck = hz - Math.max(2, H * 0.07), T1 = W * 0.3, T2 = W * 0.7, top = Math.max(e.top, hz - H * 0.5);
    const p = S.pix(e);
    const cable = (x) => {
      if (x < T1) { const k = (T1 - x) / T1; return top + 0.5 + (deck - 1 - top) * k ** 1.3; }
      if (x > T2) { const k = (x - T2) / (W - T2); return top + 0.5 + (deck - 1 - top) * k ** 1.3; }
      const k = (x - (T1 + T2) / 2) / ((T2 - T1) / 2); return deck - 0.8 - (deck - 1 - top) * k * k;
    };
    for (let x = 0; x < W; x += 2) if (Math.abs(x - T1) > 1.5 && Math.abs(x - T2) > 1.5) p.line(x, cable(x) + 0.5, x, deck, [190, 90, 70], 0);   // suspenders
    p.flush('|');
    p.curve((s) => [s * W, cable(s * W)], ORANGE, 0, 160);
    p.flush('-');
    S.rect(e, 0, deck, W, deck + 1, ORANGE_D, '=');
    for (const tx2 of [T1, T2]) {
      S.rect(e, tx2 - 1.5, top, tx2 - 0.5, hz + 0.5, ORANGE, '#'); S.rect(e, tx2 + 0.5, top, tx2 + 1.5, hz + 0.5, ORANGE, '#');
      for (let k = 0; k < 4; k++) { const y = top + 1 + k * (deck - top) / 3.4; S.rect(e, tx2 - 1.5, y, tx2 + 1.5, y + 0.5, ORANGE, '#'); }
      if (Math.sin(t * 2 + tx2) > 0) cv.put(tx2, Math.floor(top) - 1, '•', [255, 60, 60]);
    }
    // cars on the deck
    for (let i = 0; i < W / 6; i++) {
      const dir = i % 2 ? 1 : -1, x = S.mod(S.H1(i, 1, 3) * (W + 4) + dir * t * 5 * (0.8 + 0.4 * S.H1(i, 2, 3)), W + 4) - 2;
      cv.put(x, deck - 1, '▄', [[240, 240, 240], [60, 60, 70], [40, 90, 180], [200, 40, 40]][(S.H1(i, 3, 3) * 4) | 0]);
    }
    S.reflections(e, hz + 1, Math.max(2, Math.round((H - hz) * 0.4)), [{ x: Math.round(T1), c: ORANGE }, { x: Math.round(T2), c: ORANGE }]);
    // a sailboat or two
    for (let i = 0; i < 2; i++) {
      const bx = S.mod(t * (1.2 + i * 0.5) + i * W * 0.5, W + 12) - 6, by = Math.round(hz + (H - hz) * (0.35 + i * 0.3));
      if (by >= H) continue;
      cv.text(bx + 1, by - 2, '|\\', [250, 250, 250]); cv.text(bx + 1, by - 1, '|_\\', [250, 250, 250]); cv.text(bx, by, '\\___/', [120, 60, 50]);
    }
    S.birds(e, { n: 3, y0: hz * 0.3, y1: hz * 0.6, speed: 3, color: [80, 80, 90], seed: 2 });
    // Karl the fog, rolling in through the Gate
    S.haze(e, 0, H, (x, y) => {
      const band = Math.exp(-(((y - (deck - (deck - top) * 0.45)) / ((deck - top) * 0.5)) ** 2));
      const low = Math.exp(-(((y - hz) / 3) ** 2)) * 0.6;
      return (band + low) * S.clamp((S.fbm(x * 0.04 - t * 0.12, y * 0.12, 3.3, 3) - 0.38) * 2.6, 0, 1);
    }, [235, 235, 238]);
  },
});
