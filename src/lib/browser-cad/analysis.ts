import type {
	StructuralInertia,
	StructuralMeshStats,
	StructuralRequest,
	StructuralResult,
	Vector3Tuple
} from '../design/structural';
import {
	analyticVolume,
	hashValue,
	parameterHash,
	validateGeometry,
	type RodCadParams
} from './contracts';
import {
	boundaryFaces,
	cross,
	solveElasticity,
	STEEL_DENSITY,
	STEEL_E,
	STEEL_NU,
	stressForTet,
	tetGeometry,
	vonMises,
	type TetMesh
} from './elasticity';
import { buildRod, meshCurrentSolid, type CadKernel } from './kernel';

type LoadCase = { forceN: Vector3Tuple; label: string; inertia?: StructuralInertia };
const magnitude = (v: ArrayLike<number>) => Math.hypot(v[0], v[1], v[2]);
const sum3 = (values: Float64Array): Vector3Tuple => {
	const result: Vector3Tuple = [0, 0, 0];
	for (let i = 0; i < values.length; i++) result[i % 3] += values[i];
	return result;
};
function validateVector(v: unknown, max: number, label: string): Vector3Tuple {
	if (
		!Array.isArray(v) ||
		v.length !== 3 ||
		v.some((n) => typeof n !== 'number' || !Number.isFinite(n)) ||
		Math.hypot(...v) > max
	)
		throw new Error(`Invalid ${label}.`);
	return [...v] as Vector3Tuple;
}
function loadCase(request: StructuralRequest): LoadCase {
	const force = request.loadCase?.forceN ?? [
		0,
		-request.params.loadKn * 1000,
		request.params.lateralLoadN
	];
	const result: LoadCase = {
		forceN: validateVector(force, 100000, 'bearing force'),
		label:
			request.loadCase?.label?.slice(0, 160) ||
			'Fixed big-bore fixture with distributed small-bore load'
	};
	if (request.loadCase?.inertia) {
		const i = request.loadCase.inertia;
		result.inertia = {
			originAccelerationMps2: validateVector(i.originAccelerationMps2, 1e6, 'origin acceleration'),
			angularVelocityRadS: validateVector(i.angularVelocityRadS, 1e4, 'angular velocity'),
			angularAccelerationRadS2: validateVector(
				i.angularAccelerationRadS2,
				1e7,
				'angular acceleration'
			)
		};
	}
	return result;
}

function percentile(values: number[], weights: number[], fraction: number): number {
	if (!values.length) throw new Error('No interior elements remain for stress statistics.');
	const sorted = values.map((v, i) => ({ v, w: weights[i] })).sort((a, b) => a.v - b.v),
		total = weights.reduce((a, b) => a + b, 0);
	let cumulative = 0;
	for (const item of sorted) {
		cumulative += item.w;
		if (cumulative >= fraction * total) return item.v;
	}
	return sorted[sorted.length - 1].v;
}

export function solveRodMesh(
	mesh: TetMesh,
	p: RodCadParams,
	load: LoadCase,
	size: number,
	exactVolume: number
) {
	const started = performance.now(),
		faces = boundaryFaces(mesh),
		force = new Float64Array(mesh.points.length),
		fixed = new Set<number>(),
		loaded = new Set<number>();
	const loadFaces: { nodes: number[]; weight: number }[] = [];
	const directionMagnitude = Math.hypot(load.forceN[0], load.forceN[1]);
	const direction =
		directionMagnitude > 1e-12
			? [load.forceN[0] / directionMagnitude, load.forceN[1] / directionMagnitude]
			: [0, -1];
	let weightSum = 0;
	for (let f = 0; f < faces.length; f += 3) {
		const nodes = Array.from(faces.subarray(f, f + 3)),
			points = nodes.map((n) => mesh.points.subarray(n * 3, n * 3 + 3));
		if (points.every((v) => Math.abs(Math.hypot(v[0], v[1]) - 25) < 1e-5))
			nodes.forEach((n) => fixed.add(n));
		if (!points.every((v) => Math.abs(Math.hypot(v[0], v[1] - p.rodLengthMm) - 9) < 1e-5)) continue;
		const [a, b, c] = points,
			area =
				magnitude(
					cross([b[0] - a[0], b[1] - a[1], b[2] - a[2]], [c[0] - a[0], c[1] - a[1], c[2] - a[2]])
				) / 2;
		const x = (a[0] + b[0] + c[0]) / 3,
			y = (a[1] + b[1] + c[1]) / 3 - p.rodLengthMm,
			r = Math.hypot(x, y);
		const weight = Math.max((x * direction[0] + y * direction[1]) / r, 0) * area;
		loadFaces.push({ nodes, weight });
		weightSum += weight;
	}
	if (fixed.size < 12 || loadFaces.length < 12 || weightSum <= 0)
		throw new Error('Bearing surface classification failed.');
	for (const face of loadFaces)
		for (const node of face.nodes) {
			for (let j = 0; j < 3; j++)
				force[node * 3 + j] += ((face.weight / weightSum) * load.forceN[j]) / 3;
			if (face.weight > 0) loaded.add(node);
		}
	const geometry = tetGeometry(mesh),
		volume = geometry.volumes.reduce((a, b) => a + b, 0),
		volumeError = Math.abs(volume - exactVolume) / exactVolume;
	if (volumeError > 0.015)
		throw new Error('The tetrahedral mesh differs too much from the exact solid volume.');
	if (load.inertia) {
		const {
			originAccelerationMps2: origin,
			angularVelocityRadS: omega,
			angularAccelerationRadS2: alpha
		} = load.inertia;
		for (let e = 0; e < geometry.volumes.length; e++) {
			const density: number[][] = [];
			for (let a = 0; a < 4; a++) {
				const node = mesh.tets[e * 4 + a],
					point = [
						mesh.points[node * 3] / 1000,
						mesh.points[node * 3 + 1] / 1000,
						mesh.points[node * 3 + 2] / 1000
					],
					rot = cross(alpha, point),
					centripetal = cross(omega, cross(omega, point));
				density.push(origin.map((v, i) => -STEEL_DENSITY * 1e-9 * (v + rot[i] + centripetal[i])));
			}
			for (let a = 0; a < 4; a++)
				for (let j = 0; j < 3; j++)
					force[mesh.tets[e * 4 + a] * 3 + j] +=
						(geometry.volumes[e] / 20) *
						(density[0][j] + density[1][j] + density[2][j] + density[3][j] + density[a][j]);
		}
	}
	const solved = solveElasticity(mesh, force, Array.from(fixed));
	const recovered = new Float64Array((mesh.points.length / 3) * 6),
		vertexVolume = new Float64Array(mesh.points.length / 3);
	const vm: number[] = [],
		weights: number[] = [],
		interiorVm: number[] = [],
		interiorWeights: number[] = [],
		exclusion = Math.max(p.rodDepthMm / 2, 6);
	for (let e = 0; e < geometry.volumes.length; e++) {
		const nodes = mesh.tets.subarray(e * 4, e * 4 + 4),
			stress = stressForTet(
				solved.displacement,
				nodes,
				geometry.gradients.subarray(e * 12, e * 12 + 12)
			),
			v = geometry.volumes[e],
			value = vonMises(stress);
		vm.push(value);
		weights.push(v);
		let centreY = 0;
		for (const node of nodes) {
			centreY += mesh.points[node * 3 + 1] / 4;
			vertexVolume[node] += v;
			for (let j = 0; j < 6; j++) recovered[node * 6 + j] += stress[j] * v;
		}
		if (centreY > 32 + exclusion && centreY < p.rodLengthMm - 15 - exclusion) {
			interiorVm.push(value);
			interiorWeights.push(v);
		}
	}
	for (let n = 0; n < vertexVolume.length; n++)
		for (let j = 0; j < 6; j++) recovered[n * 6 + j] /= vertexVolume[n];
	const applied = sum3(force),
		reaction = sum3(solved.reaction),
		moment: Vector3Tuple = [0, 0, 0],
		reactionMoment: Vector3Tuple = [0, 0, 0];
	let maxDisplacement = 0;
	for (let i = 0; i < mesh.points.length; i += 3) {
		const a = cross(mesh.points.subarray(i, i + 3), force.subarray(i, i + 3)),
			r = cross(mesh.points.subarray(i, i + 3), solved.reaction.subarray(i, i + 3));
		for (let j = 0; j < 3; j++) {
			moment[j] += a[j];
			reactionMoment[j] += r[j];
		}
		maxDisplacement = Math.max(maxDisplacement, magnitude(solved.displacement.subarray(i, i + 3)));
	}
	const forceScale = Math.max(magnitude(applied), magnitude(load.forceN), 1),
		momentScale = Math.max(magnitude(moment), forceScale * p.rodLengthMm, 1);
	const forceBalance = magnitude(applied.map((v, i) => v + reaction[i])) / forceScale,
		momentBalance = magnitude(moment.map((v, i) => v + reactionMoment[i])) / momentScale;
	if (forceBalance > 1e-5 || momentBalance > 1e-5)
		throw new Error('The solid result failed reaction equilibrium checks.');
	const surfaceNodes = Array.from(new Set(faces)).sort((a, b) => a - b),
		remap = new Map(surfaceNodes.map((n, i) => [n, i])),
		loadedDisplacement: Vector3Tuple = [0, 0, 0];
	for (const face of loadFaces)
		for (const node of face.nodes)
			for (let j = 0; j < 3; j++)
				loadedDisplacement[j] += (solved.displacement[node * 3 + j] * face.weight) / weightSum / 3;
	const stats: StructuralMeshStats = {
		meshSizeMm: size,
		nodes: mesh.points.length / 3,
		elements: mesh.tets.length / 4,
		dofs: mesh.points.length,
		volumeMm3: volume,
		volumeRelativeError: volumeError,
		maxDisplacementMm: maxDisplacement,
		loadedMeanDisplacementMm: loadedDisplacement,
		strainEnergyNmm: solved.energy,
		p95VonMisesMpa: percentile(vm, weights, 0.95),
		p99VonMisesMpa: percentile(vm, weights, 0.99),
		interiorP95VonMisesMpa: percentile(interiorVm, interiorWeights, 0.95),
		interiorP99VonMisesMpa: percentile(interiorVm, interiorWeights, 0.99),
		rawMaxElementVonMisesMpa: vm.reduce((a, b) => Math.max(a, b), 0),
		interiorElementCount: interiorVm.length,
		interiorExclusionMm: exclusion,
		appliedN: applied,
		reactionN: reaction,
		appliedMomentNmm: moment,
		reactionMomentNmm: reactionMoment,
		bodyForceN: applied.map((v, i) => v - load.forceN[i]) as Vector3Tuple,
		forceBalanceRelative: forceBalance,
		momentBalanceRelative: momentBalance,
		solveResidualRelative: solved.residual,
		solveIterations: solved.iterations,
		durationSeconds: (performance.now() - started) / 1000
	};
	const surface: StructuralResult['surface'] = {
		positionsMm: surfaceNodes.flatMap((n) => Array.from(mesh.points.subarray(n * 3, n * 3 + 3))),
		triangles: Array.from(faces, (n) => remap.get(n)!),
		displacementMm: surfaceNodes.flatMap((n) =>
			Array.from(solved.displacement.subarray(n * 3, n * 3 + 3))
		),
		vonMisesMpa: surfaceNodes.map((n) => vonMises(recovered.subarray(n * 6, n * 6 + 6))),
		fixtureNodes: Array.from(fixed, (n) => remap.get(n)!),
		loadedNodes: Array.from(loaded, (n) => remap.get(n)!)
	};
	return { stats, surface };
}

export async function runBrowserAnalysis(
	kernel: CadKernel,
	request: StructuralRequest,
	progress: (message: string) => void = () => {}
): Promise<StructuralResult> {
	const started = performance.now(),
		params = validateGeometry(request.params),
		load = loadCase(request),
		level = request.refinementLevel ?? (request.refine ? 2 : 1);
	if (![1, 2, 3].includes(level)) throw new Error('Choose one, two or three mesh levels.');
	progress('Building the exact rod solid in WebAssembly…');
	const tag = buildRod(kernel, params),
		exact = kernel.model.occ.getMass(3, tag).mass;
	if (Math.abs(exact - analyticVolume(params)) / exact > 1e-8)
		throw new Error('CAD/analytic volume mismatch.');
	const size = Math.min(4, Math.max(2, Math.min(params.webMm, params.flangeMm) * 1.3)),
		runs: ReturnType<typeof solveRodMesh>[] = [];
	for (let i = 0; i < level; i++) {
		const h = size * 0.7 ** i;
		progress(`Meshing solid ${i + 1}/${level} in WebAssembly…`);
		const mesh = meshCurrentSolid(kernel, h);
		progress(`Solving ${mesh.tets.length / 4} solid elements in a browser worker…`);
		runs.push(solveRodMesh(mesh, params, load, h, exact));
	}
	const finest = runs[runs.length - 1],
		relative = (key: 'maxDisplacementMm' | 'strainEnergyNmm' | 'interiorP95VonMisesMpa') =>
			runs.length > 1
				? Math.abs(finest.stats[key] - runs[runs.length - 2].stats[key]) /
					Math.max(Math.abs(finest.stats[key]), 1e-12)
				: null;
	const displacement = relative('maxDisplacementMm'),
		energy = relative('strainEnergyNmm'),
		hash = await parameterHash(params);
	return {
		schemaVersion: 'rod-solid-fea-v1',
		parameterHash: hash,
		analysisHash: await hashValue({
			schema: 'rod-solid-fea-v1',
			geometry: hash,
			forceN: load.forceN,
			inertia: load.inertia ?? null,
			refinementLevel: level
		}),
		geometryParams: params,
		loadCase: { ...load, fixture: 'fixed-big-bore-distributed-small-bore' },
		material: {
			youngsModulusMpa: STEEL_E,
			poissonRatio: STEEL_NU,
			densityKgM3: STEEL_DENSITY,
			provenance: 'Assumed representative isotropic steel; not an identified source material'
		},
		method:
			'3D linear isotropic elasticity; conforming four-node tetrahedra; Float64 sparse assembly and IC(0)-preconditioned conjugate gradients in a browser worker',
		...finest,
		convergence: {
			performed: runs.length > 1,
			meshes: runs.map((r) => r.stats),
			displacementRelativeChange: displacement,
			strainEnergyRelativeChange: energy,
			interiorP95RelativeChange: relative('interiorP95VonMisesMpa'),
			withinScreeningTolerance:
				displacement !== null && energy !== null ? displacement < 0.08 && energy < 0.08 : null,
			note: 'Successive independently remeshed domains compare displacement and strain energy. The 8% criterion is a screening tolerance, not proof of asymptotic stress convergence.'
		},
		assumptions: [
			'All displacement components fixed on the complete big-end bore.',
			'Cosine-weighted distributed small-end bore resultant; prescribed traction, not solved pin contact.',
			'Rod-local Y points from big eye to small eye; Z is the bearing axis. N, mm and MPa units.',
			'Small-strain homogeneous isotropic linear elasticity, without geometric stiffness.',
			'Volume-weighted element stress percentiles; display fields recover adjacent-element stress tensors.',
			'Interior stress excludes fixture/load and eye/shoulder regions by the declared axial buffer.'
		],
		limitations: [
			'Authored sharp-shoulder rod family without fillets, cap joint, bolts, bushings or manufacturing detail.',
			'Sharp fixture/shoulder stress peaks are mesh dependent and are not strength criteria.',
			'No contact, plasticity, fatigue, buckling, thermal stress or transient elastic dynamics.',
			'Prescribed cycle endpoint forces and optional rigid-body inertia do not establish real engine operating stresses.',
			'Gmsh WebAssembly and native Gmsh versions may produce different meshes; compare integral responses and refinement, not nodal identity.'
		],
		runtime: {
			solver: 'Browser Float64 sparse PCG / IC(0)',
			mesher: 'Gmsh 5.0.0 / WebAssembly (gmsh-wasm 0.3.0)',
			durationSeconds: (performance.now() - started) / 1000
		}
	};
}
