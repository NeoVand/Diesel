import {
	V12_CYLINDERS,
	V12_MOTION_DATUMS,
	v12CylinderPose,
	v12MechanicalPhase,
	type V12CylinderDatum
} from './v12-kinematics';

/** Geometry analysis only. Phase is relative to the supplied CAD pose, not an engine firing event. */
export const V12_ANALYSIS = {
	title: 'Slider–crank geometry',
	provenance: V12_MOTION_DATUMS.provenance,
	phaseBasis: 'Global crank angle from the source pose; one mechanical revolution repeats at 360°.',
	displacementBasis: 'Piston travel from its own top dead centre, measured along the bore axis.',
	qualification:
		'Rigid geometric motion from measured source pin axes. No loads, bearing clearance, combustion, torque or power model.'
} as const;

export interface V12KinematicSample {
	/** Global crank rotation from the supplied source pose, 0 through 360 in a plotted cycle. */
	phaseDeg: number;
	/** Local slider-crank angle, with 0 at that piston’s geometric top dead centre. */
	cylinderPhaseDeg: number;
	displacementMm: number;
	/** Signed connecting-rod inclination relative to its own bore axis. */
	rodAngleDeg: number;
}

export interface V12KinematicMeasurement extends V12KinematicSample {
	pistonId: string;
	rodId: string;
	linerId: string;
	bank: 'A' | 'B';
	rodLengthMm: number;
	crankThrowMm: number;
	strokeMm: number;
}

// Bank labels are spatial navigation names only; these are not OEM cylinder/firing-order numbers.
export const V12_ANALYSIS_CYLINDERS = Object.freeze(
	V12_CYLINDERS.map((cylinder) =>
		Object.freeze({
			id: cylinder.pistonId,
			rodId: cylinder.rodId,
			linerId: cylinder.linerId,
			bank: cylinder.bank === 'negativeX' ? ('A' as const) : ('B' as const),
			label: `Piston ${cylinder.pistonId.slice(4)} · bank ${cylinder.bank === 'negativeX' ? 'A' : 'B'}`
		})
	)
);

function sourceCylinder(componentId: string): V12CylinderDatum {
	const cylinder = V12_CYLINDERS.find((entry) =>
		[entry.pistonId, entry.rodId, entry.linerId].includes(componentId)
	);
	if (!cylinder) throw new RangeError('Select a measured source piston, connecting rod or liner.');
	return cylinder;
}

function sample(cylinder: V12CylinderDatum, phaseDeg: number): V12KinematicSample {
	const pose = v12CylinderPose(cylinder, phaseDeg);
	const rodX = pose.pistonPinMm[0] - pose.crankPinMm[0];
	const rodY = pose.pistonPinMm[1] - pose.crankPinMm[1];
	const [axisX, axisY] = cylinder.bankAxis;
	return {
		phaseDeg,
		cylinderPhaseDeg: pose.mechanicalPhaseDeg,
		displacementMm: pose.pistonTravelMm,
		rodAngleDeg:
			(Math.atan2(axisX * rodY - axisY * rodX, axisX * rodX + axisY * rodY) * 180) / Math.PI
	};
}

/** Uses the exact same solver as the rendered source mechanism; the view never changes these values. */
export function v12KinematicMeasurement(
	componentId: string,
	phaseDeg: number
): V12KinematicMeasurement {
	const cylinder = sourceCylinder(componentId);
	const crankThrowMm = Math.hypot(...cylinder.rodBigEndCenterMm.slice(0, 2));
	return {
		...sample(cylinder, v12MechanicalPhase(phaseDeg)),
		pistonId: cylinder.pistonId,
		rodId: cylinder.rodId,
		linerId: cylinder.linerId,
		bank: cylinder.bank === 'negativeX' ? 'A' : 'B',
		rodLengthMm: cylinder.rodLengthMm,
		crankThrowMm,
		strokeMm: crankThrowMm * 2
	};
}

/** Includes both endpoints for a closed, periodic chart; interval count is bounded for UI callers. */
export function createV12KinematicCurve(
	componentId: string,
	intervalCount = 180
): readonly Readonly<V12KinematicSample>[] {
	if (!Number.isInteger(intervalCount) || intervalCount < 12 || intervalCount > 1440)
		throw new RangeError('Curve interval count must be an integer between 12 and 1440.');
	const cylinder = sourceCylinder(componentId);
	return Object.freeze(
		Array.from({ length: intervalCount + 1 }, (_, index) =>
			Object.freeze(sample(cylinder, (index * 360) / intervalCount))
		)
	);
}
