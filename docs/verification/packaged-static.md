# Packaged static deployment check

Checked 1 October 2026 against `http://127.0.0.1:4202/Diesel/`, using a fresh Google Chrome browser context. The file server supplied **neither COOP nor COEP response headers** and had no application backend.

## Browser resource decoding and renderer

The application registered `/Diesel/coi-serviceworker.js` and reloaded into a `crossOriginIsolated` document. Instrumented browser Web Crypto calls recorded six AES-GCM decodes of five distinct resources, including a repeated clearance-binary decode. The decoded output sizes and SHA-256 digests matched the application's expected values for all five resources:

- `v12-review.glb`
- `v12-cams-refined.glb`
- `v12-clearance-refined.json`
- `v12-clearance-refined.bin`
- `v12-chamber-domains.bin`

The browser made 24 encrypted-chunk requests covering 12 distinct resource chunks, with repeated requests during loading. It requested no raw geometry files and made no `/api/` requests. Direct requests outside the application for the raw GLB and clearance binary returned 404. The only requested graphics canvas context was `webgpu`; no WebGL context was requested. The decoding key is a resource-packaging mechanism, not DRM or a secret API credential.

The running exterior, X-ray, X/Y/Z moving sections, mechanism with all four process channels, and component atlas were exercised and screenshots visually inspected. There were no console, page, shader, or GPU validation errors. A hard reload of `/Diesel/design/?workspace=analyze` also succeeded.

[Network and decoding evidence](packaged-static-smoke.json) · [X/Y/Z cut screenshots](packaged-static-section-x.png), [Y](packaged-static-section-y.png), [Z](packaged-static-section-z.png) · [processes](packaged-static-processes.png) · [atlas](packaged-static-atlas.png)

## Browser CAD and solid solve

A separate fresh context opened the nested Design and Analyze routes directly. Gmsh and its WebAssembly runtime loaded from `/Diesel/vendor/gmsh/`; the module worker loaded from `/Diesel/_app/immutable/workers/`. Both operations completed without application API calls or browser errors.

- **Exact solid:** 1 valid solid, STEP round trip passed, 39,984.27 mm³ volume, relative analytic-volume error 3.64 × 10⁻¹⁶. The downloaded STEP was 54,596 bytes, had the ISO-10303-21 header and one `MANIFOLD_SOLID_BREP` entity. [Evidence](packaged-static-step.json), [screenshot](packaged-static-step-verified.png).
- **Solid elasticity:** the selected 35° / 1,800 rpm case produced 5,881 elements and 1,970 nodes. The UI reported interior P95 recovered stress of 67.1 MPa, maximum displacement of 28.37 µm, and equilibrium residuals below 10⁻⁵. Case JSON export worked. [Worker/network evidence](packaged-static-solid.json), [rendered result](packaged-static-solid-result.png).

These values verify that the static browser build executes the intended operations. They do not establish mesh convergence, bearing-contact accuracy, fatigue life, or calibrated engine performance. The test did not run a new refinement study; the existing numerical validation records remain the source for solver accuracy checks.
