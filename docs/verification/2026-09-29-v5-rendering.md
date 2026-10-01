# Parts atlas renderer verification

The scene now has a separate Parts layout presentation containing all 587 purchased source mesh identities and 88 authored teaching components. It first separates the engine, then arranges the 675 components into nine contiguous system grids. Each part uses one uniform scale, preserving its shape, circular bores and existing material finishes. Relative size and spacing in this presentation are inspection choices, not engineering measurements.

## Implementation

- `src/lib/scene/parts-layout.ts` supplies deterministic shared placements, group bounds, uniform scale and the source affine interpolation. Cell pitch is 1.16 display units, each part's longest dimension is 0.9, and the minimum fixture gap is at least 0.26.
- `engine-studio.ts` sends source position/scale/center through a two-row float texture. CPU raycast proxies use exactly the same affine map. No source IDs are changed or merged by the layout.
- `educational-mechanism.ts` consumes the same map, interpolates from the displayed entry pose, then uses a canonical phase-zero arrangement. The actual saved cycle phase is retained. All 88 teaching parts have a visible inspection path; the Internals control hides them in layout.
- Entry has two stages: explosion, then arrangement. Reverse restores source proxy scales, the inferred teaching embedding, retained removal flags and the actual cycle phase. Hidden/isolation controls apply by exact component, component family or semantic parent. Removed components retain their cells in the atlas; removal displacement resumes outside it.
- `EXPLOSION_MULTIPLIER = 3` is shared by source and teaching offsets while the UI/state control remains 0..1. Wide explosions receive expanded light/shadow coverage and a floor below the lowest displayed component.
- Camera fitting honors existing responsive overlay insets. Atlas labels and cell-corner markings are presentation geometry excluded from component picking. System focus, individual focus, click and double-click continue using the original component IDs.

## Verified evidence

`gpu/atlas-proof.json` and the corresponding PNG captures were produced with isolated headless Chrome (`channel: chrome`) on an Apple M4 Metal renderer, at a 1168 × 880 CSS viewport, device DPR 2 capped to 1.25 by the application.

All 12 GPU assertions passed:

- 587 source and 88 teaching identities present; all nine systems accounted for.
- Source displayed boxes match atlas targets to a maximum residual of 3.84e-14 display units; teaching boxes match to 3.98e-15.
- Actual rendered source click and double-click hit `Frame_Object_479`; exact teaching isolation remains visible and inspectable.
- Internals=false hides all teaching pick meshes.
- Phase 355 is retained across layout and return; saved camera reconstruction residual is 5.55e-17.
- Reverse returns source proxy scales to [1,1,1] and teaching top-level scale to the existing inferred uniform embedding.
- Maximum explosion remains nonempty, including five immediate 0/1 scrub updates ending at 1: 30,153 gold pixels and finite transforms/tables.
- No browser errors were recorded.

The warmed scripted-orbit sample had 124 measured presentation frames: median 16.7 ms, p95 16.8 ms on this local M4/Chrome configuration. These are browser presentation intervals, not GPU timer queries or a guarantee for other hardware. Composer output-quad counters were excluded because they do not measure engine draw calls or triangle counts. The paused renderer stops scheduling frames when transitions and controls settle.

## Blank explosion diagnosis

`explosion-controls/controls.json` preserves a same-camera A/B. With wide-view fog removed, the explosion has 61,518 gold pixels and 69,900 bright pixels. Restoring the original studio fog range 19..40 produces zero of either, with finite tables and camera coordinates. Disabling AO while retaining that fog still produces zero. This isolates the compact fog range as the cause.

The final renderer uses dynamic distant fog beyond the complete expanded bounds, plus a larger floor, so parts stay visible while the distant floor fades smoothly. The earlier blank captures remain historical evidence; final images are `gpu/wider-explosion.png` and `gpu/rapid-scrub-max-explosion.png`.

## Scope and limits

The atlas displays the purchased source mesh groups and illustrative teaching geometry. The nine system assignments are existing explorer metadata, not a validated OEM assembly hierarchy. Native vendor product labels retain their existing provenance. Uniform atlas scaling does not assert component dimensions or actual engine spacing. This round does not change the purchased geometry, physical simulation claims, clipping/capping algorithm, or existing solid-boundary repairs.

Focused layout tests cover deterministic identity/order, separate cells and system envelopes, uniform shape preservation, exact source shader/proxy interpolation, semantic/hidden framing, and invalid/empty inputs. Teaching tests cover staged entry, all 88 final/midblend boxes, picking, Internals and pose/section restoration. Parent integration verification subsequently reported 138 unit tests passing, check with zero errors/warnings, and clean lint; browser acceptance is handled by the parent.

Renderer application files are frozen. No extra GPU process remains open.

## Close-up piston shading follow-up

Final browser inspection exposed a pre-existing lathe crown shading defect made legible by atlas isolation. The focused same-camera controls in `piston-controls/SHADING_NOTE.md` and `piston-controls/piston-controls.json` distinguish invalid planar-face normals from unsuitable radial anisotropic shading. Both corrections are needed for a clean crown; the geometry owner applies the minimal piston-only normal/material repair with unchanged position/topology checks. No atlas renderer rewrite is needed. The parent captures the corrected production close-up and reruns acceptance after that repair.
