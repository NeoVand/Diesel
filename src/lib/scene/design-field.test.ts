import { describe, expect, it } from 'vitest';
import { BASELINE_DESIGN, rodFieldAt } from '$lib/design/design-core';
import { designFieldCoefficients } from './design-field';

describe('fragment field coefficients', () => {
	it('reproduces the assessed Timoshenko field throughout the shank', () => {
		for (const params of [
			BASELINE_DESIGN,
			{ ...BASELINE_DESIGN, rodLengthMm: 160, rodDepthMm: 22, rodWidthMm: 28, lateralLoadN: 2000 },
			{ ...BASELINE_DESIGN, lateralLoadN: 0 }
		]) {
			const data = designFieldCoefficients(params);
			for (let i = 0; i <= 100; i++)
				for (const z of [-params.rodDepthMm / 2, 0, params.rodDepthMm / 2]) {
					const y = data.start + (i * data.span) / 100;
					const x = Math.min(y - data.start, data.end - y);
					const stress = -data.axial + data.bendingCoefficient * x * z;
					const displacement =
						data.bendingDeflectionCoefficient * x * (3 * data.span ** 2 - 4 * x ** 2) +
						data.shearDeflectionCoefficient * x;
					const reference = rodFieldAt(params, y, z);
					expect(stress).toBeCloseTo(reference.stressMpa, 10);
					expect(displacement).toBeCloseTo(reference.displacementMm, 12);
				}
			expect(rodFieldAt(params, data.end + 0.1, 0).inBeam).toBe(false);
			expect(rodFieldAt(params, data.start - 0.1, 0).inBeam).toBe(false);
		}
	});
});
