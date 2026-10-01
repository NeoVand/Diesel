import datums from './v12-motion-datums.json';

export type Point3 = readonly [number, number, number];

export interface V12CylinderDatum {
	rod: string;
	piston: string;
	liner: string;
	bank: string;
	bankAxis: readonly number[];
	pistonPinCenterMm: readonly number[];
	rodBigEndCenterMm: readonly number[];
	rodLengthMm: number;
	nativeMechanicalPhaseDeg: number;
	pistonId: string;
	rodId: string;
	linerId: string;
}

export interface V12CylinderPose {
	pistonPinMm: Point3;
	crankPinMm: Point3;
	/** Distance from top dead centre, not a thermodynamic phase. */
	pistonTravelMm: number;
	mechanicalPhaseDeg: number;
	rodAngleDeltaRadians: number;
}

export const V12_MOTION_DATUMS = datums;
export const V12_CYLINDERS: readonly V12CylinderDatum[] = datums.cylinders;
export const V12_MOTION_SCOPE = {
	articulated:
		'Crank group, twelve rods/pistons, three closed chain loops, timing wheels, four cams, 48 valves/tappets and deforming springs',
	evidence:
		'Native joint axes and cam profiles; rigid linkage/chain closure; finite-pad lift and seated valve geometry; documented derived corrections',
	knownSourceIssue:
		'Purchased piston geometry intersects small lower block support corners near bottom dead centre; source clearance is not validated',
	corrections:
		'Cam clocking/rear-lobe indexing, upper stem lengths, one tappet axis, spring reconstruction, tooth rings, guide placements and selected crown/block surfaces',
	unresolved:
		'Authenticated production firing order, injection calibration, contact forces, operating thermal clearances and durability'
} as const;

/** Phase increases clockwise when viewed along native +Z, matching the audited datum angles. */
export function v12MechanicalPhase(phaseDeg: number): number {
	if (!Number.isFinite(phaseDeg)) throw new RangeError('Crank phase must be finite.');
	return ((phaseDeg % 360) + 360) % 360;
}

/** Absolute source-native millimetres to the immutable, world-baked GLB coordinate system. */
export function v12NativeToDisplay(point: readonly number[]): Point3 {
	const [cx, cy, cz] = datums.sourceCenterMeters;
	const scale = datums.displayScale;
	return [
		(point[2] / 1000 + cy) * scale,
		(point[1] / 1000 - cz) * scale,
		(-point[0] / 1000 + cx) * scale
	];
}

/** Native vectors are translated neither by the source centre nor by a camera fit. */
export function v12NativeVectorToDisplay(vector: readonly number[]): Point3 {
	const scale = datums.displayScale / 1000;
	return [vector[2] * scale, vector[1] * scale, -vector[0] * scale];
}

export function v12CylinderPose(cylinder: V12CylinderDatum, phaseDeg: number): V12CylinderPose {
	const phase = v12MechanicalPhase(phaseDeg);
	const angle = (phase * Math.PI) / 180;
	const cos = Math.cos(angle);
	const sin = Math.sin(angle);
	const [x, y, z] = cylinder.rodBigEndCenterMm;
	const crankX = x * cos + y * sin;
	const crankY = y * cos - x * sin;
	const [dx, dy] = cylinder.bankAxis;
	const along = crankX * dx + crankY * dy;
	const across = crankX * dy - crankY * dx;
	const distance = along + Math.sqrt(cylinder.rodLengthMm ** 2 - across ** 2);
	const piston: Point3 = [dx * distance, dy * distance, z];
	const crank: Point3 = [crankX, crankY, z];
	const [px, py, pz] = cylinder.pistonPinCenterMm;
	const restAngle = Math.atan2(py - y, px - x);
	const currentAngle = Math.atan2(piston[1] - crankY, piston[0] - crankX);
	const rodDelta = currentAngle - restAngle;
	return {
		// The source pose is exact at whole revolutions. Analytic residuals are below 1e-10 mm.
		pistonPinMm: phase === 0 ? [px, py, pz] : piston,
		crankPinMm: phase === 0 ? [x, y, z] : crank,
		pistonTravelMm: cylinder.rodLengthMm + Math.hypot(x, y) - distance,
		mechanicalPhaseDeg: v12MechanicalPhase(cylinder.nativeMechanicalPhaseDeg + phase),
		rodAngleDeltaRadians: phase === 0 ? 0 : rodDelta
	};
}
