import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { initialLabState } from '$lib/engine/lab-state';
import { V12_MOTION_DATUMS } from '$lib/engine/v12-kinematics';
import {
	sectionCoordinates,
	sectionOffsetFromMm,
	sectionProjection
} from './v12-section-coordinates';

describe('physical section coordinates', () => {
	const scale = V12_MOTION_DATUMS.displayScale / 1000;
	const bounds = new THREE.Box3(
		new THREE.Vector3(-100, -200, -300).multiplyScalar(scale),
		new THREE.Vector3(500, 600, 700).multiplyScalar(scale)
	);
	it('uses the measured display scale and a stable bounds-centre datum', () => {
		for (const [axis, halfSpan] of [
			['x', 300],
			['y', 400],
			['z', 500]
		] as const) {
			const section = { ...initialLabState.section, axis, offset: 0.75 };
			const coordinates = sectionCoordinates(bounds, section);
			expect(coordinates.offsetMm).toBeCloseTo(halfSpan / 2, 10);
			expect(coordinates.minMm).toBeCloseTo(-halfSpan, 10);
			expect(coordinates.maxMm).toBeCloseTo(halfSpan, 10);
			expect(sectionOffsetFromMm(coordinates, coordinates.offsetMm)).toBeCloseTo(0.75, 12);
			expect(sectionCoordinates(bounds, { ...section, flipped: true })).toEqual(coordinates);
		}
	});
	it('matches all eight projected corners for an oblique plane', () => {
		const section = {
			...initialLabState.section,
			offset: 0.37,
			rotation: [23, -41] as [number, number]
		};
		const projection = sectionProjection(bounds, section);
		const corners = [-100, 500].flatMap((x) =>
			[-200, 600].flatMap((y) =>
				[-300, 700].map((z) =>
					new THREE.Vector3(x, y, z).multiplyScalar(scale).dot(projection.normal)
				)
			)
		);
		expect(projection.min).toBeCloseTo(Math.min(...corners), 12);
		expect(projection.max).toBeCloseTo(Math.max(...corners), 12);
		expect(projection.coordinate).toBeCloseTo(
			Math.min(...corners) + 0.37 * (Math.max(...corners) - Math.min(...corners)),
			12
		);
	});
	it('clamps physical input to model extents and rejects nonfinite coordinates', () => {
		const coordinates = sectionCoordinates(bounds, initialLabState.section);
		expect(sectionOffsetFromMm(coordinates, -1e6)).toBe(0);
		expect(sectionOffsetFromMm(coordinates, 1e6)).toBe(1);
		expect(() => sectionOffsetFromMm(coordinates, Number.NaN)).toThrow(RangeError);
	});
});
