# Closed moving section faces — verified renderer repair

Final runtime files are frozen. The isolated Chrome browser was closed after validation.

## Implemented

- `src/lib/scene/section-plane.ts`: `MovingSectionCaps` counts the actual closed teaching triangles with nonzero-winding stencil intervals, one per component and clipping plane. All finish meshes contribute to the same solid union. Oppositely wound bore surfaces subtract; overlapping closed detail primitives add. No convex hull, filled bounding box, or per-frame CPU triangulation is used.
- Stencil masks follow each mesh's current world transform after shared mechanism phase and explosion/removal updates. Each cap has an isolated back/front/cap interval and stencil clear. Tight quads restrict fragment work to the component bounds.
- Cap faces run in both beauty and GTAO normal/depth passes. The normal-only path returns before lighting/IBL/shadow evaluation. Both composer targets and GTAO's actual r186 internal G-buffer have stencil attachments; the narrow internal-field cast is documented.
- Cut-face picks test the original solid winding, so a bearing aperture does not become a selectable rectangular cap quad. Stable instructional component IDs remain attached to cap faces.
- Two-plane cylinder study counts each complete original solid behind the current plane; other planes trim the resulting cap. This preserves both ends of a slab.
- Source casting and bank-cover cap policy is selective when instructional internals are visible. Their OEM interior ports/volumes are unverified, and filling their whole contour invents slabs across teaching ports. The source cut boundary remains visible. Explicit isolated source-only inspection still fills closed contours. No purchased mesh is hidden or modified by this policy.

The mechanics agent separately repaired the actual constituent geometry. Its final audit found 718 closed, consistently oriented positive-volume constituent solids. This renderer repair does not validate those instructional parts as OEM production geometry.

## Cause controls

`contact/baseline.png`, `contact/source-caps-off.png`, and `contact/moving-caps-off.png` isolate the remaining diagonal striping. Removing either competing cap contributor eliminates the pattern. It was the coincident generated source head-fill plane and the authored valve cut faces, rather than missing mesh normals or an ambient-occlusion artifact. The final selective source-boundary policy removes that conflict without inventing OEM valve ports or opening repaired teaching solids.

## Targeted verification

11 section tests pass in `src/lib/scene/section-plane.test.ts`: closed box area, preserved annular bore, open-sheet rejection, exterior-face contact rejection, guide state, cap restoration, selective casting policy, hole-aware picks, overlap unions, moving/arbitrary-plane transforms, and source-only cap fill restoration.

`gpu/proof.json` records the local Chrome GPU fixtures and actual engine captures. Browser errors: none.

- Box cut: beauty pixel is filled; normal `[128,128,255]`; cap depth byte100 vs uncapped121.
- Bored annulus: wall is filled while bore is clear in beauty, normal and depth buffers.
- Overlapping closed primitives: union remains filled; depth100 vs uncapped116.
- Oblique cut: correct camera-facing normal; depth100 vs uncapped124.
- Two-plane slab: two cap faces; cap depth95 vs uncapped/background255.
- Actual engine: X/Y/Z world cuts, reversed X, explosion, moving phase, focused cylinder study and fitted assembly were captured with the final geometry.

## Performance and limits

Chrome launch: `channel:'chrome', headless:true`, executable `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`; GPU `ANGLE (Apple, ANGLE Metal Renderer: Apple M4, Unspecified Version)`.

Viewport1168×880, browser device scale2, renderer pixel cap1.25. Final warmed running X section used8 cap intervals and roughly53,616 input triangles (per-frame active total changes with phase).

| Control            | Median frame interval |    p95 |
| ------------------ | --------------------: | -----: |
| Moving caps + GTAO |                16.6ms | 18.1ms |
| Caps disabled      |                16.5ms | 18.0ms |
| GTAO disabled      |                16.7ms | 18.2ms |

An earlier pre-optimization run measured16.7ms/p9518.9ms; another measured27ms/p9537.5ms. The latter is retained as an observed slow sample, with no confirmed concurrent-job cause. The final fresh warmed controls follow the normal-pass early-return optimization and source-cap conflict repair. These are local hardware measurements, not universal60fps guarantees.

GPU caps currently participate in color and AO depth/normal visibility; stencil cap quads are not separate shadow casters. The purchased exterior remains an unverified mixture of solid and surface geometry; open imported contours are deliberately not fabricated into OEM solids. Teaching placement, geometry, rod lengths, bank layout and timing remain illustrative.

Official implementation reference: https://threejs.org/examples/webgl_clipping_stencil.html and https://threejs.org/docs/pages/Material.html .
