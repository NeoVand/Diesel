import * as THREE from 'three';

export type DesignCameraView = 'front' | 'right' | 'top' | 'isometric';
export type DesignProjection = 'perspective' | 'orthographic';
export interface DesignCameraPose {
	position: [number, number, number];
	target: [number, number, number];
	up: [number, number, number];
	projection: DesignProjection;
	/** Span at the orbit target, independent of viewport aspect ratio. */
	verticalSpanMm: number;
}

export const DESIGN_CAMERA_FOV = 33;
export interface DesignCameraAnnotation {
	position: THREE.Vector3;
	halfWidthPx: number;
	halfHeightPx: number;
}

export function canonicalDesignDirection(view: DesignCameraView): THREE.Vector3 {
	// OrbitControls preserves world Y as up. The negligible top-view offset avoids
	// its pole singularity while retaining an error below 0.0001 degrees.
	return new THREE.Vector3(
		...(
			{
				front: [0, 0, 1],
				right: [1, 0, 0],
				top: [0, 1, 0.000001],
				isometric: [1, 1, 1]
			} satisfies Record<DesignCameraView, [number, number, number]>
		)[view]
	).normalize();
}

export function validateDesignCameraPose(pose: DesignCameraPose): boolean {
	if (
		!pose ||
		!['perspective', 'orthographic'].includes(pose.projection) ||
		!Number.isFinite(pose.verticalSpanMm) ||
		pose.verticalSpanMm <= 0 ||
		![pose.position, pose.target, pose.up].every(
			(values) => Array.isArray(values) && values.length === 3 && values.every(Number.isFinite)
		)
	)
		return false;
	const direction = new THREE.Vector3(...pose.position).sub(new THREE.Vector3(...pose.target));
	const up = new THREE.Vector3(...pose.up);
	return (
		direction.lengthSq() > 1e-10 &&
		up.lengthSq() > 1e-10 &&
		new THREE.Vector3().crossVectors(direction.normalize(), up.normalize()).lengthSq() > 1e-14
	);
}

/** Smoothly rotate around the target without moving the eye through the object. */
export function interpolateDesignCamera(
	position: THREE.Vector3,
	target: THREE.Vector3,
	nextPosition: THREE.Vector3,
	nextTarget: THREE.Vector3,
	fraction: number
) {
	const eye = position.clone().sub(target);
	const nextEye = nextPosition.clone().sub(nextTarget);
	const distance = THREE.MathUtils.lerp(eye.length(), nextEye.length(), fraction);
	const rotation = new THREE.Quaternion().setFromUnitVectors(eye.normalize(), nextEye.normalize());
	eye.applyQuaternion(new THREE.Quaternion().slerp(rotation, fraction));
	const next = target.clone().lerp(nextTarget, fraction);
	return { position: next.clone().addScaledVector(eye, distance), target: next };
}

/** Exact perspective inequalities for the usable viewport, including asymmetric UI insets. */
export function designCameraFrame(
	bounds: THREE.Box3,
	direction: THREE.Vector3,
	width: number,
	height: number,
	fovDegrees = 33,
	zoomRatio = 1,
	up?: THREE.Vector3,
	annotations: readonly DesignCameraAnnotation[] = []
) {
	const mobile = width < 600;
	const inset = {
		left: Math.min(width * 0.13, mobile ? 42 : 62),
		right: Math.min(width * 0.07, 28),
		top: Math.min(height * 0.29, mobile ? 160 : 30),
		bottom: Math.min(height * (mobile ? 0.21 : 0.34), mobile ? 95 : 110)
	};
	const left = (2 * inset.left) / width - 1,
		right = 1 - (2 * inset.right) / width;
	const bottom = (2 * inset.bottom) / height - 1,
		top = 1 - (2 * inset.top) / height;
	const cx = (left + right) / 2,
		cy = (bottom + top) / 2;
	const eye = direction.clone().normalize();
	const worldUp =
		up ?? (Math.abs(eye.y) > 0.999 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0));
	const horizontal = new THREE.Vector3().crossVectors(worldUp, eye).normalize();
	const vertical = new THREE.Vector3().crossVectors(eye, horizontal).normalize();
	const tangentY = Math.tan(THREE.MathUtils.degToRad(fovDegrees / 2));
	const tangentX = (tangentY * width) / height;
	const center = bounds.getCenter(new THREE.Vector3());
	let distance = 1;
	const point = new THREE.Vector3();
	for (const x of [bounds.min.x, bounds.max.x])
		for (const y of [bounds.min.y, bounds.max.y])
			for (const z of [bounds.min.z, bounds.max.z]) {
				point.set(x, y, z).sub(center);
				const px = point.dot(horizontal),
					py = point.dot(vertical),
					depth = point.dot(eye);
				distance = Math.max(
					distance,
					(px / tangentX + right * depth) / (right - cx),
					(-px / tangentX - left * depth) / (cx - left),
					(py / tangentY + top * depth) / (top - cy),
					(-py / tangentY - bottom * depth) / (cy - bottom)
				);
			}
	for (const annotation of annotations) {
		point.copy(annotation.position).sub(center);
		const px = point.dot(horizontal),
			py = point.dot(vertical),
			depth = point.dot(eye);
		const l = left + (2 * annotation.halfWidthPx) / width,
			r = right - (2 * annotation.halfWidthPx) / width;
		const b = bottom + (2 * annotation.halfHeightPx) / height,
			t = top - (2 * annotation.halfHeightPx) / height;
		distance = Math.max(
			distance,
			(px / tangentX + r * depth) / (r - cx),
			(-px / tangentX - l * depth) / (cx - l),
			(py / tangentY + t * depth) / (t - cy),
			(-py / tangentY - b * depth) / (cy - b)
		);
	}
	distance *= 1.06 * zoomRatio;
	const target = center
		.clone()
		.addScaledVector(horizontal, -cx * distance * tangentX)
		.addScaledVector(vertical, -cy * distance * tangentY);
	return { position: target.clone().addScaledVector(eye, distance), target, distance, inset };
}

/** Exact orthographic projected-corner fit using the same viewport insets. */
export function designOrthographicFrame(
	bounds: THREE.Box3,
	direction: THREE.Vector3,
	width: number,
	height: number,
	zoomRatio = 1,
	up = new THREE.Vector3(0, 1, 0),
	annotations: readonly DesignCameraAnnotation[] = []
) {
	const { inset, distance } = designCameraFrame(
		bounds,
		direction,
		width,
		height,
		DESIGN_CAMERA_FOV,
		1,
		up
	);
	const eye = direction.clone().normalize();
	const horizontal = new THREE.Vector3().crossVectors(up, eye).normalize();
	const vertical = new THREE.Vector3().crossVectors(eye, horizontal).normalize();
	const center = bounds.getCenter(new THREE.Vector3());
	const left = (2 * inset.left) / width - 1,
		right = 1 - (2 * inset.right) / width;
	const bottom = (2 * inset.bottom) / height - 1,
		top = 1 - (2 * inset.top) / height;
	const cx = (left + right) / 2,
		cy = (bottom + top) / 2;
	let halfHeight = 1;
	for (const x of [bounds.min.x, bounds.max.x])
		for (const y of [bounds.min.y, bounds.max.y])
			for (const z of [bounds.min.z, bounds.max.z]) {
				const delta = new THREE.Vector3(x, y, z).sub(center);
				const px = (delta.dot(horizontal) * height) / width,
					py = delta.dot(vertical);
				halfHeight = Math.max(
					halfHeight,
					px / (right - cx),
					-px / (cx - left),
					py / (top - cy),
					-py / (cy - bottom)
				);
			}
	for (const annotation of annotations) {
		const delta = annotation.position.clone().sub(center);
		const px = (delta.dot(horizontal) * height) / width,
			py = delta.dot(vertical);
		const l = left + (2 * annotation.halfWidthPx) / width,
			r = right - (2 * annotation.halfWidthPx) / width;
		const b = bottom + (2 * annotation.halfHeightPx) / height,
			t = top - (2 * annotation.halfHeightPx) / height;
		halfHeight = Math.max(halfHeight, px / (r - cx), -px / (cx - l), py / (t - cy), -py / (cy - b));
	}
	halfHeight *= 1.06 * zoomRatio;
	const target = center
		.clone()
		.addScaledVector(horizontal, (-cx * halfHeight * width) / height)
		.addScaledVector(vertical, -cy * halfHeight);
	return {
		position: target.clone().addScaledVector(eye, distance),
		target,
		verticalSpanMm: halfHeight * 2,
		inset
	};
}
