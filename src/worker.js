// Runs parsing, geometry and meshing off the main thread.
import { parseLayers, buildModel } from './model.js';
import { bodyMesh } from './mesh.js';

let parsed = null;

self.onmessage = (e) => {
  const msg = e.data;
  try {
    if (msg.type === 'load') {
      parsed = parseLayers(msg.files);
      self.postMessage({ type: 'loaded', id: msg.id });
    } else if (msg.type === 'build') {
      if (!parsed) return;
      const model = buildModel(parsed, msg.opts);
      const transfer = [];
      const bodies = model.bodies.map((b) => {
        const mesh = bodyMesh(b);
        const positions = new Float32Array(mesh.positions);
        const indices = new Uint32Array(mesh.indices);
        transfer.push(positions.buffer, indices.buffer);
        return { slot: b.slot, label: b.label, positions, indices, shells: b.shells.map((s) => ({ z0: s.z0, z1: s.z1, what: s.what })) };
      });
      self.postMessage({ type: 'built', id: msg.id, bodies, changes: model.changes, stats: model.stats, warnings: model.warnings }, transfer);
    }
  } catch (err) {
    self.postMessage({ type: 'error', id: msg.id, message: err.message || String(err) });
  }
};
