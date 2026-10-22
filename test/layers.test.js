// Checks layer identification against the tracespace fixture manifests.
import fs from 'node:fs';
import path from 'node:path';
import { identify } from '../src/layers.js';

const root = 'node_modules/@tracespace/fixtures/boards';
const map = { copper: 'Copper', soldermask: 'Mask', silkscreen: 'Silk' };
const expectRole = (l) => {
  if (l.type === 'drill') return 'drill';
  if (l.type === 'outline') return 'outline';
  if (map[l.type]) return (l.side === 'top' ? 'top' : 'bottom') + map[l.type];
  return 'ignore';
};
let bad = 0, total = 0;
for (const board of fs.readdirSync(root)) {
  const man = JSON.parse(fs.readFileSync(path.join(root, board, 'manifest.json'), 'utf8'));
  for (const l of man.layers) {
    const text = fs.readFileSync(path.join(root, board, l.name), 'utf8');
    const got = identify(l.name, text);
    const want = expectRole(l);
    total++;
    if (got !== want) { bad++; console.log(`  MISMATCH ${board}/${l.name}: got ${got}, want ${want}`); }
  }
}
console.log(`layers: ${total - bad}/${total} identified correctly`);
export default bad;
