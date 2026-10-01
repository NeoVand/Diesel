# Running Engine Lab

This guide describes the `browser-first` branch. The built application needs a static file host, not a Node application backend or Python solver installation. The former setup is preserved in [the historical running guide](archive/RUNNING_NODE_BASELINE.md).

## Install and start

Use **Node 24** and **pnpm 12.4.2**, as declared in `package.json`. The verified development environment used Node 24.21.0. These are developer/build tools; visitors do not install them.

```sh
git clone --branch browser-first https://github.com/NeoVand/Diesel.git
cd Diesel
npm install --global pnpm@12.4.2
pnpm install --frozen-lockfile
pnpm dev --host 127.0.0.1
```

Use the address printed by Vite, normally `http://127.0.0.1:5173`. To require a particular free port, add `--port 5173 --strictPort`.

Installation/build preparation copies the pinned Gmsh WASM runtime and isolation service worker into `static/`. If lifecycle scripts were intentionally skipped, run `pnpm prepare:browser` before starting.

| Route                        | Workspace                                                                   |
| ---------------------------- | --------------------------------------------------------------------------- |
| `/`                          | Engine Explorer; requires licensed runtime geometry                         |
| `/design/`                   | Generated parametric geometry, exact solid checks and STEP export           |
| `/design/?workspace=analyze` | Operating loads, design screening, browser solid FEA and evidence assistant |
| `/asset-review/`             | Internal source-audit view                                                  |

No `.env` file is needed. A historical local `.env` does not configure or enable the static application’s assistant. Never put a shared secret in a public build variable.

## Browser requirements

- A current desktop browser with hardware acceleration. Verified captures and numerical checks used Chrome 154 on macOS; equivalent results across every browser/device are not claimed.
- A secure context: HTTPS when hosted, or loopback HTTP during development.
- Web Workers and WebAssembly. Exact CAD and solid meshing require `SharedArrayBuffer` and cross-origin isolation because the shipped Gmsh build is threaded.
- WebGPU for the 3D renderer and GPU operating searches. The migrating renderer explicitly rejects unsupported devices instead of silently using WebGL. The numerical search separately retains a browser Float64 CPU fallback and records the actual backend and fallback reason. Graphics visual acceptance is still being verified; see [current architecture status](COMPUTE_ARCHITECTURE.md).
- Browser storage permission for persistent local Explorer files and saved studies. The OpenAI key is deliberately excluded from persistent storage.

Vite and the included static file server set isolation headers. The bundled service worker supplies isolation on static hosts without configurable headers and may reload the first visit once. If CAD reports an isolation error, see [troubleshooting](#troubleshooting) rather than starting a native service.

## Build and serve static output

```sh
pnpm build
node scripts/serve-static.mjs --port 4198
```

Open `http://127.0.0.1:4198/`. The output is in `build/`; the helper only reads files and returns 404 for `/api/`. Alternatively, `pnpm preview --host 127.0.0.1 --port 4198` previews the same build with isolation headers.

For a GitHub project site at `/Diesel/`:

```sh
BASE_PATH=/Diesel pnpm build
node scripts/serve-static.mjs --port 4198 --base /Diesel
```

Open `http://127.0.0.1:4198/Diesel/`. In PowerShell, set `$env:BASE_PATH = '/Diesel'` before `pnpm build`. `BASE_PATH` is a public build path, not a runtime credential. Rebuild without it when returning to root-path hosting. [Deployment details](DEPLOYMENT.md) cover Pages, isolation and static hosting checks.

## Explorer assets

The generated Design/Analyze workspaces, CAD export and FEA do not require the commercial engine mesh. Public engine metadata needed for compilation is in the repository.

The release packages the processed model as compressed, encrypted application resources. That packaging is separate from the original vendor files and is not a guarantee against extraction. Independent clean clones without the release package/key use the local import path below.

Local Explore requires these **five matching prepared runtime files**:

```text
v12-review.glb
v12-cams-refined.glb
v12-clearance-refined.json
v12-clearance-refined.bin
v12-chamber-domains.bin
```

When prompted, choose all five in the engine-file dialog. The application verifies the expected bundle and stores it in IndexedDB for this browser origin. Nothing is uploaded. A different browser profile, host, protocol or port has a separate store; clearing site data removes the local copies.

For a development checkout, owners may place the same files under `static/models/`. The checked-in `v12-review.manifest.json` supplies public component metadata and is not a sixth file the visitor needs to import. Loose GLBs and derived geometry remain excluded from Git. A static build includes files present under `static/`; check its contents before publishing. The authorised hosted demonstration uses a protected application-resource package. Independent publishers need their own applicable model rights and can retain the local-import route.

A production build removes loose GLB, OBJ, BIN and private correction JSON from `build/models/`. It can load the packaged resources only when `ENGINE_ASSET_PACKAGE_KEY` was supplied at build time; otherwise the local-import route remains available. This is a resource-decoding key delivered to the browser, not an API credential or an extraction-proof security boundary. See [packaged-resource deployment](DEPLOYMENT.md#assets-and-credentials).

The original vendor download is not this complete corrected bundle. Its conversion/correction pipeline is not yet a supported clean-clone command; some preparation scripts belong to the original private references/work collection. Obtain a matching bundle through an authorised handoff. `scripts/prepare-engine.mjs` is an old Caterpillar converter, not the V12 preparation command.

## AI and narration

1. In Explore, open **AI connection settings**; in Analyze’s Assistant tab, choose **Connect AI**.
2. Enter your own OpenAI API key and a model your project can access. The guide default is `gpt-6-sol`.
3. Ask a question or request an inspection action. Scene changes execute locally one at a time, check the current revision, and wait for the visual transition before acknowledging success.
4. Use **Listen** for AI-generated narration. Speech currently uses `gpt-4o-mini-tts` with the `cedar` voice.

The key is held only in the current tab’s memory. Workspace navigation retains it; reload, closing the tab or **Disconnect** clears it. Requests go directly to `https://api.openai.com/v1/`. They include the question/history, selected scene context, curated source metadata, bounded numerical summaries or narration text. Mesh files are not transmitted. API usage is billed to the visitor’s project.

**Stop**, manual interaction, navigation and cancellation prevent delayed guide commands from changing a newer scene. Design assistance describes saved evidence; it cannot certify a design or silently run a solver. The app uses a browser Responses API loop rather than the native Codex executable. Password-based host-sponsored access belongs to the historical edition and is not available on this static branch.

## Numerical workflow

Use Design to change dimensions and verify/export the exact authored rod solid. The first CAD/FEA operation downloads approximately **40 MB** of WASM from the static host; later operations reuse the worker until cancelled or disposed.

In Analyze, define the prescribed operating scenario, run a bounded design screen, then solve selected solid load cases. The screen reports WebGPU/CPU provenance. Gmsh constructs and meshes the exact rod in WASM; a Float64 worker assembles and solves the tetrahedral elasticity system. Mesh refinement compares separately meshed integral responses. Inspect residuals, reactions, load assumptions and geometry hashes with the plotted fields.

These operations do not call `/api/design/*`, a local Python process or a remote solver. The GPU screen and CPU solid solve are separate numerical stages; choosing WebGPU does not turn elasticity into a GPU solve or the pressure assumption into CFD.

## Verification

```sh
pnpm exec playwright install chromium chrome
pnpm check
pnpm exec vitest run --project server src/lib/ai src/lib/browser-cad src/lib/design
node scripts/verify-webgpu.mjs --output /tmp/engine-lab-webgpu.json
pnpm build
```

The named Vitest `server` project runs tests in Node during development. It does not imply a deployed backend. CAD tests exercise the shipped WASM and saved reference fixtures without Python. GPU unit tests cover tensor preparation and comparison guards; `verify-webgpu.mjs` starts a Vite harness and launches Chrome to execute real WebGPU when available. Its optional `--origin` expects that development harness, not a production static origin. The report path above is outside the repository so a rerun does not overwrite accepted evidence.

For the full suite:

```sh
pnpm test:unit --run
pnpm test:e2e
```

Complete Explorer tests need licensed runtime files. The unit suite retains historical native/server-reference tests and fixtures; those are not current runtime routes. Some AI tests use mocked provider responses. Live browser checks separately exercised an authorised OpenAI key for scene actions, design replies, narration, cancellation, memory-only storage and static-host operation.

The recorded [CAD/solid browser report](verification/browser-cad-solid.md) and [WebGPU comparison report](verification/browser-webgpu.json) are dated evidence, not a blanket claim that every future environment passes. They include software, geometry and tolerance context.

## Troubleshooting

| Symptom                                               | Check                                                                                                                                              |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Explore requests engine files                         | Import the complete authorised five-file bundle. Design and Analyze remain available without it.                                                   |
| Import rejects a file                                 | Use this version’s runtime bundle; a renamed vendor source file or mixed correction pair is not equivalent.                                        |
| Model disappears after changing port/browser          | IndexedDB is scoped to an origin/profile. Import it again there.                                                                                   |
| CAD reports missing `SharedArrayBuffer` or isolation  | Use HTTPS/loopback, allow the isolation service worker, and reload. Check `crossOriginIsolated`; custom hosts can send COOP/COEP headers directly. |
| WASM cannot load                                      | Run `pnpm prepare:browser`, rebuild, and check that `/vendor/gmsh/` resolves beneath the configured base path with a WASM MIME type.               |
| Numerical WebGPU is unavailable or fails verification | Read the fallback reason. The Float64 browser CPU path is retained; no backend needs to be started.                                                |
| First solid solve seems slow                          | It includes WASM download/initialisation; later operations reuse the worker. Hardware, refinement and concurrent rendering affect time.            |
| AI cannot connect                                     | Check model access, billing/rate limits and direct access to OpenAI. Connecting a key does not prove entitlement until a request succeeds.         |
| AI disconnects on refresh                             | Credentials are memory-only. Reconnect the visitor’s key.                                                                                          |
| Subdirectory links or workers fail                    | Rebuild with the correct `BASE_PATH` and serve at that same path.                                                                                  |

## Dependency licences

The build copies `LICENSE` and `SOURCE.txt` with the Gmsh WASM runtime under `build/vendor/gmsh/`. Gmsh is GPL-2.0-or-later; the source notice identifies the pinned package, upstream source and build instructions. Preserve applicable licence and corresponding-source obligations when redistributing a build. Purchased engine geometry has separate commercial terms and is not included in the public checkout.
