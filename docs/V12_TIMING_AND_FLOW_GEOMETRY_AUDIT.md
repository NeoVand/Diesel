# Historical: V12 timing, valve contact and gas-domain audit

> **Source feasibility snapshot.** The recovered native identities, dimensions and original defects below remain source evidence. Statements about missing cover attachments, unresolved valve motion and the next implementation steps describe the earlier audit stage. The [current running-engine release](V12_RUNNING_ENGINE_RELEASE.md), [corrected timing rig](V12_CORRECTED_TIMING_RIG.md) and [valvetrain reconciliation](V12_VALVETRAIN_RECONCILIATION.md) document the subsequent implementation and declared corrections.

Audit date: 30 September 2026. This is a source-geometry feasibility audit, not an approval of running clearances, valve events, chain contact, injection or combustion. No source body was repaired, stretched or replaced, and no new runtime motion was enabled by this audit.

## Inputs and reproducibility

The evidence is the purchased V12 STEP's preserved OCCT audit (`references/00_Active_V12/step-native-audit.json`) and its actual world-baked runtime mesh (`static/models/v12-review.glb`). The generic V12 model is not an OEM production master. Source names such as “injector” and “glow plugs” identify author-supplied parts, not validated fuel-system specifications.

Native millimetres and source phase zero match `src/lib/engine/v12-motion-datums.json`. Positive crank angle turns clockwise viewed from native +Z. The extraction records input SHA-256 hashes.

Run from the repository:

```sh
python3 references/00_Active_V12/timing-verification/extract-timing-datums.py > references/00_Active_V12/timing-verification/summary.json
python3 references/00_Active_V12/timing-verification/extract-valve-datums.py
node references/00_Active_V12/timing-verification/audit-cam-contact.mjs
```

The valve extractor reuses and deterministically regenerates the timing extraction. The mesh audit uses the project's installed Three.js decoder. These scripts need no API key and do not alter purchased assets.

## What the timing geometry establishes

The source contains a complete intended tooth train: a 30-tooth crank wheel drives a 30-tooth idler, which shares its axis with two 20-tooth pinions. Each pinion serves a pair of 40-tooth cam wheels. This establishes an intended 1:1 followed by 20:40 reduction, or half crank speed at the cams. The rigid coupling of coaxial idler/pinions is inferred from geometry; native Fusion joints were not solved.

The counts are independently present in the repeated roller seats and outer cylindrical tooth lands. Their angular spacing residual is below 1e-8 radians. All four cam/wheel axis pairs coincide within 4.4e-12 mm in the retained native audit.

| Assembly       | Actual source IDs                  | Native pivot X/Y, mm     | Intended crank ratio |
| -------------- | ---------------------------------- | ------------------------ | -------------------- |
| Crank wheel    | `v12-0663`                         | 0 / 0                    | 1                    |
| Compound idler | `v12-0664`, `v12-0784`, `v12-0785` | 0 / 125                  | 1                    |
| Cam and wheel  | `v12-0287`, `v12-0289`             | 197.808061 / 259.113611  | 0.5                  |
| Cam and wheel  | `v12-0288`, `v12-0290`             | 125.044189 / 300.082889  | 0.5                  |
| Cam and wheel  | `v12-0285`, `v12-0292`             | −197.357311 / 258.332889 | 0.5                  |
| Cam and wheel  | `v12-0286`, `v12-0291`             | −125.494939 / 300.863611 | 0.5                  |

All axes run along native Z. Exact axial positions and unrounded datums are in `src/lib/engine/v12-timing-datums.json`.

### The chains are not contact-correct in the purchased pose

All 320 individual source links have been mapped to two actual pin axes, source IDs, solid ownership, thickness, ordered neighbors and rest frames. The 332 mapped timing bodies have a maximum native/GLB bounds-centre residual of 0.015469 mm. Pin containment, face ownership, reciprocal adjacency, fixed intralink pitch and a single closed ordering per loop are checked.

| Loop            | Links | Pin spacing, mm | Maximum adjacent-hinge mismatch, mm | RMS mismatch, mm |
| --------------- | ----: | --------------: | ----------------------------------: | ---------------: |
| Primary         |    72 |        5.958122 |                            1.396939 |         0.220671 |
| Positive-X bank |   124 |        5.919063 |                            0.855543 |         0.140075 |
| Negative-X bank |   124 |        5.919063 |                            0.855543 |         0.140075 |

Measured wheel roller-seat chord pitches are 5.958122 mm (30 teeth), 5.944510 mm (20 teeth) and 5.909252 mm (40 teeth). The upper links therefore do not exactly match both their source wheels. Averaging adjacent pins creates a convenient path but does not repair these gaps or prove no-slip contact.

A rigid-link transport prototype must be judged against these measured source defects before runtime integration. It must preserve exact source pose, avoid scaling links, report dynamic hinge residuals and retain continuous drive angle: an individual link does not return to its original location every 720 crank degrees. The current audit does not approve that prototype.

### Nearby fasteners are not automatically rotating parts

The 48 bodies under `bolts/cam` are spread along native Z67–537 mm, around bearing supports; the timing wheels are near Z609–635 mm. These are not established rotating hub bolts. Their source IDs/centres are recorded in the valve audit and must remain static absent attachment evidence. The four separate cam-wheel covers `v12-0657`–`v12-0660` also need attachment evidence before co-rotation.

## Valve motion requires source reconciliation

The source has four real camshafts with 12 lobes each, 48 tappets and 48 valve stems. The tappet axes come from the native 12.5 mm cylindrical faces; stem axes come from 3 mm cylindrical faces. Exact component IDs and axial stations have been recovered. Rotated conservative bounding boxes alone were insufficient for precision: the decoded mesh independently verifies the recovered tappet top plane within 0.000116 mm and axial station within 0.000061 mm.

The source cam mesh was sliced at each actual tappet station. Its two-dimensional section was rotated at 1° cam increments and tested against the actual flat pad plane. This is an unbounded-flat-follower support feasibility screen, not a finite-pad surface contact or dynamic follower solution.

- Source-rest cam/pad separation ranges from −2.869461 mm to +2.585143 mm. Negative denotes overlap.
- Four stations (`v12-1210`–`v12-1213`) have a roughly 2.87 mm overlap. Their support points lie within the pad's radial footprint, so this is not just an out-of-pad support artifact.
- The other 44 stations have separation above 0.1 mm. The screen does not establish that those gaps are intended lash.
- Rotating support excursion is 6.422629–6.568619 mm. **These are not approved valve lift curves.**
- At some sampled angles each lobe's unbounded support contact lies beyond the nominal 13.5 mm tappet outer radius, reaching 15.001989 mm. Finite pad contact must be solved explicitly.
- Tappet `v12-0851` and stem `v12-0855` have a measured native axis offset of approximately 1 mm. Other paired native axes agree within the audit's numerical tolerance. Mesh AABB centre offsets are separately recorded and are not substituted for axis offsets.

A cam-only rotation with frozen valves would hide these unresolved issues. A generic four-stroke lift law would discard actual lobe shape and source phasing. The next valid step is a native cam/flat-pad contact solve, explicit seat/guide association, reconciliation of source rest positions, finite-pad and valve/piston clearance checks, and then verified stem/retainer/spring motion. A designer-approved repaired configuration should be separate from the untouched purchased pose.

## Gas-domain and nozzle feasibility

| Source family             | Runtime IDs            | What is available                                      | What is not established                                                          |
| ------------------------- | ---------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------- |
| Inlet manifold            | `v12-0777`–`v12-0782`  | Six actual wall/body solids                            | Watertight connected air domain, branch/valve-port topology, boundary conditions |
| Exhaust collectors        | `v12-0764`–`v12-0767`  | Four native wall/body occurrences                      | Complete hot-gas domain and turbine-flow continuity                              |
| Additional exhaust bodies | `v12-0768`, `v12-0769` | Two native solids                                      | Port roles and gas-volume connectivity                                           |
| Injector assemblies       | `v12-0775`, `v12-0776` | Two source bank bodies with small cylindrical features | Validated discharge tips, nozzle-hole count, spray cone, pressure or flow rate   |
| Glow-plug assemblies      | `v12-0771`, `v12-0772` | Two source bank bodies; each has six inner shells      | A combustion chamber or useful intake/exhaust fluid volume                       |

The retained native audit contains 12 inner closed shells. **All 12 belong to the two glow-plug bank bodies**, not to a labelled combustion/intake/exhaust gas domain. A closed wall solid is not itself a fluid volume. This audit found no ready-to-use gas-domain artifact; it does not claim that passages cannot be recovered from the source's actual surfaces.

A credible volumetric visualization should be built only after:

1. Recovering actual port loops, opening directions and injector-tip candidates from native faces, and associating them with the correct cylinder and valve.
2. Capping intentional inlet/outlet boundaries and extracting the complementary gas volume with a native Boolean operation; distinguish internal passages from outside free space and plug cavities.
3. Checking connected components, positive volumes, watertightness, wall clearance and source registration; export a gas-domain mesh or signed-distance field.
4. Deriving chamber boundaries from actual head, bore and piston positions, with compression volume and phase-dependent interference checks.
5. Reconciling the valve motion above before presenting valve-gated flow as physical evidence.
6. Defining the intended fidelity: source-contained advected particles/volume rendering can communicate flow; quantitative pressure, temperature, combustion and efficiency require calibrated models, conservation checks and declared boundary conditions.

No nozzle, fluid-domain, valve-lift or pressure/temperature boundary condition should be inferred solely from an attractive animation or a part name.

## Machine-readable evidence

- `src/lib/engine/v12-timing-datums.json`: measured timing axes, tooth counts, all 320 actual link pin pairs, source-rest ordering and limitations.
- `references/00_Active_V12/timing-verification/source-matches.json`: timing native/GLB match residuals.
- `references/00_Active_V12/timing-verification/summary.json`: compact timing extraction summary.
- `references/00_Active_V12/timing-verification/valve-axis-audit.json`: 48 tappet/stem mappings, native axes, source pad stations, static bearing fasteners. **Audit-only; not imported by runtime.**
- `references/00_Active_V12/timing-verification/cam-contact-audit.json`: actual per-valve cam sections, source-rest gap, mesh registration checks and 1° unbounded support samples. **Audit-only; not approved motion curves.**
- `references/00_Active_V12/timing-verification/gas-domain-feasibility.json`: inner-shell owners, source family IDs and required domain derivations.

The previous static timing scope in `docs/V12_MOTION_VERIFICATION.md` remains a useful record. The new tooth/axis findings increase what can be recovered; they do not erase the source contact defects or promote previously unverified mechanisms to verified status.
