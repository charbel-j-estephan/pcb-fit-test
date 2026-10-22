// Node test runner: node test/run.js
import fs from 'node:fs';
import path from 'node:path';
import { identify } from '../src/layers.js';
import { parseLayers, buildModel } from '../src/model.js';
import { extrude, bodyMesh, toBinarySTL, build3MFModel } from '../src/mesh.js';
import { files as sampleFiles } from './samples.js';
import layerFailures from './layers.test.js';

let failures = layerFailures;
const check = (cond, msg) => {
  if (cond) console.log(`  ok   ${msg}`);
  else { failures++; console.log(`  FAIL ${msg}`); }
};
const approx = (a, b, tol = 1e-3) => Math.abs(a - b) <= tol;

/** Every edge must appear exactly once in each direction. Returns number of bad edges. */
function nonManifoldEdges(mesh) {
  const P = mesh.positions, I = mesh.indices;
  // weld by position so coincident vertices from separate rings count as one
  const key = (i) => `${P[i * 3].toFixed(6)},${P[i * 3 + 1].toFixed(6)},${P[i * 3 + 2].toFixed(6)}`;
  const counts = new Map();
  for (let t = 0; t < I.length; t += 3) {
    for (let e = 0; e < 3; e++) {
      const a = key(I[t + e]), b = key(I[t + ((e + 1) % 3)]);
      const k = `${a}|${b}`;
      counts.set(k, (counts.get(k) || 0) + 1);
    }
  }
  let bad = 0;
  for (const [k, c] of counts) {
    const [a, b] = k.split('|');
    if (c !== 1 || counts.get(`${b}|${a}`) !== 1) bad++;
  }
  return bad;
}

function shellsWatertight(model) {
  let bad = 0, shells = 0;
  for (const body of model.bodies) for (const s of body.shells) {
    shells++;
    bad += nonManifoldEdges(extrude(s.polys, s.z0, s.z1));
  }
  return { bad, shells };
}

const withRoles = (files) => files.map((f) => ({ ...f, role: identify(f.name, f.text) }));

// ---------------- synthetic board ----------------
console.log('\nsynthetic board');
const files = withRoles(sampleFiles);
check(files.map((f) => f.role).join() === 'outline,topCopper,topMask,topSilk,bottomCopper,drill,drill', `roles: ${files.map((f) => f.role).join(', ')}`);
const parsed = parseLayers(files);
check(parsed.outlineSource === 'outline', 'outline found from Edge.Cuts');

const base = { thickness: 1.6, layerHeight: 0.2, reliefHeight: 0.4, holeComp: 0.3, minDrill: 0.5 };

// 1 colour
let m = buildModel(parsed, { ...base, multiMaterial: false, assign: { board: 1, traces: 1, pads: 1, silk: 0, bottom: 1 } });
check(m.bodies.length === 1, `1 colour -> 1 body (got ${m.bodies.length})`);
check(approx(m.stats.width, 50, 0.01) && approx(m.stats.depth, 30, 0.01), `size ${m.stats.width} x ${m.stats.depth} = 50 x 30`);
check(m.stats.holes === 6 && m.stats.skipped === 1, `holes ${m.stats.holes} (6 expected), vias skipped ${m.stats.skipped} (1 expected)`);
let wt = shellsWatertight(m);
check(wt.bad === 0, `watertight: ${wt.shells} shells, ${wt.bad} bad edges`);
check(m.changes.length === 0, 'no filament changes for 1 colour');

// board shell: hole loops = 6 drills + 1 cutout
const boardShell = m.bodies[0].shells.find((s) => s.z1 === 1.6);
const holeLoops = boardShell.polys.reduce((a, p) => a + p.holes.length, 0);
check(holeLoops === 7, `board has ${holeLoops} hole loops (6 drills + 1 cutout)`);
// hole at (10,10): drill 1.0 + 0.3 comp -> 1.3 mm
const ring = boardShell.polys.flatMap((p) => p.holes).find((h) => {
  const cx = h.reduce((a, q) => a + q[0], 0) / h.length, cy = h.reduce((a, q) => a + q[1], 0) / h.length;
  return approx(cx, 10, 0.05) && approx(cy, 10, 0.05);
});
const diam = ring ? 2 * Math.max(...ring.map((q) => Math.hypot(q[0] - 10, q[1] - 10))) : 0;
check(approx(diam, 1.3, 0.002), `hole at (10,10) printed diameter ${diam.toFixed(4)} = 1.3`);
check(m.stats.bottomMode === 'engraved', 'bottom copper engraved in single colour (sparse copper)');
const minZ = Math.min(...m.bodies.flatMap((b) => b.shells.map((s) => s.z0)));
check(minZ === 0 && m.stats.thickness === 1.6, 'board spans 0 to 1.6 with bottom engraving');

// 2 colours, no AMS: traces + pads share colour 2 -> 2 bodies
m = buildModel(parsed, { ...base, multiMaterial: false, assign: { board: 1, traces: 2, pads: 2, silk: 0, bottom: 2 } });
check(m.bodies.length === 2, `traces+pads same colour -> 2 bodies (got ${m.bodies.length})`);
check(m.changes.length === 1 && m.changes[0].z === 1.6 && m.changes[0].layer === 9, `change at Z ${m.changes[0]?.z} layer ${m.changes[0]?.layer} (1.6 / 9)`);
wt = shellsWatertight(m);
check(wt.bad === 0, `watertight: ${wt.shells} shells, ${wt.bad} bad edges`);

// 3 colours, no AMS: board / traces / pads
m = buildModel(parsed, { ...base, multiMaterial: false, assign: { board: 1, traces: 2, pads: 3, silk: 0, bottom: 2 } });
check(m.bodies.length === 3, `3 colours -> 3 bodies (got ${m.bodies.length})`);
check(m.changes.map((c) => `${c.z}@${c.slot}`).join() === '1.6@2,2@3', `changes ${m.changes.map((c) => `${c.z}@${c.slot}`).join()} = 1.6@2,2@3`);
const allZ = m.bodies.flatMap((b) => b.shells.flatMap((s) => [s.z0, s.z1]));
check(allZ.every((z) => approx(z / 0.2, Math.round(z / 0.2), 1e-6)), 'all heights are multiples of 0.2 mm');
wt = shellsWatertight(m);
check(wt.bad === 0, `watertight: ${wt.shells} shells, ${wt.bad} bad edges`);

// 3 colours, AMS: side by side, bottom inlay
m = buildModel(parsed, { ...base, multiMaterial: true, assign: { board: 1, traces: 2, pads: 3, silk: 0, bottom: 2 } });
check(m.changes.length === 0, 'AMS: no manual filament changes');
const top = Math.max(...m.bodies.flatMap((b) => b.shells.map((s) => s.z1)));
check(approx(top, 2.0), `AMS: everything ends at ${top} (1.6 + 0.4)`);
check(m.stats.bottomMode === 'inlay', 'AMS: bottom copper is a colour inlay');
const inlay = m.bodies.find((b) => b.slot === 2).shells.find((s) => s.z0 === 0);
check(!!inlay && inlay.z1 === 0.4, 'AMS: inlay from 0 to 0.4 in colour 2');
wt = shellsWatertight(m);
check(wt.bad === 0, `watertight: ${wt.shells} shells, ${wt.bad} bad edges`);

// silkscreen on
m = buildModel(parsed, { ...base, multiMaterial: false, assign: { board: 1, traces: 2, pads: 2, silk: 3, bottom: 0 } });
check(m.bodies.length === 3 && m.changes.length === 2, 'silkscreen as colour 3 adds a band');

// export smoke tests
const stl = toBinarySTL(bodyMesh(m.bodies[0]));
check(stl.length === 84 + 50 * new DataView(stl.buffer).getUint32(80, true), `binary STL size consistent (${stl.length} bytes)`);
const xml = build3MFModel(m.bodies.map((b) => ({ name: b.label, color: '#c87533', mesh: bodyMesh(b) })));
check(xml.includes('<components>') && (xml.match(/<object /g) || []).length === 4, '3MF has 3 parts grouped into 1 object');

// ---------------- real boards ----------------
console.log('\nreal boards (@tracespace/fixtures)');
const root = 'node_modules/@tracespace/fixtures/boards';
for (const board of fs.readdirSync(root)) {
  const dir = path.join(root, board);
  const bf = fs.readdirSync(dir).filter((f) => !/^(LICENSE|manifest)/i.test(f)).map((name) => ({ name, text: fs.readFileSync(path.join(dir, name), 'utf8') }));
  const t0 = Date.now();
  try {
    const p = parseLayers(withRoles(bf));
    const model = buildModel(p, { ...base, multiMaterial: false, assign: { board: 1, traces: 2, pads: 3, silk: 0, bottom: 2 } });
    const w = shellsWatertight(model);
    const s = model.stats;
    check(s.holesOutside / s.holes < 0.05, `${board}: ${s.holes - s.holesOutside}/${s.holes} holes inside the board outline`);
    check(w.bad === 0 && s && s.holes > 0,
      `${board}: ${s.width.toFixed(2)} x ${s.depth.toFixed(2)} mm, ${s.holes} holes (${s.skipped} vias skipped), outline from ${s.outlineSource}, ` +
      `${w.shells} shells, ${w.bad} bad edges, ${Date.now() - t0} ms` + (model.warnings.length ? `\n         warnings: ${model.warnings.join(' | ')}` : ''));
  } catch (err) {
    failures++;
    console.log(`  FAIL ${board}: ${err.stack}`);
  }
}

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
