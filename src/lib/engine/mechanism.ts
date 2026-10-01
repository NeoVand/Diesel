/**
 * Deterministic educational mechanism. Bore/stroke/compression and reference rpm
 * are nominal 3512C values. Rod length, 60-degree bank arrangement, cylinder
 * sequence, valve windows and injection indication are explicit assumptions.
 * None is an OEM internal CAD, valve-timing or combustion-pressure calibration.
 */
export interface MechanismConfig {
	boreMm: number;
	strokeMm: number;
	crankRadiusMm: number;
	rodLengthMm: number;
	compressionRatio: number;
	rpm: number;
	intakeOpenDeg: number;
	intakeCloseDeg: number;
	exhaustOpenDeg: number;
	exhaustCloseDeg: number;
	injectionStartDeg: number;
	injectionEndDeg: number;
}

export const MECHANISM_CONFIG: Readonly<MechanismConfig> = Object.freeze({
	boreMm: 170,
	strokeMm: 190,
	crankRadiusMm: 95,
	rodLengthMm: 350,
	compressionRatio: 14.7,
	rpm: 1800,
	intakeOpenDeg: 0,
	intakeCloseDeg: 180,
	exhaustOpenDeg: 540,
	exhaustCloseDeg: 720,
	injectionStartDeg: 350,
	injectionEndDeg: 370
});

export const MECHANISM_EVIDENCE = Object.freeze({
	geometry: 'Nominal 170 mm bore / 190 mm stroke / 14.7:1 compression ratio',
	rod: '350 mm rod length is an instructional assumption',
	banks: 'Representative 60-degree V12, not verified Cat crank geometry',
	timing: 'Idealized valve and injection windows; actual timing and lift unknown',
	sequence: 'Evenly spaced educational events; not the Caterpillar firing order',
	combustion: 'Visual phase indication only; no calibrated pressure or heat-release curve'
});

export type FourStroke = 'intake' | 'compression' | 'power' | 'exhaust';
const strokes: readonly FourStroke[] = ['intake', 'compression', 'power', 'exhaust'];

function finite(value: number, label: string): void {
	if (!Number.isFinite(value)) throw new RangeError(`${label} must be finite.`);
}

/** Wrap a cycle angle to [0, 720); piston geometry itself repeats after 360 degrees. */
export function wrapPhase(phaseDeg: number): number {
	finite(phaseDeg, 'Cycle angle');
	const result = ((phaseDeg % 720) + 720) % 720;
	return Object.is(result, -0) ? 0 : result;
}

export function strokeForPhase(phaseDeg: number): FourStroke {
	return strokes[Math.floor(wrapPhase(phaseDeg) / 180)];
}

/** Smooth normalized lift/indication in a cyclic window, with zero at both boundaries. */
export function cycleWindow(phaseDeg: number, startDeg: number, endDeg: number): number {
	finite(startDeg, 'Event start');
	finite(endDeg, 'Event end');
	const rawDuration = endDeg - startDeg;
	const duration = rawDuration === 720 ? 720 : wrapPhase(rawDuration);
	if (duration === 0) return 0;
	const distance = wrapPhase(wrapPhase(phaseDeg) - wrapPhase(startDeg));
	if (distance === 0 || distance >= duration) return 0;
	return Math.sin((Math.PI * distance) / duration) ** 2;
}

export interface MechanismState {
	phaseDeg: number;
	cycleStroke: FourStroke;
	strokeProgress: number;
	crankAngleRad: number;
	pistonDisplacementMm: number;
	pistonPinYmm: number;
	crankPinXmm: number;
	crankPinYmm: number;
	rodAngleRad: number;
	cylinderVolumeL: number;
	sweptVolumeL: number;
	clearanceVolumeL: number;
	intakeLift: number;
	exhaustLift: number;
	intakeOpen: boolean;
	exhaustOpen: boolean;
	injectionIntensity: number;
	injectionActive: boolean;
	combustionIntensity: number;
	/** Geometric trapped-charge compression indication, not temperature or pressure. */
	compressionIntensity: number;
}

function checkedConfig(overrides: Partial<MechanismConfig>): MechanismConfig {
	const config = { ...MECHANISM_CONFIG, ...overrides };
	for (const [name, value] of Object.entries(config)) finite(value, name);
	if (
		config.boreMm <= 0 ||
		config.crankRadiusMm <= 0 ||
		Math.abs(config.strokeMm - 2 * config.crankRadiusMm) > 1e-9 ||
		config.rodLengthMm <= config.crankRadiusMm ||
		config.compressionRatio <= 1 ||
		config.rpm < 0
	)
		throw new RangeError('Mechanism dimensions must form a valid slider-crank.');
	for (const key of [
		'intakeOpenDeg',
		'intakeCloseDeg',
		'exhaustOpenDeg',
		'exhaustCloseDeg',
		'injectionStartDeg',
		'injectionEndDeg'
	] as const) {
		if (config[key] < 0 || config[key] > 720)
			throw new RangeError(`${key} must be between 0 and 720 degrees.`);
	}
	return config;
}

/** Local cylinder axis is +Y; the crank center is (0,0), dimensions are millimeters. */
export function calculateMechanism(
	phaseDeg: number,
	overrides: Partial<MechanismConfig> = {}
): MechanismState {
	const config = checkedConfig(overrides);
	const phase = wrapPhase(phaseDeg);
	const angle = ((phase % 360) * Math.PI) / 180;
	const crankPinXmm = config.crankRadiusMm * Math.sin(angle);
	const crankPinYmm = config.crankRadiusMm * Math.cos(angle);
	const rodAxialMm = Math.sqrt(config.rodLengthMm ** 2 - crankPinXmm ** 2);
	const pistonPinYmm = crankPinYmm + rodAxialMm;
	const pistonDisplacementMm = config.crankRadiusMm + config.rodLengthMm - pistonPinYmm;
	const areaMm2 = (Math.PI * config.boreMm ** 2) / 4;
	const sweptVolumeL = (areaMm2 * config.strokeMm) / 1_000_000;
	const clearanceVolumeL = sweptVolumeL / (config.compressionRatio - 1);
	const intakeLift = cycleWindow(phase, config.intakeOpenDeg, config.intakeCloseDeg);
	const exhaustLift = cycleWindow(phase, config.exhaustOpenDeg, config.exhaustCloseDeg);
	const injectionIntensity = cycleWindow(phase, config.injectionStartDeg, config.injectionEndDeg);

	return {
		phaseDeg: phase,
		cycleStroke: strokeForPhase(phase),
		strokeProgress: (phase % 180) / 180,
		crankAngleRad: angle,
		pistonDisplacementMm,
		pistonPinYmm,
		crankPinXmm,
		crankPinYmm,
		rodAngleRad: Math.asin(crankPinXmm / config.rodLengthMm),
		cylinderVolumeL: clearanceVolumeL + (areaMm2 * pistonDisplacementMm) / 1_000_000,
		sweptVolumeL,
		clearanceVolumeL,
		intakeLift,
		exhaustLift,
		intakeOpen: intakeLift > 0,
		exhaustOpen: exhaustLift > 0,
		injectionIntensity,
		injectionActive: injectionIntensity > 0,
		compressionIntensity:
			phase >= 180 && phase <= 540
				? ((clearanceVolumeL + sweptVolumeL) /
						(clearanceVolumeL + (areaMm2 * pistonDisplacementMm) / 1_000_000) -
						1) /
					(config.compressionRatio - 1)
				: 0,
		// An authored visual cue during the beginning of the power stroke, not heat release.
		combustionIntensity: cycleWindow(phase, 360, 480)
	};
}

/** Authored display dimensions only. They are not production clearance data. */
export const TEACHING_GEOMETRY = Object.freeze({
	linerBottomMm: 0.76 / 0.003,
	linerTopMm: 1.59 / 0.003,
	linerWallMm: 10,
	cylinderPitchMm: 0.58 / 0.003,
	pistonCrownOffsetMm: 0.198 / 0.003,
	pistonSkirtOffsetMm: -50,
	pistonOuterRadiusMm: 0.2545 / 0.003,
	crankThrowEnvelopeMm: 150,
	nozzleTipMm: 520,
	chamberMarginMm: 0.004 / 0.003
});

/** Bounds the explanatory gas/spray geometry above the instantaneous piston crown. */
export function calculateTeachingChamber(phaseDeg: number) {
	const state = calculateMechanism(phaseDeg);
	const bottomMm =
		state.pistonPinYmm + TEACHING_GEOMETRY.pistonCrownOffsetMm + TEACHING_GEOMETRY.chamberMarginMm;
	const topMm = TEACHING_GEOMETRY.linerTopMm - 2;
	const sprayTopMm = TEACHING_GEOMETRY.nozzleTipMm;
	const sprayHeightMm = Math.max(0, Math.min(45, sprayTopMm - bottomMm));
	return {
		bottomMm,
		topMm,
		heightMm: topMm - bottomMm,
		sprayTopMm,
		sprayHeightMm,
		sprayRadiusMm: Math.min(28, sprayHeightMm * 0.8)
	};
}

export interface CylinderPhase {
	id: string;
	index: number;
	row: number;
	bank: 'A' | 'B';
	/** Clockwise tilt from local +Y, not a positive Euler-Z rotation. */
	bankAngleDeg: number;
	firingOffsetDeg: number;
	phaseDeg: number;
}

/**
 * Representative paired banks: rotating each local crank pin by bankAngleDeg
 * puts a pair on the same world pin. This is not Cat numbering or firing order.
 */
export function cylinderPhases(globalPhaseDeg: number): CylinderPhase[] {
	const phase = wrapPhase(globalPhaseDeg);
	return Array.from({ length: 12 }, (_, index) => ({
		id: `cylinder:${String(index + 1).padStart(2, '0')}`,
		index,
		row: Math.floor(index / 2),
		bank: index % 2 === 0 ? 'A' : 'B',
		bankAngleDeg: index % 2 === 0 ? -30 : 30,
		firingOffsetDeg: index * 60,
		phaseDeg: wrapPhase(phase - index * 60)
	}));
}

/** Local XY-plane bank transform; equivalent to Euler-Z rotation by -bankAngle. */
export function bankToWorld(
	xMm: number,
	yMm: number,
	bankAngleDeg: number
): { xMm: number; yMm: number } {
	finite(xMm, 'Local x');
	finite(yMm, 'Local y');
	finite(bankAngleDeg, 'Bank angle');
	const angle = (bankAngleDeg * Math.PI) / 180;
	return {
		xMm: xMm * Math.cos(angle) + yMm * Math.sin(angle),
		yMm: -xMm * Math.sin(angle) + yMm * Math.cos(angle)
	};
}

/** Analytic phase advance: display rate cannot alter the nominal performance map. */
export function advancePhase(
	phaseDeg: number,
	elapsedSeconds: number,
	playback = 0.02,
	rpm = MECHANISM_CONFIG.rpm
): number {
	finite(elapsedSeconds, 'Elapsed time');
	finite(playback, 'Playback scale');
	finite(rpm, 'Reference rpm');
	if (elapsedSeconds < 0 || playback < 0 || rpm < 0)
		throw new RangeError('Phase advance requires nonnegative time, playback and speed.');
	return wrapPhase(phaseDeg + elapsedSeconds * rpm * 6 * playback);
}

/** Counts events in (start, start+advance], including frames spanning entire cycles. */
export function countPhaseCrossings(
	startPhaseDeg: number,
	advanceDeg: number,
	eventDeg: number
): number {
	finite(advanceDeg, 'Angular advance');
	if (advanceDeg < 0) throw new RangeError('Event counting requires a nonnegative advance.');
	const start = wrapPhase(startPhaseDeg);
	const event = wrapPhase(eventDeg);
	return Math.floor((start + advanceDeg - event) / 720) - Math.floor((start - event) / 720);
}
