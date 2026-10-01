/** Engineering study models, in mm / N / MPa unless a field explicitly says otherwise.
 * The I-section beam is a screening model of the free shank, not bearing/fillet FEA.
 */
export interface DesignParams {
	boreMm: number;
	strokeMm: number;
	rodLengthMm: number;
	rpm: number;
	rodWidthMm: number;
	rodDepthMm: number;
	webMm: number;
	flangeMm: number;
	loadKn: number;
	lateralLoadN: number;
}

export const DEFAULT_DESIGN_PARAMS: Readonly<DesignParams> = Object.freeze({
	boreMm: 85,
	strokeMm: 100,
	rodLengthMm: 125,
	rpm: 1800,
	rodWidthMm: 20,
	rodDepthMm: 16,
	webMm: 4,
	flangeMm: 3,
	loadKn: 25,
	lateralLoadN: 1000
});
export const BASELINE_DESIGN = DEFAULT_DESIGN_PARAMS;
export const DESIGN_BOUNDS: Record<keyof DesignParams, { min: number; max: number; step: number }> =
	{
		boreMm: { min: 70, max: 105, step: 1 },
		strokeMm: { min: 75, max: 125, step: 1 },
		rodLengthMm: { min: 110, max: 160, step: 1 },
		rpm: { min: 600, max: 3600, step: 50 },
		rodWidthMm: { min: 14, max: 28, step: 0.5 },
		rodDepthMm: { min: 12, max: 22, step: 0.5 },
		webMm: { min: 2, max: 6, step: 0.5 },
		flangeMm: { min: 2, max: 5, step: 0.5 },
		loadKn: { min: 5, max: 50, step: 1 },
		lateralLoadN: { min: 0, max: 2000, step: 50 }
	};
export const ROD_INTERFACES = Object.freeze({
	bigEndInnerRadiusMm: 25,
	bigEndOuterRadiusMm: 32,
	smallEndInnerRadiusMm: 9,
	smallEndOuterRadiusMm: 15
});
export const DESIGN_MATERIAL = Object.freeze({
	name: 'Assumed isotropic steel',
	youngsModulusMpa: 210000,
	densityKgPerM3: 7850,
	densityKgPerMm3: 7.85e-6,
	poissonRatio: 0.3,
	allowableStressMpa: 250
});
export const DESIGN_LIMITS = Object.freeze({
	maxStressMpa: 250,
	maxDeflectionMm: 0.015
});

export interface DesignConstraint {
	id: string;
	label: string;
	value: number;
	limit: number;
	unit: string;
	utilization: number;
	passed: boolean;
	sense: 'max' | 'min';
}
export interface KinematicSample {
	angleDeg: number;
	displacementMm: number;
	velocityMps: number;
	accelerationMps2: number;
	rodAngleDeg: number;
	crankPinMm: [number, number];
	pistonPinMm: [number, number];
}
export interface KinematicEvaluation {
	displacementLiters: number;
	cylinderDisplacementCc: number;
	meanPistonSpeedMps: number;
	rodRatio: number;
	crankRadiusMm: number;
	maximumRodAngleDeg: number;
}
export interface RodEvaluation {
	massKg: number;
	shankMassKg: number;
	volumeMm3: number;
	spanMm: number;
	areaMm2: number;
	iStrongMm4: number;
	iWeakMm4: number;
	shearAreaMm2: number;
	shearDeflectionMm: number;
	bendingDeflectionMm: number;
	axialStressMpa: number;
	bendingStressMpa: number;
	stressMpa: number;
	deflectionMm: number;
	axialShorteningMm: number;
	bucklingLoadKn: number;
	bucklingFactor: number;
	elasticBucklingApplicable: boolean;
	firstModeHz: number;
	complianceMmPerN: number;
	feasible: boolean;
	constraints: DesignConstraint[];
}
export interface DesignEvaluation {
	params: DesignParams;
	valid: boolean;
	errors: string[];
	kinematics: KinematicEvaluation;
	rod: RodEvaluation;
}

export function validateDesign(params: DesignParams): string[] {
	const errors: string[] = [];
	for (const key of Object.keys(DESIGN_BOUNDS) as (keyof DesignParams)[]) {
		const { min, max } = DESIGN_BOUNDS[key];
		if (!Number.isFinite(params[key]) || params[key] < min || params[key] > max)
			errors.push(`${key} must be between ${min} and ${max}.`);
	}
	if (params.webMm >= params.rodWidthMm) errors.push('Web must be narrower than the flange.');
	if (2 * params.flangeMm >= params.rodDepthMm) errors.push('Flanges leave no web height.');
	if (params.rodLengthMm <= params.strokeMm / 2)
		errors.push('Rod length must exceed crank radius.');
	return errors;
}

/** Exact planar union of two discs and a centre-to-centre rectangle, minus bearing holes. */
export function profileAreaMm2(widthMm: number, rodLengthMm: number): number {
	const {
		bigEndOuterRadiusMm: rb,
		smallEndOuterRadiusMm: rs,
		bigEndInnerRadiusMm: hb,
		smallEndInnerRadiusMm: hs
	} = ROD_INTERFACES;
	const overlap = (radius: number) => {
		const a = Math.min(widthMm / 2, radius);
		return a * Math.sqrt(radius * radius - a * a) + radius * radius * Math.asin(a / radius);
	};
	return (
		widthMm * rodLengthMm +
		Math.PI * (rb * rb + rs * rs - hb * hb - hs * hs) -
		overlap(rb) -
		overlap(rs)
	);
}

export function rodVolumeMm3(params: DesignParams): number {
	return (
		profileAreaMm2(params.webMm, params.rodLengthMm) * (params.rodDepthMm - 2 * params.flangeMm) +
		2 * profileAreaMm2(params.rodWidthMm, params.rodLengthMm) * params.flangeMm
	);
}

export function sliderCrankSample(params: DesignParams, angleDeg: number): KinematicSample {
	if (!Number.isFinite(angleDeg) || params.rodLengthMm <= params.strokeMm / 2)
		throw new RangeError('A finite angle and closing slider-crank are required.');
	const a = (angleDeg * Math.PI) / 180;
	const r = params.strokeMm / 2;
	const l = params.rodLengthMm;
	const s = Math.sin(a),
		c = Math.cos(a);
	const q = Math.sqrt(l * l - r * r * s * s);
	const omega = (params.rpm * 2 * Math.PI) / 60;
	const dx = r * s + (r * r * s * c) / q;
	const ddx = r * c + (r * r * (c * c - s * s)) / q + (r ** 4 * s * s * c * c) / q ** 3;
	return {
		angleDeg,
		displacementMm: r + l - r * c - q,
		velocityMps: (dx * omega) / 1000,
		accelerationMps2: (ddx * omega * omega) / 1000,
		rodAngleDeg: (Math.asin((r * s) / l) * 180) / Math.PI,
		crankPinMm: [r * s, r * c],
		pistonPinMm: [0, r * c + q]
	};
}

export function createKinematicCurve(params: DesignParams, samples = 181): KinematicSample[] {
	if (!Number.isInteger(samples) || samples < 3 || samples > 1441)
		throw new RangeError('Choose 3–1441 curve samples.');
	return Array.from({ length: samples }, (_, i) =>
		sliderCrankSample(params, (i * 360) / (samples - 1))
	);
}

/** Shear-energy equivalence: Av=I²/∫(Q²/b) dz, integrated exactly per polynomial region. */
export function sectionShearAreaMm2(
	params: DesignParams,
	axis: 'strong' | 'weak' = 'strong'
): number {
	const b = params.rodWidthMm,
		h = params.rodDepthMm,
		tw = params.webMm,
		t = params.flangeMm;
	const inertia =
		axis === 'strong'
			? (b * h ** 3 - (b - tw) * (h - 2 * t) ** 3) / 12
			: (2 * t * b ** 3 + (h - 2 * t) * tw ** 3) / 12;
	const half = axis === 'strong' ? h / 2 : b / 2;
	const split = axis === 'strong' ? h / 2 - t : tw / 2;
	const innerWidth = axis === 'strong' ? tw : h;
	const outerWidth = axis === 'strong' ? b : 2 * t;
	const integrate = (lo: number, hi: number, fn: (z: number) => number) => {
		const mid = (lo + hi) / 2,
			d = (hi - lo) / 2,
			g = Math.sqrt(3 / 5);
		return d * ((5 / 9) * fn(mid - d * g) + (8 / 9) * fn(mid) + (5 / 9) * fn(mid + d * g));
	};
	const outerQ = (z: number) => (outerWidth * (half * half - z * z)) / 2;
	const innerQ = (z: number) => outerQ(split) + (innerWidth * (split * split - z * z)) / 2;
	const integral =
		2 *
		(integrate(0, split, (z) => innerQ(z) ** 2 / innerWidth) +
			integrate(split, half, (z) => outerQ(z) ** 2 / outerWidth));
	return inertia ** 2 / integral;
}

function pinnedTimoshenkoFrequency(
	spanMm: number,
	areaMm2: number,
	inertiaMm4: number,
	shearAreaMm2: number
): number {
	const e = DESIGN_MATERIAL.youngsModulusMpa * 1e6;
	const g = e / (2 * (1 + DESIGN_MATERIAL.poissonRatio));
	const inertia = inertiaMm4 * 1e-12,
		area = areaMm2 * 1e-6,
		shear = g * shearAreaMm2 * 1e-6;
	const wave = Math.PI / (spanMm / 1000),
		rho = DESIGN_MATERIAL.densityKgPerM3;
	const mass = rho * area,
		rotary = rho * inertia;
	const trace = (shear * wave ** 2) / mass + (e * inertia * wave ** 2 + shear) / rotary;
	const determinant = (shear * e * inertia * wave ** 4) / (mass * rotary);
	// Stable smaller generalized eigenvalue of the pinned sinusoidal mode pair.
	const eigenvalue = (2 * determinant) / (trace + Math.sqrt(trace * trace - 4 * determinant));
	return Math.sqrt(eigenvalue) / (2 * Math.PI);
}

export function evaluateRod(params: DesignParams): RodEvaluation {
	const b = params.rodWidthMm,
		h = params.rodDepthMm,
		tw = params.webMm,
		tf = params.flangeMm;
	const spanMm =
		params.rodLengthMm - ROD_INTERFACES.bigEndOuterRadiusMm - ROD_INTERFACES.smallEndOuterRadiusMm;
	const areaMm2 = 2 * b * tf + tw * (h - 2 * tf);
	const iStrongMm4 = (b * h ** 3 - (b - tw) * (h - 2 * tf) ** 3) / 12;
	const iWeakMm4 = (2 * tf * b ** 3 + (h - 2 * tf) * tw ** 3) / 12;
	const e = DESIGN_MATERIAL.youngsModulusMpa;
	const axialStressMpa = (params.loadKn * 1000) / areaMm2;
	const bendingStressMpa = (((params.lateralLoadN * spanMm) / 4) * (h / 2)) / iStrongMm4;
	const stressMpa = axialStressMpa + bendingStressMpa;
	const shearAreaMm2 = sectionShearAreaMm2(params);
	const g = e / (2 * (1 + DESIGN_MATERIAL.poissonRatio));
	const bendingCompliance = spanMm ** 3 / (48 * e * iStrongMm4);
	const shearCompliance = spanMm / (4 * g * shearAreaMm2);
	const complianceMmPerN = bendingCompliance + shearCompliance;
	const deflectionMm = params.lateralLoadN * complianceMmPerN;
	const bucklingLoadKn = (Math.PI ** 2 * e * Math.min(iStrongMm4, iWeakMm4)) / spanMm ** 2 / 1000;
	const bucklingFactor = bucklingLoadKn / params.loadKn;
	const elasticBucklingApplicable =
		(bucklingLoadKn * 1000) / areaMm2 < DESIGN_MATERIAL.allowableStressMpa;
	const firstModeHz = Math.min(
		pinnedTimoshenkoFrequency(spanMm, areaMm2, iStrongMm4, shearAreaMm2),
		pinnedTimoshenkoFrequency(spanMm, areaMm2, iWeakMm4, sectionShearAreaMm2(params, 'weak'))
	);
	const constraint = (
		id: string,
		label: string,
		value: number,
		limit: number,
		unit: string,
		sense: 'max' | 'min'
	): DesignConstraint => ({
		id,
		label,
		value,
		limit,
		unit,
		sense,
		utilization: sense === 'max' ? value / limit : limit / value,
		passed: sense === 'max' ? value <= limit : value >= limit
	});
	const constraints = [
		constraint('stress', 'Nominal stress', stressMpa, DESIGN_LIMITS.maxStressMpa, 'MPa', 'max'),
		constraint(
			'deflection',
			'Transverse deflection',
			deflectionMm,
			DESIGN_LIMITS.maxDeflectionMm,
			'mm',
			'max'
		)
	];
	const volumeMm3 = rodVolumeMm3(params);
	return {
		massKg: volumeMm3 * DESIGN_MATERIAL.densityKgPerMm3,
		shankMassKg: areaMm2 * spanMm * DESIGN_MATERIAL.densityKgPerMm3,
		volumeMm3,
		spanMm,
		areaMm2,
		iStrongMm4,
		iWeakMm4,
		shearAreaMm2,
		shearDeflectionMm: params.lateralLoadN * shearCompliance,
		bendingDeflectionMm: params.lateralLoadN * bendingCompliance,
		axialStressMpa,
		bendingStressMpa,
		stressMpa,
		deflectionMm,
		axialShorteningMm: (params.loadKn * 1000 * spanMm) / (e * areaMm2),
		bucklingLoadKn,
		bucklingFactor,
		elasticBucklingApplicable,
		firstModeHz,
		complianceMmPerN,
		constraints,
		feasible: validateDesign(params).length === 0 && constraints.every((c) => c.passed)
	};
}

export function evaluateDesign(params: DesignParams): DesignEvaluation {
	const errors = validateDesign(params);
	if (errors.length) throw new RangeError(errors.join(' '));
	const cylinderDisplacementCc = ((Math.PI / 4) * params.boreMm ** 2 * params.strokeMm) / 1000;
	return {
		params: { ...params },
		valid: true,
		errors,
		rod: evaluateRod(params),
		kinematics: {
			cylinderDisplacementCc,
			displacementLiters: (cylinderDisplacementCc * 12) / 1000,
			meanPistonSpeedMps: (((2 * params.strokeMm) / 1000) * params.rpm) / 60,
			rodRatio: params.rodLengthMm / (params.strokeMm / 2),
			crankRadiusMm: params.strokeMm / 2,
			maximumRodAngleDeg: (Math.asin(params.strokeMm / 2 / params.rodLengthMm) * 180) / Math.PI
		}
	};
}

/** Nominal first-order longitudinal stress / transverse deflection inside the assessed shank.
 * Eye and shoulder fields are deliberately not extrapolated from the uniform beam.
 */
export function rodFieldAt(
	params: DesignParams,
	yMm: number,
	zMm: number,
	assessment?: RodEvaluation
): {
	stressMpa: number;
	displacementMm: number;
	inBeam: boolean;
} {
	const start = ROD_INTERFACES.bigEndOuterRadiusMm;
	const end = params.rodLengthMm - ROD_INTERFACES.smallEndOuterRadiusMm;
	if (!Number.isFinite(yMm) || !Number.isFinite(zMm) || yMm < start || yMm > end)
		return { stressMpa: 0, displacementMm: 0, inBeam: false };
	const rod = assessment ?? evaluateRod(params);
	const x = Math.min(yMm - start, end - yMm),
		length = rod.spanMm;
	const e = DESIGN_MATERIAL.youngsModulusMpa,
		g = e / (2 * (1 + DESIGN_MATERIAL.poissonRatio));
	const displacementMm =
		(params.lateralLoadN * x * (3 * length * length - 4 * x * x)) / (48 * e * rod.iStrongMm4) +
		(params.lateralLoadN * x) / (2 * g * rod.shearAreaMm2);
	const momentNmm = (params.lateralLoadN * x) / 2;
	return {
		stressMpa: -rod.axialStressMpa + (momentNmm * zMm) / rod.iStrongMm4,
		displacementMm,
		inBeam: true
	};
}

/** 1D exact Timoshenko beam elements: pinned ends, central point force, uniform EI/GA.
 * Independently assembled stiffness system; used to verify the analytic screening model.
 */
export function solveBeamFem(
	params: DesignParams,
	elements = 16
): { elements: number; deflectionMm: number; displacementsMm: number[]; residualRelative: number } {
	if (!Number.isInteger(elements) || elements < 2 || elements > 128 || elements % 2 !== 0)
		throw new RangeError('An even element count between 2 and 128 is required.');
	const rod = evaluateRod(params),
		n = 2 * (elements + 1),
		length = rod.spanMm / elements;
	const k = Array.from({ length: n }, () => new Float64Array(n));
	const f = new Float64Array(n);
	const l = length,
		e = DESIGN_MATERIAL.youngsModulusMpa,
		g = e / (2 * (1 + DESIGN_MATERIAL.poissonRatio)),
		phi = (12 * e * rod.iStrongMm4) / (g * rod.shearAreaMm2 * l * l),
		factor = (e * rod.iStrongMm4) / (l ** 3 * (1 + phi));
	const local = [
		[12, 6 * l, -12, 6 * l],
		[6 * l, (4 + phi) * l * l, -6 * l, (2 - phi) * l * l],
		[-12, -6 * l, 12, -6 * l],
		[6 * l, (2 - phi) * l * l, -6 * l, (4 + phi) * l * l]
	];
	for (let el = 0; el < elements; el++)
		for (let i = 0; i < 4; i++)
			for (let j = 0; j < 4; j++) k[2 * el + i][2 * el + j] += factor * local[i][j];
	f[elements] = params.lateralLoadN;
	const free = Array.from({ length: n }, (_, i) => i).filter((i) => i !== 0 && i !== n - 2);
	const count = free.length,
		a = free.map((i) => Float64Array.from(free, (j) => k[i][j]));
	const b = Float64Array.from(free, (i) => f[i]);
	// Cholesky factorization of the restrained positive-definite stiffness matrix.
	const lower = Array.from({ length: count }, () => new Float64Array(count));
	for (let i = 0; i < count; i++)
		for (let j = 0; j <= i; j++) {
			let sum = a[i][j];
			for (let m = 0; m < j; m++) sum -= lower[i][m] * lower[j][m];
			if (i === j && sum <= 0) throw new Error('Beam stiffness is not positive definite.');
			lower[i][j] = i === j ? Math.sqrt(sum) : sum / lower[j][j];
		}
	const y = new Float64Array(count),
		u = new Float64Array(count);
	for (let i = 0; i < count; i++) {
		let v = b[i];
		for (let j = 0; j < i; j++) v -= lower[i][j] * y[j];
		y[i] = v / lower[i][i];
	}
	for (let i = count - 1; i >= 0; i--) {
		let v = y[i];
		for (let j = i + 1; j < count; j++) v -= lower[j][i] * u[j];
		u[i] = v / lower[i][i];
	}
	const all = new Float64Array(n);
	free.forEach((index, i) => {
		all[index] = u[i];
	});
	let residualSquared = 0,
		forceSquared = 0;
	for (let i = 0; i < count; i++) {
		let residual = -b[i];
		for (let j = 0; j < count; j++) residual += a[i][j] * u[j];
		residualSquared += residual ** 2;
		forceSquared += b[i] ** 2;
	}
	return {
		elements,
		deflectionMm: all[elements],
		displacementsMm: Array.from({ length: elements + 1 }, (_, i) => all[2 * i]),
		residualRelative: Math.sqrt(residualSquared / Math.max(1, forceSquared))
	};
}

export interface VerificationResult {
	passed: boolean;
	method: string;
	analyticalDeflectionMm: number;
	meshes: {
		elements: number;
		deflectionMm: number;
		relativeError: number;
		residualRelative: number;
	}[];
	maxRelativeError: number;
}
export function verifyDesign(params: DesignParams): VerificationResult {
	const analyticalDeflectionMm = evaluateRod(params).deflectionMm;
	const meshes = [4, 8, 16, 32].map((elements) => {
		const result = solveBeamFem(params, elements);
		return {
			elements,
			deflectionMm: result.deflectionMm,
			residualRelative: result.residualRelative,
			relativeError:
				Math.abs(result.deflectionMm - analyticalDeflectionMm) /
				Math.max(1e-12, analyticalDeflectionMm)
		};
	});
	const maxRelativeError = Math.max(...meshes.map((m) => m.relativeError));
	return {
		passed: maxRelativeError < 1e-6 && meshes.every((m) => m.residualRelative < 1e-6),
		method:
			'Independent Timoshenko beam stiffness assembly; 4/8/16/32 exact beam elements versus the bending-plus-shear closed form. This piecewise loading is represented exactly; agreement verifies implementation, not 3D physical fidelity.',
		analyticalDeflectionMm,
		meshes,
		maxRelativeError
	};
}

export interface DesignCandidate {
	id: string;
	params: DesignParams;
	rod: RodEvaluation;
}
export interface OptimizationProgress {
	evaluated: number;
	total: number;
	feasible: number;
}
export interface OptimizationResult {
	baseline: DesignCandidate;
	candidates: DesignCandidate[];
	pareto: DesignCandidate[];
	best: DesignCandidate | null;
	verification: VerificationResult | null;
	evaluated: number;
	feasibleCount: number;
	durationMs: number;
	scope: string;
}
export function paretoFront(candidates: DesignCandidate[]): DesignCandidate[] {
	const sorted = candidates
		.filter((c) => c.rod.feasible)
		.sort((a, b) => a.rod.massKg - b.rod.massKg || a.rod.complianceMmPerN - b.rod.complianceMmPerN);
	let bestCompliance = Infinity;
	return sorted.filter((candidate) => {
		if (candidate.rod.complianceMmPerN >= bestCompliance - 1e-15) return false;
		bestCompliance = candidate.rod.complianceMmPerN;
		return true;
	});
}

export async function searchRodDesigns(
	params: DesignParams,
	onProgress?: (progress: OptimizationProgress) => void,
	shouldCancel: () => boolean = () => false
): Promise<OptimizationResult> {
	evaluateDesign(params);
	const start = performance.now();
	const baseline: DesignCandidate = {
		id: 'baseline',
		params: { ...params },
		rod: evaluateRod(params)
	};
	const candidates: DesignCandidate[] = [baseline];
	const widths = [14, 16, 18, 20, 22, 24, 26, 28],
		depths = [12, 14, 16, 18, 20, 22],
		webs = [2, 3, 4, 5, 6],
		flanges = [2, 2.5, 3, 3.5, 4, 4.5, 5];
	const total = widths.length * depths.length * webs.length * flanges.length + 1;
	let feasibleCount = Number(baseline.rod.feasible);
	for (const rodWidthMm of widths)
		for (const rodDepthMm of depths)
			for (const webMm of webs)
				for (const flangeMm of flanges) {
					if (shouldCancel()) throw new Error('Optimization cancelled.');
					const point = { ...params, rodWidthMm, rodDepthMm, webMm, flangeMm };
					const rod = evaluateRod(point);
					candidates.push({ id: `candidate-${candidates.length}`, params: point, rod });
					if (rod.feasible) feasibleCount++;
					if (candidates.length % 96 === 0) {
						onProgress?.({ evaluated: candidates.length, total, feasible: feasibleCount });
						await new Promise<void>((resolve) => setTimeout(resolve, 0));
					}
				}
	if (shouldCancel()) throw new Error('Optimization cancelled.');
	const pareto = paretoFront(candidates),
		best = pareto[0] ?? null;
	const verification = best ? verifyDesign(best.params) : null;
	onProgress?.({ evaluated: candidates.length, total, feasible: feasibleCount });
	return {
		baseline,
		candidates,
		pareto,
		best,
		verification,
		evaluated: candidates.length,
		feasibleCount,
		durationMs: performance.now() - start,
		scope:
			'Deterministic bounded 4-variable grid; non-dominated sampled designs, not a certified continuous/global optimum. Geometry mass is exact for the authored layered solid family; nominal first-order stress and Timoshenko bending/shear stiffness concern its ideal uniform shank only. Euler buckling is an ideal elastic reference outside this short shank material range, not a feasibility constraint or certified capacity.'
	};
}

export type OptimizationWorkerRequest = {
	type: 'optimize';
	revision: string;
	params: DesignParams;
};
export type OptimizationWorkerResponse =
	| { type: 'progress'; revision: string; progress: OptimizationProgress }
	| { type: 'complete'; revision: string; result: OptimizationResult }
	| { type: 'error'; revision: string; message: string };
