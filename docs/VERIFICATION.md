# Engine Lab — solid sections, presentation and private AI

Verified locally on 29 September 2026 (America/Chicago). The application remains local. No public deployment was performed.

## Acceptance

- **120 unit/component tests across 18 files pass.** Coverage includes published reference data, mechanism constraints, closed constituent geometry, retained openings, section caps, state/actions, the native Codex round trip with mock inference, private access and cancellation.
- **15 browser scenarios pass** against the production build in installed Google Chrome. The full suite was rerun after the final removal of duplicated stand cut faces. The complete eight-step tour operates real scene state.
- Svelte checking reports **zero errors and zero warnings**. Formatting, ESLint and the required Svelte autofixer pass.
- The production build succeeds. The existing Three.js client chunk still exceeds the generic 500 kB warning threshold.
- Additional responsive checks cover **360, 390, 768 and 1024 px** layouts, plus focused fuel views at **390 and 1512 px**. They found no horizontal overflow or tested control overlaps. Opening the study from the mobile inspector returns the scene to view. No browser errors were recorded.

## What the screenshot revealed and what was repaired

The failure had two layers. Clipping removed triangles without drawing the newly exposed material faces. Independently, several authored parts had real topology or fit errors: an open piston underside boundary, open sweep ends, a zero-thickness rod bearing housing, a pin entering an unbored skirt, and a too-small injector aperture.

The repaired mechanism has **718 closed, consistently oriented positive-volume constituent solids**. True piston cavities, rod-bearing apertures and the injector opening remain open. Compound components can contain overlapping closed details; they are not claimed to be boolean-unioned manufacturing CAD.

A triangle-boundary sweep sampled **721 poses over 720°**, evaluating **242,256 mesh pairs**, with no nonzero boundary-intersection segments for the tested rod/crank, paired-rod and rod/piston pairs. Additional checks establish positive authored clearances and preserve the intended journal/bearing joints. This is a discrete, scoped check of the educational mechanism, not a collision certificate for the purchased exterior or an OEM tolerance analysis. The detailed method, clearances and exclusions are in [the mechanical audit](verification/2026-09-29-v4-mechanical-audit.json).

The rod's center coinciding with its crank journal is intentional: an annular bearing surrounds the journal. A correct cut must show material around that joint while preserving its opening and fit, rather than suggesting a solid rod passes through an uninterrupted shaft.

## Solid section rendering and flicker

Moving teaching parts now use per-component, per-plane nonzero-winding stencil caps. These follow the actual current mesh transforms during cycle motion, explosion and removal. Overlapping closed details form a visible union; oppositely oriented bore surfaces subtract. The renderer does not fill a bounding box or rebuild moving contours on the CPU every frame.

Controlled GPU fixtures verify cut faces in **color, normal and depth** buffers, including a closed box, annular bore, overlapping solids, an oblique cut and both ends of a two-plane slab. Actual-engine checks cover X/Y/Z planes, reversal, explosion, animation, cylinder study and fitted assembly. Cut-face picking respects real openings. See [GPU verification](verification/2026-09-29-v4-solid-section-verification.json) and [rendering implementation notes](verification/2026-09-29-v4-solid-section-rendering.md).

The surface conflicts were corrected:

- The purchased casting and side plates contain coincident contact skins. A small section-only visual separation removes the diagonal pattern while retaining shadows. Twenty duplicate same-direction turbo triangles are removed from runtime copies; original assets remain intact.
- A generated source head-fill face competed with the authored valve cut faces in the same plane. The existing selective source-boundary policy now includes these unverified covers when teaching internals are shown. Isolated source-only inspection can still fill closed contours. This avoids inventing solid slabs across unknown OEM internal ports.

The older manually authored stand/crank cut faces in Cylinder study were also retired after a contributor comparison confirmed they duplicated the new winding caps. Actual solid geometry and both study planes remain unchanged. Final 355°/420° and nearby-orbit captures confirm both bed/shaft ends remain closed, the bed end selects `mech:block`, and all 587 source identities and 88 teaching records remain. See [the final cylinder check](verification/2026-09-29-v4-final-study-proof.json).

Open imported contours remain unfilled. The commercial casting lacks verified internal passages, material volumes and registration against the teaching rig. GPU cap quads affect color and ambient-occlusion depth/normals but are not independent shadow casters. These limitations are retained explicitly.

## Rendering measurements

Installed headless Google Chrome used **WebGL 2 / ANGLE Metal on Apple M4**, with a 1168 × 880 CSS-pixel viewport, browser scale 2 and renderer pixel ratio capped at 1.25. The final warmed moving X section used eight active cap intervals and roughly 53,616 contributing triangles; the active total changes with phase.

| Control              | Median frame interval | 95th percentile |
| -------------------- | --------------------: | --------------: |
| Moving caps and GTAO |               16.6 ms |         18.1 ms |
| Caps disabled        |               16.5 ms |         18.0 ms |
| GTAO disabled        |               16.7 ms |         18.2 ms |

The sample was approximately 60 FPS on this machine. It preceded retirement of the six redundant stand faces; the final cleanup was then checked visually across phases and nearby camera angles. An earlier 27.0 / 37.5 ms median/p95 sample is retained in the notes without an invented explanation. These are short local measurements, not universal performance or long-duration memory guarantees. Lighting now lifts dark surfaces, material grain is attenuated at small screen sizes, and camera fitting reserves the glass interface's usable space.

## Real invitation-protected AI acceptance

A production Node build ran behind a local HTTPS proxy with a temporary invitation password and signing secret. The authorized workspace key was provided only to the server. One actual paid guide request used the Codex SDK/native harness and the live browser scene broker.

- Locked keyless inference and an incorrect password returned **401** before paid execution. Correct unlock returned **200**.
- The visit cookie was **HttpOnly, Secure, SameSite=Strict**, host-scoped and rooted at `/`. Its value was not readable by page JavaScript. The client sent no provider key, and none appeared in page markup.
- The real guide received **six applied browser acknowledgements**, then returned HTTP **200** with acknowledged execution. The UI independently matched cylinder 1, fuel enabled, motion paused and global/local phase **355°**. The explanation qualified injection timing as illustrative.
- A delayed initial status response did not overwrite the unlocked state.
- An intercepted narration **401** reopened unlock. An intercepted logout transport failure left the tab disconnected and clearly reported that server sign-out was unconfirmed. Recovery and actual successful logout then revoked access.
- Re-unlocking retained the allowance: **29 guide / 30 audio** attempts remained. No paid narration was used in this check. The production browser reported no errors.

The live guide screenshot predates the final retirement of duplicated stand cut faces; subsequent renderer/browser checks cover that presentation-only cleanup. Authentication and guide execution were unchanged.

The sanitized [private-AI record](verification/2026-09-29-v4-private-ai-verification.json) contains the result and state acknowledgements, without keys, passwords, cookie values or bearer tokens. The temporary worker, browser and TLS files were cleaned up. Narration playback/Stop and audio handling passed the browser/unit fixtures; earlier paid audio synthesis is historical evidence, not a new audio call this round.

## Hosting and engineering boundaries

The prepared hosting profile is one persistent Node container, because the native harness and process-local scene/auth broker must share a live worker. The Docker image was not built here because a running Docker daemon was unavailable. Vercel/Cloudflare hosting and Linux native-runtime acceptance remain untested. Passwords, signing secrets and API keys must be supplied as private runtime configuration; the shared-password gate is for a small invited demonstration, not an account system. Restart clears the process-local visit/quota ledger.

The purchased generic 3512 exterior, authored internals and published 3512C reference are distinct evidence layers. Nominal bore, stroke, displacement and reference speed, and fixed-1800-rpm EM1898-00 operating points, retain their source basis. Rod length and detailed shapes, representative phasing, valve fit/cam transmission, approximate source registration, materials, chamber glow and flow routes remain educational. This work does not claim calibrated combustion, transient, thermal, CFD or acoustic prediction.

## Visual records

- [Repaired X-cut close-up](/Users/neo/Documents/Codex/2026-09-29/referenced-chatgpt-conversation-this-is-an/outputs/Engine_Explorer/v4/moving-solid-close-up.png)
- [Final assembly](/Users/neo/Documents/Codex/2026-09-29/referenced-chatgpt-conversation-this-is-an/outputs/Engine_Explorer/v4/engine-assembled.png) and [explosion](/Users/neo/Documents/Codex/2026-09-29/referenced-chatgpt-conversation-this-is-an/outputs/Engine_Explorer/v4/engine-exploded.png)
- [Injection](/Users/neo/Documents/Codex/2026-09-29/referenced-chatgpt-conversation-this-is-an/outputs/Engine_Explorer/v4/fuel-1512.png) and [early power](/Users/neo/Documents/Codex/2026-09-29/referenced-chatgpt-conversation-this-is-an/outputs/Engine_Explorer/v4/combustion-1512.png)
- [Welcome](/Users/neo/Documents/Codex/2026-09-29/referenced-chatgpt-conversation-this-is-an/outputs/Engine_Explorer/v4/engine-welcome.png) and [tour chamber view](/Users/neo/Documents/Codex/2026-09-29/referenced-chatgpt-conversation-this-is-an/outputs/Engine_Explorer/v4/tour-4.png)
- [Live invited AI result](/Users/neo/Documents/Codex/2026-09-29/referenced-chatgpt-conversation-this-is-an/outputs/Engine_Explorer/v4/private-ai-live.png)
- [Responsive evidence](verification/2026-09-29-v4-responsive-verification.json)

Historical acceptance records: [previous section renderer](verification/2026-09-29-v3.md), [working mechanism](verification/2026-09-29-v2.md), and [prototype](verification/2026-09-29-prototype.md).
