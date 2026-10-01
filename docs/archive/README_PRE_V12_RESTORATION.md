# Historical README — before the V12 restoration

Not the active product documentation.

# Diesel Engine Lab

## Active delivery plan

The [V12 explorer delivery plan](docs/V12_EXPLORER_PLAN.md) is the current product roadmap. It restores the existing cutaway, operation, parts atlas, teaching and AI experience around the purchased V12. The audit route below remains a geometry-inspection tool.

## Active V12 inspection

The purchased generic **60° V12 / 85 × 100 mm / approximately 6.81 L** is now available at **[/asset-review](http://127.0.0.1:5173/asset-review)**. This route displays actual source geometry, with internal visibility, stable component identities, source paths, search, selection/isolation and separation. Read the [native audit](references/00_Active_V12/V12_NATIVE_AUDIT.md), [runtime verification](references/00_Active_V12/RUNTIME_REVIEW.md) and [migration requirements](references/00_Active_V12/APP_MIGRATION_AUDIT.md).

The source has valid solids and aligned core connection datums. It has idealized fits; exact moving clearances, timing, complete auxiliary systems and performance are not validated. This is a compact teaching-design candidate, not a 51.8 L engine. The review route deliberately has no Caterpillar performance or AI context.

All six originals remain in `references/3dfiles`. Superseded references are preserved in `references/99_Archive/Caterpillar_3512_2026-09-29`, with a new [active index](references/README.md). The old main-page experience below remains a historical prototype pending a complete, separately verified migration.

## Historical Caterpillar prototype

An interactive engineering studio around the purchased 3512 assembly and the documented **3512C / 51.8 L / 60 Hz / 1800 rpm** reference configuration. The opening view is the purchased exterior; the moving internals are a separately authored educational mechanism. The selected performance report is **EM1898-00 / 1500 ekW standby**.

## Run

```sh
pnpm install
pnpm dev --host 127.0.0.1
```

Open the local address printed by the server. The prepared asset is `static/models/engine.glb`; keep the licensed original archives in `references/3dfiles`. Commercial geometry is excluded from Git.

## Experience

- **Inspect:** click individual components or search the library. Double-click a component to isolate and frame it. Focus, hide, remove, explode and restore. Explosions include the authored internal mechanism, with a visibility switch. All 587 source groups retain stable identities; 569 also have qualified native STEP product-label associations.
- **Parts layout:** choose Arrange parts or the Parts tab for a system-by-system grid of 587 purchased bodies and 88 teaching parts. Focus a group, select or double-click a component, then return to the assembly. Individual display scales preserve shape, not relative physical size. The regular explosion now has three times the prior maximum separation; its slider stays available at zero.
- **Operate:** move a section plane through the complete exterior and teaching internals, choose its axis, reverse the retained side and show/hide its guide. Open **Cylinder study** for one cylinder or **Mechanism** for the full V12. Run, pause, step and scrub the four-stroke cycle; follow air, exhaust, fuel, coolant and lubrication paths. Playback speed is separate from the 1800 rpm reference speed.
- **Welcome:** a replayable eight-step guided demonstration operates the real assembly, section, cycle, fuel study and performance views, and introduces the AI guide.
- **Learn:** three authored tours coordinate the scene, cycle events, flow and optional spoken explanation. Stop interrupts motion, narration and the live guide.
- **Performance:** inspect published and interpolated load points with units and provenance. This view retains the fixed-speed source report; it does not imply calibrated transient behavior.
- **Guide:** ask questions and request actual engine actions through the open-source Codex harness. The guide queries live state, executes bounded scene tools and waits for browser acknowledgement.

Shortcuts: **Space** run/pause, **E** explode/assemble, **G** parts layout, **C** cutaway/assembly, **F** fit, **Esc** stop. Drag to orbit, scroll/pinch to zoom and right-drag to pan.

## AI connection

Invited viewers unlock AI with the host's demo password. The private OpenAI key stays on the server; visitors receive a short-lived HttpOnly/Secure cookie. Local loopback development can use the authorized key from the ignored `.env` file immediately. The settings dialog explains readiness and provides an optional advanced bring-your-own-key connection, held only in tab memory.

For hosting, configure `OPENAI_API_KEY`, `DIESEL_DEMO_PASSWORD`, `DIESEL_SESSION_SECRET` and the exact HTTPS `ORIGIN`. The prepared deployment profile is one persistent Node container, which owns the Codex native process and live browser acknowledgement broker. Vercel/Cloudflare alternatives need the routing/runtime work described in [Deployment](docs/DEPLOYMENT.md); no public hosting has been performed. Narration uses `gpt-audio-1.5` for explanatory speech, not engine acoustics.

## Checks

```sh
pnpm check
pnpm lint
pnpm test:unit --run
pnpm test:e2e
pnpm build
```

The browser suite builds a production preview on port 4183 and uses installed Google Chrome to exercise the hardware-accelerated 3D experience. Automated AI/audio tests use fixtures and make no paid calls. Live service acceptance is recorded separately.

## Documentation

- [Parts layout and expanded explosion](docs/PARTS_LAYOUT.md)
- [Current experience and next fidelity steps](docs/DESIGN_AND_ROADMAP.md)
- [Asset pipeline and native CAD recovery](docs/ASSET_PIPELINE.md)
- [Simulation scope and evidence](docs/SIMULATION_SCOPE.md)
- [AI architecture](docs/AI_ARCHITECTURE.md)
- [Deployment](docs/DEPLOYMENT.md)
- [Verification](docs/VERIFICATION.md)
- [Original next-level plan](docs/NEXT_LEVEL_PLAN.md)
- [Reference pack](references/README.md)

Built with Svelte 5/SvelteKit, TypeScript, Three.js, Hugeicons and the Node adapter. Native vendor labels do not establish OEM part identity or 3512C applicability. Finishes are authored display materials; rod dimensions, detailed internals, cylinder sequence, timing and flow routing remain explicitly educational until configuration-matched evidence replaces them.
