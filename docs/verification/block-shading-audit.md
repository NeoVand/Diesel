# Lower crankcase shading audit

The conspicuous lower-block triangles in `webgpu-engine-assembly.png` are **projected exhaust-system shadows**, not new facets in the block mesh. The diagonal lattice above them is actual authored block geometry.

A read-only investigation reproduced the observation in the full `EngineStudio`, then changed one rendering condition at a time:

| Condition                                                                             | Lower-band triangles |
| ------------------------------------------------------------------------------------- | -------------------- |
| Current full assembly                                                                 | Present              |
| Block stops receiving shadows                                                         | Absent               |
| Block stops casting shadows                                                           | Present              |
| Key-light bias changes from −0.00003 to −0.0003                                       | Present              |
| Only exhaust-system parts stop casting shadows                                        | Absent               |
| Only cover, head, intake, piston, liner, rod or crankshaft parts stop casting shadows | Present              |

The six exhaust-role source components are `v12-0764` through `v12-0769`. Suppressing their shadows was a diagnostic operation in an isolated browser fixture; the application was not changed.

The original source GLB and corrected clearance block also render with a smooth lower band when isolated with shadows disabled. Switching the corrected block between interpolated and face normals does not introduce these patches. Their upper diagonal lattice remains visible in all cases. The same lower-band shadow pattern is present in the older WebGL screenshot `work/source-renderer/assembly.png` and in the earlier documentation image `docs/images/engine-explorer.webp`.

Evidence:

- `source-block-facets.png`: original block, corrected block, corrected face normals; shadows disabled.
- `block-scene-shadow-baseline.png`: actual studio lighting and materials.
- `block-scene-no-received-shadow.png`: only block shadow receiving disabled.
- `block-scene-no-self-shadow.png`: only block shadow casting disabled.
- `block-scene-larger-bias.png`: tenfold negative bias comparison.
- `work/browser-first-qa/block-no-shadow-exhaust.png`: exhaust-only casting disabled.
- `work/browser-first-qa/block-no-shadow-head.png`: comparison with head-only casting disabled.

This identifies the rendering cause of the observed pattern. If its appearance needs refinement, adjust shadow softness or the key/fill balance after a controlled visual comparison; changing block geometry, normals, or global bias is not supported by this evidence.
