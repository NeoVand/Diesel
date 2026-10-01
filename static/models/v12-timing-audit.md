# Corrected V12 timing rig

The running rig uses all 320 purchased chain-link bodies, the eight source sprockets/pinions, four camshafts, and four measured cam-wheel covers. Six source guide bodies receive explicit stationary placement corrections. The original source geometry and its earlier audit remain preserved.

## Corrections and motion

The native 72/124/124-link loops contained open hinges and incompatible upper-stage pitch circles. The derived rig preserves every link's native pin spacing, geometry, axial station, and unit scale. Its recorded rest corrections move link pins by at most 8.8645 mm in the primary loop and 5.6029/5.1432 mm in the upper loops.

Pitch radii follow `R = p / (2 sin(π/N))`. The 20-tooth pinions shrink their pitch radii by 0.081332 mm; the 40-tooth cam sprockets increase them by 0.062524 mm. Derived outer tooth rings also receive recorded indexing corrections to align roller centers with seats. The central hubs and mounting holes remain fixed. These are deliberate geometry corrections, not claims that the purchased assembly had correct contact.

The native shaft axes remain fixed. The lower 30:30 stage drives the compound idler at crank speed. Each upper 20:40 stage drives its two cam sprockets at half crank speed. Coaxial idler/pinion coupling remains an explicit inference from the native arrangement. Four camshaft bodies can receive the valve module's crank-equivalent indexing offsets independently of the wheels and bolted covers. This preserves wheel/cover registration while changing cam-to-wheel indexing.

The four cam covers use the measured bolt-circle ownership recorded in `v12-motion-attachments.json`; cover 0659 receives its documented 0.319399 mm axis correction. No bearing-cap fasteners are assigned rotation.

## Closed-chain solve

The reproducible offline builder creates a periodic, constrained finite-pitch placement. Engaged interior pins lie on tooth-spaced pitch circles; each free span satisfies the same rigid pin-distance constraints. A 64-interval table covers one spatial link advance. Runtime interpolation is followed by a weighted Newton projection, solved in linear time using independent tridiagonal blocks between engaged pins. This restores closure after interpolation rather than accepting interpolated link stretch.

Runtime matrices contain only rigid translation and rotation. The moving link's two source pins land on the shared corrected hinges. The reusable buffers and matrices require no per-frame mesh rebuild. In the independent Chrome fixture, 500 evaluations measured approximately 0.1 ms at the median and 95th percentile, with a 2.1 ms maximum. These timings cover timing kinematics only, not full scene rendering.

Link identities need an unwrapped crank angle. The primary loop returns after 864 crank degrees; each upper loop returns after 2,232 degrees. The public 720-degree combustion-cycle wrap is not a valid chain-identity wrap.

## Guide clearance

The corrected free spans would penetrate the original primary guide locations. Six explicit rigid rest translations place the existing, unscaled guides outside a conservative chain-plate envelope. The largest correction is approximately 8.63 mm. The guide support arcs come from native analytic cylindrical faces. The clearance calculation uses the source 2.75 mm plate envelope; the A guides add 0.6 mm for the axial groove transition. B guides use the conservative outer flange radius. It checks complete link segments, not just hinge points.

The build targets a 0.12 mm minimum envelope clearance; runtime tests retain more than 0.1 mm across sampled fractional handoffs. These placements establish nonpenetrating kinematic clearance against the measured guide support envelope. They do not model tensioner spring forces, uniform shoe contact, wear, chain vibration, or contact stress. Free-span placement and the guide corrections remain identified as derived data.

## Verification

Eight focused tests pass. They cover more than 1,400 crank positions through complete link circulation, actual transformed source-pin closure, fixed shaft axes, half-speed cam motion, independent cam indexing, unchanged wheel/cover registration, deterministic reverse seeks, exact corrected rest recovery, unit scale, immutable geometry adapters, positive guide-envelope clearance, absence of planar self-crossings, and continuity at table and contact handoffs.

The runtime acceptance bounds are less than `1e-7 mm` hinge mismatch and `1e-9 mm` engaged tooth-center residual. In the captured 6-degree state they were approximately `9.3e-12 mm` and `2.9e-14 mm`, respectively, after two projection iterations. These measure mathematical kinematic constraints, not mesh manufacturing tolerances or a contact-force solution. Scoped ESLint and formatting pass.

Independent Chrome rendering inspected the actual purchased meshes at corrected rest and six degrees of crank advance, with zero runtime errors. The fixture applies the same geometry adapters and matrices used by the integration API.

## Integration contract

- `new V12Timing({ camCrankOffsetsDeg: V12_CAM_CRANK_OFFSETS_DEG })`
- `matricesForPhase(unwrappedCrankDeg)` returns borrowed reusable rigid matrices, keyed by source component ID.
- `createGeometryReplacement(id, originalGeometry)` returns an owned derived clone for each timing wheel, or `null`. Preserve the original and dispose the clone with the owning scene. Update bounds and section-cap geometry after adaptation.
- Phase-zero matrices already contain the corrected link, guide and cover placements. Use these matrices as the rest target for assembly transitions; do not blend to source identity.
- `getDiagnostics()` exposes closure, engaged-center residuals, projection iterations and individual guide-envelope clearances.
- `getPinPositionsMm(loopId)` exposes borrowed corrected XY coordinates for verification.

Implementation: `src/lib/scene/v12-timing.ts`. Data: `src/lib/engine/v12-corrected-timing.json`. Rebuild from the repository root using a Python environment with NumPy and `references/00_Active_V12/timing-verification/build-corrected-timing.py`. This invokes the colocated closure solver and guide-placement script. Source hashes and builder provenance accompany the derived data.

Evidence: `references/00_Active_V12/timing-verification/corrected-runtime-audit.json` and `corrected-timing-rest.png`.
