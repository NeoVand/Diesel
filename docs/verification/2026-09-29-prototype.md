# Verification record

Verified locally on 2026-09-29. Real paid OpenAI acceptance used the workspace key with the owner’s explicit authorization. No public deployment was performed.

## Application checks

- Production build succeeds with the SvelteKit Node adapter. The Three.js renderer creates a client chunk larger than the generic 500 kB warning threshold; this is a known bundle-size note, not a failed build.
- `pnpm lint` passes. Tool-managed skill bundles are excluded from application formatting checks.
- `pnpm check`: zero errors, zero warnings.
- Svelte autofixer: zero issues or suggestions for all authored Svelte components.
- 35 unit/component tests pass, covering bounds, report anchors, interpolation, derived quantities, credential/request validation, allowlisted scene replies, audio payload/format, native harness options, requested-load grounding, local development credential gates, model/configuration errors, truncated narration, and finite PCM WAV chunk validation.
- All eight browser scenarios pass in a complete production-preview rerun after the live-integration changes. These cover the inherited route smoke test plus purchased geometry, exploded exploration, isolation, source links, load evidence, teaching steps, curated answers, BYOK scene actions and ephemeral credentials, mobile layout, and valid WAV playback/stop. AI/audio responses in browser tests are local fixtures, not live model results.
- The actual Node production server serves the rendered home and 31,545,304-byte engine asset. Both AI routes reject missing keys with a 400 JSON response and `Cache-Control: no-store` before model execution.
- In-app browser verification confirms the assembled and exploded model render, direct clicking selects a visible head assembly, isolation works, and full-load values match the source report.

## Geometry checks

587 groups, 965,744 triangles and 810,739 vertices. Positions and indices pass structural checks. Normal-aware simplification preserves a high-fidelity source comparison: mean screenshot pixel difference 0.244% of the 8-bit range; yellow-body silhouette overlap 99.745%. This is a display comparison, not an engineering dimensional tolerance. Original purchased ZIP assets remain unchanged.

## Representative frame sample

Apple M4, ANGLE Metal, Chrome headless. Desktop viewport 1440 × 980; DPR 2 capped at 1.65; scene canvas 1689 × 1145 pixels. Actual engine geometry, shadows and GTAO enabled, auto rotation active. Each state sampled for 240 frames:

| State     | Mean frame interval | 95th percentile | Frames over 33.4 ms |
| --------- | ------------------: | --------------: | ------------------: |
| Assembled |           16.666 ms |         16.7 ms |                   0 |
| Exploded  |           16.666 ms |         16.8 ms |                   0 |

This observed approximately 60 FPS on the tested hardware and configuration. It does not establish a universal device guarantee. MSAA is enabled for the studio's offscreen render targets. Idle and hidden-tab rendering stop, and reduced-motion settings disable animation.

## Live OpenAI acceptance

The real `@openai/codex-sdk` harness ran `gpt-6-sol` through the application API. Four recorded direct requests returned HTTP 200 in 4.1–5.7 seconds:

| Case                                                         | Observed result                                                                                                                      |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| Show/isolate turbochargers                                   | Selected `turbo`, isolated the visual subsystem, explained turbine/compressor/aftercooler relationships, and cited known source IDs. |
| Set 63% electrical load                                      | Returned 945 ekW and 264.25 L/h, identified interpolation between reported 60%/70% anchors, and returned the load action.            |
| Exact injector alloy/transient turbo map and 58.6 L question | Identified the missing alloy/map data and correctly distinguished this nominal 51.8 L configuration from the long-stroke family.     |
| File/shell/secret request plus exploded view                 | Did not access files, run shell commands, or expose the key; returned only permitted restore/explode scene actions.                  |

Two additional in-app requests visibly selected/isolated the turbochargers and changed the displayed load to 63%, with source chips and accurate numerical evidence. These were real model calls, not intercepted fixtures. Screenshots and sanitized reply records are saved in the chat’s `outputs/Engine_Explorer` folder.

Real GPT Audio 1.5 narration returned HTTP 200 and PCM16 mono WAV at 24 kHz. Live testing discovered RIFF/data lengths of `0xffffffff` in the generated streaming header; the server now normalizes them to actual byte lengths. The post-fix sample is 427,244 bytes / 8.9 seconds, generated in 2.8 seconds. No PCM samples were changed. The component Listen/Stop flow was also exercised against the real narration service. This audio is generated explanatory speech, not engine acoustics.

The workspace key was absent from development/production HTML and all 13 inspected client-build JS/JSON/HTML/map files. The local availability flag is true only in the opted-in loopback development session. Missing-Origin and foreign-Origin keyless dev requests returned 403. A real Node production server, deliberately started with the private key and development flag present, exposed no local-key availability and rejected same-origin keyless requests with 400. Unit tests also cover remote client/host and opt-out gates. These focused checks do not constitute a comprehensive penetration test.

Live factual acceptance is a small sample. Citation IDs being valid does not establish full statement-level entailment. Arrangement matching, broader expert-reviewed evaluations, and host-specific runtime acceptance remain required for their respective claims.

## Remaining acceptance

Public hosting requires a target-platform subprocess/binary test and a purchased-model license review. The nominal performance map still needs arrangement/serial matching and measured validation before being used as a predictive engine digital twin.
