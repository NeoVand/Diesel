# Parametric design lab

The implemented workspace is **[/design](http://127.0.0.1:5173/design)**. It combines an adjustable mechanism, a generated connecting-rod family, structural screening, operating-cycle dynamics, bounded design searches, native three-dimensional elasticity, and exact CAD verification/export. The Operating loads panel connects these steps and provides an evidence-based design assistant. The purchased engine remains available in the main explorer at `/`; its source geometry is not overwritten by design experiments.

## What can be changed

The mechanism starts from the measured concept-engine baseline: 85 mm bore, 100 mm stroke, 125 mm connecting-rod length and twelve cylinders. These dimensions give approximately 6.81 L swept volume. Bore, stroke, rod length and speed drive displacement, mean piston speed, rod angle and instantaneous piston velocity/acceleration calculations. RPM is an input to this analytical study, not a verified operating rating of the purchased engine. The original beam screen still has independently specified fixture loads. The Operating loads study separately combines an explicit prescribed pressure trace, assumed piston mass, actual generated rod mass/inertia and RPM to compute bearing loads. It does not predict combustion or efficiency.

The rod study changes flange width, total depth, web thickness and flange thickness. The generated part preserves the selected 25/9 mm bearing-hole radii and uses authored 32/15 mm outer-eye radii. Its shoulders, I-section and eyes form a new concept family. It does not reconstruct the purchased rod's original feature history or establish that these changes fit its original block, crankshaft or bearings.

The mechanism renderer derives packaging dimensions, including piston-carrier height, liner position and deck height, from the parameter choices. These are authored accommodation rules for the generated demonstrator. They are not measured production dimensions or a verified redesign of the purchased engine. Packaging and collision checks have a separate scope from linkage closure, rod mass and structural screening.

## Implemented calculation and geometry loop

| Layer                             | Responsibility                                                                       | Implementation                                         |
| --------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| Design interface                  | Parameter changes, comparisons, plots, search, verification and exports              | `src/routes/design/+page.svelte`                       |
| Analytical model                  | Slider-crank kinematics, rod geometry/mass, section properties and screening results | `src/lib/design/design-core.ts`                        |
| Generated packaging               | Piston-carrier, liner, deck and spacing rules                                        | `src/lib/design/design-layout.ts`                      |
| Browser geometry and presentation | Parameter-driven meshes, mechanism motion and study fields                           | `src/lib/scene/design-geometry.ts`, `design-studio.ts` |
| Design search                     | Background enumeration, progress and revision-associated results                     | `src/lib/design/optimization.worker.ts`                |
| Exact CAD                         | OCCT solid construction, measurements, STEP export and reimport checks               | `src/lib/server/design-cad.ts`, `cad/rod_step.py`      |

A change to geometry recomputes section properties and the screening calculation. The worker searches the current case in the background; replies carry their originating revision. Verification and exported cases must remain associated with the parameters that produced them. Fields from an old geometry are not stretched onto a new rod as if their stresses remained valid.

The browser uses tessellated geometry for presentation. The native CAD path independently creates a fused B-rep solid with real through-bores. Both represent the documented union of the eye discs, central web and two flange layers. The mass calculation subtracts eye/rectangle overlaps rather than counting intersecting pieces twice. CAD measurements cover the full generated rod; the structural equations cover only its idealized uniform shank.

## Structural screening

The free-shank span is the rod centre distance minus the two outer-eye radii: 78 mm at baseline. The model uses assumed homogeneous isotropic steel with Young's modulus 210 GPa, Poisson ratio 0.3 and density 7,850 kg/m³. These are declared scenario properties, not identified material grades from the purchased asset.

The nominal loading is a simply supported shank with a central transverse force and compressive axial force. First-order normal stress combines axial and bending contributions. Transverse displacement uses **Timoshenko bending plus shear**, with effective shear area derived from section shear energy. Shear is consequential at this short span: the baseline's approximately 8.570 µm bending displacement gains approximately 3.725 µm shear displacement under the 1,000 N transverse load.

An independently assembled beam stiffness system checks the closed-form displacement with 4, 8, 16 and 32 elements. Agreement verifies the implementation of this idealized problem. It does not establish the accuracy of the complete rod or its supports. The displayed beam frequency is an unloaded pinned uniform-beam estimate including shear and rotary inertia; it is not an assembled engine resonance.

The ideal elastic Euler result is retained only as a reference. For the short baseline shank, its implied critical stress exceeds the assumed material stress threshold, so it is not a credible failure capacity. **Euler buckling is not an optimization feasibility constraint.** Actual instability needs an appropriate material model, imperfections, supports and nonlinear analysis.

The current screening excludes shoulder/fillet stress concentration, bearing contact, cap bolts, thermal effects, fatigue, manufacturing tolerances, second-order amplification and full-solid three-dimensional FEA. The rendering's stress/deformation presentation communicates the shank model and its limits; it does not turn that model into a 3D solid solve. [CAD and structural scope](DESIGN_CAD_EXPORT.md) includes the geometry contract and primary mechanics references.

## Reproducible baseline search

The current optimizer enumerates a bounded four-variable grid: eight flange widths, six depths, five web thicknesses and seven flange thicknesses. That is **1,680 grid points plus the explicit baseline**, or 1,681 evaluated cases. It identifies feasible samples and a mass/compliance Pareto front. It does not claim a continuous or global optimum.

With rod length fixed at 125 mm, assumed axial load **25 kN**, transverse load **1,000 N**, nominal stress limit **250 MPa** and transverse displacement limit **15 µm**, the implemented search gives:

| Quantity                              | Result                                 |
| ------------------------------------- | -------------------------------------- |
| Evaluated cases                       | 1,681, including the explicit baseline |
| Feasible evaluations                  | 1,170, including that baseline entry   |
| Baseline full-solid mass              | 313.8765 g                             |
| Lowest-mass feasible sampled design   | 284.3324 g                             |
| Reduction within this authored family | 9.4126%                                |
| Selected width / depth / web / flange | 26 / 14 / 5 / 2 mm                     |
| Selected nominal normal stress        | 194.8738 MPa                           |
| Selected transverse displacement      | 14.7370 µm                             |

These figures were reproduced directly from the implementation. The baseline also appears in the grid; the explicit comparison entry is included in the evaluation counts. The reported improvement concerns the mass of the generated concept family under its declared screening constraints. It is not a measured reduction in the purchased rod's mass, a manufacturing approval, or a demonstrated engine-efficiency improvement. Changing the loads, limits or geometry changes the search result.

## Independent checks and exports

Verification is deliberately separated by what each check establishes:

- **Mechanism:** full-turn linkage closure and finite-difference comparisons of analytical velocity and acceleration.
- **Section mechanics:** independent thin-slice integration of shear energy in both bending axes and span integration of strain energy, in addition to the assembled beam solver.
- **Browser geometry:** tessellated volume comparisons and through-bore checks for the generated layer geometry.
- **Native solid:** OCCT validity, one connected solid, exact volume, bounds, STEP write/read and round-trip volume agreement for the baseline and all 32 corners of the supported CAD parameter box.
- **HTTP boundary:** actual JSON/STEP responses, parameter identity, input bounds, request size/origin handling and native-job concurrency limits.

The interface can export a case as JSON, request an exact-solid verification report, or download the generated rod as STEP. Native reports include geometry parameters, a schema-specific hash, kernel version, volume, assumed-density mass, bounds and explicit limitations. See [native kernel evidence](verification/rod-cad-kernel.json), [live endpoint evidence](verification/rod-cad-http.json) and [CAD export setup](DESIGN_CAD_EXPORT.md).

Geometry-stage verification on 2026-09-30: **239 unit tests in 41 files and 31 production-build browser tests passed**. This is the historical geometry-stage count; the operating-stage report below records the expanded suite. Type checking reported zero errors and warnings; formatting and lint passed. The browser suite covers the new search, input normalization, displacement locking, phase controls, exports, failed feasibility, stale verification, keyboard dialogs and mobile overflow, together with existing explorer, section, atlas, teaching and AI-control regressions. AI network responses in the browser regression tests are mocked.

Visual review covered desktop and 390 px mobile views, engine playback, parameter extremes, fields, load arrows and native-export results. The field mask and analytical value are evaluated per fragment to avoid irregular color interpolation at the assessed-shank boundary. Dimensions maintain a readable screen size; camera fitting reserves room for controls and preserves orbit during resize. The reference piston is Bank A / station 1, with the plotted phase measured from TDC. The display/reference agreement has direct full-cycle position and derivative checks.

The packaging tests remain distinct from rod solid checks: conceptual rod/liner boundaries are sampled through the cycle, while cross-bank and adjacent envelope checks cover the supported dimensional extremes. Neither establishes production manufacturing tolerances.

## Runtime and remaining engineering work

The interactive calculations and discrete search run in the browser, with the operating search in a dedicated worker. Exact CAD and native structural analysis use the task-scoped Python environment selected by `DESIGN_CAD_PYTHON` or `DESIGN_STRUCTURAL_PYTHON`. Its pinned OCP/Gmsh/scientific-Python dependencies are recorded in `src/lib/server/cad/requirements.txt`. A Node deployment must provide that optional native runtime. Without it, exact verification/export returns a clear unavailable response; browser exploration and case JSON export remain available. The current Docker image does not provision OCP.

The native full-solid linear elasticity solver is implemented. Combustion, flow, thermal, contact, fatigue and calibrated fuel-efficiency models are not. JAX-JS and differentiable FEA/CFD remain research options, not active dependencies. The next stages are robust filleted geometry, representative bearing/contact conditions and materials, local mesh/error studies, and benchmarked thermal/flow work. See the [parametric feasibility study](PARAMETRIC_ENGINE_DESIGN.md) and [multiphysics roadmap](V12_MULTIPHYSICS_ROADMAP.md).

## Operating-stage implementation

See [Operating design verification](OPERATING_DESIGN_VERIFICATION.md) for the pressure, rigid-body mechanics and multi-condition search, and [Native solid FEA](DESIGN_SOLID_FEA.md) for the actual tetrahedral model, boundary conditions, solver checks, limitations and deployment requirements.

The UI now provides a full 720° cycle, pressure and bearing-force traces, phase-linked reference-cylinder force arrows, critical-case selection, native stress/displacement fields, mesh display, explicit deformation amplification, independent baseline/candidate comparisons and a 500-shape operating design map. The original beam-test controls and results remain scoped to the original beam study. Changing geometry or scenario invalidates native results and comparison rows; seeking cancels pending selected-phase solves and hides the previous native field.

Candidate comparison screens three explicit operating conditions, refines nominal finalists from 6° to 1° angular resolution, and solves each geometry at its compression, tension and nominal-stress extrema (duplicate cases are removed). Each native case starts with two meshes; if its integral refinement gate fails, the app requests a third without changing the tolerance. Completed evidence is exported with the actual geometry, pressure assumptions, load vectors, inertia fields, solver data and surface fields. The comparison status never says approved, safe or production validated.

The default nominal candidate is 20.425% lighter (249.768 g versus 313.877 g), with approximately 15.5% greater maximum displacement across the selected native cases. Its initially unresolved tension refinement was resolved by a real third mesh. That establishes comparative numerical evidence, not a qualified design improvement. Sharp transitions, simplified bearing restraints, assumed pressure/materials, fatigue and manufacturing remain open.

Engineering notes uses the existing private Codex runtime and server-side credentials. It receives bounded numerical summaries, the complete set of search conditions and each native case's operating context; it does not receive mesh arrays or credentials. The backend independently recomputes current mass/kinematics and current-cycle loads, and labels submitted search/native evidence separately. The assistant can explain results and remaining checks; it does not silently edit the design or replace the solver.

Operating-stage verification on 2026-09-30: **287 unit tests in 50 files and all 36 production-build browser tests passed**. The updated multi-condition AI-evidence regression passed separately, followed by the native-field and mobile browser checks after the final narrow-screen legend adjustment. Type checking reported zero errors and warnings; formatting and lint passed. Native benchmarks include the affine patch, cantilever refinement, reaction/inertia transfer and actual third-mesh candidate analysis. A live private AI request returned a correctly scoped comparison of the supplied operating cases.

Desktop stress fields, comparison tables, design-map interaction and the 390 px layout were visually inspected. The mobile field legend now occupies a separate strip below the model controls. The [render performance record](verification/design-operating-render-performance.json) records approximately 60 Hz cadence on the tested Apple M4 Metal browser, including the real 500-design worker search. Those short measurements excluded native solver execution and do not guarantee performance on other hardware. The production build retains a large-renderer-chunk advisory.
