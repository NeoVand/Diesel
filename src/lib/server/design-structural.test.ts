import { describe, expect, it, vi } from 'vitest';

vi.mock('$env/dynamic/private', () => ({ env: {} }));

import { DEFAULT_DESIGN_PARAMS } from '$lib/design/design-core';
import { rodMassProperties } from '$lib/design/operating-cycle';
import { structuralAnalysisHash, validateStructuralRequest } from './design-structural';
import native from '../../../docs/verification/rod-solid-elasticity.json';
import deepRefinement from '../../../docs/verification/rod-solid-deep-refinement.json';

const params = { ...DEFAULT_DESIGN_PARAMS };
const inertia = {
	originAccelerationMps2: [1200, -800, 0],
	angularVelocityRadS: [0, 0, 42],
	angularAccelerationRadS2: [0, 0, -3000]
};

describe('native solid analysis input and independent evidence', () => {
	it('maps the artificial fixture scenario without confusing its load axes with the operating cycle', () => {
		const request = validateStructuralRequest({ params });
		expect(request.loadCase.forceN).toEqual([0, -25000, 1000]);
		expect(request.loadCase.inertia).toBeUndefined();
		const cycle = validateStructuralRequest({
			params,
			loadCase: { forceN: [500, -20000, 0], inertia },
			refine: true
		});
		expect(cycle.loadCase.forceN).toEqual([500, -20000, 0]);
		expect(cycle.loadCase.inertia).toEqual(inertia);
		expect(cycle.refine).toBe(true);
		expect(cycle.refinementLevel).toBe(2);
		expect(validateStructuralRequest({ params, refinementLevel: 3 }).refinementLevel).toBe(3);
		expect(validateStructuralRequest({ params, refine: true, refinementLevel: 1 }).refine).toBe(
			false
		);
	});

	it('binds analysis identity to geometry, load, body inertia and refinement, but not display label', () => {
		const a = validateStructuralRequest({
			params,
			loadCase: { forceN: [500, -20000, 0], inertia }
		});
		const hash = structuralAnalysisHash(a);
		expect(
			structuralAnalysisHash({ ...a, loadCase: { ...a.loadCase, label: 'A renamed case' } })
		).toBe(hash);
		expect(structuralAnalysisHash({ ...a, refine: true, refinementLevel: 2 })).not.toBe(hash);
		expect(structuralAnalysisHash({ ...a, refine: true, refinementLevel: 3 })).not.toBe(hash);
		expect(
			structuralAnalysisHash({ ...a, loadCase: { ...a.loadCase, inertia: undefined } })
		).not.toBe(hash);
		expect(structuralAnalysisHash({ ...a, params: { ...a.params, webMm: 5 } })).not.toBe(hash);
	});

	it('rejects malformed, nonfinite and unbounded native loads before spawning the solver', () => {
		for (const forceN of [
			[0, -25000],
			[0, '25000', 0],
			[NaN, 0, 0],
			[100001, 0, 0],
			[80000, 80000, 0]
		]) {
			expect(() => validateStructuralRequest({ params, loadCase: { forceN } })).toThrow();
		}
		expect(() => validateStructuralRequest({ params, refine: 'yes' })).toThrow();
		for (const refinementLevel of [0, 4, 1.5, '2', true, null]) {
			expect(() => validateStructuralRequest({ params, refinementLevel })).toThrow();
		}
		expect(() =>
			validateStructuralRequest({ params, loadCase: { forceN: [0, 0, 0], inertia: {} } })
		).toThrow();
	});

	it('matches analytical rod dynamics mass, COM and inertia against independent exact OCCT solids', () => {
		for (const result of native.nativeMassProperties) {
			const mass = rodMassProperties({ ...params, ...result.params });
			expect(mass.massKg).toBeCloseTo(result.massKg, 11);
			expect(mass.centreOfMassMm[1]).toBeCloseTo(result.centreOfMassMm[1], 9);
			expect(mass.inertiaZKgM2).toBeCloseTo(result.inertiaZKgM2, 12);
		}
	});

	it('records actual patch, refinement, load-scaling and body-resultant verification', () => {
		expect(native.patch.maxStressErrorMpa).toBeLessThan(1e-7);
		expect(native.patch.maxDisplacementErrorMm).toBeLessThan(1e-11);
		expect(native.cantilever.runs.at(-1)!.beamComparisonRelativeError).toBeLessThan(0.05);
		expect(native.rodRefinement.withinScreeningTolerance).toBe(true);
		expect(native.linearityAndInertia.displacementScalingRelativeError).toBeLessThan(1e-10);
		expect(native.linearityAndInertia.uniformAccelerationResultantErrorN).toBeLessThan(1e-7);
	});

	it('compares the final two actual meshes after a failed coarse comparison', () => {
		const convergence = deepRefinement.convergence;
		const [coarse, intermediate, fine] = convergence.meshes;
		expect(convergence.meshes).toHaveLength(3);
		expect(
			Math.abs(intermediate.maxDisplacementMm - coarse.maxDisplacementMm) /
				intermediate.maxDisplacementMm
		).toBeGreaterThan(0.08);
		expect(convergence.displacementRelativeChange).toBeCloseTo(
			Math.abs(fine.maxDisplacementMm - intermediate.maxDisplacementMm) / fine.maxDisplacementMm,
			12
		);
		expect(convergence.withinScreeningTolerance).toBe(true);
		expect(fine.forceBalanceRelative).toBeLessThan(1e-5);
		expect(fine.solveResidualRelative).toBeLessThan(1e-7);
	});
});
