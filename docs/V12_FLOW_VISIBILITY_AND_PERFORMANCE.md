# Flow visibility and rendering refinement

30 September 2026 · Generic V12 diesel concept

## Changes in the application

Mechanism mode now retains the actual intake, exhaust and turbo passage surfaces translucently while their process channels are enabled. Disabling a channel removes its added context; isolation, hidden parts and disassembly retain their existing meaning. This fixes the misleading appearance of tracers floating where removed pipes used to be.

Intake and exhaust use broader, softer parcels with three times the previous illustrative traversal pace. Eight parcels per path replace eighteen tiny head/trail dots. Only particles in the active valve mask are submitted. Paused frames retain their buffers. The final treatment uses constant RGB with per-parcel alpha: endpoint fading no longer paints dark dots under normal blending.

Short, pale exhaust plumes now start slightly inside the measured mouths of components 0768 and 0769, then expand outside them. Their position, axis and 30 mm rim radius come from complete native circular edges. A repeatable extractor retains source hashes and 672 native empty-corridor checks. The external puffs are a presentation extension; the collector fields do not constitute a solved turbo/downpipe network or emissions calculation.

Fuel remains direct injection from the measured nozzles into the chambers. The source injector/rail hardware stays visible, but no verified external fuel-supply gallery was found. A free-space fuel route was not invented. The process menu distinguishes passage fields, nozzle spray, optical combustion and illustrative outlet puffs.

The main title now reads **V12 diesel engine**; supporting context says **V12 diesel concept**. The purchased model's diesel designation and named injector/glow-plug systems support that label. In a compression-ignition diesel, fuel is injected into hot compressed air inside the chamber. [DOE explanation](https://afdc.energy.gov/vehicles/how-do-diesel-cars-work)

Design and Analyze now open in **Split**, including when an older saved Results-only preference exists. Explicit layout choices remain active during a visit; entering another workspace restores Split.

## Performance work

- Spring deformation caches exact unchanged heights and precomputes phase-invariant trigonometry. At the same geometry-only Mechanism view, spring updates fell from 3.6 ms to 0.5 ms median; the complete transform update fell from 4.0 ms to 1.0 ms. Geometry, motion timing and deterministic seeking are preserved.
- Paused camera motion no longer recomputes all mechanical transforms. Opacity/material state changes are applied when needed, rather than rewritten for every body on every frame.
- Paused process buffers are reused. The combustion depth pass is cached when geometry and camera are unchanged, with explicit invalidation on camera/projection changes, geometry changes, explicit phase/cut-plane changes and target resizing. The last cutaway transition frame is also marked as changed.
- Geometry with exactly zero shadow coverage no longer submits a shadow draw. Every positive coverage value retains continuous fading. Shadow maps require a separate rendering pass, so skipping invisible casters removes actual work. [Three.js shadow documentation](https://threejs.org/manual/pages/shadows.html)
- High-density views now have an adaptive pixel budget. During sustained slow motion, a 16-frame window with p75 above 24 ms reduces pixel ratio in 0.25 steps, down to 1×. It never increases resolution within the same continuous motion period. Idle restores native detail up to the existing 1.5× cap. CSS text and controls keep their native resolution.

The native corrected solids and clearance asset are unchanged. Timing chains and all major moving mechanisms remain animated.

## Experiment and decision

At 1512 × 982 with a 1.5 pixel ratio, 32 volume steps looked nearly identical to 64 at the inspected 185° pose, but did not materially change frame time. Disabling combustion volumes and their depth pass also failed to fix the overall slowdown. The implementation therefore retains 64 volume steps and addresses redundant CPU work and moving-view pixel cost instead.

Later trials were affected by substantial unrelated operating-system and application load. Whole-engine median frame intervals ranged around 50–67 ms and the cylinder closeup around 33–50 ms in those trials. Lower pixel ratios tightened the timing distribution, but these measurements do not establish a universal frame-rate guarantee. The approximately 99.4 MB of uncompressed runtime geometry/domain data and large application bundle remain a separate cold-load limitation. The visual and numerical scope of the model is unchanged by the performance work.

## Validation

- 453 unit tests across 80 files pass.
- Svelte/TypeScript: zero errors and zero warnings. Scoped ESLint: clean. Production build: passes.
- Three integrated development browser tests pass, including high-density rendering, actual passage context, Run/Pause, seek, disassembly suppression, camera controls and deselection.
- X-ray opacity and shadow-transition browser regression passes in both directions.
- Three new Split-default browser regressions pass for Design, Analyze and workspace switching.
- All 49 production browser tests passed. A subsequent final review added explicit cut-plane cache invalidation; its 17 focused unit checks passed, and the affected development browser checks passed again after the final build (3 process/camera checks and 1 opacity check). An intervening recheck overlapped the build and was interrupted by development-page reloads; the serial rerun passed without relaxing assertions.
- Desktop screenshots inspected for Mechanism flow, exhaust outlets, Design Split, Analyze Split and the 32/64 step combustion comparison. The experiment browsers reported no page or shader errors.

Detailed raw profiling and native-outlet evidence are retained in `work/render-profile/` and `src/lib/engine/v12-exhaust-outlet-datums.json`. The user-facing review pack contains copies and screenshots.
