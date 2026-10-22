// RS-274X (Gerber) parser. Produces filled geometry as an ordered list of
// dark/clear objects, plus the raw stroke centrelines (used for board outlines).
import {
  SCALE, toPath, circlePts, strokeRound, convexHull, arcPts, translate,
  union, unionAll, difference,
} from './geometry.js';

const DEG = Math.PI / 180;

// ---------- aperture macro expressions (no eval) ----------

function evalExpr(src, vars) {
  const s = src.replace(/\s+/g, '');
  let i = 0;
  const peek = () => s[i];
  function primary() {
    const ch = peek();
    if (ch === '(') {
      i++;
      const v = expr();
      if (peek() === ')') i++;
      return v;
    }
    if (ch === '-') { i++; return -primary(); }
    if (ch === '+') { i++; return primary(); }
    if (ch === '$') {
      i++;
      const m = /^\d+/.exec(s.slice(i));
      if (!m) return 0;
      i += m[0].length;
      return vars[+m[0]] ?? 0;
    }
    const m = /^(\d+\.?\d*|\.\d+)/.exec(s.slice(i));
    if (!m) { i = s.length; return 0; }
    i += m[0].length;
    return parseFloat(m[0]);
  }
  function term() {
    let v = primary();
    while (peek() === 'x' || peek() === 'X' || peek() === '/') {
      const op = s[i++];
      const r = primary();
      v = op === '/' ? v / r : v * r;
    }
    return v;
  }
  function expr() {
    let v = term();
    while (peek() === '+' || peek() === '-') {
      const op = s[i++];
      const r = term();
      v = op === '+' ? v + r : v - r;
    }
    return v;
  }
  if (!s.length) return 0;
  return expr();
}

const rot = (pts, deg) => {
  if (!deg) return pts;
  const c = Math.cos(deg * DEG), s = Math.sin(deg * DEG);
  return pts.map(([x, y]) => [x * c - y * s, x * s + y * c]);
};
const rectPts = (cx, cy, w, h) => [
  [cx - w / 2, cy - h / 2], [cx + w / 2, cy - h / 2], [cx + w / 2, cy + h / 2], [cx - w / 2, cy + h / 2],
];
function obroundPts(w, h) {
  if (Math.abs(w - h) < 1e-9) return circlePts(0, 0, w / 2);
  const r = Math.min(w, h) / 2;
  const pts = [];
  const n = 24;
  if (w > h) {
    const d = w / 2 - r;
    for (let i = 0; i <= n; i++) { const a = -Math.PI / 2 + (Math.PI * i) / n; pts.push([d + r * Math.cos(a), r * Math.sin(a)]); }
    for (let i = 0; i <= n; i++) { const a = Math.PI / 2 + (Math.PI * i) / n; pts.push([-d + r * Math.cos(a), r * Math.sin(a)]); }
  } else {
    const d = h / 2 - r;
    for (let i = 0; i <= n; i++) { const a = (Math.PI * i) / n; pts.push([r * Math.cos(a), d + r * Math.sin(a)]); }
    for (let i = 0; i <= n; i++) { const a = Math.PI + (Math.PI * i) / n; pts.push([r * Math.cos(a), -d + r * Math.sin(a)]); }
  }
  return pts;
}
function regularPolyPts(diam, n, deg) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (deg || 0) * DEG + (i / n) * 2 * Math.PI;
    pts.push([(diam / 2) * Math.cos(a), (diam / 2) * Math.sin(a)]);
  }
  return pts;
}

/** Evaluate a macro into int paths centred on the origin. k = file units -> mm. */
function buildMacro(macro, params, k) {
  const vars = {};
  params.forEach((v, idx) => { vars[idx + 1] = v; });
  let acc = [];
  const scale = (pts) => pts.map(([x, y]) => [x * k, y * k]);
  for (const st of macro) {
    if (st.startsWith('0')) continue; // comment
    const asg = /^\$(\d+)=(.*)$/.exec(st);
    if (asg) { vars[+asg[1]] = evalExpr(asg[2], vars); continue; }
    const parts = st.split(',');
    const code = parseInt(parts[0], 10);
    const a = parts.slice(1).map((p) => evalExpr(p, vars));
    let polys = [];
    let on = true;
    switch (code) {
      case 1: { // circle: exposure, diameter, cx, cy[, rot]
        on = a[0] !== 0;
        const c = rot([[a[2], a[3]]], a[4] || 0)[0];
        polys = [circlePts(c[0], c[1], a[1] / 2)];
        break;
      }
      case 2: case 20: { // vector line: exposure, width, x1, y1, x2, y2, rot
        on = a[0] !== 0;
        const [w, x1, y1, x2, y2, r] = a.slice(1);
        const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
        const nx = (-dy / len) * (w / 2), ny = (dx / len) * (w / 2);
        polys = [rot([[x1 + nx, y1 + ny], [x1 - nx, y1 - ny], [x2 - nx, y2 - ny], [x2 + nx, y2 + ny]], r || 0)];
        break;
      }
      case 21: { // centre line: exposure, w, h, cx, cy, rot
        on = a[0] !== 0;
        polys = [rot(rectPts(a[3], a[4], a[1], a[2]), a[5] || 0)];
        break;
      }
      case 22: { // lower-left line: exposure, w, h, x, y, rot
        on = a[0] !== 0;
        polys = [rot(rectPts(a[3] + a[1] / 2, a[4] + a[2] / 2, a[1], a[2]), a[5] || 0)];
        break;
      }
      case 4: { // outline: exposure, n, x0, y0, ... xn, yn, rot
        on = a[0] !== 0;
        const n = Math.round(a[1]);
        const pts = [];
        for (let i = 0; i <= n; i++) pts.push([a[2 + i * 2], a[3 + i * 2]]);
        polys = [rot(pts, a[4 + n * 2] || 0)];
        break;
      }
      case 5: { // polygon: exposure, n, cx, cy, diameter, rot
        on = a[0] !== 0;
        const pts = regularPolyPts(a[4], Math.round(a[1]), 0).map(([x, y]) => [x + a[2], y + a[3]]);
        polys = [rot(pts, a[5] || 0)];
        break;
      }
      case 7: { // thermal: cx, cy, outer d, inner d, gap, rot
        const [cx, cy, od, id, gap, r] = a;
        let ring = difference([toPath(scale(circlePts(cx, cy, od / 2)))], [toPath(scale(circlePts(cx, cy, id / 2)))]);
        const cross = [
          toPath(scale(rectPts(cx, cy, od * 2, gap))),
          toPath(scale(rectPts(cx, cy, gap, od * 2))),
        ];
        ring = difference(ring, cross);
        if (r) {
          // rotate int paths about the macro origin
          const c = Math.cos(r * DEG), s = Math.sin(r * DEG);
          ring = ring.map((p) => p.map((q) => ({ X: Math.round(q.X * c - q.Y * s), Y: Math.round(q.X * s + q.Y * c) })));
        }
        acc = unionAll(acc, ring);
        continue;
      }
      case 6: { // moire: approximate with its outer ring
        const [cx, cy, od, , , , , ] = a;
        polys = [circlePts(cx, cy, od / 2)];
        break;
      }
      default:
        continue;
    }
    const paths = polys.map((p) => toPath(scale(p)));
    acc = on ? unionAll(acc, paths) : difference(acc, paths);
  }
  return acc;
}

// ---------- tokenizer ----------

function tokenize(text) {
  const out = []; // { ext: bool, body: string }
  const s = text.replace(/[\r\n]+/g, '');
  let i = 0;
  while (i < s.length) {
    if (s[i] === '%') {
      const j = s.indexOf('%', i + 1);
      const block = s.slice(i + 1, j < 0 ? s.length : j);
      i = j < 0 ? s.length : j + 1;
      // An AM block keeps all its statements together.
      if (block.startsWith('AM')) out.push({ ext: true, body: block });
      else for (const st of block.split('*')) if (st.trim()) out.push({ ext: true, body: st.trim() });
    } else {
      const j = s.indexOf('*', i);
      const st = s.slice(i, j < 0 ? s.length : j).trim();
      i = j < 0 ? s.length : j + 1;
      if (st) out.push({ ext: false, body: st });
    }
  }
  return out;
}

// ---------- parser ----------

/**
 * @returns {{
 *   units: 'mm'|'in',
 *   objects: {dark:boolean, flash:boolean, paths:any[]}[],
 *   strokes: number[][][],   // centrelines of drawn segments (mm)
 *   regions: number[][][],   // region contours (mm)
 *   fileFunction: string|null,
 *   warnings: string[],
 * }}
 */
export function parseGerber(text) {
  const tokens = tokenize(text);
  const warnings = [];
  let units = null;
  let fmt = { zeros: 'L', xi: 2, xd: 4, yi: 2, yd: 4 };
  const apertures = {};
  const macros = {};
  const shapeCache = {};
  let current = null;
  let x = 0, y = 0;
  let interp = 1; // 1 linear, 2 cw, 3 ccw
  let quadrant = 'multi';
  let dark = true;
  let regionMode = false;
  let region = []; // contours of current region
  let contour = null;
  let lastD = 2;
  let fileFunction = null;
  let sr = null; // step-repeat {nx, ny, dx, dy, start}
  const objects = [];
  const strokes = [];
  const regions = [];

  const k = () => (units === 'mm' ? 1 : 25.4);

  function parseCoord(str, intDigits, decDigits) {
    if (str.includes('.')) return parseFloat(str) * k();
    let neg = false;
    let s = str;
    if (s[0] === '+' || s[0] === '-') { neg = s[0] === '-'; s = s.slice(1); }
    let v;
    if (fmt.zeros === 'T') {
      s = s.padEnd(intDigits + decDigits, '0');
      v = parseInt(s, 10) / 10 ** decDigits;
    } else {
      v = parseInt(s, 10) / 10 ** decDigits;
    }
    return (neg ? -v : v) * k();
  }

  function apertureShape(code) {
    if (shapeCache[code]) return shapeCache[code];
    const ap = apertures[code];
    if (!ap) return null;
    let paths, convex = null, circle = null;
    const p = ap.params.map((v) => v * k());
    switch (ap.type) {
      case 'C': circle = p[0]; convex = circlePts(0, 0, p[0] / 2); break;
      case 'R': convex = rectPts(0, 0, p[0], p[1]); break;
      case 'O': convex = obroundPts(p[0], p[1]); break;
      case 'P': convex = regularPolyPts(p[0], Math.round(ap.params[1]), ap.params[2] || 0); break;
      default: {
        const m = macros[ap.type];
        if (!m) { warnings.push(`Unknown aperture macro ${ap.type}`); paths = []; break; }
        paths = buildMacro(m, ap.params, k());
      }
    }
    if (convex) paths = [toPath(convex)];
    const shape = { paths, convex, circle };
    shapeCache[code] = shape;
    return shape;
  }

  // Consecutive round-pen draws that connect are kept as one polyline and
  // offset once, which is far cheaper than unioning every segment.
  let pending = null;
  function flushPending() {
    if (!pending) return;
    const paths = strokeRound(pending.pts, pending.width);
    if (paths.length) objects.push({ dark: pending.dark, flash: false, paths });
    pending = null;
  }
  function addObject(o) { flushPending(); objects.push(o); }

  function flash(px, py) {
    const sh = apertureShape(current);
    if (!sh || !sh.paths.length) return;
    addObject({ dark, flash: true, paths: translate(sh.paths, px, py) });
  }

  function draw(pts) {
    strokes.push(pts);
    const sh = apertureShape(current);
    if (!sh) return;
    if (sh.circle != null) {
      if (!(sh.circle > 0)) return;
      const last = pending && pending.pts[pending.pts.length - 1];
      if (pending && pending.ap === current && pending.dark === dark && last[0] === pts[0][0] && last[1] === pts[0][1]) {
        for (let i = 1; i < pts.length; i++) pending.pts.push(pts[i]);
      } else {
        flushPending();
        pending = { ap: current, dark, width: sh.circle, pts: pts.slice() };
      }
      return;
    }
    if (sh.convex) {
      const paths = [];
      for (let i = 1; i < pts.length; i++) {
        const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
        const hull = convexHull(sh.convex.map(([u, v]) => [u + ax, v + ay]).concat(sh.convex.map(([u, v]) => [u + bx, v + by])));
        paths.push(toPath(hull));
      }
      addObject({ dark, flash: false, paths: union(paths) });
    }
  }

  function arcPoints(x0, y0, x1, y1, i, j, cw) {
    let cx, cy;
    if (quadrant === 'single') {
      // pick the centre sign combination that gives a <= 90 degree arc with consistent radius
      let best = null;
      for (const [si, sj] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const ccx = x0 + si * Math.abs(i), ccy = y0 + sj * Math.abs(j);
        const r0 = Math.hypot(x0 - ccx, y0 - ccy), r1 = Math.hypot(x1 - ccx, y1 - ccy);
        let sw = sweepOf(ccx, ccy, x0, y0, x1, y1, cw, false);
        if (Math.abs(sw) > Math.PI / 2 + 1e-3) continue;
        const err = Math.abs(r0 - r1);
        if (!best || err < best.err) best = { ccx, ccy, err };
      }
      if (!best) best = { ccx: x0 + i, ccy: y0 + j };
      cx = best.ccx; cy = best.ccy;
    } else {
      cx = x0 + i; cy = y0 + j;
    }
    const r = Math.hypot(x0 - cx, y0 - cy);
    const a0 = Math.atan2(y0 - cy, x0 - cx);
    const sweep = sweepOf(cx, cy, x0, y0, x1, y1, cw, quadrant === 'multi');
    const pts = arcPts(cx, cy, r, a0, sweep);
    pts[pts.length - 1] = [x1, y1];
    return pts;
  }

  function sweepOf(cx, cy, x0, y0, x1, y1, cw, allowFull) {
    const a0 = Math.atan2(y0 - cy, x0 - cx);
    const a1 = Math.atan2(y1 - cy, x1 - cx);
    let sw = a1 - a0;
    const same = Math.abs(x0 - x1) < 1e-9 && Math.abs(y0 - y1) < 1e-9;
    if (cw) { while (sw >= 0) sw -= 2 * Math.PI; if (same && !allowFull) sw = 0; }
    else { while (sw <= 0) sw += 2 * Math.PI; if (same && !allowFull) sw = 0; }
    if (!same && Math.abs(sw) > 2 * Math.PI - 1e-9) sw = 0;
    return sw;
  }

  function closeContour() {
    if (contour && contour.length >= 3) region.push(contour);
    contour = null;
  }

  function endStepRepeat() {
    flushPending();
    if (!sr) return;
    const base = objects.splice(sr.start);
    for (let ix = 0; ix < sr.nx; ix++) for (let iy = 0; iy < sr.ny; iy++) {
      const dx = ix * sr.dx, dy = iy * sr.dy;
      for (const o of base) objects.push(ix || iy ? { ...o, paths: translate(o.paths, dx, dy) } : o);
    }
    sr = null;
  }

  for (const tok of tokens) {
    const b = tok.body;
    if (tok.ext) {
      if (b.startsWith('FS')) {
        const m = /X(\d)(\d)Y(\d)(\d)/.exec(b);
        if (m) fmt = { zeros: b[2] === 'T' ? 'T' : 'L', xi: +m[1], xd: +m[2], yi: +m[3], yd: +m[4] };
      } else if (b.startsWith('MO')) {
        units = b.includes('MM') ? 'mm' : 'in';
      } else if (b.startsWith('AD')) {
        const m = /^ADD(\d+)([A-Za-z_.$][\w.$\-]*)(?:,(.*))?$/.exec(b);
        if (m) {
          const params = m[3] ? m[3].split('X').map((v) => parseFloat(v)) : [];
          apertures[+m[1]] = { type: m[2], params };
          delete shapeCache[+m[1]];
        }
      } else if (b.startsWith('AM')) {
        const stmts = b.split('*').map((s) => s.trim()).filter(Boolean);
        const name = stmts[0].slice(2);
        macros[name] = stmts.slice(1);
      } else if (b.startsWith('LP')) {
        dark = b[2] !== 'C';
      } else if (b.startsWith('SR')) {
        endStepRepeat(); // also flushes any pending stroke
        const m = /X(\d+)Y(\d+)I([\d.+-]+)J([\d.+-]+)/.exec(b);
        if (m && (+m[1] > 1 || +m[2] > 1)) {
          sr = { nx: +m[1], ny: +m[2], dx: parseFloat(m[3]) * k(), dy: parseFloat(m[4]) * k(), start: objects.length };
        }
      } else if (b.startsWith('TF.FileFunction')) {
        fileFunction = b.slice('TF.FileFunction,'.length);
      }
      continue;
    }

    if (/^G0?4/.test(b) && !/^G0?4\d/.test(b)) continue; // comment
    if (b === 'M02' || b === 'M00' || b === 'M2') break;

    // A legacy single-statement extended command such as "G70" / "G71"
    const words = {};
    const gcodes = [];
    const re = /([GXYIJDM])([+-]?[\d.]+)/g;
    let m;
    while ((m = re.exec(b))) {
      if (m[1] === 'G') gcodes.push(+m[2]);
      else words[m[1]] = m[2];
    }
    for (const g of gcodes) {
      if (g === 1) interp = 1;
      else if (g === 2) interp = 2;
      else if (g === 3) interp = 3;
      else if (g === 74) quadrant = 'single';
      else if (g === 75) quadrant = 'multi';
      else if (g === 70) units = units || 'in';
      else if (g === 71) units = units || 'mm';
      else if (g === 36) { regionMode = true; region = []; contour = null; }
      else if (g === 37) {
        closeContour();
        if (region.length) {
          addObject({ dark, flash: false, paths: union(region.map(toPath)) });
          regions.push(...region);
        }
        regionMode = false; region = [];
      }
    }
    if (!units && (words.X || words.Y)) { units = 'in'; warnings.push('No unit command found; assuming inches.'); }

    let d = words.D != null ? parseInt(words.D, 10) : null;
    if (d != null && d >= 10) { current = d; continue; }
    const hasCoord = words.X != null || words.Y != null || words.I != null || words.J != null;
    if (d == null) { if (!hasCoord) continue; d = lastD; }
    lastD = d;

    const nx = words.X != null ? parseCoord(words.X, fmt.xi, fmt.xd) : x;
    const ny = words.Y != null ? parseCoord(words.Y, fmt.yi, fmt.yd) : y;
    const ii = words.I != null ? parseCoord(words.I, fmt.xi, fmt.xd) : 0;
    const jj = words.J != null ? parseCoord(words.J, fmt.yi, fmt.yd) : 0;

    if (d === 1) {
      const pts = interp === 1 ? [[nx, ny]] : arcPoints(x, y, nx, ny, ii, jj, interp === 2);
      if (regionMode) {
        if (!contour) contour = [[x, y]];
        contour.push(...pts);
      } else {
        draw([[x, y], ...pts]);
      }
    } else if (d === 2) {
      if (regionMode) closeContour();
    } else if (d === 3) {
      if (!regionMode) flash(nx, ny);
    }
    x = nx; y = ny;
  }
  endStepRepeat();
  return { units: units || 'in', objects, strokes, regions, fileFunction, warnings };
}

/**
 * Combine objects into final geometry, honouring polarity in file order.
 * `include` filters dark objects (clear objects always apply).
 */
export function renderObjects(objects, include = () => true) {
  let acc = [];
  let batch = [];
  let batchDark = true;
  const flush = () => {
    if (!batch.length) return;
    acc = batchDark ? unionAll(acc, batch) : difference(acc, union(batch));
    batch = [];
  };
  for (const o of objects) {
    if (o.dark && !include(o)) continue;
    if (o.dark !== batchDark) { flush(); batchDark = o.dark; }
    for (const p of o.paths) batch.push(p);
  }
  flush();
  return acc;
}

export { SCALE };
