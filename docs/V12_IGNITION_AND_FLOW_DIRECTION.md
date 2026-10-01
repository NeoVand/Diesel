# Ignition glow and flow-direction review

Updated 2026-09-30. This follows `V12_CONNECTED_PROCESS_PATHS.md` and supersedes the particle-exit treatment in `V12_FLOW_VISIBILITY_AND_PERFORMANCE.md`.

## Visible changes

Combustion has a bright jet core, a softer amber reacting charge, and warm reflections on nearby piston and valve surfaces. Each cylinder follows its existing compression-ignition envelope. The volume is bounded by the measured head and moving piston domain, excludes valves, and respects solid depth and the section plane. Two fixed, short-range lights provide the reflected glow without additional shadow passes or changing shader light counts while running. Reflected light fades at the cut plane. Exterior mode, hidden flows and disassembly suppress that lighting.

Both exhaust mouths now have a continuous, short volumetric plume. The plumes begin 4 mm inside measured rims, expand gently, and fade within 150 mm. They use 32 ray samples, solid-depth occlusion and the same section plane as the engine. There are no outlet particle buffers or detached dotted trails. Density, expansion and emitted color are optical presentation choices, not exhaust mass-flow, temperature or emissions predictions.

## Direction findings and corrections

- Native intake and collector polylines already followed their intended upstream-to-downstream order. Tests now check entry and exit velocity signs on all 120 intake paths and 96 exhaust paths across four placed instances, including the valve-mask variants.
- The old repeated parcel pattern could appear to reverse at lower frame rates. Native passages now use 96 mm spacing, shared with the connection envelopes. All process layers use one continuous optical clock. Fast playback limits optical travel to at most 19.2 mm per rendered frame and 330 mm per wall-clock second. Mechanical timing is unchanged. Pause does not reset flow; explicit phase seeks reconstruct it deterministically.
- The two turbine branches on each bank previously drew overlapping copies of their common final pipe. Each common trunk is now rendered once. Turbine, branch, trunk and exit share continuous pulse-distance coordinates; zero is at the measured mouth.
- One bank's native elbow initially travels toward positive native Z before turning toward its negative-Z outlet. That bend is intentional source geometry. Both terminal trunks and both outlet volume axes point outward.
- Fuel branches now inherit the pulse coordinate at their supply-rail junction.
- Chamber intake now moves toward decreasing axial position, from the head toward the piston. Chamber exhaust moves toward increasing axial position, back toward the head. The previous shared wave sign could imply the wrong intake direction.

The native fuel galleries, collector fields and downpipe geometry remain distinct from inferred head and turbine connections. This work verifies the displayed path ordering and optical advection. It does not establish a calibrated reacting-flow solution or guarantee that the source engine is a validated production design.

## Verification

- Full unit suite: 479 tests across 87 files passed.
- Type/Svelte checks: zero errors and zero warnings; production build passed. The existing large JavaScript bundle warning remains.
- Nine browser checks passed: three development process/interaction checks and six production checks covering cylinder study, X-ray restoration, material/section/atlas shading, whole-engine sections, run/pause/seek, and independent Run/view behavior. The final live browser review reported zero browser or shader errors.
- New checks cover outlet axes, single shared trunks, phase continuity at joints, native inlet/outlet signs, light positions inside firing chambers over a full 720-degree cycle, pause/seek, section rejection, fixed light identities, warmup races and bounded forward optical steps at 5–120 Hz.

Visual review included the mechanism overview, both outlet mouths and a close cylinder view with only combustion enabled. A local 180-frame all-channel sample at 1512 × 982 and adaptive pixel ratio 1 measured 33.3 ms median / 50.0 ms p95 frame intervals, and 6.2 / 7.1 ms JavaScript render-call duration. These measure different things: the latter excludes asynchronous GPU completion. This is a local sample, not a universal 60 fps claim. The scene still draws approximately 3.14 million triangles in that view.

## Review controls

For the glow: **Mechanism → Processes → Ignition & combustion → Inspect this cylinder**, then seek to **205°** for the default cylinder. For the full circuit: **Processes → Show all → Run**. **Flow paths** can isolate air, fuel or exhaust for inspection.
