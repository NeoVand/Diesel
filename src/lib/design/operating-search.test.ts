import { describe, expect, it } from 'vitest';
import { DEFAULT_DESIGN_PARAMS } from './design-core';
import {
	DEFAULT_OPERATING_SCENARIO,
	evaluateOperatingEnvelope,
	operatingScenarioPresets
} from './operating-cycle';
import { OPERATING_SEARCH_GRID, searchOperatingDesigns } from './operating-search';

describe('bounded operating-load geometry search', () => {
	it('searches independent of legacy static loads and recomputes actual finalist cycles at finer resolution', () => {
		const params = { ...DEFAULT_DESIGN_PARAMS, loadKn: 50, lateralLoadN: 2000 };
		const scenarios = operatingScenarioPresets({ ...DEFAULT_OPERATING_SCENARIO });
		let coarseProgress = 0,
			fineProgress = 0;
		const result = searchOperatingDesigns(params, scenarios, (progress) => {
			if (progress.stage === 'coarse') coarseProgress++;
			else fineProgress++;
		});
		expect(result.evaluated).toBe(500);
		expect(coarseProgress).toBe(500);
		expect(fineProgress).toBe(result.refinedCount);
		expect(result.cancelled).toBe(false);
		expect(result.best).not.toBeNull();
		expect(result.finalists).toHaveLength(3);
		const best = result.best!;
		expect(best.angularSamples).toBe(721);
		expect(best.massKg).toBeLessThan(result.baseline.massKg);
		expect(best.utilization).toBeLessThanOrEqual(1);
		expect(result.massReductionPercent).toBeCloseTo(
			(1 - best.massKg / result.baseline.massKg) * 100,
			12
		);
		const independentlyRecomputed = evaluateOperatingEnvelope(best.params, scenarios, 721);
		expect(best.peakNominalStressMpa).toBe(independentlyRecomputed.peakNominalStressMpa);
		expect(best.criticalAngleDeg).toBe(independentlyRecomputed.criticalAngleDeg);
		expect(best.massKg).toBe(independentlyRecomputed.massKg);
		// Coarse phase points are contained in the fine sample grid; finer evaluation cannot lower the maximum.
		const coarse = result.candidates.find((c) => c.id === best.id)!;
		expect(best.peakNominalStressMpa).toBeGreaterThanOrEqual(coarse.peakNominalStressMpa - 1e-10);
		for (const key of Object.keys(OPERATING_SEARCH_GRID) as (keyof typeof OPERATING_SEARCH_GRID)[])
			expect(OPERATING_SEARCH_GRID[key]).toContain(best.params[key]);
		// Legacy nominal fixture loads cannot enter an operating pressure/inertia screen.
		const noLegacyLoads = evaluateOperatingEnvelope(
			{ ...best.params, loadKn: 5, lateralLoadN: 0 },
			scenarios,
			721
		);
		expect(noLegacyLoads.peakNominalStressMpa).toBe(best.peakNominalStressMpa);
	}, 30000);
	it('cancellation never advertises an incomplete scan winner', () => {
		let progress = 0;
		const result = searchOperatingDesigns(
			{ ...DEFAULT_DESIGN_PARAMS },
			[{ ...DEFAULT_OPERATING_SCENARIO }],
			() => progress++,
			() => progress >= 7
		);
		expect(result.cancelled).toBe(true);
		expect(result.evaluated).toBe(7);
		expect(result.best).toBeNull();
		expect(result.massReductionPercent).toBeNull();
	});
	it('returns no winner when the complete bounded grid fails the assumed operating condition', () => {
		const result = searchOperatingDesigns({ ...DEFAULT_DESIGN_PARAMS }, [
			{
				...DEFAULT_OPERATING_SCENARIO,
				intakePressureBar: 3,
				compressionRatio: 22,
				polytropicExponent: 1.4,
				combustionRiseBar: 100
			}
		]);
		expect(result.evaluated).toBe(500);
		expect(result.coarsePassCount).toBe(0);
		expect(result.refinedCount).toBe(0);
		expect(result.finalists).toEqual([]);
		expect(result.best).toBeNull();
		expect(result.massReductionPercent).toBeNull();
		expect(result.cancelled).toBe(false);
	});
});
