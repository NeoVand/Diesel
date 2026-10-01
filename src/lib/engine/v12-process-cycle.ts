import { type V12CylinderDatum } from './v12-kinematics';
import { v12CylinderValveState, V12_VALVE_CYCLES } from './v12-valve-events';

export const V12_PROCESS_SCOPE =
	'Derived cam-driven four-stroke sequence. Source passages carry offline potential-flow tracers; injection and combustion envelopes remain declared teaching assumptions, not reacting CFD or calibrated pressure.';

/** Angles relative to the selected compression TDC. Not production valve/injection events. */
export const V12_PROCESS_TIMING = {
	injectionStartDeg: -14,
	injectionEndDeg: 20,
	ignitionDeg: -4,
	combustionEndDeg: 70,
	exhaustStartDeg: 180,
	exhaustEndDeg: 360,
	intakeStartDeg: 360,
	intakeEndDeg: 540
} as const;

export type V12CycleStroke = 'intake' | 'compression' | 'expansion' | 'exhaust';
export interface V12ProcessCycle {
	/** 0 is the illustrative firing TDC; the geometric TDC also occurs at 360. */
	cycleDeg: number;
	stroke: V12CycleStroke;
	intake: number;
	exhaust: number;
	injection: number;
	/** Normalized illustrative heat-release envelope, not power or pressure. */
	combustion: number;
	igniting: boolean;
}

function modulo(value: number, period: number) {
	return ((value % period) + period) % period;
}

/** Compatibility helper: selected compression revolution follows the corrected cam rig. */
export function v12TeachingRevolution(cylinder: V12CylinderDatum): 0 | 360 {
	const cycle = V12_VALVE_CYCLES.find((c) => c.pistonId === cylinder.pistonId)!;
	const shift = modulo(-cycle.compressionTdcCrankDeg - cylinder.nativeMechanicalPhaseDeg, 720);
	return shift > 180 && shift < 540 ? 360 : 0;
}
const BURN_PEAK_PROGRESS = Math.cbrt(2 / (3 * 6.9));
const BURN_PEAK = BURN_PEAK_PROGRESS ** 2 * Math.exp(-6.9 * BURN_PEAK_PROGRESS ** 3);

function windowPulse(value: number, start: number, end: number): number {
	if (value <= start || value >= end) return 0;
	return Math.sin((Math.PI * (value - start)) / (end - start)) ** 2;
}

export function v12ProcessCycle(cylinder: V12CylinderDatum, phaseDeg: number): V12ProcessCycle {
	if (!Number.isFinite(phaseDeg)) throw new RangeError('Cycle phase must be finite.');
	const valves = v12CylinderValveState(cylinder.pistonId, phaseDeg);
	const cycleDeg = valves.cycleAngleDeg;
	const firingAngle = cycleDeg > 540 ? cycleDeg - 720 : cycleDeg;
	const timing = V12_PROCESS_TIMING;
	const burnProgress =
		(firingAngle - timing.ignitionDeg) / (timing.combustionEndDeg - timing.ignitionDeg);
	// Derivative of a Wiebe-like burned-fraction curve, normalized to a unit peak.
	// The shape is a visual envelope; no engine-calibrated burn law is implied.
	const combustion =
		burnProgress > 0 && burnProgress < 1
			? Math.min(1, (burnProgress ** 2 * Math.exp(-6.9 * burnProgress ** 3)) / BURN_PEAK) *
				Math.min(1, (1 - burnProgress) / 0.12)
			: 0;
	return {
		cycleDeg,
		stroke:
			cycleDeg < 180
				? 'expansion'
				: cycleDeg < 360
					? 'exhaust'
					: cycleDeg < 540
						? 'intake'
						: 'compression',
		intake: Math.min(1, valves.intake.curtainAreaMm2 / (2 * Math.PI * 12.5 ** 2)),
		exhaust: Math.min(1, valves.exhaust.curtainAreaMm2 / (2 * Math.PI * 12.5 ** 2)),
		injection: windowPulse(firingAngle, timing.injectionStartDeg, timing.injectionEndDeg),
		combustion,
		igniting: firingAngle >= timing.ignitionDeg && firingAngle < timing.ignitionDeg + 12
	};
}
