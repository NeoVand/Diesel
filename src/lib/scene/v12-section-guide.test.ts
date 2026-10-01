import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { sectionGuidePolygon } from './v12-section-guide';

const bounds = new THREE.Box3(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, 1, 1));
function verifyInside(points: THREE.Vector3[], plane: THREE.Plane) {
	for (const point of points) {
		expect(bounds.clone().expandByScalar(1e-9).containsPoint(point)).toBe(true);
		expect(Math.abs(plane.distanceToPoint(point))).toBeLessThan(1e-9);
	}
	for (let i = 0; i < points.length; i++)
		for (let j = i + 1; j < points.length; j++)
			expect(points[i].distanceTo(points[j])).toBeGreaterThan(1e-8);
}
describe('bounded V12 section guide', () => {
	it('outlines axis-aligned cuts within the source bounds', () => {
		for (const normal of [
			new THREE.Vector3(1, 0, 0),
			new THREE.Vector3(0, 1, 0),
			new THREE.Vector3(0, 0, 1)
		]) {
			const plane = new THREE.Plane(normal, -0.3);
			const points = sectionGuidePolygon(bounds, plane);
			expect(points).toHaveLength(4);
			verifyInside(points, plane);
		}
	});
	it('produces the six-sided intersection for a diagonal cut without overshooting the box', () => {
		const plane = new THREE.Plane(new THREE.Vector3(1, 1, 1).normalize(), 0);
		const points = sectionGuidePolygon(bounds, plane);
		expect(points).toHaveLength(6);
		verifyInside(points, plane);
		for (let i = 0; i < points.length; i++)
			expect(points[i].distanceTo(points[(i + 1) % points.length])).toBeCloseTo(Math.SQRT2, 8);
	});
	it('keeps face tangency bounded and hides edge/vertex tangency and absent intersections', () => {
		const face = new THREE.Plane(new THREE.Vector3(1, 0, 0), -1);
		expect(sectionGuidePolygon(bounds, face)).toHaveLength(4);
		verifyInside(sectionGuidePolygon(bounds, face), face);
		expect(
			sectionGuidePolygon(
				bounds,
				new THREE.Plane(new THREE.Vector3(1, 1, 0).normalize(), -Math.SQRT2)
			)
		).toEqual([]);
		expect(
			sectionGuidePolygon(
				bounds,
				new THREE.Plane(new THREE.Vector3(1, 1, 1).normalize(), -Math.sqrt(3))
			)
		).toEqual([]);
		expect(sectionGuidePolygon(bounds, new THREE.Plane(new THREE.Vector3(1, 0, 0), -1.01))).toEqual(
			[]
		);
	});
	it('flipping the retained half changes no guide boundary', () => {
		const plane = new THREE.Plane(new THREE.Vector3(2, 3, 4).normalize(), 0.25);
		const forward = sectionGuidePolygon(bounds, plane);
		const reverse = sectionGuidePolygon(bounds, plane.clone().negate());
		expect(reverse).toHaveLength(forward.length);
		for (const point of forward)
			expect(reverse.some((other) => point.distanceTo(other) < 1e-9)).toBe(true);
	});
});
