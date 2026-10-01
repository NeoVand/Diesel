import { describe, expect, it } from 'vitest';
import {
	DEFAULT_DESIGN_PARAMS,
	DESIGN_MATERIAL,
	evaluateRod,
	sectionShearAreaMm2,
	type DesignParams
} from './design-core';

/** Independent thin rectangular slices: accumulate area first moments from the
 * outside inward, then integrate shear energy. This does not use the core's
 * polynomial Q expression or Gaussian quadrature.
 * Reference: TU Delft, Timoshenko Beam, effective shear area in V=GAs*gamma.
 */
function sliceShearArea(params: DesignParams, axis: 'strong' | 'weak') {
	const strong = axis === 'strong';
	const half = (strong ? params.rodDepthMm : params.rodWidthMm) / 2;
	const steps = 24_000;
	const dz = half / steps;
	let q = 0;
	let inertia = 0;
	let energy = 0;
	for (let index = steps - 1; index >= 0; index--) {
		const position = (index + 0.5) * dz;
		const width = strong
			? position > params.rodDepthMm / 2 - params.flangeMm
				? params.rodWidthMm
				: params.webMm
			: position > params.webMm / 2
				? 2 * params.flangeMm
				: params.rodDepthMm;
		const firstMoment = width * position * dz;
		const qAtCentre = q + firstMoment / 2;
		energy += (qAtCentre ** 2 / width) * dz;
		inertia += width * position ** 2 * dz;
		q += firstMoment;
	}
	return (2 * inertia) ** 2 / (2 * energy);
}

const cases = [
	{ ...DEFAULT_DESIGN_PARAMS },
	{ ...DEFAULT_DESIGN_PARAMS, rodWidthMm: 14, rodDepthMm: 12, webMm: 2, flangeMm: 2 },
	{ ...DEFAULT_DESIGN_PARAMS, rodWidthMm: 28, rodDepthMm: 22, webMm: 6, flangeMm: 5 },
	{ ...DEFAULT_DESIGN_PARAMS, rodWidthMm: 26, rodDepthMm: 18, webMm: 3, flangeMm: 4.5 }
];

describe('independent design-study reference checks', () => {
	it('matches section shear energy from independent thin-slice integrations in both axes', () => {
		for (const params of cases) {
			for (const axis of ['strong', 'weak'] as const) {
				const slices = sliceShearArea(params, axis);
				const result = sectionShearAreaMm2(params, axis);
				expect(Math.abs(result - slices) / slices).toBeLessThan(2e-4);
			}
		}
	});

	it('matches total midpoint displacement obtained from independently integrated strain energy', () => {
		const e = DESIGN_MATERIAL.youngsModulusMpa;
		const g = e / (2 * (1 + DESIGN_MATERIAL.poissonRatio));
		for (const params of cases) {
			const rod = evaluateRod(params);
			const av = sliceShearArea(params, 'strong');
			const force = params.lateralLoadN;
			const steps = 10_000;
			const dx = rod.spanMm / steps;
			let twiceEnergy = 0;
			for (let i = 0; i < steps; i++) {
				const x = (i + 0.5) * dx;
				const moment = (force / 2) * Math.min(x, rod.spanMm - x);
				const shear = force / 2;
				twiceEnergy += (moment ** 2 / (e * rod.iStrongMm4) + shear ** 2 / (g * av)) * dx;
			}
			expect(Math.abs(rod.deflectionMm - twiceEnergy / force) / rod.deflectionMm).toBeLessThan(
				1e-4
			);
		}
	});
});
