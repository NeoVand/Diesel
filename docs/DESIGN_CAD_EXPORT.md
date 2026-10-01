# Parametric rod: exact CAD and verification

The design lab generates a new, bounded rod family around the source bearing interfaces. It does not claim to recover the purchased Fusion feature history or certify an engine component. The browser preview, analytical full-solid mass and native STEP export share a documented geometry contract.

## Geometry contract

Units are millimetres. The rod lies in XY with its big-eye centre at `(0, 0)` and small-eye centre at `(0, rodLengthMm)`. Both hole axes are Z. Big-eye outer/inner radii are 32/25 mm; small-eye outer/inner radii are 15/9 mm. Both eyes have total thickness `rodDepthMm`, centred on Z = 0.

The central I-section is the union of a web and two flange layers. Each layer's planar footprint is the union of the two eye discs and a rectangle running between eye centres. The central layer uses rectangle width `webMm` and depth `rodDepthMm - 2 * flangeMm`. Each flange uses rectangle width `rodWidthMm` and thickness `flangeMm`. The bearing holes cut through every layer.

Native OCCT constructs the same result by fusing the eye cylinders and three rectangular prisms, cutting the through-bores, and unifying coincident faces. This produces one connected solid. It includes sharp transitions, not manufactured fillets, a split cap, bolts or bearing inserts.

| Parameter     | Allowed interval |
| ------------- | ---------------- |
| `rodLengthMm` | 110–160 mm       |
| `rodWidthMm`  | 14–28 mm         |
| `rodDepthMm`  | 12–22 mm         |
| `webMm`       | 2–6 mm           |
| `flangeMm`    | 2–5 mm           |

The web must be narrower than the flanges; the two flanges must leave positive central web depth. Validation runs in both the HTTP boundary and Python worker. These are demonstrator bounds, not manufacturing limits.

## Endpoint

`POST /api/design/rod-step`, with `Content-Type: application/json`:

```json
{
	"params": {
		"rodLengthMm": 125,
		"rodWidthMm": 20,
		"rodDepthMm": 16,
		"webMm": 4,
		"flangeMm": 3
	},
	"format": "json"
}
```

The complete design parameter object is also accepted; only the five geometry parameters above enter CAD. `format: "json"` returns the verification report. `format: "step"` returns a downloadable STEP file; STEP is the default. A flat geometry object remains accepted for scripted callers.

The report identifies the schema and normalized parameters, their SHA-256 hash, OCCT version, solid count, validity, bounds, exact volume, assumed-density mass, comparison with the independent analytic union volume, and STEP round-trip validity/volume agreement. The hash describes the geometry parameters and schema, not the source file or an analysis result. The STEP response also supplies `X-Design-Parameter-Hash` and `X-Design-Volume-MM3` headers.

The app must associate a returned report with its returned parameters. Changing a rod parameter invalidates the previous verification for the current design. Operating conditions do not change this geometry-only report. Downloading a valid STEP does not mean its stresses or engine performance have been validated.

Limits: 4 KiB JSON body, one concurrent native process per Node instance, 25-second process timeout, fixed program arguments, no shell execution, temporary files cleaned after success or failure. Cross-origin requests are rejected. Invalid input returns 400, unavailable OCP runtime 503, busy kernel 429, unverified geometry 422, timeout 504. Raw subprocess diagnostics are never returned to the browser.

## Optional native runtime

The app itself has no added Python or CAD package dependency. Configure `DESIGN_CAD_PYTHON` on a Node server to an executable Python runtime containing `cadquery-ocp` / the `OCP` module. The existing local audit environment already provides Python 3.12 and OCP 8.0.1. No new package was installed for this implementation.

If no executable is configured, the server tries `.venv-cad/bin/python`, `references/00_Active_V12/audit-tools/.venv/bin/python`, then `python3`. The Python exporter is bundled as server text by Vite, so a deployed build does not need a separate source-script copy. An unavailable runtime gives a clear 503; it never substitutes mesh export for solid STEP.

The current Dockerfile does not install Python/OCP. A deployment must provision that optional runtime separately to enable native verification and export. Edge runtimes without native subprocess support need a separate CAD service. Serverless limits and supported OS/CPU wheels must be checked before enabling this endpoint there. Browser calculation, preview and case JSON export remain separate from this capability.

## Reproducible evidence

Run the native verifier with an OCP-enabled interpreter:

```sh
"$DESIGN_CAD_PYTHON" scripts/verify-rod-cad.py
pnpm exec vitest run src/lib/server/design-cad.test.ts src/lib/server/design-cad-route.test.ts src/lib/design/design-reference.test.ts --project server
```

The Python script checks the baseline and all 32 corners of the five-dimensional parameter box. Each case is constructed as an OCCT solid, checked with `BRepCheck_Analyzer`, measured through native volume properties, exported to STEP, reimported, and checked again. Temporary STEP files are removed. Its reusable report is [rod-cad-kernel.json](verification/rod-cad-kernel.json); TypeScript tests independently compare the browser analytic volume against those kernel results.

At the baseline 125/20/16/4/3 mm, OCCT measures **39,984.269681 mm³**. At the explicitly assumed steel density of 7,850 kg/m³, the full solid weighs **0.313876517 kg**. Analytic volume agrees within 1e-8 relative error across all tested corners; STEP round-trip volume uses the same tolerance. These checks establish geometric consistency, not manufacturing readiness.

The live local endpoint was also exercised on 2026-09-30: JSON and a 57,715-byte STEP both returned 200 with matching parameter hashes; invalid, cross-origin and oversized requests returned 400, 403 and 413. Two simultaneous native requests returned 200 and 429. Results are recorded in [rod-cad-http.json](verification/rod-cad-http.json). Eight scoped TypeScript checks passed, including native-volume fixture agreement and independent numerical integration of section shear energy and beam strain energy.

## Structural screening scope

The structural model concerns the uniform free shank between eye envelopes, with span `rodLengthMm - 32 - 15`. At baseline that span is only 78 mm with depth 16 mm. Shear deformation is therefore retained using Timoshenko theory and a section shear-energy calculation. The independent beam stiffness solve checks the bending-plus-shear solution across 4/8/16/32 elements. This compares two numerical formulations of the same idealized problem; it does not validate a complete rod against measured hardware. [TU Delft's Timoshenko formulation](https://interactivetextbooks.citg.tudelft.nl/computational-modelling/structural_linear/timoshenko_md.html) explains the independent rotation/displacement fields and effective shear area.

The section calculation uses assumed homogeneous, isotropic steel, a central transverse point load and compressive axial load. It excludes detailed bearing/shoulder stresses, contact, fatigue, thermal effects, geometric imperfections and second-order load amplification. The displayed uniform-beam frequency is an unloaded beam estimate, not an assembled engine resonance.

The ideal elastic Euler value is a reference, not a usable buckling capacity for this short shank: at baseline it implies critical stress far above the assumed 250 MPa stress threshold. It is excluded from the optimization feasibility constraints. A verified material model and appropriate nonlinear instability analysis are needed before claiming actual buckling resistance. [Eric Raymond Johnson's Virginia Tech text](https://eng.libretexts.org/Under_Construction/Aerospace_Structures_%28Johnson%29/11%3A_Buckling_of_columns_and_plates) explains the elastic-range restriction and column slenderness.

Each geometry change recomputes section properties and the beam stiffness system. Old unit-load fields are not stretched onto new geometry. A future 3D analysis must similarly update the solid mesh and operators for each changed design and validate any reduced approximation within its intended parameter range.
