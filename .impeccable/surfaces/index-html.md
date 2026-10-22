---
version: 1
slug: "index-html"
primary_target: "index.html"
related_targets: []
---

Scope: index.html, the whole single-page tool. Mode: Operate.
Audience/task: a maker drops Gerbers, sets printer + colours, inspects the 3D model, downloads STL/3MF, reads filament-change heights.
Constraints: static site, works offline after load, dark + light, phone width usable.

## Direction contract
THESIS: The page is a fabrication drawing for the printer, not a SaaS form. It refuses the centered upload card with a gradient "Generate" button.
OWN-WORLD: Drafting-film ground (cool pale grey-green, not cream), graphite ink, 1px hairline rules, one copper accent for actions and selection. Archivo for UI text, JetBrains Mono only for measured values, filenames and Z heights. Square controls. The viewport is soldermask green with a scaled bed outline.
STORY: The user sees what was detected, what the printer will do layer by layer, and leaves with files plus a filament-change list they trust.
FIRST VIEWPORT: Left 380px column of settings sections separated by rules; right, a full-height 3D viewport with a drawing title block (bottom-right) giving board name, W × D × H, holes, colours. Below the viewport, the signature: a to-scale Z cross-section strip showing every colour band and change height.
FORM: user-pinned direction (fab drawing / CAM tool), position 1, no seed key (pinned brief beats the roll).
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
