# Purchased V12 motion verification

30 September 2026

The runtime now articulates the purchased crankshaft, flywheel, coaxial crank sprocket, twelve pistons and twelve connecting rods. These are 27 source occurrences, not replacement teaching meshes. The other sprocket named `crankshaft_wheel` is an idler 125 mm above the crank axis; it is deliberately not rotated about the crank centre.

## Geometry and transform contract

The implementation uses the native STEP analytic pin, journal and bore axes recorded in `references/00_Active_V12/analytic-mechanism.json`: 85 mm bore, 100 mm stroke, 125 mm rod, 50 mm throw and 60° banks. The source-static crank phase remains phase zero. Each piston translates along its own measured bore axis; each rod rotates about and follows its actual crank pin; the crank group rotates about the measured main axis.

Native millimetres map into the source-centred GLB through the export's fixed basis. The displayed crank axis is X, at approximately Y = −1.291600 and Z = 0. This conversion was checked against loaded GLB bounds for piston 0003, rod 0654, crankshaft 0661, sprockets 0663/0664 and flywheel 0770. No camera fit, part scale or disassembly amount changes this basis.

`V12Mechanism.matricesForPhase()` evaluates one reusable motion map per phase. The renderer composes any explosion translation after that motion, and uses the same final transforms for visible geometry, selection and sections. Phase zero, 360° and 720° return exact identity deltas, preventing cumulative drift.

## Verification results

Nine focused tests pass. They cover all twelve source mappings, 8,652 native endpoint configurations across 720°, exact rest/reverse playback, dead-centre travel of 100 mm, display basis, endpoint attachment after actual runtime matrices, determinant/unit scale and cached phase evaluation. Endpoint closure remains below 1e−9 mm in the analytic test and below 1e−9 display units in the matrix test. Non-finite phases are rejected.

Two additional tests load the actual licensed GLB and verify section picking on a purchased connecting rod. The bearing hole stays open and its wall stays selectable across five crank phases, two disassembly translations and both plane directions; hiding and restoring the component removes and restores its cap targets. These tests skip in checkouts without the licensed derivative. All eleven motion and section tests pass locally.

A separate triangle-BVH check uses the actual optimized, meshopt-decoded GLB. At every 1° through 360°, it checks all twelve pistons against the crank, their own liner and the block, and each rod against its liner and block: **21,660 pair samples**.

| Pair                | Surface-intersection samples |
| ------------------- | ---------------------------: |
| Piston / crankshaft |                            0 |
| Piston / own liner  |                            0 |
| Rod / own liner     |                            0 |
| Rod / block         |                            0 |
| Piston / block      |                          411 |

The piston/block result is a real source limitation: ten pistons contact small lower block support corners near bottom dead centre. Piston `v12-0014` already intersects a corner in the purchased static pose. Its surface intersection footprint is about 0.8 × 1.8 × 0.9 mm; this is a footprint, **not penetration depth**. Repeating selected checks against the unsimplified source export reproduces the same contacts. They are not caused by simplification or the motion adapter.

A separate 10° rod/crank screen covers 444 pairs. All intersection points remain within 0.197 mm of nominal journal or axial bearing contact surfaces. The native design has zero nominal radial and rod side clearance, so faceted bearing surfaces overlap as they rotate. This is not evidence of validated running fits. No gross rod/counterweight contact was found outside the explicitly recorded 0.25 mm contact envelope at those samples.

## Presentation scope

The moving rotating assembly is useful for explaining measured slider-crank geometry. It must not be described as a manufacturing-ready, clearance-validated engine. Preserve the purchased geometry and show the source-design limitation in evidence. Do not shrink pistons, move shafts, alter rod length or silently erase block material to hide the issue.

Cam timing, valve lift, chain engagement and firing order have not been established. Cam/valve/chain geometry remains static. A 720° seek range is available for teaching, but the actual geometric mechanism repeats at 360°; phase zero is the source pose, not an asserted ignition event. The clock must be labelled in crank degrees and playback rate, not as measured rated engine RPM.

The surface screen is sampled and detects triangle-boundary intersections. It is not an exact BREP overlap-volume computation, continuous collision proof, complete containment test or tolerance analysis. Heads, valves, all auxiliaries and full drivetrain contacts are outside this screen.

The machine-readable results, source hash and reproducible audit scripts are saved in `references/00_Active_V12/motion-verification/`. The audit scripts use local paths and the existing audit workspace's Three Mesh BVH installation; they are verification tools, not shipped app dependencies.
