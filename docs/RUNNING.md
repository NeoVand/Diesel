# Running Engine Lab

This guide describes the implemented development working tree, including optional AI and native analysis. It does not imply that a bare public clone includes the commercial model or all unpublished application changes.

## 1. Check the checkout and tooling

Use a checkout containing `src/lib/scene`, `src/lib/design`, `src/lib/server/cad`, the updated `package.json`, and the model metadata under `static/models/`. At the 30 September 2026 audit, public `main` still contained the initial boilerplate. These instructions become a public-clone workflow only after the completed source is published.

The working environment was checked with **Node 24.21.0**, **pnpm 12.4.2**, and **Python 3.12.14** for native calculations. Use Node 24 and Python 3.12 for the closest match. Python is unnecessary for browser-only calculations.

```sh
node --version
npm install --global pnpm@12.4.2
pnpm --version
cd /path/to/Diesel
pnpm install --frozen-lockfile
```

The lockfile is the JavaScript dependency specification. The project does not currently pin Node or pnpm through `engines`/`packageManager`; check your installed versions explicitly. Do not copy `node_modules` between operating systems: the Codex SDK includes a platform-specific executable.

## 2. Restore the licensed runtime assets

For the full Explore workspace, the matching local asset bundle must contain:

```text
static/models/
  v12-review.glb
  v12-review.manifest.json
  v12-cams-refined.glb
  v12-clearance-refined.json
  v12-clearance-refined.bin
  v12-chamber-domains.bin
```

The manifest supplies component identities. The refined cams and clearance pair are required when loading the running rig. Chamber domains support the process layers and related tests. Keep these files together: a manifest or correction file from another build can fail integrity checks or misidentify geometry.

The GLBs, clearance pair and chamber binary are excluded from Git. Original purchased files belong in the private references collection, outside publicly served assets. Obtain the runtime bundle through an authorised project handoff; do not download an unrelated mesh and rename it to satisfy the loader.

**Reproducibility boundary:** the full V12 conversion/correction toolchain is not yet packaged as a supported clean-clone command. Some preparation scripts live in ignored `references/` and `work/` directories. Buying the original model alone does not recreate this exact corrected runtime. `scripts/prepare-engine.mjs` is a historical Caterpillar converter and is not the V12 preparation command.

The generated Design/Analyze workspace does not need to load the purchased Explorer meshes. A source checkout still needs its imported engine/manifest metadata to compile; removing `static/models/` indiscriminately is not a supported asset-free build.

## 3. Start the application

Preserve existing credentials when creating a local environment file:

```sh
test -f .env || cp .env.example .env
pnpm dev --host 127.0.0.1
```

Open the URL Vite prints. The default is `http://127.0.0.1:5173`; an occupied port can cause Vite to choose another. A specific port can be requested with `--port 5173 --strictPort`.

| Route                       | Workspace                  |
| --------------------------- | -------------------------- |
| `/`                         | Engine Explorer            |
| `/design`                   | Parametric design          |
| `/design?workspace=analyze` | Operating analysis         |
| `/asset-review`             | Internal source-audit view |

A first model load transfers a substantial local asset. Wait for the loading state to finish. Use a browser with WebGL2 and hardware acceleration enabled. The screenshots were recorded in Chrome with 150% page zoom; that is a presentation choice, not a runtime requirement.

## 4. Enable AI when needed

Set `OPENAI_API_KEY` in the ignored `.env` to enable the local server-backed guide and spoken explanations. Restart Vite after changing environment variables. On direct loopback development requests, local owner access can use this saved key. `DIESEL_USE_LOCAL_SERVER_KEY=false` disables that behavior.

The settings panel also supports BYOK held in tab memory. Its key is not a browser-side replacement for the Node backend. The server still runs the Codex harness, validates actions and waits for browser acknowledgements.

| Variable                | Use                                                                 |
| ----------------------- | ------------------------------------------------------------------- |
| `OPENAI_API_KEY`        | Private server credential; leave empty when AI/audio are not needed |
| `DIESEL_AGENT_MODEL`    | Server guide model preset; account access is required               |
| `DIESEL_AUDIO_MODEL`    | Spoken-explanation model preset; account access is required         |
| `DIESEL_CODEX_PATH`     | Optional trusted path to an alternative native Codex executable     |
| `DIESEL_DEMO_PASSWORD`  | Shared hosted access; at least 12 characters                        |
| `DIESEL_SESSION_SECRET` | Independent hosted-session signing secret; at least 32 characters   |
| `ORIGIN`                | Exact public HTTPS origin when hosted                               |

Keep credentials out of `PUBLIC_` variables, source files and screenshots. The example environment contains placeholders only. Invited production access and local development access have different rules; see [deployment](DEPLOYMENT.md).

## 5. Enable exact CAD and native FEA

The following macOS/Linux setup uses an installed **Python 3.12** interpreter and a project-local virtual environment:

```sh
python3.12 -m venv .venv-cad
.venv-cad/bin/python -m pip install -r src/lib/server/cad/requirements.txt
.venv-cad/bin/python -c "import OCP, gmsh, numpy, scipy, skfem, pyamg; print('Native imports OK')"
```

The pinned package versions were checked against the environment used for the tour: OCP 8.0.1.0, Gmsh 4.15.2, NumPy 2.5.3, SciPy 1.18.1, scikit-fem 12.0.2 and PyAMG 5.3.0. A fresh installation on every OS/CPU has not been certified. On Linux, missing `libGLU.so.1` requires the host's GLU runtime package, commonly `libglu1-mesa` on Debian/Ubuntu.

Both services automatically detect `.venv-cad/bin/python` when the Node process starts in the project root. To use a different interpreter, set absolute paths in `.env`:

```dotenv
DESIGN_CAD_PYTHON=/absolute/path/to/python
# Only needed for a separate FEA environment; otherwise it uses DESIGN_CAD_PYTHON.
DESIGN_STRUCTURAL_PYTHON=/absolute/path/to/python
```

On Windows, a virtual environment normally uses `Scripts/python.exe`; configure its absolute path explicitly. The full native workflow has not been verified on Windows.

Restart the app and check **Verification → Verify exact solid**, STEP export, and **Operating loads → Solve this load case**. Without the native runtime, those endpoints return an unavailable response. Browser calculations, parameter editing and JSON case export remain separate capabilities.

These Python processes are bounded jobs started by Node. They do not run a second HTTP server. Model scripts are bundled into the server build, and job files are created in the system temporary directory.

## 6. Build and run a production server

```sh
pnpm build
HOST=127.0.0.1 PORT=3000 ORIGIN=http://127.0.0.1:3000 \
  node --env-file=.env build
```

This is a local production-build smoke check. Shared password access requires HTTPS and the hosted settings described above. Production Node does **not** automatically load `.env`; use `--env-file` or environment injection. A custom native interpreter path must exist on the production machine.

`pnpm preview --host 127.0.0.1` is convenient for build inspection, but is not the production hosting command. Configure the real HTTPS origin, persistent Node process, native dependencies and unbuffered SSE before inviting viewers. The current Dockerfile does not install the Python analysis environment. [Hosting details](DEPLOYMENT.md) document the remaining constraints.

## Verification

Install the browsers used by the test configuration:

```sh
pnpm exec playwright install chromium chrome
pnpm check
pnpm lint
pnpm test:unit --run
pnpm test:e2e
pnpm build
```

Vitest's component tests use Chromium. End-to-end tests use Chrome and a production preview on port 4183. The full suite needs the local geometry/chamber data and includes native-analysis requests. AI browser regressions may use mocked responses; a passing suite alone does not establish live account/model access.

For a deliberate native-verification run:

```sh
.venv-cad/bin/python scripts/verify-rod-cad.py
OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 \
  .venv-cad/bin/python src/lib/server/cad/verify_elasticity.py
```

These scripts regenerate evidence under `docs/verification`. Review those changes with the parameters and runtime that produced them. They verify numerical/geometric implementation; they do not establish experimental engine validation.

## Troubleshooting

| Symptom                                            | First check                                                                                                                                              |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Starter Svelte page instead of Engine Lab          | You have the initial public commit, not the completed application working tree.                                                                          |
| Model fails to load or shows missing-file requests | Restore the matching GLB, cams, clearance pair and manifest; inspect requests under `/models/`.                                                          |
| Missing process data or chamber tests fail         | Check `v12-chamber-domains.bin` and the matching source metadata.                                                                                        |
| Exact CAD or solid solver unavailable              | Run the Python import check and verify the configured interpreter path in the Node process.                                                              |
| Native calculation times out                       | Start with the standard mesh. The server enforces job deadlines and does not substitute an approximate field.                                            |
| AI is locked or model access fails                 | Check backend availability, key/model access and local-versus-hosted access settings.                                                                    |
| Production key or Python path is ignored           | Inject runtime environment or pass `--env-file`; rebuilding alone does not load production secrets.                                                      |
| Browser tests connect to the wrong application     | Check port 4183. The test configuration may reuse an existing server locally.                                                                            |
| Rendering is unusually slow                        | Check hardware acceleration, competing GPU workloads, viewport size and browser zoom. GPU rendering and native solver latency are separate measurements. |
