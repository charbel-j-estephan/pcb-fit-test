// Excellon drill parser. Returns holes and routed slots in mm.

/**
 * @returns {{ holes: {x:number,y:number,d:number}[], slots: {points:number[][], d:number}[], warnings: string[] }}
 */
export function parseExcellon(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const warnings = [];
  let units = null;
  let zeros = null; // 'LZ' = leading zeros kept (trailing suppressed), 'TZ' = trailing kept
  let intDigits = null, decDigits = null;
  const tools = {};
  let tool = null;
  let x = 0, y = 0;
  let routing = false; // between M15 and M16
  let route = null;
  let rapid = false; // G00 route mode
  const holes = [];
  const slots = [];

  const k = () => (units === 'mm' ? 1 : 25.4);
  const fmt = () => {
    if (intDigits != null) return [intDigits, decDigits];
    return units === 'mm' ? [3, 3] : [2, 4];
  };

  function coord(s) {
    if (s.includes('.')) return parseFloat(s) * k();
    let neg = false;
    if (s[0] === '+' || s[0] === '-') { neg = s[0] === '-'; s = s.slice(1); }
    const [id, dd] = fmt();
    let v;
    if (zeros === 'LZ') {
      // leading zeros present, trailing suppressed: digits are counted from the left
      v = parseInt(s.padEnd(id + dd, '0'), 10) / 10 ** dd;
    } else {
      v = parseInt(s, 10) / 10 ** dd;
    }
    return (neg ? -v : v) * k();
  }

  function readXY(line) {
    const mx = /X([+-]?[\d.]+)/.exec(line);
    const my = /Y([+-]?[\d.]+)/.exec(line);
    return [mx ? coord(mx[1]) : x, my ? coord(my[1]) : y];
  }

  const diameter = () => (tool != null && tools[tool] != null ? tools[tool] : null);

  function finishRoute() {
    if (route && route.points.length >= 2) slots.push(route);
    route = null;
  }

  for (const raw of lines) {
    const line = raw.toUpperCase();
    if (line.startsWith(';')) {
      const ff = /FILE_FORMAT\s*=\s*(\d+):(\d+)/.exec(line);
      if (ff) { intDigits = +ff[1]; decDigits = +ff[2]; }
      continue;
    }
    if (/^(METRIC|INCH)/.test(line)) {
      units = line.startsWith('METRIC') ? 'mm' : 'in';
      if (line.includes('LZ')) zeros = 'LZ';
      else if (line.includes('TZ')) zeros = 'TZ';
      const f = /,(0+)\.(0+)/.exec(line);
      if (f) { intDigits = f[1].length; decDigits = f[2].length; }
      continue;
    }
    if (line === 'G05') { rapid = false; continue; }
    if (line === 'M71') { units = 'mm'; continue; }
    if (line === 'M72') { units = 'in'; continue; }
    if (line.startsWith('FMAT') || line === 'M48' || line === '%' || line === 'M95' || line === 'G90' || line === 'M30' || line === 'M00') {
      continue;
    }

    // Tool definition: T1C0.8, T01F00S00C0.035
    const tdef = /^T(\d+)(?:[FSB][\d.]+)*C([\d.]+)/.exec(line);
    if (tdef) {
      if (!units) { units = 'in'; warnings.push('Drill file has no units; assuming inches.'); }
      tools[+tdef[1]] = parseFloat(tdef[2]) * k();
      continue;
    }
    const tsel = /^T(\d+)$/.exec(line);
    if (tsel) {
      finishRoute();
      rapid = false;
      tool = +tsel[1];
      if (tool !== 0 && tools[tool] == null) warnings.push(`Tool T${tool} has no size.`);
      continue;
    }
    if (!units && /[XY]/.test(line)) { units = 'in'; warnings.push('Drill file has no units; assuming inches.'); }

    if (line === 'M15') { routing = true; route = { points: [[x, y]], d: diameter() }; continue; }
    if (line === 'M16' || line === 'M17') { routing = false; rapid = false; finishRoute(); continue; }

    // Slot: X..Y..G85X..Y..
    if (line.includes('G85')) {
      const [a, b] = line.split('G85');
      const [x0, y0] = readXY(a);
      x = x0; y = y0;
      const [x1, y1] = readXY(b);
      const d = diameter();
      if (d) slots.push({ points: [[x0, y0], [x1, y1]], d });
      x = x1; y = y1;
      continue;
    }

    if (line.startsWith('G00')) { finishRoute(); rapid = true; [x, y] = readXY(line); continue; }
    if (line.startsWith('G01')) {
      rapid = false;
      const [nx, ny] = readXY(line);
      if (routing && route) route.points.push([nx, ny]);
      x = nx; y = ny;
      continue;
    }
    if (/^G0[23]/.test(line)) {
      // arc in a route: approximate with a straight segment to the endpoint
      const [nx, ny] = readXY(line);
      if (routing && route) route.points.push([nx, ny]);
      x = nx; y = ny;
      continue;
    }

    if (/^[XY]/.test(line)) {
      const [nx, ny] = readXY(line);
      x = nx; y = ny;
      if (routing && route) { route.points.push([nx, ny]); continue; }
      if (rapid) continue;
      const d = diameter();
      if (d) holes.push({ x, y, d });
    }
  }
  finishRoute();
  return { holes, slots, warnings };
}
