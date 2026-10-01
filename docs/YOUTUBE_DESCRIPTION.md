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

Chapters

00:00 From mechanism to measurement
00:39 Part I — Geometry, identity and inspection
01:25 Part II — Sections and component organization
02:16 Part III — Connected motion and gas exchange
03:14 Part IV — A declared cylinder model
04:10 Part V — An assistant with bounded scene tools
05:01 Part VI — A bounded parametric family
05:57 Part VII — WebGPU screening with independent checks
07:05 Part VIII — Exact solids and browser finite elements
08:12 Part IX — Comparing results and preserving a study
09:17 Part X — Static deployment and reproducibility
10:11 Part XI — Development and conclusion
