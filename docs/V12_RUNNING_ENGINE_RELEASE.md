# V12 running engine: implementation and verification

30 September 2026. Active purchased generic V12 concept. Original CAD files are preserved.

This rebuild replaces the arrow presentation with source-contained particles and bounded volume rendering, and extends playback to the complete classified moving assembly. A cylinder-cycle calculation now exposes its assumptions, pressure–volume loop, conservation checks and exportable data. It is a declared engineering study of a concept engine, not an authenticated production-engine digital twin.

## How to inspect it

1. **Run** starts mechanical playback in the current view. It does not change the camera or remove the exterior.
2. **Mechanism** gradually reveals the cranktrain, all three timing chains, the camshafts, followers, valves and springs. **X-ray** and **Section** remain independent inspection choices.
3. Open **Processes** for intake air, fuel injection, combustion and exhaust. Use **Inspect this cylinder** to deliberately frame the selected cylinder. The gas displays are hidden during disassembly, isolation and disconnected presentations.
4. Open **Analysis → Cylinder cycle**. Select a piston, run or scrub the crank angle, and read the pressure/temperature/mass values and phase cursors. **Case assumptions**, **Numerical verification** and **Export cycle data** expose the basis of the calculation.
5. **Exploded**, **Arrange parts** and **Component atlas** retain their separate inspection functions. Returning to the engine restores its saved continuous drive angle.

## Mechanical ownership

The source inventory contains 1,253 bodies: 1,229 mechanical occurrences and 24 hidden lettering/decorative occurrences. Every mechanical occurrence has an owner: 466 rigidly moving, 336 deforming spring segments, and 427 fixed. The 336 spring bodies form 48 spring assemblies; they are not 336 springs. Forty-eight derived retainers are additional geometry and are recorded separately.

The crankshaft, flywheel, twelve rods and pistons, timing wheels, four camshafts, 320 rigid chain links, 48 tappets, 48 valves and four paired turbo rotors all animate. The timing drive uses recovered shaft axes, native rigid-link pitch and a constrained closed-loop solve. Cam contact determines valve lift; valve travel determines spring geometry. All transforms, picking and sectioning consume the same pose.

The crank angle is continuous beyond the displayed 720° combustion interval. Identified links do not jump back to their original chain position when the cycle readout wraps. Pause, backwards seek and saved-view restoration are deterministic. Turbo shafts use a separately declared 30,000 rpm presentation speed, not an inferred mechanical gear ratio; compressor maps, shaft inertia, spool dynamics and operating rotation direction remain uncalibrated.

## Source defects and explicit corrections

Native inspection found incompatible chain placement/pitch, guide registration issues, cam/follower gaps, duplicated rear cam phasing, missing spring retainers, piston-to-head contact and small lower-bore corner intersections. These were not material or lighting problems.

The derived running configuration corrects tooth rings, guide placement and mounting interfaces; reindexes rear cam lobes; adjusts valve stem lengths and one tappet axis; adds retainers; trims piston crowns to a 38.5 mm height above the pin; and locally relieves ten lower-bore corners. Original meshes and STEP files remain intact. All source bodies retain physical scale in animation.

The final delivered sixteen-body asset has passed all 24 continuous piston/block and piston/head clearance checks at a certified separation greater than 0.100 mm. An independent direct check also passes all 24 pairs. These certificates identify the exact runtime binary; they do not claim an exact minimum gap or hot-running clearance.

The crown operation removes approximately 4.342 cm³ per piston. It therefore changes geometric clearance volume. The numerical cylinder case deliberately declares its own 16:1 compression ratio and does **not** claim to derive it from the rendered chamber. Local mount edits are confined to the front timing-support region. These adaptations are documented concept corrections, not a validated production redesign.

Detailed evidence:

- [Timing drive, contact and guide registration](V12_CORRECTED_TIMING_RIG.md).
- [Valvetrain reconciliation and finite-pad contact](V12_VALVETRAIN_RECONCILIATION.md).
- [Piston and block clearance corrections](V12_CLEARANCE_CORRECTIONS.md).
- [Guide mounting interfaces](V12_TIMING_MOUNT_RECONCILIATION.md) and [native head/cover supports](V12_TIMING_GUIDE_SUPPORTS.md).
- Native and rendered clearance reports in `references/00_Active_V12/clearance-verification/`.
- Whole source-body ownership in `src/lib/engine/v12-motion-inventory.ts`.

## Process displays and their limits

| Display           | What is computed or recovered                                                                                        | What it does not establish                                                           |
| ----------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Intake air        | Six native gas solids; linear-tetrahedral potential-flow solves for three valve masks; native-contained trajectories | Viscous pressure loss, turbulence, compressible/transient flow, calibrated speed     |
| Exhaust           | Four native gas collectors; seven open-inlet masks; outlet-directed field advection                                  | Blowdown acoustics, turbine flow, thermal transport or turbo backpressure            |
| Fuel              | Measured nozzle tip locations; deterministic drag and D² evaporation parcels; first-wall-contact retirement          | Verified nozzle micro-orifices, breakup, wall film, fuel quantity or chemistry       |
| Combustion volume | Emission/absorption integration inside conservative moving gas bounds, opaque depth and section clipping             | Reacting CFD, a spatial temperature field or optical measurement                     |
| Cylinder cycle    | Ideal-air mass/internal-energy ODE, actual geometric valve curtain areas and measured slider-crank volume variation  | Calibrated combustion, measured engine output, friction, emissions or turbo matching |

Intake and exhaust paths come from solved fields, not arrows or hand-authored curves. Both field families use impermeable wall/closed-port boundaries and explicit destination/source valve masks. Numerical residuals, boundary fluxes, refinement and native-solid trajectory checks are retained alongside their offline builders. Tracer speed and particle density are inspection choices, not measured flow quantities. The gas fields terminate at their verified CAD interfaces; no solved flow through absent or unsolved passages is implied.

Fuel uses an assumed eight-hole pattern, 140° included angle, 100 MPa pressure difference, reduced drag and an evaporation law. Native CAD establishes the tip location, not those injection parameters. Parcels terminate at their first moving-wall contact; seeking cannot make a retired parcel reappear through a later opening. The spatial chamber envelope is conservative and truncated for display; it is not a watertight CFD mesh or a volume suitable for computing compression ratio.

The manifold fields and fuel illustration are **separate reference models** from the cylinder thermodynamics. They share phase and geometric valve timing; they are not a coupled transient multi-physics solution. The existing Design/Analyze structural-load studies also retain their own declared operating assumptions.

## Cylinder calculation

The reference case assumes 1,800 rpm, 16:1 compression, 1.1 bar absolute/320 K intake, 1.2 bar/650 K exhaust, constant ideal-air properties, a 0.65 valve discharge coefficient and 950 J of prescribed heat per cylinder-cycle. Heat addition spans −4° to +70° after compression TDC. Signed compressible gas exchange permits reverse flow. Pressure and temperature follow conserved mass/internal energy and volume; they are not arbitrary plotted pressure pulses.

The case converges to a periodic state in six cycles. Results are approximately 53.642 bar absolute peak pressure, 2,012.85 K peak uniform temperature and 459.757 J of indicated work per cylinder-cycle. They are outputs of these assumptions, not engine ratings. The same case is phase-aligned to each selected cylinder; cylinder-to-cylinder variation is not predicted.

Verification includes a closed adiabatic analytical limit, choking and upstream enthalpy under reverse flow, positivity, exact integrated heat addition, conservation ledgers, time-step refinement and a separately implemented SciPy DOP853 reference. Maximum whole-degree pressure difference from that reference is about 0.001773%; saved-curve interpolation error remains below 0.05%. Numerical agreement bounds numerical error, not the physical error of the assumed model.

See [full equations, assumptions and reproduction](V12_AIR_STANDARD_CYCLE.md). The CSV contains 1,441 samples at 0.5° spacing in SI units, including signed intake/exhaust mass flow.

## Rendering and interaction

Process rendering uses bounded buffers, soft particles and a restrained 64-step chamber volume. The volume terminates against an opaque-depth pass and respects the active cut plane. Invisible cylinders and inactive process channels are skipped. Field replay and parcel reconstruction use the shared scene clock; numerical cycle integration happens offline rather than inside animation frames.

The native piston skirts have twenty 1 mm-pitch machining grooves. Their high-frequency normals are filtered by the screen-space pixel footprint only inside the measured skirt band. Close views retain the grooves; every geometry position/index and original normal remains unchanged. This removes distance-dependent stippling without altering the clearance geometry.

Identical opaque finishes share material state while fading and selected components retain independent materials. This reduces submission overhead without merging component identities or changing the geometry.

The analysis inspector keeps both plots and readable units together. View changes preserve an open study and its selected cylinder. Compact study choices live inside the inspector. Opening the inspector retains an explicitly focused cylinder and adjusts the camera smoothly. The mobile inspector covers the view toolbar instead of allowing tools to obscure numerical values. The assistant receives the same current cycle state, declared assumptions and limitations shown in the UI.

## Acceptance record

The production build succeeds. All 438 unit tests in 76 files pass, Svelte/TypeScript checks report zero errors and warnings, and scoped ESLint is clean. The full production browser suite passed all 45 tests before the final piston-surface filtering and inspector focus refinement, covering Design/Analyze regression, mechanical playback, run/view independence, immediate separation, section controls, X-ray/material restoration, the atlas, mobile controls, CSV export, the eight-step tour and mocked AI/audio/cancellation. Live paid-model inference was not exercised in this pass. The build still reports a large JavaScript chunk (about 4.57 MB minified / 1.47 MB gzip); this and the approximately 99.4 MB of uncompressed runtime geometry/domain assets remain cold-load performance work, separate from running-frame performance.

After those final refinements, 27 of 28 focused production browser checks passed together. One atlas first-preview readiness check exceeded its five-second limit during concurrent testing; that exact test then passed twice serially without a code or assertion change. The final development process suite passed both tests, and the X-ray opacity transition check passed. Screenshots were reviewed at desktop and mobile sizes, with no browser or shader errors.

The final local browser benchmark at 1512 × 982 pixels and DPR 1 measured approximately 33.3 ms median animation-frame intervals (about 30 fps) in mechanism-only, mechanism-with-processes and section-with-processes views. Corresponding 95th-percentile CPU render-submission times were 3.8, 5.0 and 9.4 ms. Each measurement used one second of warmup and four seconds of sampling. This is one browser session, not isolated GPU timing or a 60 fps guarantee. Further delivery and rendering optimization remains worthwhile.

Final focused rendering checks and screenshots are recorded with the delivered report. Individual subsystem evidence is retained in the referenced audit directories. Passing these checks does not certify manufacturing feasibility, every possible interference, durability, real-engine acoustics or emissions.

No remote deployment, purchase, credential change or destructive source-asset cleanup is part of this rebuild.
