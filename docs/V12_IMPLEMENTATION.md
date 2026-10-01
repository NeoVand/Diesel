# Historical: V12 integration and verification

> **Superseded implementation snapshot.** This document records an earlier V12 migration milestone. Its static-motion, flow, source-clearance and verification descriptions are historical, not the current application contract. For the implemented running rig, declared geometry corrections, process models and current acceptance evidence, read [V12 running-engine release](V12_RUNNING_ENGINE_RELEASE.md).

30 September 2026

The main application now uses the purchased generic V12 through a shared source definition. `/asset-review` remains an audit viewer. It is not the product interface.

## Shared engine identity

`src/lib/engine/definition.ts` defines the asset/version, measured geometry, source registry, evidence and qualifications. Its 1,253 distinct source occurrence IDs are retained across inspection, layout and guide control. Twenty-four cam-cover lettering bodies are classified as presentation decoration; purchased originals and catalog identities remain intact. Source-body counts are not a certified inventory of independently manufacturable parts.

Measured design dimensions are 85 mm bore, 100 mm stroke, 50 mm crank throw, 125 mm rod centers and 60-degree banks. The computed displacement is 6.8094 L. No production serial, rated speed, compression ratio, power, fuel, boost, emissions or thermal calibration is supplied for this concept.

`data.ts` provides neutral system explanations using the existing nine navigation categories. `lessons.ts` and `demo-tour.ts` reference these actual components. The old numerical report remains isolated in historical reference modules; active guide requests do not include it.

## State and renderer contract

UI controls, lessons and the guide share `LabState` and `applyLabAction`.

- States and checkpoints carry the asset ID and version. A mismatched checkpoint is rejected.
- Named reveals are `complete`, `covers`, `rotating` and `valvetrain`.
- Whole-engine sections carry axis, normalized offset, retained-side flip and guide visibility. Optional rotation is `[pitch, yaw]` in degrees.
- The camera snapshot retains position, target and optional orthographic zoom. Layout determines the projection.
- Atlas views pause operation and clear flow presentation. Separation or lifted parts also forces `running: false`. The live guide cannot claim a run command succeeded while the mechanical assembly is disconnected.
- Mechanical phase means global crank rotation from the supplied source pose. It does not establish compression TDC, local combustion phase or firing order.
- Actual sampled phase and camera are separate from the discrete command revision. Continuous motion must not make every command stale.

The renderer articulates actual source crank, piston and rod geometry. Camshafts, valves and chains remain static pending complete drive/timing validation. Source material labels preserve appearance provenance; display finishes are not production material properties.

System flow actions currently emphasize relevant hardware with color. They do not render a CFD field, animated path tracers, injected spray or a calibrated combustion event. The guide's live presentation describes this limitation explicitly.

## AI and audio integration

The existing Codex harness and authenticated browser-scene service remain in use. The backend validates IDs against the V12 catalog, permits the complete 1,253-body registry and bounds the registration request at 1 MiB. Legacy `Frame_*`, generated `mech:*` and invented source IDs are rejected at the live-session boundary.

Commands travel through the existing browser-scoped SSE channel. The browser applies the shared reducer, waits for its scene transition, samples state, then acknowledges the result. Only a matching acknowledgement establishes success. Cancellation invalidates the run and late acknowledgements. Saved checkpoints restore through the same execution path.

The active guide receives V12 evidence and measured geometry. Numerical operating-point tools and legacy load actions are unavailable. The context does not include the old engine's performance report. Lesson and narration status are observable, but direct guide tools for starting arbitrary lessons or audio remain outside the current contract.

Server-key access, invitation-password sessions, optional in-memory BYOK and narration cleanup are preserved. Provider credentials are excluded from scene state and browser storage. Spoken narration is an explanation, not modeled engine acoustics.

## Known source-design limits

The [motion verification](V12_MOTION_VERIFICATION.md) records sampled checks of actual browser triangles and selected unsimplified source comparisons. Small piston/block support-corner intersections appear near bottom dead center, including a contact in the supplied rest pose. Zero nominal bearing clearances also limit any running-fit claim. The source is useful for explaining its geometry; it is not established as manufacturing-ready or fully clearance-validated.

These limitations are exposed through the `V12_MOTION` evidence source and active guide context. No piston shrinking, shaft relocation or concealed block-material removal should be used to make the design appear verified.

Native solid checks, analytic linkage closure, browser cut-face quality and continuous mechanical interference are different validation questions. Passing one does not establish the others.

## Verification coverage

The unit/integration suite covers full-catalog registration, the highest source ID, stale/unknown identities, safe scene validation, run rejection during separation, rotated-section snapshots, atlas zoom snapshots, asset-version rejection, acknowledged execution, Stop/cancellation, credentials, narration WAV handling and isolated native harness execution. The real installed Codex runtime test uses local mock inference and the actual broker/MCP handler; it does not spend a provider request.

The migrated browser regressions are in `tests/engine.e2e.ts` and `tests/layout-guide.e2e.ts`. They cover source search/isolation/removal, persistent separation, named reveals, section controls, run/pause/seek, atlas restoration, offline BYOK/narration, lesson interruption, evidence and a narrow viewport. All model/audio requests are mocked. The acknowledged-layout test exercises the real browser SSE parser and command executor with a controlled stream. The prior engine's suites are preserved as `tests/legacy/*.historical.ts` and are excluded by the default browser-test filename pattern.

Browser tests were authored and type-checked during this integration pass; they were not launched from the command line. Live visual acceptance and presentation-device performance must be recorded separately. DOM assertions alone cannot prove correct cut contours, stable shadows, physical part scale or acceptable frame timing.

Useful checks:

```sh
pnpm test:unit --run
pnpm check
pnpm lint
pnpm test:e2e
```

The browser suite starts the local production preview configured by `playwright.config.ts`. It should be run as an explicit QA workflow with the purchased runtime derivative available locally.
