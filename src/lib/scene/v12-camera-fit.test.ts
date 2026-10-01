import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { perspectiveFitDistance } from './v12-camera-fit';

const boxes = [
	new THREE.Box3(new THREE.Vector3(-3, -2, -1.4), new THREE.Vector3(3, 1.2, 1.4)),
	new THREE.Box3(new THREE.Vector3(-2.5, 1.2, -0.9), new THREE.Vector3(2.5, 2.1, 0.9))
];
const center = new THREE.Box3().copy(boxes[0]).union(boxes[1]).getCenter(new THREE.Vector3());
const direction = new THREE.Vector3(1.05, 0.52, 1.25).normalize();
function assertContained(aspect: number, inputs = boxes) {
	const distance = perspectiveFitDistance(inputs, center, direction, 35, aspect, 0.94, 0.7);
	const camera = new THREE.PerspectiveCamera(35, aspect, 0.025, 500);
	camera.position.copy(center).addScaledVector(direction, distance * 1.015);
	camera.lookAt(center);
	camera.updateMatrixWorld(true);
	for (const box of inputs)
		for (const x of [box.min.x, box.max.x])
			for (const y of [box.min.y, box.max.y])
				for (const z of [box.min.z, box.max.z]) {
					const point = new THREE.Vector3(x, y, z).project(camera);
					expect(Math.abs(point.x)).toBeLessThanOrEqual(0.94);
					expect(Math.abs(point.y)).toBeLessThanOrEqual(0.7);
					expect(point.z).toBeLessThan(1);
				}
	return distance;
}
describe('responsive V12 composition', () => {
	it('keeps all source corners visible when switching from desktop to a 390px portrait stage', () => {
		const wide = assertContained(1280 / 660),
			portrait = assertContained(390 / 784);
		expect(portrait).toBeGreaterThan(wide);
	});
	it('fits a selected small component without inheriting the complete engine distance', () => {
		const selected = [
			new THREE.Box3(center.clone().addScalar(-0.12), center.clone().addScalar(0.12))
		];
		expect(assertContained(390 / 784, selected)).toBeLessThan(assertContained(390 / 784));
	});
	it('is reversible across aspect changes without accumulating camera-distance drift', () => {
		const original = assertContained(1280 / 660);
		assertContained(390 / 784);
		expect(assertContained(1280 / 660)).toBe(original);
	});
});
