'use strict';
// Rio de Janeiro on a bright day: Sugarloaf rising out of the bay with its cable car gliding
// between the peaks, Christ the Redeemer on top of Corcovado, waves rolling onto Copacabana and
// the famous wavy black-and-white promenade. A beach plane tows your message.
const S = require('../scene');

module.exports = S.makeScene({
  horizon: 0.62, still: 3,
  message: { style: 'banner', cloth: [255, 230, 40], hem: [20, 150, 70], ink: [20, 60, 140], trim: [20, 150, 70] },
  draw(e) {
    const { W, H, hz, t, cv } = e;
    S.sky(e, [[0, [30, 100, 200]], [1, [160, 210, 245]]]);
    S.sun(e, W * 0.55, Math.max(3, H * 0.12), Math.max(2.5, H * 0.06), [255, 252, 220], [80, 80, 50]);
    S.clouds(e, { y0: 0, y1: hz * 0.7, color: [255, 255, 255], shade: [210, 225, 245], thr: 0.57, k: 5, speed: 0.02, scale: 0.04, seed: 8.8 });
    // Corcovado with the statue on its summit
    const cx = W * 0.2, ctop = hz * 0.36;
    const corc = (x) => { const d = Math.abs(x - cx) / (W * 0.22); return hz - (hz - ctop) * Math.exp(-d * d * 2.2) - 2 * S.noise3(x * 0.2, 1, 0); };
    S.ridge(e, (x) => (x < W * 0.5 ? corc(x) : 1e9), (c, r) => S.mix([60, 120, 80], [40, 90, 60], (r - corc(c)) / 10), '▓', hz);
    const st = Math.max(3, hz * 0.12), sy = corc(cx) + 0.4;
    S.paint(e, (x, y) => {
      const lx = (x - cx) / 2, ly = sy - y;
      if (ly < 0 || ly > st) return false;
      if (Math.abs(lx) < st * 0.06 && ly < st * 0.92) return true;                                    // body
      if (ly > st * 0.66 && ly < st * 0.74) return Math.abs(lx) < st * 0.36;                          // outstretched arms
      return ly >= st * 0.92 && Math.hypot(lx / (st * 0.06), (ly - st * 0.96) / (st * 0.06)) < 1;    // head
    }, cx - st, sy - st - 1, cx + st, sy, [240, 240, 235], '█');
    // Sugarloaf and Morro da Urca out in the bay, with the cable car
    const sl = W * 0.78, sh = hz * 0.62;
    const loaf = (x) => {
      const a = Math.abs(x - sl) / (W * 0.07), b = Math.abs(x - (sl - W * 0.13)) / (W * 0.08);
      return Math.min(a < 1 ? hz - sh * Math.sqrt(1 - a * a) ** 0.7 : 1e9, b < 1 ? hz - sh * 0.45 * Math.sqrt(1 - b * b) : 1e9);
    };
    S.ridge(e, loaf, (c, r) => (c > sl ? [70, 100, 90] : S.mix([110, 140, 120], [60, 100, 80], (r - loaf(c)) / 8)), '▓', hz);
    const pa = [sl - W * 0.13, loaf(sl - W * 0.13) - 0.5], pb = [sl, loaf(sl) - 0.5];
    const p = S.pix(e);
    p.curve((s) => [pa[0] + (pb[0] - pa[0]) * s, pa[1] + (pb[1] - pa[1]) * s + Math.sin(Math.PI * s) * 1.5], [60, 60, 70], 0, 30);
    p.flush('-');
    const k = (Math.sin(t * 0.3) + 1) / 2, carX = pa[0] + (pb[0] - pa[0]) * k, carY = pa[1] + (pb[1] - pa[1]) * k + Math.sin(Math.PI * k) * 1.5 + 1;
    cv.put(carX, carY, '▣', [230, 60, 40], true);
    // the bay and the beach
    const shore = Math.round(hz + (H - hz) * 0.42);
    S.water(e, hz, shore + 2, { far: [40, 110, 170], near: [40, 160, 180], wave: [235, 250, 255], speed: 0.25, glint: { x: W * 0.55, w: 5, color: [255, 255, 240] } });
    const wash = (x) => shore + 0.5 + 1.3 * (0.5 + 0.5 * Math.sin(t * 0.9)) + 0.5 * S.noise3(x * 0.1, t * 0.4, 2);
    const prom = H - Math.max(2, Math.round((H - hz) * 0.18));
    S.ridge(e, wash, [240, 215, 170], ' ', prom - 1);
    for (let x = 0; x < W; x++) if (S.noise3(x * 0.35, t * 1.4, 5) > 0.32) cv.put(x, Math.floor(wash(x + 0.5)), '▀', [255, 255, 255]);
    for (let i = 0; i < W / 9; i++) {
      const x = S.H1(i, 1, 6) * W, y = Math.round(shore + 3 + S.H1(i, 2, 6) * (prom - shore - 4));
      if (y > wash(x) + 1 && y < prom) cv.put(x, y, ['⛱', 'o', 'o', '.'][(S.H1(i, 3, 6) * 4) | 0] === '⛱' ? 'T' : '.', [[230, 60, 60], [40, 120, 220], [250, 200, 30]][(S.H1(i, 4, 6) * 3) | 0], true);
    }
    // Copacabana's wave mosaic
    S.paint(e, (x, y) => y >= prom, 0, prom, W, H, (c, r) => (Math.sin(c * 0.42 + Math.sin(c * 0.21) * 0.5 + (r - prom) * 1.3) > 0 ? [20, 20, 22] : [245, 242, 235]), '▒');
  },
});
