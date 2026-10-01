# Historical: V12 renderer restoration

> **Superseded renderer snapshot.** This document preserves an earlier restoration milestone. Its motion limitations, hardware-only flow presentation, camera/layout behavior and test counts describe that stage. For the current renderer, complete running rig, declared geometry corrections and process models, read [V12 running-engine release](V12_RUNNING_ENGINE_RELEASE.md).

30 September 2026. This records implementation scope and checks; it does not certify the purchased concept as a production engine.

The main `EngineStudio` API now resolves to `v12-studio.ts`. The former renderer remains in `legacy-engine-studio.ts` for historical inspection and is not instantiated by the main scene.

## Actual source geometry

The scene loads the purchased V12 GLB and its shared registry. All 1,253 source occurrences retain their source IDs. Twenty-four decorative white lettering bodies are excluded from the default presentation, leaving 1,229 mechanical/display occurrences. An explicitly selected decorative body remains accessible for inspection; originals are unchanged. The previous authored piston/rod/liner/crank overlay is not instantiated.

One matrix evaluation drives the actual source object, its shadows, raycasting and section masks. Crank/rod/piston motion comes from `V12Mechanism`; the renderer does not add a second mechanism. The source motion audit records existing source piston/block contact and unresolved timing-drive behavior. Engine running does not certify clearance or combustion timing.

## Presentation

- Assembly separation applies translation only. It does not change the camera, floor, light positions or component scales. Fit is an explicit action.
- System-directed offsets replace a radial offset per mesh. Chains stay coherent; measured bank identities keep corresponding pistons and rods together. Individual component removal has a separate nonzero retreat, including the otherwise stationary block and crankshaft.
- The studio floor is fixed below the assembled source. The sump moves to a separate side station during disassembly so it does not penetrate that floor.
- Named reveal states remove covers or expose the rotating mechanism/valve train. Full source selection and search remain available.
- The parts atlas uses translations at one physical scale. It uses an orthographic camera, packs systems and components, keeps chain loops together, and adds screen-space system labels. The engine camera is preserved on atlas entry and restored on return. Component motion blends toward the supplied rest pose during the layout transition rather than snapping.
- Source names appear on pointer-rest hover. Hover raycasting is delayed until pointer movement settles and disabled during dragging.
- Materials retain source appearance interpretation. Engine-system flow choices currently highlight the corresponding actual source geometry; these are not CFD particles, measured flow fields or calibrated combustion effects.

## Sections

The section plane supports axis, offset, retained side, guide visibility and optional `[pitch, yaw]` rotation. Only engine geometry is clipped. `MovingSectionCaps` evaluates original source triangle winding with each component's current matrix and preserves holes in closed mesh topology. The renderer supplies complete actual source components and broad-phase section bounds; it does not fill bounding boxes.

Native solid validity and browser-mesh watertightness are distinct claims. Existing primitive cap tests and the real-rod motion regression are useful evidence, but they do not certify every possible plane through every simplified source body. Source topology and moving-solid clearance limitations remain in the native and motion audits.

## Rendering decisions

The scene uses Three.js WebGL, image-based studio lighting, fixed key/fill/rim lights, bounded pixel ratio and PCF shadows in a limited fixed shadow volume. Minor fasteners, valve train and timing detail do not cast expensive separate shadows; major components still cast and the surfaces receive shadows. A VSM trial caused severe preview stalls and was reverted. It must not be re-enabled without a representative performance test.

`getDiagnostics()` reports source/visible counts, phase, presentation state, camera/floor/light transforms, section-cap counts, matrix determinant checks, draw calls and triangle submissions. Its `renderMilliseconds` value is CPU submission duration, not a GPU timer or frame-rate guarantee. The root browser QA provides the end-to-end presentation evidence separately.

## Checks completed by the renderer implementation

- `pnpm check`: zero errors and warnings.
- Targeted ESLint on the new renderer, layout and layout tests: passed.
- Nineteen targeted tests across `v12-layout.test.ts`, `v12-mechanism.test.ts` and `section-plane.test.ts`: passed.
- Layout checks cover all 1,253 IDs, including the old table-limit overflow, retained physical dimensions, nonoverlapping independent cells, measured piston/rod bank assignment, rigid chain loops and decorative exclusions.
- Early browser inspection confirmed the actual source engine, a capped X section with genuine openings, and the atlas. Lighting, framing and labels were then refined; final cross-mode browser acceptance belongs to the coordinated main-application QA rather than these earlier screenshots.
