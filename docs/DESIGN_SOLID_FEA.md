# Native three-dimensional rod elasticity

The design lab now has an actual solid finite-element solver for the generated rod family. It reconstructs the OCCT solid, creates a tetrahedral volume mesh with Gmsh, assembles three-dimensional linear elasticity with scikit-fem, solves the restrained sparse system, and returns the computed displacement and stress fields. It does not obtain these fields by bending the display mesh or rescaling the earlier beam solution.

This is an explicitly defined **fixed-bore fixture study**. Its supports, prescribed bearing traction and assumed material remain essential parts of every result. Solid FEA is a higher-dimensional model, not automatic certification of an engine component.

## Geometry, material and finite elements

The domain is the same exact rod family used by [native STEP export](DESIGN_CAD_EXPORT.md): two eyes, through-bores and a layered I-section joined into one solid. The original purchased engine is not modified. Sharp shoulder transitions, the unsplit big eye and absent bolts/bushings are retained as declared simplifications. No cosmetic fillet is silently substituted into the analysis.

The material is assumed homogeneous, isotropic steel: E = 210,000 MPa, ν = 0.3 and density = 7,850 kg/m³. The implementation uses four-node, constant-strain tetrahedra. Coordinates and displacement are in mm, forces in N, stress in MPa and strain energy in N·mm. The mesh domain must agree with exact CAD volume within 1.5%; the recorded baseline error is much smaller.

Each geometry change rebuilds the solid and mesh. Gmsh performs tetrahedral generation and mesh optimization. The restrained stiffness matrix is solved directly for smaller problems; larger ones use preconditioned conjugate gradients with an algebraic multigrid preconditioner and six rigid-body near-nullspace vectors. A failed residual or reaction check returns an error, not a substitute visualization. Primary implementation references: [Gmsh manual](https://gmsh.info/doc/texinfo/), [scikit-fem three-dimensional elasticity](https://scikit-fem.readthedocs.io/en/latest/listofexamples.html#example-11-three-dimensional-linear-elasticity), [SciPy conjugate gradients](https://docs.scipy.org/doc/scipy/reference/generated/scipy.sparse.linalg.cg.html).

## Supports and applied loads

All three displacement components are fixed on the complete big-end bore surface. The small-end bore receives a cosine-weighted prescribed traction over its loaded half. Facet forces are normalized to the requested resultant and distributed consistently to their three nodes. This is not a solved bearing contact-pressure distribution.

Rod-local Y points from the big eye toward the small eye; Z follows the bearing axes. The artificial fixture scenario maps the existing controls to `[0, -loadKn × 1000, lateralLoadN]`. Its end-applied load and fixed support differ from the simply supported, centrally loaded beam screen. Those two results must not be described as identical-boundary-condition validation of one another.

A selected operating-cycle state can instead supply its own local force vector and rigid-body acceleration field. The solver then includes the D'Alembert body load

`−ρ [a₀ + α × r + ω × (ω × r)]`

throughout the rod. The origin is the big-eye centre; r is converted from mm to m before calculating acceleration. Integration of the linear acceleration field uses the consistent tetrahedral shape-function integral, rather than assigning a point load to the centre of mass. This includes the body-force resultant and the angular inertia moment. A single display arrow for net inertia force cannot represent the inertia couple by itself.

These selected-phase calculations remain elastic fixture snapshots. The support does not become an actual bearing contact simply because the applied forces came from the cycle model. Pressure history, piston mass and operating conditions are explicitly assumed; elastic transient dynamics, contact and material nonlinearity are not solved.

## Result fields and stress interpretation

The shared TypeScript contract is `src/lib/design/structural.ts`. Results contain:

- Geometry and analysis hashes, input parameters, the applied load case, material and solver versions.
- Actual exterior mesh vertices and triangles, displacement vectors and fixture/loaded-node memberships.
- A recovered surface von Mises field for display. Adjacent element stress tensors are volume weighted before the invariant is calculated.
- Separate volume-weighted element stress percentiles, including P95 and P99 over the complete domain and over an interior shank region.
- Raw element maximum stress as a diagnostic, displacement, energy, reaction forces/moments, body-force resultant and solver residual.
- Optional refinement comparisons and explicit assumptions/limitations.

The interior region excludes both eye/shoulder zones by `max(rodDepthMm / 2, 6)` mm beyond their outer radii. That region is fixed for a given geometry, so its definition does not change between refinement levels.

Sharp shoulders and idealized restraints can create mesh-dependent peaks. **The raw maximum is not a strength criterion.** Percentiles reduce sensitivity to isolated peaks but do not establish allowable stress, fatigue life or structural safety. Surface smoothing is for interpretation; it does not replace the element statistics. Deformation magnification in the viewer is a presentation setting, never a change to the computed displacement.

## Refinement and numerical checks

The standard request solves one mesh. `refine: true` solves a second mesh with a target size 0.7 times the first and returns the finer field. An explicit `refinementLevel: 1 | 2 | 3` overrides that legacy flag; level 3 solves targets `h`, `0.7h` and `0.49h`. All mesh statistics remain in the report, and comparison values always use the final two meshes. The report compares maximum displacement, strain energy and interior P95 stress. A declared 8% displacement/energy comparison is a screening indicator. These comparisons do not establish an asymptotic convergence order, and a passing comparison does not certify local peak stress.

The operating candidate's tension case initially failed that displacement indicator at **8.061%**. A real third mesh reduced the final-pair displacement change to **4.433%** and energy change to **3.993%**, with 18,627 nodes and 77,586 tetrahedra. The three displacement values were 35.797, 38.936 and 40.742 µm. That run completed in 6.64 seconds locally. The screening threshold was unchanged; the result establishes improved integral resolution, not acceptance of the candidate or convergence of sharp-edge stresses. The 28-second timeout and mesh caps also apply to deep refinement.

The native verifier at `src/lib/server/cad/verify_elasticity.py` includes:

| Check                                | What it establishes                                                                                                                           |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Distorted tetrahedral affine patch   | Reproduces a known full strain/stress tensor and prescribed displacement field on an irregular mesh                                           |
| Four-level solid cantilever sequence | Exercises bending accuracy and refinement; the finest 103,680-element model is within 3.67% of the slender bending-plus-shear beam comparison |
| Load scaling                         | Doubling a fixed-direction traction doubles displacement and quadruples strain energy                                                         |
| Uniform acceleration resultant       | Consistent volume loading integrates to `−mass × acceleration`                                                                                |
| Native mass, COM and polar inertia   | OCCT properties independently agree with the analytical mass properties used by cycle dynamics                                                |
| Rod refinement                       | Compares actual rod volume meshes, responses and reaction equilibrium                                                                         |

The affine patch's recorded maximum displacement error is approximately 1.7 × 10⁻¹⁷ mm and stress error 2.1 × 10⁻¹² MPa. These verify numerical implementation, not experimental agreement. The coarse cantilever is deliberately retained in the report: linear tetrahedra can be substantially too stiff in bending before adequate refinement. The beam comparison also has different three-dimensional end effects, so it is not treated as an exact solid solution.

For the baseline 125/20/16/4/3 mm rod with the artificial 25 kN / 1,000 N fixture load, the recorded finer mesh has 3,783 nodes and 11,883 tetrahedra. Maximum displacement is approximately 0.317 mm. Coarse-to-fine maximum displacement changes by approximately 2.43% and energy by 0.68%; force and moment equilibrium residuals are around 10⁻¹³. The stronger displacement than the beam screen is expected to require interpretation because the fixture, effective span and loading differ.

A separate live check passed for a thin-web, long rod with 14,885 nodes and 52,936 tetrahedra. Its two-mesh displacement change was approximately 0.67%, energy change 0.44%, and native work completed in approximately four seconds on the current machine. Timings are measurements for this environment, not cross-device performance promises.

## Operating-cycle coupling evidence

At the illustrative cycle's 45° state, the native model received both the local small-end force and the angular/origin acceleration fields. The native big-bore reaction differed from the analytical big-pin force by approximately **0.00348%**. Its residual support moment, normalized by pin-force magnitude times rod length, was approximately **0.00719%**. Small differences are expected from curved-surface faceting and traction integration. This checks coherent force/inertia transfer between the two models; it does not validate the assumed pressure trace or real engine stresses.

Evidence files:

- [Native patch, beam, scaling, inertia and refinement results](verification/rod-solid-elasticity.json)
- [Actual third-mesh operating tension refinement](verification/rod-solid-deep-refinement.json)
- [Live cycle-to-solid reaction comparison](verification/rod-solid-cycle-coupling.json)
- [Live endpoint and bounded-work checks](verification/rod-solid-http.json)

## API and native environment

`POST /api/design/rod-analysis`, with JSON:

```json
{
	"params": {
		"rodLengthMm": 125,
		"rodWidthMm": 20,
		"rodDepthMm": 16,
		"webMm": 4,
		"flangeMm": 3,
		"loadKn": 25,
		"lateralLoadN": 1000
	},
	"refine": true
}
```

The complete `DesignParams` object is accepted. An explicit `loadCase: { forceN: [x,y,z], label, inertia? }` overrides the artificial fixture controls. Optional inertia contains `originAccelerationMps2`, `angularVelocityRadS` and `angularAccelerationRadS2`, each a three-component vector resolved in the current rod-local frame. Input validation bounds the geometry and forces and rejects nonfinite values.

The endpoint limits input to 8 KiB, one concurrent native analysis per Node process, a 28-second worker deadline, 45,000 mesh nodes and 160,000 tetrahedra. Temporary files are removed. Native arguments are fixed paths; request data travels through stdin. Raw worker output is not exposed. Busy, invalid, unavailable, unverified and timed-out work returns 429, 400, 503, 422 and 504 respectively. Cross-origin and oversized requests are also rejected.

`DESIGN_STRUCTURAL_PYTHON` can select a dedicated runtime; otherwise the service uses `DESIGN_CAD_PYTHON`, a local `.venv-cad/bin/python`, or `python3`. Dependencies are pinned in `src/lib/server/cad/requirements.txt`. They were installed in the existing task-scoped audit environment, not added to the browser bundle or pnpm dependencies. The current deployment image does not automatically contain this environment; provisioning native CAD/meshing/scientific Python is required for hosted analysis.

Reproduce the native checks with that interpreter:

```sh
OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 "$DESIGN_CAD_PYTHON" src/lib/server/cad/verify_elasticity.py
pnpm exec vitest run src/lib/server/design-structural.test.ts src/lib/server/design-structural-route.test.ts --project server
```

Further work should address fillets, real bearing/contact conditions, material identification, mesh/error studies and validation loads before interpreting these results as design acceptance. The current solver has no plasticity, fatigue, thermal stress, buckling, acoustic or combustion capability.
