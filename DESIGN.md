---
name: PCB fit-test print
description: Gerber + drill files in, a printable board out, drawn as a fabrication sheet.
colors:
  copper: "#a8561d"
  copper-ink: "#ffffff"
  drafting-film: "#eef1ed"
  drafting-film-shade: "#e4e8e3"
  field-white: "#f8faf7"
  graphite: "#17201c"
  graphite-2: "#4b5751"
  graphite-3: "#5c6660"
  hairline: "#c5ccc6"
  hairline-strong: "#8f9a93"
  ochre-warn: "#8a5a00"
  ochre-warn-bg: "#f6ecd2"
  soldermask: "#10221b"
  soldermask-ink: "#d6e4dc"
  soldermask-ink-2: "#8ea89a"
  soldermask-rule: "#2b4a3d"
  stage-copper: "#e9a26a"
typography:
  display:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 600
    lineHeight: 1.45
    letterSpacing: "0"
    fontVariation: "'wdth' 125"
  headline:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.45
    fontVariation: "'wdth' 100"
  body:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.45
    fontVariation: "'wdth' 100"
  label:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "12.5px"
    fontWeight: 500
    lineHeight: 1.45
    fontVariation: "'wdth' 100"
  caption:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.45
  measure:
    fontFamily: "JetBrains Mono, ui-monospace, Cascadia Mono, Consolas, monospace"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.45
    fontFeature: "'tnum' 1"
rounded:
  square: "2px"
  round: "50%"
spacing:
  xs: "6px"
  sm: "8px"
  md: "12px"
  lg: "14px"
  xl: "20px"
components:
  button-primary:
    backgroundColor: "{colors.copper}"
    textColor: "{colors.copper-ink}"
    rounded: "{rounded.square}"
    padding: "0 12px"
    height: "36px"
  button-secondary:
    backgroundColor: "{colors.field-white}"
    textColor: "{colors.graphite}"
    rounded: "{rounded.square}"
    padding: "0 12px"
    height: "36px"
  segmented-option:
    backgroundColor: "{colors.drafting-film}"
    textColor: "{colors.graphite}"
    rounded: "{rounded.square}"
    padding: "6px 14px"
  segmented-option-checked:
    backgroundColor: "{colors.graphite}"
    textColor: "{colors.drafting-film}"
  input-field:
    backgroundColor: "{colors.field-white}"
    textColor: "{colors.graphite}"
    rounded: "{rounded.square}"
    padding: "0 8px"
    height: "32px"
  view-tool:
    textColor: "{colors.soldermask-ink-2}"
    padding: "6px 12px"
  view-tool-pressed:
    backgroundColor: "{colors.soldermask-ink}"
    textColor: "{colors.soldermask}"
  title-block:
    textColor: "{colors.soldermask-ink}"
    typography: "{typography.caption}"
    width: "250px"
  warning:
    backgroundColor: "{colors.ochre-warn-bg}"
    textColor: "{colors.ochre-warn}"
    rounded: "{rounded.square}"
    padding: "7px 10px"
  filament-chip:
    rounded: "{rounded.round}"
    size: "12px"
---

# Design System: PCB fit-test print

## Overview

**Creative North Star: "The Fabrication Drawing"**

The page is a fabrication drawing for the printer, not a SaaS form. A pale, cool drafting-film sheet carries the settings in ruled sections like the notes column of a drawing; beside it the 3D model sits on a soldermask-green stage with a drawing title block in its corner and a to-scale Z section band along its foot. Every number on the sheet is measured from the user's files, and the type says so: measured values, filenames and Z heights are set in a monospace, everything else in a single grotesque.

Density is that of a CAM tool: 14px body, 1px hairlines between sections, tight square controls, no cards, no shadows. Colour is restrained to graphite on film with one copper accent for the action and the current selection; the stage is the only large dark field and it stays dark in both themes, because the model is the subject.

The confirmed rejection is the centered upload card with a gradient "Generate" button, and more broadly anything that reads as generic AI-generated design (the user's explicit brand commitment).

**Key Characteristics:**
- Drafting-film ground, graphite ink, 1px hairline rules between sections.
- One copper accent for the primary action, links and focus; nothing else in the chrome is warm.
- Soldermask-green stage in both themes, with drawing furniture (view tools, title block, section band) in stage inks.
- Archivo for words, JetBrains Mono only for measured numbers, filenames and Z heights.
- Square controls (2px corners); circles only where the physical thing is round (filament chips, the spinner).
- Flat: depth is hairlines and tone, never shadow.

## Colors

Cool graphite on pale grey-green film, a single copper accent, and a deep soldermask stage that does not change with the theme.

### Primary
- **Copper** (copper): the only accent in the chrome. Primary download button fill, text links and their underline, the 2px focus ring, text selection, drop-zone hover border and the drop veil frame. White ink on it (copper-ink).

### Secondary
- **Stage Copper** (stage-copper): the copper as it reads on soldermask. Filament-change lines and their labels in the section band, and the spinner's moving arc. Used only on the stage.

### Neutral
- **Drafting Film** (drafting-film): page ground, dock ground, text on the checked segment.
- **Film Shade** (drafting-film-shade): hover fill on unchecked segments, unit suffix cells.
- **Field White** (field-white): inputs, selects, secondary buttons and the drop zone; slightly lighter than the film so fields read as writable.
- **Graphite** (graphite): primary text and the checked segment fill.
- **Graphite 2** (graphite-2): field labels, tagline, privacy line, select chevron.
- **Graphite 3** (graphite-3): hints, notes, table headers, captions, button meta; the lowest text tone, kept legible on film.
- **Hairline** (hairline): section dividers, table row rules, segment dividers, slot borders.
- **Hairline Strong** (hairline-strong): structural edges (top bar, panel edge, dock top), field and button borders.
- **Ochre Warn / Ochre Warn Bg** (ochre-warn, ochre-warn-bg): warning list items only.
- **Soldermask** (soldermask): stage ground and three.js scene background.
- **Soldermask Ink / Ink 2 / Rule** (soldermask-ink, soldermask-ink-2, soldermask-rule): text, secondary text and hairlines on the stage; title block, view tools, section band, busy indicator.

Dark theme (prefers-color-scheme, overridable with `data-theme`) re-maps the film and graphite roles to a near-black green ground with light ink, lifts copper to a brighter copper with dark ink, and deepens the soldermask stage slightly. The stage inks and stage rule are not re-mapped; the stage reads the same in both themes. The exact dark values live on `:root` in style.css and in the sidecar.

### Named Rules
**The One Copper Rule.** Copper is the only warm colour in the UI chrome. It marks the one primary action, links, focus and selection. The model and the user's filament swatches on the stage are data, not chrome, and are exempt.

**The Stage Stays Dark Rule.** The soldermask stage is dark in light and dark themes alike. Anything drawn on it uses the soldermask inks, never the page inks.

## Typography

**Display Font:** Archivo at wdth 125, weight 600 (with ui-sans-serif, system-ui)
**Body Font:** Archivo at wdth 100 (with ui-sans-serif, system-ui)
**Label/Mono Font:** JetBrains Mono (with ui-monospace, Cascadia Mono, Consolas)

**Character:** One grotesque in two widths: normal for working text, expanded for the few lines that name the drawing. A tabular monospace marks everything that was measured.

### Hierarchy
- **Display** (600, 17px, wdth 125): the brand name; at 13px the title-block title and the section-band heading; at 18px the empty-stage line. Only these moments, only at 600.
- **Headline** (600, 15px): panel section headings (Files, Printer, Colours, Output).
- **Body** (400, 14px, 1.45): all running text, controls, segment labels (500), button labels (500).
- **Label** (500, 12.5px): field labels in graphite-2; notes, hints and drop-zone sub-lines at 12.5px/400 in graphite-3.
- **Caption** (400-500, 12px): table headers, button meta, title-block rows, unit suffixes.
- **Measure** (JetBrains Mono 400, 13px, tabular): change and drill table cells, title-block values; 12px for layer filenames; 11px for Z ticks in the section band.

### Named Rules
**The Measured-Values-Only Rule.** JetBrains Mono appears only on numbers measured from the files, filenames and Z heights. Words, including words inside those tables, stay in Archivo.

**The Wide-Face Rule.** The expanded width (wdth 125) is loaded only at weight 600 and is used only for naming the drawing: brand, title-block title, section heading, empty-stage line. Any inline aside inside those resets to wdth 100.

## Layout

A two-column drawing sheet under a single top bar. Left: the settings panel, `minmax(340px, 400px)`, scrolling on its own, its sections (`16px 20px 18px` padding) separated by hairlines and closed by the hairline-strong panel edge. Right: the stage, a grid of the canvas (fills height) over the section band (auto height). The contract asked for a 380px column; the build lands at 340-400px.

Stage furniture: view tools pinned top-left (14px inset), busy indicator top-right, title block overlaying the canvas bottom-right (14px inset, min 250px wide); the camera frames the model clear of it. The Z section band runs across the stage foot under a soldermask-rule hairline, heading block (22ch) beside the drawing.

A dock with the primary download is sticky at the panel foot while the download list is off screen, and hides when the list scrolls in.

Spacing rhythm is small and even: 6, 8, 12, 14 and 20px, with 12px between fields and 20px horizontal panel padding (16px on phones).

Responsive:
- **≤1100px:** the tagline drops from the top bar.
- **≤820px:** the layout stacks with the stage first (column-reverse); the canvas becomes 52vh (min 300px); the title block leaves the canvas and sits static below it; the dock becomes fixed to the screen bottom.
- **≤400px:** slot labels drop the word "Filament", keeping the number.
- **Short desktop windows (≥821px wide, ≤720px tall):** title block, section band and view tools compact their padding and size.
- **Container query on the stage (≤680px):** the section band's heading moves above the drawing instead of beside it.

## Elevation & Depth

Flat. There are no box-shadows anywhere. Depth comes from tone (film vs field-white vs film-shade; soldermask vs translucent soldermask overlays) and from 1px hairlines at two strengths. Stage overlays (view tools, title block, busy) sit on translucent soldermask so the grid reads through them.

### Named Rules
**The Hairline Rule.** Structure is drawn with 1px lines, hairline for internal division, hairline-strong for structural edges. Thicker strokes are reserved for state: the 2px copper focus ring and the 3px copper frame of the file drop veil.

## Shapes

Square drafting geometry. Controls and containers take a 2px corner (square); the unit input and suffix join into one shape with the shared edge removed. Circles appear only for physically round things: filament chips (like pads and holes) and the spinner. Dashed lines are drafting vocabulary: the empty drop zone border and the filament-change lines in the section band. The select chevron and the disclosure chevron are drawn from CSS strokes, not glyphs.

## Components

### Buttons
Stacked, full-width, label left and meta right, like rows in a parts list.
- **Shape:** square (2px), 36px tall, `0 12px` padding, 500 label with a 12px caption meta.
- **Primary:** copper fill and border, white ink; meta at 85% opacity. One per output (the 3MF or the single STL) and repeated in the dock.
- **Secondary:** field-white fill, hairline-strong border, graphite ink; filament downloads carry a filament chip before the label.
- **Hover / Focus:** secondary border goes to graphite; primary brightens (`brightness(1.08)`); focus is the global 2px copper ring at 2px offset. Disabled while working: 50% opacity, progress cursor.
- **Link:** copper text, 3px underline offset, 2px underline on hover. Used for Clear, Edit roles, the demo board, and the dock's "All downloads".

### Segmented Controls
The primary choice control (multi-material unit, filament count, feature-to-filament assignment).
- **Style:** hairline-strong frame, 2px corners, hairline dividers, 6px 14px options at 500.
- **State:** checked inverts to graphite fill with film text; hover on unchecked fills film-shade; disabled drops to graphite-3. In the assign table options are 38px wide and carry a 9px filament chip and the slot number; "Off" is an option, not a toggle.

### Chips
- **Style:** a 12px circle (9px inside segments) filled with the user's filament colour, 1px dark-translucent ring (light ring on a checked segment). Used wherever a filament is named: assign table, change table, download rows, section band fills.

### Inputs / Fields
- **Style:** 32px, field-white, hairline-strong 1px border, 2px corners, 8px padding; numeric inputs set in JetBrains Mono with a joined unit suffix on film-shade.
- **Select:** native appearance removed, chevron drawn with two gradients in graphite-2.
- **Hover / Focus:** border to graphite-2; 2px copper focus ring.
- **Drop zone:** field-white, 1px dashed hairline-strong; hover or drag-over turns the border solid copper. The full-window drop veil is translucent soldermask with a 3px copper frame.
- **Colour slots:** three columns, hairline frame, 26px square swatch, label with the slot number in mono.

### Tables
Layers, assign, changes and drills share one table language: no fills, 12px graphite-3 headers over a hairline, hairline row rules, left-aligned captions at 500 with a 12.5px graphite-3 sub-line. Measured cells are mono tabular 13px; word cells revert to Archivo. Skipped or ignored rows drop to graphite-3. Warnings above them are ochre-on-ochre-bg list items, 2px corners.

### Disclosure
Layer roles and Advanced use `details` with the summary laid out as a row; Advanced draws a stroke chevron that rotates from right to down (0.15s ease-out), the summary value sits right in 12px graphite-3 tabular.

### Stage Furniture (signature)
- **View tools:** a segmented strip in stage inks on translucent soldermask, soldermask-rule frame and dividers; pressed state inverts to soldermask-ink fill.
- **Title block:** a two-column definition grid bordered in soldermask-ink-2, rows ruled in soldermask-rule, labels left in ink-2, values right in ink with numbers in mono; first row is the board name in the wide face spanning both columns.
- **Section band:** a to-scale Z section of the print: stacked filament fills with dark-translucent hairlines, Z ticks in 11px mono, labels in Archivo, and filament changes as dashed stage-copper lines labelled `L{layer} · {z}`.
- **Busy:** a small square-cornered box on translucent soldermask, a 10px ring spinner with a stage-copper arc (0.8s linear).
- **Empty stage:** centred two-line message, first line in the wide face at 18px; touch and pointer variants swap by media query.

## Do's and Don'ts

### Do:
- **Do** separate sections with 1px hairlines and keep the panel free of cards and fills.
- **Do** keep copper to the one primary action, links, focus and selection in the chrome.
- **Do** set every measured number, filename and Z height in JetBrains Mono with tabular figures, and only those.
- **Do** use 2px corners on every control and container; use circles only for filament chips and the spinner.
- **Do** draw stage furniture in the soldermask inks on translucent soldermask so it reads as part of the drawing.
- **Do** keep the stage dark in both themes and move the title block below the canvas at ≤820px.
- **Do** honour prefers-reduced-motion: the only motion is the spinner and the disclosure chevron.

### Don't:
- **Don't** build a centered upload card with a gradient "Generate" button.
- **Don't** add box-shadows; depth is tone and hairlines.
- **Don't** introduce a second accent hue in the chrome or use copper decoratively.
- **Don't** set words, labels or headings in the monospace.
- **Don't** use the expanded Archivo width at weights other than 600 or for running text.
