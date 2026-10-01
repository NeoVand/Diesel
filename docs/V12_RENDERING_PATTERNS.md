# Rendering and interaction patterns adopted

Reviewed 30 September 2026 against primary project documentation and source code.

## Solid sections

The [official Three.js stencil clipping example](https://github.com/mrdoob/three.js/blob/dev/examples/webgl_clipping_stencil.html) uses front/back winding counts and a plane to display material exposed by a section. Engine Lab applies the operation separately to source components so overlapping components do not cancel one another. Real holes remain holes; the cap follows the same component transform used for the visible part and selection.

This does not turn an open visual mesh into verified CAD. Native solids and browser tessellations have distinct validation requirements. The native audit, runtime section tests and scoped motion checks must be read together.

## Physically based finishes

The [Khronos glTF Sample Viewer](https://github.com/KhronosGroup/glTF-Sample-Viewer) is a useful reference for physically based material inspection and image-based lighting. The engine uses a filtered studio environment, separate key/fill/rim illumination, tone mapping and source material distinctions. Imported blanket metallic values are display inputs to interpret, not verified material properties.

The stage, light rig and source rest transforms stay fixed during ordinary disassembly. Mesh scale remains one. Camera fitting is an explicit operation; orthographic projection is used for the atlas.

## Screen-space interface

[Model-viewer's annotation examples](https://modelviewer.dev/examples/annotations) demonstrate labels attached to 3D positions while keeping their text readable in screen space. Atlas labels and the explorer interface follow that principle instead of rendering explanatory text into the floor texture.

The engine fills the viewport. Inspection, source evidence and the AI guide appear in an optional drawer. Component search is available on demand; the first view does not present a permanent catalogue of more than a thousand rows.

## Responsive rendering

[Three.js WebGLRenderer documentation](https://threejs.org/docs/pages/WebGLRenderer.html) informs the renderer setup. Pixel ratio is bounded; static views render on demand; shadows refresh when geometry changes. Playback uses elapsed time, and transform interpolation is independent of screen refresh rate. Reduced-motion preferences suppress decorative transitions.

Measured CPU render submission time is not GPU frame time. Performance evidence must state the browser, viewport and test scenario and must not present animation callback cadence as a GPU benchmark.

## Shared scene authority

UI controls, lessons and the AI guide use the same reducer and scene commands. The backend waits for browser acknowledgements. Source identities, evidence and geometry dimensions come from one versioned V12 definition, preventing legacy Caterpillar facts from entering the active demonstration.

The purchased design is a concept asset, not a production digital twin. Its measured linkage supports geometric motion; thermodynamic performance, valve timing, firing order and complete clearance certification require further evidence.
