# Engine Lab — continuous inspection workspace

## Design intent

An engineering workspace with a stable command structure, continuous source geometry and clear evidence. The engine is the subject; the interface gives each action a predictable home.

## Interaction model

- **View**: Exterior, Section, X-ray, Mechanism and Parts atlas. Exterior is the complete engine. Changing a view does not implicitly start playback. Run does not change the view, camera or reveal preset.
- **Exploded**: an explicit disassembly workspace with a retained 0–100% separation control. The camera eases to encompass the separated parts, then restores the prior framing as they reassemble. Disconnected components pause playback; Run explains why it is unavailable.
- **Playback**: one permanent bottom transport. Run/pause, phase, step and playback rate remain in the same place in every 3D view. Geometric playback is not presented as a rated operating speed.
- **Analysis**: measured piston displacement and rod-angle curves, linked to the actual sampled crank phase and source piston identity. This is useful kinematics; performance or combustion estimates require additional evidence.

## Information architecture

1. A slim application header: identity, lessons, sources and AI.
2. One workspace bar: named view modes, component search and analysis.
3. A small contextual caption and a labeled camera menu (isometric/front/side/top, fit, reset).
4. One bottom control deck: view-specific settings above the playback transport in 3D views. The static atlas keeps its return action and pause explanation here. No detached slider panels.
5. A contextual inspector for selected components, lessons, evidence, analysis or the guide. It is optional and retains existing source and AI capabilities.

## Visual continuity

Use a retargetable easing timeline, approximately 1.2 seconds for view transformations. Reversing a transition begins at its current pose. Exterior parts fade gradually for mechanism inspection; X-ray retains a ghosted envelope around opaque machinery. Explosion translates actual parts at unchanged physical scale, with a coordinated camera fit. The fixed studio floor and lights do not participate in the explosion. Add restrained underside fill illumination.

Atlas entry combines separation, organized packing and a gradual move toward a plan view. Return reverses the spatial transformation into the engine. Fine component families form masonry-style groups at one physical scale in 3D. Once the arrangement settles, a scrollable gallery presents 22 named families with previews rendered from the actual source geometry; each card opens a focused 3D family view. Preview images are independently fitted per card and explicitly labeled as such. This preserves readable titles and a useful overview without covering the source geometry with floating text. Original source identities remain intact.

## Primary references

- [Onshape section view](https://cad.onshape.com/help/Content/View/section_view.htm): contextual plane controls and explicit section activation.
- [Onshape exploded views](https://cad.onshape.com/help/Content/Assembly/exploded_views.htm): explicit disassembly state with fitting to the available graphics area.
- [Autodesk Fusion animation](https://help.autodesk.com/cloudhelp/ENU/Fusion-Animate/files/GUID-25E6D2E0-8057-4BFF-93B3-E7AEE2C4404A.htm): coordinated camera, transform and visibility actions on a timeline.
- [Onshape translucent rendering](https://cad.onshape.com/help/Content/View/shaded_unshaded__and_translucent.htm): transparency as a viewing choice.

These inform interaction principles; the implementation and visual design are specific to this source engine.

## Acceptance

- Run from Exterior leaves the shell and camera in place; mechanism entry requires an explicit view action.
- Mechanism and X-ray changes fade correctly, including rapid reversals and reduced-motion preferences.
- Explosion stays inside the camera frame, 0% remains editable, and return preserves orientation.
- Section, disassembly and playback controls occupy the same anchored deck on desktop and narrow screens.
- Camera buttons are labeled and keyboard accessible; no decorative icon guessing or native select menus in the primary controls.
- Atlas categories are meaningful, every presented body appears once, grouped chains retain their structure, and transitions retain a visual connection to the engine.
- Geometric analysis follows the same crank phase as the visible linkage, with dimensions and unknowns stated.
- Existing guide, narration, selection, source notes and lessons remain available.

## Implementation verification — 30 September 2026

The workspace above is implemented. Svelte check reports zero errors and warnings; formatting and lint pass. All 205 automated tests across 33 files pass, and the production build succeeds. Large application/3D bundle warnings remain; this is not a device-performance certification.

Live desktop and 390 × 844 browser checks covered independent exterior playback, progressive reveals, section controls, persistent zero separation, rapid atlas-return-to-explosion framing, all 22 complete source previews, precise family framing, manual component selection, the eight-step tour, and live kinematic measurements. A real AI request opened the full atlas and confirmed the applied scene. Manual Pause interrupted AI work without restarting motion. Lesson entry reassembled a lifted piston before its running cue.

The exterior playback check retained all 1,229 presented source bodies at unit scale. Maximum sampled camera-coordinate change when starting Run was 8.9 × 10⁻¹⁶ display units (floating-point roundoff). Source phase advanced while framing remained unchanged.

Browser regression files were updated and type-checked; live acceptance was performed in the in-app browser rather than the command-line browser runner. The concept engine’s existing timing, clearance and performance limitations remain in the motion and source audits.
