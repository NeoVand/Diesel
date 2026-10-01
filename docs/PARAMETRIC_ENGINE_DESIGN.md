# Parametric engine design and optimization

Research date: 30 September 2026. This is a feasibility assessment and proposed build plan. No parametric engine generator, optimizer or new solver was implemented during this research pass. No improvement percentage has been measured.

## Decision

Build a bounded, inspectable engine-design laboratory. A small collection of meaningful dimensions should regenerate mechanically compatible parts, update physical properties, drive analysis, and support a search among feasible designs. Start with one component family, then a power-cylinder family, then coupled engine studies.

The purchased engine remains a useful geometric baseline and presentation assembly. The missing work is recovering or authoring design intent and connecting it to verified physics. Another detailed mesh alone would not supply that work.

This is a rational engineering direction. Published diesel research has used a 23-variable optimization spanning combustion-system geometry, fuel and injection choices. That study also found that some hypothesized fuel-property benefits did not materialize; an optimizer cannot guarantee that a desired improvement exists. [ORNL study, 2025](https://impact.ornl.gov/en/publications/co-optimization-of-fuel-properties-combustion-system-geometry-and/)

## What the source model allows us to claim

Existing audits establish a 60-degree V12, 85 mm bore, 100 mm stroke, 50 mm crank throw and 125 mm rod centre distance. Swept volume calculated from those dimensions is 6.8094 L. The original package includes Fusion F3D, STEP AP214, IGES and polygonal exports. The native audit reports 1,110 distinct valid solids.

A read-only inspection of the F3D archive found sketch, extrusion and revolve feature identifiers, alongside joint-related records. Specifically, `FusionAssetName[Active]/FusionDesignSegmentType1/BulkStream.dat` contains `DcSketchMetaType`, `DcExtrudeFeatureMetaType` and `DcRevolveFeatureMetaType`. This is evidence of feature content, not proof of a healthy editable timeline or named user parameters.

The first CAD task is to inspect a working copy in Fusion: enumerate design type, parameters, timeline features, references and feature health; change one controlled dimension; recompute; compare geometry; restore. Autodesk exposes the relevant design objects and distinguishes direct from history-based modeling. [Modeling modes](https://help.autodesk.com/cloudhelp/ENU/Fusion-Designs/files/ASM-DESIGN-MODELING-MODES.htm), [Design API](https://help.autodesk.com/cloudhelp/ENU/Fusion-360-API/files/fusion_Design.htm)

If useful history is unavailable, rebuild selected component families against measured datums. CadQuery provides an alternative for reproducible component generators and constrained assemblies; it does not automatically recover the original design intent. [CadQuery assemblies](https://cadquery.readthedocs.io/en/stable/assy.html)

Do not state that a percentage of the whole assembly is already parametric. Report which families rebuild correctly, which parameters are independent, and what ranges have passed checks.

Local source evidence: `references/00_Active_V12/V12_NATIVE_AUDIT.md`, `metadata.json`, `analytic-mechanism.json`, and `docs/V12_MOTION_VERIFICATION.md`.

## Parameter families and progression

| Family                | Candidate independent parameters                                               | Dependencies and scope                                                                                                                                |
| --------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rod, first release    | Shank width/depth, web/flange thickness, transition radii; about 4–6 variables | Preserve bore interfaces, centre distance, material scenario and mating envelope. Recalculate mass, inertia, stiffness and structural response.       |
| Flywheel and damper   | Rim radii/thickness, hub dimensions; damping/stiffness parameters              | Update inertia and stress as well as torsional response. Preserve shaft and fastener interfaces. Damper coefficients need an explicit physical model. |
| Power cylinder        | Bore or stroke ratio, rod ratio, compression height, crown/bowl profile        | Regenerate piston, liner and local crank/block/head interfaces. Enforce displacement, deck relation, clearances and chamber volume.                   |
| Cranktrain            | Journal dimensions, web thickness, counterweight outline, station spacing      | Maintain journal alignment and paired-rod fit; update mass distribution, balance, flexibility and swept envelopes.                                    |
| Ports and manifolds   | Passage diameter, length, bends, plenum dimensions                             | Generate actual fluid volumes; preserve seals, wall thickness and packaging. Define operating conditions and flow-model scope.                        |
| Cooling and structure | Selected channel, wall and rib dimensions                                      | Require material, pressure/thermal boundary conditions and manufacturability constraints.                                                             |
| Architecture, later   | Cylinder/valve count, bank angle, turbo arrangement                            | Different topology and model structure; treat as separate design families or discrete choices rather than smooth variations of the existing mesh.     |

Operating controls such as injection timing, boost and coolant flow are another variable class. Materials are another. Keep geometry, controls, uncertain inputs and discrete design choices distinct in the case definition.

## Geometry must remain a mechanism

Use a master layout containing crank axis, cylinder axes, journal/bearing interfaces, cylinder stations, deck planes and component envelopes. Author dependent dimensions around that layout.

For cylinder count N, bore B and stroke S:

\[
V_d=N\frac{\pi B^2}{4}S.
\]

At fixed displacement and cylinder count, bore and stroke cannot both be independent. Increasing this model's bore from 85 to 90 mm requires a stroke of 89.1975 mm to retain 6.8094 L. Mean piston speed at a fixed RPM falls by approximately 10.80%. This is a geometric consequence, not an efficiency prediction.

For a centred slider-crank with crank radius r, rod centre distance L, piston compression height h and deck clearance c:

\[
S=2r,\qquad H_{deck}=r+L+h+c.
\]

The deck relation assumes that cylinder axis passes through the crank axis and the dimensions use the same reference planes. A change to stroke or rod length must propagate through this relationship. Compression ratio likewise requires an actual clearance volume: CR = (swept volume per cylinder + clearance volume) / clearance volume. A chamber-volume change must reach the geometry and the thermodynamic model together.

Longer stroke is not independently a torque gain at fixed displacement and brake mean effective pressure. For a four-stroke engine, cycle-mean torque is BMEP × total swept volume / (4π). Actual BMEP changes depend on filling, combustion and losses, which must be solved.

Each candidate needs one authoritative identity tying together solid geometry, display tessellation, component IDs, mass properties, analysis mesh, boundary tags and results. A visual morph can preview a candidate; it must not be presented as a solved intermediate geometry unless it was evaluated.

## Define what better means

A useful eventual engine brief is: retain the chosen displacement and package, deliver the required output over a specified duty cycle, and reduce fuel use and vibration while meeting mechanical and thermal limits.

- Define multiple speed/load conditions and time weights. For duty-cycle fuel consumption, integrate fuel mass and delivered work consistently; do not average pointwise efficiencies arbitrarily.
- Hold required torque/work fixed so lower output cannot masquerade as improved efficiency.
- Distinguish indicated efficiency from brake efficiency. Fuel-consumption and brake-output comparisons require friction, pumping and accessory losses at the stated boundary.
- State allowed peak pressure, pressure-rise rate, temperatures, stress, deflection, bearing loading, piston speed, minimum thickness and clearance where the selected models can evaluate them.
- Define stability explicitly: torsional resonance, combustion cycle variability, turbocharger surge and thermal behavior are different phenomena with different models.
- Separate physical design limits from numerically convenient bounds. Avoid turning an arbitrary slider maximum into an engineering limit.

Use a Pareto set: designs for which one objective cannot improve without worsening another within the evaluated set. Let the viewer choose among mass, response and efficiency tradeoffs. Mark proposed, evaluated, rejected and reference-checked candidates distinctly. A finite search produces the best candidates found, not proof of a global optimum.

Published work demonstrates why coupled objectives matter. One experimental bore/stroke study reports competing heat-transfer, breathing and friction effects under fixed displacement and compression ratio. Its preferred geometry applies to its tested cases. [SAE 2013-24-0065](https://saemobilus.sae.org/papers/experimental-investigation-effect-bore-stroke-ratio-a-diesel-engine-2013-24-0065)

Sandia's dimpled-bowl study provides a particularly useful lesson: stronger flow structures did not deliver the expected efficiency gain across conditions, and wall heat transfer increased. A visually dramatic vortex is not itself an efficiency objective. [Sandia study](https://www.sandia.gov/research/publications/details/effects-of-a-cfd-improved-dimple-stepped-lip-piston-on-thermal-efficiency-a-2022-08-08/)

## First complete optimization demonstration

**Design question:** minimize the mass of a connecting rod with unchanged bearing interfaces and centre distance, subject to specified structural and manufacturing constraints.

1. Reproduce the source rod's interface geometry and establish a parametric shank/transition family.
2. Choose an explicit elastic material scenario. Derive mass and inertia from each candidate's solid geometry.
3. Define representative tensile/compressive loads and bearing-load distributions. Initially these may be stated bounding cases. Later couple cylinder pressure and geometry-dependent inertia loads.
4. Solve displacements, stresses and elastic modes. Screen compression stability with a suitable buckling analysis. Linear eigenvalue buckling is an initial screening metric, not proof of collapse strength with imperfections.
5. Search approximately 4–6 geometric variables with minimum thickness, envelope, stiffness, stress and buckling constraints. Keep load cases and acceptance definitions fixed for comparison.
6. Plot mass against stiffness or dynamic response. Show the active constraint that prevents further removal of material.
7. Rebuild and remesh shortlisted designs independently; confirm selected results at finer mesh resolution and check relevant load cases. Recalculate mass-dependent loads when the study includes inertia.
8. Return the selected rod to the engine with its generated geometry, measured mass and result manifest.

This demonstrates real geometry optimization without requiring a calibrated diesel combustion model. It supports a much narrower claim than a fatigue-qualified production rod. Fatigue life would additionally require material fatigue data, surface/size effects, mean-stress treatment, load spectra and other applicable assumptions.

The next demonstration can optimize a flywheel/damper family across a speed range. More inertia may reduce one response while changing resonances or transient behavior elsewhere; preserve the competing metrics.

## Combustion design requires another level of evidence

A prescribed heat-release cycle can compare compression ratio, volume histories and selected thermodynamic scenarios. It cannot infer the benefit of a new piston-bowl contour unless geometry changes the mixing/combustion model or a calibrated approximation. Otherwise the optimizer searches a model that is blind to the very shape being changed.

The research route is to establish a measured cylinder benchmark, verify baseline predictions, then investigate a bounded family of bowl and injector-targeting choices with appropriate CFD and experiments. A parameter change outside the calibration range is a prediction requiring further evidence.

Sandia ECN publishes research-cylinder geometry, bowl profiles, crank-slider information, valve lift/flow and injection targeting. These complement the pressure/injection/heat-release archives already collected. The CFD page also notes limitations of sector meshes for reproducing observed flow; axisymmetric or periodic simplifications need case-specific justification. [ECN geometry and inputs](https://ecn.sandia.gov/engines/small-bore-diesel-engine/cfd/)

Maintain two explicit model identities: the purchased V12 design family, and the separate ECN reference cylinder. An ECN-calibrated combustion study is not automatically a calibration of the V12. Transferring a concept produces a new design scenario with new packaging, flow and thermal questions.

Four additional public workbooks were downloaded to `references/01_Benchmarks/ECN_Small_Bore/Geometry_Inputs/`: bowl profiles, crank-slider information, valve lift and valve flow coefficients. Their manifest records original URLs, SHA-256 hashes and sizes. XLSX archive integrity was checked; numerical contents have not yet been analyzed. No full geometry download or calibration was performed in this pass.

## Browser compute and the optimization loop

The implementation should have three cooperating layers:

1. **Browser:** interactive mechanism geometry, compact cycle/shaft/thermal models, batches of candidate evaluations, local sensitivities, uncertainty exploration and result visualization. JAX-JS is a candidate compute layer; benchmark CPU and GPU on the actual workload.
2. **Geometry and reference analysis service:** authoritative solid generation, validity/clearance checks, meshing and higher-fidelity FEA/CFD/cycle calculations.
3. **Experiment controller:** candidate selection, objective/constraint evaluation, provenance, model-error checks, caching and reference verification of finalists.

JAX-JS supplies differentiation and numerical arrays. Differentiating an implemented approximation gives derivatives of that approximation; it does not establish correctness of the physics or differentiability of arbitrary CAD rebuilds. Its operation and precision limits still apply. [JAX-JS](https://github.com/ekzhang/jax-js), [capabilities](https://github.com/ekzhang/jax-js/blob/main/FEATURES.md)

The current compatibility table lists float64 on CPU/Wasm rather than WebGPU, and lacks custom differentiation rules and checkpoint support. Pin the version and test the required operations before choosing a solver formulation. Python JAX-FEM is not a drop-in browser dependency.

Use gradients for smooth analytic kinematics and verified differentiable solver models. Check derivatives independently. CAD booleans, feature failures, remeshing and topology changes can make numerical objectives nonsmooth or undefined; use bounded derivative-free, Bayesian or mixed-variable strategies where appropriate.

OpenMDAO is one possible backend for connected disciplinary models and their derivatives. Dakota is another option for design studies, sensitivity analysis, calibration and uncertainty. Choose one orchestration approach initially; neither provides a ready-made diesel model. [OpenMDAO](https://openmdao.org/what-is-openmdao/), [Dakota](https://www.sandia.gov/ccr/software/dakota/)

A useful fast approximation is built from reference simulations across a bounded design region. Reserve cases for error checks. Propose candidates within a trust region, compare predicted and reference improvement, and adapt that region. A statistical error estimate for the approximation does not account for missing combustion physics. [Multifidelity trust-region research](https://kiwi.oden.utexas.edu/papers/Multifidelity-optimization-March-Willcox.pdf)

Fixed-geometry unit-load fields and modal bases cannot simply be reused after arbitrary geometry changes. Regenerate them, use a verified parametric reduced model, or recompute. When combining linear structural load cases, combine tensors before deriving scalar stress measures.

A fixed reduced basis may remain useful across geometry changes if changed operators are reassembled and projected into it, and its approximation error is checked. This differs from retaining old stiffness and recoloring an old solution. JAX-FEM documents mesh-coordinate differentiation and finite-difference checks, while density-based topology optimization is a separate formulation from feature-based CAD design. [Differentiable mesh example](https://deepmodeling.github.io/jax-fem/advanced/adv_main.html), [topology example](https://deepmodeling.github.io/jax-fem/learn/topology_optimization/example.html)

For a later fluid-design example, SU2's turbulent pipe-bend tutorial demonstrates adjoint shape optimization and the importance of deformation constraints to avoid collapsed meshes. It is a useful methodological reference for a bounded passage study; its numerical gains do not apply to our manifold. [SU2 pipe-bend optimization](https://su2code.github.io/tutorials/Inc_Turbulent_Bend_Opt/)

For uncertainty, first use justified ranges for material, damping, thermal and operating inputs. Introduce probabilities only with a basis for their distributions. Show whether a candidate remains preferable across those ranges and manufacturing tolerances.

## Presentation and delivery gates

The design interface should share the existing selection and analysis context. The viewer locks interfaces and package requirements, chooses two objectives, and starts a study. Candidate points appear in a tradeoff plot. Selecting a point reveals its generated geometry and paired baseline/result views. The AI can explain which constraint is active, why a candidate was rejected, or why a result needs another reference solve.

The AI's role is to assemble and operate supported study definitions, interpret stored evidence and compare results. Numerical solvers and geometry checks determine feasibility and performance. Generated prose does not certify a candidate.

| Gate                            | Deliverable                                                           | Required evidence                                                                               |
| ------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 1. Recover design intent        | Fusion history report and one reproducible component family           | Parameters, rebuild health, source comparison, preserved interfaces                             |
| 2. Close one design loop        | Rod generation → mesh → analysis → constrained search → final recheck | Geometry validity, units, material/load definition, mesh and derivative checks where applicable |
| 3. Parametric power cylinder    | Coherent bore/stroke/rod/deck/crown dependencies                      | Closure, volume and swept-clearance checks; explicit mechanical and thermodynamic assumptions   |
| 4. Coupled design studies       | Recalculated loads, shaft response and thermal effects                | Coupling consistency, duty-cycle outputs, uncertainties and reference comparisons               |
| 5. Combustion/flow optimization | Bounded benchmark-based bowl or passage study                         | Baseline validation, design-region sampling, held-out errors, finalist reference solves         |
| 6. Broader architecture         | Additional engine families and discrete choices                       | Separate topology/model validation and manufacturing review                                     |

Before expanding the power-cylinder family, resolve the existing source-design limitations in a reviewed analysis derivative: the motion audit records small piston/block contacts and zero nominal running clearances. Preserve the purchased original and document every correction. The optimization baseline must be feasible under the study's own requirements.

A strong component design demo is a tractable next engineering project. A broadly predictive whole-engine optimizer is a continuing CAD, simulation, optimization and validation program. Progress should be measured by these evidence gates, not the number of controls exposed or an unverified efficiency score.
