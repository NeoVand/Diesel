# Purchased generic V12 — native CAD audit

Audit dates: 2026-09-29–30. Read-only audit of the six purchased files in `references/3dfiles/v12-quad-turbocharged-diesel-engine-cf492efc-f63a-4c18-86c7-d3bd0948c20d`. Originals are unchanged. Seller assertions are not used as geometry-validation evidence.

**Verdict:** this asset has genuine native solids and substantially complete core engine anatomy, suitable as the basis for a serious, unbranded teaching demonstration after mechanism, material and runtime preparation. It is a compact approximately **6.81 L V12**, not a 51.8 L industrial-engine substitute at the same physical scale. It is not manufacturing CAD certified against an actual engine and is not a validated thermodynamic simulator.

## Delivered files and provenance

All six files are inventoried with exact byte sizes and SHA-256 in `metadata.json`: native Fusion `.f3d`, STEP AP214, IGES, FBX, OBJ and STL. STEP records Autodesk Translation Framework v15.8.0.0 and a 2026-07-30 export timestamp. Geometry contexts use millimetres. The additional metre unit in the file is not evidence of a thousandfold scale ambiguity; native analytic features are measured in millimetres by OCCT. No original files were altered or deleted.

The Fusion document is a genuine ZIP archive with 711 entries, native BREP blobs, design/browser data, and a separate Animation asset. Its stored design stream includes as-built/assemble joint, joint-origin and motion-link feature identifiers and multiple motion-link strings. This is evidence of stored native design/kinematic content. The binary stream was not treated as a documented constraint API: joint types, ratios, limits, solve status and operable motion remain unverified until opened and driven in Fusion. The separate `Storyboard1`/Animation asset does not by itself establish a working cycle animation.

## Native assembly and topology

`step-native-audit.json` contains the native XDE hierarchy, occurrence transforms, definition bounds, individual-solid checks and analytic cylindrical faces. `step-text-tree.json` independently reconstructs the product graph from STEP declarations.

| Measured native result | Count |
| --- | ---: |
| Product definitions | 312 |
| Assembly definitions | 53 |
| Assembly-use relationships | 455 |
| Expanded leaf component occurrences | 403 |
| Distinct leaf definition labels | 259 |
| Nonempty leaf definitions | 221 |
| Empty history/placeholder definitions | 38 |
| Distinct native solids | 1,110 |
| Placed solid occurrences | 1,254 |
| Native shells belonging to distinct solids | 1,122 |
| Non-solid/open-shell definitions | 0 |
| Invalid nonempty definitions / invalid individual solids | 0 / 0 |

All 221 nonempty definitions and all 1,110 individual solids pass native OCCT `BRepCheck_Analyzer`. All 1,122 shell closed flags are true. The OCCT solid-level `Closed()` flag is false on imported solids and is not used as the closure criterion. Two STEP `BREP_WITH_VOIDS` entities and twelve oriented inner shells establish genuine cavity topology. These checks establish CAD consistency, not manufacturing tolerances, dynamics, collision-free motion or physical completeness of an engine.

The asset uses both meaningful system/component names and anonymous `ComponentNNN`/`BodyN` leaves. Several functional assemblies contain multiple bodies in one definition; some components combine geometry that would be separate manufactured parts. The raw solid count is not a count of unique engineering part numbers.

## Actual anatomy established by the native tree and solids

- Twelve separately placed piston components, twelve connecting-rod components and twelve liner/sleeve components; an actual crankshaft solid with six crankpin stations and seven main-journal surfaces.
- Two cylinder-head assemblies, valve seats/guides, valves, tappets and springs; four populated camshaft occurrences. An additional empty `cameshaft` history label does not mean the four populated camshafts are absent.
- Four turbo assemblies with separate turbine, compressor, bearing-housing and cover geometry; intake/exhaust assemblies and a heat exchanger.
- Timing-chain assemblies, camshaft/crankshaft wheels, pinions, tensioners and covers; physical timing geometry is present, but its transmission ratio and valve timing are not yet certified.
- Named glow-plug and injector systems with nonempty native geometry. Two injector-bank definitions each comprise one solid; the presence of a system does not guarantee every injector is independently detachable without separating the source geometry.
- Crank/cam bearing caps, flywheel, oil tank/pan, pipes and fasteners.

No explicitly named oil pump, water pump or high-pressure fuel pump was found in the delivered hierarchy. An anonymous body might represent such hardware, so absence of a name is not proof of physical absence. Oil galleries, cooling jackets, fuel-system completeness, injector internal working parts, piston rings/pins as independently separable manufactured pieces and exact lubrication plumbing still require visual/native inspection. Do not describe the package as every manufactured part of a tested diesel engine.

## Measured size and basic geometry

| Parameter | Native CAD evidence | Status |
| --- | --- | --- |
| Overall accurate assembly AABB | 679.219 × 537.289 × 731.836 mm in native X/Y/Z | Actual geometry bounds |
| Cylinder-bank included angle | 60° from liner-axis directions | Actual geometry |
| Liner inner radius / bore | 42.5 mm / 85 mm | Actual cylindrical face |
| Piston outer radius / diameter | 42 mm / 84 mm | Actual cylindrical faces |
| Diametral piston/liner clearance | 1 mm | Concept geometry; not a production fit |
| Crank throw / stroke | 50 mm / 100 mm | Main/crankpin axis separation; stroke derived |
| Connecting-rod centre distance | 125 mm | Big/small-end bore axes |
| Rod length / crank radius | 2.5 | Derived from native geometry |
| Swept displacement | 12 × π/4 × 85² × 100 = 6.809402 L | Geometric swept volume, not rated OEM displacement |

The FBX inventory's approximately 690 × 628 × 732 mm envelope used rotated local object bounding boxes. Those can be looser than exact transformed geometry and are not evidence of a native/export dimension mismatch. An actual transformed-vertex comparison remains a separate export check.

## Export discrepancy

The native STEP has 1,254 placed solids; FBX has 1,253 mesh occurrences and 1,109 mesh datablocks. Parent-name correspondence resolves the **single placed-solid difference to `flywheel`**: native flywheel has two solids, FBX flywheel has one mesh. A follow-up FBX connectivity check finds one connected, closed mesh after welding coincident vertices, with 29.904569 mm total axial thickness. That spans the combined native solids’ 29.904568 mm thickness, including the thin flange region. This is consistent with joined export geometry rather than a missing entire flange, although exact surface/volume equivalence has not been certified. See `export-count-comparison.json` and `flywheel-export-audit.json`.

## Mechanical gate

`analytic-mechanism.json` and `mechanical-datums.csv` record all twelve rod/piston/liner connections and six paired crank journals in native millimetres. Maximum static connection residual is below 1.2 × 10⁻¹¹ mm, numerical round-off at the inspected datums. The rod big ends sit side by side on the six actual crankpins. They are not assigned to the main-shaft axis.

An ideal rigid slider-crank calculation using the measured axes, 50 mm crank radius, 125 mm rod length and supplied mechanical phases was checked at one-degree increments over 720 degrees: 8,652 configurations, with numerical rod-length closure and bore-axis alignment. This verifies the connection mathematics and periodicity, **not an exact moving-solid collision sweep**. No combustion sequence or cam timing was imposed by this check.

The source has zero nominal radial clearance between rod big-end bore and crankpin, and zero nominal side clearance between paired rods; small negative values around 2 × 10⁻⁷ mm reflect bounding-box tolerances. The 1 mm piston/liner diametral gap is also concept geometry, not a production fit. These dimensions make this appropriate for visual instruction, not a production-ready manufacturing assembly.

Repeated analytic outer-land faces suggest 40 on a cam wheel and 30 on the named crank wheel. That is a signal to inspect the **entire timing drive and native MotionLinks**, not evidence of a verified 2:1 cam/crank ratio. Do not animate the cams at an assumed ratio and present the supplied chains as validated engagement.

Still unverified: moving surface interference with counterweights, block, liners, heads and valves; deck/piston/valve clearances; chain engagement and transmission; Fusion constraint solve; production valve events, injection schedule, firing order, compression ratio, loads, friction, performance maps and material grades. No explicitly named water, oil or high-pressure fuel pump has been established. A visually complete core mechanism is not every working subsystem of a tested diesel engine.

## Safe development use

Use the purchased native geometry and its dimensions as this unbranded concept's geometry evidence. Preserve hierarchy and source component IDs; add semantic labels with explicit review status. Build browser motion from verified native datums or verified Fusion constraints. Treat cycle timing, combustion, flows, materials, engine ratings and performance as separately sourced or explicitly authored teaching assumptions. Previous Caterpillar 3512C numerical data must not silently carry over to this engine.

Use FBX as a practical visual input, with a documented native-to-render coordinate conversion. The supplied FBX has no animation actions/armature and no image textures; its material labels are useful starting points, while blanket metallic conversion values require correction. Native Fusion motion may still be usable after a runtime inspection. Public browser redistribution and the AI-integrated viewer's use should remain within the purchased licence; do not train models on the asset or expose original source downloads.
