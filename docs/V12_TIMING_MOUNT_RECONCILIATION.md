# Timing guide mount reconciliation

The corrected finite-pitch timing rig moves six source guides rigidly. Their mounting screws and supporting housings must therefore receive matching local corrections. The purchased STEP and GLB remain unchanged. This is derived demonstration geometry; it does not establish thread strength, clamp preload, manufacturing feasibility, fatigue life or a production-ready timing system.

## Source evidence and ownership

The six guides have 22 native radius-1.5 mm mounting-hole axes. Each axis matches an existing `bolts/belt cap` screw within 0.001 mm in the runtime mesh. No new screws are invented. `src/lib/engine/v12-timing-mounts.json` records each guide, screw, original axis, corrected axis, native bounds and matching residual.

| Guide | Existing screw count | Rigid native correction X / Y, mm |
| ----- | -------------------: | --------------------------------- |
| 0318  |                    5 | +1.48056 / −2.24025               |
| 0319  |                    5 | −1.59803 / −2.41800               |
| 0320  |                    3 | +8.62515 / −0.02540               |
| 0321  |                    3 | −8.62493 / +0.07336               |
| 0322  |                    3 | −1.10522 / +0.63632               |
| 0323  |                    3 | +1.61271 / +0.92850               |

The screws use the identical static translation as their guide. Their geometry, length and scale do not change. `V12Timing` returns 364 matrices: 336 moving bodies, six corrected stationary guides and 22 corrected stationary screws. Cam-bearing-cap fasteners remain stationary in their original positions.

## Local housing corrections

The sixteen block and six head mounting pads use the source 5 mm outer radius. A local capsule-shaped pad joins each original and derived bore axis, filling the old bore and preserving a connected support. The original native bore profile is transplanted to the new axis. The three negative-bank head supports additionally extend from native Z612 to Z620, closing an 8 mm support gap already present in the source assembly.

The block correction is applied after the previously documented lower-bore corner relief. All added and removed mounting tools are at native Z≥594 mm, at least 14.9 mm beyond the conservative piston swept extent. The corrected block remains one valid connected native solid. Each of its sixteen new bores has zero native obstruction volume within the recorded numerical threshold.

Coincident whole-solid subtraction on this source produced invalid, near-whole-block difference shapes. Those results are rejected. The preservation check instead records the bounded constructive operands and valid protected-region intersections below Z593.99 mm. Adaptive native integration over the approximately 10.4485 million mm³ protected region differs by 0.04748 mm³ (approximately 4.54×10⁻⁹ relative), within the explicitly recorded 0.1 mm³ volume-agreement threshold. This numerical agreement is supporting evidence; the locality follows from the bounded editing operands.

The timing cap requires local support and guide-clearance reconciliation as well: its original radius-5 posts extend through the guide thickness. The two primary pockets use the union of original and corrected guide bounds expanded by 0.2001 mm, explicitly removing obsolete old-position ribs. Final native checks find one valid connected cap, zero guide/cap common volume for all six guides, 0.2000 mm bank-guide clearance and 0.2001001 mm primary-guide clearance. All 22 front bore axes register within 0.000001 mm; 704 native support-ring witness points lie inside the connected cap. Four bank-guide/head pairs have zero common volume with intended seated distance zero. Do not infer cap clearance from bore-axis registration alone.

## Chain and fastener clearance

`chain-fastener-clearance-audit.json` checks all 320 original link meshes against all 22 entire original screw meshes, including their heads. Every source link is enclosed by a convex planar capsule derived from its actual vertices; the largest radius is 2.75021 mm. Each entire screw is enclosed by its measured coaxial cylinder. These are conservative geometry envelopes, not nominal shaft radii.

Across 721 samples at 0.05° spacing over the common 36° geometric repeat of the 20- and 30-tooth drivers, the smallest envelope separation is **1.17277 mm**. The closest pair is negative-bank link 0555 and screw 0025 at crank 4.2°. This is a dense sampled geometric separation check; it is not a proof of contact forces, tolerances, hot distortion or every possible numerical frame.

The timing unit tests independently verify unique ownership of all 22 screws, rigid determinant-one transforms, native-axis registration and phase-invariant guide/screw attachment. The pre-existing chain tests cover finite-pitch closure, tooth-center registration, circulation continuity, cam speed/indexing and guide envelopes.

## Reproduction and integration

The native scripts and machine-readable evidence are in `references/00_Active_V12/timing-verification/`. Run from the repository root using the existing OCP environment:

1. `map-guide-mounts.py` derives the 22 source screw/guide relationships.
2. `extract-mount-cad.py` caches the untouched native timing cap and screws. The dedicated guide extractor caches the six guides.
3. `build-block-guide-mounts.py` creates the sixteen block supports, retaining the previous lower-bore relief.
4. The separate head/cap builder creates components 0666, 0715 and 0317 and records local solid validity and guide clearance.
5. `pack-mounted-clearance-geometry.py` packs the four corrected housings with the unchanged twelve corrected piston meshes.
6. `verify-chain-fasteners.mjs` reproduces the actual-source-mesh clearance audit.

The existing `loadV12ClearanceGeometry()` interface supplies sixteen owned immutable-source-coordinate replacement meshes (four housings and twelve pistons). Root rendering, picking and section caps use the same geometry; normal rigid scene matrices remain responsible for assembly transforms. The loader verifies the binary checksum and complete body set before accepting it. These licensed source-derived assets retain the purchased model's distribution restrictions.
