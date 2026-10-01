# Browser CAD and solid elasticity verification

Verified on 1 October 2026. The runtime implementations are in `src/lib/browser-cad/`.

## What moved into the browser

- The authored five-parameter rod is constructed with OpenCASCADE boolean operations through Gmsh WebAssembly: two eyes, three I-section layers, and the two through-bores.
- STEP export preserves the analytic curved faces. Each export checks a single connected volume, compares it against an independent analytic union-volume calculation, and imports the STEP back into the kernel to check its volume and solid count.
- Gmsh generates a conforming first-order tetrahedral volume mesh of that same CAD domain.
- A dedicated browser worker assembles and solves the full three-dimensional linear elasticity system in Float64. Sparse CSR storage, diagonal scaling and IC(0)-preconditioned conjugate gradients keep the solve bounded without a dense matrix.
- The fixed big-bore fixture, cosine-weighted small-bore traction, and optional consistent rigid-body inertia loads match the declared native reference problem. No beam solution substitutes for a solid result.
- The worker returns the same structural result contract, including recovered surface tensors, volume-weighted element stress statistics, reactions, energy, refinement history and provenance. Cancellation terminates the worker; the next calculation starts a clean instance.

This numerical solve uses browser CPU Float64, while the geometry and meshing kernel uses WebAssembly. It is not a WebGPU elasticity solver. GPU screening is a separate computation path.

## Checks

`pnpm exec vitest run src/lib/browser-cad --project server`

The tests exercise the shipped WebAssembly binary without a Python interpreter. They include:

1. An affine displacement patch with a free interior node, uniform recovered element stress, and a checked residual.
2. Rigid translation and rotation invariance; a collapsed tetrahedron is rejected.
3. Exact STEP export and volume checks at the baseline and two parameter-bound extremes.
4. Two independently remeshed rod solutions compared with the saved native Gmsh/scikit-fem fixture.
5. Three-level refinement with prescribed cycle forces and rigid-body inertia, compared with the saved native deep-refinement case.

| Independent reference comparison               | Displacement difference | Strain-energy difference |
| ---------------------------------------------- | ----------------------: | -----------------------: |
| Baseline rod, two mesh levels                  |                −0.4784% |                 −0.1055% |
| Thin candidate with inertia, three mesh levels |                +0.0485% |                 +0.0621% |

The native reference uses Gmsh 4.15.2; the browser package exposes Gmsh 5.0.0. They produce different meshes, so these checks compare integral responses, not nodal identity. The regression acceptance band is 5%, and actual differences are considerably smaller. This is numerical verification of the stated demonstrator problem, not physical validation of an engine rod.

## Actual browser execution

[Machine-readable Chromium report](browser-cad-solid.json) records an actual module-worker run on the Design page, with all `/api/**` requests blocked:

- Cross-origin isolation active; no API requests and no page errors.
- STEP: 54,596 bytes. Relative analytic volume error `3.64e-16`; STEP round-trip relative volume error `4.46e-14`.
- Two-level solid analysis: 11,897 tetrahedra, 3,784 nodes, approximately 1.22 seconds for geometry, both meshes and solves on the verification machine after module loading.
- True linear-system residual `7.89e-11`; force equilibrium error `2.52e-11`; moment equilibrium error `3.92e-12`.
- Aborting a calculation returned `AbortError`; a subsequent STEP export succeeded.

Timings depend on hardware, browser, concurrent rendering and initial module download. The approximately 40 MB WASM asset is loaded only when CAD or solid analysis is first requested, and the worker is reused until disposal or cancellation.

The production static build was then served by a file server with `/api` returning 404 and no SvelteKit application runtime. Through the actual UI, **Verify exact solid** completed its checks, **Download STEP** downloaded the STEP file, and **Solve this load case** displayed the solid stress field (5,881 elements / 1,970 nodes, approximately 2.37 seconds from click to result). There were no API requests or page errors. The [static UI screenshot](browser-static-solid.png) records that result.

## Operational constraints

The threaded Gmsh WASM build needs `SharedArrayBuffer` and cross-origin isolation. A static host can serve COOP/COEP headers; GitHub Pages uses the bundled isolation service worker and an initial reload. The worker reports a capability error if isolation is unavailable. The browser does not call a native service as a fallback.

The mesh budget remains 45,000 nodes / 160,000 linear tetrahedra. Nonconverged systems, volume mismatches and equilibrium failures are rejected. Sharp-shoulder and fixture stress singularities retain the original limitations; raw peak stress is not a strength criterion.

Primary implementation sources: [Gmsh WASM browser integration](https://loumalouomega.github.io/GMSH-JS/guide/browser/), [Gmsh meshing API](https://loumalouomega.github.io/GMSH-JS/guide/meshing/), and the [Gmsh WASM source and licence](https://github.com/loumalouomega/GMSH-JS). The Gmsh package is GPL-2.0-or-later; distribution must preserve its corresponding licence and source obligations.
