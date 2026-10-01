/**
 * Batched Newton–Euler / nominal-section arithmetic, compiled by JAX-JS to WebGPU.
 * Geometry integrals and shared prescribed pressure / kinematics are prepared in
 * browser Float64; each design × phase × shank section is then evaluated in float32.
 * This is the same explicitly assumed load model as operating-cycle.ts, not CFD.
 */
import { jit, numpy as np, type Array as JaxArray, type Device } from '@jax-js/jax';
import {
	DESIGN_LIMITS,
	ROD_INTERFACES,
	sliderCrankSample,
	validateDesign,
	type DesignParams
} from './design-core';
import {
	cylinderPressureBar,
	lowerSegmentMoments,
	rodMassProperties,
	validateOperatingScenario,
	type OperatingScenario
} from './operating-cycle';
import { operatingDesignId, type OperatingDesignSummary } from './operating-search';

export const GPU_OPERATING_RELATIVE_TOLERANCE = 3e-4;
export const GPU_OPERATING_SECTIONS = 17;
export const GPU_OPERATING_PHASES = 121;

type TensorTree = Record<string, JaxArray>;
type PreparedTensor = { values: Float32Array<ArrayBuffer>; shape: number[] };
export interface PreparedOperatingBatch {
	inputs: Record<string, PreparedTensor>;
	designs: DesignParams[];
	massesKg: number[];
	scenarioCount: number;
	phaseCount: number;
	preparationMs: number;
}

/** Prepare only shape integrals (once/design) and common kinematics (once/phase). */
export function prepareOperatingBatch(
	designs: DesignParams[],
	scenarios: OperatingScenario[],
	phaseCount = GPU_OPERATING_PHASES
): PreparedOperatingBatch {
	const start = performance.now();
	if (!designs.length || designs.length > 2048) throw new RangeError('Choose 1–2048 designs.');
	if (!scenarios.length || scenarios.length > 12) throw new RangeError('Choose 1–12 conditions.');
	if (!Number.isInteger(phaseCount) || phaseCount < 73 || phaseCount > 721)
		throw new RangeError('Choose 73–721 phases per condition.');
	const base = designs[0];
	for (const p of designs) {
		const errors = validateDesign(p);
		if (errors.length) throw new RangeError(errors.join(' '));
		if (
			['boreMm', 'strokeMm', 'rodLengthMm'].some(
				(key) => p[key as keyof DesignParams] !== base[key as keyof DesignParams]
			)
		)
			throw new RangeError('A batch must share bore, stroke and bearing spacing.');
	}
	for (const scenario of scenarios) {
		const errors = validateOperatingScenario(scenario);
		if (errors.length) throw new RangeError(errors.join(' '));
	}
	const dCount = designs.length,
		pCount = phaseCount * scenarios.length,
		sCount = GPU_OPERATING_SECTIONS;
	const inputs: Record<string, PreparedTensor> = {};
	const allocate = (names: string[], shape: number[]) => {
		const size = shape.reduce((a, b) => a * b, 1);
		for (const name of names) inputs[name] = { values: new Float32Array(size), shape };
	};
	allocate(['mass', 'lambda', 'polar', 'centre', 'area', 'bendingFactor'], [dCount, 1, 1]);
	allocate(['segmentMass', 'segmentFirst', 'segmentPolar', 'section'], [dCount, 1, sCount]);
	allocate(
		['dx', 'dy', 'acx', 'acy', 'dax', 'day', 'alpha', 'rodOmega2', 'ux', 'uy', 'pistonForce'],
		[1, pCount, 1]
	);
	const massesKg: number[] = [];
	for (let d = 0; d < dCount; d++) {
		const p = designs[d],
			mass = rodMassProperties(p);
		massesKg.push(mass.massKg);
		inputs.mass.values[d] = mass.massKg;
		inputs.lambda.values[d] = mass.centreOfMassMm[1] / p.rodLengthMm;
		inputs.polar.values[d] = mass.inertiaZKgM2;
		inputs.centre.values[d] = mass.centreOfMassMm[1] / 1000;
		inputs.area.values[d] =
			2 * p.rodWidthMm * p.flangeMm + p.webMm * (p.rodDepthMm - 2 * p.flangeMm);
		const inertia =
			(2 * p.flangeMm * p.rodWidthMm ** 3 + (p.rodDepthMm - 2 * p.flangeMm) * p.webMm ** 3) / 12;
		inputs.bendingFactor.values[d] = (1000 * p.rodWidthMm) / (2 * inertia);
		for (let s = 0; s < sCount; s++) {
			const section =
				ROD_INTERFACES.bigEndOuterRadiusMm +
				((p.rodLengthMm -
					ROD_INTERFACES.smallEndOuterRadiusMm -
					ROD_INTERFACES.bigEndOuterRadiusMm) *
					s) /
					(sCount - 1);
			const segment = lowerSegmentMoments(p, section),
				i = d * sCount + s;
			inputs.segmentMass.values[i] = segment.mass;
			inputs.segmentFirst.values[i] = segment.firstY;
			inputs.segmentPolar.values[i] = segment.secondX + segment.secondY;
			inputs.section.values[i] = section / 1000;
		}
	}
	for (let c = 0; c < scenarios.length; c++) {
		const scenario = scenarios[c],
			l = base.rodLengthMm / 1000,
			r = base.strokeMm / 2000;
		const omega = (scenario.rpm * 2 * Math.PI) / 60;
		for (let phase = 0; phase < phaseCount; phase++) {
			const angle = (720 * phase) / (phaseCount - 1),
				theta = (angle * Math.PI) / 180;
			const k = sliderCrankSample({ ...base, rpm: scenario.rpm }, angle);
			const dx = -k.crankPinMm[0] / 1000,
				dy = (k.pistonPinMm[1] - k.crankPinMm[1]) / 1000;
			const acx = -r * Math.sin(theta) * omega ** 2,
				acy = -r * Math.cos(theta) * omega ** 2;
			const dax = -acx,
				day = -k.accelerationMps2 - acy;
			const dvx = -r * Math.cos(theta) * omega,
				dvy = -k.velocityMps + r * Math.sin(theta) * omega;
			const gas =
				((cylinderPressureBar(base, scenario, angle) - scenario.crankcasePressureBar) *
					1e5 *
					Math.PI *
					(base.boreMm / 1000) ** 2) /
				4;
			const values = {
				dx,
				dy,
				acx,
				acy,
				dax,
				day,
				alpha: (dx * day - dy * dax) / l ** 2,
				rodOmega2: ((dx * dvy - dy * dvx) / l ** 2) ** 2,
				ux: dx / l,
				uy: dy / l,
				pistonForce: -gas + scenario.pistonMassKg * k.accelerationMps2
			};
			for (const [name, value] of Object.entries(values))
				inputs[name].values[c * phaseCount + phase] = value;
		}
	}
	return {
		inputs,
		designs,
		massesKg,
		scenarioCount: scenarios.length,
		phaseCount,
		preparationMs: performance.now() - start
	};
}

/** Ownership is explicit: inputs/intermediates are consumed once; only outputs survive. */
const solveBatch = jit((x: TensorTree) => {
	const held: JaxArray[] = [];
	const own = (value: JaxArray) => {
		held.push(value);
		return value;
	};
	const add = (a: JaxArray, b: JaxArray) => own(a.ref.add(b.ref));
	const sub = (a: JaxArray, b: JaxArray) => own(a.ref.sub(b.ref));
	const mul = (a: JaxArray, b: JaxArray) => own(a.ref.mul(b.ref));
	const div = (a: JaxArray, b: JaxArray) => own(a.ref.div(b.ref));
	const agx = add(x.acx, mul(x.lambda, x.dax));
	const agy = add(x.acy, mul(x.lambda, x.day));
	const fpx = div(
		sub(
			sub(mul(x.dx, x.pistonForce), mul(x.polar, x.alpha)),
			mul(mul(x.lambda, x.mass), sub(mul(x.dx, agy), mul(x.dy, agx)))
		),
		x.dy
	);
	const fcx = sub(mul(x.mass, agx), fpx);
	const fcy = sub(mul(x.mass, agy), x.pistonForce);
	const bigX = sub(mul(fcx, x.uy), mul(fcy, x.ux));
	const bigY = add(mul(fcx, x.ux), mul(fcy, x.uy));
	const smallY = add(mul(fpx, x.ux), mul(x.pistonForce, x.uy));
	const aox = sub(mul(x.acx, x.uy), mul(x.acy, x.ux));
	const aoy = add(mul(x.acx, x.ux), mul(x.acy, x.uy));
	const agxLocal = sub(aox, mul(x.alpha, x.centre));
	const segmentForceY = sub(mul(aoy, x.segmentMass), mul(x.rodOmega2, x.segmentFirst));
	const inertialMoment = sub(
		mul(
			x.alpha,
			add(
				sub(x.segmentPolar, mul(add(x.section, x.centre), x.segmentFirst)),
				mul(mul(x.section, x.centre), x.segmentMass)
			)
		),
		mul(agxLocal, sub(x.segmentFirst, mul(x.section, x.segmentMass)))
	);
	const axial = own(np.abs(sub(segmentForceY, bigY).ref));
	const bending = own(np.abs(sub(inertialMoment, mul(x.section, bigX)).ref));
	const stress = add(div(axial, x.area), mul(bending, x.bendingFactor));
	const result = {
		stress: stress.ref.max(2),
		section: np.argmax(stress.ref, 2),
		axial: smallY.ref.reshape([smallY.shape[0], smallY.shape[1]])
	};
	for (const value of held) value.dispose();
	for (const value of Object.values(x)) value.dispose();
	return result;
});

/** The test harness uses Wasm to exercise the exact JIT graph without GPU availability. */
export async function executeOperatingBatch(
	batch: PreparedOperatingBatch,
	device: Device = 'webgpu'
): Promise<{ candidates: OperatingDesignSummary[]; batchMs: number }> {
	const start = performance.now();
	const inputs: TensorTree = {};
	for (const [key, input] of Object.entries(batch.inputs))
		inputs[key] = np.array(input.values, { shape: input.shape, device, dtype: np.float32 });
	const result = solveBatch(inputs);
	let stress: ArrayLike<number>, section: ArrayLike<number>, axial: ArrayLike<number>;
	try {
		[stress, section, axial] = await Promise.all([
			result.stress.ref.data(),
			result.section.ref.data(),
			result.axial.ref.data()
		]);
	} finally {
		result.stress.dispose();
		result.section.dispose();
		result.axial.dispose();
	}
	const phaseTotal = batch.scenarioCount * batch.phaseCount;
	const candidates = batch.designs.map((p, d): OperatingDesignSummary => {
		let peak = -Infinity,
			critical = 0,
			maxCompressionN = 0,
			maxTensionN = 0;
		for (let i = 0; i < phaseTotal; i++) {
			const j = d * phaseTotal + i;
			if (!Number.isFinite(stress[j]) || !Number.isFinite(axial[j]))
				throw new Error('GPU returned a non-finite operating result.');
			if (stress[j] > peak) {
				peak = stress[j];
				critical = i;
			}
			maxCompressionN = Math.max(maxCompressionN, -axial[j]);
			maxTensionN = Math.max(maxTensionN, axial[j]);
		}
		const criticalSection = section[d * phaseTotal + critical];
		return {
			id: operatingDesignId(p),
			params: { ...p },
			massKg: batch.massesKg[d],
			peakNominalStressMpa: peak,
			utilization: peak / DESIGN_LIMITS.maxStressMpa,
			passesNominalScreen: peak <= DESIGN_LIMITS.maxStressMpa,
			criticalScenarioIndex: Math.floor(critical / batch.phaseCount),
			criticalAngleDeg: (720 * (critical % batch.phaseCount)) / (batch.phaseCount - 1),
			criticalSectionMm:
				ROD_INTERFACES.bigEndOuterRadiusMm +
				((p.rodLengthMm -
					ROD_INTERFACES.smallEndOuterRadiusMm -
					ROD_INTERFACES.bigEndOuterRadiusMm) *
					criticalSection) /
					(GPU_OPERATING_SECTIONS - 1),
			maxCompressionN,
			maxTensionN,
			angularSamples: batch.phaseCount
		};
	});
	return { candidates, batchMs: performance.now() - start };
}
