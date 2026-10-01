import datums from './v12-valvetrain-datums.json';

export type V12ValveDatum = (typeof datums.valves)[number];
export type V12ValveRole = 'intake' | 'exhaust';
export const V12_VALVETRAIN_DATUMS = datums;
export const V12_VALVES: readonly V12ValveDatum[] = datums.valves;
export const V12_CAM_CRANK_OFFSETS_DEG: Readonly<Record<string, number>> =
	datums.camCrankOffsetsDeg;
export const V12_VALVE_CYCLES = datums.cylinders;
const byId = new Map(V12_VALVES.map((v) => [v.valveId, v]));

export function v12ValvePhase(angle: number): number {
	if (!Number.isFinite(angle)) throw new RangeError('Crank angle must be finite.');
	return ((angle % 720) + 720) % 720;
}

/** Actual source cam contact table, reindexed as a documented teaching configuration. */
export function v12ValveLift(valve: V12ValveDatum | string, crankDeg: number): number {
	const datum = typeof valve === 'string' ? byId.get(valve) : valve;
	if (!datum) throw new RangeError(`Unknown valve: ${valve}`);
	const phase =
		(v12ValvePhase(crankDeg + datum.camCrankOffsetDeg) * datum.liftSamplesMm.length) / 720;
	const index = Math.floor(phase);
	const fraction = phase - index;
	const lift =
		datum.liftSamplesMm[index] * (1 - fraction) +
		datum.liftSamplesMm[(index + 1) % datum.liftSamplesMm.length] * fraction;
	// Sub-micron polygon/placement noise is below the source mesh precision.
	return lift < 1e-4 ? 0 : lift;
}

export function v12ValvePose(valve: V12ValveDatum, crankDeg: number) {
	const liftMm = v12ValveLift(valve, crankDeg);
	return {
		liftMm,
		tappetTravelFromSourceMm: valve.closedPadShiftMm - liftMm,
		valveTravelFromSourceMm: valve.closedValveShiftMm - liftMm,
		springHeightMm: valve.spring.heightClosedMm - liftMm
	};
}

/** Opening area is a geometric curtain limit, not a calibrated discharge coefficient. */
export function v12CylinderValveState(pistonId: string, crankDeg: number) {
	const cycle = V12_VALVE_CYCLES.find((c) => c.pistonId === pistonId);
	if (!cycle) throw new RangeError(`Unknown cylinder piston: ${pistonId}`);
	const cycleAngleDeg = v12ValvePhase(crankDeg - cycle.compressionTdcCrankDeg);
	const aggregate = (ids: readonly string[]) => {
		const lifts = ids.map((id) => v12ValveLift(id, crankDeg));
		return {
			liftMm: lifts.reduce((a, b) => a + b, 0) / lifts.length,
			curtainAreaMm2: lifts.reduce(
				(area, lift) => area + Math.min(Math.PI * 12.5 ** 2, 2 * Math.PI * 12.5 * lift),
				0
			),
			open: lifts.some((lift) => lift > 0.01)
		};
	};
	return {
		cycleAngleDeg,
		compressionTdcCrankDeg: cycle.compressionTdcCrankDeg,
		stroke: (cycleAngleDeg < 180
			? 'expansion'
			: cycleAngleDeg < 360
				? 'exhaust'
				: cycleAngleDeg < 540
					? 'intake'
					: 'compression') as 'expansion' | 'exhaust' | 'intake' | 'compression',
		intake: aggregate(cycle.intakeValveIds),
		exhaust: aggregate(cycle.exhaustValveIds)
	};
}
