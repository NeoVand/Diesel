# Source-profile V12 valve train

The running configuration contains four native-derived camshafts, 48 source valves, 48 source tappets, and 48 deforming spring assemblies. Actual purchased seat rings and guides remain fixed. This is a documented geometric correction of a concept assembly, with an explicit teaching cycle. It is not an authenticated production firing order, cam calibration, or manufactured engine specification.

## What was recovered and corrected

Each valve station is linked to its actual source seat, guide, tappet, cam lobe, and seven source spring segments. The 336 segmented source spring bodies represent 48 springs. Source identifiers remain attached to the corresponding replacement segments. A single source tappet, `v12-0851`, is shifted approximately 1 mm onto its existing guide and valve axis; the correctly placed valve `v12-0855` is not shifted away from its guide.

The closed valve position is solved against the actual seat-ring radial contact profile. The native seat bores have a 12.5 mm radius, with 13.5 mm outer radius. The sampled maximum seat-face gap is 0.0000113 mm. Upper straight stem lengths increase by 1.524–2.406 mm to reconcile the seated head with the tappet socket. Head shapes, head radii, seats, and guide locations are preserved.

Lift comes from the actual native cam section over a finite 13 mm radius tappet pad. The exact native 15 mm base circle removes false lift caused by coarse polygon chords. The contact table samples every 0.25 crank degree, with interpolation at runtime. A 0.0001 mm seating deadband removes residual source-placement noise.

The original cam indexing cannot supply twelve evenly spaced compression events. Two explicit corrections are applied:

| Cam source ID | Whole-cam crank-equivalent offset | Additional rear-lobe correction |
| --- | ---: | --- |
| `v12-0288` | +29° | Rear six lobes +180 cam degrees |
| `v12-0287` | +81° | Rear six lobes +180 cam degrees |
| `v12-0285` | +423° | Rear six lobes +180 cam degrees |
| `v12-0286` | +396° | Rear six lobes +180 cam degrees |

The rear half of each native cam is split through its circular central journal, rotated, and fused. All four corrected cams are valid single native solids. Their volume residual is below 7 × 10⁻¹⁶ relative to the source. Individual lobe profiles and bearing journals are preserved. The original cached native solids and purchased files are unchanged. Whole-cam clocking changes internal cam-to-wheel indexing; timing wheels and bolted covers retain their chain registration.

The resulting declared compression TDCs are twelve distinct events, 60 crank degrees apart. Intake/exhaust roles follow the native head-port arrangement. This is a derived cycle configuration, not an OEM firing-order claim.

## Valve events

Angles below are after each cylinder's declared compression TDC, at a 0.01 mm effective opening threshold. Expansion is 0–180°, exhaust 180–360°, intake 360–540°, and compression 540–720°.

| Event | Derived angle | Relation to geometric dead centre |
| --- | ---: | --- |
| Exhaust opens | 164.564–164.566° | About 15.435° before BDC |
| Exhaust closes | 344.417–344.418° | About 15.583° before gas-exchange TDC |
| Intake opens | 374.564–374.566° | About 14.565° after gas-exchange TDC |
| Intake closes | 554.417–554.418° | About 14.417° after BDC |

There is no overlap in this configuration. Both valve families remain seated through the compression TDC injection window. The late intake closure is retained from geometric contact rather than truncated at the nominal stroke boundary. Maximum lift is 6.213202 mm. Curtain area is limited by the source seat bore; it is a geometric opening area, without a calibrated discharge coefficient.

## Springs and attachments

Each source spring is reconstructed as a continuous 3.5-turn helix with 3.2 mm wire diameter and 10 mm centreline radius. Grounded end arcs and smooth pitch transitions connect the fixed native support to the moving retainer. Compression changes pitch while preserving wire cross-section. The seven source identities retain coincident segment boundaries; geometry is updated in place for rendering and section caps. It is not a nonuniform scale applied to the original body.

The source does not separately identify usable retainers and keepers. Forty-eight explicitly derived annular retainers are added with distinct `derived-retainer-*` identities, attached to the corresponding valve. They must not be represented as recovered purchased parts or a manufacturing-complete keeper design.

The spring tests verify fixed support, moving end position, unchanged wire diameter, coincident segment seams, and more than 0.5 mm same-azimuth coil separation at maximum lift. This is a geometric test, not a spring force, fatigue, buckling, or surge model.

## Verification and limits

The independent verification performs 345,600 valve-to-piston envelope evaluations across all 48 valves, plus continuous local extremum refinement. The minimum conservative separation is **0.546915 mm**. This bound uses the original source piston's maximum crown plane and ignores bowl relief. A subsequent correction that only lowers that crown cannot reduce this valve clearance. Piston-to-head/block clearance is a separate audit and must not be inferred from this result.

A separate 345,600-point comparison samples the rendered native-derived cam section against the finite tappet pad. Signed contact residual ranges from **−0.000907 to +0.003879 mm**, within the 0.01 mm native tessellation setting. These residuals concern geometric correspondence, not manufacturing lash or Hertzian contact stress.

Focused runtime tests cover all source associations, 720° periodic valve motion, unwrapped/reverse seeks, twelve evenly spaced compression events, dominant lift on the assigned stroke, positive crown-plane clearance, unit-determinant rigid matrices, spring constraints, immutable originals, cached asset loading, and disposal ownership. An independent browser fixture visually checks actual source parts at closed and peak-open positions and through a complete moving cycle, with no browser errors.

Native cam shape acceleration, operating forces, thermal expansion, material properties, lubrication, spring dynamics, and durability remain unvalidated. Geometric consistency is not a claim that this concept should be manufactured or operated at a particular speed.

## Integration and reproduction

- `V12Valvetrain.loadRefinedCams()` loads `/models/v12-cams-refined.glb` before geometry adapters and section caps are prepared. The four-cam asset is approximately 3.9 MB, tessellated at 0.01 mm linear and 0.06 rad angular deflection.
- `matricesForPhase(unwrappedCrankDeg)` returns reusable rigid translations for 48 valves and 48 tappets. Phase-zero matrices already contain the corrected rest pose.
- `prepareGeometry(id, sourceGeometry)` returns an owned replacement for source stems, coil segments, or refined cams. Originals remain unchanged. `dispose()` releases replacements once.
- `getAttachments()` supplies the 48 distinctly identified derived retainers. Their parent valve supplies rigid motion and visibility.
- `updateGeometry(angle, blend)` updates springs in place. A zero blend means corrected phase-zero rest, not the defective purchased placement.
- Pure `v12CylinderValveState()` supplies cycle branch, actual lift, and geometric opening area to process visualizations. The same unwrapped angle drives both mechanical and process state.

Runtime implementation: `src/lib/scene/v12-valvetrain.ts` and `src/lib/engine/v12-valve-events.ts`. Runtime datums: `src/lib/engine/v12-valvetrain-datums.json`. Timing integration and chain constraints are documented separately in `docs/V12_CORRECTED_TIMING_RIG.md`.

Reproduction scripts and evidence are in `references/00_Active_V12/timing-verification/`:

1. `extract-valve-datums.py` and `extract-valve-seats.py` recover source associations and native seat/guide axes.
2. `build-derived-cams.py` constructs the four valid native cam corrections and the runtime GLB; `derived-cam-audit.json` records source hashes and validity/volume results.
3. `derive-valvetrain.mjs` samples finite-pad contact and writes runtime datums.
4. `verify-corrected-valvetrain.mjs` writes `corrected-valvetrain-verification.json` with per-valve final acceptance.
5. `valve-event-audit.mjs` writes `derived-valve-events.json` with per-cylinder opening and closing angles.
6. `audit-valve-piston.mjs` checks whether the conservative envelope requires triangle-level intersection checks; final accepted geometry has no such overlap.

The earlier `pre-clocking-valve-piston-audit.json`, `cam-contact-audit.json`, and `cam-phase-optimization.json` record source defects and exploratory fits. They are historical diagnostics, not final acceptance reports.

Machine-readable final checks: [valve and cam verification](/models/v12-valvetrain-verification.json), [valve events](/models/v12-valve-events.json).
