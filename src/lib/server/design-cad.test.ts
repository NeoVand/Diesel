import { describe, expect, it, vi } from 'vitest';

vi.mock('$env/dynamic/private', () => ({ env: {} }));

import { rodParameterHash, validateRodCadParams, validateRodCadRequest } from './design-cad';
import { DEFAULT_DESIGN_PARAMS, rodVolumeMm3 } from '$lib/design/design-core';
import kernelEvidence from '../../../docs/verification/rod-cad-kernel.json';

describe('parametric solid boundary and independent kernel evidence', () => {
	it('matches actual OCCT solid volumes across the baseline and every parameter-box corner', () => {
		expect(kernelEvidence.cases).toHaveLength(33);
		for (const result of kernelEvidence.cases) {
			const computed = rodVolumeMm3({ ...DEFAULT_DESIGN_PARAMS, ...result.params });
			expect(Math.abs(computed - result.volumeMm3) / result.volumeMm3).toBeLessThan(1e-8);
			expect(result.valid && result.stepRoundTripValid && result.solidCount === 1).toBe(true);
		}
	});

	it('retains only geometry parameters and a hash independent of operating conditions and property order', () => {
		const p = validateRodCadParams(DEFAULT_DESIGN_PARAMS);
		const request = validateRodCadRequest({
			params: { ...DEFAULT_DESIGN_PARAMS, rpm: 3600, loadKn: 50 },
			format: 'json'
		});
		expect(request).toEqual({ params: p, format: 'json' });
		expect(rodParameterHash(request.params)).toBe(rodParameterHash(p));
		expect(rodParameterHash({ ...p, webMm: p.webMm + 0.5 })).not.toBe(rodParameterHash(p));
		expect(Object.keys(p)).toHaveLength(5);
	});

	it('rejects nonnumeric, nonfinite and out-of-range parameters before launching native CAD', () => {
		for (const value of ['4', null, true, NaN, Infinity, -1, 7]) {
			expect(() => validateRodCadParams({ ...DEFAULT_DESIGN_PARAMS, webMm: value })).toThrow();
		}
		expect(() => validateRodCadParams({})).toThrow();
		expect(() =>
			validateRodCadRequest({ params: DEFAULT_DESIGN_PARAMS, format: 'shell' })
		).toThrow();
	});
});
