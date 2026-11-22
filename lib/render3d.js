'use strict';
// Shared 3D renderer: sphere-traces a signed-distance scene per terminal cell with an
// orthographic camera (looking down -z), computes normals + ambient occlusion, asks the
// scene's material for brightness/colour, and maps that onto a character density ramp.
// Silhouettes are 2x2 supersampled and drawn with shape-aware glyphs ( / \ ( ) . ' ).
const { clamp } = require('./util');

const RAMP = ' .·:-~=+*ox%#@';
// edge glyphs from a 2x2 coverage mask: TL=8 TR=4 BL=2 BR=1
const EDGE = { 1: '.', 2: '.', 3: '.', 4: '\'', 8: '`', 12: '"', 5: '(', 10: ')', 6: '/', 9: '\\', 7: '/', 11: '\\', 13: '\\', 14: '/' };
const SUB = [[-0.25, -0.25, 8], [0.25, -0.25, 4], [-0.25, 0.25, 2], [0.25, 0.25, 1]];

/**
 * s = {
 *   sdf(x, y, z) -> distance,            world units, y up
 *   material(x, y, z, nx, ny, nz, ao) -> { b: 0..1, c: [r,g,b] }
 *   cx, cy: cell coords of the world origin;  upr: world units per terminal row
 *   bx, by, br: bounding sphere (world) that contains the whole scene
 *   vis: 0..1 global fade, ramp: density ramp, edges: bool (default true)
 *   put(col, row, ch, c, b, edge): optional custom writer
 * }
 */
function render3d(cv, s) {
  const { sdf, material, cx, cy, upr, bx, by, br } = s;
  const upc = upr / 2, ramp = s.ramp || RAMP, vis = s.vis == null ? 1 : s.vis;
  const foot = Math.max(upc, upr) * 0.9, edges = s.edges !== false;
  const put = s.put || ((col, row, ch, c, b) => cv.put(col, row, ch, c, b > 0.82));
  let DMIN = 1e9;

  const march = (u, v) => {
    const dd = br * br - (u - bx) ** 2 - (v - by) ** 2;
    DMIN = 1e9;
    if (dd <= 0) return NaN;
    const h = Math.sqrt(dd);
    let z = h;
    for (let i = 0; i < 80; i++) {
      const d = sdf(u, v, z);
      if (d < DMIN) DMIN = d;
      if (d < 0.0012) return z;
      z -= Math.max(d, 0.002);
      if (z < -h) break;
    }
    return NaN;
  };
  const shade = (u, v, z) => {
    const e = 0.0035;
    const a = sdf(u + e, v - e, z - e), b = sdf(u - e, v - e, z + e), c = sdf(u - e, v + e, z - e), d = sdf(u + e, v + e, z + e);
    let nx = a - b - c + d, ny = -a - b + c + d, nz = -a + b - c + d;
    const m = Math.hypot(nx, ny, nz) || 1; nx /= m; ny /= m; nz /= m;
    const ao = clamp(0.35 + (sdf(u + nx * 0.09, v + ny * 0.09, z + nz * 0.09) / 0.09) * 0.65, 0, 1);
    const r = material(u, v, z, nx, ny, nz, ao);
    r.nz = nz;
    return r;
  };

  const c0 = Math.max(0, Math.floor(cx + (bx - br) / upc)), c1 = Math.min(cv.w - 1, Math.ceil(cx + (bx + br) / upc));
  const r0 = Math.max(0, Math.floor(cy - (by + br) / upr)), r1 = Math.min(cv.h - 1, Math.ceil(cy - (by - br) / upr));
  for (let row = r0; row <= r1; row++) {
    for (let col = c0; col <= c1; col++) {
      const u = (col + 0.5 - cx) * upc, v = (cy - row - 0.5) * upr;
      const z = march(u, v);
      let b, c, ch = null, edge = false;
      if (z === z) {
        const m = shade(u, v, z);
        b = m.b; c = m.c; ch = m.ch || null;
        if (edges && m.nz < 0.45) {   // grazing normal: near the outline, find covered sub-cells
          let mask = 0, hits = 0;
          for (const [ox, oy, bit] of SUB) { const sz = march(u + ox * upc, v - oy * upr); if (sz === sz) { mask |= bit; hits++; } }
          if (hits < 4) { ch = EDGE[mask] || ch; b *= 0.55 + 0.11 * hits; edge = true; }
        }
      } else if (edges && DMIN < foot) {
        let mask = 0, hits = 0, sb = 0, sr = 0, sg = 0, sbl = 0;
        for (const [ox, oy, bit] of SUB) {
          const su = u + ox * upc, sv = v - oy * upr, sz = march(su, sv);
          if (sz === sz) { mask |= bit; hits++; const m = shade(su, sv, sz); sb += m.b; sr += m.c[0]; sg += m.c[1]; sbl += m.c[2]; }
        }
        if (!hits) continue;
        b = (sb / hits) * (0.45 + 0.12 * hits); c = [sr / hits, sg / hits, sbl / hits]; ch = EDGE[mask]; edge = true;
      } else continue;

      b *= vis;
      if (!ch) ch = ramp[Math.round(clamp(b, 0, 1) * (ramp.length - 1))];
      if (ch === ' ') continue;
      put(col, row, ch, c, b, edge);
    }
  }
}

module.exports = { render3d, RAMP };
