# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Static HTML/CSS/ES modules, no build step, runs entirely in the browser (user's choice). Libraries from jsdelivr pinned by exact version: three, clipper-lib, libtess, jszip.

## Users

Hobbyists and makers who design their own PCBs (KiCad, EasyEDA, Eagle, Altium) and own an FDM printer. Before ordering boards from a fab house, they want to print a physical stand-in of the board to check that real components, headers, connectors and mounting holes fit.

## Product Purpose

Upload Gerber + drill files (loose or a ZIP), choose printer, whether a multi-material unit exists, and how many colours (1–3) to use. Get back a dimensionally correct, watertight 3D model: board outline, drill holes (with FDM compensation), and optionally copper traces/pads/silkscreen as relief. Success: the user prints it and pushes real parts in without surprises.

## Positioning

Turns fab-house manufacturing files directly into a print-ready fit-test model, including the colour plan for single-extruder printers (filament change heights) or side-by-side colours with an AMS/CFS/MMU.

## Operating Context

Used at a desk beside the printer, between finishing a layout and ordering boards. Output goes into a slicer (Creality Print, OrcaSlicer, Bambu Studio, PrusaSlicer). The owner's printer is a Creality Ender 3 V3 SE (220 × 220 mm bed, single extruder); any printer is supported via presets or custom bed size.

## Capabilities and Constraints

- Gerber RS-274X (macros, regions, polarity, step-repeat, arcs) and Excellon (PTH/NPTH, slots, routed paths).
- Feature → colour assignment: board, traces, pads, silkscreen, bottom copper; traces and pads may share or split colours.
- Without multi-material: colours stack in Z bands with listed filament-change heights; bottom copper is engraved one layer deep.
- With multi-material: colours sit side by side; bottom copper is a colour inlay.
- Exports: one binary STL per colour, ZIP of all, 3MF with parts pre-assembled.
- All processing is client-side; files never leave the browser.

## Brand Commitments

The user asked explicitly that the UI must not look like generic AI-generated design.

## Evidence on Hand

No testimonials, users, or benchmarks exist; none may be invented. The demo board is the Arduino Uno Rev3 reference design (`demo/arduino-uno/`, CC BY-SA, credited in the UI). Other real boards used only for tests live in `node_modules/@tracespace/fixtures/boards` and are not shipped.

## Product Principles

- Dimensional truth first: every number shown is measured from the files.
- Say exactly what the printer will do (heights, layers, colours), never vaguely.
- Zero setup: drop files, get a model.
- Files stay on the user's machine.
