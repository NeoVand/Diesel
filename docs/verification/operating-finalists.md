# Operating-load finalist audit

The current nominal search finds a **249.768 g** candidate against the **313.877 g** reference rod: **20.425% less authored-solid mass**. This is a candidate from an assumed-load study, not an accepted rod design. Its independent full-solid check exposes a tradeoff and initially fails a mesh-refinement gate. A subsequent third mesh resolves that integral-response gate, as recorded below, without qualifying local strength or service life.

The machine-readable evidence is [operating-finalists.json](./operating-finalists.json). It records all operating assumptions, geometry, force and inertia requests, solver metrics, convergence reports, predicted bearing reactions, and source-file hashes. The four native API requests were executed sequentially with refinement enabled.

## Conditions and search

The search evaluates 500 combinations of flange width, total depth, web thickness and flange thickness. The reference uses 20 / 16 / 4 / 3 mm; the candidate uses 14 / 12 / 2 / 5 mm. The latter has only 2 mm between the two thick flanges. This geometry is within the authored family, but manufacturing and minimum web-height requirements are not search constraints.

Three explicit illustrative conditions are used: 800 rpm with reduced firing pulse, the reference pressure scenario at 1800 rpm, and the same reference pressure at 3000 rpm. Pressure and piston assembly mass are assumptions, not measurements of the purchased engine. Screening uses 121 phases per condition; the lightest passing candidates are independently recomputed at 721 phases. The nominal free-shank axial/in-plane-bending maximum is 222.113 MPa for the reference and 247.048 MPa for the candidate, compared with an assumed 250 MPa nominal limit.

The native solid analysis includes the selected small-end force and distributed D'Alembert rod inertia. The big bore is constrained. This is a linear-elastic fixture study, not a bearing-contact model of an installed operating engine.

## Independent native results

| Geometry  | Critical case             | Interior P95 | Interior P99 | Maximum displacement | Displacement change on refinement | Integral refinement gate |
| --------- | ------------------------- | -----------: | -----------: | -------------------: | --------------------------------: | ------------------------ |
| Reference | Compression, 4°, 1800 rpm |   225.93 MPa |   232.24 MPa |             94.55 µm |                            0.092% | Within tolerance         |
| Candidate | Compression, 4°, 1800 rpm |   247.68 MPa |   250.86 MPa |            109.18 µm |                            0.664% | Within tolerance         |
| Reference | Tension, 361°, 3000 rpm   |    42.38 MPa |    43.61 MPa |             28.99 µm |                            5.933% | Within tolerance         |
| Candidate | Tension, 361°, 3000 rpm   |    45.70 MPa |    46.38 MPa |             38.94 µm |                        **8.061%** | **Review required**      |

Peak nominal stress and peak compression occur at the same scenario and angle, so their native requests are deduplicated. The comparison contains four distinct solves, each with two meshes.

Candidate displacement increases by approximately 15.5% in compression and 34.3% in tension. Its tension displacement change exceeds the solver's 8% integral-response screening threshold. Stress percentiles do not prove local stress convergence or maximum-stress acceptance. Raw element peaks are 282 MPa and 435 MPa under compression for reference and candidate respectively, but the sharp fixture and shoulder geometry makes these diagnostic values unsuitable as standalone acceptance criteria.

The native total reaction agrees with the analytically predicted big-end force within 0.0097% in all four cases. This checks the force/inertia handoff; it does not validate the pressure assumptions or physical bearing constraints.

### Third-mesh follow-up

[Separate deeper-refinement evidence](./rod-solid-deep-refinement.json) preserves the original two-mesh comparison and adds a third mesh to the candidate tension case. Target sizes of 2.6 / 1.82 / 1.274 mm give maximum displacements of 35.797 / 38.936 / 40.742 µm. The last pair differs by 4.433% in displacement and 3.993% in strain energy, satisfying the unchanged 8% integral-response gate. The finest mesh contains 77,586 tetrahedra. Its interior P95 is 45.678 MPa.

Using this additional evidence changes the comparison status from `needs-refinement` to `comparison-only`. The latter explicitly does not mean safe, approved or fatigue qualified. The still-rising displacement and local stress sensitivity support continued convergence assessment before engineering use. The baseline has not received a corresponding third mesh, so the original table remains the consistent two-level comparison; its values are not silently replaced by mixed-resolution numbers.

## Acceptance language

Suitable: “The bounded nominal search found a 20.4% lighter candidate. Independent solid analysis shows greater deformation. A third mesh resolves the initial tension-case integral-response check, while local strength, contact and fatigue remain unqualified.”

Unsuitable: “A validated 20.4% mass improvement,” “optimized production rod,” “safe,” or “fatigue qualified.” Neither this candidate nor the baseline is established as a production design. There is no measured pressure calibration, material certification, contact solution, fatigue-life prediction, or manufacturing qualification.

The next acceptance step is to establish stronger convergence evidence and inspect shoulder and bearing regions under improved boundary conditions. Further refinement alone cannot correct an inappropriate fixture or substitute for real load and material evidence.

## Implementation audit

The operating dynamics use centre-of-mass force balance and moment balance, consistent with [University of Illinois rigid-body kinetics](https://mechref.engr.illinois.edu/dyn/reg.html). Exact authored-solid mass properties agree independently with OpenCascade. Tests also check gas work against crank work plus kinetic-energy change, and nominal section forces against independent integration of distributed inertia.

The UI snapshots the selected scenario and design before asynchronous work; revision checks reject late responses. Its comparison mapping correctly finds compression, tension and nominal-stress critical cases across all three conditions. Inspection restores the solved scenario and speed, rather than applying an old force to the currently edited scenario.

Two state-presentation risks were reported to the UI owner during this audit: clearing or explicitly archiving old comparison rows when assumptions change, and distinguishing a previously solved field from the newly selected crank phase. These are UI integration findings, not changes to the recorded numerical evidence.
