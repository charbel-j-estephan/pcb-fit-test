// Dev helper: node test/debug.js <fixture-board-name>
import fs from 'node:fs';
import path from 'node:path';
import { identify } from '../src/layers.js';
import { parseGerber, renderObjects } from '../src/gerber.js';
import { parseLayers } from '../src/model.js';
import { bounds, areaMm2 } from '../src/geometry.js';

const board = process.argv[2];
const dir = path.join('node_modules/@tracespace/fixtures/boards', board);
const files = fs.readdirSync(dir).filter((f) => !/^(LICENSE|manifest)/i.test(f))
  .map((name) => ({ name, text: fs.readFileSync(path.join(dir, name), 'utf8') }));
for (const f of files) {
  f.role = identify(f.name, f.text);
  if (f.role === 'drill' || f.role === 'ignore') { console.log(f.name, f.role); continue; }
  const t0 = Date.now();
  const g = parseGerber(f.text);
  const t1 = Date.now();
  const r = renderObjects(g.objects);
  console.log(f.name, f.role, g.units, 'objects', g.objects.length, 'strokes', g.strokes.length,
    'area', areaMm2(r).toFixed(1), JSON.stringify(bounds(r)), `parse ${t1 - t0}ms render ${Date.now() - t1}ms`, g.warnings);
}
const p = parseLayers(files);
console.log('board area', areaMm2(p.board), bounds(p.board), p.board.length);

// watertightness detail
import { buildModel } from '../src/model.js';
import { extrude } from '../src/mesh.js';
const m = buildModel(p, { assign: { board: 1, traces: 2, pads: 3, silk: 0, bottom: 2 } });
for (const b of m.bodies) for (const s of b.shells) {
  const mesh = extrude(s.polys, s.z0, s.z1);
  const P = mesh.positions, I = mesh.indices;
  const key = (i) => `${P[i * 3].toFixed(6)},${P[i * 3 + 1].toFixed(6)},${P[i * 3 + 2].toFixed(6)}`;
  const counts = new Map();
  for (let t = 0; t < I.length; t += 3) for (let e = 0; e < 3; e++) {
    const k = `${key(I[t + e])}|${key(I[t + ((e + 1) % 3)])}`;
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  const bad = [...counts].filter(([k, c]) => { const [a, bb] = k.split('|'); return c !== 1 || counts.get(`${bb}|${a}`) !== 1; });
  console.log(`slot ${b.slot} z ${s.z0}-${s.z1}: polys ${s.polys.length}, bad ${bad.length}`, bad.slice(0, 4).map(([k, c]) => `${k} x${c}`));
}

