// Polygon helpers on top of Clipper. All Clipper paths use integer coordinates
// at SCALE units per millimetre; everything outside this module works in mm.
import ClipperLib from '../vendor/clipper.js';

export const SCALE = 1e4;
const C = ClipperLib;
const NZ = C.PolyFillType.pftNonZero;
const EO = C.PolyFillType.pftEvenOdd;
const ARC_TOL_MM = 0.005;

export const toInt = (v) => Math.round(v * SCALE);

/** [[x,y],...] in mm -> Clipper path */
export function toPath(pts) {
  return pts.map(([x, y]) => ({ X: toInt(x), Y: toInt(y) }));
}

/** Number of segments for a circle of radius r (mm) within chord tolerance. */
export function circleSegments(r, tol = ARC_TOL_MM) {
  if (r <= tol) return 8;
  const n = Math.ceil(Math.PI / Math.acos(1 - tol / r));
  return Math.max(12, Math.min(180, n));
}

export function circlePts(cx, cy, r, n = circleSegments(r)) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return pts;
}

export function circlePath(cx, cy, r) {
  return toPath(circlePts(cx, cy, r));
}

function run(clipType, subj, clip, fill = NZ, clipFill = fill) {
  const c = new C.Clipper();
  if (subj.length) c.AddPaths(subj, C.PolyType.ptSubject, true);
  if (clip && clip.length) c.AddPaths(clip, C.PolyType.ptClip, true);
  const out = [];
  c.Execute(clipType, out, fill, clipFill);
  return out;
}

export const union = (paths, fill = NZ) => run(C.ClipType.ctUnion, paths, null, fill);
export const unionEvenOdd = (paths) => run(C.ClipType.ctUnion, paths, null, EO);
export const difference = (a, b) => (a.length && b.length ? run(C.ClipType.ctDifference, a, b) : a);
export const intersection = (a, b) => (a.length && b.length ? run(C.ClipType.ctIntersection, a, b) : []);
export const unionAll = (a, b) => run(C.ClipType.ctUnion, a, b);

/** Stroke an open polyline (mm) with a round pen of the given width. */
export function strokeRound(pts, width) {
  const r = width / 2;
  if (r <= 0) return [];
  const first = pts[0];
  if (pts.every((p) => Math.abs(p[0] - first[0]) < 1e-7 && Math.abs(p[1] - first[1]) < 1e-7)) {
    return [circlePath(first[0], first[1], r)];
  }
  const co = new C.ClipperOffset(2, ARC_TOL_MM * SCALE);
  co.AddPath(toPath(pts), C.JoinType.jtRound, C.EndType.etOpenRound);
  const out = [];
  co.Execute(out, r * SCALE);
  return out;
}

/** Grow (or shrink, if negative) closed polygons by delta mm. */
export function offset(paths, delta, join = 'round') {
  const co = new C.ClipperOffset(4, ARC_TOL_MM * SCALE);
  co.AddPaths(paths, join === 'miter' ? C.JoinType.jtMiter : C.JoinType.jtRound, C.EndType.etClosedPolygon);
  const out = [];
  co.Execute(out, delta * SCALE);
  return out;
}

export function translate(paths, dx, dy) {
  const ix = toInt(dx), iy = toInt(dy);
  return paths.map((p) => p.map((q) => ({ X: q.X + ix, Y: q.Y + iy })));
}

/** Mirror X around x = axis (mm). */
export function mirrorX(paths, axis) {
  const a2 = toInt(axis) * 2;
  return paths.map((p) => p.map((q) => ({ X: a2 - q.X, Y: q.Y })).reverse());
}

export function convexHull(points) {
  const pts = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return pts;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

/** Flatten an arc into points (excluding start, including end). Angles in radians. */
export function arcPts(cx, cy, r, a0, sweep) {
  const n = Math.max(2, Math.ceil((Math.abs(sweep) / (2 * Math.PI)) * circleSegments(r, 0.01)));
  const pts = [];
  for (let i = 1; i <= n; i++) {
    const a = a0 + (sweep * i) / n;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return pts;
}

/** Is the point (mm) within the outer boundary of any polygon (cutouts ignored)? */
export function withinOuter(paths, x, y) {
  const pt = { X: toInt(x), Y: toInt(y) };
  return paths.some((p) => C.Clipper.Orientation(p) && C.Clipper.PointInPolygon(pt, p) !== 0);
}

export function areaMm2(paths) {
  let a = 0;
  for (const p of paths) a += C.Clipper.Area(p);
  return a / (SCALE * SCALE);
}

export function bounds(paths) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of paths) for (const q of p) {
    if (q.X < minX) minX = q.X;
    if (q.X > maxX) maxX = q.X;
    if (q.Y < minY) minY = q.Y;
    if (q.Y > maxY) maxY = q.Y;
  }
  if (minX === Infinity) return null;
  return { minX: minX / SCALE, minY: minY / SCALE, maxX: maxX / SCALE, maxY: maxY / SCALE };
}

/**
 * Resolve paths into polygons-with-holes in mm: [{ outer: [[x,y]...], holes: [[[x,y]...]...] }].
 * Islands inside holes come out as separate polygons.
 */
export function toPolygons(paths) {
  const c = new C.Clipper();
  c.StrictlySimple = true;
  // A tiny grow + shrink merges parts that only touch along an edge, which
  // would otherwise give non-manifold meshes.
  const eps = 0.0005;
  const closed = offset(offset(paths, eps, 'miter'), -eps, 'miter');
  const cleaned = C.Clipper.CleanPolygons(closed, 0.0002 * SCALE).filter((p) => p.length >= 3);
  c.AddPaths(cleaned, C.PolyType.ptSubject, true);
  const tree = new C.PolyTree();
  c.Execute(C.ClipType.ctUnion, tree, NZ, NZ);
  const out = [];
  const mm = (p) => p.map((q) => [q.X / SCALE, q.Y / SCALE]);
  const walk = (node) => {
    for (const outer of node.Childs()) {
      const holes = [];
      for (const hole of outer.Childs()) {
        holes.push(mm(hole.Contour()));
        walk(hole);
      }
      out.push({ outer: mm(outer.Contour()), holes });
    }
  };
  walk(tree);
  return out;
}

/**
 * Board shape from outline drawings. Every stroke is drawn with a thin pen and
 * unioned, which bridges tiny gaps and tolerates duplicated or back-and-forth
 * segments. Each closed ring found is shrunk back to its centreline and the
 * rings are combined even-odd, so inner rings become cutouts.
 * Returns { paths, open } where open counts stroke groups that never closed.
 */
export function outlineFromStrokes(polylines, pen = 0.1) {
  const inked = [];
  for (const p of polylines) if (p.length >= 2) inked.push(...strokeRound(p, pen));
  const c = new C.Clipper();
  c.AddPaths(inked, C.PolyType.ptSubject, true);
  const tree = new C.PolyTree();
  c.Execute(C.ClipType.ctUnion, tree, NZ, NZ);
  const rings = [];
  let open = 0;
  const walk = (node) => {
    for (const outer of node.Childs()) {
      if (outer.Childs().length) rings.push(...offset([outer.Contour()], -pen / 2, 'miter'));
      else open++;
      for (const hole of outer.Childs()) walk(hole);
    }
  };
  walk(tree);
  return { paths: unionEvenOdd(rings), open };
}
