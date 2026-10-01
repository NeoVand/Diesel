import { beforeAll, describe, expect, it } from 'vitest';
import { init } from '@jax-js/jax';
import { DEFAULT_DESIGN_PARAMS } from './design-core';
import {
	DEFAULT_OPERATING_SCENARIO,
	evaluateOperatingEnvelope,
	operatingScenarioPresets
} from './operating-cycle';
import { createOperatingSearchGrid } from './operating-search';
import {
	executeOperatingBatch,
	prepareOperatingBatch,
	GPU_OPERATING_RELATIVE_TOLERANCE
} from './gpu-operating-kernel';

beforeAll(async () => {
	await init('wasm');
});

describe('JAX-JS batched operating-load arithmetic', () => {
	it('matches independent Float64 cycles at design bounds and across three operating conditions', async () => {
		const p = { ...DEFAULT_DESIGN_PARAMS };
		const grid = createOperatingSearchGrid(p);
		const designs = [grid[0], grid[37], grid[249], grid[499], p];
		const scenarios = operatingScenarioPresets({ ...DEFAULT_OPERATING_SCENARIO });
		const prepared = prepareOperatingBatch(designs, scenarios);
		const result = await executeOperatingBatch(prepared, 'wasm');
		for (let i = 0; i < designs.length; i++) {
			const actual = result.candidates[i],
				reference = evaluateOperatingEnvelope(designs[i], scenarios, 121);
			for (const key of ['peakNominalStressMpa', 'maxCompressionN', 'maxTensionN'] as const)
				expect(
					Math.abs(actual[key] - reference[key]) / Math.max(1, Math.abs(reference[key]))
				).toBeLessThan(GPU_OPERATING_RELATIVE_TOLERANCE);
			expect(actual.massKg).toBe(reference.massKg);
			expect(actual.passesNominalScreen).toBe(reference.passesNominalScreen);
			expect(actual.criticalScenarioIndex).toBe(reference.criticalScenarioIndex);
			expect(actual.criticalAngleDeg).toBe(reference.criticalAngleDeg);
			expect(actual.criticalSectionMm).toBe(reference.criticalSectionMm);
		}
	}, 30000);
	it('handles zero inertia, no net pressure, and peak allowed speed without fabricated loads', async () => {
		const designs = [{ ...DEFAULT_DESIGN_PARAMS, rodLengthMm: 160, strokeMm: 125 }];
		const noPressure = {
			...DEFAULT_OPERATING_SCENARIO,
			rpm: 0,
			pistonMassKg: 0,
			combustionRiseBar: 0,
			intakePressureBar: 1,
			exhaustPressureBar: 1,
			crankcasePressureBar: 1
		};
		// The prescribed compression trace still creates gas load away from BDC even at rest.
		for (const scenario of [
			noPressure,
			{ ...DEFAULT_OPERATING_SCENARIO, rpm: 3600, pistonMassKg: 5, combustionRiseBar: 100 }
		]) {
			const {
				candidates: [actual]
			} = await executeOperatingBatch(prepareOperatingBatch(designs, [scenario]), 'wasm');
			const reference = evaluateOperatingEnvelope(designs[0], [scenario], 121);
			expect(
				Math.abs(actual.peakNominalStressMpa - reference.peakNominalStressMpa) /
					reference.peakNominalStressMpa
			).toBeLessThan(GPU_OPERATING_RELATIVE_TOLERANCE);
			expect(
				Math.abs(actual.maxTensionN - reference.maxTensionN) / Math.max(1, reference.maxTensionN)
			).toBeLessThan(GPU_OPERATING_RELATIVE_TOLERANCE);
		}
	});
	it('rejects mixed kinematics, invalid conditions, and unbounded batches', () => {
		const p = { ...DEFAULT_DESIGN_PARAMS },
			s = { ...DEFAULT_OPERATING_SCENARIO };
		expect(() => prepareOperatingBatch([], [s])).toThrow(RangeError);
		expect(() => prepareOperatingBatch([p], [])).toThrow(RangeError);
		expect(() => prepareOperatingBatch([p], [{ ...s, rpm: NaN }])).toThrow(RangeError);
		expect(() => prepareOperatingBatch([p, { ...p, strokeMm: 110 }], [s])).toThrow(/share/);
		expect(() => prepareOperatingBatch([p], [s], 4)).toThrow(RangeError);
	});
});
