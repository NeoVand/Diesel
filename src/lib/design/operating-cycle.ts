/** A prescribed pressure trace and planar rigid-body load model, NOT a combustion solver.
 * SI dynamics; authored geometry enters in mm. Phase 0 is compression/firing TDC.
 */
import {
	DESIGN_MATERIAL,
	DESIGN_LIMITS,
	ROD_INTERFACES,
	profileAreaMm2,
	sliderCrankSample,
	validateDesign,
	type DesignParams
} from './design-core';
import type { StructuralInertia, StructuralRequest } from './structural';

export type PlanarVector = [number, number];
export interface OperatingScenario {
	label?: string;
	rpm: number;
	pistonMassKg: number;
	intakePressureBar: number;
	exhaustPressureBar: number;
	crankcasePressureBar: number;
	compressionRatio: number;
	polytropicExponent: number;
	combustionRiseBar: number;
	combustionCentreDeg: number;
	combustionWidthDeg: number;
}
export const DEFAULT_OPERATING_SCENARIO: Readonly<OperatingScenario> = Object.freeze({
	label: 'Illustrative reference',
	rpm: 1800,
	pistonMassKg: 0.85,
	intakePressureBar: 1.1,
	exhaustPressureBar: 1.2,
	crankcasePressureBar: 1,
	compressionRatio: 16,
	polytropicExponent: 1.3,
	combustionRiseBar: 30,
	combustionCentreDeg: 10,
	combustionWidthDeg: 18
});
export const OPERATING_BOUNDS: Record<
	Exclude<keyof OperatingScenario, 'label'>,
	{ min: number; max: number; step: number }
> = {
	rpm: { min: 0, max: 3600, step: 50 },
	pistonMassKg: { min: 0, max: 5, step: 0.05 },
	intakePressureBar: { min: 0.5, max: 3, step: 0.05 },
	exhaustPressureBar: { min: 0.5, max: 4, step: 0.05 },
	crankcasePressureBar: { min: 0.5, max: 2, step: 0.05 },
	compressionRatio: { min: 10, max: 22, step: 0.5 },
	polytropicExponent: { min: 1.15, max: 1.4, step: 0.01 },
	combustionRiseBar: { min: 0, max: 100, step: 1 },
	combustionCentreDeg: { min: -10, max: 35, step: 1 },
	combustionWidthDeg: { min: 5, max: 40, step: 1 }
};
export interface RodMassProperties {
	massKg: number;
	volumeMm3: number;
	centreOfMassMm: [number, number, number];
	/** Polar mass moment about the centre of mass, parallel to bearing axes. */
	inertiaZKgM2: number;
	method: string;
}
export interface OperatingSample {
	angleDeg: number;
	pressureBar: number;
	/** Positive along the cylinder towards the crank; cylinder minus crankcase pressure. */
	gasForceN: number;
	pistonDisplacementMm: number;
	pistonPositionMm: PlanarVector;
	crankPinMm: PlanarVector;
	pistonVelocityMps: number;
	/** Signed along global bore-up Y, not displacement-from-TDC. */
	pistonAccelerationMps2: number;
	rodAngularVelocityRadS: number;
	rodAngularAccelerationRadS2: number;
	rodCentreAccelerationMps2: PlanarVector;
	rodCentreVelocityMps: PlanarVector;
	/** Global X right / Y bore-up; endpoint forces act ON the rod. */
	smallEndForceOnRodN: PlanarVector;
	bigEndForceOnRodN: PlanarVector;
	/** Local Y big→small, X crank-plane width, Z bearing axis. Negative Y is compression. */
	smallEndForceLocalN: [number, number, number];
	bigEndForceLocalN: [number, number, number];
	smallEndAxialForceN: number;
	pistonSideForceN: number;
	/** Positive torque drives the increasing crank-angle (clockwise) direction. */
	crankTorqueNm: number;
	kineticEnergyJ: number;
	inertia: StructuralInertia;
	forceResidualN: PlanarVector;
	momentResidualNm: number;
	pistonResidualN: number;
	forceBalanceRelative: number;
	momentBalanceRelative: number;
	/** Nominal axial + in-plane bending over the uniform shank only. */
	nominalStressMpa: number;
	criticalSectionMm: number;
}
export interface OperatingEnvelope {
	maxCompressionN: number;
	maxTensionN: number;
	compressionAngleDeg: number;
	tensionAngleDeg: number;
	compressionSampleIndex: number;
	tensionSampleIndex: number;
	maxSmallEndResultantN: number;
	maxBigEndResultantN: number;
	maxPressureBar: number;
	peakPressureAngleDeg: number;
	peakNominalStressMpa: number;
	stressAngleDeg: number;
	stressSectionMm: number;
	stressSampleIndex: number;
	maxForceBalanceRelative: number;
	maxMomentBalanceRelative: number;
}
export interface OperatingCycle {
	schemaVersion: 'illustrative-operating-cycle-v1';
	params: DesignParams;
	scenario: OperatingScenario;
	rodMassProperties: RodMassProperties;
	samples: OperatingSample[];
	envelope: OperatingEnvelope;
	metadata: {
		pressureModel: string;
		phaseConvention: string;
		assumptions: string[];
		limitations: string[];
	};
}
export interface OperatingDesignScreen {
	params: DesignParams;
	massKg: number;
	cycles: OperatingCycle[];
	peakNominalStressMpa: number;
	allowableNominalStressMpa: number;
	utilization: number;
	passesNominalScreen: boolean;
	criticalScenarioIndex: number;
	criticalAngleDeg: number;
	criticalSectionMm: number;
	maxCompressionN: number;
	maxTensionN: number;
	scope: string;
}

export function validateOperatingScenario(scenario: OperatingScenario): string[] {
	return (Object.keys(OPERATING_BOUNDS) as (keyof typeof OPERATING_BOUNDS)[])
		.filter(
			(key) =>
				!Number.isFinite(scenario[key]) ||
				scenario[key] < OPERATING_BOUNDS[key].min ||
				scenario[key] > OPERATING_BOUNDS[key].max
		)
		.map(
			(key) =>
				`${key} must be between ${OPERATING_BOUNDS[key].min} and ${OPERATING_BOUNDS[key].max}.`
		);
}

const cross = (a: PlanarVector, b: PlanarVector) => a[0] * b[1] - a[1] * b[0];
const dot = (a: PlanarVector, b: PlanarVector) => a[0] * b[0] + a[1] * b[1];
const norm = (a: PlanarVector) => Math.hypot(...a);
const smooth = (x: number) => {
	const t = Math.max(0, Math.min(1, x));
	return t * t * (3 - 2 * t);
};

/** Moments of the positive-Y half-disc intersected by a centred width-w strip. */
function overlapMoments(radius: number, width: number) {
	const a = Math.min(width / 2, radius),
		angle = Math.asin(a / radius);
	const area = a * Math.sqrt(radius ** 2 - a ** 2) + radius ** 2 * angle;
	const firstY = a * radius ** 2 - a ** 3 / 3;
	const secondX = radius ** 4 * (angle / 4 - Math.sin(4 * angle) / 16);
	const secondY = radius ** 4 * (angle / 4 + Math.sin(2 * angle) / 6 + Math.sin(4 * angle) / 48);
	return { area, firstY, secondX, secondY, polar: secondX + secondY };
}
function layers(p: DesignParams) {
	return [
		{ width: p.webMm, depth: p.rodDepthMm - 2 * p.flangeMm },
		{ width: p.rodWidthMm, depth: 2 * p.flangeMm }
	];
}

/** Exact planar-union integrals of the SAME three-layer solid exported as STEP. */
export function rodMassProperties(p: DesignParams): RodMassProperties {
	const {
		bigEndOuterRadiusMm: rb,
		smallEndOuterRadiusMm: rs,
		bigEndInnerRadiusMm: hb,
		smallEndInnerRadiusMm: hs
	} = ROD_INTERFACES;
	const l = p.rodLengthMm;
	let volume = 0,
		first = 0,
		polar = 0;
	for (const { width: w, depth } of layers(p)) {
		const b = overlapMoments(rb, w),
			s = overlapMoments(rs, w);
		volume += profileAreaMm2(w, l) * depth;
		first +=
			((w * l ** 2) / 2 + Math.PI * (rs ** 2 - hs ** 2) * l - b.firstY - l * s.area + s.firstY) *
			depth;
		polar +=
			((w * l ** 3) / 3 +
				(l * w ** 3) / 12 +
				(Math.PI / 2) * (rb ** 4 + rs ** 4 - hb ** 4 - hs ** 4) +
				Math.PI * (rs ** 2 - hs ** 2) * l ** 2 -
				b.polar -
				s.polar -
				l ** 2 * s.area +
				2 * l * s.firstY) *
			depth;
	}
	const cy = first / volume,
		density = DESIGN_MATERIAL.densityKgPerMm3;
	return {
		massKg: volume * density,
		volumeMm3: volume,
		centreOfMassMm: [0, cy, 0],
		inertiaZKgM2: density * (polar - volume * cy ** 2) * 1e-6,
		method:
			'Analytical area, first and second moments of the authored disc/rectangle union, less through-bores; exact layer thicknesses.'
	};
}

/** Assumed polytropic compression plus an imposed Gaussian firing pulse and smooth gas exchange.
 * No heat-release integration, valve-flow prediction, combustion efficiency or calibrated output.
 */
export function cylinderPressureBar(
	p: DesignParams,
	scenario: OperatingScenario,
	angleDeg: number
): number {
	const phase = ((angleDeg % 720) + 720) % 720;
	const displacement = sliderCrankSample({ ...p, rpm: scenario.rpm }, phase).displacementMm;
	const volumeRatio =
		scenario.compressionRatio / (1 + ((scenario.compressionRatio - 1) * displacement) / p.strokeMm);
	const pulseAngle = ((((phase - scenario.combustionCentreDeg + 360) % 720) + 720) % 720) - 360;
	const closed =
		scenario.intakePressureBar * volumeRatio ** scenario.polytropicExponent +
		scenario.combustionRiseBar * Math.exp(-0.5 * (pulseAngle / scenario.combustionWidthDeg) ** 2);
	const exhaust = scenario.exhaustPressureBar,
		intake = scenario.intakePressureBar;
	if (phase < 160 || phase >= 560) return closed;
	if (phase < 200) return closed + (exhaust - closed) * smooth((phase - 160) / 40);
	if (phase < 340) return exhaust;
	if (phase < 380) return exhaust + (intake - exhaust) * smooth((phase - 340) / 40);
	if (phase < 520) return intake;
	return intake + (closed - intake) * smooth((phase - 520) / 40);
}

/** Mass moments of the rod portion from the big eye through a free-shank section. */
function lowerSegmentMoments(p: DesignParams, sectionMm: number) {
	const { bigEndOuterRadiusMm: r, bigEndInnerRadiusMm: h } = ROD_INTERFACES;
	let mass = 0,
		firstY = 0,
		secondX = 0,
		secondY = 0;
	const rho = DESIGN_MATERIAL.densityKgPerMm3;
	for (const { width: w, depth } of layers(p)) {
		const overlap = overlapMoments(r, w),
			factor = depth * rho;
		mass += (Math.PI * (r * r - h * h) + w * sectionMm - overlap.area) * factor;
		firstY += ((w * sectionMm ** 2) / 2 - overlap.firstY) * factor * 1e-3;
		secondX +=
			((Math.PI / 4) * (r ** 4 - h ** 4) + (sectionMm * w ** 3) / 12 - overlap.secondX) *
			factor *
			1e-6;
		secondY +=
			((Math.PI / 4) * (r ** 4 - h ** 4) + (w * sectionMm ** 3) / 3 - overlap.secondY) *
			factor *
			1e-6;
	}
	return { sectionMm, mass, firstY, secondX, secondY };
}
export interface OperatingSectionResult {
	sectionMm: number;
	axialForceN: number;
	shearForceN: number;
	bendingMomentNm: number;
	nominalStressMpa: number;
}

/** Newton-Euler balance of the actual rod mass below this cut. Only a nominal shank stress. */
export function operatingSectionResult(
	p: DesignParams,
	sample: OperatingSample,
	sectionMm: number,
	mass = rodMassProperties(p)
): OperatingSectionResult {
	const low = ROD_INTERFACES.bigEndOuterRadiusMm,
		high = p.rodLengthMm - ROD_INTERFACES.smallEndOuterRadiusMm;
	if (sectionMm < low || sectionMm > high)
		throw new RangeError('The nominal section must lie within the uniform free shank.');
	const segment = lowerSegmentMoments(p, sectionMm),
		s = sectionMm / 1000,
		c = mass.centreOfMassMm[1] / 1000;
	const [aox, aoy] = sample.inertia.originAccelerationMps2,
		alpha = sample.rodAngularAccelerationRadS2,
		omega = sample.rodAngularVelocityRadS;
	const agx = aox - alpha * c,
		agy = aoy - omega ** 2 * c;
	const fx = agx * segment.mass - alpha * (segment.firstY - c * segment.mass);
	const fy = agy * segment.mass - omega ** 2 * (segment.firstY - c * segment.mass);
	const inertialMoment =
		alpha * (segment.secondX + segment.secondY - (s + c) * segment.firstY + s * c * segment.mass) -
		agx * (segment.firstY - s * segment.mass);
	const shearForceN = fx - sample.bigEndForceLocalN[0],
		axialForceN = fy - sample.bigEndForceLocalN[1];
	const bendingMomentNm = inertialMoment - s * sample.bigEndForceLocalN[0];
	const b = p.rodWidthMm,
		t = p.flangeMm,
		h = p.rodDepthMm,
		w = p.webMm;
	const area = 2 * b * t + w * (h - 2 * t),
		inertia = (2 * t * b ** 3 + (h - 2 * t) * w ** 3) / 12;
	return {
		sectionMm,
		axialForceN,
		shearForceN,
		bendingMomentNm,
		nominalStressMpa:
			Math.abs(axialForceN) / area + (Math.abs(bendingMomentNm) * 1000 * (b / 2)) / inertia
	};
}

/** Direct Newton-Euler solution; pressure inputs are absolute bar. Useful independently of the trace. */
export function solveRodDynamics(
	p: DesignParams,
	angleDeg: number,
	rpm: number,
	pistonMassKg: number,
	pressureBar: number,
	crankcasePressureBar: number,
	mass = rodMassProperties(p)
): OperatingSample {
	if (
		![angleDeg, rpm, pistonMassKg, pressureBar, crankcasePressureBar].every(Number.isFinite) ||
		rpm < 0 ||
		pistonMassKg < 0
	)
		throw new RangeError('Finite nonnegative speed and piston mass are required.');
	const k = sliderCrankSample({ ...p, rpm }, angleDeg),
		theta = (angleDeg * Math.PI) / 180;
	const r = p.strokeMm / 2000,
		l = p.rodLengthMm / 1000,
		omega = (rpm * 2 * Math.PI) / 60;
	const crank: PlanarVector = [k.crankPinMm[0] / 1000, k.crankPinMm[1] / 1000];
	const piston: PlanarVector = [0, k.pistonPinMm[1] / 1000];
	const d: PlanarVector = [piston[0] - crank[0], piston[1] - crank[1]];
	const vc: PlanarVector = [r * Math.cos(theta) * omega, -r * Math.sin(theta) * omega];
	const ac: PlanarVector = [-r * Math.sin(theta) * omega ** 2, -r * Math.cos(theta) * omega ** 2];
	const vp: PlanarVector = [0, -k.velocityMps],
		ap: PlanarVector = [0, -k.accelerationMps2];
	const dv: PlanarVector = [vp[0] - vc[0], vp[1] - vc[1]],
		da: PlanarVector = [ap[0] - ac[0], ap[1] - ac[1]];
	const rodOmega = cross(d, dv) / l ** 2,
		alpha = cross(d, da) / l ** 2;
	const lambda = mass.centreOfMassMm[1] / p.rodLengthMm;
	const ag: PlanarVector = [ac[0] + lambda * da[0], ac[1] + lambda * da[1]];
	const vg: PlanarVector = [vc[0] + lambda * dv[0], vc[1] + lambda * dv[1]];
	const gas = ((pressureBar - crankcasePressureBar) * 1e5 * Math.PI * (p.boreMm / 1000) ** 2) / 4;
	const fpy = -gas - pistonMassKg * ap[1];
	const fpx = (d[0] * fpy - mass.inertiaZKgM2 * alpha - lambda * mass.massKg * cross(d, ag)) / d[1];
	const fp: PlanarVector = [fpx, fpy],
		fc: PlanarVector = [mass.massKg * ag[0] - fpx, mass.massKg * ag[1] - fpy];
	const u: PlanarVector = [d[0] / l, d[1] / l],
		ex: PlanarVector = [u[1], -u[0]];
	const local = (v: PlanarVector): [number, number, number] => [dot(v, ex), dot(v, u), 0];
	const small = local(fp),
		big = local(fc);
	const forceResidual: PlanarVector = [
		fc[0] + fp[0] - mass.massKg * ag[0],
		fc[1] + fp[1] - mass.massKg * ag[1]
	];
	const bigMoment = cross([-lambda * d[0], -lambda * d[1]], fc);
	const smallMoment = cross([(1 - lambda) * d[0], (1 - lambda) * d[1]], fp);
	const momentResidual = bigMoment + smallMoment - mass.inertiaZKgM2 * alpha;
	const sample: OperatingSample = {
		angleDeg,
		pressureBar,
		gasForceN: gas,
		pistonDisplacementMm: k.displacementMm,
		pistonPositionMm: k.pistonPinMm,
		crankPinMm: k.crankPinMm,
		pistonVelocityMps: vp[1],
		pistonAccelerationMps2: ap[1],
		rodAngularVelocityRadS: rodOmega,
		rodAngularAccelerationRadS2: alpha,
		rodCentreAccelerationMps2: ag,
		rodCentreVelocityMps: vg,
		smallEndForceOnRodN: fp,
		bigEndForceOnRodN: fc,
		smallEndForceLocalN: small,
		bigEndForceLocalN: big,
		smallEndAxialForceN: small[1],
		pistonSideForceN: fp[0],
		crankTorqueNm: cross(crank, fc),
		kineticEnergyJ:
			0.5 *
			(pistonMassKg * dot(vp, vp) + mass.massKg * dot(vg, vg) + mass.inertiaZKgM2 * rodOmega ** 2),
		inertia: {
			originAccelerationMps2: local(ac),
			angularVelocityRadS: [0, 0, rodOmega],
			angularAccelerationRadS2: [0, 0, alpha]
		},
		forceResidualN: forceResidual,
		momentResidualNm: momentResidual,
		pistonResidualN: -gas - fpy - pistonMassKg * ap[1],
		forceBalanceRelative:
			norm(forceResidual) / Math.max(1, norm(fc), norm(fp), mass.massKg * norm(ag)),
		momentBalanceRelative:
			Math.abs(momentResidual) /
			Math.max(1, Math.abs(bigMoment), Math.abs(smallMoment), Math.abs(mass.inertiaZKgM2 * alpha)),
		nominalStressMpa: 0,
		criticalSectionMm: ROD_INTERFACES.bigEndOuterRadiusMm
	};
	const low = ROD_INTERFACES.bigEndOuterRadiusMm,
		high = p.rodLengthMm - ROD_INTERFACES.smallEndOuterRadiusMm;
	for (let i = 0; i <= 16; i++) {
		const section = operatingSectionResult(p, sample, low + ((high - low) * i) / 16, mass);
		if (section.nominalStressMpa > sample.nominalStressMpa) {
			sample.nominalStressMpa = section.nominalStressMpa;
			sample.criticalSectionMm = section.sectionMm;
		}
	}
	return sample;
}

export function createOperatingCycle(
	p: DesignParams,
	scenario: OperatingScenario = { ...DEFAULT_OPERATING_SCENARIO, rpm: p.rpm },
	sampleCount = 721
): OperatingCycle {
	const errors = [...validateDesign(p), ...validateOperatingScenario(scenario)];
	if (errors.length) throw new RangeError(errors.join(' '));
	if (!Number.isInteger(sampleCount) || sampleCount < 73 || sampleCount > 2881)
		throw new RangeError('Choose 73–2881 cycle samples.');
	const mass = rodMassProperties(p);
	const samples = Array.from({ length: sampleCount }, (_, i) => {
		const angle = (720 * i) / (sampleCount - 1);
		return solveRodDynamics(
			p,
			angle,
			scenario.rpm,
			scenario.pistonMassKg,
			cylinderPressureBar(p, scenario, angle),
			scenario.crankcasePressureBar,
			mass
		);
	});
	let compression = 0,
		tension = 0,
		pressure = 0,
		stress = 0;
	for (let i = 1; i < samples.length; i++) {
		if (samples[i].smallEndAxialForceN < samples[compression].smallEndAxialForceN) compression = i;
		if (samples[i].smallEndAxialForceN > samples[tension].smallEndAxialForceN) tension = i;
		if (samples[i].pressureBar > samples[pressure].pressureBar) pressure = i;
		if (samples[i].nominalStressMpa > samples[stress].nominalStressMpa) stress = i;
	}
	return {
		schemaVersion: 'illustrative-operating-cycle-v1',
		params: { ...p },
		scenario: { ...scenario },
		rodMassProperties: mass,
		samples,
		envelope: {
			maxCompressionN: Math.max(0, -samples[compression].smallEndAxialForceN),
			maxTensionN: Math.max(0, samples[tension].smallEndAxialForceN),
			compressionAngleDeg: samples[compression].angleDeg,
			tensionAngleDeg: samples[tension].angleDeg,
			compressionSampleIndex: compression,
			tensionSampleIndex: tension,
			maxSmallEndResultantN: Math.max(...samples.map((s) => norm(s.smallEndForceOnRodN))),
			maxBigEndResultantN: Math.max(...samples.map((s) => norm(s.bigEndForceOnRodN))),
			maxPressureBar: samples[pressure].pressureBar,
			peakPressureAngleDeg: samples[pressure].angleDeg,
			peakNominalStressMpa: samples[stress].nominalStressMpa,
			stressAngleDeg: samples[stress].angleDeg,
			stressSectionMm: samples[stress].criticalSectionMm,
			stressSampleIndex: stress,
			maxForceBalanceRelative: Math.max(...samples.map((s) => s.forceBalanceRelative)),
			maxMomentBalanceRelative: Math.max(...samples.map((s) => s.momentBalanceRelative))
		},
		metadata: {
			pressureModel:
				'Prescribed absolute pressure: polytropic compression/expansion, Gaussian firing pulse, smooth assumed gas exchange.',
			phaseConvention:
				'0° compression/firing TDC; 180° expansion BDC; 360° gas-exchange TDC; 540° intake BDC; 720° repeats. Positive crank rotation is clockwise.',
			assumptions: [
				'One rigid planar slider-crank at constant crank speed; friction, gravity, piston-pin offset and crankshaft flexibility omitted.',
				'Piston assembly mass, pressures, compression ratio and pulse shape are explicit user assumptions, not measurements of the source asset.',
				'Rod mass, centre of mass and polar inertia are integrated from the actual authored three-layer solid at assumed steel density.',
				'Gas exchange uses illustrative blend windows 160–200°, 340–380° and 520–560°, not measured valve events.',
				'Nominal shank stress uses exact rigid-body segment equilibrium at 17 sections; axial plus in-plane bending, without stress concentrations.'
			],
			limitations: [
				'This is a load study, not a combustion, efficiency, power-rating, fatigue or bearing-contact prediction.',
				'Cycle extrema are sampled; increase angular resolution before selecting final load cases.',
				'A nominal screening pass does not establish structural safety; full-solid fixture FEA has separate boundary-condition and mesh limitations.',
				'No measured pressure trace or piston mass is available for this generic engine asset.'
			]
		}
	};
}

/** Local selected-cycle force AND the rod rigid-body inertia; pressure never becomes a fictitious centre load. */
export function structuralLoadCase(
	sample: OperatingSample
): NonNullable<StructuralRequest['loadCase']> {
	return {
		forceN: [...sample.smallEndForceLocalN],
		label: `Illustrative operating cycle at ${sample.angleDeg.toFixed(1)}°; endpoint traction + rod inertia, fixed big bore`,
		inertia: {
			originAccelerationMps2: [...sample.inertia.originAccelerationMps2],
			angularVelocityRadS: [...sample.inertia.angularVelocityRadS],
			angularAccelerationRadS2: [...sample.inertia.angularAccelerationRadS2]
		}
	};
}

/** Three explicit assumed conditions, not an engine map or claimed OEM operating envelope. */
export function operatingScenarioPresets(base: OperatingScenario): OperatingScenario[] {
	return [
		{
			...base,
			label: 'Low-speed / reduced firing',
			rpm: Math.min(base.rpm, 800),
			combustionRiseBar: base.combustionRiseBar * 0.35
		},
		{ ...base, label: base.label || 'Illustrative reference' },
		{ ...base, label: 'High-speed / same pressure', rpm: Math.min(3600, Math.max(base.rpm, 3000)) }
	];
}

/** Cheap multi-condition nominal screen. Full-solid FEA must independently check selected finalists. */
export function evaluateOperatingEnvelope(
	p: DesignParams,
	scenarios: OperatingScenario[],
	sampleCount = 361
): OperatingDesignScreen {
	if (!scenarios.length || scenarios.length > 12)
		throw new RangeError('Provide 1–12 explicit operating conditions.');
	const cycles = scenarios.map((s) => createOperatingCycle(p, s, sampleCount));
	let critical = 0;
	for (let i = 1; i < cycles.length; i++)
		if (cycles[i].envelope.peakNominalStressMpa > cycles[critical].envelope.peakNominalStressMpa)
			critical = i;
	const peak = cycles[critical].envelope,
		utilization = peak.peakNominalStressMpa / DESIGN_LIMITS.maxStressMpa;
	return {
		params: { ...p },
		massKg: cycles[0].rodMassProperties.massKg,
		cycles,
		peakNominalStressMpa: peak.peakNominalStressMpa,
		allowableNominalStressMpa: DESIGN_LIMITS.maxStressMpa,
		utilization,
		passesNominalScreen: utilization <= 1,
		criticalScenarioIndex: critical,
		criticalAngleDeg: peak.stressAngleDeg,
		criticalSectionMm: peak.stressSectionMm,
		maxCompressionN: Math.max(...cycles.map((c) => c.envelope.maxCompressionN)),
		maxTensionN: Math.max(...cycles.map((c) => c.envelope.maxTensionN)),
		scope:
			'Axial + in-plane bending at free-shank sections under explicit pressure/inertia conditions. Assumed nominal allowable; excludes fatigue, bearing contact, fillet concentrations and out-of-plane loads.'
	};
}

export function screenOperatingDesigns(
	designs: DesignParams[],
	scenarios: OperatingScenario[],
	sampleCount = 361
): OperatingDesignScreen[] {
	if (designs.length > 16)
		throw new RangeError('Screen at most 16 finalists; this is not a global design optimizer.');
	return designs.map((p) => evaluateOperatingEnvelope(p, scenarios, sampleCount));
}
