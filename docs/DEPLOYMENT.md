# Static deployment

The `browser-first` build has **no application backend**. SvelteKit’s static adapter emits the interface, JavaScript, workers and WASM into `build/`. Exact CAD, meshing, structural solves and operating searches execute on the visitor’s machine. Optional assistant/speech inference calls OpenAI directly with the visitor’s memory-only API key.

This replaces the earlier persistent Node/Codex/Python architecture. [Historical deployment notes](archive/DEPLOYMENT_NODE_BASELINE.md) are retained for reference, not as current instructions. Deployment is being prepared; the presence of a workflow or configured URL alone does not establish a successfully published and tested site.

## Build contract

```sh
pnpm install --frozen-lockfile
pnpm build
```

Publish **`build/`**. Node 24 and pnpm 12.4.2 are required during the build, not to execute the hosted application. There are no server-held runtime secrets, model-serving functions, Python subprocesses or `/api` endpoints to provision. Protected model resources are decoded client-side; any required client key is delivered to the browser and is not a server-secret boundary. Archived route code under `src/lib/server/archive-routes/` is not an active SvelteKit route.

The build preparation step copies the pinned Gmsh WASM package and isolation service worker into static assets. Serve `.wasm` as `application/wasm` and JavaScript modules with a JavaScript MIME type. Keep the runtime, licence and source-provenance files together. Avoid caching `coi-serviceworker.js` indefinitely across updates.

## Cross-origin isolation

The threaded Gmsh WASM package needs `SharedArrayBuffer`. On a configurable static host, send:

```text
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

Serve over HTTPS; loopback HTTP is suitable for local checks. The project’s Vite server, preview and static verification helper set these headers. The included `coi-serviceworker` provides an alternative for hosts where response headers cannot be customised, such as GitHub Pages. A first visit may reload once to become isolated. If isolation remains unavailable, the CAD worker reports a capability error; it does not fall back to a hidden native service.

Primary references: [Gmsh browser integration](https://loumalouomega.github.io/GMSH-JS/guide/browser/) and [the isolation service worker](https://github.com/gzuidhof/coi-serviceworker).

## GitHub Pages and Actions

For this repository’s project site, build with `/Diesel` as the base path:

```sh
BASE_PATH=/Diesel pnpm build
```

The repository includes [push/PR CI](../.github/workflows/ci.yml) and a [Pages deployment workflow](../.github/workflows/deploy-pages.yml) triggered by pushes to `main` or manual dispatch. CI checks the source; deployment uploads the static artifact and publishes it through the Pages action. Actions is the build/deployment runner; **Pages serves the resulting files**.

In repository **Settings → Pages**, select **GitHub Actions** as the publishing source. Run the Pages workflow against the intended release branch and inspect the workflow’s resulting deployment URL and status. A successful build alone is insufficient; verify the live application at that URL. The target project path is `/Diesel/`; no live-site verification is claimed by this document before that check completes.

For a matching local subdirectory check:

```sh
node scripts/serve-static.mjs --port 4198 --base /Diesel
```

Then open `http://127.0.0.1:4198/Diesel/`. Route navigation, hard reloads, source links, module workers, WASM paths and the isolation service worker must remain inside that base path. [SvelteKit’s static adapter guidance](https://svelte.dev/docs/kit/adapter-static) and [GitHub’s custom Pages workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages) describe the hosting primitives.

## Other static hosts

For root-path hosting, omit `BASE_PATH` and publish `build/`. Cloudflare Pages, a static Vercel deployment, Nginx or another ordinary web server can serve the output; no Worker/Function API is required. Configure isolation headers where supported and preserve the generated route directories and fallback page. Provider-specific publication still needs an actual deployed-origin check.

The container profile builds assets with Node, then serves them through Nginx. Its final image is a static web server, not the previous Node application runtime. Do not add the old native solver or private `.env` to this image. Build and run commands follow the current `Dockerfile`; validate a built image before describing it as deployment-tested.

## Assets and credentials

The release packages the complete processed Explorer geometry as compressed, encrypted application resources, while the original editable vendor files and loose runtime bundle remain outside the public source checkout. The browser necessarily receives enough information to decode and render those resources; encryption discourages straightforward reuse but cannot guarantee that geometry is unextractable. The application does not grant visitors a separate model licence.

Independent clones without the release package/key retain the five-file local import path into IndexedDB. Import verifies the matching bundle and uploads nothing. Design and Analyze run without the purchased mesh. The checked-in metadata and authored parametric geometry are separate from the commercial model.

`static/engine-runtime/` contains `manifest.json`, content-addressed `.elres` chunks and `NOTICE.txt`. The package preserves all five verified runtime files, without mesh simplification: 99,440,937 source bytes become 63,217,187 compressed/encrypted bytes. `scripts/pack-engine-assets.mjs` verifies source lengths and SHA-256 hashes, gzip-compresses each file, applies AES-256-GCM and writes chunks of at most 8 MiB. Loading checks package integrity and decodes resources locally.

To regenerate that package, place the exact owned runtime files under `static/models/`, then run:

```sh
node scripts/pack-engine-assets.mjs
```

The script takes `ENGINE_ASSET_PACKAGE_KEY` from the environment or reuses/creates `work/private-assets/package-key`. The generated key file is excluded from Git. Supply the matching value through the deployment runner’s environment; the Pages workflow reads the repository Actions secret named `ENGINE_ASSET_PACKAGE_KEY`. Do not print it in build logs. It is a client-delivered resource key, not an OpenAI key. The runtime loader tries imported local files, the configured encrypted package, then loose development files.

`pnpm build` runs `scripts/finalize-browser-build.mjs` after compilation to strip standalone GLB, OBJ, BIN and private correction JSON from the distributable `models/` directory. Original editable vendor projects are never packaged. The resource notice excludes purchased geometry from any application-source licence and grants no standalone reuse rights. [CGTrader’s Royalty Free License](https://help.cgtrader.com/hc/en-us/articles/360015124437-Royalty-Free-License) describes incorporation into software and measures to prevent direct access; review the applicable purchase terms when making an independent distribution.

Anything placed under `static/` is copied into a build. Inspect the artifact before publication and only distribute engine geometry when its rights permit it. Keep the Gmsh GPL licence and source notices with the shipped WASM; the package has GPL-2.0-or-later corresponding-source obligations.

There is no server-sponsored secret on this static host. Visitors enter their own OpenAI key, which the app holds in memory and sends only to OpenAI. Meshes stay local; question context and bounded study summaries are transmitted for inference. A shared password cannot securely conceal a paid API key embedded in static JavaScript. Any future sponsored-AI service would be an explicit optional network service with its own access boundary, not a prerequisite for engineering computation.

## Deployment acceptance

- Load the application and hard-reload Design/Analyze at the final base path. Confirm no application `/api` requests.
- Verify cross-origin isolation, the first WASM download, exact solid verification and STEP export.
- Solve and inspect a real solid case; check residuals, refinement and cancellation/restart.
- Run operating screening and confirm its executed backend is displayed. Test the numerical CPU fallback independently from the graphics capability gate; the WebGPU renderer itself does not fall back to WebGL.
- Confirm the published protected model loads from a fresh profile, then check mechanism, section planes, X-ray, disassembly and process views. Separately verify local import for an independent build without the release package.
- Exercise direct OpenAI actions and narration with an authorised visitor key; cancel a request, navigate workspaces, then reload and confirm the key is cleared.
- Confirm the native WebGPU renderer on the deployed device, including sections, X-ray transitions, process depths and atlas previews. Do not infer renderer success from numerical WebGPU support alone.

Recorded local static checks are in [browser CAD/solid verification](verification/browser-cad-solid.md) and [the numerical GPU report](verification/browser-webgpu.json). They establish browser execution on the tested machine; they are distinct from a final public-origin acceptance check.
