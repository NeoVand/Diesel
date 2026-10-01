# Process visualization on native WebGPU

The combustion chamber, connected intake/fuel/exhaust envelopes, and measured exhaust-mouth plumes use Three.js node materials with WGSL ray-march functions. Soft native-passage tracers and liquid-fuel parcels use instanced sprite billboards. WebGPU point primitives are restricted to one pixel, so retaining ordinary `Points` would have silently destroyed their soft volumetric appearance.

The process state remains driven by the existing recovered geometry, valve timing, declared injection/reaction model, and continuous flow clock. This migration changes rendering, not the scope or accuracy of the teaching models. Plume density and combustion emission remain illustrative optical quantities, not computed emissions, flame temperatures, turbulent reacting CFD, or radiometry. The native-passage paths remain precomputed idealized potential-flow solutions.

## Executable verification

With a local development server running:

```sh
node scripts/verify-process-webgpu.mjs http://127.0.0.1:5173
```

The script launches local Chrome, requires a real WebGPU backend, and uses synthetic chamber bounds rather than purchased geometry. It fails on browser exceptions, GPU validation errors, invisible or frozen volumes, incorrect section clipping, opaque-depth leakage, a regression to one-pixel particles, incorrect per-vertex particle indexing, or lost Gaussian alpha. Numeric pixel evidence from a passing run is in `process-webgpu.json`.

The tested conditions include:

- shader warmup against an MSAA canvas before the first depth pass;
- a combined depth/stencil attachment, preserving section-cap stencil operations;
- a subsequent single-sample depth texture replacing the warmup placeholder;
- temporal changes in each optical shader;
- a section plane leaving a visible partial volume;
- an opaque wall reducing chamber and exhaust volume contribution to zero;
- directed through-solid teaching connections retaining their intended attenuated visibility;
- four separated soft particles with independent colours, an empty gap between them, measurable Gaussian brightness falloff, correctly uploaded position changes, and section clipping.

The multi-instance regression check was also run with ordinary per-vertex storage injected in place of the instanced buffers. It correctly rejected the resulting stretched geometry. The earlier single-particle check could not detect this failure.

## Three r186 compatibility boundaries

An unowned depth texture inherits the current canvas sample count in Three r186. Each placeholder is therefore explicitly owned by a single-sample render target. WebGPU projection depth is already in `[0,1]`, so the legacy WebGL depth conversion is removed.

Three r186's sampled-texture binding helper selects an `all` aspect view for combined depth/stencil textures. WebGPU requires a `depth-only` sampled view. `process-depth-view.ts` seeds that one cached view while leaving the full attachment available for section caps. The helper depends on the pinned Three r186 cache key and must be reconsidered when upgrading Three. The actual-GPU test deliberately exercises this attachment format, rather than relying on a depth-only test substitute.

Three r186's `instancedBufferAttribute` helper does not turn an existing ordinary vec3/vec4 attribute into per-instance storage. The renderer therefore uses explicit `InstancedBufferAttribute` objects, with CPU updates targeting those same attributes. A custom `colorNode` also bypasses Three's diffuse-map path, so the Gaussian texture is sampled explicitly; otherwise parcels become flat square billboards.
