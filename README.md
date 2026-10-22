# PCB fit-test print

Drop Gerber + drill files (or the ZIP your CAD tool exports) and get a 3D-printable model of the board, with the real outline, drill holes and optional copper/silkscreen relief. Print it and push your real components in before you order the PCB.

Everything runs in the browser; files never leave the page.

## Run it

Any static file server works. From this folder:

```bash
python -m http.server 8080
```

Then open http://localhost:8080. To host it, upload the folder as is (GitHub Pages, Netlify, etc.). `node_modules/` is not needed at runtime.

## What it does

- **Printer**: presets (Ender 3 V3 SE, Bambu, Prusa, …) or a custom bed size; warns when the board does not fit.
- **Multi-material unit (AMS / CFS / MMU)**
  - *No*: each colour gets its own height band, and the page lists the Z height and layer number where you add a filament change in the slicer. Bottom copper is engraved one layer deep.
  - *Yes*: colours sit side by side; bottom copper is a colour inlay.
- **Colours 1–3**, assigned per feature: board, traces, pads, silkscreen, bottom copper. Traces and pads can share a colour or be split.
- **Holes** print at drill size + oversize (default +0.3 mm, because FDM holes shrink). Vias under 0.5 mm are skipped.
- **Downloads**: a 3MF with the colour parts already assembled, one STL per colour (all on one origin), or all STLs as a ZIP.

## Development

```bash
npm install          # parser test fixtures + library sources
node scripts/vendor.js  # regenerate vendor/*.js from node_modules (only after upgrading a library)
npm test             # synthetic board + 8 real boards: watertight meshes, sizes, holes, colour bands
```

| Path | What |
|---|---|
| `src/gerber.js` | RS-274X parser (macros, regions, polarity, step-repeat, arcs) |
| `src/excellon.js` | Excellon drill parser (PTH/NPTH, G85 slots, routed slots) |
| `src/layers.js` | Detects each file's role (X2 attributes, then filename, then content) |
| `src/geometry.js` | Clipper polygon helpers, board outline detection |
| `src/model.js` | Builds the colour bodies from the layers and options |
| `src/mesh.js` | Extrusion (libtess triangulation), binary STL, 3MF |
| `src/worker.js` | Runs the model build off the main thread |
| `src/app.js` | UI and three.js preview |
