# Engine Lab — WebGPU, parametric CAD and finite elements in the browser

A technical tour of a V12 diesel concept: inspect its running mechanism, reveal internal parts with X-ray and sections, change a generated cranktrain and connecting rod, then compare designs using numerical evidence.

The application uses WebGPU for 3D rendering and JAX-JS design screening. Exact CAD, meshing and double-precision finite-element analysis run locally in browser workers and WebAssembly. GitHub Pages serves static files; optional AI calls OpenAI directly with a visitor-provided key.

The mechanical and flow views are teaching models. The calculations expose their assumptions and verification checks; they are not a validated production-engine design.

Try it on a desktop with WebGPU:
https://neovand.github.io/Diesel/

Source and screenshots:
https://github.com/NeoVand/Diesel

Setup guide:
https://github.com/NeoVand/Diesel/blob/main/docs/RUNNING.md

Numerical methods and verification:
https://github.com/NeoVand/Diesel/blob/main/docs/COMPUTE_ARCHITECTURE.md

JAX-JS: https://github.com/ekzhang/jax-js
Gmsh WebAssembly: https://github.com/loumalouomega/GMSH-JS
Three.js: https://threejs.org/

British narration generated with ElevenLabs. The first prototype took roughly two days, followed by the browser-runtime migration and verification shown here.
