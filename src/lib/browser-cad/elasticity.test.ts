import { describe, it, expect } from 'vitest';
import {
	boundaryFaces,
	solveElasticity,
	stressForTet,
	tetGeometry,
	vonMises,
	type TetMesh
} from './elasticity';

/** Tetrahedral cube with a central node: the affine patch must also be recovered at a free node. */
function cube(): TetMesh {
	const points = Float64Array.from([
		0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 0, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1, 0.5, 0.5, 0.5
	]);
	const faces = [
		[0, 2, 1],
		[0, 3, 2],
		[4, 5, 6],
		[4, 6, 7],
		[0, 1, 5],
		[0, 5, 4],
		[1, 2, 6],
		[1, 6, 5],
		[2, 3, 7],
		[2, 7, 6],
		[3, 0, 4],
		[3, 4, 7]
	];
	return { points, tets: Uint32Array.from(faces.flatMap((f) => [...f, 8])) };
}
describe('browser tetrahedral elasticity', () => {
	it('recovers a nontrivial affine displacement and uniform stress patch', () => {
		const mesh = cube(),
			fixed = [0, 1, 2, 3, 4, 5, 6, 7];
		const field = (x: number, y: number, z: number) => [
			0.002 * x + 0.001 * y,
			-0.0006 * y + 0.0002 * z,
			0.0004 * x - 0.0006 * z
		];
		const prescribed = Float64Array.from(
			fixed.flatMap((n) =>
				field(...(Array.from(mesh.points.subarray(n * 3, n * 3 + 3)) as [number, number, number]))
			)
		);
		const result = solveElasticity(mesh, new Float64Array(mesh.points.length), fixed, prescribed),
			expected = field(0.5, 0.5, 0.5);
		for (let j = 0; j < 3; j++) expect(result.displacement[24 + j]).toBeCloseTo(expected[j], 12);
		const geometry = tetGeometry(mesh),
			first = stressForTet(
				result.displacement,
				mesh.tets.subarray(0, 4),
				geometry.gradients.subarray(0, 12)
			);
		for (let e = 1; e < 12; e++) {
			const stress = stressForTet(
				result.displacement,
				mesh.tets.subarray(e * 4, e * 4 + 4),
				geometry.gradients.subarray(e * 12, e * 12 + 12)
			);
			for (let j = 0; j < 6; j++) expect(stress[j]).toBeCloseTo(first[j], 8);
		}
		expect(result.residual).toBeLessThan(1e-10);
		expect(geometry.volumes.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
		expect(boundaryFaces(mesh).length / 3).toBe(12);
	});
	it('preserves rigid translations and rotations without strain energy', () => {
		const mesh = cube(),
			geometry = tetGeometry(mesh),
			u = Float64Array.from(mesh.points, (v, i) =>
				i % 3 === 0
					? 2 - mesh.points[i + 1] * 0.01
					: i % 3 === 1
						? -0.4 + mesh.points[i - 1] * 0.01
						: 3
			);
		for (let e = 0; e < 12; e++)
			expect(
				vonMises(
					stressForTet(
						u,
						mesh.tets.subarray(e * 4, e * 4 + 4),
						geometry.gradients.subarray(e * 12, e * 12 + 12)
					)
				)
			).toBeLessThan(1e-8);
	});
	it('rejects a collapsed tetrahedron', () => {
		expect(() =>
			tetGeometry({
				points: Float64Array.of(0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0),
				tets: Uint32Array.of(0, 1, 2, 3)
			})
		).toThrow('Degenerate');
	});
});
