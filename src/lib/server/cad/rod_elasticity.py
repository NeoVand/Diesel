"""Native linear tetrahedral elasticity on the exact design-lab rod solid.

Small-strain isotropic elasticity; a declared bore fixture, not contact analysis.
Stress percentiles are volume weighted. Recovered surface stress is display data.
"""

import json
from pathlib import Path
import sys
import time

try:
    import gmsh
    import numpy as np
    import scipy
    from scipy.sparse.linalg import cg, spsolve
    import skfem
    from skfem import Basis, ElementTetP1, ElementVector, MeshTet, asm
    from skfem.models.elasticity import lame_parameters, linear_elasticity
    import pyamg
except ImportError:
    print("The selected runtime needs numpy, scipy, gmsh, scikit-fem and pyamg.", file=sys.stderr)
    sys.exit(78)

from rod_step import export_verified, validate_params

YOUNGS_MPA = 210000.0
POISSON = 0.3
DENSITY_KG_M3 = 7850.0
MAX_ELEMENTS = 160000
MAX_NODES = 45000


def mesh_step(step_path, size):
    gmsh.initialize()
    try:
        gmsh.option.setNumber("General.Terminal", 0)
        gmsh.option.setNumber("General.NumThreads", 1)
        gmsh.model.add("rod")
        gmsh.model.occ.importShapes(str(step_path))
        gmsh.model.occ.synchronize()
        if len(gmsh.model.getEntities(3)) != 1:
            raise ValueError("The STEP must contain one connected solid domain.")
        gmsh.option.setNumber("Mesh.MeshSizeMin", size * 0.6)
        gmsh.option.setNumber("Mesh.MeshSizeMax", size)
        gmsh.option.setNumber("Mesh.MeshSizeFromCurvature", 18)
        gmsh.option.setNumber("Mesh.MeshSizeExtendFromBoundary", 1)
        gmsh.option.setNumber("Mesh.Algorithm3D", 1)
        gmsh.option.setNumber("Mesh.ElementOrder", 1)
        gmsh.option.setNumber("Mesh.Optimize", 1)
        gmsh.model.mesh.generate(3)
        node_tags, coordinates, _ = gmsh.model.mesh.getNodes()
        types, _, connectivity = gmsh.model.mesh.getElements(3)
        if len(types) != 1 or types[0] != 4:
            raise ValueError("Expected linear tetrahedral volume elements.")
        points = np.asarray(coordinates).reshape(-1, 3)
        lookup = {int(tag): index for index, tag in enumerate(node_tags)}
        tets = np.asarray([lookup[int(tag)] for tag in connectivity[0]], dtype=np.int32).reshape(-1, 4)
        if len(points) > MAX_NODES or len(tets) > MAX_ELEMENTS:
            raise ValueError("The generated mesh exceeds this demo's bounded solver size.")
        return MeshTet(points.T, tets.T)
    finally:
        gmsh.finalize()


def element_geometry(mesh):
    coords = mesh.p.T[mesh.t.T]
    interpolation = np.concatenate((np.ones((*coords.shape[:2], 1)), coords), axis=2)
    coefficients = np.linalg.inv(interpolation)
    gradients = coefficients[:, 1:, :].transpose(0, 2, 1)
    volumes = np.abs(np.linalg.det(coords[:, 1:, :] - coords[:, :1, :])) / 6
    if np.any(volumes < 1e-10):
        raise ValueError("The volume mesh contains a degenerate element.")
    return coords, gradients, volumes


def von_mises(stress):
    mean = np.trace(stress, axis1=-2, axis2=-1)[..., None, None] / 3
    dev = stress - mean * np.eye(3)
    return np.sqrt(1.5 * np.sum(dev * dev, axis=(-2, -1)))


def element_stress(displacement, tets, gradients):
    displacement_gradient = np.einsum("eni,enj->eij", displacement[tets], gradients)
    strain = 0.5 * (displacement_gradient + displacement_gradient.transpose(0, 2, 1))
    lam, mu = lame_parameters(YOUNGS_MPA, POISSON)
    return 2 * mu * strain + lam * np.trace(strain, axis1=1, axis2=2)[:, None, None] * np.eye(3)


def weighted_percentile(values, weights, fraction):
    if not len(values):
        raise ValueError("No interior elements remain for the reported stress statistic.")
    order = np.argsort(values)
    cumulative = np.cumsum(weights[order])
    return float(values[order[min(np.searchsorted(cumulative, fraction * cumulative[-1]), len(order) - 1)]])


def rigid_modes(points, basis):
    xyz = points - points.mean(axis=0)
    xyz /= max(float(np.max(np.abs(xyz))), 1)
    modes = np.zeros((basis.N, 6))
    for axis in range(3):
        modes[basis.nodal_dofs[axis], axis] = 1
        rotation = np.cross(np.eye(3)[axis], xyz)
        for component in range(3):
            modes[basis.nodal_dofs[component], axis + 3] = rotation[:, component]
    return modes


def solve_system(mesh, nodal_force, fixed_nodes, prescribed=None):
    basis = Basis(mesh, ElementVector(ElementTetP1()), intorder=1)
    lam, mu = lame_parameters(YOUNGS_MPA, POISSON)
    stiffness = asm(linear_elasticity(lam, mu), basis).tocsr()
    force = np.zeros(basis.N)
    force[basis.nodal_dofs] = nodal_force.T
    fixed = basis.nodal_dofs[:, fixed_nodes].reshape(-1)
    free = np.setdiff1d(np.arange(basis.N), fixed)
    displacement = np.zeros(basis.N)
    if prescribed is not None:
        displacement[basis.nodal_dofs[:, fixed_nodes]] = prescribed.T
    rhs = force[free] - stiffness[free][:, fixed] @ displacement[fixed]
    restricted = stiffness[free][:, free]
    iterations = [0]
    if len(free) < 24000:
        displacement[free] = spsolve(restricted, rhs)
        iterations[0] = 1
    else:
        hierarchy = pyamg.smoothed_aggregation_solver(restricted, B=rigid_modes(mesh.p.T, basis)[free])
        def count(_):
            iterations[0] += 1
        solution, status = cg(restricted, rhs, M=hierarchy.aspreconditioner(), rtol=1e-9, atol=1e-10, maxiter=500, callback=count)
        if status != 0:
            raise ValueError("The iterative elasticity solve did not converge.")
        displacement[free] = solution
    residual = stiffness @ displacement - force
    residual_relative = float(np.linalg.norm(residual[free]) / max(np.linalg.norm(force), np.linalg.norm(rhs), 1))
    if not np.all(np.isfinite(displacement)) or residual_relative > 1e-7:
        raise ValueError("The elasticity solve did not satisfy the residual tolerance.")
    reactions = np.zeros_like(force)
    reactions[fixed] = residual[fixed]
    return (
        displacement[basis.nodal_dofs].T,
        reactions[basis.nodal_dofs].T,
        float(0.5 * displacement @ (stiffness @ displacement)),
        residual_relative,
        iterations[0],
    )


def solve_rod_mesh(mesh, params, case, size, exact_volume):
    started = time.monotonic()
    points, tets = mesh.p.T, mesh.t.T
    coords, gradients, volumes = element_geometry(mesh)
    if abs(volumes.sum() - exact_volume) / exact_volume > 0.015:
        raise ValueError("The tetrahedral domain volume differs too much from the native solid.")
    boundary_ids = mesh.boundary_facets()
    faces = mesh.facets[:, boundary_ids].T.copy()
    face_coords = points[faces]
    centres = face_coords.mean(axis=1)
    face_vectors = np.cross(face_coords[:, 1] - face_coords[:, 0], face_coords[:, 2] - face_coords[:, 0])
    areas = np.linalg.norm(face_vectors, axis=1) / 2
    face_cell = mesh.f2t[0, boundary_ids]
    backwards = np.sum(face_vectors * (coords.mean(axis=1)[face_cell] - centres), axis=1) > 0
    faces[backwards] = faces[backwards][:, [0, 2, 1]]

    big_radius = np.linalg.norm(points[:, :2], axis=1)
    small_radius = np.linalg.norm(points[:, :2] - [0, params["rodLengthMm"]], axis=1)
    fixed_mask = np.all(np.abs(big_radius[faces] - 25) < 1e-5, axis=1)
    load_mask = np.all(np.abs(small_radius[faces] - 9) < 1e-5, axis=1)
    fixed_nodes = np.unique(faces[fixed_mask])
    if len(fixed_nodes) < 12 or np.count_nonzero(load_mask) < 12:
        raise ValueError("Bearing surface classification failed.")

    requested_force = np.asarray(case["forceN"], dtype=float)
    in_plane = requested_force[:2]
    direction = in_plane / np.linalg.norm(in_plane) if np.linalg.norm(in_plane) > 1e-12 else np.array([0, -1])
    radial = centres[load_mask, :2] - [0, params["rodLengthMm"]]
    radial /= np.linalg.norm(radial, axis=1)[:, None]
    weights = np.maximum(radial @ direction, 0) * areas[load_mask]
    if weights.sum() <= 0:
        raise ValueError("No loaded bearing area was found.")
    nodal_force = np.zeros_like(points)
    face_force = weights[:, None] / weights.sum() * requested_force
    for corner in range(3):
        np.add.at(nodal_force, faces[load_mask, corner], face_force / 3)
    loaded_nodes = np.unique(faces[load_mask][weights > 0])

    inertia = case.get("inertia")
    if inertia:
        origin_acceleration = np.asarray(inertia["originAccelerationMps2"])
        omega = np.asarray(inertia["angularVelocityRadS"])
        alpha = np.asarray(inertia["angularAccelerationRadS2"])
        xyz_m = coords / 1000
        acceleration = origin_acceleration + np.cross(alpha, xyz_m) + np.cross(omega, np.cross(omega, xyz_m))
        body_density = -DENSITY_KG_M3 * 1e-9 * acceleration
        # Consistent integral of Ni*b(x), exact for the linear acceleration field.
        body_force = volumes[:, None, None] / 20 * (body_density.sum(axis=1)[:, None, :] + body_density)
        for corner in range(4):
            np.add.at(nodal_force, tets[:, corner], body_force[:, corner])

    displacement, reaction, energy, residual, iterations = solve_system(mesh, nodal_force, fixed_nodes)
    stress = element_stress(displacement, tets, gradients)
    vm = von_mises(stress)
    recovered_stress = np.zeros((len(points), 3, 3))
    vertex_volume = np.zeros(len(points))
    for corner in range(4):
        np.add.at(recovered_stress, tets[:, corner], stress * volumes[:, None, None])
        np.add.at(vertex_volume, tets[:, corner], volumes)
    recovered_stress /= vertex_volume[:, None, None]
    display_vm = von_mises(recovered_stress)

    element_centres = coords.mean(axis=1)
    # Exclude both ideal fixture/load zones AND the sharp eye/shank transitions.
    exclusion = max(params["rodDepthMm"] / 2, 6)
    interior = (element_centres[:, 1] > 32 + exclusion) & (element_centres[:, 1] < params["rodLengthMm"] - 15 - exclusion)
    applied = nodal_force.sum(axis=0)
    support = reaction.sum(axis=0)
    force_scale = max(float(np.linalg.norm(applied)), float(np.linalg.norm(requested_force)), 1)
    moment = np.cross(points, nodal_force).sum(axis=0)
    reaction_moment = np.cross(points, reaction).sum(axis=0)
    moment_scale = max(float(np.linalg.norm(moment)), force_scale * params["rodLengthMm"], 1)
    force_balance = float(np.linalg.norm(applied + support) / force_scale)
    moment_balance = float(np.linalg.norm(moment + reaction_moment) / moment_scale)
    if force_balance > 1e-5 or moment_balance > 1e-5:
        raise ValueError("The solution did not pass reaction equilibrium checks.")
    surface_nodes, surface_faces = np.unique(faces, return_inverse=True)
    remap = np.full(len(points), -1, dtype=int)
    remap[surface_nodes] = np.arange(len(surface_nodes))
    load_displacement = (displacement[faces[load_mask]].mean(axis=1) * weights[:, None]).sum(axis=0) / weights.sum()
    stats = {
        "meshSizeMm": size, "nodes": len(points), "elements": len(tets), "dofs": 3 * len(points),
        "volumeMm3": float(volumes.sum()), "volumeRelativeError": float(abs(volumes.sum() - exact_volume) / exact_volume),
        "maxDisplacementMm": float(np.linalg.norm(displacement, axis=1).max()),
        "loadedMeanDisplacementMm": load_displacement.tolist(), "strainEnergyNmm": energy,
        "p95VonMisesMpa": weighted_percentile(vm, volumes, 0.95),
        "p99VonMisesMpa": weighted_percentile(vm, volumes, 0.99),
        "interiorP95VonMisesMpa": weighted_percentile(vm[interior], volumes[interior], 0.95),
        "interiorP99VonMisesMpa": weighted_percentile(vm[interior], volumes[interior], 0.99),
        "rawMaxElementVonMisesMpa": float(vm.max()), "interiorElementCount": int(interior.sum()),
        "interiorExclusionMm": exclusion, "appliedN": applied.tolist(), "reactionN": support.tolist(),
        "appliedMomentNmm": moment.tolist(), "reactionMomentNmm": reaction_moment.tolist(),
        "bodyForceN": (applied - requested_force).tolist(),
        "forceBalanceRelative": force_balance, "momentBalanceRelative": moment_balance,
        "solveResidualRelative": residual, "solveIterations": iterations,
        "durationSeconds": time.monotonic() - started,
    }
    surface = {
        "positionsMm": points[surface_nodes].reshape(-1).tolist(),
        "triangles": surface_faces.reshape(-1).tolist(),
        "displacementMm": displacement[surface_nodes].reshape(-1).tolist(),
        "vonMisesMpa": display_vm[surface_nodes].tolist(),
        "fixtureNodes": remap[fixed_nodes].tolist(), "loadedNodes": remap[loaded_nodes].tolist(),
    }
    return {"stats": stats, "surface": surface}


def run_analysis(payload, directory):
    started = time.monotonic()
    params = validate_params(payload["params"])
    case = payload["loadCase"]
    force = np.asarray(case["forceN"], dtype=float)
    if force.shape != (3,) or not np.all(np.isfinite(force)) or np.linalg.norm(force) > 100000:
        raise ValueError("The force vector must be finite and at most 100 kN.")
    cad = export_verified(params, directory)
    # Resolve small web/flange dimensions without making the entire domain microscopic.
    size = min(4.0, max(2.0, min(params["webMm"], params["flangeMm"]) * 1.3))
    level = payload.get("refinementLevel", 2 if payload.get("refine") else 1)
    if type(level) is not int or level not in (1, 2, 3):
        raise ValueError("Choose one, two or three refinement levels.")
    sizes = [size * 0.7 ** index for index in range(level)]
    runs = []
    for target in sizes:
        mesh = mesh_step(Path(directory) / "rod.step", target)
        runs.append(solve_rod_mesh(mesh, params, case, target, cad["volumeMm3"]))
    finest = runs[-1]
    def relative(key):
        return abs(runs[-1]["stats"][key] - runs[-2]["stats"][key]) / max(abs(runs[-1]["stats"][key]), 1e-12) if len(runs) > 1 else None
    displacement_change = relative("maxDisplacementMm")
    energy_change = relative("strainEnergyNmm")
    stress_change = relative("interiorP95VonMisesMpa")
    result = {
        "schemaVersion": "rod-solid-fea-v1", "geometryParams": params,
        "loadCase": {**case, "fixture": "fixed-big-bore-distributed-small-bore"},
        "material": {"youngsModulusMpa": YOUNGS_MPA, "poissonRatio": POISSON, "densityKgM3": DENSITY_KG_M3, "provenance": "Assumed representative isotropic steel; not an identified source material"},
        "method": "3D linear isotropic elasticity; conforming four-node tetrahedra; scikit-fem assembly and SciPy sparse solution",
        **finest,
        "convergence": {
            "performed": len(runs) > 1, "meshes": [run["stats"] for run in runs],
            "displacementRelativeChange": displacement_change, "strainEnergyRelativeChange": energy_change,
            "interiorP95RelativeChange": stress_change,
            "withinScreeningTolerance": displacement_change < 0.08 and energy_change < 0.08 if len(runs) > 1 else None,
            "note": "The last two meshes compare displacement and strain energy; 8% is a declared screening tolerance, not proof of asymptotic convergence. Sharp-edge peak stresses are not convergence or strength criteria.",
        },
        "assumptions": [
            "All displacement components are held fixed on the complete big-end bore surface.",
            "The small-end bore carries cosine-weighted distributed resultant traction; this is a prescribed load, not a solved bearing contact pressure.",
            "Rod-local Y runs from big eye to small eye; Z follows the bearing axes. Forces are N, positions/displacements mm, stresses MPa.",
            "Small-strain, linear, homogeneous isotropic elasticity without geometric stiffness.",
            "Element stress percentiles are volume weighted; surface colors recover adjacent-element tensors before computing von Mises.",
            "Interior stress statistics exclude both eye/shoulder zones by the reported axial buffer.",
        ],
        "limitations": [
            "This is the authored sharp-shoulder rod family, without fillets, cap joint, bolts, bushings or manufacturing detail.",
            "Fixture and shoulder singularities make raw peak stresses mesh dependent; percentiles are not certified material allowables.",
            "A fixed bore fixture is not a pin-contact or assembled-engine support model.",
            "No plasticity, fatigue, buckling, thermal stress, contact or transient elastic dynamics are solved.",
            "Beam screening uses different supports and load application; it is not a direct validation target for this fixture solve.",
            "Selected cycle endpoint forces alone are a quasistatic fixture case. Optional rigid-body inertia loads improve force consistency but do not establish real operating stresses.",
        ],
        "runtime": {"solver": f"scikit-fem {skfem.__version__} / SciPy {scipy.__version__}", "mesher": f"Gmsh {gmsh.__version__}", "durationSeconds": time.monotonic() - started},
    }
    (Path(directory) / "analysis.json").write_text(json.dumps(result, separators=(",", ":"), allow_nan=False))
    return result


if __name__ == "__main__":
    try:
        if len(sys.argv) != 2:
            raise ValueError("One output directory is required.")
        raw = sys.stdin.read(8193)
        if len(raw) > 8192:
            raise ValueError("The request is too large.")
        run_analysis(json.loads(raw), Path(sys.argv[1]))
    except (ValueError, TypeError, KeyError, json.JSONDecodeError) as error:
        print(str(error), file=sys.stderr)
        sys.exit(65)
