import * as THREE from 'three';

/** Ordered boundary of the section plane inside the engine bounds. No infinite guide surface. */
export function sectionGuidePolygon(bounds: THREE.Box3, plane: THREE.Plane): THREE.Vector3[] {
	if (bounds.isEmpty()) return [];
	const epsilon = Math.max(1e-9, bounds.getSize(new THREE.Vector3()).length() * 1e-8);
	const corners = Array.from(
		{ length: 8 },
		(_, bits) =>
			new THREE.Vector3(
				bits & 1 ? bounds.max.x : bounds.min.x,
				bits & 2 ? bounds.max.y : bounds.min.y,
				bits & 4 ? bounds.max.z : bounds.min.z
			)
	);
	const distances = corners.map((point) => plane.distanceToPoint(point));
	const points: THREE.Vector3[] = [];
	const add = (point: THREE.Vector3) => {
		if (points.every((existing) => existing.distanceToSquared(point) > epsilon * epsilon))
			points.push(point.clone());
	};
	for (let index = 0; index < 8; index++) {
		for (const bit of [1, 2, 4]) {
			if (index & bit) continue;
			const other = index | bit;
			const start = distances[index],
				end = distances[other];
			if (Math.abs(start) <= epsilon) add(corners[index]);
			if (Math.abs(end) <= epsilon) add(corners[other]);
			if (start * end < 0) add(corners[index].clone().lerp(corners[other], start / (start - end)));
		}
	}
	// Vertex/edge tangency has no polygonal area to outline.
	if (points.length < 3) return [];
	const center = points
		.reduce((sum, point) => sum.add(point), new THREE.Vector3())
		.divideScalar(points.length);
	const u = (
		Math.abs(plane.normal.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)
	)
		.cross(plane.normal)
		.normalize();
	const v = new THREE.Vector3().crossVectors(plane.normal, u).normalize();
	const angle = (point: THREE.Vector3) => {
		const delta = point.clone().sub(center);
		return Math.atan2(delta.dot(v), delta.dot(u));
	};
	return points.sort((a, b) => angle(a) - angle(b));
}
