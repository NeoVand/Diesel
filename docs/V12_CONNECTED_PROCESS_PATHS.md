# Connected engine process paths

This revision addresses the missing links between the mechanism, the fuel supply, and the intake/exhaust presentation. Previously the intake and exhaust overlays covered only isolated manifolds, while fuel appeared at nozzle tips. Increasing their opacity did not explain a complete path.

## What now connects

- **Fuel:** an open source fitting on each bank → one shared native rail gallery → six native curved feed bores → injector bore → the recovered nozzle tip → the existing in-cylinder spray. The two open fittings are at opposite ends of the engine; the other fittings are capped. Their use as supply boundaries is a presentation assumption. The tank, filter, pump, pressure regulation, and return equipment are outside this asset.
- **Intake air:** the native inlet passages → head-port interfaces → two intake valve seats per cylinder → the chamber above the moving piston. The last head connection is a schematic centerline between measured interfaces.
- **Exhaust:** the chamber → two exhaust valve seats → head-port interface → native collector → an inferred turbine transition → recovered asymmetric downpipe centerlines → measured outlet mouth and the existing exterior plume.
- **Chamber exchange:** air and exhaust now have their own bounded gas display, independent of combustion. The existing sampled head/piston envelope and moving valve exclusions constrain this volume. It follows the piston rather than extending through the crown or crankshaft.

Fuel enters the cylinder directly, separately from the intake air. The physical explanation follows the direct-injection principle described by [Bosch](https://www.bosch-mobility.com/en/solutions/injectors/unit-injector/). The supplied asset is a generic diesel concept, not a calibrated Bosch or Caterpillar production engine.

## Reading the view

Enable **Mechanism**, then **Processes → Show all**, and **Run**. Cyan identifies air, gold identifies liquid fuel feed, and warm orange identifies exhaust. Model-anchored labels identify the displayed air inlet, fuel supply fitting, and exhaust outlet. Expand **Flow paths** in the existing lower control deck to see the sequence or trace only one channel. **Inspect this cylinder** frames the chamber and its head connections.

The added connection envelopes use soft, downstream-moving density pulses. Their faint stationary context remains visible when a valve is closed, but the moving contribution is gated by the actual cam-derived valve state. Fuel branches use the declared injection window. Speed, width, density, and color are explanatory; they are not pressure, temperature, or mass-flow results. The native manifold tracer fields remain separate quasi-steady potential-flow solutions.

## Evidence and limits

| Item | Evidence | What it does not establish |
|---|---|---|
| Two fuel rails and twelve feeds | Native cylindrical and curved BREP bores; all nozzle endpoints match chamber datums; 1,248 centerline samples outside source metal | Full hydraulic volume, pressure dynamics, needle motion, finite-width optical envelope clearance |
| Forty-eight head connections | Native port and valve-seat endpoints; all 3,120 sampled center points outside the appropriate source head | Exact passage wall surfaces, moving curtain flow, turbulence, pressure losses |
| Four exhaust downpipe routes | Individually recovered source cylinders/torus bends; 416 empty-centerline samples; exact joins to measured mouths | Turbine scroll geometry, turbine work, compressible unsteady flow |
| Chamber charge | Existing source-derived head/piston bounds and moving valve exclusions | Complete watertight chamber mesh, temperature or reacting CFD |

The inferred turbine transition is not included in the native empty-pipe audit. Sampled centerline clearance is not a certification of every point or of a finite-radius tube. No claim of a calibrated, mass-conserving whole-engine fluid solve is made.

Reproducible extraction, source hashes, native face identities and audit output live in:

- `references/00_Active_V12/fuel-flow-verification/`
- `references/00_Active_V12/gas-connection-verification/`
- `src/lib/engine/v12-fuel-connection-datums.json`
- `src/lib/engine/v12-exhaust-downstream-datums.json`

## Rendering cost

The new static connection geometry is merged into three draw calls. Motion updates shader uniforms, without rebuilding tubes or uploading per-frame connection vertices. Gas-only chamber rays skip the eight-jet combustion calculation and use 32 samples; spray/combustion retains 64. Existing paused-state caching, section planes, and opaque depth occlusion are retained.

## Validation

All 466 unit tests across 83 files passed, including new direction, rail continuity, nozzle equality, valve binding, source-interface continuity, full-cycle gas gating, clipping, pause/seek and disposal checks. Further browser and visual verification is recorded with the delivered screenshots and validation data.

Visual review led to two further fixes: fuel uses a depth-attenuated inspection overlay so the native feed remains legible behind cam hardware; whole-engine boundary labels are hidden in a cylinder study. Explicit cylinder focus now uses an outward bank view and includes the feed branch/head interfaces instead of preserving an unsafe end-on camera direction. The turbine transition passes through an illustrative21 mm-radius wheel-region waypoint with a narrow3 mm optical core; it remains unsolved.

A local1512×982,1×pixel-ratio running-view sample measured a27.4 ms median /39.1 ms95th-percentile frame interval with all flows enabled, versus17.3/33.2 ms with them disabled. These are short local observations on a machine running other applications, not a frame-rate guarantee. An earlier transient-heavy sample was worse; performance remains dependent on the large source assembly and device load.

Final checks: scoped lint/formatting clean; type check0 errors/0 warnings; production build passed. After the last rendering/camera refinements,15 affected unit tests passed, all3 development process browser checks passed, and6 production browser checks passed (cylinder study, X-ray restoration, material/section/isolation/atlas, full-engine section, measured run/pause/seek, exterior Run continuity). Browser console review found no errors. The complete466-test suite passed before those final refinements; affected coverage was then rerun as described.
