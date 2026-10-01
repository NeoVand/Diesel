# Derived piston and block clearances

The purchased source has two separate geometric interferences. The original files remain unchanged. The running demonstrator uses explicitly derived native solids for the block and twelve pistons, with local timing-guide supports reconciled in the block, both heads and timing cap. The final sixteen-body asset has passed continuous clearance checks for all twelve piston/block and twelve piston/head pairs.

| Source issue                                                          | Derived correction                                                                                                                   | What remains fixed                                                                                   |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| Ten pistons cross small lower-bore corners around bottom dead centre. | Ten finite coaxial reliefs, radius 42.25 mm, axial coordinate 88–104 mm along the existing bank axes.                                | Bore axes, source piston radius 42 mm, upper 43 mm block bores, block exterior and bearing geometry. |
| All twelve crowns cross the source head deck near top dead centre.    | Machine only material above a plane 38.5 mm from the original piston pin along the bank axis; original compression height was 40 mm. | Pin location, connecting-rod closure, skirt, ring grooves and all rigid motion transforms.           |

These corrections are geometric reconciliation for the demonstration. They are not manufacturing drawings or validated hot-running clearances.

## Native solid evidence

`references/00_Active_V12/clearance-verification/native-clearance-audit.json` records source hashes, dimensions, Boolean validity, volume and export metadata.

- The initial clearance correction produces thirteen valid closed native solids. The final mounting-stage pack contains sixteen valid closed native solids.
- Each lower-bore relief removes approximately 5.0362 mm³, for a total 50.3620 mm³. The original block is approximately 10.973 million mm³. Direct removed-solid volumes are authoritative; subtracting two large native volume integrals has a small numerical integration residual.
- All removed patches lie above native Y = 91.2213 mm. They are at least 31.2213 mm above a conservative main-bearing envelope Y ≤ 60 mm, which contains the native 38 mm-radius crank bearing seats.
- The removed patches have zero native volume overlap with each of the other eleven finite 43 mm-radius source bores (axial 101–214 mm). These separation checks do not establish block strength or manufacturing suitability.
- The crown cut removes approximately 4,342.429 mm³ per piston. The highest source ring groove is at 30.8 mm; the derived crown stays 7.7 mm above it. No piston was shifted relative to its pin or scaled to conceal contact.

The crown cut adds approximately 4.34243 cm³ per cylinder to the chamber clearance volume. Any geometry-derived compression ratio or chamber occupancy must account for this change. Bore, stroke and swept displacement are unchanged. The valvetrain proof based on the original higher crown remains conservative.

## Runtime geometry and ownership

`loadV12ClearanceGeometry()` in `src/lib/scene/v12-clearance-geometry.ts` loads a checked manifest and SHA-256-verified binary, then returns sixteen owned display-coordinate `BufferGeometry` instances. The caller replaces the matching source meshes, registers the same meshes for picking and section caps, updates bounds and disposes replacements with its scene. The purchased GLB is not rewritten.

The loader rejects missing/duplicate body IDs, overlapping buffer ranges, invalid coordinates, out-of-range triangles and checksum mismatches. The combined mounting/clearance binary is approximately 25.6 MB. It includes the block (134,984 triangles), two heads (approximately 241,000 triangles each), timing cap (69,892 triangles), and twelve unchanged corrected piston meshes (approximately 45,542 triangles each). Native tessellation uses 0.075 mm/0.18 rad for the four housings and 0.1 mm/0.25 rad for pistons. Native face boundaries remain separate for correct sharp-edge shading.

`V12_CLEARANCE_CORRECTION` provides the same dimensions to chamber occupancy and explanation code. The replacement geometry is expressed in the original immutable source display frame; existing rigid kinematic matrices apply directly.

## Verification

The scoped loader tests verify the complete body set, checksum, source pin reference, derived crown height, retained skirt depth within meshing tolerance, and rejection of corrupt geometry.

The authoritative final certificate is `references/00_Active_V12/clearance-verification/final-geometry-clearance-audit.json`, also published at `/models/v12-clearance-audit.json`. It verifies the actual sixteen-body runtime binary with SHA-256:

`5f35f657addc4a1c1b891c1cde2b95d34365b04bf14f119df89962975e2d3f49`

All 24 pairs pass with a certified continuous mesh separation **greater than 0.100 mm**:

- **Twelve piston/block pairs:** 361 sampled crank positions each show no intersections. An adaptive partition of the entire 100 mm piston travel then certifies every intermediate translation with 1,804 distance queries. For each interval, an exhausted BVH search establishes separation beyond the interval half-width plus the required clearance.
- **Twelve piston/head pairs:** every actual Float32 piston vertex at both travel extremes lies inside every face halfspace of a conservative closed full-stroke polyhedron. Convexity therefore contains all piston triangles throughout travel. A thresholded distance query separates that complete envelope from its actual final head mesh. All twelve envelope proofs pass.
- **Independent final-mesh cross-check:** `final-runtime-clearance-audit.json` also completes the direct adaptive translation method for all 24 pairs, with 1,816 queries and zero sampled intersections or unresolved intervals. It references the same binary hash.

The thresholded BVH search certifies only its exhausted search radius, not the larger distance of a returned candidate pair. An early-out witness inside the search radius cannot certify an interval. These semantics have targeted regression tests in `clearance-certificate.test.ts`. No exact global minimum gap is claimed. This is a cold runtime-mesh clearance proof; it does not establish manufacturing tolerances, thermal distortion, lubrication clearance or unrelated component contacts.

The preceding thirteen-body stage is retained separately in `runtime-clearance-audit.json`. Its 361-angle source comparison finds 411 sampled piston/block intersections and 238 piston/head intersections, versus zero after correction. Its own continuous certificate refers to that earlier asset hash; it is historical evidence, not a substitute for the final proof above.

An independent native proof, `native-head-sweep-audit.json`, verifies containment of every corrected piston in a full-stroke cylinder enlarged by 0.1 mm radially and axially. All twelve such envelopes have zero common volume with their matching source heads and at least 0.400 mm native separation, covering every intermediate position. This is a cold-geometry result, not a hot-running tolerance allowance.

The rendered source/derived comparison is `references/00_Active_V12/clearance-verification/crown-before-after.png`. Both views use identical cameras and scale, showing the original deck crossing and the derived gap at top dead centre.

## Reproduction

1. Run `extract-native-pistons.py` from the repository root with the existing OCP environment to cache the purchased STEP occurrences. It reads source placements and never modifies the source.
2. Reuse the native placed block at `work/source-renderer/flow-cad/000-cylinder_block.brep` (the existing source-cache extractor is `work/source-renderer/extract-flow-cad.py`).
3. Run `build-clearance-geometry.py` with OCP and NumPy. It writes native derived solids, runtime assets and the provenance audit.
4. Run `verify-clearance.mjs` with Three.js and `three-mesh-bvh`. Set `CLEARANCE_BVH_MODULE` if that audit dependency lives somewhere other than the task’s existing audit environment.
5. Run `verify-native-head-sweep.py` for the independent native continuous head-clearance proof.
6. Apply and pack the documented timing-guide support corrections using the scripts in `references/00_Active_V12/timing-verification/`.
7. Run `verify-final-clearance.mjs` against the published sixteen-body asset. Its four partial records preserve progress; `final-runtime-clearance-audit.json` is written only after all 24 direct checks complete.
8. Run `verify-final-head-envelopes.mjs`, then `combine-final-clearance.mjs`. The combiner checks complete, contiguous block partitions, twelve head envelopes and a common actual asset hash before publishing the final certificate.
9. Run `src/lib/scene/v12-clearance-geometry.test.ts` and `src/lib/engine/clearance-certificate.test.ts`.

The runtime asset contains licensed source-derived geometry and must follow the purchased model’s distribution terms.

## Mounting-stage provenance

The final sixteen-body pack adds the bounded local mounting corrections described in [Timing guide mount reconciliation](V12_TIMING_MOUNT_RECONCILIATION.md). All twelve piston mesh payloads are byte-identical to the clearance-audit stage. Block mounting tools remain beyond native Z594 mm, 14.9 mm beyond the conservative swept-piston envelope; head mounting corrections are farther away. The mounting export records both stage hashes and the unchanged piston payload hashes. Local native-tool bounds and protected-region verification document the edit locality. The final continuous certificate above independently checks the completed mounted geometry itself; no clearance conclusion depends on assuming that tessellations are identical.

A final two-sided vertex-to-surface check below native Z590 mm compares the mounted block mesh with the clearance-stage mesh: 218,674 queries, maximum difference 0.01111 mm. This supports the bounded native-edit evidence; it is explicitly a vertex/surface check, not a new whole-triangle continuous-motion proof.
