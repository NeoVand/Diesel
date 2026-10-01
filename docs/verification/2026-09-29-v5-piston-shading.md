# Isolated piston crown shading control

The production close-up of `mech:piston:06` exposed white radial triangle fans on the educational piston crown. This is a shading defect, not an atlas transform, duplicate cut cap, overlapping top disk or source CAD defect. The crown is one closed lathed aluminium solid; the diagnostic scene contains zero moving section-cap meshes.

Read-only source inspection identified two contributors. Three's LatheGeometry averaged normals across profile bends, including the flat bowl pole. Its 56 coincident center vertices therefore had different radial normals, with approximately 51.56° tilt from the actual axial flat-face normal. The material also used anisotropy 0.2 with an angular lathe UV chart; derivative tangent differences made the face triangulation visible.

The same-camera isolated Chrome A/B is saved in `piston-controls.json` and four PNGs:

- `baseline.png`: radial triangle fans and false pole highlight.
- `anisotropy-off.png`: the sharp triangle fans disappear, but the incorrect flat-face/pole shading remains.
- `flat-normal-only.png`: the pole improves, but the white anisotropic triangle fans remain.
- `flat-normal-and-isotropic.png`: the flat crown and bowl floor render cleanly.

The probe modified only normal attributes and material anisotropy in its isolated browser. It corrected 336 nondegenerate horizontal triangles across the piston solid's flat faces; no position buffer was edited. All four controls used the identical camera, selected component and atlas cell transform. No browser error was recorded, and Chrome was closed after the controls.

The geometry owner is installing the minimal production repair: exact axial ±Y normals on horizontal nondegenerate piston triangles, with curved wall/bowl normals retained, and isotropic aluminium only for the piston finish. Source geometry, other teaching finishes, component IDs, triangle order, dimensions and actual openings are preserved. The owner verifies unchanged geometry/closure with focused regressions; the parent reruns final integration and browser acceptance and captures the repaired production close-up.
