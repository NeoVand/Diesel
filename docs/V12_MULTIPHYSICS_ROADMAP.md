# Engine Lab: browser physics and multiphysics research

Research date: 30 September 2026. Status: proposed capabilities; no new physics solver has been added to the application in this research pass.

The follow-on [parametric design and optimization assessment](PARAMETRIC_ENGINE_DESIGN.md) develops the route from fixed geometry to controlled component families and verified design searches.

## Recommendation

Build a connected engineering experiment around the purchased geometry. Begin with a single-cylinder cycle laboratory and an actual connecting-rod modal study. Connect calculated cylinder loads to structural and torsional studies, then add thermal transients and a bounded flow study.

JAX-JS is a promising compute layer for batches of scenarios, sensitivities and compact reduced systems. Keep full reference calculations and mesh preparation in established engineering tools. A result must retain its model assumptions, source geometry identity and verification evidence.

The existing source audit establishes a 60-degree V12 with 85 mm bore, 100 mm stroke, 50 mm crank throw and 125 mm rod length. These give approximately 6.81 L swept volume. It does not establish compression ratio, firing order, valve events, injector characteristics, material grades, rated speed or performance. Existing concept-design clearances and piston/block contacts remain documented in the native and motion audits.

## What we can demonstrate

| Experiment                | User interaction                                                                                                 | Calculation                                                                                                                                             | Honest scope                                                                                                                |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Cylinder cycle laboratory | Scrub a cycle; compare fuel quantity, assumed heat-release phasing, compression ratio and intake conditions      | Measured slider-crank volume plus a zero-dimensional mass/energy model; pressure, temperature, heat release, work and indicated mean effective pressure | A parameterized scenario. Begin with one cylinder and an explicit top-dead-centre reference                                 |
| Tap a connecting rod      | Isolate a source rod, choose a material scenario, click an excitation location and select bending/twisting modes | Free-free elastic modal FEA; modal impulse response and sonification                                                                                    | Assumed elastic properties and damping. Label deformation magnification and sound as synthesized modal response             |
| Load the rod              | Scrub crank angle or applied force; inspect bore loading, stress tensor, displacement and reactions              | Distributed bearing-load cases plus inertia loads; linear elastic unit-load solutions                                                                   | Fixed geometry/material/support regime. No fatigue-life claim from one stress contour                                       |
| Torsional resonance       | Sweep scenario speed, adjust a damper or flywheel inertia, click an order peak                                   | Shaft-line finite elements or a reduced mass/stiffness/damping system; forced response, modes and Campbell/order plots                                  | Begin with specified harmonic excitation. Combustion excitation additionally requires documented pressure and firing phases |
| Thermal transient         | Cold start, load change and shutdown; compare coolant or cooling-system assumptions                              | Thermal-capacity/conductance network; later component conduction and reduced spatial fields                                                             | Node temperatures are averages. Spatial temperature contours require a spatial solve                                        |
| Flow laboratory           | Seed dye into a manifold, place probes, compare pressure loss and branch flow                                    | A verified fluid-domain mesh and steady/transient flow cases; browser field reconstruction and particle advection                                       | Start with a stationary, bounded passage. Whole-engine moving-valve reacting CFD is a later separate problem                |
| AI experiment assistant   | “Reduce torque ripple within this operating envelope” or “explain the first bending mode”                        | Verified solver actions, parameter sweeps, gradients where supported, comparison of saved cases                                                         | The agent explains computed results and assumptions; it does not invent fields or calibration                               |

## A presentation sequence worth building

1. Run the exterior engine and select one cylinder.
2. Open a section with pressure-versus-angle and pressure-volume plots synchronized to the actual piston.
3. Compare a baseline heat-release scenario with a changed one. See the altered pressure peak, indicated work and gas force.
4. Follow the force into the connecting rod. Open the rod's stress result with the applied loads and constraints visible.
5. Move to torsional response. Sweep excitation, select a resonance and compare a damper scenario.
6. Ask the guide to explain why the response changed, show its assumptions and restore the baseline.

The model links should be physical: cylinder pressure produces piston force; gas and inertia forces produce rod/journal loads and torque; torque excites a specified shaft model; heat-transfer terms feed a thermal network. Preserve two separate clocks: physical scenario time/RPM and visual slow-motion playback.

A second short demonstration can “tap” the rod and reveal its natural modes, without requiring a combustion calibration.

## JAX-JS: verified capabilities and limits

The official project supports JAX-style array computation, automatic differentiation and compiled WebGPU/Wasm execution. This is useful for parameter studies and sensitivity calculations. It is a separate JavaScript implementation, so Python JAX programs and solver packages require porting. [Project](https://github.com/ekzhang/jax-js)

Its compatibility table distinguishes float32 WebGPU arithmetic from float64 on Wasm/CPU. It also documents incomplete operation coverage, no native complex dtype, and missing advanced transformations. Use float64 reference checks, nondimensionalization and residual monitoring; do not use float16 for engineering balances. [Compatibility](https://github.com/ekzhang/jax-js/blob/main/FEATURES.md)

Dense linear algebra is available, but we have not established a general sparse engineering solver API. The official heat-method example supplies its own matrix-free conjugate-gradient calculation. That is evidence of feasibility, not a completed FEM package. A dense 10,000-by-10,000 float32 matrix alone occupies 400 MB before factorizations or rendering memory. [Linear algebra](https://github.com/ekzhang/jax-js/blob/main/src/library/numpy-linalg.ts), [heat example](https://github.com/ekzhang/jax-js/blob/main/website/src/routes/heat-method/%2Bpage.svelte)

The official fluid example uses a two-dimensional incompressible grid, semi-Lagrangian advection and a limited Jacobi pressure solve. It does not implement diesel spray, compressible combustion or moving valves. [Fluid example source](https://github.com/ekzhang/jax-js/blob/main/website/src/routes/fluid-sim/%2Bpage.svelte)

Benchmark the real workload before choosing a backend: one small cycle or thermal network may be fast on CPU. GPU batching becomes valuable for many operating points, uncertainty samples, sensitivities and field reconstruction. No speed or frame-rate claim has been measured in this research pass.

## Numerical architecture

- Maintain an independent float64 reference for every new numerical model.
- Keep the present renderer initially. Run solver work in a dedicated worker, return compact arrays and interpolate accepted results for rendering.
- Coalesce slider changes and attach a case revision to every result. Discard stale results. Bound GPU batches because already-submitted work cannot be assumed cancellable.
- Warm compiled kernels, keep array shapes stable and account for JAX-JS array ownership/disposal.
- Treat shared-device GPU rendering as a later integration. A WebGPU compute buffer cannot simply become a buffer in the current WebGL renderer. Browser workers do not make the physical GPU unlimited.
- Preserve full-order models and their meshes outside the render asset. Export fields, modes, source-ID mappings and reduced matrices with a reproducible case manifest.
- Benchmark float32 versus float64 results, cold-start compilation, repeated-interaction memory, interaction latency and rendering contention on target presentation devices.

JAX-JS exposes asynchronous array reads and GPU integration APIs, but buffer ownership and device identity require deliberate handling. [Array implementation](https://github.com/ekzhang/jax-js/blob/main/src/frontend/array.ts), [backend API](https://github.com/ekzhang/jax-js/blob/main/src/backend.ts), [WebGPU worker entry point](https://developer.mozilla.org/en-US/docs/Web/API/WorkerNavigator/gpu), [WebGPU multithreading design](https://gpuweb.github.io/gpuweb/explainer/#multithreading)

## Combustion and performance

Start with a closed-cylinder motored calculation and test the adiabatic limit. Add an explicitly specified heat-release model and wall heat transfer, then gas exchange. Exact piston displacement determines volume once clearance volume is supplied.

For a cylinder control volume, solve internal-energy change from heat release, wall heat loss, pressure-volume work and inlet/outlet enthalpy. Integrate pressure-volume work for indicated work and divide by swept volume for indicated mean effective pressure. A closed portion of the cycle supports closed-cycle quantities; net indicated output requires pumping/gas exchange. Brake torque, brake efficiency and fuel-consumption maps additionally need friction and accessory losses.

Cantera's official diesel-type engine example offers a reactor, piston motion, valves and injection reference. It uses gaseous n-dodecane and simplifying assumptions; it is not a liquid-spray CFD model or a calibration of this V12. Use its methods for solver checks, keeping the benchmark conditions distinct. [Cantera engine example](https://cantera.org/stable/examples/python/reactors/ic_engine.html)

A prescribed heat-release law lets the viewer change burn phasing directly. Predicting the effect of injection timing requires an ignition/mixing model or calibration linking injection to that heat release. Detailed emissions require their own chemistry, mixing and validation evidence.

Unknown inputs include compression ratio, trapped charge, residual gas, wall temperatures, valve events, fuel properties, injection schedule and combustion-model parameters. Give each a visible assumed/measured/imported status. Source phase zero is not an ignition event.

## Structural and vibration studies

Use native STEP geometry for a separate tetrahedral mesh. Keep component/source identities and audit units. Choose Gmsh plus one initial structural solver, such as CalculiX; DOLFINx is an alternative when custom formulations matter. [Gmsh](https://gmsh.info/doc/texinfo/), [CalculiX](https://dhondt.de/ov_calcu.htm), [DOLFINx elasticity](https://docs.fenicsproject.org/dolfinx/main/python/demos/demo_elasticity.html)

The first rod study can use free-free conditions, an assumed material, six rigid-body modes and the first elastic modes. Check eigenpair residuals, mass normalization and mesh convergence. A modal sound is a sonification of selected excitation/damping assumptions, not measured radiated sound.

For linear stress, precompute unit-load solutions while the mesh, material and supports remain fixed. Combine displacement and stress-tensor components for the current loads, then calculate von Mises stress. Interpolating scalar von Mises colors does not implement stress superposition. Changes to contacts, geometry, plasticity or supports can invalidate those bases.

Aalto's openTorsion provides shaft-line modeling and torsional response in time/frequency domains. Its engine example is a useful validation workflow but contains another engine's parameters. Build our shaft inertias/stiffnesses and damping scenarios explicitly. [openTorsion](https://aalto-arotor.github.io/openTorsion/), [engine example](https://aalto-arotor.github.io/openTorsion/notebooks/ICE_example.html)

Use modal projection before introducing a learned surrogate. Check any reduced model against withheld full-order cases and limit interaction to its tested range. [pyMOR tutorials](https://docs.pymor.org/latest/tutorials.html)

## Thermal and flow studies

A thermal network can show warm-up and cooldown with component heat capacities, thermal conductances and coolant/radiator assumptions. This follows established lumped thermal modeling. A component-average value should color a component uniformly; a smooth local hotspot requires a computed spatial field. [Modelica thermal components](https://doc.modelica.org/Modelica%204.1.0/Resources/helpDymola/Modelica_Thermal_HeatTransfer_Components.html)

First-order thermal interaction can use a network; later solve piston/head conduction and thermal expansion, with temperature-dependent properties where needed. A coupled solution must account consistently for wall heat removed from the gas and deposited in the solids/cooling circuit.

For fluid mechanics, extract the actual fluid volume and identify valid inlets, outlets and wall patches before meshing. A set of valid metal solids does not establish a complete, connected passage network. Start with a stationary manifold case and defined operating conditions. OpenFOAM provides meshing and reference-case infrastructure for this work. [snappyHexMesh](https://doc.openfoam.com/2606/tools/pre-processing/mesh/generation/snappyhexmesh/), [verification cases](https://doc.openfoam.com/2306/examples/verification-validation/)

Visualize streamlines/pathlines, pressure sections and probes from a solved field. A reduced model can interpolate inside its validated operating envelope; otherwise request another full solve. Full moving-cylinder spray combustion combines turbulence, compressibility, evaporation, chemical kinetics, wall heat transfer and moving geometry, so it should be an offline/backend study first.

## Experimental reference data obtained

Three public Sandia Engine Combustion Network archives were downloaded, SHA-256 recorded and ZIP integrity checked. Together they contain six XLSX workbooks and total 4,586,961 bytes. Spreadsheet contents have not yet been numerically analyzed or fitted.

- Piston-bowl pressure/injection/heat-release archive: four workbooks covering CDC9 and LTC3 fired/non-combusting cases.
- Pilot-injection pressure/heat-release archive: one workbook.
- Pilot-injection rate profiles: one workbook.

Repository location: `references/01_Benchmarks/ECN_Small_Bore/`. The manifest preserves exact source URLs, byte counts, member names and hashes.

These are external optical research-engine cases, with their own geometry and conditions. Use them to reproduce reference experiments; do not relabel them as measurements of our purchased V12. [Piston-bowl study](https://ecn.sandia.gov/engines/small-bore-diesel-engine/experimental-data/piston-bowl-geometry-study/), [pilot-injection study](https://ecn.sandia.gov/engines/small-bore-diesel-engine/experimental-data/close-coupled-pilot-injection-study/)

Additional relevant sources: [ECN control-volume jet model](https://ecn.sandia.gov/diesel-spray-combustion/computational-method/one-dimensional-control-volume-jet-model/), [Spray A/B conditions](https://ecn.sandia.gov/diesel-spray-combustion/target-condition/spray-ab/). They provide a path toward a bounded spray investigation with explicit reference conditions.

## Build sequence and acceptance

1. **Case and evidence foundation:** typed units, source hashes, operating assumptions, real simulation time, saved baseline/comparison and a worker interface. Reproduce analytic cycle and elasticity test problems.
2. **First demonstration:** the single-cylinder cycle laboratory and free-free source-rod modal study. Show synchronized plots, energy accounting, mode shapes and their assumptions.
3. **Connected mechanics:** gas/inertia loads, unit-load rod stress and a torsional-response explorer. Validate force/moment balance, eigenmodes and frequency response.
4. **Heat:** warm-up/cooldown network, then spatial component fields after mesh/property/boundary validation.
5. **Flow:** one verified passage and one ECN benchmark. Add precomputed/reduced field playback before attempting a general browser CFD solver.
6. **Design investigation:** GPU scenario batches, local sensitivities, uncertainty bands and constrained optimization. Verify gradients against finite differences and re-evaluate selected optima using the reference solver.

Every result package should contain geometry and mesh identity, units, parameters, assumptions, boundary conditions, solver/version, tolerances, convergence evidence and source-part mapping. Numerical convergence and physical validation are separate checks. [NASA grid-convergence guidance](https://www.grc.nasa.gov/www/wind/valid/tutorial/spatconv.html)

In the interface, add one Analysis workspace with Cycle, Structure, Vibration, Thermal and Flow studies. Share the same scenario, selected part, baseline comparison and evidence panel. Keep these studies separate from the camera/view toolbar so the controls do not become scattered again.
