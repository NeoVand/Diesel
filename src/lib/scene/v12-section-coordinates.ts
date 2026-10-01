import * as THREE from 'three';
import { V12_MOTION_DATUMS } from '$lib/engine/v12-kinematics';
import type { LabState } from '$lib/engine/lab-state';

export interface SectionCoordinates {
	offsetMm: number;
	minMm: number;
	maxMm: number;
	normal: [number, number, number];
}

/** Section normal and support interval are shared by clipping and dimensional controls. */
export function sectionProjection(bounds: THREE.Box3, section: LabState['section']) {
	const normal = new THREE.Vector3(
		section.axis === 'x' ? 1 : 0,
		section.axis === 'y' ? 1 : 0,
		section.axis === 'z' ? 1 : 0
	);
	const [pitch, yaw] = section.rotation ?? [0, 0];
	normal
		.applyEuler(
			new THREE.Euler(THREE.MathUtils.degToRad(pitch), THREE.MathUtils.degToRad(yaw), 0, 'YXZ')
		)
		.normalize();
	const centre = bounds.getCenter(new THREE.Vector3()).dot(normal);
	const halfSize = bounds.getSize(new THREE.Vector3()).multiplyScalar(0.5);
	const halfSpan =
		halfSize.x * Math.abs(normal.x) +
		halfSize.y * Math.abs(normal.y) +
		halfSize.z * Math.abs(normal.z);
	const min = centre - halfSpan;
	const max = centre + halfSpan;
	return { normal, centre, min, max, coordinate: THREE.MathUtils.lerp(min, max, section.offset) };
}

/** Physical offset from the mechanical source bounds centre; camera and disassembly do not change the datum. */
export function sectionCoordinates(
	bounds: THREE.Box3,
	section: LabState['section']
): SectionCoordinates {
	const projection = sectionProjection(bounds, section);
	const displayUnitsPerMm = V12_MOTION_DATUMS.displayScale / 1000;
	return {
		offsetMm: (projection.coordinate - projection.centre) / displayUnitsPerMm,
		minMm: (projection.min - projection.centre) / displayUnitsPerMm,
		maxMm: (projection.max - projection.centre) / displayUnitsPerMm,
		normal: projection.normal.toArray()
	};
}

export function sectionOffsetFromMm(coordinates: SectionCoordinates, offsetMm: number): number {
	if (!Number.isFinite(offsetMm)) throw new RangeError('Section offset must be finite.');
	const span = coordinates.maxMm - coordinates.minMm;
	return span > 0 ? Math.max(0, Math.min(1, (offsetMm - coordinates.minMm) / span)) : 0.5;
}
