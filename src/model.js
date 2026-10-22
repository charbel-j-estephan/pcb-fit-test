// Turns parsed layers + options into printable colour bodies.
import { parseGerber, renderObjects } from './gerber.js';
import { parseExcellon } from './excellon.js';
import {
  toPath, circlePath, strokeRound, outlineFromStrokes, union,
  difference, intersection, bounds, translate, toPolygons, areaMm2, withinOuter,
} from './geometry.js';

export const FEATURES = ['traces', 'pads', 'silk'];
export const FEATURE_LABELS = { board: 'Board', traces: 'Traces', pads: 'Pads', silk: 'Silkscreen', bottom: 'Bottom copper' };

export const DEFAULT_OPTIONS = {
  thickness: 1.6,
  layerHeight: 0.2,
  reliefHeight: 0.4,
  holeComp: 0.3,
  minDrill: 0.5,
  multiMaterial: false,
  // colour slot per feature: 1..3, 0 = off
  assign: { board: 1, traces: 2, pads: 2, silk: 0, bottom: 2 },
  bed: { x: 220, y: 220 },
};

/**
 * Parse every file once. Returns a cache the model can be rebuilt from cheaply
 * when only options change.
 * files: [{ name, text, role }]
 */
export function parseLayers(files) {
  const warnings = [];
  const layers = {};
  const drills = { holes: [], slots: [] };
  for (const f of files) {
    if (f.role === 'ignore') continue;
    try {
      if (f.role === 'drill') {
        const d = parseExcellon(f.text);
        // KiCad/Altium mark non-plated files by name or attribute comment
        const plated = !/npth|non[-_ ]?plated/i.test(f.name + f.text.slice(0, 1500));
        drills.holes.push(...d.holes.map((h) => ({ ...h, plated })));
        drills.slots.push(...d.slots.map((sl) => ({ ...sl, plated })));
        warnings.push(...d.warnings.map((w) => `${f.name}: ${w}`));
      } else {
        const g = parseGerber(f.text);
        warnings.push(...g.warnings.map((w) => `${f.name}: ${w}`));
        if (layers[f.role]) {
          // two files with the same role: merge them
          const prev = layers[f.role];
          layers[f.role] = {
            ...prev,
            objects: prev.objects.concat(g.objects),
            strokes: prev.strokes.concat(g.strokes),
            regions: prev.regions.concat(g.regions),
          };
        } else layers[f.role] = g;
      }
    } catch (err) {
      warnings.push(`${f.name}: could not be read (${err.message})`);
    }
  }

  // Layers are rendered on first use and cached; options never change them.
  const cache = {};
  const rendered = {
    get(key) {
      if (key in cache) return cache[key];
      let out = null;
      if (key === 'topPadsFromFlashes') {
        if (layers.topCopper) out = renderObjects(layers.topCopper.objects, (o) => o.flash);
      } else if (layers[key]) out = renderObjects(layers[key].objects);
      cache[key] = out;
      return out;
    },
    has: (key) => !!layers[key],
  };

  // Board outline
  let board = [];
  let outlineSource = 'outline';
  if (layers.outline) {
    const lines = layers.outline.strokes.concat(layers.outline.regions.map((r) => r.concat([r[0]])));
    // Bridge gaps with a thin pen first; if that leaves most of the drawing
    // unenclosed, retry with wider pens (some CAD tools leave 0.2-0.3 mm gaps).
    let xs = [], ys = [];
    for (const l of lines) for (const [x, y] of l) { xs.push(x); ys.push(y); }
    const drawnArea = xs.length ? (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys)) : 0;
    xs = ys = null;
    let best = null;
    for (const pen of [0.1, 0.3, 0.6]) {
      const r = outlineFromStrokes(lines, pen);
      const a = areaMm2(r.paths);
      if (!best || a > best.area * 1.01) best = { ...r, area: a, pen };
      if (a >= 0.5 * drawnArea) break;
    }
    board = best.paths;
    const open = best.open;
    if (best.pen > 0.1 && board.length) warnings.push(`Board outline has gaps up to ${best.pen} mm; they were bridged.`);
    if (open && board.length) warnings.push(`Board outline has ${open} unclosed line(s); they were ignored.`);
  }
  if (!board.length) {
    const ref = rendered.get('topCopper') || rendered.get('bottomCopper');
    const b = ref && bounds(ref);
    if (b) {
      const m = 2;
      board = [toPath([[b.minX - m, b.minY - m], [b.maxX + m, b.minY - m], [b.maxX + m, b.maxY + m], [b.minX - m, b.maxY + m]])];
      outlineSource = 'copper';
      warnings.push(layers.outline
        ? 'Could not find a closed board outline; using the copper area plus 2 mm instead.'
        : 'No board outline file; using the copper area plus 2 mm instead.');
    } else {
      outlineSource = 'none';
    }
  }

  return { layers, rendered, drills, board, outlineSource, warnings };
}

const snap = (v, lh) => Math.max(lh, Math.round(v / lh) * lh);
const round3 = (v) => Math.round(v * 1000) / 1000;

/**
 * Build colour bodies.
 * @returns {{
 *   bodies: { slot:number, label:string, shells:{ polys:any[], z0:number, z1:number }[] }[],
 *   changes: { z:number, layer:number, slot:number }[],
 *   stats: object, warnings: string[]
 * }}
 */
export function buildModel(parsed, opts) {
  const o = { ...DEFAULT_OPTIONS, ...opts, assign: { ...DEFAULT_OPTIONS.assign, ...(opts && opts.assign) } };
  const warnings = [...parsed.warnings];
  const lh = o.layerHeight;
  const T = snap(o.thickness, lh);
  const h = snap(o.reliefHeight, lh);
  const A = o.assign;
  const boardSlot = A.board || 1;

  if (!parsed.board.length) {
    return { bodies: [], changes: [], stats: null, warnings: warnings.concat('Nothing to build: no outline or copper found.') };
  }

  // ---- holes
  let holePaths = [];
  let holeCount = 0, skipped = 0, smallest = Infinity, outside = 0;
  // drill chart rows keyed by size, kind and plating
  const chart = new Map();
  const tally = (d, kind, plated, kept) => {
    const key = `${d.toFixed(3)}|${kind}|${plated}`;
    if (!chart.has(key)) chart.set(key, { d: round3(d), printed: kept ? round3(d + o.holeComp) : null, kind, plated, count: 0 });
    chart.get(key).count++;
  };
  for (const hole of parsed.drills.holes) {
    tally(hole.d, 'hole', hole.plated !== false, hole.d >= o.minDrill);
    if (hole.d < o.minDrill) { skipped++; continue; }
    holeCount++;
    if (!withinOuter(parsed.board, hole.x, hole.y)) outside++;
    smallest = Math.min(smallest, hole.d);
    holePaths.push(circlePath(hole.x, hole.y, (hole.d + o.holeComp) / 2));
  }
  for (const s of parsed.drills.slots) {
    if (s.d) tally(s.d, 'slot', s.plated !== false, s.d >= o.minDrill);
    if (!s.d || s.d < o.minDrill) { skipped++; continue; }
    holeCount++;
    holePaths.push(...strokeRound(s.points, s.d + o.holeComp));
  }
  holePaths = union(holePaths);

  const board = difference(parsed.board, holePaths);
  const clip = (paths) => difference(intersection(paths || [], parsed.board), holePaths);

  // ---- top features
  const R = parsed.rendered;
  const need = (f) => A[f] > 0;
  const copper = need('traces') || need('pads') || need('silk') ? clip(R.get('topCopper')) : [];
  let pads = [];
  if (need('traces') || need('pads')) {
    if (R.has('topMask')) pads = intersection(copper, R.get('topMask'));
    else pads = clip(R.get('topPadsFromFlashes'));
  }
  const traces = need('traces') ? difference(copper, pads) : [];
  const silk = need('silk') ? difference(clip(R.get('topSilk')), copper) : [];
  const feat = { traces, pads, silk };

  const enabled = FEATURES.filter((f) => A[f] && feat[f].length);
  const shellsBySlot = new Map();
  // `what` names the features printed in this shell, for the layer plan
  const add = (slot, paths, z0, z1, what) => {
    if (!paths.length || z1 <= z0) return;
    if (!shellsBySlot.has(slot)) shellsBySlot.set(slot, []);
    shellsBySlot.get(slot).push({ paths, z0: round3(z0), z1: round3(z1), what });
  };

  // ---- bottom copper (inlay or engraving into the bottom face)
  const bottom = A.bottom ? clip(R.get('bottomCopper')) : [];
  let boardBottom = 0;
  let bottomMode = null;
  if (bottom.length) {
    const inlay = o.multiMaterial && A.bottom !== boardSlot;
    const depth = inlay ? Math.min(h, snap(T / 2, lh)) : lh;
    if (inlay) {
      bottomMode = 'inlay';
      add(boardSlot, difference(board, bottom), 0, depth, 'board');
      add(A.bottom, bottom, 0, depth, 'bottom copper');
    } else {
      // Engrave the copper, unless it covers most of the board (ground pours):
      // then the first layer would barely touch the bed, so engrave the gaps instead.
      const coverage = areaMm2(bottom) / Math.max(1e-9, areaMm2(board));
      bottomMode = coverage > 0.45 ? 'engraved-inverse' : 'engraved';
      add(boardSlot, bottomMode === 'engraved' ? difference(board, bottom) : bottom, 0, depth, 'board, bottom copper engraved');
    }
    boardBottom = depth;
  }
  add(boardSlot, board, boardBottom, T, 'board');

  // ---- top relief
  const changes = [];
  if (o.multiMaterial) {
    for (const f of enabled) add(A[f], feat[f], T, T + h, FEATURE_LABELS[f].toLowerCase());
  } else {
    // One colour per Z band. Band order follows feature order; a feature
    // stands on columns of the lower bands' colours.
    const bandSlots = [];
    for (const f of enabled) if (!bandSlots.includes(A[f])) bandSlots.push(A[f]);
    const bandOf = (f) => bandSlots.indexOf(A[f]);
    bandSlots.forEach((slot, b) => {
      const fp = enabled.filter((f) => bandOf(f) >= b).map((f) => feat[f]);
      const own = enabled.filter((f) => bandOf(f) === b).map((f) => FEATURE_LABELS[f].toLowerCase());
      const under = enabled.filter((f) => bandOf(f) > b).map((f) => FEATURE_LABELS[f].toLowerCase());
      const what = own.join(' + ') + (under.length ? `, base of ${under.join(' + ')}` : '');
      add(slot, union([].concat(...fp)), T + b * h, T + (b + 1) * h, what);
    });
    let prev = boardSlot;
    bandSlots.forEach((slot, b) => {
      if (slot !== prev) {
        const z = T + b * h;
        changes.push({ z: round3(z), layer: Math.round(z / lh) + 1, slot });
      }
      prev = slot;
    });
  }

  // ---- move to origin and convert to polygons
  const bb = bounds(parsed.board);
  const bodies = [...shellsBySlot.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([slot, shells]) => ({
      slot,
      label: labelFor(slot, A, o.multiMaterial, bottom.length > 0),
      shells: shells.map((s) => ({ polys: toPolygons(translate(s.paths, -bb.minX, -bb.minY)), z0: s.z0, z1: s.z1, what: s.what })),
    }));

  const width = bb.maxX - bb.minX, depth = bb.maxY - bb.minY;
  const height = Math.max(...bodies.flatMap((b) => b.shells.map((s) => s.z1)));
  if (width > o.bed.x || depth > o.bed.y) {
    const fitsRotated = depth <= o.bed.x && width <= o.bed.y;
    warnings.push(fitsRotated
      ? `Board is ${width.toFixed(1)} × ${depth.toFixed(1)} mm — rotate it 90° in the slicer to fit the ${o.bed.x} × ${o.bed.y} mm bed.`
      : `Board is ${width.toFixed(1)} × ${depth.toFixed(1)} mm and does not fit the ${o.bed.x} × ${o.bed.y} mm bed.`);
  }
  if (holeCount >= 3 && outside / holeCount > 0.2) {
    warnings.push(`${outside} of ${holeCount} holes fall outside the board. The drill file probably uses a different origin or unit than the Gerbers; check the drill export settings (e.g. "use auxiliary axis as origin" in KiCad).`);
  }
  if (bottomMode === 'engraved-inverse') {
    warnings.push('Bottom copper covers most of the board, so the gaps between copper are engraved instead of the copper, to keep the first layer on the bed.');
  }
  if (holeCount && smallest + o.holeComp < 0.8) {
    warnings.push(`Smallest hole prints at ${(smallest + o.holeComp).toFixed(2)} mm; holes under ~0.8 mm may close up on FDM printers.`);
  }
  for (const f of FEATURES) {
    if (A[f] && !feat[f].length) {
      const why = f === 'silk' ? 'no top silkscreen' : 'no top copper';
      warnings.push(`${FEATURE_LABELS[f]} enabled but there is ${why} to show.`);
    }
  }
  if (A.bottom && !R.has('bottomCopper')) warnings.push('Bottom copper enabled but there is no bottom copper layer.');

  return {
    bodies,
    changes,
    stats: {
      width, depth, height, thickness: T, relief: h, holes: holeCount, skipped,
      boardArea: areaMm2(board), bottomMode, holesOutside: outside, holeComp: o.holeComp,
      drillChart: [...chart.values()].sort((a, b) => a.d - b.d || a.kind.localeCompare(b.kind)),
      outlineSource: parsed.outlineSource,
    },
    warnings,
  };
}

function labelFor(slot, A, multi, hasBottom) {
  const names = [];
  if ((A.board || 1) === slot) names.push('board');
  for (const f of FEATURES) if (A[f] === slot) names.push(FEATURE_LABELS[f].toLowerCase());
  if (hasBottom && multi && A.bottom === slot && A.bottom !== A.board) names.push('bottom copper');
  return names.join(' + ') || `colour ${slot}`;
}
