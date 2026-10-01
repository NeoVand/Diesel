/** Float64, small-strain, isotropic P1 tetrahedral elasticity. No server or graphics math. */
export interface TetMesh {
	points: Float64Array;
	tets: Uint32Array;
}
export const STEEL_E = 210000;
export const STEEL_NU = 0.3;
export const STEEL_DENSITY = 7850;
const mu = STEEL_E / (2 * (1 + STEEL_NU));
const lambda = (STEEL_E * STEEL_NU) / ((1 + STEEL_NU) * (1 - 2 * STEEL_NU));

export function cross(a: ArrayLike<number>, b: ArrayLike<number>): [number, number, number] {
	return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
const dot = (a: ArrayLike<number>, b: ArrayLike<number>) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export function tetGeometry(mesh: TetMesh) {
	const count = mesh.tets.length / 4;
	const gradients = new Float64Array(count * 12),
		volumes = new Float64Array(count);
	for (let e = 0; e < count; e++) {
		const o = mesh.tets[e * 4] * 3;
		const sides = [1, 2, 3].map((i) => {
			const k = mesh.tets[e * 4 + i] * 3;
			return [
				mesh.points[k] - mesh.points[o],
				mesh.points[k + 1] - mesh.points[o + 1],
				mesh.points[k + 2] - mesh.points[o + 2]
			];
		});
		const c = [cross(sides[1], sides[2]), cross(sides[2], sides[0]), cross(sides[0], sides[1])];
		const determinant = dot(sides[0], c[0]);
		if (!Number.isFinite(determinant) || Math.abs(determinant) < 6e-10)
			throw new Error('Degenerate tetrahedron in the volume mesh.');
		volumes[e] = Math.abs(determinant) / 6;
		for (let j = 0; j < 3; j++) {
			for (let a = 0; a < 3; a++) gradients[e * 12 + (a + 1) * 3 + j] = c[a][j] / determinant;
			gradients[e * 12 + j] = -(c[0][j] + c[1][j] + c[2][j]) / determinant;
		}
	}
	return { gradients, volumes };
}

/** Unique outward boundary faces. Nonmanifold domains fail before load application. */
export function boundaryFaces(mesh: TetMesh): Uint32Array {
	const faces = new Map<string, { nodes: number[]; count: number }>();
	const local = [
		[1, 2, 3, 0],
		[0, 3, 2, 1],
		[0, 1, 3, 2],
		[0, 2, 1, 3]
	];
	for (let e = 0; e < mesh.tets.length; e += 4) {
		for (const indices of local) {
			const nodes = indices.slice(0, 3).map((i) => mesh.tets[e + i]);
			const key = [...nodes].sort((a, b) => a - b).join(',');
			const existing = faces.get(key);
			if (existing) {
				existing.count++;
				if (existing.count > 2) throw new Error('Nonmanifold volume mesh.');
				continue;
			}
			const [a, b, c] = nodes.map((n) => mesh.points.subarray(n * 3, n * 3 + 3));
			const opposite = mesh.tets[e + indices[3]] * 3;
			const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]],
				ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
			if (
				dot(cross(ab, ac), [
					mesh.points[opposite] - a[0],
					mesh.points[opposite + 1] - a[1],
					mesh.points[opposite + 2] - a[2]
				]) > 0
			)
				[nodes[1], nodes[2]] = [nodes[2], nodes[1]];
			faces.set(key, { nodes, count: 1 });
		}
	}
	return Uint32Array.from([...faces.values()].filter((f) => f.count === 1).flatMap((f) => f.nodes));
}

interface SparseMatrix {
	row: Uint32Array;
	col: Uint32Array;
	values: Float64Array;
	diag: Uint32Array;
}
function find(columns: Uint32Array, from: number, end: number, target: number): number {
	while (from < end) {
		const mid = (from + end) >>> 1;
		if (columns[mid] < target) from = mid + 1;
		else end = mid;
	}
	return from;
}

function assemble(mesh: TetMesh, fixed: Set<number>, geometry: ReturnType<typeof tetGeometry>) {
	const n = mesh.points.length / 3,
		nodeIndex = new Int32Array(n).fill(-1),
		nodes: number[] = [];
	for (let i = 0; i < n; i++)
		if (!fixed.has(i)) {
			nodeIndex[i] = nodes.length;
			nodes.push(i);
		}
	const adjacent = nodes.map((_, i) => new Set<number>([i]));
	for (let e = 0; e < mesh.tets.length; e += 4)
		for (let a = 0; a < 4; a++) {
			const i = nodeIndex[mesh.tets[e + a]];
			if (i < 0) continue;
			for (let b = 0; b < 4; b++) {
				const j = nodeIndex[mesh.tets[e + b]];
				if (j >= 0) adjacent[i].add(j);
			}
		}
	const row = new Uint32Array(nodes.length * 3 + 1),
		cols: number[] = [];
	for (let i = 0; i < nodes.length; i++) {
		const list = Array.from(adjacent[i]).sort((a, b) => a - b);
		for (let a = 0; a < 3; a++) {
			row[i * 3 + a] = cols.length;
			for (const j of list) cols.push(j * 3, j * 3 + 1, j * 3 + 2);
		}
	}
	row[row.length - 1] = cols.length;
	const col = Uint32Array.from(cols),
		values = new Float64Array(col.length),
		diag = new Uint32Array(nodes.length * 3);
	for (let i = 0; i < diag.length; i++) diag[i] = find(col, row[i], row[i + 1], i);
	for (let e = 0; e < mesh.tets.length / 4; e++) {
		const g = geometry.gradients.subarray(e * 12, e * 12 + 12),
			volume = geometry.volumes[e];
		for (let a = 0; a < 4; a++) {
			const ia = nodeIndex[mesh.tets[e * 4 + a]];
			if (ia < 0) continue;
			for (let b = 0; b < 4; b++) {
				const ib = nodeIndex[mesh.tets[e * 4 + b]];
				if (ib < 0) continue;
				const gg = g[a * 3] * g[b * 3] + g[a * 3 + 1] * g[b * 3 + 1] + g[a * 3 + 2] * g[b * 3 + 2];
				for (let i = 0; i < 3; i++) {
					const start = find(col, row[ia * 3 + i], row[ia * 3 + i + 1], ib * 3);
					for (let j = 0; j < 3; j++)
						values[start + j] +=
							volume *
							(lambda * g[a * 3 + i] * g[b * 3 + j] +
								mu * g[a * 3 + j] * g[b * 3 + i] +
								(i === j ? mu * gg : 0));
				}
			}
		}
	}
	return { matrix: { row, col, values, diag }, nodes, nodeIndex };
}

function multiply(a: SparseMatrix, x: Float64Array, result: Float64Array) {
	for (let i = 0; i < x.length; i++) {
		let sum = 0;
		for (let k = a.row[i]; k < a.row[i + 1]; k++) sum += a.values[k] * x[a.col[k]];
		result[i] = sum;
	}
}

/** IC(0) is formed on the diagonally scaled operator; a shifted factor is a preconditioner only. */
function incompleteCholesky(a: SparseMatrix): Float64Array {
	for (const shift of [0, 0.001, 0.01, 0.1, 1, 10]) {
		const factor = new Float64Array(a.values.length);
		let failed = false;
		for (let i = 0; i < a.diag.length; i++) {
			let squares = 0;
			for (let p = a.row[i]; p < a.diag[i]; p++) {
				const j = a.col[p];
				let sum = 0,
					ki = a.row[i],
					kj = a.row[j];
				while (ki < p && kj < a.diag[j]) {
					if (a.col[ki] === a.col[kj]) {
						sum += factor[ki] * factor[kj];
						ki++;
						kj++;
					} else if (a.col[ki] < a.col[kj]) ki++;
					else kj++;
				}
				factor[p] = (a.values[p] - sum) / factor[a.diag[j]];
				squares += factor[p] * factor[p];
			}
			const pivot = a.values[a.diag[i]] + shift - squares;
			if (!Number.isFinite(pivot) || pivot < 1e-12) {
				failed = true;
				break;
			}
			factor[a.diag[i]] = Math.sqrt(pivot);
		}
		if (!failed) return factor;
	}
	throw new Error(
		'The elasticity preconditioner failed: inspect mesh quality and fixture support.'
	);
}

function applyFactor(a: SparseMatrix, factor: Float64Array, r: Float64Array, z: Float64Array) {
	for (let i = 0; i < r.length; i++) {
		let sum = r[i];
		for (let k = a.row[i]; k < a.diag[i]; k++) sum -= factor[k] * z[a.col[k]];
		z[i] = sum / factor[a.diag[i]];
	}
	for (let i = r.length - 1; i >= 0; i--) {
		z[i] /= factor[a.diag[i]];
		for (let k = a.row[i]; k < a.diag[i]; k++) z[a.col[k]] -= factor[k] * z[i];
	}
}
function norm(v: Float64Array): number {
	let sum = 0;
	for (let i = 0; i < v.length; i++) sum += v[i] * v[i];
	return Math.sqrt(sum);
}
function inner(a: Float64Array, b: Float64Array): number {
	let sum = 0;
	for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
	return sum;
}

function solvePcg(matrix: SparseMatrix, rhs: Float64Array) {
	const n = rhs.length,
		scales = new Float64Array(n);
	for (let i = 0; i < n; i++) {
		scales[i] = Math.sqrt(matrix.values[matrix.diag[i]]);
		if (!(scales[i] > 0)) throw new Error('Unconstrained degree of freedom.');
	}
	const scaledValues = Float64Array.from(matrix.values);
	for (let i = 0; i < n; i++)
		for (let k = matrix.row[i]; k < matrix.row[i + 1]; k++)
			scaledValues[k] /= scales[i] * scales[matrix.col[k]];
	const a = { ...matrix, values: scaledValues },
		b = Float64Array.from(rhs, (v, i) => v / scales[i]);
	const x = new Float64Array(n),
		r = Float64Array.from(b),
		z = new Float64Array(n),
		p = new Float64Array(n),
		ap = new Float64Array(n);
	if (norm(rhs) < 1e-20) return { x, iterations: 0, residual: 0 };
	const factor = incompleteCholesky(a),
		tolerance = 1e-10 * Math.max(norm(b), 1e-8);
	applyFactor(a, factor, r, z);
	p.set(z);
	let rz = inner(r, z),
		iterations = 0;
	for (; iterations < 5000; iterations++) {
		multiply(a, p, ap);
		const denominator = inner(p, ap);
		if (!(denominator > 0)) throw new Error('The elasticity operator is not positive definite.');
		const alpha = rz / denominator;
		for (let i = 0; i < n; i++) {
			x[i] += alpha * p[i];
			r[i] -= alpha * ap[i];
		}
		if (norm(r) <= tolerance) {
			iterations++;
			break;
		}
		applyFactor(a, factor, r, z);
		const next = inner(r, z),
			beta = next / rz;
		rz = next;
		for (let i = 0; i < n; i++) p[i] = z[i] + beta * p[i];
	}
	for (let i = 0; i < n; i++) x[i] /= scales[i];
	multiply(matrix, x, ap);
	for (let i = 0; i < n; i++) ap[i] -= rhs[i];
	const residual = norm(ap) / Math.max(norm(rhs), 1);
	if (!Number.isFinite(residual) || residual > 1e-7)
		throw new Error(
			`Solid solve did not converge (${iterations} iterations, relative residual ${residual.toExponential(2)}).`
		);
	return { x, iterations, residual };
}

/** Stress vector order: xx, yy, zz, xy, yz, xz (tensor shear, not engineering shear). */
export function stressForTet(
	displacement: Float64Array,
	nodes: ArrayLike<number>,
	gradients: ArrayLike<number>
): Float64Array {
	const du = new Float64Array(9);
	for (let a = 0; a < 4; a++)
		for (let i = 0; i < 3; i++)
			for (let j = 0; j < 3; j++)
				du[i * 3 + j] += displacement[nodes[a] * 3 + i] * gradients[a * 3 + j];
	const trace = du[0] + du[4] + du[8];
	return Float64Array.of(
		lambda * trace + 2 * mu * du[0],
		lambda * trace + 2 * mu * du[4],
		lambda * trace + 2 * mu * du[8],
		mu * (du[1] + du[3]),
		mu * (du[5] + du[7]),
		mu * (du[2] + du[6])
	);
}
export function vonMises(s: ArrayLike<number>): number {
	return Math.sqrt(
		((s[0] - s[1]) ** 2 + (s[1] - s[2]) ** 2 + (s[2] - s[0]) ** 2) / 2 +
			3 * (s[3] ** 2 + s[4] ** 2 + s[5] ** 2)
	);
}

export function solveElasticity(
	mesh: TetMesh,
	force: Float64Array,
	fixedNodes: number[],
	prescribed?: Float64Array
) {
	const geometry = tetGeometry(mesh),
		fixed = new Set(fixedNodes),
		displacement = new Float64Array(mesh.points.length);
	if (prescribed)
		for (let n = 0; n < fixedNodes.length; n++)
			for (let i = 0; i < 3; i++) displacement[fixedNodes[n] * 3 + i] = prescribed[n * 3 + i];
	const assembled = assemble(mesh, fixed, geometry),
		rhs = Float64Array.from(
			assembled.nodes.flatMap((node) => Array.from(force.subarray(node * 3, node * 3 + 3)))
		);
	// Eliminate nonzero prescribed displacement using element internal forces, without altering K.
	if (prescribed) {
		const initial = internalForces(mesh, displacement, geometry);
		for (let i = 0; i < assembled.nodes.length; i++)
			for (let j = 0; j < 3; j++) rhs[i * 3 + j] -= initial[assembled.nodes[i] * 3 + j];
	}
	const solution = solvePcg(assembled.matrix, rhs);
	for (let i = 0; i < assembled.nodes.length; i++)
		for (let j = 0; j < 3; j++) displacement[assembled.nodes[i] * 3 + j] = solution.x[i * 3 + j];
	const internal = internalForces(mesh, displacement, geometry),
		reaction = new Float64Array(force.length);
	for (const n of fixed)
		for (let j = 0; j < 3; j++) reaction[n * 3 + j] = internal[n * 3 + j] - force[n * 3 + j];
	let energy = 0;
	for (let i = 0; i < displacement.length; i++) energy += (displacement[i] * internal[i]) / 2;
	return {
		displacement,
		reaction,
		energy,
		residual: solution.residual,
		iterations: solution.iterations,
		...geometry
	};
}

function internalForces(
	mesh: TetMesh,
	u: Float64Array,
	geometry: ReturnType<typeof tetGeometry>
): Float64Array {
	const result = new Float64Array(mesh.points.length);
	for (let e = 0; e < geometry.volumes.length; e++) {
		const nodes = mesh.tets.subarray(e * 4, e * 4 + 4),
			g = geometry.gradients.subarray(e * 12, e * 12 + 12),
			s = stressForTet(u, nodes, g),
			v = geometry.volumes[e];
		for (let a = 0; a < 4; a++) {
			const i = nodes[a] * 3,
				x = g[a * 3],
				y = g[a * 3 + 1],
				z = g[a * 3 + 2];
			result[i] += v * (s[0] * x + s[3] * y + s[5] * z);
			result[i + 1] += v * (s[3] * x + s[1] * y + s[4] * z);
			result[i + 2] += v * (s[5] * x + s[4] * y + s[2] * z);
		}
	}
	return result;
}
