# Complete running engine and process visualization: rebuild plan

30 September 2026 · Active generic V12 concept asset · Original audit and acceptance plan

**Implementation update:** The original baseline below is retained as the reason for the rebuild. It no longer describes the current runtime. See [running-engine implementation and verification](V12_RUNNING_ENGINE_RELEASE.md) for current status, derived geometry, numerical scope and acceptance evidence.

## Decision

Replace the arrow-based process overlays with a cylinder-first system that connects mechanical motion, a declared cycle model, and restrained particle/volume rendering. The arrows failed the intended presentation. Passing event-gating tests did not establish visual quality or physical credibility.

**The full timing drive is a required deliverable, not an optional future feature.** Finding defects changes the repair work; it does not justify leaving chains, cams or valves permanently static. The final running demonstration must account for every major moving system present in the source assembly. The single-cylinder work below is a validation stage, not a reduction of the intended engine-wide scope.

The current arrow overlays remain in the application, off by default. No particle or volumetric replacement has shipped in this pass. The first deliverable is one cylinder's geometry audit and static section. The subsequent target is a convincing, inspectable single-cylinder prototype through a complete 720° cycle. Expansion to twelve cylinders follows its acceptance, not before.

This plan orders the work needed for a complete running-engine demonstration within the broader [multiphysics roadmap](V12_MULTIPHYSICS_ROADMAP.md). It does not replace the existing parametric rod, operating-load, or structural studies.

## The process we must depict

A conventional direct-injection diesel takes in air, compresses that charge, and injects fuel into the hot compressed gas. Ignition follows the fuel's preparation and chemical delay; there is no spark event. Expansion produces work, and opening exhaust valves allows blowdown followed by the exhaust stroke. Exact valve events and injection schedules are engine-specific. [DOE engine principles](https://www.energy.gov/cmei/vehicles/articles/internal-combustion-engine-basics)

Diesel combustion has structure around individual spray jets: liquid breakup, vaporization and mixing precede and accompany reacting regions. A uniformly glowing cylinder or a generic fireball would communicate the wrong mechanism. Optical brightness also depends on soot and observation conditions; it is not a direct temperature scale. [DOE/Sandia discussion of optical diesel combustion](https://www.energy.gov/cmei/fuels/text-version-co-optima-webinar-how-can-fuels-and-combustion-reduce-pollutants-future)

The presentation will distinguish liquid spray particles, gas-flow inspection tracers, and volumetric scalar fields. Air is normally invisible. A colored air/temperature field is an inspection aid, with its quantity and units identified where calculated. Warm emission must remain confined to the chamber and should not illuminate the entire engine as a decorative effect.

## What the local evidence establishes

| Item                     | Current evidence                                                                                            | Consequence                                                                                                                                                                                                 |
| ------------------------ | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Core linkage             | Source-derived 85 mm bore, 100 mm stroke, 125 mm rod length, 60° V12; approximately 6.81 L swept volume     | Reuse the actual piston trajectory and native coordinate system. This is not the historical Caterpillar 3512.                                                                                               |
| Timing layout            | Lower 30:30 stage, paired coaxial 20-tooth pinions, four 40-tooth cam sprockets; four cam axes recovered    | A half-speed cam relationship is supported by tooth counts, conditional on the inferred coaxial coupling. Absolute cam phase remains unverified.                                                            |
| Chains                   | 72-link lower loop and two 124-link upper loops; all 320 source link hinge pairs recovered                  | Rest-pose maximum hinge mismatch is about 1.397 mm lower and 0.856 mm upper, approximately 23.45% and 14.45% of pitch. A smooth transport prototype preserves those defects; it does not establish contact. |
| Valve train              | 48 tappets and 48 valve stems are present under four camshafts                                              | Recover each valve axis, follower pairing and cam profile. Contact, lift, spring motion and piston clearance need verification before production animation.                                                 |
| Gas passages             | Intake/exhaust wall geometry exists; no ready-labelled fluid domain was identified                          | Extract and validate actual enclosed fluid volumes. The twelve inner closed shells in the shell audit belong to two glow-plug bank bodies, not twelve ready-made combustion volumes.                        |
| Fuel system              | Injector/nozzle identification and internal delivery topology are not yet validated for the new flow system | Do not infer an injector from a glow-plug label or place a spray from an assembly bounding box. Resolve nozzle position and orientation before adding jets.                                                 |
| Existing numerical study | The design workspace uses prescribed pressure scenarios and computed mechanical loads                       | Keep this study explicit. The current pressure pulse is not a combustion prediction.                                                                                                                        |

Native timing data and extraction evidence are retained in `src/lib/engine/v12-timing-datums.json` and `references/00_Active_V12/timing-verification/`. The [timing, valve and gas-domain audit](V12_TIMING_AND_FLOW_GEOMETRY_AUDIT.md) records the recovered identities and limits. Existing piston/block contacts remain documented in [motion verification](V12_MOTION_VERIFICATION.md). Mechanical rendering is not manufacturing validation.

A further sampled cam-section/flat-follower screen finds source-rest gaps spanning approximately −2.869 to +2.585 mm. It also finds some rotational support points beyond the finite pad radius. This is a mesh feasibility screen, not exact cam-contact or valve-lift validation; it establishes that automatic cam rotation needs contact reconciliation first. The [timing transport audit](../references/00_Active_V12/timing-verification/TRANSPORT_PROTOTYPE_AUDIT.md) preserves the experiment and its limits.

## Build sequence and acceptance gates

### 0. Complete the whole-engine motion inventory

Before adding further presentation effects, assign every source occurrence to a motion owner or an explicitly fixed assembly. Audit connected fasteners, pins, retainers and spring seats along with the obvious large parts. An unclassified occurrence is an open item, not automatically a static part.

The completion matrix must cover crankshaft/flywheel, rods/pistons and their separate attached hardware, all three chain loops, compound idler and cam sprockets, four camshafts, 48 valve/tappet mechanisms with associated retainers and springs, the turbo rotating assemblies, and any additional moving accessory hardware actually present. Identify missing functional geometry explicitly and record any derived replacement in the rig manifest. Source names alone do not establish attachment or motion.

The first inventory pass finds 1,229 mechanical bodies. Only 27 source bodies currently move during Run. The missing motion is substantial and must be completed:

| Required family                                         | Current state                         | Completion requirement                                                                                                                                                                          |
| ------------------------------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Crankshaft, flywheel and crank sprocket: 3 bodies       | Animated                              | Retain common-axis rigid coupling; classify attached hardware.                                                                                                                                  |
| Pistons and rods: 12 each                               | Animated                              | Preserve pin closure and resolve documented piston/block corner contact.                                                                                                                        |
| Rings and wrist pins                                    | No separate named occurrences         | Determine whether independent geometry exists. Do not imply independent dynamics from a combined piston mesh.                                                                                   |
| Primary idler and paired pinions: 3 bodies              | Static                                | Drive around the measured idler axis at crank speed; retain the inferred coupling in the evidence record.                                                                                       |
| Four cams and four cam sprockets                        | Static                                | Half-speed rotation coupled to the corrected followers and actual valve events.                                                                                                                 |
| Timing chains: 320 rigid links in 3 loops               | Static; audit prototype only          | Closed hinges, compatible pitch, guide clearance, continuous link circulation and no mesh scaling.                                                                                              |
| Tappets and valve stems: 48 each                        | Static                                | Contact-driven motion along recovered axes, seated-valve behavior and clearance through the whole cycle.                                                                                        |
| Spring assemblies: 336 constituent bodies               | Static                                | Classify actual coils, retainers, keepers and seats; couple moving parts to each valve and deform coils between their end conditions. This is not a count of 336 springs.                       |
| Four turbo rotor pairs: 8 bodies                        | Static                                | Couple each compressor/turbine pair on its shaft, with explicit turbo speed and spool behavior.                                                                                                 |
| Injector and glow-plug bank geometry: 4 combined bodies | Static housings                       | Keep housings fixed; establish nozzle outlets and injection timing. Separate needle/plunger bodies are not supplied as named occurrences; any internal model needs declared derived geometry.   |
| Pumps, fan and accessory gears                          | No named source assemblies identified | Resolve what is present before assigning motion. If a required functional system lacks geometry, retain a tracked derived-geometry or system-model task instead of inventing a moving identity. |
| Two unnamed mechanical bodies                           | Unclassified                          | Identify both and assign their actual mechanical role.                                                                                                                                          |

Stationary block, liners, heads, manifolds, bearing supports, turbo housings and mounted guides are also explicitly classified. The 48 `bolts/cam` bodies are stationary bearing-support fasteners. The four cam-wheel covers need attachment evidence before rotation is assigned. Turbo rotor pairs are `0799/0800`, `0805/0806`, `0811/0812` and `0817/0818` (all with the `v12-` prefix).

Use one motion graph: continuous drive angle controls the crank and timing transmission; cams control followers/valves; valve openings constrain gas exchange; cylinder pressure and exhaust state feed the relevant dynamic studies. Turbo shafts require their own continuous angle and speed state, rather than a crank-speed multiplier. Fixed guides, bearing supports and housings stay fixed unless an actual supported degree of freedom requires movement.

**Gate:** the manifest has no unexplained moving family. Each family has source IDs, parent/attachment relationships, axes or deformation rules, phase/speed basis, current implementation status and an acceptance test. The final product cannot be marked complete while a required row remains missing.

Rendering, selection bounds and cutaway caps must consume the same accepted component transforms. Visual rotor speed needs an aliasing review, so fast rotation does not misleadingly appear frozen or backward. No review is complete with a screenshot alone: inspect motion recordings and pause/seek behavior as well.

### 1. Establish one cylinder's mechanical and gas geometry

Choose a source cylinder with a clear camera view. Produce an inspectable mapping of its piston, liner, head, valve seats/stems/tappets, cam lobes, intake and exhaust passages, and verified injector location. Each record keeps source identity, native units, coordinate transform, evidence and any unresolved assumption.

Extract cam profiles and derive follower motion from their actual contact geometry. Test a complete cycle for contact loss, penetration, valve/piston clearance and correct cam/crank ratio. Resolve source chain closure separately: retain the purchased source pose as evidence; any corrected link placement or sprocket geometry belongs to a named derived rig with recorded changes. Do not stretch link meshes or turn every wheel about the crank axis.

The timing repair has concrete steps: reconcile source sprocket seat pitch with the measured rigid link pitch; solve discrete link placement around the identified wheels/guides with explicit tensioner travel; correct cam/follower registration, including the measured offset stem/tappet pair; associate actual valve seats and guides; then drive stems, retainers and spring compression from the accepted contact solution. Keep rigid bodies rigid. A spring's changing shape needs a separate deformation model and coil-clearance checks. If exact contact cannot be achieved with the supplied shapes, derive corrected pitch/contact geometry and record the changed dimensions instead of concealing the mismatch in a spline animation.

After one cam/follower/valve assembly passes, apply the verified method to all 48 stations and the complete three-loop drive. Check tooth/link progression, fixed-bearing hardware, valve seating, interference and phase continuity over multiple engine cycles. This full timing-drive milestone precedes calling the engine mechanically complete.

Build a gas-domain mesh or signed-distance field from native passage walls with explicitly named port caps. Validate connected regions, inlet/outlet faces, minimum resolved passage size, closed-valve boundaries and changing chamber clearance. If the source is incomplete, create a documented derived passage or a separate teaching cylinder; never silently present invented passages as source CAD.

Positive, geometrically consistent chamber clearance throughout the cycle is a blocking requirement. Supplying a numerical clearance volume must not conceal source intersections. If source-contact reconciliation needs undocumented redesign, use a clearly identified teaching cylinder for the process study while retaining the purchased assembly as its own source view.

**Gate:** the static section establishes the actual interfaces and connected gas space; only then does a slow full-cycle animation establish the mechanical relationships. Both retain measured residuals and disclose corrections. Unresolved nozzle geometry blocks fuel spray on the purchased assembly, not the independent solver work.

### 2. Give one cylinder a coherent cycle model

Start with measured piston volume and an explicitly supplied clearance volume. Verify a closed, motored cylinder before adding heat release, heat loss and gas exchange. Track mass and internal energy; pressure work, wall losses, injection and port enthalpy terms must use consistent units and signs. A reduced gas-exchange model needs valve lift/effective area and declared inlet/exhaust boundary conditions. Flow direction must follow pressure differences, including any modelled reversal, rather than a fixed arrow direction.

Use a declared injection schedule and fuel mass. An initial empirical heat-release law is acceptable as an assumed scenario; it must not become a claim of predicted ignition delay, fuel efficiency or emissions. Compare selected cases against an independent reference calculation. Cantera supplies a useful simplified engine reactor example, but it explicitly uses gaseous fuel and simplifying assumptions; it is not a liquid-spray validation dataset for this asset. [Cantera example](https://cantera.org/stable/examples/python/reactors/ic_engine.html)

**Gate:** motored and closed-valve limits, mass/energy residuals, time-step convergence, nonnegative mass/temperature, and independent reference agreement. Display pressure-volume and crank-angle traces from the same accepted case. Preserve a separate physical operating speed and visual slow-motion rate.

### 3. Render spray and gas without losing the engineering model

| Layer              | Intended presentation                                                                                                                               | Required foundation                                                                                                        |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Fuel               | Fine, short-lived spray particles leaving actual nozzle outlets; a coherent jet envelope, breakup/vaporization progression and no metal penetration | Verified or explicitly assumed nozzle geometry, injection mass/rate and timing; bounded collision/transport model          |
| Intake/exhaust     | Sparse advected tracers and optional low-opacity volumetric fields contained within passages                                                        | Connected gas domain, velocity basis and moving-valve gates; no airborne curves between unrelated bounding boxes           |
| Combustion         | Localized volume around jet/mixing regions, with restrained emission and expansion                                                                  | Consistent chamber geometry and cycle state; spatial shapes identified as illustrative unless computed by a spatial solver |
| Engineering fields | Selectable velocity, temperature or mixture display with one compact legend                                                                         | Actual field data and units; a zero-dimensional average cannot justify a detailed three-dimensional temperature contour    |

Particle advection and volume rendering are different responsibilities. Use a field-backed renderer with opaque-depth clipping, section-plane clipping, soft intersections and stable temporal sampling. X-ray transparency must preserve chamber depth and physical walls. Avoid oversized sprites, neon trails, blanket smoke, uncontrolled bloom and frame-dependent randomness.

The initial resolved gas-tracer release will use offline-computed nonreacting velocity fields, starting with one stationary, watertight port at specified flow conditions. Check its pressure drop, boundary fluxes and mesh refinement before browser replay. Moving-cylinder advection requires a separate verified moving-boundary case; a port field must not be extended arbitrarily into the cylinder. The zero-dimensional cycle supplies bulk state and port-flow demand, not a three-dimensional velocity field. Until a chamber field exists, show bulk chamber state as a clearly labelled uniform inspection tint, not a spatial temperature contour or invented swirling gas. Fuel trajectories may start from a declared reduced spray model, with assumed nozzle/rate parameters visible and no claim of resolved breakup chemistry.

Three.js has official [GPU compute particle](https://threejs.org/examples/webgpu_compute_particles.html) and [volumetric fire](https://threejs.org/examples/webgpu_volume_fire.html) examples. These establish rendering/compute techniques, not diesel physics. Volume rendering maps fields into optical absorption/emission and integrates them along the view; its visual quality does not prove the field is physically correct. [NVIDIA volume-rendering reference](https://developer.nvidia.com/gpugems/gpugems/part-vi-beyond-triangles/chapter-39-volume-rendering-techniques)

**Gate:** close-up visual review from exterior, section and X-ray views; no effects through opaque metal, no flashes or sorting reversals during camera motion, and a readable engine at presentation scale. Benchmark with the real materials, shadows and caps enabled.

### 4. Integrate deterministic interaction and expand carefully

The mechanism, cycle plots, spray, gas state and audio cues share one scene clock. Pause freezes all of them; seek reconstructs a reproducible state through fixed seeds and deterministic checkpoints or validated phase caches. A chain's identified links do not generally repeat after the 720° combustion cycle, so mechanical drive angle must remain unwrapped.

Run remains independent of Exterior, Section, X-ray and Mechanism. Add one compact Processes panel for Air, Fuel, Combustion and Exhaust, with a selected-cylinder study and a clear legend. Camera framing changes only on an explicit focus action. Isolation, explode and atlas transitions must stop or transform the process layer coherently, never leave floating effects in empty space.

Extend to the twelve-cylinder sequence only after the source phasing or an explicit teaching sequence is established. Then connect the manifolds and turbo flow paths. Do not infer turbo speed from crank ratio; meaningful spool behavior requires shaft inertia, torque balance and maps or a declared approximation.

**Gate:** repeated Run/Pause/Seek, cycle wrap, resizing, section flips, mode changes, isolation and return to assembly remain smooth and deterministic. Review desktop and mobile captures plus motion recordings, not only automated assertions.

The final demonstration acceptance is whole-engine: exterior playback, a gradual mechanism reveal showing the complete timing/valve drive, a cylinder process study, and a return to the running exterior without reset or phase discontinuity. Check each major subsystem close up and in context. A strong single-cylinder result does not close the uncompleted rows of the motion inventory.

## Compute choice

The current app uses Three.js WebGL rendering with established PBR, section-cap and transparency behavior. First benchmark a bounded single-cylinder implementation against it. WebGPU compute may help particle advection, fields and batches, but moving the renderer requires proving those existing features still work. Do not migrate the entire application because a standalone fire demo looks impressive.

JAX-JS remains a candidate for batches of operating scenarios and sensitivities in the broader roadmap. Neither GPU compute nor automatic differentiation supplies missing boundary conditions, combustion chemistry or geometry. Full moving-boundary reacting CFD is a separate solver project; use verified offline cases or reduced fields when interactive reference calculations are too expensive.

Measure frame time, main-thread stalls, memory and seek latency on the actual presentation hardware. Target a stable 60 fps on the primary device; reduce invisible-cylinder work and volume resolution before degrading interaction. This is an acceptance target, not a current benchmark result.

## Immediate status

- Restored the cam covers to the original saturated orange metallic family with a small yellow shift and recovered sheen. Cover 27 remains a contrasting graphite finish.
- Replaced the tall labelled explorer rail with floating icon groups and accessible hover/focus labels.
- Moved Design/Analyze camera controls to the viewport's top right and separated field legends from the coordinate gizmo, including mobile layouts.
- Audited timing hardware and retained the transport prototype outside production. Timing chains, cams and valves are not yet a validated running assembly.
- Recorded the arrow replacement as substantial engineering work. It is still pending; no decorative replacement is being presented as finished simulation.

Verification for this revision: production build succeeded; Svelte checking reported zero errors and warnings; 364 unit tests in 59 files passed, including the audit-only timing prototype; three new browser layout regressions passed across desktop/tablet/mobile and Model/Split/native-result views. Changed UI/material/prototype files passed scoped formatting and lint. These checks do not establish engine physics; no live AI test was required for these changes.

The first deliverable is the cylinder geometry audit and a static section showing all required interfaces. The accepted prototype that follows combines synchronized valves, a documented gas domain, coherent cycle traces, confined fuel spray and a restrained combustion volume. The geometry, numerical and visual gates govern progression to the twelve-cylinder demo.
