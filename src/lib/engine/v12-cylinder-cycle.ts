import { V12_VALVE_CYCLES, v12CylinderValveState } from './v12-valve-events';

export interface V12CycleCase {
	id: string;
	label: string;
	pistonId: string;
	rpm: number;
	compressionRatio: number;
	gasConstantJPerKgK: number;
	gamma: number;
	intakePressurePa: number;
	intakeTemperatureK: number;
	exhaustPressurePa: number;
	exhaustTemperatureK: number;
	dischargeCoefficient: number;
	valveAreaScale: number;
	heatInputPerCycleJ: number;
	burnStartDeg: number;
	burnDurationDeg: number;
	wiebeShape: number;
	wiebeExponent: number;
	wallTemperatureK: number;
	wallCoefficientWPerM2K: number;
}
export const V12_CYCLE_GEOMETRY = Object.freeze({ boreM: 0.085, strokeM: 0.1, rodLengthM: 0.125 });
export const DEFAULT_V12_CYCLE_CASE: Readonly<V12CycleCase> = Object.freeze({
	id: 'source-v12-air-standard-1800-v1',
	label: 'Air-standard reference case',
	pistonId: 'v12-0003',
	rpm: 1800,
	compressionRatio: 16,
	gasConstantJPerKgK: 287.05,
	gamma: 1.4,
	intakePressurePa: 110000,
	intakeTemperatureK: 320,
	exhaustPressurePa: 120000,
	exhaustTemperatureK: 650,
	dischargeCoefficient: 0.65,
	valveAreaScale: 1,
	heatInputPerCycleJ: 950,
	burnStartDeg: -4,
	burnDurationDeg: 74,
	wiebeShape: 6.9,
	wiebeExponent: 3,
	wallTemperatureK: 450,
	wallCoefficientWPerM2K: 250
});
export const V12_CYCLE_PROVENANCE = Object.freeze({
	model: 'Single-zone open-cylinder air-standard mass/internal-energy ODE',
	geometry:
		'Purchased 85 mm bore,100 mm stroke,125 mm rod; measured source-profile valve curtain areas and corrected events',
	clearance:
		'Case compression ratio defines an assumed clearance volume; independent of the truncated rendering occupancy',
	assumptions: [
		'Uniform ideal air with constant R and heat-capacity ratio; no species or chemical reactions',
		'Heat input replaces combustion; no fuel mass is added to the air-standard working fluid',
		'Declared normalized Wiebe heat release; not fuel, ignition-delay or combustion calibration',
		'Fixed inlet/exhaust reservoirs and assumed discharge coefficient; compressible choked flow, including reverse flow',
		'Constant wall temperature and heat-transfer coefficient over an equivalent cylindrical surface',
		'No friction, turbo matching, manifold dynamics, blowby or acoustic model',
		'Steady passage visualizations are separate reference fields and do not solve these cylinder boundary conditions'
	],
	sources: [
		{
			title: 'Cantera control-volume mass and internal-energy equations',
			url: 'https://cantera.org/stable/reference/reactors/controlreactor.html'
		},
		{
			title: 'NASA Glenn compressible mass-flow and choking equations',
			url: 'https://www.grc.nasa.gov/www/k-12/BGP/mflchk.html'
		}
	],
	status: 'Numerically verified declared case; no calibrated production-performance claim'
});
export interface V12CycleState {
	massKg: number;
	internalEnergyJ: number;
}
export interface V12CycleSample extends V12CycleState {
	angleDeg: number;
	pressurePa: number;
	volumeM3: number;
	temperatureK: number;
	intakeMassFlowKgS: number;
	exhaustMassFlowKgS: number;
	intakeAreaM2: number;
	exhaustAreaM2: number;
	heatReleaseJPerDeg: number;
	wallHeatIntoGasJPerDeg: number;
}
export interface V12CycleBalance {
	massIntakeKg: number;
	massExhaustKg: number;
	enthalpyIntakeJ: number;
	enthalpyExhaustJ: number;
	heatInputJ: number;
	wallHeatIntoGasJ: number;
	workByGasJ: number;
	massChangeKg: number;
	internalEnergyChangeJ: number;
	massResidualKg: number;
	energyResidualJ: number;
}
export interface V12CycleSolution {
	scenario: V12CycleCase;
	stepDeg: number;
	samples: V12CycleSample[];
	balance: V12CycleBalance;
	periodic: {
		converged: boolean;
		cycles: number;
		relativeMassChange: number;
		relativeEnergyChange: number;
	};
	summary: {
		peakPressurePa: number;
		peakPressureAngleDeg: number;
		peakTemperatureK: number;
		minPressurePa: number;
		minTemperatureK: number;
		indicatedWorkPerCylinderJ: number;
		indicatedMeanEffectivePressurePa: number;
		intakeReverseFlowKg: number;
		exhaustReverseFlowKg: number;
	};
}
const phase = (angle: number) => ((angle % 720) + 720) % 720;

/** Exact measured slider-crank displacement; derivatives are with respect to crank degrees. */
export function v12CycleVolume(angleDeg: number, compressionRatio = 16) {
	const { boreM: b, strokeM: s, rodLengthM: l } = V12_CYCLE_GEOMETRY,
		r = s / 2,
		area = (Math.PI * b * b) / 4;
	const theta = (angleDeg * Math.PI) / 180,
		sin = Math.sin(theta),
		cos = Math.cos(theta),
		root = Math.sqrt(l * l - r * r * sin * sin);
	const displacement = r * (1 - cos) + l - root;
	const clearanceM3 = (area * s) / (compressionRatio - 1);
	return {
		volumeM3: clearanceM3 + area * displacement,
		volumeDerivativeM3PerDeg: (area * (r * sin + (r * r * sin * cos) / root) * Math.PI) / 180,
		clearanceM3,
		sweptM3: area * s,
		wallAreaM2: 2 * area + Math.PI * b * (displacement + clearanceM3 / area)
	};
}

/** Isentropic orifice model. Signed positive flow/enthalpy enters the cylinder from the named reservoir. */
export function v12ReservoirFlow(
	pressurePa: number,
	temperatureK: number,
	reservoirPressurePa: number,
	reservoirTemperatureK: number,
	areaM2: number,
	dischargeCoefficient = 0.65,
	gamma = 1.4,
	gasConstantJPerKgK = 287.05
) {
	if (areaM2 <= 0 || pressurePa === reservoirPressurePa)
		return { massFlowKgS: 0, enthalpyFlowW: 0, choked: false };
	const into = reservoirPressurePa > pressurePa,
		up = into ? reservoirPressurePa : pressurePa,
		down = into ? pressurePa : reservoirPressurePa;
	const temperature = into ? reservoirTemperatureK : temperatureK,
		critical = (2 / (gamma + 1)) ** (gamma / (gamma - 1));
	const ratio = Math.max(down / up, critical),
		log = Math.log(ratio);
	const factor = Math.sqrt(
		((2 * gamma) / (gamma - 1)) *
			Math.exp((2 / gamma) * log) *
			-Math.expm1(((gamma - 1) / gamma) * log)
	);
	const magnitude =
		((dischargeCoefficient * areaM2 * up) / Math.sqrt(gasConstantJPerKgK * temperature)) * factor;
	const massFlowKgS = into ? magnitude : -magnitude,
		cp = (gamma * gasConstantJPerKgK) / (gamma - 1);
	return {
		massFlowKgS,
		enthalpyFlowW: massFlowKgS * cp * temperature,
		choked: down / up <= critical
	};
}

/** Normalized finite-duration heat release: its720° integral equals the declared heat input. */
export function v12CycleHeatRelease(angleDeg: number, scenario: Readonly<V12CycleCase>) {
	const elapsed = phase(angleDeg - scenario.burnStartDeg),
		x = elapsed / scenario.burnDurationDeg;
	if (x <= 0 || x >= 1 || scenario.heatInputPerCycleJ === 0) return 0;
	const a = scenario.wiebeShape,
		n = scenario.wiebeExponent;
	return (
		(((scenario.heatInputPerCycleJ * a * n) / scenario.burnDurationDeg) *
			x ** (n - 1) *
			Math.exp(-a * x ** n)) /
		-Math.expm1(-a)
	);
}

/** Exact integral avoids losing the finite Wiebe tail at a numerical step boundary. */
export function v12CycleHeatBetween(
	startDeg: number,
	endDeg: number,
	scenario: Readonly<V12CycleCase>
) {
	const primitive = (theta: number) => {
		const relative = theta - scenario.burnStartDeg;
		const x = Math.min(1, phase(relative) / scenario.burnDurationDeg);
		const fraction =
			-Math.expm1(-scenario.wiebeShape * x ** scenario.wiebeExponent) /
			-Math.expm1(-scenario.wiebeShape);
		return scenario.heatInputPerCycleJ * (Math.floor(relative / 720) + fraction);
	};
	return primitive(endDeg) - primitive(startDeg);
}

function validate(s: Readonly<V12CycleCase>, stepDeg: number) {
	for (const [key, value] of Object.entries(s))
		if (typeof value === 'number' && !Number.isFinite(value))
			throw new RangeError(`Nonfinite cycle parameter: ${key}`);
	if (
		s.rpm <= 0 ||
		s.compressionRatio <= 1 ||
		s.gamma <= 1 ||
		s.gamma > 2 ||
		s.gasConstantJPerKgK <= 0 ||
		s.intakePressurePa <= 0 ||
		s.exhaustPressurePa <= 0 ||
		s.intakeTemperatureK <= 0 ||
		s.exhaustTemperatureK <= 0 ||
		s.dischargeCoefficient <= 0 ||
		s.dischargeCoefficient > 1 ||
		s.valveAreaScale < 0 ||
		s.heatInputPerCycleJ < 0 ||
		s.burnDurationDeg <= 0 ||
		s.burnDurationDeg >= 720 ||
		s.wiebeShape <= 0 ||
		s.wiebeExponent <= 1 ||
		s.wallTemperatureK <= 0 ||
		s.wallCoefficientWPerM2K < 0
	)
		throw new RangeError('Invalid cycle case parameters');
	if (!V12_VALVE_CYCLES.some((c) => c.pistonId === s.pistonId))
		throw new RangeError('Unknown source cylinder');
	if (
		!Number.isFinite(stepDeg) ||
		stepDeg <= 0 ||
		stepDeg > 1 ||
		Math.abs(720 / stepDeg - Math.round(720 / stepDeg)) > 1e-8
	)
		throw new RangeError('Cycle step must divide720° and be at most1°');
}
function derivative(theta: number, state: V12CycleState, s: Readonly<V12CycleCase>, tdc: number) {
	if (
		!(state.massKg > 0 && state.internalEnergyJ > 0) ||
		!Number.isFinite(state.massKg + state.internalEnergyJ)
	)
		throw new RangeError('Nonpositive cycle state; refine integration step');
	const cv = s.gasConstantJPerKgK / (s.gamma - 1),
		temperatureK = state.internalEnergyJ / (state.massKg * cv),
		volume = v12CycleVolume(theta, s.compressionRatio);
	const pressurePa = ((s.gamma - 1) * state.internalEnergyJ) / volume.volumeM3;
	const valves = v12CylinderValveState(s.pistonId, theta + tdc),
		intakeAreaM2 = valves.intake.curtainAreaMm2 * 1e-6 * s.valveAreaScale,
		exhaustAreaM2 = valves.exhaust.curtainAreaMm2 * 1e-6 * s.valveAreaScale;
	const intake = v12ReservoirFlow(
			pressurePa,
			temperatureK,
			s.intakePressurePa,
			s.intakeTemperatureK,
			intakeAreaM2,
			s.dischargeCoefficient,
			s.gamma,
			s.gasConstantJPerKgK
		),
		exhaust = v12ReservoirFlow(
			pressurePa,
			temperatureK,
			s.exhaustPressurePa,
			s.exhaustTemperatureK,
			exhaustAreaM2,
			s.dischargeCoefficient,
			s.gamma,
			s.gasConstantJPerKgK
		);
	const speed = 6 * s.rpm,
		heat = v12CycleHeatRelease(theta, s),
		wall =
			(s.wallCoefficientWPerM2K * volume.wallAreaM2 * (s.wallTemperatureK - temperatureK)) / speed,
		work = pressurePa * volume.volumeDerivativeM3PerDeg;
	const ledger = [
		intake.massFlowKgS / speed,
		exhaust.massFlowKgS / speed,
		intake.enthalpyFlowW / speed,
		exhaust.enthalpyFlowW / speed,
		heat,
		wall,
		work
	];
	return {
		dm: ledger[0] + ledger[1],
		dU: heat + wall - work + ledger[2] + ledger[3],
		ledger,
		sample: {
			angleDeg: theta,
			...state,
			pressurePa,
			volumeM3: volume.volumeM3,
			temperatureK,
			intakeMassFlowKgS: intake.massFlowKgS,
			exhaustMassFlowKgS: exhaust.massFlowKgS,
			intakeAreaM2,
			exhaustAreaM2,
			heatReleaseJPerDeg: heat,
			wallHeatIntoGasJPerDeg: wall
		} satisfies V12CycleSample
	};
}
export function v12CycleInitialState(s: Readonly<V12CycleCase>): V12CycleState {
	const volume = v12CycleVolume(0, s.compressionRatio),
		mass =
			(s.intakePressurePa * (volume.clearanceM3 + volume.sweptM3)) /
			(s.gasConstantJPerKgK * s.intakeTemperatureK);
	return {
		massKg: mass,
		internalEnergyJ:
			((mass * s.gasConstantJPerKgK) / (s.gamma - 1)) *
			s.intakeTemperatureK *
			s.compressionRatio ** (s.gamma - 1)
	};
}

/** Deterministic RK4 over one cycle with independently accumulated signed mass/energy transfers. */
export function integrateV12CylinderCycle(
	scenario: Readonly<V12CycleCase> = DEFAULT_V12_CYCLE_CASE,
	options: { stepDeg?: number; initialState?: V12CycleState } = {}
): V12CycleSolution {
	const step = options.stepDeg ?? 0.125;
	validate(scenario, step);
	const tdc = V12_VALVE_CYCLES.find(
		(c) => c.pistonId === scenario.pistonId
	)!.compressionTdcCrankDeg;
	const initial = options.initialState ?? v12CycleInitialState(scenario);
	let state = { ...initial };
	const sums = Array<number>(7).fill(0),
		samples: V12CycleSample[] = [];
	let intakeReverse = 0,
		exhaustReverse = 0;
	for (let index = 0; index < Math.round(720 / step); index++) {
		const theta = index * step,
			k1 = derivative(theta, state, scenario, tdc);
		samples.push(k1.sample);
		const advance = (k: ReturnType<typeof derivative>, h: number) => ({
			massKg: state.massKg + k.dm * h,
			internalEnergyJ: state.internalEnergyJ + k.dU * h
		});
		const k2 = derivative(theta + step / 2, advance(k1, step / 2), scenario, tdc),
			k3 = derivative(theta + step / 2, advance(k2, step / 2), scenario, tdc),
			k4 = derivative(theta + step, advance(k3, step), scenario, tdc);
		const stages = [k1, k2, k3, k4],
			weights = [1, 2, 2, 1];
		const exactHeat = v12CycleHeatBetween(theta, theta + step, scenario);
		const heatCorrection =
			exactHeat - (step / 6) * (k1.ledger[4] + 2 * k2.ledger[4] + 2 * k3.ledger[4] + k4.ledger[4]);
		state = {
			massKg: state.massKg + (step / 6) * (k1.dm + 2 * k2.dm + 2 * k3.dm + k4.dm),
			internalEnergyJ:
				state.internalEnergyJ +
				(step / 6) * (k1.dU + 2 * k2.dU + 2 * k3.dU + k4.dU) +
				heatCorrection
		};
		stages.forEach((k, i) => {
			const h = (step / 6) * weights[i];
			k.ledger.forEach((x, j) => (sums[j] += h * x));
			intakeReverse += h * Math.max(0, -k.ledger[0]);
			exhaustReverse += h * Math.max(0, k.ledger[1]);
		});
		sums[4] += heatCorrection;
	}
	samples.push(derivative(720, state, scenario, tdc).sample);
	const [
		massIntakeKg,
		massExhaustKg,
		enthalpyIntakeJ,
		enthalpyExhaustJ,
		heatInputJ,
		wallHeatIntoGasJ,
		workByGasJ
	] = sums;
	const massChangeKg = state.massKg - initial.massKg,
		internalEnergyChangeJ = state.internalEnergyJ - initial.internalEnergyJ;
	const balance = {
		massIntakeKg,
		massExhaustKg,
		enthalpyIntakeJ,
		enthalpyExhaustJ,
		heatInputJ,
		wallHeatIntoGasJ,
		workByGasJ,
		massChangeKg,
		internalEnergyChangeJ,
		massResidualKg: massChangeKg - massIntakeKg - massExhaustKg,
		energyResidualJ:
			internalEnergyChangeJ -
			(heatInputJ + wallHeatIntoGasJ - workByGasJ + enthalpyIntakeJ + enthalpyExhaustJ)
	};
	const peak = samples.reduce((a, b) => (b.pressurePa > a.pressurePa ? b : a));
	return {
		scenario: { ...scenario },
		stepDeg: step,
		samples,
		balance,
		periodic: {
			converged: false,
			cycles: 1,
			relativeMassChange: Math.abs(massChangeKg) / initial.massKg,
			relativeEnergyChange: Math.abs(internalEnergyChangeJ) / initial.internalEnergyJ
		},
		summary: {
			peakPressurePa: peak.pressurePa,
			peakPressureAngleDeg: peak.angleDeg,
			peakTemperatureK: Math.max(...samples.map((s) => s.temperatureK)),
			minPressurePa: Math.min(...samples.map((s) => s.pressurePa)),
			minTemperatureK: Math.min(...samples.map((s) => s.temperatureK)),
			indicatedWorkPerCylinderJ: workByGasJ,
			indicatedMeanEffectivePressurePa:
				workByGasJ / v12CycleVolume(0, scenario.compressionRatio).sweptM3,
			intakeReverseFlowKg: intakeReverse,
			exhaustReverseFlowKg: exhaustReverse
		}
	};
}

/** Fixed-point periodic state; a nonconverged result is returned explicitly, never silently certified. */
export function solveV12PeriodicCycle(
	scenario: Readonly<V12CycleCase> = DEFAULT_V12_CYCLE_CASE,
	options: {
		stepDeg?: number;
		tolerance?: number;
		maxCycles?: number;
		initialState?: V12CycleState;
	} = {}
): V12CycleSolution {
	const tolerance = options.tolerance ?? 1e-8,
		maxCycles = options.maxCycles ?? 40;
	if (
		!(tolerance > 0 && Number.isFinite(tolerance)) ||
		!Number.isInteger(maxCycles) ||
		maxCycles < 1
	)
		throw new RangeError('Invalid periodic convergence request');
	let initial = options.initialState,
		result: V12CycleSolution | null = null;
	for (let cycles = 1; cycles <= maxCycles; cycles++) {
		result = integrateV12CylinderCycle(scenario, {
			stepDeg: options.stepDeg,
			initialState: initial
		});
		result.periodic.cycles = cycles;
		result.periodic.converged =
			Math.max(result.periodic.relativeMassChange, result.periodic.relativeEnergyChange) <
			tolerance;
		if (result.periodic.converged) return result;
		const last = result.samples.at(-1)!;
		initial = { massKg: last.massKg, internalEnergyJ: last.internalEnergyJ };
	}
	return result!;
}

/** Hermite interpolation of conserved state using ODE endpoint slopes; ideal-gas p/T are recomputed. */
export function sampleV12CylinderCycle(
	solution: Pick<V12CycleSolution, 'samples' | 'scenario'>,
	angleDeg: number
): V12CycleSample {
	if (!Number.isFinite(angleDeg)) throw new RangeError('Finite cycle angle required');
	const angle = phase(angleDeg),
		step = 720 / (solution.samples.length - 1),
		i = Math.min(solution.samples.length - 2, Math.floor(angle / step)),
		a = solution.samples[i],
		b = solution.samples[i + 1],
		f = (angle - a.angleDeg) / (b.angleDeg - a.angleDeg);
	const lerp = (key: keyof V12CycleSample) => a[key] + (b[key] - a[key]) * f;
	const scenario = solution.scenario;
	const slopes = (sample: V12CycleSample) => {
		const speed = 6 * scenario.rpm;
		const cp = (scenario.gamma * scenario.gasConstantJPerKgK) / (scenario.gamma - 1);
		const hi =
			sample.intakeMassFlowKgS *
			cp *
			(sample.intakeMassFlowKgS > 0 ? scenario.intakeTemperatureK : sample.temperatureK);
		const he =
			sample.exhaustMassFlowKgS *
			cp *
			(sample.exhaustMassFlowKgS > 0 ? scenario.exhaustTemperatureK : sample.temperatureK);
		return {
			massKg: (sample.intakeMassFlowKgS + sample.exhaustMassFlowKgS) / speed,
			internalEnergyJ:
				sample.heatReleaseJPerDeg +
				sample.wallHeatIntoGasJPerDeg -
				sample.pressurePa *
					v12CycleVolume(sample.angleDeg, scenario.compressionRatio).volumeDerivativeM3PerDeg +
				(hi + he) / speed
		};
	};
	const da = slopes(a),
		db = slopes(b);
	const hermite = (key: 'massKg' | 'internalEnergyJ') =>
		(2 * f ** 3 - 3 * f ** 2 + 1) * a[key] +
		(f ** 3 - 2 * f ** 2 + f) * step * da[key] +
		(-2 * f ** 3 + 3 * f ** 2) * b[key] +
		(f ** 3 - f ** 2) * step * db[key];
	const massKg = hermite('massKg'),
		internalEnergyJ = hermite('internalEnergyJ'),
		volumeM3 = v12CycleVolume(angle, solution.scenario.compressionRatio).volumeM3;
	return {
		angleDeg: angle,
		massKg,
		internalEnergyJ,
		volumeM3,
		pressurePa: ((solution.scenario.gamma - 1) * internalEnergyJ) / volumeM3,
		temperatureK:
			internalEnergyJ /
			((massKg * solution.scenario.gasConstantJPerKgK) / (solution.scenario.gamma - 1)),
		intakeMassFlowKgS: lerp('intakeMassFlowKgS'),
		exhaustMassFlowKgS: lerp('exhaustMassFlowKgS'),
		intakeAreaM2: lerp('intakeAreaM2'),
		exhaustAreaM2: lerp('exhaustAreaM2'),
		heatReleaseJPerDeg: lerp('heatReleaseJPerDeg'),
		wallHeatIntoGasJPerDeg: lerp('wallHeatIntoGasJPerDeg')
	};
}
