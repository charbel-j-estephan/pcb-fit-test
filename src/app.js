import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { identify, ROLES } from './layers.js';
import { toBinarySTL, build3MF } from './mesh.js';

// Only needed for ZIP uploads, ZIP/3MF downloads and the demo: fetched on first use.
const loadZip = () => import('../vendor/jszip.js').then((mod) => mod.default);
// Demo: the Arduino Uno Rev3 reference design (CC BY-SA, see demo/arduino-uno/LICENSE.txt)
const DEMO_FILES = ['arduino-uno.gko', 'arduino-uno.cmp', 'arduino-uno.sol', 'arduino-uno.stc', 'arduino-uno.sts', 'arduino-uno.plc', 'arduino-uno.drd'];
const loadDemo = () => Promise.all(DEMO_FILES.map(async (name) => {
  const res = await fetch(new URL(`../demo/arduino-uno/${name}`, import.meta.url));
  if (!res.ok) throw new Error(`demo file ${name} is missing`);
  return { name, text: await res.text() };
}));

const $ = (sel) => document.querySelector(sel);

const PRINTERS = [
  { id: 'ender3v3se', name: 'Creality Ender 3 V3 SE', x: 220, y: 220 },
  { id: 'ender3v3', name: 'Creality Ender 3 V3 / V3 KE', x: 220, y: 220 },
  { id: 'k1', name: 'Creality K1 / K1C', x: 220, y: 220 },
  { id: 'k1max', name: 'Creality K1 Max', x: 300, y: 300 },
  { id: 'a1mini', name: 'Bambu Lab A1 mini', x: 180, y: 180 },
  { id: 'a1', name: 'Bambu Lab A1', x: 256, y: 256 },
  { id: 'p1s', name: 'Bambu Lab P1S / P1P / X1C', x: 256, y: 256 },
  { id: 'mk4', name: 'Prusa MK4 / MK4S', x: 250, y: 210 },
  { id: 'mini', name: 'Prusa MINI+', x: 180, y: 180 },
  { id: 'custom', name: 'Other printer (enter bed size)', x: 220, y: 220 },
];

const FEATURES = [
  { key: 'board', name: 'Board', sub: 'Outline and holes' },
  { key: 'traces', name: 'Traces', sub: 'Copper under the mask' },
  { key: 'pads', name: 'Pads', sub: 'Exposed copper' },
  { key: 'silk', name: 'Silkscreen', sub: 'Outlines and labels' },
  { key: 'bottom', name: 'Bottom copper', sub: '' },
];

const PRESETS = {
  1: { board: 1, traces: 1, pads: 1, silk: 0, bottom: 1 },
  2: { board: 1, traces: 2, pads: 2, silk: 0, bottom: 2 },
  3: { board: 1, traces: 2, pads: 3, silk: 0, bottom: 2 },
};

const DEFAULT_COLORS = ['#2e7d4f', '#c8873a', '#f1f1ec'];

const state = {
  files: [],
  boardName: 'pcb',
  printer: 'ender3v3se',
  bed: { x: 220, y: 220 },
  multi: false,
  colors: 2,
  assign: { ...PRESETS[2] },
  slotColors: DEFAULT_COLORS.slice(),
  dims: { thickness: 1.6, layerHeight: 0.2, reliefHeight: 0.4, holeComp: 0.3, minDrill: 0.5 },
  result: null,
  roles: new Set(),
};

// ---------- persistence (per viewer convenience only) ----------
const STORE = 'pcb-fit-test:v1';
try {
  const saved = JSON.parse(localStorage.getItem(STORE) || 'null');
  if (saved) {
    for (const k of ['printer', 'multi', 'colors', 'slotColors']) if (saved[k] != null) state[k] = saved[k];
    if (saved.bed) state.bed = saved.bed;
    if (saved.dims) state.dims = { ...state.dims, ...saved.dims };
    if (saved.assign) state.assign = { ...state.assign, ...saved.assign };
  }
} catch { /* storage unavailable */ }
function save() {
  try {
    const { printer, bed, multi, colors, assign, slotColors, dims } = state;
    localStorage.setItem(STORE, JSON.stringify({ printer, bed, multi, colors, assign, slotColors, dims }));
  } catch { /* storage unavailable */ }
}

// ---------- worker ----------
const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
let jobId = 0;
let loadedId = -1;
worker.onmessage = (e) => {
  const m = e.data;
  if (m.type === 'loaded') { loadedId = m.id; requestBuild(0); }
  else if (m.type === 'built' && m.id === jobId) onBuilt(m);
  else if (m.type === 'error' && m.id === jobId) {
    setBusy(false);
    showWarnings([`Could not build the model: ${m.message}`]);
  }
};
worker.onerror = (e) => { setBusy(false); showWarnings([`Processing failed: ${e.message || 'unknown error'}`]); };

function loadIntoWorker() {
  if (!state.files.length) return;
  setBusy(true);
  jobId++;
  worker.postMessage({ type: 'load', id: jobId, files: state.files.map(({ name, text, role }) => ({ name, text, role })) });
}

let buildTimer = 0;
function requestBuild(delay = 120) {
  if (!state.files.length || loadedId < 0) return;
  clearTimeout(buildTimer);
  buildTimer = setTimeout(() => {
    setBusy(true);
    jobId++;
    worker.postMessage({ type: 'build', id: jobId, opts: buildOptions() });
  }, delay);
}

function buildOptions() {
  const a = {};
  for (const f of FEATURES) a[f.key] = Math.min(state.assign[f.key], state.colors);
  a.board = Math.max(1, a.board);
  return { ...state.dims, multiMaterial: state.multi, assign: a, bed: state.bed };
}

function setBusy(on) { $('#busy').hidden = !on; }

// ---------- file loading ----------
const isText = (s) => !s.slice(0, 2000).includes('\u0000');

async function readUpload(fileList) {
  const out = [];
  let zipName = null;
  for (const file of fileList) {
    if (/\.zip$/i.test(file.name)) {
      zipName = zipName || file.name.replace(/\.zip$/i, '');
      const JSZip = await loadZip();
      const zip = await JSZip.loadAsync(file);
      const entries = Object.values(zip.files).filter((f) => !f.dir && !/(^|\/)(__MACOSX|\.)/.test(f.name));
      for (const entry of entries) {
        if (/\.zip$/i.test(entry.name)) continue;
        const text = await entry.async('string');
        if (isText(text)) out.push({ name: entry.name.split('/').pop(), text });
      }
    } else {
      const text = await file.text();
      if (isText(text)) out.push({ name: file.name, text });
    }
  }
  return { files: out, zipName };
}

function guessBoardName(files, zipName) {
  if (zipName) return zipName.replace(/[-_ ]?(gerbers?|fab|output|plot)$/i, '') || zipName;
  const names = files.filter((f) => f.role !== 'ignore').map((f) => f.name.replace(/\.[^.]+$/, ''));
  if (!names.length) return 'pcb';
  let prefix = names[0];
  for (const n of names) while (!n.startsWith(prefix)) prefix = prefix.slice(0, -1);
  prefix = prefix.replace(/[-_. ]+$/, '');
  return prefix.length >= 2 ? prefix : 'pcb';
}

async function acceptFiles(fileList) {
  if (!fileList || !fileList.length) return;
  try {
    const { files, zipName } = await readUpload([...fileList]);
    if (!files.length) { showWarnings(['No readable Gerber or drill files were found in that upload.']); $('#output').hidden = false; return; }
    setFiles(files.map((f) => ({ ...f, role: identify(f.name, f.text) })), zipName);
  } catch (err) {
    showWarnings([`Could not read the upload: ${err.message}`]);
    $('#output').hidden = false;
  }
}

function setFiles(files, zipName) {
  const order = Object.keys(ROLES);
  files.sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role) || a.name.localeCompare(b.name));
  state.files = files;
  state.boardName = guessBoardName(files, zipName);
  state.firstFrame = true;
  renderLayers();
  // show the role table only when something essential was not recognised
  $('#layers-wrap').open = missingRoles().length > 0;
  renderAssign();
  loadIntoWorker();
}

function missingRoles() {
  const missing = [];
  if (!state.roles.has('outline')) missing.push('no outline');
  if (!state.roles.has('drill')) missing.push('no drill file');
  if (!state.roles.has('topCopper') && !state.roles.has('bottomCopper')) missing.push('no copper');
  return missing;
}

function renderLayers() {
  const tbody = $('#layers tbody');
  tbody.innerHTML = '';
  $('#layers-wrap').hidden = !state.files.length;
  $('#clear-files').hidden = !state.files.length;
  state.roles = new Set(state.files.map((f) => f.role));
  const used = state.files.filter((f) => f.role !== 'ignore').length;
  const unused = state.files.length - used;
  $('#layers-summary').textContent = [
    `${state.files.length} ${state.files.length === 1 ? 'file' : 'files'}`,
    `${used} used`,
    ...(unused ? [`${unused} not used`] : []),
    ...missingRoles(),
  ].join(' · ');
  state.files.forEach((f, i) => {
    const tr = document.createElement('tr');
    if (f.role === 'ignore') tr.className = 'ignored';
    const name = document.createElement('td');
    name.textContent = f.name;
    const roleCell = document.createElement('td');
    const sel = document.createElement('select');
    sel.setAttribute('aria-label', `Role of ${f.name}`);
    for (const [k, v] of Object.entries(ROLES)) sel.add(new Option(v, k, false, k === f.role));
    sel.addEventListener('change', () => {
      state.files[i].role = sel.value;
      renderLayers();
      renderAssign();
      loadIntoWorker();
    });
    roleCell.append(sel);
    tr.append(name, roleCell);
    tbody.append(tr);
  });
}

// ---------- settings UI ----------
function renderPrinter() {
  const sel = $('#printer');
  sel.innerHTML = '';
  for (const p of PRINTERS) {
    const label = p.id === 'custom' ? p.name : `${p.name} · ${p.x} × ${p.y}`;
    sel.add(new Option(label, p.id, false, p.id === state.printer));
  }
  $('#custom-bed').hidden = state.printer !== 'custom';
  $('#bed-x').value = state.bed.x;
  $('#bed-y').value = state.bed.y;
  document.querySelector(`#mmu input[value="${state.multi ? 1 : 0}"]`).checked = true;
}

$('#printer').addEventListener('change', (e) => {
  state.printer = e.target.value;
  const p = PRINTERS.find((q) => q.id === state.printer);
  if (p.id !== 'custom') state.bed = { x: p.x, y: p.y };
  $('#custom-bed').hidden = p.id !== 'custom';
  $('#bed-x').value = state.bed.x;
  $('#bed-y').value = state.bed.y;
  changed();
});
for (const id of ['bed-x', 'bed-y']) {
  $(`#${id}`).addEventListener('change', () => {
    state.bed = { x: clampNum($('#bed-x').value, 50, 1000, 220), y: clampNum($('#bed-y').value, 50, 1000, 220) };
    changed();
  });
}
$('#mmu').addEventListener('change', (e) => {
  state.multi = e.target.value === '1';
  renderAssign();
  changed();
});
$('#color-count').addEventListener('change', (e) => {
  state.colors = +e.target.value;
  state.assign = { ...PRESETS[state.colors] };
  renderAssign();
  changed();
});

function renderSlots() {
  const wrap = $('#slots');
  wrap.innerHTML = '';
  for (let s = 1; s <= 3; s++) {
    const div = document.createElement('label');
    div.className = 'slot';
    div.hidden = s > state.colors;
    const input = document.createElement('input');
    input.type = 'color';
    input.value = state.slotColors[s - 1];
    input.setAttribute('aria-label', `Preview colour for filament ${s}`);
    input.addEventListener('input', () => {
      state.slotColors[s - 1] = input.value;
      document.querySelectorAll(`[data-chip="${s}"]`).forEach((c) => { c.style.background = input.value; });
      recolor();
      save();
    });
    const txt = document.createElement('span');
    txt.innerHTML = `<span class="w">Filament </span><b>${s}</b>`;
    div.append(input, txt);
    wrap.append(div);
  }
}

function renderAssign() {
  document.querySelector(`#color-count input[value="${state.colors}"]`).checked = true;
  renderSlots();
  const tbody = $('#assign tbody');
  tbody.innerHTML = '';
  const has = (role) => !state.files.length || state.roles.has(role);
  for (const f of FEATURES) {
    const tr = document.createElement('tr');
    const value = Math.min(state.assign[f.key], state.colors);
    const available = f.key === 'board' ? true
      : f.key === 'bottom' ? has('bottomCopper')
      : f.key === 'silk' ? has('topSilk') : has('topCopper');
    if (!value || !available) tr.className = 'off';
    const sub = f.key === 'bottom'
      ? (state.multi ? 'Colour inlay in the bottom face' : 'Engraved one layer into the bottom face')
      : f.sub;
    const name = document.createElement('td');
    name.innerHTML = `${f.name}<small>${available ? sub : 'No matching file'}</small>`;
    const cell = document.createElement('td');
    const seg = document.createElement('div');
    seg.className = 'seg';
    seg.setAttribute('role', 'radiogroup');
    seg.setAttribute('aria-label', `${f.name} filament`);
    const options = [];
    if (f.key === 'bottom' && (!state.multi || state.colors === 1)) options.push([1, 'On']);
    else for (let s = 1; s <= state.colors; s++) options.push([s, String(s)]);
    if (f.key !== 'board') options.push([0, 'Off']);
    for (const [v, label] of options) {
      const l = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = `assign-${f.key}`;
      input.value = v;
      input.disabled = !available;
      const checkedValue = f.key === 'bottom' && (!state.multi || state.colors === 1) ? (value ? 1 : 0) : value;
      input.checked = checkedValue === v;
      input.addEventListener('change', () => {
        // engraving ignores the slot; keep the stored one so switching to AMS restores it
        state.assign[f.key] = f.key === 'bottom' && (!state.multi || state.colors === 1) && v === 1 ? Math.max(1, state.assign.bottom || PRESETS[state.colors].bottom) : v;
        renderAssign();
        changed();
      });
      const span = document.createElement('span');
      if (label === 'On' || label === 'Off') span.textContent = label;
      else span.append(chip(v), label);
      l.append(input, span);
      seg.append(l);
    }
    cell.append(seg);
    tr.append(name, cell);
    tbody.append(tr);
  }
  $('#assign-note').textContent = state.multi
    ? 'Colours print side by side; your multi-material unit swaps filament automatically.'
    : state.colors > 1
      ? 'One nozzle: each colour gets its own height band, and you swap filament at the heights listed under Print.'
      : '';
}

const dimInputs = { thickness: '#thickness', layerHeight: '#layer', reliefHeight: '#relief', holeComp: '#comp', minDrill: '#min-drill' };
const dimLimits = { thickness: [0.4, 5], layerHeight: [0.04, 0.4], reliefHeight: [0.08, 3], holeComp: [-0.5, 1.5], minDrill: [0, 5] };
for (const [k, sel] of Object.entries(dimInputs)) {
  $(sel).value = state.dims[k];
  $(sel).addEventListener('change', () => {
    state.dims[k] = clampNum($(sel).value, ...dimLimits[k], state.dims[k]);
    $(sel).value = state.dims[k];
    renderDimSummary();
    changed();
  });
}
function renderDimSummary() {
  const d = state.dims;
  $('#adv-summary').textContent = `${d.thickness} mm · ${d.layerHeight} layer · +${d.holeComp} holes`;
}
function clampNum(v, lo, hi, fallback) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
}

function changed() { save(); requestBuild(); }

$('#file-input').addEventListener('change', (e) => { acceptFiles(e.target.files); e.target.value = ''; });
$('#demo').addEventListener('click', async () => {
  try {
    const demoFiles = await loadDemo();
    setFiles(demoFiles.map((f) => ({ ...f, role: identify(f.name, f.text) })), 'arduino-uno');
  } catch (err) {
    showWarnings([`Could not load the demo board: ${err.message}`]);
    $('#output').hidden = false;
  }
});
$('#clear-files').addEventListener('click', () => {
  state.files = [];
  state.result = null;
  loadedId = -1;
  renderLayers();
  renderAssign();
  clearModel();
  $('#output').hidden = true;
  $('#dock').hidden = true;
  $('#titleblock').hidden = true;
  $('#section-view').hidden = true;
  $('#empty').hidden = false;
  setBusy(false);
});

// drag and drop anywhere
let dragDepth = 0;
window.addEventListener('dragenter', (e) => { if (e.dataTransfer?.types.includes('Files')) { dragDepth++; $('#dropveil').hidden = false; e.preventDefault(); } });
window.addEventListener('dragover', (e) => { if (e.dataTransfer?.types.includes('Files')) e.preventDefault(); });
window.addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) $('#dropveil').hidden = true; });
window.addEventListener('drop', (e) => {
  e.preventDefault();
  dragDepth = 0;
  $('#dropveil').hidden = true;
  acceptFiles(e.dataTransfer.files);
});

// ---------- results ----------
function onBuilt(m) {
  setBusy(false);
  state.result = m;
  $('#empty').hidden = !!m.bodies.length;
  $('#output').hidden = false;
  showWarnings(m.warnings);
  showModel(m);
  renderTitleBlock(m);
  renderSection(m);
  renderChanges(m);
  renderDrills(m);
  renderDownloads(m);
  // frame once the overlays are laid out, so the camera can avoid them
  if (state.firstFrame) { state.firstFrame = false; setView(currentView); }
}

function showWarnings(list) {
  const ul = $('#warnings');
  ul.innerHTML = '';
  for (const w of list) {
    const li = document.createElement('li');
    li.textContent = w;
    ul.append(li);
  }
}

const fmt = (v, d = 2) => (Math.round(v * 10 ** d) / 10 ** d).toFixed(d);
const slotName = (m, slot) => (m.bodies.find((b) => b.slot === slot) || {}).label || 'unused';
const filamentLabel = (m, slot) => `Filament ${slot} · ${slotName(m, slot)}`;

/** Colour dot for a filament slot; recolor() keeps every instance in sync. */
function chip(slot) {
  const i = document.createElement('i');
  i.className = 'chip';
  i.dataset.chip = slot;
  i.style.background = state.slotColors[slot - 1];
  return i;
}
const slotsUsed = (m) => [...new Set(m.bodies.map((b) => b.slot))].sort();

function renderTitleBlock(m) {
  const tb = $('#titleblock');
  if (!m.stats) { tb.hidden = true; return; }
  const s = m.stats;
  const fits = (s.width <= state.bed.x && s.depth <= state.bed.y) || (s.depth <= state.bed.x && s.width <= state.bed.y);
  const n = (v) => `<span class="num">${v}</span>`;
  const used = slotsUsed(m).length;
  const rows = [
    ['Size', `${n(fmt(s.width))} × ${n(fmt(s.depth))} mm`],
    ['Height', `${n(fmt(s.height))} mm`],
    ['Holes', s.skipped ? `${n(s.holes)} · ${n(s.skipped)} ${s.skipped === 1 ? 'via' : 'vias'} skipped` : n(s.holes)],
    ['Filaments', `${n(used)}${state.multi && used > 1 ? ' · side by side' : used > 1 ? ' · by height' : ''}`],
    ['Bed', `${n(state.bed.x)} × ${n(state.bed.y)} mm · ${fits ? 'fits' : 'too large'}`],
  ];
  tb.innerHTML = `<div><dt class="tb-title"></dt></div>` + rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
  tb.querySelector('.tb-title').textContent = state.boardName;
  tb.hidden = false;
}

/** To-scale cross-section: every Z band and what each filament prints in it. */
function renderSection(m) {
  const box = $('#section-view');
  if (!m.bodies.length) { box.hidden = true; return; }
  const zs = new Set();
  for (const b of m.bodies) for (const s of b.shells) { zs.add(s.z0); zs.add(s.z1); }
  const bounds = [...zs].sort((a, b) => a - b);
  const rows = [];
  for (let i = 0; i < bounds.length - 1; i++) {
    const z0 = bounds[i], z1 = bounds[i + 1];
    const cells = [];
    for (const b of m.bodies) for (const s of b.shells) {
      if (s.z0 <= z0 + 1e-6 && s.z1 >= z1 - 1e-6 && !cells.some((c) => c.slot === b.slot && c.what === s.what)) cells.push({ slot: b.slot, what: s.what });
    }
    if (!cells.length) continue;
    const key = cells.map((c) => `${c.slot}:${c.what}`).join('|');
    const prev = rows[rows.length - 1];
    if (prev && prev.z1 === z0 && prev.key === key) prev.z1 = z1;
    else rows.push({ z0, z1, cells, key });
  }
  const total = bounds[bounds.length - 1];
  const LINE = 16;
  // the band sits under the canvas, so short windows get a flatter drawing
  const scale = (window.innerHeight < 720 ? 80 : 120) / total; // px per mm
  const rowH = rows.map((r) => Math.max(LINE * r.cells.length + 2, (r.z1 - r.z0) * scale));
  const H = rowH.reduce((a, b) => a + b, 0);
  const x0 = 104, W = 56, xl = x0 + W + 12;
  const label = (c) => `Filament ${c.slot} · ${c.what}`;
  let y = H;
  const parts = [];
  rows.forEach((r, i) => {
    const h = rowH[i];
    y -= h;
    const w = W / r.cells.length;
    r.cells.forEach((c, j) => {
      parts.push(`<rect x="${x0 + j * w}" y="${y}" width="${w}" height="${h}" fill="${state.slotColors[c.slot - 1]}" data-chip-fill="${c.slot}" stroke="rgba(0,0,0,.35)" stroke-width="1"/>`);
    });
    const first = y + h / 2 - ((r.cells.length - 1) * LINE) / 2 + 4;
    parts.push(`<text class="lbl">${r.cells.map((c, j) => `<tspan x="${xl}" y="${first + j * LINE}">${escapeHtml(label(c))}</tspan>`).join('')}</text>`);
  });
  // Z ticks; filament changes also carry their layer number
  let ty = H;
  const ticks = [{ z: 0, y: H }];
  rows.forEach((r, i) => { ty -= rowH[i]; ticks.push({ z: r.z1, y: ty }); });
  for (const t of ticks) {
    const change = m.changes.find((c) => Math.abs(c.z - t.z) < 1e-6);
    parts.push(`<line x1="${x0 - 6}" x2="${x0}" y1="${t.y}" y2="${t.y}"/>`);
    if (change) {
      parts.push(`<line class="chg" x1="${x0 - 4}" x2="${x0 + W + 4}" y1="${t.y}" y2="${t.y}"/>`);
      parts.push(`<text class="chg-t" x="${x0 - 10}" y="${t.y + 4}" text-anchor="end">L${change.layer} · ${fmt(t.z)}</text>`);
    } else {
      parts.push(`<text x="${x0 - 10}" y="${t.y + 4}" text-anchor="end">${fmt(t.z)}</text>`);
    }
  }
  const longest = Math.max(...rows.flatMap((r) => r.cells.map((c) => label(c).length)));
  const width = Math.ceil(xl + longest * 6.9 + 4);
  const height = Math.ceil(H + 8);
  const legend = m.changes.length ? '<p>Dashed: change filament at the start of layer L.</p>' : '';
  box.innerHTML = `<div class="sv-head"><h3>Section <span>Z in mm</span></h3>${legend}</div><svg width="${width}" height="${height}" viewBox="0 -4 ${width} ${height}" role="img" aria-label="Layer plan by height">${parts.join('')}</svg>`;
  box.hidden = false;
}

function renderDrills(m) {
  const el = $('#drills');
  const rows = (m.stats && m.stats.drillChart) || [];
  if (!rows.length) { el.innerHTML = ''; return; }
  const body = rows.map((r) => {
    const kept = r.printed != null;
    const type = `${r.kind === 'slot' ? 'Slot' : 'Hole'}, ${r.plated ? 'plated' : 'non-plated'}${kept ? '' : ', left solid'}`;
    return `<tr${kept ? '' : ' class="skipped"'}><td>${fmt(r.d)}</td><td>${kept ? fmt(r.printed) : '–'}</td><td>${r.count}</td><td>${type}</td></tr>`;
  }).join('');
  el.innerHTML = `<table class="drills">
    <caption>Drill chart<small>Holes print ${fmt(m.stats.holeComp)} mm over drill size, because FDM holes shrink. Drills under ${fmt(state.dims.minDrill)} mm count as vias and stay solid.</small></caption>
    <thead><tr><th scope="col">Drill Ø</th><th scope="col">Prints at</th><th scope="col">Qty</th><th scope="col">Type</th></tr></thead>
    <tbody>${body}</tbody></table>`;
}

function renderChanges(m) {
  const el = $('#changes');
  if (state.multi && slotsUsed(m).length > 1) {
    el.innerHTML = `<p class="ams-note">Open the 3MF: each colour is already its own part. Assign filaments ${slotsUsed(m).join(', ')} to the parts in your slicer and print.</p>`;
    return;
  }
  if (!m.changes.length) { el.innerHTML = ''; return; }
  const rows = m.changes.map((c) => `<tr><td>${fmt(c.z)}</td><td>${c.layer}</td><td>${chip(c.slot).outerHTML}${escapeHtml(filamentLabel(m, c.slot))}</td></tr>`).join('');
  el.innerHTML = `<table class="changes">
    <caption>Filament changes<small>In the slicer, add a colour change (or pause) at the start of each layer below. Layer numbers assume ${state.dims.layerHeight} mm for every layer, first one included.</small></caption>
    <thead><tr><th scope="col">From Z</th><th scope="col">Layer</th><th scope="col">Load</th></tr></thead>
    <tbody>${rows}</tbody></table>`;
}

function renderDownloads(m) {
  const el = $('#downloads');
  el.innerHTML = '';
  const dock = $('#dock');
  dock.innerHTML = '';
  dock.hidden = !m.bodies.length;
  if (!m.bodies.length) return;
  let primary = null;
  const base = state.boardName.replace(/[^\w.-]+/g, '_');
  const multi = m.bodies.length > 1;
  const stlFor = (b) => toBinarySTL({ positions: b.positions, indices: b.indices }, `${base} ${b.label}`);
  const parts = () => m.bodies.map((b) => ({ name: filamentLabel(m, b.slot), color: state.slotColors[b.slot - 1], mesh: { positions: b.positions, indices: b.indices } }));
  const sizeOf = (b) => kb(84 + (b.indices.length / 3) * 50);

  if (multi) {
    primary = ['3MF, parts assembled', 'for any slicer', async () => {
      const data = await build3MF(await loadZip(), parts(), state.boardName);
      download(data, `${base}.3mf`, 'model/3mf');
    }];
    el.append(button(...primary.slice(0, 2), true, primary[2]));
    el.append(button('All STLs as ZIP', `${m.bodies.length} files`, false, async () => {
      const JSZip = await loadZip();
      const zip = new JSZip();
      for (const b of m.bodies) zip.file(`${base}-filament${b.slot}-${slug(b.label)}.stl`, stlFor(b));
      download(await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }), `${base}-stl.zip`, 'application/zip');
    }));
    const sep = document.createElement('p');
    sep.className = 'dl-sep';
    sep.textContent = 'Single STLs, all sharing one origin';
    el.append(sep);
  }
  for (const b of m.bodies) {
    const label = multi ? filamentLabel(m, b.slot) : 'STL';
    const save = () => download(stlFor(b), multi ? `${base}-filament${b.slot}-${slug(b.label)}.stl` : `${base}.stl`, 'model/stl');
    const btn = button(label, sizeOf(b), !multi, save);
    if (multi) btn.querySelector('.label').prepend(chip(b.slot));
    else primary = [label, sizeOf(b), save];
    el.append(btn);
  }
  // The dock keeps the main download in reach while the settings are scrolled.
  const more = document.createElement('button');
  more.type = 'button';
  more.className = 'link';
  more.textContent = multi ? 'All downloads' : 'Print details';
  more.addEventListener('click', () => $('#output').scrollIntoView({ behavior: 'smooth', block: 'start' }));
  dock.append(button(primary[0], primary[1], true, primary[2]), more);
}

// Hide the dock while the full download list is on screen.
new IntersectionObserver(([e]) => $('#dock').classList.toggle('away', e.isIntersecting)).observe($('#downloads'));

function button(text, meta, primary, onClick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = primary ? 'btn primary' : 'btn';
  b.innerHTML = `<span class="label"><span></span></span><small></small>`;
  b.querySelector('.label span').textContent = text;
  b.querySelector('small').textContent = meta;
  b.addEventListener('click', async () => {
    b.disabled = true;
    try { await onClick(); } finally { b.disabled = false; }
  });
  return b;
}

const slug = (s) => s.replace(/\s*\+\s*/g, '-').replace(/[^\w-]+/g, '-').toLowerCase();
const kb = (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const escapeHtml = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function download(data, name, type) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ---------- 3D preview ----------
const view = $('#viewport');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
view.append(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(35, 1, 0.5, 5000);
camera.up.set(0, 0, 1);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.12;
scene.add(new THREE.HemisphereLight(0xf2fff7, 0x2a3a33, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(-0.5, -1, 1.6);
scene.add(sun);
const fill = new THREE.DirectionalLight(0xffffff, 0.6);
fill.position.set(1, 0.8, -0.6);
scene.add(fill);

const bedGroup = new THREE.Group();
const modelGroup = new THREE.Group();
scene.add(bedGroup, modelGroup);
let meshes = [];

function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

function drawBed() {
  bedGroup.clear();
  scene.background = new THREE.Color(cssVar('--stage') || '#10221b');
  const { x, y } = state.bed;
  const grid = [];
  for (let gx = 0; gx <= x; gx += 10) grid.push(gx, 0, 0, gx, y, 0);
  for (let gy = 0; gy <= y; gy += 10) grid.push(0, gy, 0, x, gy, 0);
  const gridGeo = new THREE.BufferGeometry();
  gridGeo.setAttribute('position', new THREE.Float32BufferAttribute(grid, 3));
  bedGroup.add(new THREE.LineSegments(gridGeo, new THREE.LineBasicMaterial({ color: 0x24443a })));
  const edge = new THREE.BufferGeometry();
  edge.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, x, 0, 0, x, y, 0, 0, y, 0, 0, 0, 0], 3));
  bedGroup.add(new THREE.Line(edge, new THREE.LineBasicMaterial({ color: 0x8ea89a })));
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(x, y), new THREE.MeshBasicMaterial({ color: 0x132a21 }));
  plate.position.set(x / 2, y / 2, -0.02);
  bedGroup.add(plate);
}

function clearModel() {
  for (const m of meshes) { m.geometry.dispose(); m.material.dispose(); }
  modelGroup.clear();
  meshes = [];
}

function showModel(m) {
  clearModel();
  drawBed();
  if (!m.stats) return;
  const s = m.stats;
  modelGroup.position.set((state.bed.x - s.width) / 2, (state.bed.y - s.depth) / 2, 0);
  for (const b of m.bodies) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(b.positions, 3));
    g.setIndex(new THREE.BufferAttribute(b.indices, 1));
    const flat = g.toNonIndexed();
    g.dispose();
    flat.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ color: state.slotColors[b.slot - 1], roughness: 0.72, metalness: 0.02 });
    const mesh = new THREE.Mesh(flat, mat);
    mesh.userData.slot = b.slot;
    modelGroup.add(mesh);
    meshes.push(mesh);
  }
}

function recolor() {
  for (const m of meshes) m.material.color.set(state.slotColors[m.userData.slot - 1]);
  document.querySelectorAll('[data-chip-fill]').forEach((r) => r.setAttribute('fill', state.slotColors[r.dataset.chipFill - 1]));
}

let currentView = 'iso';
function setView(v) {
  currentView = v;
  document.querySelectorAll('.view-tools button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === v)));
  const s = state.result?.stats;
  const w = s ? s.width : state.bed.x, d = s ? s.depth : state.bed.y;
  const cx = s ? modelGroup.position.x + w / 2 : state.bed.x / 2;
  const cy = s ? modelGroup.position.y + d / 2 : state.bed.y / 2;
  const radius = Math.hypot(w, d) / 2;
  // Frame the board in the part of the canvas the title block leaves free:
  // either the column left of it or the strip above it, whichever is roomier.
  const W = view.clientWidth || 1, H = view.clientHeight || 1;
  let free = { x: 0, y: 0, w: W, h: H };
  const tb = $('#titleblock');
  if (!tb.hidden && getComputedStyle(tb).position === 'absolute') {
    const r = tb.getBoundingClientRect(), v = view.getBoundingClientRect();
    const left = { x: 0, y: 0, w: r.left - v.left - 12, h: H };
    const above = { x: 0, y: 0, w: W, h: r.top - v.top - 12 };
    free = Math.min(left.w, left.h) >= Math.min(above.w, above.h) ? left : above;
  }
  camera.setViewOffset(W, H, W / 2 - (free.x + free.w / 2), H / 2 - (free.y + free.h / 2), W, H);
  const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const dist = (radius * 1.15 * H) / (Math.max(80, Math.min(free.w, free.h)) * tanHalf);
  controls.target.set(cx, cy, 0);
  const dir = v === 'top' ? new THREE.Vector3(0, -0.0001, 1)
    : v === 'bottom' ? new THREE.Vector3(0, -0.0001, -1)
    : new THREE.Vector3(-0.45, -1, 0.85);
  camera.position.copy(controls.target).addScaledVector(dir.normalize(), dist);
  controls.update();
}
document.querySelectorAll('.view-tools button').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));

function resize() {
  const { clientWidth: w, clientHeight: h } = view;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  setView(currentView);
}
new ResizeObserver(resize).observe(view);
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => drawBed());

function loop() {
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}

// ---------- start ----------
renderPrinter();
renderAssign();
renderDimSummary();
drawBed();
resize();
setView('iso');
loop();
