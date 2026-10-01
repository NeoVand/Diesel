# Native WebGPU renderer verification

Checked 1 October 2026 using headless Google Chrome with its real WebGPU adapter, at a 1440 × 1000 browser viewport. This is an interactive renderer migration, separate from the JAX-JS numerical-compute verification.

## Implementation

- The engine, generated-design viewport, component previews, and source-asset review use Three.js `WebGPURenderer`. The shared initializer rejects missing WebGPU and disables Three's automatic WebGL fallback. Unexpected device loss preserves the renderer's lost-state bookkeeping and reports a reload instruction to the interface.
- The main engine preserves the 1,229 source mechanical bodies and their existing rigid/deforming transforms. Materials retain source metadata and independent component opacity. Native TSL nodes implement roughness grain, antialiased piston-skirt normals, and smooth shadow coverage when casings return from X-ray.
- Sections use `ClippingGroup` and actual triangle winding in per-component stencil intervals. The cut face clears its own stencil interval inside the GPU pass; genuine bores stay open. The section-affected material variants compile before the loading screen closes, avoiding first-use stalls.
- Atlas previews use one native WebGPU canvas with top-left viewports. Partially scrolled cards use an orthographic projection crop, so geometry stays aligned to its card and the viewport never extends outside the attachment. GPU readback for still previews restores the live render target before yielding.
- Process volumes use native WGSL/TSL. The depth prepass retains the same scene hierarchy and section caps. Two pinned-Three compatibility details are regression-tested: a single-sample placeholder depth target during MSAA warmup, and a depth-only sampled view of the combined depth/stencil attachment.

## Observed results

[Full engine record](webgpu-engine-smoke.json) covers exterior, running exterior, X-ray, restored exterior, moving section, mechanism with all four process channels, exploded assembly, 3D parts arrangement, and component atlas. Every recorded state used the WebGPU backend. There were no GPU validation or shader errors. The single console warning was an unrelated request for `/favicon.ico` returning 404 in development.

The section transition settled in 1.618 seconds. A subsequent two-second window produced 121 frames, with 33 capped source components. Sampled JavaScript render-submission times were approximately 7–9 ms for the running engine and 9.3 ms with the four process channels visible. These are local observations, **not GPU timestamp measurements or a performance guarantee**. First-frame setup was substantially slower and is covered by the loading state.

[Atlas record](webgpu-atlas-smoke.json) covers live rotation, pause, partial-row scrolling, and the air/fuel/cooling category filter. It reports no application or GPU errors. Images were visually inspected after correcting the viewport origin:

- [Source assembly](webgpu-engine-assembly.png)
- [X-ray](webgpu-engine-xray.png)
- [Solid moving section](webgpu-engine-section-settled.png)
- [Mechanism and process volumes](webgpu-engine-mechanism-processes.png)
- [3D arrangement](webgpu-engine-arranged.png)
- [Component atlas](webgpu-engine-atlas.png)
- [Scrolled atlas](webgpu-engine-atlas-scrolled.png)
- [Filtered atlas](webgpu-engine-atlas-filtered.png)

Sixteen focused unit tests passed for cap winding/picking, source-material detail, material pooling, piston filtering, and atlas-preview isolation. The independent GPU process tests are documented in [process-webgpu.md](process-webgpu.md).

## Scope

This verifies rendering and interaction, not engine-design certification. Source clearances, timing corrections, illustrative combustion, prescribed operating loads, and the distinction between source geometry and generated parametric geometry retain their existing limitations. Native WebGPU rendering does not imply that the exact CAD kernel or Float64 tetrahedral solve runs on the GPU; those run locally in browser workers.

## Primary references

- [Three.js WebGPURenderer](https://threejs.org/docs/pages/WebGPURenderer.html)
- [Three.js ClippingGroup](https://threejs.org/docs/pages/ClippingGroup.html)
- [Three.js r186 WebGPU stencil-clipping example](https://github.com/mrdoob/three.js/blob/r186/examples/webgpu_clipping_stencil.html)
- The installed Three.js r186 source is the implementation reference for node conversion, shadow masking, render-target readback, and backend depth-view caching.
