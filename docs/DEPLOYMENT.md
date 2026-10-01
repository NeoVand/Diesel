# Hosting the invited Diesel demo

Visitors can explore the engine and authored tour immediately. Paid guide/narration access uses a demo password and the host's private OpenAI key; visitors do not need an API key. Optional advanced BYOK remains available. No public deployment has been performed.

**Current deployment status (30 September 2026):** GitHub reports no Pages site, no Actions workflows and no deployment records for this repository. This is a persistent Node application. Actions can automate a future deployment to a runtime host, but Pages cannot execute its server components.

**Native analysis is an additional runtime requirement.** The Docker profile below currently installs Node and Codex only. It does not install Python, OCP, Gmsh, SciPy, scikit-fem or PyAMG. To host the complete demonstrated Design/Analyze workflow, provision the pinned environment from `src/lib/server/cad/requirements.txt` and configure `DESIGN_CAD_PYTHON` / `DESIGN_STRUCTURAL_PYTHON`, then test native jobs on the deployment OS/CPU. [The rerun guide](RUNNING.md#5-enable-exact-cad-and-native-fea) documents the local setup. The image has not been validated as a full CAD/FEA deployment.

## Concrete first profile: one Node container

The checked-in `Dockerfile` builds the SvelteKit Node adapter on Linux, installs the matching optional native Codex runtime, and starts one unprivileged Node 22 process. `.dockerignore` excludes credentials, local dependencies, purchased original files/reference manuals, and development state. The served converted mesh is included in the app build; verify its license permits the intended audience before publishing. The image/profile is prepared, not yet built or host-tested in this workspace.

Build on the target OS/CPU with `docker build -t diesel-demo .`. Run one instance behind an HTTPS reverse proxy. Inject these values through the host's secret manager or a private runtime env file:

| Variable                | Requirement                                                                               |
| ----------------------- | ----------------------------------------------------------------------------------------- |
| `OPENAI_API_KEY`        | Dedicated private project/service key with guide/audio access; never a `PUBLIC_` variable |
| `DIESEL_DEMO_PASSWORD`  | Random invite password of at least 12 characters; prefer 24+                              |
| `DIESEL_SESSION_SECRET` | Independent random signing secret of at least 32 characters                               |
| `ORIGIN`                | Exact browser-visible HTTPS origin, for example `https://diesel.example.com`              |
| `DIESEL_AGENT_MODEL`    | Pinned hosted guide model; defaults to `gpt-6-sol`                                        |
| `DIESEL_AUDIO_MODEL`    | Pinned hosted narration model; defaults to `gpt-audio-1.5`                                |

The example file contains placeholders only. Generate secrets locally (for example `openssl rand -hex 32`) and keep them out of version control, image build arguments, client data and logs. The built Node server does not automatically load `.env`; inject runtime environment, or use Node's `--env-file` with a protected file. See [Node adapter guidance](https://svelte.dev/docs/kit/adapter-node). Optional `DIESEL_CODEX_PATH` is a trusted server-only executable override.

A representative launch after supplying a protected runtime file is:

```sh
docker run --name diesel-demo --init --read-only --tmpfs /tmp:rw,nosuid,size=256m \
  --cap-drop=ALL --security-opt=no-new-privileges \
  --env-file /secure/path/diesel-demo.env -p 127.0.0.1:3000:3000 diesel-demo
```

The reverse proxy terminates TLS and forwards the whole application to that process. Use unbuffered SSE and allow long-lived `/api/scene/events` responses; live guide deadlines are 90 seconds, narration 45 seconds and browser acknowledgement 12 seconds. Do not cache HTML, `/api/access/*` or other private API responses. Keep request bodies, cookie/bearer headers and query/token details out of proxy logs. `ORIGIN` fixes the expected origin rather than trusting visitor Host headers.

The bundled native process must be able to create its private temporary state, contact OpenAI over HTTPS, and reach this same process at `/api/scene/mcp`. The container sets `DIESEL_MCP_ORIGIN=http://127.0.0.1:3000`, pinning native callbacks to its own process while browser `ORIGIN` stays HTTPS. If changing the Node port, change this origin too. Without the override, callbacks use the browser origin. The trusted server-only override accepts an HTTPS origin or loopback HTTP, and rejects credentials, paths, query strings and fragments. Test DNS/TLS/self-routing and the native Linux read-only sandbox on the actual host. Container restrictions can affect native sandbox startup; retain isolation rather than enabling privileged mode to work around a failed test. Do not mount private home directories or unrelated credentials. The installed harness retains some native file/image helpers beyond the MCP allowlist, so its configuration is not a complete operating-system boundary. Temporary state is removed on normal completion/cancellation; add host cleanup for crash leftovers.

## Access and operating limits

Unlock uses a signed HttpOnly/Secure/SameSite=Strict cookie plus a live server ledger. It lasts two hours; logout revokes it and aborts active paid work. Locked or expired keyless inference returns 401 before calling OpenAI. HTTPS, a password of 12+ characters and a signing secret of 32+ characters are all required in production. A remote request cannot gain owner access by claiming localhost. Local development auto-enables a saved workspace key only for direct loopback requests; set `DIESEL_USE_LOCAL_SERVER_KEY=false` to disable it.

The defaults allow 30 guide/30 narration attempts per visit, one paid request at a time, four guide/six narration attempts per minute, 60 of each per address/day and 200 of each per process/day. Failed/cancelled requests consume an attempt. Password guessing is limited to five attempts per address/15 minutes and 100 globally/15 minutes. Server-sponsored models are pinned, history is bounded, narration has a 2,400-output-token limit and tools have a 24-operation limit. Timeouts and request allowances reduce exposure but are not an exact dollar cap. Monitor a dedicated OpenAI project; keep model access constrained and a host kill switch ready. See [OpenAI production guidance](https://developers.openai.com/api/docs/guides/production-best-practices).

The broker, cookie ledger, revocation, counters and pending acknowledgements are process-local. Restart logs visitors out and resets quotas. Do not enable multiple replicas or autoscaling yet. All session creation, SSE, state/ack/cancel, inference and native MCP callbacks must reach the same process; sticky browser routing alone does not guarantee native self-routing. Before scaling, implement shared durable visit/quota storage and a routed broker/worker channel. Configure trusted proxy client addresses only when the origin is unreachable directly and the proxy strips incoming spoofed forwarding headers. Without this, address limits conservatively group the proxy's visitors; cookie/global limits still apply.

## Vercel and Cloudflare fit

| Option                             | Fit for this exact implementation                                                                                                                                                                                                              |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Persistent Node container/VM       | First supported profile; one process owns native inference, cookies, quotas and live broker                                                                                                                                                    |
| Vercel frontend/CDN + Node backend | Future split: same-origin proxy **all** `/api/access`, AI and scene routes, cookies and unbuffered SSE to the persistent worker; root HTML/access initialization also needs that origin's session state                                        |
| Vercel Functions                   | Node support/time limits alone do not preserve a shared in-memory session across invocations. Binary packaging, request routing and durable broker/auth storage need an implementation and host acceptance test; no drop-in deployment claimed |
| Cloudflare Workers                 | Cannot run this native SDK directly: documented `node:child_process` compatibility is a nonfunctional stub                                                                                                                                     |
| Cloudflare Containers              | Plausible Linux-worker home with explicit instance routing/lifecycle. Container restart/sleep and native self-callback must be tested; a Durable Object router does not automatically persist the Node broker/quotas                           |

This assessment follows [Vercel's function limits](https://vercel.com/docs/functions/limitations), [Cloudflare's Node compatibility table](https://developers.cloudflare.com/workers/runtime-apis/nodejs/) and [Container lifecycle](https://developers.cloudflare.com/containers/concepts/architecture/). It is not a provider deployment certification. Keep the current same-app container until a split is deliberately implemented.

## Acceptance before invitations

- Verify HTTPS password unlock, page reload/status, wrong password, expiry, logout and tampered-cookie rejection; inspect browser data to confirm the server key is absent.
- Complete actual Codex MCP → browser operation → acknowledgement → answer, with exact IDs/revisions/source links, on the deployed origin.
- Stop during connection, execution and narration, then ask again; confirm old request UUIDs cannot mutate the new view. Logout must cancel active paid requests.
- Check Linux binary/sandbox startup, native self-routing, unbuffered SSE, runtime restart/reconnection, same-origin checks, limits and redacted errors.
- Verify whole-engine plane, cylinder mode, internal explosion, selection and tour on the target device. Check a known reference operating point and finite WAV playback with an authorized key.
- Confirm converted-mesh distribution rights and keep original/manual reference files outside served assets; see [rights and AI use](../references/99_Archive/Caterpillar_3512_2026-09-29/RIGHTS_AND_AI_USE.md).

Offline auth/route tests exercise the above access boundaries without billable calls. Owner-authorized local live samples are recorded in [VERIFICATION.md](VERIFICATION.md); public hosting remains untested.
