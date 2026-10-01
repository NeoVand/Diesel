"""Independent solver verification cases; run with the optional native environment."""

import json
from pathlib import Path
import tempfile

import numpy as np
from skfem import MeshTet

from rod_elasticity import (
    YOUNGS_MPA, POISSON, DENSITY_KG_M3, element_geometry, element_stress, mesh_step,
    run_analysis, solve_rod_mesh, solve_system,
)
from rod_step import BRepGProp, GProp_GProps, analytic_volume, build_rod


def affine_patch():
    mesh = MeshTet.init_tensor(np.linspace(0, 10, 5), np.linspace(0, 6, 4), np.linspace(0, 4, 4))
    boundary = np.unique(mesh.facets[:, mesh.boundary_facets()])
    interior = np.setdiff1d(np.arange(mesh.p.shape[1]), boundary)
    # A distorted mesh rules out relying on regular-tetrahedron cancellation.
    mesh.p[:, interior] += np.random.default_rng(8301).uniform(-0.2, 0.2, (3, len(interior)))
    gradient = np.array([[0.001, 0.0003, 0.0002], [-0.0001, -0.00025, 0.0001], [0.0001, 0.0002, 0.0004]])
    exact = mesh.p.T @ gradient.T + [0.015, -0.01, 0.007]
    displacement, _, energy, residual, _ = solve_system(mesh, np.zeros_like(mesh.p.T), boundary, exact[boundary])
    _, gradients, volumes = element_geometry(mesh)
    stress = element_stress(displacement, mesh.t.T, gradients)
    lam = YOUNGS_MPA * POISSON / ((1 + POISSON) * (1 - 2 * POISSON))
    mu = YOUNGS_MPA / (2 * (1 + POISSON))
    strain = (gradient + gradient.T) / 2
    expected_stress = 2 * mu * strain + lam * np.trace(strain) * np.eye(3)
    displacement_error = float(np.max(np.abs(displacement - exact)))
    stress_error = float(np.max(np.abs(stress - expected_stress)))
    exact_energy = float(0.5 * np.sum(strain * expected_stress) * volumes.sum())
    assert displacement_error < 1e-11 and stress_error < 1e-7
    assert abs(energy - exact_energy) / exact_energy < 1e-10 and residual < 1e-10
    return {"method": "Distorted tetrahedral affine patch with known full strain tensor", "nodes": mesh.p.shape[1], "elements": mesh.t.shape[1], "maxDisplacementErrorMm": displacement_error, "maxStressErrorMpa": stress_error, "energyRelativeError": abs(energy - exact_energy) / exact_energy, "residualRelative": residual}


def cantilever_check():
    # Slender 100x10x10 mm block. Full-face clamp and uniform transverse end traction.
    # Timoshenko is a comparison approximation; 3D end effects are retained by the solid model.
    length, depth, width, force = 100, 10, 10, 100
    e = YOUNGS_MPA
    g = e / (2 * (1 + POISSON))
    beam_reference = force * length**3 / (3 * e * width * depth**3 / 12) + force * length / ((5 / 6) * g * width * depth)
    runs = []
    for nx, ny in ((20, 2), (40, 4), (80, 8), (120, 12)):
        mesh = MeshTet.init_tensor(np.linspace(0, length, nx + 1), np.linspace(0, width, ny + 1), np.linspace(0, depth, ny + 1))
        points = mesh.p.T
        faces = mesh.facets[:, mesh.boundary_facets()].T
        end_faces = faces[np.all(np.abs(points[faces, 0] - length) < 1e-9, axis=1)]
        fc = points[end_faces]
        areas = np.linalg.norm(np.cross(fc[:, 1] - fc[:, 0], fc[:, 2] - fc[:, 0]), axis=1) / 2
        nodal_force = np.zeros_like(points)
        for corner in range(3):
            np.add.at(nodal_force[:, 2], end_faces[:, corner], force * areas / areas.sum() / 3)
        fixed = np.flatnonzero(np.abs(points[:, 0]) < 1e-9)
        displacement, reaction, _, residual, _ = solve_system(mesh, nodal_force, fixed)
        average = float((displacement[end_faces, 2].mean(axis=1) * areas).sum() / areas.sum())
        runs.append({"elements": mesh.t.shape[1], "nodes": mesh.p.shape[1], "meanEndDeflectionMm": average, "beamComparisonRelativeError": abs(average - beam_reference) / beam_reference, "reactionBalanceRelative": float(np.linalg.norm(reaction.sum(axis=0) + nodal_force.sum(axis=0)) / force), "residualRelative": residual})
    assert runs[-1]["beamComparisonRelativeError"] < 0.05, json.dumps({"reference": beam_reference, "runs": runs})
    assert all(right["meanEndDeflectionMm"] > left["meanEndDeflectionMm"] for left, right in zip(runs, runs[1:]))
    return {"method": "Four tetrahedral meshes of a slender clamped block under transverse end traction; comparison to bending-plus-shear beam, not identical 3D boundary-value problem", "beamReferenceMm": beam_reference, "runs": runs}


def main():
    output = {"patch": affine_patch(), "cantilever": cantilever_check()}
    baseline = {"rodLengthMm": 125, "rodWidthMm": 20, "rodDepthMm": 16, "webMm": 4, "flangeMm": 3}
    with tempfile.TemporaryDirectory(prefix="diesel-solid-verify-") as directory:
        result = run_analysis({"params": baseline, "loadCase": {"forceN": [0, -25000, 1000], "label": "Baseline fixed-bore fixture"}, "refine": True}, directory)
        assert result["convergence"]["withinScreeningTolerance"]
        assert result["stats"]["forceBalanceRelative"] < 1e-7
        assert result["stats"]["momentBalanceRelative"] < 1e-7
        assert len(result["surface"]["positionsMm"]) == len(result["surface"]["displacementMm"])
        assert len(result["surface"]["positionsMm"]) == 3 * len(result["surface"]["vonMisesMpa"])
        assert max(result["surface"]["triangles"]) < len(result["surface"]["vonMisesMpa"])
        output["rodRefinement"] = result["convergence"]
        output["runtime"] = result["runtime"]
        mesh = mesh_step(Path(directory) / "rod.step", 3.9)
        volume = analytic_volume(baseline)
        first = solve_rod_mesh(mesh, baseline, {"forceN": [0, -12500, 500]}, 3.9, volume)
        double = solve_rod_mesh(mesh, baseline, {"forceN": [0, -25000, 1000]}, 3.9, volume)
        u = np.asarray(first["surface"]["displacementMm"])
        u2 = np.asarray(double["surface"]["displacementMm"])
        scaling_error = float(np.linalg.norm(u2 - 2 * u) / np.linalg.norm(u2))
        energy_error = abs(double["stats"]["strainEnergyNmm"] / first["stats"]["strainEnergyNmm"] - 4)
        assert scaling_error < 1e-10 and energy_error < 1e-9
        inertia_case = {"forceN": [0, -25000, 0], "inertia": {"originAccelerationMps2": [1200, -800, 200], "angularVelocityRadS": [0, 0, 0], "angularAccelerationRadS2": [0, 0, 0]}}
        accelerated = solve_rod_mesh(mesh, baseline, inertia_case, 3.9, volume)
        expected_force = np.asarray(inertia_case["forceN"]) - accelerated["stats"]["volumeMm3"] * DENSITY_KG_M3 * 1e-9 * np.asarray(inertia_case["inertia"]["originAccelerationMps2"])
        inertia_error = float(np.linalg.norm(np.asarray(accelerated["stats"]["appliedN"]) - expected_force))
        assert inertia_error < 1e-7
        output["linearityAndInertia"] = {"displacementScalingRelativeError": scaling_error, "energyScalingAbsoluteError": energy_error, "uniformAccelerationResultantErrorN": inertia_error}
        moments = []
        for params in (baseline, {**baseline, "rodWidthMm": 26, "rodDepthMm": 14, "webMm": 5, "flangeMm": 2}, {**baseline, "rodLengthMm": 160, "rodWidthMm": 28, "rodDepthMm": 22, "webMm": 6, "flangeMm": 5}):
            properties = GProp_GProps()
            BRepGProp.VolumeProperties_s(build_rod(params), properties)
            centre = properties.CentreOfMass()
            moments.append({"params": params, "massKg": properties.Mass() * 7.85e-6, "centreOfMassMm": [centre.X(), centre.Y(), centre.Z()], "inertiaZKgM2": properties.MatrixOfInertia().Value(3, 3) * 7.85e-12})
        output["nativeMassProperties"] = moments
    destination = Path(__file__).resolve().parents[4] / "docs/verification/rod-solid-elasticity.json"
    destination.write_text(json.dumps(output, indent=2) + "\n")
    print(json.dumps({"verification": str(destination), "passed": True}))


if __name__ == "__main__":
    main()
