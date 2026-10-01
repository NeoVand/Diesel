# Diesel Engine Lab — next-level implementation plan

**Historical planning baseline.** Implementation status is recorded in [Design and roadmap](DESIGN_AND_ROADMAP.md) and [Verification](VERIFICATION.md).

Prepared 29 September 2026 for `/Users/neo/repos/Diesel`.

Reference target: **Caterpillar 3512C, 60 Hz, 1800 rpm, 51.8 L**. The current performance dataset is the EM1898-00 1500 ekW standby reference. The purchased geometry remains a generic 3512-family asset until its configuration and 3512B-labelled records are resolved.

**Outcome:** a beautifully lit engine that can be disassembled in useful detail, opened to reveal a working mechanism, paused at a precise cycle event, and explained by an agent that controls and observes the same application state as the visitor.

This plan replaces the prototype's next-investment priorities. Existing asset, AI and simulation documents describe the current implementation; they do not establish that the capabilities below already exist. This revision records an audit and a build sequence. It makes no application changes.

## 1. What failed, and what the audit actually found

The current application meets a small portion of the brief. Its exterior viewer, reference data and live Codex integration are useful foundations. Its disassembly, materials, simulation and teaching behavior do not meet the intended demonstration.

| User-visible problem                            | Current implementation                                                                                                                                             | Required change                                                                                                  |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Coarse disassembly and selection                | 587 OBJ groups are retained, but rendered and exposed through nine heuristic subsystem categories. Picking returns a category rather than an individual component. | Preserve source identity, recover native CAD structure, review labels, and expose assembly and component levels. |
| Materials look broadly painted                  | The import replaces source materials and assigns one display finish to each category.                                                                              | Recover native appearances; author reviewed finishes per component and surface.                                  |
| “Simulate” shows a load slider                  | Twelve EM1898-00 steady-state reference points are interpolated at 1800 rpm. Load never reaches the engine scene.                                                  | Keep this as **Performance reference**; add a visible mechanical cycle and a separate time-based learning model. |
| Engine does not work                            | The scene loop moves explosion offsets and camera controls. There are no crank, piston, valve, injection or flow states.                                           | Rig actual or explicitly educational internals and drive all events from a shared cycle clock.                   |
| No working cutaway                              | No section rendering or reviewed internal mechanism exists.                                                                                                        | Add a complete internal assembly, deliberate cutaway presets and readable cut faces.                             |
| Agent cannot teach the visible process          | The harness returns actions once. It receives selected category, explosion and load, without execution feedback or full scene state.                               | Give Codex narrow application tools, state queries, execution acknowledgements and a shared lesson timeline.     |
| Unclear button state and inconsistent interface | The enabled lesson button uses `#68735e` text on `#687e4d`: approximately **1.11:1 contrast**. Many controls use isolated color rules.                             | Replace scattered rules with one dark design system and explicit active, disabled, loading and focus states.     |

Audit anchors: [renderer](/Users/neo/repos/Diesel/src/lib/scene/engine-studio.ts:32), [scene contract](/Users/neo/repos/Diesel/src/lib/components/EngineScene.svelte:4), [performance calculation](/Users/neo/repos/Diesel/src/lib/engine/simulation.ts:240), [lesson button](/Users/neo/repos/Diesel/src/routes/+page.svelte:2139), [agent execution](/Users/neo/repos/Diesel/src/lib/server/engine-agent.ts:121).

### The purchased asset deserves a better import

The current derivative uses the OBJ. That cannot establish the completeness or quality of every purchased format. The native-file audit found:

- **STEP:** 46 product records, 45 assembly occurrences and 573 B-rep solids. The 45 occurrences share one parent: useful named groups, rather than a verified deep OEM bill of materials. It contains 46 RGB color records and 583 styled items. Those colors reduce to two values: industrial yellow and gray. They preserve display intent, but do not constitute detailed PBR finishes.
- **Material metadata:** the STEP has 45 material-name and 45 density properties. Every material is `Generic`; every density value is `1.0`, with an unsuitable encoded derived unit. These are placeholders, not usable material or density ground truth. Recover the display styles separately from physical properties.
- **Applicability:** labels include `2249869_3512B`, `7E6872_3512B`, `1010831_3512` and numeric part-like identifiers. No product/occurrence name establishes a 3512C configuration. Resolve these labels against geometry and matching documentation before assigning component functions or claiming exact applicability.
- **Units:** all 47 global geometry-unit contexts resolve to millimeters. Centimeter records occur in the unsuitable density encoding. Preserve geometry contexts and transforms in the import; do not reinterpret those density fields as dimensions or physical properties.
- **FBX:** 587 model and geometry records, a flat root hierarchy and one material; no texture or animation records were found in that file.
- **BLEND/MAX/C4D:** their detailed scene structure, finishes and internal completeness have not yet been visually audited. The Blender archive has a gzip-compressed native payload. Do not infer these files' content from OBJ or FBX.

These counts are file records, not a count of independently removable real engine parts. The audit also does not establish whether all necessary internal geometry is present. Open and inspect every useful native format before commissioning replacement assets or deciding that internals must be fabricated.

## 2. The product experience

The engine occupies approximately 70% of a desktop presentation view. The interface supports three clear activities: **Inspect**, **Operate**, and **Learn**. A compact **Performance reference** view remains available alongside them.

| Area              | Purpose                                                                               |
| ----------------- | ------------------------------------------------------------------------------------- |
| Center stage      | Large, carefully lit engine; assembled, detailed explosion and working cutaway views. |
| Left, collapsible | Searchable component hierarchy, breadcrumb, visibility and assembly depth.            |
| Right, compact    | Contextual component information, selected system, evidence and agent conversation.   |
| Bottom transport  | Run/pause, cycle stepping, crank-angle scrub and playback speed.                      |
| Stage controls    | Explode, Cutaway, Flows, Fit and Restore; one consistent location for each.           |

Opening the site immediately presents the assembled engine with clear **Run engine** and **Inspect inside** actions. Once the first working assembly exists, those actions start a real visible sequence. There should be no prominent simulation control whose entire result is a slider.

**Inspect** supports overview → assembly → component detail. Explosion paths are authored around actual bounds, preserve stable labels, and reveal relationships without throwing hundreds of objects into an unreadable cloud. Component selection works from both the tree and the geometry. Hide, isolate, inspect and restore operate on exact registered identities. A component cannot be broken into constituent pieces that the asset does not contain; that limitation is addressed by native asset recovery or additional geometry.

**Operate** shows the moving mechanism and enabled flow paths. It always distinguishes the engine's reference operating speed from the display playback speed. A visitor can pause at compression, step through the four strokes, scrub a 720° cycle, select a cylinder or follow a fluid path.

**Learn** uses the same scene and controls. A lesson moves the camera, opens a section, pauses at a relevant event, traces a path and speaks a short explanation. A visitor can interrupt, inspect independently or restore the lesson checkpoint. Text-only slide sequences no longer constitute a completed engine lesson.

### Dark visual design

| Token          | Proposed value | Use                                              |
| -------------- | -------------- | ------------------------------------------------ |
| Stage          | `#0B0E12`      | Main background                                  |
| Panel          | `#13181F`      | Inspector and navigation                         |
| Raised surface | `#1B232D`      | Secondary controls and menus                     |
| Primary text   | `#E9EDF2`      | Labels and body                                  |
| Secondary text | `#A7B0BC`      | Descriptions and metadata                        |
| Warm accent    | `#F3C95A`      | Primary action and restrained selection emphasis |
| Text on accent | `#15191F`      | Primary-button text                              |

The proposed primary button has approximately 11.18:1 text contrast; secondary text on the panel has approximately 8.13:1. Check every actual state, including hover, focus and disabled styling. Normal text should meet at least 4.5:1, with the applicable large-text threshold of 3:1. [WCAG contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).

Use neutral secondary buttons, quiet utility actions and one primary style. Keep Hugeicons with consistent sizes and strokes. Inspector body copy should be comfortably readable at 14–16 px on desktop. Disabled controls must have a reason and a distinct state; loading must be identified separately.

The dark stage still needs clear shape separation: a controlled environment, soft key and fill lights, a restrained rim, contact shadows and readable metal reflections. Paint, cast metal, machined surfaces, hose rubber and fasteners receive distinct reviewed finishes. Display roughness and color are visual assets; they do not establish physical alloy or thermal properties. Flow colors use accompanying labels, arrows and legends.

## 3. Recover the engine structure before expanding the interface

Produce a native-asset audit with canonical views, an internal-completeness matrix and a source-to-browser mapping. Compare STEP, BLEND and the other scene formats. Preserve originals and build derivatives separately.

Keep this audit bounded: start with the most informative formats supported by available tooling, and record uninspected formats explicitly. Unsupported MAX/C4D tooling should not halt mechanism and flow authoring after the best available assets have been inspected.

Each registered component needs:

- A stable ID, source product/occurrence or mesh binding, parent assembly and reviewed name/aliases.
- Source units, transforms, bounds, appearance bindings and configuration applicability.
- Geometry provenance: purchased exterior, recovered native component or authored educational internal.
- Capabilities: selectable, removable, sectional, articulated and usable by the guide.
- Rest transform, joint/pivot information where applicable, explosion path and inspection camera framing.
- Confidence and supporting document/page for engineering labels or properties.

Maintain logical identity independently of GPU batching. Repeated hardware can remain efficient without becoming one ambiguous subsystem. Three.js supports independently transformed and visible instances within `BatchedMesh`; benchmark it, instancing and any custom path against the actual geometry and materials before selecting the import/render strategy. [BatchedMesh documentation](https://threejs.org/docs/pages/BatchedMesh.html).

A reviewed material pass must compare recovered native color/style/property records with the visual result. Handle missing UVs and texture maps deliberately. Retain a high-quality master, then derive component-aware browser detail levels. Record any simplification that removes a feature needed for explanation or sectioning.

**Decision at this gate:** if useful internal geometry exists, reuse and rig it. If it does not, author a separate, high-quality educational mechanism using nominal OEM dimensions and declared assumptions. Exact arrangement geometry can replace that mechanism later. An attractive teaching engine can proceed while exact production geometry remains an acquisition task.

## 4. Make a complete working cutaway

Start with one fully resolved cylinder assembly before multiplying an incomplete mechanism across twelve cylinders. Include the piston, liner, connecting rod, crank throw, visible intake/exhaust valve groups and unit-injector representation. Recover available source components first; otherwise author them with explicit educational provenance.

The nominal 170 mm bore and 190 mm stroke support a 95 mm crank radius. Rod length and detailed internal shape remain unresolved. Use a true slider-crank relationship with a declared rod-length parameter; constrain both rod endpoints to their pins. Independent sine motions are insufficient because they can detach the mechanism or violate its geometry.

One 720° cycle state drives piston position, valve lift, injection indication, chamber event and relevant flow gates. Initial valve windows and injection timing are instructional assumptions until matched documents establish actual timing and lift. Diesel ignition is represented through compression and injection, without introducing spark-ignition hardware.

At 1800 rpm the crank turns 30 times per second and each cylinder completes 15 four-stroke cycles per second. Use slow motion for inspection, with **Reference: 1800 rpm** and **Playback: 0.02×**, for example. Slowing the animation does not change the fixed-speed performance dataset. Phase evaluation must remain correct even when display frames skip multiple crank events.

For sections, provide deliberately composed presets: one-cylinder teaching cutaway, a bank/valvetrain view where supported, and shell visibility controls. A clipped exterior alone cannot reveal geometry that does not exist. Cut faces need caps or a deliberate authored section surface, readable material treatment and no distracting backface artifacts. Three.js already provides clipping planes in the current WebGL renderer; its stencil example demonstrates a possible capping approach. Whether that approach works depends on the imported mesh topology. [Renderer documentation](https://threejs.org/docs/pages/WebGLRenderer.html), [official stencil example](https://threejs.org/examples/webgl_clipping_stencil.html).

Expand to a mechanically consistent V12 after the single-cylinder gate passes. Verify bank arrangement, crank phasing, numbering and firing order where possible. Average firing-event spacing does not establish the actual cylinder sequence. Any representative sequence remains identified as educational.

## 5. Give flows and simulation a clear meaning

### Five visible systems

| System      | Initial visible path                                                             | Evidence boundary                                                                                        |
| ----------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Intake air  | Cleaner → compressor → ATAAC → manifold → intake valve → cylinder                | Family architecture; exact paths and ports require geometry review.                                      |
| Exhaust     | Cylinder → exhaust valve → manifold → turbine → stack                            | Cylinder events follow the shared phase clock.                                                           |
| Fuel        | Supply/transfer/filter → unit injectors; injection pulses and circulating return | EUI architecture, not invented common-rail hardware. Consumption differs from supply/return circulation. |
| Coolant     | Reviewed jacket-water loop with pump, engine and heat rejection                  | Keep ATAAC distinct. Exact coolant routing is arrangement dependent.                                     |
| Lubrication | Sump/pump/conditioning → galleries/bearings → returns                            | Family topology until actual passage geometry is verified.                                               |

Build directed paths with real or explicitly schematic source/destination ports. Air/exhaust through a cylinder respect the chosen valve model. Injection pulses respect the declared phase window. Show return paths rather than visually losing fluid at a component.

Tracers explain direction and events. Their speed is not a measured fluid velocity or a CFD result. Do not display inferred oil/coolant L/min, calibrated chamber temperatures or a pressure field without supporting data. Normalized visual intensity may respond to load, but its meaning must be visible.

Use the collected OEM family guides during review: [fuel systems](/Users/neo/repos/Diesel/references/99_Archive/Caterpillar_3512_2026-09-29/05_Application_Installation/LEBW4976_Diesel_Fuels_and_Diesel_Fuel_Systems.pdf), PDF pages 14–15; [cooling](/Users/neo/repos/Diesel/references/99_Archive/Caterpillar_3512_2026-09-29/05_Application_Installation/LEBW4978_Cooling_Systems.pdf), pages 10–15; [lubrication](/Users/neo/repos/Diesel/references/99_Archive/Caterpillar_3512_2026-09-29/05_Application_Installation/LEBW4957_Lubrication_Systems.pdf), pages 8–12. These describe system architecture, not the exact purchased asset's internal passages.

### Three simulation layers

1. **Mechanical teaching:** deterministic articulated geometry, 720° events, flows and phase scrubbing. This is the first visible working-engine milestone.
2. **Performance reference:** retain EM1898-00's twelve 10–100% load anchors at 1800 rpm. Reported, interpolated and derived results remain distinct. For example, 75% gives 1125 ekW and 306.4 L/h; 63% gives 945 ekW and 264.25 L/h through interpolation. These values describe the selected reference configuration, not every 3512-family engine.
3. **Dynamic teaching, then calibration:** introduce a rotational inertia/load/governor model to explain a load step and speed recovery. Declare inertia, actuator delay and controller coefficients. During a changing-speed scenario, fixed-1800-rpm data remain reference targets; they cannot silently become measured off-speed fuel behavior. Predictive transient accuracy requires matched measurements and calibration.

Separate an analytic/fixed-step simulation clock from rendering. Display interpolation must not make motion or physics depend on the frame rate. Phase, load, visual flow and lesson state have explicit contracts; they are not separate animations that happen to look active.

Telemetry carries units, source, evidence class and time/state association. Use meaningful channels—phase, valve state, injection, average shaft torque, electrical output and the available heat channels. Do not add random gauge noise to imitate measurement. Cylinder-pressure curves require measured support or an unmistakably normalized educational presentation.

The existing [ground-truth policy](/Users/neo/repos/Diesel/references/99_Archive/Caterpillar_3512_2026-09-29/07_Simulation_Data/GROUND_TRUTH_POLICY.md) remains authoritative. Pressure basis and some volumetric-flow bases are unresolved. Reported heat channels do not currently form a closed energy balance, and oil-cooler heat may already be included elsewhere. Avoid a closed-looking Sankey or calibrated thermal field that conceals those uncertainties.

The [research guide](/Users/neo/repos/Diesel/references/99_Archive/Caterpillar_3512_2026-09-29/06_Research_Simulation/RESEARCH_GUIDE.md) supports the progression from reduced models to measured calibration. Parameters and validation errors from another engine are methodological references, never Caterpillar calibration.

## 6. Let the agent control and observe the working engine

Keep the existing open-source Codex harness and configured OpenAI models. Improve application control before adding a larger chat interface or changing models.

Create one authoritative application controller used by UI, agent and lessons. Its snapshot includes component identity/visibility, exact camera pose and target, explosion level/progress, section preset/offset, cycle phase, playback state/speed, enabled flow systems, reference load and evidence, lesson/cue, narration and pending transitions. Keep per-visitor controller and credential state isolated.

Separate the discrete command/configuration revision from continuously advancing animation time. Snapshots include their sampling timestamp; a running crank or camera transition must not invalidate every incoming command. Pause and seek acknowledgements report the settled phase and state.

| Tool family | Contract                                                                                                  |
| ----------- | --------------------------------------------------------------------------------------------------------- |
| Observe     | Get capabilities, list components, read current state, operating point and cited evidence.                |
| Inspect     | Focus a registered component; change visibility; explode a reviewed assembly; restore a checkpoint.       |
| Operate     | Select a section preset; run/pause/scrub the cycle; show a registered flow; set supported reference load. |
| Teach       | Start/pause/stop an authored lesson; control narration and restore its checkpoint.                        |

Commands use registered IDs and bounded presets, with a command-revision check. Execution returns **applied**, **unsupported** or **failed**, plus actual resulting state. The guide explains after the view settles and acknowledges completion. It must not report a successful operation merely because it emitted an action.

The technical spike should connect a narrow local scene MCP adapter to a session broker and browser executor. Browser commands can travel over SSE with completion acknowledgements, or a scoped WebSocket. Verify installed Codex SDK/native-runtime support for the tool-call/result loop before building all tool families. Official Codex MCP supports STDIO and Streamable HTTP, tool allowlists and timeouts. [Codex MCP documentation](https://learn.chatgpt.com/docs/extend/mcp?surface=cli).

The scene tools do not need shell, unrestricted browser or filesystem capabilities. Existing BYOK credentials remain server-side request/session input; do not persist keys in scene snapshots or project content. The tool bridge is bound to one browser session.

An authored timeline coordinates camera, mechanism event, section, flow, labels and short narration segments. Speech begins after the relevant view is established. Pause stops lesson motion and speech. Stop cancels the active agent turn, queued transitions and audio; a run token rejects late commands and acknowledgements from the cancelled run. Manual camera interaction suspends automatic camera cues until explicit resume. Narration is explanatory speech. Accurate engine/component acoustics require recordings or a separately validated acoustic model.

Required agent demonstrations:

- “Show the piston and pause at compression.” A supported internal component is framed at the correct educational phase, with its provenance available.
- “Follow the air from the turbo into this cylinder.” The visible path and valve event agree with the explanation.
- “Isolate this component, come closer, then restore.” The exact prior state returns.
- “What is visible and running right now?” The answer matches sections, hidden components, phase, flows and playback.
- “Compare 63% and 75% load.” Values come from the deterministic reference calculation.
- An interruption, unknown component, missing capability, stale revision or failed audio request produces a recoverable result without a false success claim.

## 7. Delivery sequence and review gates

| Gate                                              | Concrete deliverable                                                                                                                                                                                                                                                                                       | Acceptance before expansion                                                                                                                                                                                                                             |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A — Native recovery and design contract**       | Bounded visual audit of available purchased formats; recovered source mapping, appearances and units; internal-completeness report; minimal working component registry/controller; dark assembled/inspector/transport layouts; real Codex query → browser execution → acknowledgement → tool-result spike. | We know which useful parts exist in inspected assets, which need authoring, and which configuration claims are supported. Controls and scene actions share a working state contract; the agent tool loop is demonstrated before claiming agent control. |
| **B — One complete working experience**           | A beautifully lit single-cylinder cutaway with a constrained mechanism, four-stroke clock, intake/exhaust/fuel paths, run/pause/step/scrub, core Stop/interruption/checkpoint restore, and one synchronized agent-led lesson in the new dark interface.                                                    | A visitor can open, run, slow, pause, inspect, trace a path, ask for an explanation, interrupt and restore. Motion, camera, flow and speech agree. This is the next substantial implementation milestone.                                               |
| **C — Engine-wide detail**                        | Reviewed assembly/component hierarchy; deeper authored explosions; per-component material pass; expanded bank/V12 teaching geometry where justified; coolant and lube paths; robust sections and lessons.                                                                                                  | Disassembly reaches the useful native component detail. No false “all parts” claim. Restores are exact; labels, pivots and flows pass an engineering review.                                                                                            |
| **D — Meaningful load behavior and presentation** | Clearly separated mechanical, reference and dynamic learning views; load-step teaching; broader agent tools; interruption/undo; polished opening and canonical demo scenes.                                                                                                                                | Evidence classes remain clear, stable dynamic behavior is demonstrated, and the complete experience passes presentation-device review.                                                                                                                  |
| **E — Predictive fidelity**                       | Matched internal/configuration evidence, transient measurements, calibrated parameters and independent validation.                                                                                                                                                                                         | Publish explicit operating envelope, uncertainty and validation results before calling this a predictive engine twin. This gate does not block the educational demonstration.                                                                           |

CAD recovery, dark UI layout and the controller/tool spike can run in parallel. An unresolved agent-transport spike need not halt mechanism and flow construction; Gate B's agent-led acceptance still requires a real acknowledged tool loop. Broad content expansion follows Gate B so that every new cylinder, lesson and overlay builds on a working experience. Estimate schedule and asset-authoring effort after Gate A; file record counts alone cannot support a credible timeline.

### Acceptance is visible behavior

- **Mechanics:** 190 mm stroke; rod length constant; connected pins; repeatable cycle closure; correct state when paused or scrubbed; no unexplained penetrations.
- **Detail:** pick a reviewed individual component from geometry or tree, isolate/hide it, explode its parent and restore without cumulative offset drift.
- **Sections:** readable internals and cut faces, no flicker or empty-shell implication, clear distinction between source and educational geometry.
- **Systems:** explicit connected flow paths, valve/injection gating, supported topology, readable labels and returns.
- **UI:** canonical screenshots for assembled, component explosion, working cutaway, flow tracing, lesson and performance reference; actual enabled/disabled/focus states checked; useful keyboard and reduced-motion operation.
- **Agent:** real execution acknowledgements; explanations match visible state; manual interruption, Stop and restore tested through the browser.
- **Performance:** target smooth 60 fps on the actual presentation hardware under working cutaway, particles and interaction. Measure frame timing, GPU memory, loading and worst-view behavior. The old exterior-only performance result does not validate the new scene.

Use the current renderer until a measured limitation justifies migration. WebGPU may be valuable, but the immediate missing work is component recovery, rigging, flow topology, state coordination and visual direction. Replacing the graphics API cannot supply those assets or behaviors.

## 8. Data needed for exactness

Before claiming a serial-specific 3512C twin, obtain the full serial number, engine/generator arrangements, change level, performance revision and ECM/software identity; match the purchased geometry and evidence to them. Resolve product labels and the 3512B references. Seek the applicable internal geometry, cylinder numbering/firing sequence, rod/crank dimensions, valve/injection timing, turbo maps, manifold volumes, governor/inertia data, wiring/sensor identities and measured load-step/thermal traces.

Use the existing [acquisition gaps](/Users/neo/repos/Diesel/references/99_Archive/Caterpillar_3512_2026-09-29/ACQUISITION_GAPS.md) and dealer-request materials. Draft requests and identify licensed sources; external messages, purchases and public distribution are separate actions. Exact unknowns remain declared assumptions in the educational engine while these acquisitions proceed.

**First reviewable milestone:** Gate B's working cutaway, underpinned by native asset recovery and the dark design/controller work in Gate A. It must demonstrate the engine mechanism, connected flow and synchronized explanation together. A theme update or another static tutorial is insufficient to pass that gate.

## Native audit provenance

The read-only STEP audit inspected [the original archive](/Users/neo/repos/Diesel/references/3dfiles/156826_step.zip), member `156826_Caterpillar_3512_Generator_Engine/156826_Caterpillar_3512_Generator_Engine.step`. Its header identifies Autodesk Inventor 2021, a 5 July 2020 export and AP214 `AUTOMOTIVE_DESIGN`. This establishes third-party authoring provenance, not authenticated Caterpillar production CAD.

Durable anchors: root product `#2531083` is `3512-1`; the two 3512B-labelled occurrences are `#159` and `#160`. A representative invalid density-unit chain is `#1036963` through `#1036872`, `#1036873`, `#1036962` and `#2530755`, combining gram exponent +1 and centimeter exponent +3. All 45 density values are 1.0 and all 45 material names are Generic. No physical simulation parameter should be inferred from those fields.
