import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
	createStructuralGeometry,
	probeStructuralGeometry,
	deformStructuralGeometry,
	structuralFieldColor,
	structuralSurfaceLimits,
	validateStructuralSurface,
	STRUCTURAL_COLORS,
	type StructuralSurfaceData
} from './design-structural';

const fixture: StructuralSurfaceData = {
	positionsMm: [0, 0, 0, 20, 0, 0, 20, 40, 0, 0, 40, 0],
	triangles: [0, 1, 2, 0, 2, 3],
	displacementMm: [0, 0, 0, 0.01, 0, 0, 0.01, -0.02, 0.03, 0, -0.02, 0.03],
	vonMisesMpa: [0, 20, 100, 60]
};

describe('native structural surface rendering', () => {
	it('probes the displayed triangle but reports unchanged reference coordinates and recovered fields', () => {
		const geometry = createStructuralGeometry(fixture);
		for (const scale of [0, 1, 200, 4000]) {
			deformStructuralGeometry(geometry, scale);
			const positions = geometry.getAttribute('position');
			const point = new THREE.Vector3();
			const weights = [0.2, 0.3, 0.5];
			weights.forEach((weight, i) =>
				point.addScaledVector(new THREE.Vector3().fromBufferAttribute(positions, i), weight)
			);
			const probe = probeStructuralGeometry(geometry, 0, point, 'exact-solve');
			expect(probe?.analysisHash).toBe('exact-solve');
			expect(probe?.positionMm[0]).toBeCloseTo(16, 8);
			expect(probe?.positionMm[1]).toBeCloseTo(20, 8);
			expect(probe?.stressMpa).toBeCloseTo(56, 8);
			expect(probe?.displacementMagnitudeMm).toBeCloseTo(Math.hypot(0.008, -0.01, 0.015), 8);
			expect(probe?.displayedDisplacementMagnitudeMm).toBeCloseTo(
				0.3 * 0.01 + 0.5 * Math.hypot(0.01, -0.02, 0.03),
				8
			);
			expect(probe?.fieldProvenance).toBe('Recovered nodal surface field');
		}
		geometry.dispose();
	});

	it('does not confuse cancellation of nodal displacement vectors with the displayed magnitude scalar', () => {
		const geometry = createStructuralGeometry({
			...fixture,
			displacementMm: [1, 0, 0, -1, 0, 0, 0, 0, 0, 0, 0, 0]
		});
		const probe = probeStructuralGeometry(
			geometry,
			0,
			new THREE.Vector3(10, 0, 0),
			'opposed-vectors'
		);
		expect(probe?.displacementMagnitudeMm).toBe(0);
		expect(probe?.displayedDisplacementMagnitudeMm).toBe(1);
		for (const index of [-1, 2, 0.5, Infinity])
			expect(probeStructuralGeometry(geometry, index, new THREE.Vector3(), 'invalid')).toBeNull();
		expect(
			probeStructuralGeometry(geometry, 0, new THREE.Vector3(-100, 0, 0), 'outside')
		).toBeNull();
		geometry.dispose();
	});
	it('preserves solver node mapping when crease vertices are duplicated', () => {
		const geometry = createStructuralGeometry(fixture);
		const position = geometry.getAttribute('position');
		const reference = geometry.getAttribute('referencePosition');
		const displacement = geometry.getAttribute('resultDisplacement');
		const stress = geometry.getAttribute('resultStress');
		const magnitude = geometry.getAttribute('resultMagnitude');
		expect(position.count).toBe(fixture.triangles.length);
		for (let i = 0; i < position.count; i++) {
			const source = fixture.triangles[i];
			expect([position.getX(i), position.getY(i), position.getZ(i)]).toEqual(
				fixture.positionsMm.slice(source * 3, source * 3 + 3)
			);
			expect(reference.getY(i)).toBe(position.getY(i));
			expect(displacement.getZ(i)).toBeCloseTo(fixture.displacementMm[source * 3 + 2], 7);
			expect(stress.getX(i)).toBe(fixture.vonMisesMpa[source]);
			expect(magnitude.getX(i)).toBeCloseTo(
				Math.hypot(...fixture.displacementMm.slice(source * 3, source * 3 + 3)),
				7
			);
		}
		geometry.dispose();
	});

	it('applies deformation from the immutable reference without accumulated scaling error', () => {
		const input = structuredClone(fixture);
		const geometry = createStructuralGeometry(input);
		for (const scale of [1, 200, 0, 37, 1]) {
			deformStructuralGeometry(geometry, scale);
			const position = geometry.getAttribute('position');
			for (let i = 0; i < position.count; i++) {
				const source = fixture.triangles[i];
				for (const [axis, getter] of ['getX', 'getY', 'getZ'].entries()) {
					const value = position[getter as 'getX'](i);
					expect(value).toBeCloseTo(
						fixture.positionsMm[source * 3 + axis] +
							fixture.displacementMm[source * 3 + axis] * scale,
						5
					);
				}
			}
			expect(geometry.boundingBox?.isEmpty()).toBe(false);
		}
		expect(input).toEqual(fixture);
		expect(geometry.getAttribute('resultStress').getX(2)).toBe(100);
		geometry.dispose();
	});

	it('uses true supplied maxima and a bounded, continuous scalar colormap', () => {
		const limits = structuralSurfaceLimits(fixture);
		expect(limits.maximumStressMpa).toBe(100);
		expect(limits.maximumDisplacementMm).toBeCloseTo(Math.hypot(0.01, 0.02, 0.03), 12);
		for (const [value, color] of [
			[0, STRUCTURAL_COLORS.cool],
			[50, STRUCTURAL_COLORS.mid],
			[100, STRUCTURAL_COLORS.hot],
			[1000, STRUCTURAL_COLORS.hot]
		] as const) {
			const actual = structuralFieldColor(value, 100),
				expected = new THREE.Color(color);
			expect(actual.r).toBeCloseTo(expected.r, 12);
			expect(actual.g).toBeCloseTo(expected.g, 12);
			expect(actual.b).toBeCloseTo(expected.b, 12);
		}
		expect(structuralFieldColor(0, 0)).toEqual(new THREE.Color(STRUCTURAL_COLORS.cool));
		const left = structuralFieldColor(49.999, 100),
			right = structuralFieldColor(50.001, 100);
		expect(
			Math.abs(left.r - right.r) + Math.abs(left.g - right.g) + Math.abs(left.b - right.b)
		).toBeLessThan(0.0001);
	});

	it('rejects mismatched, corrupt or nonfinite solver fields before creating GPU buffers', () => {
		for (const surface of [
			{ ...fixture, triangles: [0, 1, 90] },
			{ ...fixture, displacementMm: [1, 2, 3] },
			{ ...fixture, vonMisesMpa: [0, 0, -1, 0] },
			{ ...fixture, positionsMm: fixture.positionsMm.map((value, i) => (i ? value : NaN)) }
		])
			expect(() => validateStructuralSurface(surface)).toThrow();
		const geometry = createStructuralGeometry(fixture);
		for (const scale of [-1, Infinity, 100_001])
			expect(() => deformStructuralGeometry(geometry, scale)).toThrow();
		geometry.dispose();
	});

	it('keeps the same engineering value the same color under a fixed comparison range', () => {
		const alternative = { ...fixture, vonMisesMpa: [0, 20, 1200, 60] };
		expect(structuralSurfaceLimits(alternative).maximumStressMpa).toBe(1200);
		expect(structuralSurfaceLimits(fixture).maximumStressMpa).toBe(100);
		const referenceColor = structuralFieldColor(fixture.vonMisesMpa[3], 250);
		expect(structuralFieldColor(alternative.vonMisesMpa[3], 250)).toEqual(referenceColor);
		const limitedColor = structuralFieldColor(250, 250),
			overRange = structuralFieldColor(1200, 250);
		expect(overRange).toEqual(limitedColor);
	});
});
