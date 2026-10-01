# Screenshot provenance

The README's current hero is `docs/verification/public-assembly.png`: an unmodified 1600 × 1000 fresh-browser capture of the actual GitHub Pages application on 1 October 2026. The associated `public-*.png` images show that same acceptance session, including the separately emulated phone presentation. [Public release evidence](../verification/public-pages.md) records its deployed commit, native WebGPU backend, calculations and resource checks.

The six WebP files in this directory are historical tour captures. The current README uses the native WebGPU captures in `docs/verification/` for the engine, section, process and atlas views. Those October 1, 2026 screenshots retain the complete 1440 × 1000 viewport and are documented in [renderer verification](../verification/webgpu-renderer.md). The mobile preview is an unchanged copy of `webgpu-engine-assembly.png`. The current parametric image is `docs/verification/browser-parametric-cranktrain.png`, an unmodified frame from the October 1 browser-tour chapter07 rehearsal: 2560 × 1440 at 150% browser zoom, native WebGPU canvas verified in recording diagnostics. It shows bore 90.026 mm and displacement-constrained stroke 89.145 mm with linked measurements. The current solid-analysis image is `docs/verification/packaged-static-solid-result.png`; its exact browser computation is recorded in the adjacent packaged-static report. The historical WebP files below are retained as an archive and are not used in the current README.

These are actual Engine Lab application views captured during the September 30, 2026 tour recording. They are not rendered mockups. All six images retain the complete 2560 × 1440 application viewport at the recording's 150% browser zoom. The pointer and application state are preserved.

Each file is lossless WebP. Decoded RGB pixels were checked against the source PNG; no resizing, cropping, recolouring, compositing, or promotional overlays were applied. Frames extracted from the tour preserve the recording's existing video compression.

| File                         | Source within the local tour archive                      | Suggested alt text                                                                                                                |
| ---------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `engine-explorer.webp`       | `revision/video/13-development-end.png`                   | Engine Lab showing the assembled V12 diesel concept with inspection controls and crank-angle playback.                            |
| `section-inspection.webp`    | `revision/temporal-qa/03-inspection-tools/11.50.png`      | A movable section plane reveals the V12's internal geometry, with plane position and crank-angle controls below.                  |
| `component-atlas.webp`       | `revision/temporal-qa/03-inspection-tools/34.00.png`      | The component atlas groups 1,229 mechanical bodies into 22 families with individual 3D previews.                                  |
| `mechanism-processes.webp`   | `revision/temporal-qa/05-gas-exchange-retake/32.00.png`   | Internal mechanism view with translucent intake and exhaust paths, fuel lines, and compression-ignition glow.                     |
| `parametric-cranktrain.webp` | `revision/video/08-geometry.mp4`, frame at 20.000 s       | Parametric V12 cranktrain with a 90 mm bore, displacement-constrained stroke, live measurements, and a linked piston-travel plot. |
| `solid-analysis.webp`        | `revision/video/10-solid-analysis.mp4`, frame at 39.300 s | Connecting-rod solid analysis showing its mesh, displacement field, prescribed operating loads, and equilibrium check.            |

The local archive is `work/video-tour/` in the tour production workspace. Its raw video is not required to run this repository. The screenshot set totals approximately 2.94 MiB.

The solid-analysis screenshot displays **25× amplified deformation** for visibility; the legend states that amplification and reports physical displacement separately. The process overlays are illustrative, and the screenshot does not establish a validated combustion or emissions calculation. See the main README for model scope and numerical limitations.

No API keys, settings credentials, private messages, or personal account details are visible in these six views. The purchased source asset's licence still governs the underlying geometry; these screenshots do not grant redistribution rights to the model files.
