# V12 engine explorer — delivery plan

30 September 2026 · Current implementation plan

## Product commitment

Build one polished engine explorer around the purchased V12, with the depth of the previous application: assembled inspection, coherent disassembly, a beautiful parts atlas, working cross-sections, actual moving internals, system explanations, guided lessons, narration and an AI guide that operates the scene.

The opening experience should show a beautifully lit engine immediately. A visitor can discover its construction in one click, watch how it works, and ask the guide to explain a visible part. The audience is an engine-company executive: clarity, mechanical coherence, restrained presentation and trustworthy explanations matter more than decorative effects.

The `/asset-review` route is an inspection tool. It is not the new product baseline. The existing main application supplies the interaction/state/AI foundations; the V12 audit supplies the actual geometry and measured datums. These must converge into the main `/` experience. No further asset purchase is proposed.

This document is a plan, not a claim that the missing features have been implemented. Its acceptance checks define completion.

## What went wrong, and the correction

| Observed regression                          | Confirmed cause                                                                                                                                   | Required correction                                                                                                                                                         |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Engine seems to shrink while separating      | The review slider starts camera fitting on every change and again when it settles.                                                                | Keep the camera and orbit target fixed during ordinary disassembly. Fit is explicit. All physical component scales remain unchanged.                                        |
| Floor and lighting move                      | The floor and key light are recalculated from expanding bounds every frame.                                                                       | Anchor the studio to the assembled engine. Provide sufficient fixed shadow coverage. Clip only engine geometry.                                                             |
| Chains scatter                               | Offsets are calculated independently for every mesh, including 320 chain meshes.                                                                  | Disassemble coherent subassemblies first. A chain remains a loop; its individual links are reached through deliberate detail inspection.                                    |
| Internal view feels arbitrary                | A broad boolean filter hides liners, heads, bearings and turbos along with exterior covers.                                                       | Replace it with named, reversible anatomy presets that state which assemblies they hide or ghost.                                                                           |
| Cutaway, operation, atlas and AI disappeared | The review route bypasses the existing application systems.                                                                                       | Restore those systems through one V12-aware asset/state contract. Model loading alone is not feature completion.                                                            |
| Parts list dominates the screen              | The inspection catalog is permanently exposed as a sidebar.                                                                                       | Default to an unobstructed engine. Open contextual details, visual system navigation or search when requested.                                                              |
| Decorative text looks wrong                  | There are no supplied image textures. Inventory indicates separate lettering meshes on the cam covers; the old atlas also uses floor-text labels. | Isolate the candidate letter meshes to confirm them, then exclude only that decoration from the display derivative. Replace scene-floor labels with sharp interface labels. |

Likely source lettering: `v12-0261` through `v12-0284`, adjacent to the actual cover meshes `v12-0259` and `v12-0260`. Confirm visually before excluding them. Record decorative exclusions in the provenance inventory, distinguish them from active mechanical components in displayed counts, and retain access through the audit tools. Purchased originals remain intact.

## The experience to build

### Opening and interface

One continuous black studio, a compact header, a restrained warm accent and controlled reflections. The engine is the primary content; eliminate the large audit headline, provenance badge clutter and permanent raw component list. Keep evidence one click away in About and component details.

Use four clear view choices: **Assembly, Cutaway, Exploded, Parts**. Run/pause is a separate action: it operates the mechanism in the appropriate view rather than becoming another competing navigation mode. **Learn** opens guided experiences; **Ask the engine** stays easy to reach through a compact composer and expandable conversation panel.

Use Hugeicons consistently with short labels for primary actions. Main controls and body text should generally be 14–16 px; secondary labels at least 12 px. Use screen-space text, responsive sizing and sufficient contrast. At small widths, panels become dismissible sheets and touch controls retain usable targets. Camera fitting accounts for an opened panel only through an intentional composition change, not on every UI update.

Selecting a part opens a concise card: meaningful name, function, parent assembly, isolate/hide/restore and “Explain this.” Full hierarchy and source IDs belong in an expandable evidence area. Search is a command-style overlay, not a wall of rows. The technical tree remains available as an advanced tool.

### Disassembly and interior exploration

Use two levels of separation:

1. **Assembly level:** covers, each head/valvetrain bank, turbo modules, intake/exhaust groups, timing assemblies, sump and piston/rod/liner groups move along reviewed directions. Fasteners travel with their parent assembly. Timing chains stay coherent.
2. **Selected assembly detail:** deliberately open a head, turbo, timing module or piston/rod group to inspect its actual constituent parts.

All movements derive from immutable source rest transforms. The separation control persists at zero and supports repeated reversal. Mesh dimensions and scale vectors remain fixed. Camera, floor and lights remain stationary unless the visitor requests a view change or Fit. Show a subtle Fit affordance when parts extend beyond the current frame; do not silently zoom away.

Replace “Internal machinery” with clear presets such as **Remove covers**, **Reveal rotating assembly**, and **Reveal valve train**, each with a brief description and one-action restore. Keep useful context instead of indiscriminately deleting every non-internal item. Selection and the complete catalog remain available in every preset. Optional ghosting must use stable rendering, not layers of flickering transparency.

### Parts atlas

Restore the deliberate assembly-to-layout transition as a separate **Parts** view. Use an orthographic board organized into readable systems, with crisp interface labels and clear space between assemblies. Preserve one common physical scale in the actual arranged geometry; small parts become inspectable through zoom, group expansion and isolation.

Begin with useful system groups and component families. Repeated fasteners and chain links can be grouped with quantities, with explicit expansion to every source occurrence. An “all components” overview must still represent the full registry. Avoid making every nut as large as a cylinder head by resizing the actual meshes. If thumbnails are used in navigation, their framing is independent of the physical scene.

One intentional camera transition is allowed when entering the atlas. Subsequent selection does not constantly refit the entire board. Returning to the engine restores the prior camera, selection, section and visibility state. Labels never lie on a moving floor or change readability with 3D perspective.

### Cross-sections

Restore a real plane through the complete engine, with X/Y/Z presets, compact position control, retained-side flip, optional guide and plane rotation. Single-cylinder study remains a focused teaching view, clearly distinct from the full-engine section.

Adapt the existing contour and per-component stencil-cap systems. Every visible cut through material needs a correct cut face; real bores, piston cavities and passages remain open. The engine is cut independently of the studio floor. Caps, shadows, normals, selection and visible meshes must agree while parts move, separate or are isolated.

Native solid validity does not prove that the simplified browser meshes are watertight. Audit the actual render derivative. Retain or retessellate geometry needed for reliable sections. Use component bounds to skip non-intersecting parts, cached/worker-computed static caps where useful, and transformed stencil caps for moving parts. Never fill a component’s bounding box to conceal an unresolved contour. Any unresolved topology is repaired or explicitly excluded from an accuracy claim before presentation.

### Operation and explanation

Animate the purchased crankshaft, pistons and rods from the measured source axes, 50 mm crank throw, 125 mm rod length, 60° banks and twelve pin relationships. One cycle clock drives run, pause, stepping, scrubbing, lessons, event markers and applicable flow cues. Every render and picking pass uses the same component transforms.

Then resolve the complete timing train, cam/valve motion and interference checks. The source has idealized fits, and the observed wheel feature counts do not yet establish the full cam/crank transmission. Inspect Fusion constraints and the complete train. Where the concept needs a correction, preserve the purchased baseline and record the justified change in a separate derivative. Do not conceal a mismatch behind arbitrary animation.

Expose slow mechanical playback separately from any operating-speed parameter. Verify continuous pin closure and sampled moving-surface clearance, including crank counterweights, opposing rods, piston/deck and valve interactions. A mathematical slider-crank check alone is insufficient.

Restore air, exhaust and fuel explanations tied to actual source components. Show compression ignition without a spark-plug effect; distinguish glow plugs from normal-cycle ignition. Injection spray and combustion cues stay within the actual chamber and follow the chosen educational timing. Cooling and lubrication explanations can include a clearly presented schematic where modeled passages or pumps are unverified.

Restore the simulation experience in layers: measured geometry and chamber motion first; explicitly parameterized teaching-cycle behavior second. The existing performance-panel framework can display supported geometry/kinematics and, later, a documented teaching model. It must not inherit Caterpillar power, fuel, heat or emissions maps. Pressure, temperature, combustion and flow predictions require stated assumptions and validation appropriate to the claim. Visual flow tracers explain direction and events; they are not a CFD solution.

### AI, audio and the presentation tour

Preserve the existing Codex harness, scene tools, execution acknowledgements, cancellation, checkpoint restore, server-key access, invitation-password flow and optional BYOK. Restore them in the product interface as part of integration, not as a late decorative chat box.

UI, guide, renderer and lessons read the same engine definition and component registry. The guide can identify a selected part, isolate or reveal assemblies, position a section, arrange parts, run/pause/seek the mechanism and restore a prior view. Success is reported only after the scene acknowledges execution. Manual interaction interrupts an automatic presentation cleanly; Stop cancels inference, motion, narration and queued commands.

Replace all stale Caterpillar facts, old part IDs and example questions. The V12’s measured displacement is approximately 6.81 L; performance and timing uncertainties remain explicit in the evidence. Add registered lesson/narration actions to the tool contract if the agent is to start them itself; the existing framework does not already expose those operations.

Use audio models for spoken explanation. Engine sound is a separate optional feature requiring its own source or synthesis model; narrated speech must not be sold as physically simulated acoustics.

A short first-visit welcome explains that this is a purchased concept design with measured geometry and educational simulation, supported by cited engineering references. Invited viewers unlock the existing sponsored AI with a password; local development uses the already configured server key. No new credential setup is requested from the owner.

The replayable presentation tour operates the real scene: assembled engine → coherent explosion → parts atlas → working section → fuel/air explanation → an AI request that manipulates the selected machinery. Back, Skip, manual interruption, audio failure and Stop must all recover properly.

## Engineering structure and reuse

Introduce one versioned `EngineDefinition` containing asset identity, reviewed component/assembly catalog, geometry transforms, material interpretation, motion datums, section policies, evidence, capabilities and lesson content. Retain full source provenance separately from friendly labels.

| Existing foundation                         | Treatment                                                                                                              |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `engine-studio.ts`, `studio-environment.ts` | Reuse rendering, orbit and selection foundations; replace Cat-specific loading, exceptions and source transforms.      |
| `lab-state.ts`                              | Preserve the shared command/reducer and checkpoint model; make defaults, capabilities and saved state asset-aware.     |
| `section-plane.ts`                          | Generalize existing hole-preserving static caps and moving stencil caps for the purchased parts and shared transforms. |
| `parts-layout.ts`                           | Retain deterministic packing/grouping; replace per-part resizing and floor-text presentation.                          |
| `scene-broker.ts`, `scene-mcp.ts`           | Retain authenticated command delivery, acknowledgements, cancellation and restore.                                     |
| `scene-contract.ts`, `engine-agent.ts`      | Use the V12 whitelist, capabilities and evidence; remove old facts and IDs from active context.                        |
| `demo-tour.ts`, lesson/audio coordinator    | Preserve coordination and interruption behavior; rewrite targets, narrative and cues for this engine.                  |

The old renderer assumes 1,024 component entries and backend catalogs are capped at 750. Make both capacities derive from the reviewed manifest, with bounded validation; this asset needs all 1,253 occurrences. Multi-material primitives keep their parent occurrence identity. Scope saved views to the asset and version.

Use one transform evaluation for beauty, shadow, depth, normals, section caps, picking and bounds. Keep engine rest transforms, articulated motion, disassembly and atlas placement separate and compose them deliberately. Freeze operation while laying out disconnected parts; resume only when the engine has been restored to a valid operating presentation.

Retain Three.js initially. Choose WebGPU only if representative measurements justify it and the cap/effects pipeline works on the target device. The current 69.6 MB, 4.16-million-triangle derivative is an inspection asset, not a final delivery budget. Reuse repeated geometry, batch compatible static detail, select appropriate detail levels and optimize effects without discarding meaningful internal anatomy.

## Delivery sequence

Each milestone produces a working experience in the main application and a new verification record. Existing feature tests become the migration checklist. Do not replace them with a single “model loads” check.

| Milestone                                       | Concrete deliverable                                                                                                                                                                                           | Completion evidence                                                                                                                                                                                               |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1. Unified explorer and stable presentation** | New engine definition; V12 in the existing application; new compact shell; contextual details/search; AI plumbing registered to V12; static studio; coherent assembly explosion; decorative lettering removed. | Fixed camera/floor/light transforms during 0→100→0; unit part scales; source silhouette retained; all mechanical IDs selectable; guide selects a real V12 part with an acknowledgement and no stale Cat identity. |
| **2. Inspection depth restored**                | Named reveal presets; capped movable/rotatable section; coherent detail explosions; orthographic grouped parts atlas; exact return-to-view behavior.                                                           | Sections preserve holes at oblique angles and both flip states; atlas exposes the whole registry; no lost parts, drift, floor clipping or unintended rescaling.                                                   |
| **3. Actual purchased mechanism runs**          | Crank/rod/piston articulation, timeline and cycle controls; timing-drive resolution; validated cam/valve presentation; moving sections.                                                                        | 720° pause/seek/repeat agreement; pin closure; scoped moving-surface collision checks; caps/picking agree with actual moving geometry.                                                                            |
| **4. Guided understanding**                     | Air/fuel/exhaust explanations; supported cooling/lube presentation; migrated lessons; narration; complete scene-controlling AI and Driver.js tour.                                                             | One coherent scene/clock/explanation; real guide request executes and restores; Stop rejects late commands; narration and manual interruption recover.                                                            |
| **5. Presentation acceptance and cleanup**      | Material/lighting pass, responsive UI, loading/detail optimization, final hosted-demo readiness; retire unused active Cat code/assets only after parity.                                                       | Complete scripted demo on target hardware, readable controls at supported sizes, measured frame/memory/load results and zero known blocking geometry/interaction regressions.                                     |

The immediate build target is milestones 1 and 2 together: a V12 explorer with stable disassembly, useful interior reveals, working sections, the parts atlas and a connected guide. Mechanical rigging and timing investigation can proceed in parallel, but unverified animation does not pass milestone 3.

Preserve the historical research and original source files. Remove obsolete runtime machinery after its replacement has passed the relevant tests. Keep the audit route out of primary product navigation. Consolidate the active roadmap around this document; historical reports remain dated evidence.

## Acceptance contract

1. **Opening:** engine dominates the viewport, with no raw tree, audit banner or giant promotional heading. Primary controls are readable at 100% browser zoom on desktop and a 390 px-wide viewport.
2. **Separation:** ten 0→100→0 sweeps leave camera, target, floor and light poses unchanged; part scale vectors remain one. Reassembly agrees with rest matrices within an explicit numerical tolerance and has no cumulative drift.
3. **Chains and detail:** assembly-level movement preserves each chain loop’s relative link transforms. Fasteners follow reviewed parents. Fine detail remains discoverable without scattering the entire engine.
4. **Reveal:** every hidden/ghosted component belongs to the chosen preset. Catalog and selection remain available. One action restores the complete assembly.
5. **Sections:** X/Y/Z and an oblique plane can traverse, flip and orbit through block, liners, piston walls and rod bores without flicker or fabricated filled holes. Engine clipping does not clip the floor. Test actual runtime geometry, not only primitive fixtures.
6. **Atlas:** all mechanical source occurrences, including IDs above 1,024, can be reached, selected and isolated; decorative exclusions remain recorded in the audit inventory. Physical scene geometry does not change dimensions. Return restores the prior scene and camera.
7. **Operation:** actual source parts remain connected through 720°, scrubbing and direction changes; geometric closure and moving interference have separate recorded checks. Valve/chain behavior matches the adopted, documented timing model.
8. **AI:** “Show this connecting rod, cut through its bearing, arrange the parts, then restore my view” operates real scene state with acknowledgements. Unsupported performance questions do not produce inherited Cat numbers.
9. **Interruption:** Stop during a lesson, guide response, narration or camera transition prevents late effects. Restored checkpoints recover exact section, selection, visibility, camera and sampled phase for the correct asset version.
10. **Presentation:** target 60 fps on the named demonstration machine at its actual presentation resolution. Measure sustained rendering with working sections, moving internals and the atlas, including p95/p99 frame times, GPU/render cost, main-thread stalls, loading and memory growth. The previous requestAnimationFrame-cadence sample is not a GPU benchmark. Respect reduced motion and test narrow-screen panel recovery.

The final review is a complete visitor journey: open → explode → inspect a small part → arrange → cut → run → pause at ignition → ask the guide → interrupt → restore. A screenshot or a feature checkbox alone does not pass this review.
