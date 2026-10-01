import * as THREE from 'three';

/** Distance that contains the actual component corners in the usable perspective viewport. */
export function perspectiveFitDistance(
	boxes: readonly THREE.Box3[],
	center: THREE.Vector3,
	direction: THREE.Vector3,
	verticalFovDegrees: number,
	aspect: number,
	usableX = 1,
	usableY = 1
): number {
	const viewDirection = direction.clone().normalize();
	const up =
		Math.abs(viewDirection.y) > 0.9999 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
	const right = new THREE.Vector3().crossVectors(up, viewDirection).normalize();
	up.crossVectors(viewDirection, right).normalize();
	const tangent = Math.tan(THREE.MathUtils.degToRad(verticalFovDegrees / 2));
	const point = new THREE.Vector3();
	let distance = 0.2;
	for (const box of boxes) {
		if (box.isEmpty()) continue;
		for (const x of [box.min.x, box.max.x])
			for (const y of [box.min.y, box.max.y])
				for (const z of [box.min.z, box.max.z]) {
					point.set(x, y, z).sub(center);
					const depth = point.dot(viewDirection);
					distance = Math.max(
						distance,
						depth + Math.abs(point.dot(up)) / (tangent * usableY),
						depth + Math.abs(point.dot(right)) / (tangent * aspect * usableX)
					);
				}
	}
	return distance;
}
