# Purchased geometry, native recovery and teaching renderer

> Scope note: this document describes the historical Caterpillar prototype. The purchased generic V12 has a separate [native audit](../references/00_Active_V12/V12_NATIVE_AUDIT.md) and [migration plan](../references/00_Active_V12/APP_MIGRATION_AUDIT.md); these old specifications do not apply to it.

The application combines the user-purchased **3DCADBrowser asset 156826**, a generic 3512 exterior, with a separately authored educational mechanism. The engineering reference remains the provisional short-stroke 3512C / 51.8 L / 1800 rpm configuration in `references/99_Archive/Caterpillar_3512_2026-09-29/CONFIGURATION_LOCK.md`. Neither the commercial asset nor its recovered native labels establish an OEM engine arrangement or serial prefix.

## Durable source and runtime artifacts

| Item                                    | Location / property                                                                                                           |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Purchased OBJ source                    | `references/3dfiles/156826_obj.zip`                                                                                           |
| Seller                                  | [Caterpillar 3512 generator engine, asset 156826](https://www.3dcadbrowser.com/3d-model/caterpillar-3512-generator-engine)    |
| OBJ member                              | `156826_Caterpillar_3512_Generator_Engine/156826_Caterpillar_3512_Generator_Engine.obj`                                       |
| Converter                               | `scripts/prepare-engine.mjs`                                                                                                  |
| Browser asset / conversion audit        | `static/models/engine.glb` / `engine.manifest.json`                                                                           |
| Original / runtime triangles            | 3,280,842 / 965,744                                                                                                           |
| Original / runtime source groups        | 587 / 587                                                                                                                     |
| Runtime GLB size                        | 31,545,304 bytes                                                                                                              |
| Runtime SHA-256                         | `635eb9c12480f14cfad886f668931b0473d317fad4f770b95ba57073b3288d35`                                                            |
| Native audit / mapping                  | `references/99_Archive/Caterpillar_3512_2026-09-29/09_Geometry_Integration/NATIVE_CAD_RECOVERY.md` / `NATIVE_STEP_AUDIT.json` |
| Integrated qualified labels             | `src/lib/scene/native-source-provenance.ts`                                                                                   |
| Authored teaching geometry              | `src/lib/scene/educational-mechanism.ts`                                                                                      |
| Teaching kinematics / shared controller | `src/lib/engine/mechanism.ts` / `lab-state.ts`                                                                                |

All seven purchased archives remain untouched and passed ZIP CRC validation; filenames, sizes and archive SHA-256 values are preserved in `references/99_Archive/Caterpillar_3512_2026-09-29/09_Geometry_Integration/PURCHASED_ASSET_INVENTORY.json`. The browser receives the OBJ-derived runtime GLB, not native authoring files or the larger recovered STEP derivative. Purchase terms govern geometry, derived assets and screenshots; confirm the intended browser/public distribution against the accepted license before publishing. This work did not deploy the site.

## OBJ conversion and display coordinates

The converter reads an extracted copy, triangulates polygons and indexes source position/normal pairs per group. `meshoptimizer` 1.3.0 simplifies large groups with normal-aware attributes, a 0.23 target ratio and maximum relative error 0.002 per group. Small groups retain their available geometry or a minimum target budget of 400 triangles; error limits can retain additional detail. No source group is dropped. The manifest records bounds, vertices, triangle counts and observed relative error; the maximum observed error is approximately 0.00199996936. This is a geometric simplification budget, not a manufacturing tolerance.

The unsimplified comparison GLB remains in scratch (3,280,842 triangles / 98,069,840 bytes). It is excluded from the application. The durable commercial baseline is the purchased archive.

The OBJ is Z-up with its long dimension on X. The scene applies an X-axis −90° rotation, scale 0.003 and vertical recentring: its 2,000 source-unit length becomes six presentation units. These are **display coordinates, not approved physical millimeters**.

The native comparison established a further unit/coordinate difference. STEP declares millimeters; native-to-OBJ correspondence is approximately:

```text
OBJ x =  0.6909445208 * STEP x - 674.942246
OBJ y = -0.6909445208 * STEP z
OBJ z =  0.6909445208 * STEP y + 362.471077
```

Do not measure an OBJ dimension and call it millimeters. Do not apply the visual alignment to manufacture parts or infer chamber, passage or installation dimensions. The educational rig uses nominal bore/stroke and its own 0.003 mm-to-display factor; its placement beside/inside the presentation is authored, not a physically registered internal overlay. Combined assembly/section views additionally scale the rig to inferred source cover pitch and bank centers, so that display factor does not make the embedded geometry a physically registered or measurable OEM interior.

## Native STEP recovery and qualified labels

STEP AP214 metadata identifies Autodesk Inventor 2021, a 5 July 2020 export and root product `3512-1`. Some product labels explicitly contain `3512B`; no verified 3512C arrangement/serial identity was recovered. Forty-five `Generic` material names and placeholder density values are not usable physical material properties.

`occt-import-js` 0.0.23 imported the hierarchy but produced zero triangles with both default and absolute-deflection settings; its bundled cube triangulated correctly. A scratch-only native OCP 8 pass meshed individual solids/shells and recovered **589 nonempty meshes, 3,566,011 triangles and 2,859,511 vertices from 594 topology pieces**. Five pieces remain unbounded/empty. 99 pieces returned nonzero mesher status, including 95 with a failure bit; nonempty geometry is not proof of complete triangulation. Only the first five solids underwent explicit native topology validity checks.

The successful approximately 74 MB derivatives, `native-ocp-engine.glb` and `native-ocp-named.glb`, remain in the task's `work/native-cad` scratch directory. They are audit artifacts, not replacements for the runtime GLB. Native rendered isometric and center-section images are retained with the recovery report. That inspection did **not** establish a complete authentic piston–rod–crankshaft mechanism. The application’s working internals remain educational.

Topology bounds and face counts uniquely link 589 recovered mesh records to 45 native product occurrences. Actual triangulated bounds then establish correspondence to existing OBJ groups:

| Mapping classification | OBJ groups | Current use                                                                                                                                                            |
| ---------------------- | ---------: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `high-geometry`        |        569 | Integrated as qualified vendor CAD labels, with stable `Frame_*` IDs. All 569 associations are bijective; maximum residual 0.679 and median 0.089 visual-export units. |
| `candidate-geometry`   |          6 | Retained in audit; omitted from live provenance labels.                                                                                                                |
| `unresolved`           |         12 | Retained as unresolved; no candidate product label applied.                                                                                                            |

High correspondence requires a maximum bound residual below one visual-export unit and a runner-up more than two units worse. Bounding boxes establish cross-export geometry association, **not OEM part identity or function**. The registry exposes optional `cadProduct` and an explicit provenance qualification. Nine subsystem categories still use inspected regions and position/size heuristics; their functions remain visual interpretations.

## Format inspection status

| Format    | Actually inspected                                                                                                                      | Still unverified                                                                                                          |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| OBJ / MTL | All 587 groups converted and visually presented; one face material assignment, two simple MTL colors, no UV coordinates/image textures. | Serial applicability, physical scale/materials and internal completeness.                                                 |
| STEP      | Header/entities, native XDE labels, per-piece recovery, bounds mapping, exterior and center-section render.                             | Five failed pieces; full topology/face completeness; physical material fields; production internal mechanism and OEM BOM. |
| FBX       | Metadata found 587 model/geometry records, flat root hierarchy and one material; no texture/animation records found.                    | Full scene/material visual audit and geometry correspondence.                                                             |
| BLEND     | Archive integrity and gzip-compressed native payload identified.                                                                        | Scene hierarchy, embedded materials, rigging and internal completeness have not been visually audited.                    |
| IGES      | Archive integrity and member inventory.                                                                                                 | Native import, topology/geometry comparison and visual inspection.                                                        |
| MAX / C4D | Archive integrity and member inventory.                                                                                                 | Authoring-app inspection, hierarchy, materials, rigging and internal completeness.                                        |

Uninspected formats remain sources to evaluate later, not evidence of hidden internals or superior materials. Unsupported proprietary authoring tools do not block the current teaching demonstration.

## Renderer and component interaction

`EngineScene.svelte` mounts and synchronizes browser-only resources through Svelte 5 attachments. `engine-studio.ts` owns Three.js WebGL 2 rendering, demand-driven frames, disposal, picking, camera fitting and actual scene snapshots. WebGPU/`vgpu` is not the current runtime; migration should follow a measured limitation and preserve the controller contract.

Source geometry is batched by subsystem **and display finish**, while a GPU part-state table preserves all 587 individual identities for highlight, visibility and removal. Explosion offsets, shadow depth and AO normal passes use corresponding transforms. Independent raycast proxies follow displayed offsets, so selecting a source body returns its exact `Frame_*` ID. Semantic category selection remains available; separation/removal is authored visualization, not a verified service disassembly procedure.

The scene uses local image-based lighting, studio key/fill/rim lights, PBR roughness/clearcoat and modest authored surface grain. Yellow paint, iron, steel, aluminium, bronze, rubber and exhaust finishes are **display interpretations**; no production alloy, coating or photographic texture fidelity is claimed. GTAO supplies contact readability. Device pixel ratio is capped at 1.25; shadow maps are 2048² and refresh once per frame; AO uses half-resolution targets and eight samples. Hidden source vertices are rejected before rasterization, and fully hidden batches are skipped. Draw counts vary with finish batches, educational components, overlays and render passes; no universal FPS guarantee is made.

The authored studio environment uses controlled reflection cards, a directional key, cooler fill, contact occlusion and a charcoal shadow receiver. Source anisotropy is disabled because the purchased OBJ has neither UV coordinates nor tangent vectors; using an anisotropic reflection basis on that mesh caused the white highlight artifacts. Teaching meshes retain material features supported by their own surface attributes.

The four displays have distinct inspection scopes:

- `assembly`: purchased exterior with optional authored internals, individual source/teaching selection, explosion/removal and subsystem navigation.
- `section`: the combined engine clipped by a movable X/Y/Z plane, with reversible retained side and an optional plane guide.
- `cylinder`: a focused educational cylinder with sectioned liner/head structure, crank/rod/piston, valves, injector and cut faces.
- `mechanism`: the full educational V12, representative bank/crank layout, half-speed cam indication and enabled schematic fluid routes.

The internal rig is placed against visually inferred block/bank locations. This improves spatial explanation and exploded exploration without establishing OEM physical registration. Section surfaces cannot supply missing source geometry. Double-click picking resolves the front visible component; clipped surfaces are excluded from hit selection.

Section faces are derived from triangle/plane intersections on selected major source solids. Only closed contours are triangulated, with nested holes retained. Open contours are skipped. With teaching internals enabled, the unverified main casting uses an intersection boundary instead of a solid cap that would hide the instructional mechanism. This selective cap policy does not establish authentic bore, passage or wall geometry.

The 350 mm rod, detailed chamber/valve/cam geometry, layout and timing are explicit assumptions. Core motion uses nominal 170 mm bore / 190 mm stroke and a constrained slider-crank. See [simulation scope](SIMULATION_SCOPE.md) for event conventions, fixed-speed performance limits and the physical-versus-illustrative distinction.

## Review findings and remaining work

Independent review corrected flow arrows crossing closed teaching valves/injectors, pin/bushing interference, paired-rod overlap, a continuous shaft intersecting rods at BDC, phase slowdown on low frame rates and repeated checkpoint-camera resets on unrelated actions. The focused cylinder study now has a local cylinder phase rather than silently using cylinder 01’s stroke; agent observations expose the same educational offset convention. TDC head/valve clearance and pin connections are coherent for this authored mechanism, not manufacturing validation.

Camera snapshots capture actual pose/target, with seek/reset tokens separated from discrete revision. Restoration now clears old orbit/pan/dolly inertia before applying the saved pose; a seeded actual-OrbitControls check stayed within 3.202e-15 display units over 120 subsequent updates. Transition acknowledgement also waits for control movement/dragging to settle. Exact development check/report paths are listed in [Simulation scope](SIMULATION_SCOPE.md). The remaining engineering work is production identity/geometry validation, failed STEP-piece investigation, measured material/clearance/flow data and full format audits—not visual reinterpretation of labels as OEM truth.

## Reproduction

Extract the purchased OBJ to scratch, preserving its archive, then run:

```sh
node scripts/prepare-engine.mjs /absolute/path/to/copied-engine.obj static/models/engine.glb
```

The converter writes a sibling manifest. For an unsimplified scratch comparison use `ENGINE_SIMPLIFY_RATIO=1` with an output outside `static`. Native recovery steps, scratch dependency versions, scripts and inspection images are documented in [NATIVE_CAD_RECOVERY.md](../references/99_Archive/Caterpillar_3512_2026-09-29/09_Geometry_Integration/NATIVE_CAD_RECOVERY.md). Re-run correspondence after changing source geometry; do not retain stale labels merely because IDs still exist.

Primary implementation references: [meshoptimizer API](https://github.com/zeux/meshoptimizer/blob/master/js/README.md), [Three.js GLTFLoader](https://threejs.org/docs/#GLTFLoader), [OpenCascade meshing](https://dev.opencascade.org/doc/overview/html/occt_user_guides__mesh.html), [OCP bindings](https://github.com/CadQuery/OCP), [Svelte attachments](https://svelte.dev/docs/svelte/@attach).
