// Polygon extrusion and file export (binary STL, 3MF).
import libtess from '../vendor/libtess.js';

let tess = null;
let tessOut = null;
function getTess() {
  if (tess) return tess;
  tess = new libtess.GluTesselator();
  const G = libtess.gluEnum;
  tess.gluTessCallback(G.GLU_TESS_VERTEX_DATA, (v, out) => out.tris.push(v.i));
  tess.gluTessCallback(G.GLU_TESS_BEGIN, () => {});
  tess.gluTessCallback(G.GLU_TESS_ERROR, (e) => { throw new Error(`tessellation error ${e}`); });
  // new vertices only appear where rings cross, which clean input never does
  tess.gluTessCallback(G.GLU_TESS_COMBINE, (coords, data, weight, out) => {
    const i = out.extra.length / 2;
    out.extra.push(coords[0], coords[1]);
    return { i: -1 - i, x: coords[0], y: coords[1] };
  });
  // an edge-flag callback forces plain triangles (no fans or strips)
  tess.gluTessCallback(G.GLU_TESS_EDGE_FLAG, () => {});
  tess.gluTessNormal(0, 0, 1);
  tess.gluTessProperty(G.GLU_TESS_WINDING_RULE, libtess.windingRule.GLU_TESS_WINDING_ODD);
  return tess;
}

/** Triangulate rings given as one flat [x,y,...] array. Returns index triples. */
function triangulate(flat, ringStarts) {
  const t = getTess();
  const out = { tris: [], extra: [] };
  t.gluTessBeginPolygon(out);
  const n = flat.length / 2;
  for (let r = 0; r < ringStarts.length; r++) {
    const start = ringStarts[r], end = r + 1 < ringStarts.length ? ringStarts[r + 1] : n;
    t.gluTessBeginContour();
    for (let i = start; i < end; i++) {
      t.gluTessVertex([flat[2 * i], flat[2 * i + 1], 0], { i, x: flat[2 * i], y: flat[2 * i + 1] });
    }
    t.gluTessEndContour();
  }
  t.gluTessEndPolygon();
  return out;
}

const signedArea = (ring) => {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1]);
  return a / 2; // > 0 means counter-clockwise
};

// Drop duplicate and exactly collinear points so the faces and the side walls
// share every vertex.
function cleanRing(ring) {
  let r = ring.slice();
  let changed = true;
  while (changed && r.length >= 3) {
    changed = false;
    const out = [];
    for (let i = 0; i < r.length; i++) {
      const p = out.length ? out[out.length - 1] : r[r.length - 1];
      const q = r[i];
      const n = r[(i + 1) % r.length];
      const same = q[0] === p[0] && q[1] === p[1];
      const area = (q[1] - p[1]) * (n[0] - q[0]) - (q[0] - p[0]) * (n[1] - q[1]);
      if (same || area === 0) { changed = true; continue; }
      out.push(q);
    }
    r = out;
  }
  return r;
}

/** Extrude polygons-with-holes between z0 and z1 into an indexed mesh. */
export function extrude(polys, z0, z1, mesh = { positions: [], indices: [] }) {
  const P = mesh.positions, I = mesh.indices;
  for (const raw of polys) {
    const poly = { outer: cleanRing(raw.outer), holes: raw.holes.map(cleanRing).filter((h) => h.length >= 3) };
    if (poly.outer.length < 3) continue;
    const outer = signedArea(poly.outer) > 0 ? poly.outer : poly.outer.slice().reverse();
    const holes = poly.holes.map((h) => (signedArea(h) < 0 ? h : h.slice().reverse()));
    const rings = [outer, ...holes];
    const flat = [];
    const ringStarts = [];
    for (const r of rings) {
      ringStarts.push(flat.length / 2);
      for (const [x, y] of r) flat.push(x, y);
    }
    const n = flat.length / 2;
    const base = P.length / 3;
    for (let i = 0; i < n; i++) P.push(flat[2 * i], flat[2 * i + 1], z0);
    for (let i = 0; i < n; i++) P.push(flat[2 * i], flat[2 * i + 1], z1);

    const { tris, extra } = triangulate(flat, ringStarts);
    // any vertex libtess had to add goes after the ring vertices (top and bottom copies)
    const extraBase = P.length / 3;
    const m = extra.length / 2;
    for (let i = 0; i < m; i++) P.push(extra[2 * i], extra[2 * i + 1], z0);
    for (let i = 0; i < m; i++) P.push(extra[2 * i], extra[2 * i + 1], z1);
    const lo = (i) => (i >= 0 ? base + i : extraBase + (-1 - i));
    const hi = (i) => (i >= 0 ? base + n + i : extraBase + m + (-1 - i));
    const xy = (i) => (i >= 0 ? [flat[2 * i], flat[2 * i + 1]] : [extra[2 * (-1 - i)], extra[2 * (-1 - i) + 1]]);
    for (let t = 0; t < tris.length; t += 3) {
      let a = tris[t], b = tris[t + 1], c = tris[t + 2];
      const [ax, ay] = xy(a), [bx, by] = xy(b), [cx, cy] = xy(c);
      if ((bx - ax) * (cy - ay) - (by - ay) * (cx - ax) < 0) [b, c] = [c, b];
      I.push(hi(a), hi(b), hi(c)); // top, facing +Z
      I.push(lo(a), lo(c), lo(b)); // bottom, facing -Z
    }
    // side walls: outer is CCW, holes CW, so "right of travel" is always outward
    let start = 0;
    for (const r of rings) {
      const m = r.length;
      for (let i = 0; i < m; i++) {
        const a = base + start + i, b = base + start + ((i + 1) % m);
        I.push(a, b, b + n, a, b + n, a + n);
      }
      start += m;
    }
  }
  return mesh;
}

/** Build one indexed mesh for a body (all its shells). */
export function bodyMesh(body) {
  const mesh = { positions: [], indices: [] };
  for (const s of body.shells) extrude(s.polys, s.z0, s.z1, mesh);
  return mesh;
}

export function toBinarySTL(mesh, name = 'pcb') {
  const P = mesh.positions, I = mesh.indices;
  const triCount = I.length / 3;
  const buf = new ArrayBuffer(84 + triCount * 50);
  const dv = new DataView(buf);
  const header = `PCB fit-test model: ${name}`.slice(0, 80);
  for (let i = 0; i < header.length; i++) dv.setUint8(i, header.charCodeAt(i) & 0x7f);
  dv.setUint32(80, triCount, true);
  let off = 84;
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
    const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
    for (const v of [nx, ny, nz]) { dv.setFloat32(off, v, true); off += 4; }
    for (const k of [a, b, c]) {
      dv.setFloat32(off, P[k], true);
      dv.setFloat32(off + 4, P[k + 1], true);
      dv.setFloat32(off + 8, P[k + 2], true);
      off += 12;
    }
    dv.setUint16(off, 0, true);
    off += 2;
  }
  return new Uint8Array(buf);
}

const fmt = (v) => (Math.round(v * 1e5) / 1e5).toString();
const esc = (s) => s.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));

/**
 * 3MF with one object made of one part per colour, so slicers load the parts
 * already assembled. parts: [{ name, color: '#rrggbb', mesh }]
 */
export function build3MFModel(parts, objectName = 'PCB') {
  const lines = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push('<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">');
  lines.push(' <metadata name="Application">PCB Fit-Test</metadata>');
  lines.push(' <resources>');
  lines.push('  <basematerials id="1">');
  for (const p of parts) lines.push(`   <base name="${esc(p.name)}" displaycolor="${p.color.toUpperCase()}FF" />`);
  lines.push('  </basematerials>');
  parts.forEach((p, idx) => {
    const id = idx + 2;
    lines.push(`  <object id="${id}" name="${esc(p.name)}" type="model" pid="1" pindex="${idx}">`);
    lines.push('   <mesh>');
    lines.push('    <vertices>');
    const P = p.mesh.positions;
    for (let i = 0; i < P.length; i += 3) lines.push(`     <vertex x="${fmt(P[i])}" y="${fmt(P[i + 1])}" z="${fmt(P[i + 2])}" />`);
    lines.push('    </vertices>');
    lines.push('    <triangles>');
    const I = p.mesh.indices;
    for (let i = 0; i < I.length; i += 3) lines.push(`     <triangle v1="${I[i]}" v2="${I[i + 1]}" v3="${I[i + 2]}" />`);
    lines.push('    </triangles>');
    lines.push('   </mesh>');
    lines.push('  </object>');
  });
  const groupId = parts.length + 2;
  lines.push(`  <object id="${groupId}" name="${esc(objectName)}" type="model">`);
  lines.push('   <components>');
  parts.forEach((_, idx) => lines.push(`    <component objectid="${idx + 2}" />`));
  lines.push('   </components>');
  lines.push('  </object>');
  lines.push(' </resources>');
  lines.push(' <build>');
  lines.push(`  <item objectid="${groupId}" />`);
  lines.push(' </build>');
  lines.push('</model>');
  return lines.join('\n');
}

export async function build3MF(JSZip, parts, objectName) {
  const zip = new JSZip();
  zip.file('[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>');
  zip.file('_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>');
  zip.file('3D/3dmodel.model', build3MFModel(parts, objectName));
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}
