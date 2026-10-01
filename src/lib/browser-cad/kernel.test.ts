import { describe, it, expect } from 'vitest';
import initialize from '@loumalouomega/gmsh-wasm';
import { exportVerifiedCad } from './kernel';
import { runBrowserAnalysis } from './analysis';
import { DEFAULT_DESIGN_PARAMS } from '../design/design-core';
import native from '../../../docs/verification/rod-solid-elasticity.json';
import deepReference from '../../../docs/verification/rod-solid-deep-refinement.json';
import { analyticVolume, type RodCadParams } from './contracts';

describe('browser CAD and solid physics WebAssembly', () => {
	it('exports analytic STEP solids and matches the independent native fixture solve', async () => {
		const kernel = await initialize({ print: () => {}, printErr: () => {} });
		kernel.initialize();
		kernel.option.setNumber('General.Terminal', 0);
		try {
			const cad = await exportVerifiedCad(kernel, DEFAULT_DESIGN_PARAMS);
			expect(cad.report.solidCount).toBe(1);
			expect(cad.report.relativeVolumeError).toBeLessThan(1e-8);
			expect(cad.report.stepRoundTripRelativeVolumeError).toBeLessThan(1e-8);
			expect(new TextDecoder().decode(cad.step)).toContain('ISO-10303-21');
			const result = await runBrowserAnalysis(kernel, {
				params: DEFAULT_DESIGN_PARAMS,
				refinementLevel: 2
			});
			const reference = native.rodRefinement.meshes.at(-1)!;
			expect(result.stats.solveResidualRelative).toBeLessThan(1e-7);
			expect(result.stats.forceBalanceRelative).toBeLessThan(1e-5);
			expect(result.stats.momentBalanceRelative).toBeLessThan(1e-5);
			expect(
				Math.abs(result.stats.maxDisplacementMm / reference.maxDisplacementMm - 1)
			).toBeLessThan(0.05);
			expect(Math.abs(result.stats.strainEnergyNmm / reference.strainEnergyNmm - 1)).toBeLessThan(
				0.05
			);
			expect(result.convergence.performed).toBe(true);
			console.info(
				'WASM baseline validation',
				JSON.stringify({
					stats: result.stats,
					runtime: result.runtime,
					displacementDifference: result.stats.maxDisplacementMm / reference.maxDisplacementMm - 1,
					energyDifference: result.stats.strainEnergyNmm / reference.strainEnergyNmm - 1
				})
			);
		} finally {
			kernel.finalize();
		}
	}, 120000);
	it('preserves exact STEP solids at all 32 bounded geometry corners', async () => {
		const kernel = await initialize({ print: () => {}, printErr: () => {} });
		kernel.initialize();
		kernel.option.setNumber('General.Terminal', 0);
		try {
			const bounds = {
				rodLengthMm: [110, 160],
				rodWidthMm: [14, 28],
				rodDepthMm: [12, 22],
				webMm: [2, 6],
				flangeMm: [2, 5]
			} as const;
			for (let corner = 0; corner < 32; corner++) {
				const params = Object.fromEntries(
					Object.entries(bounds).map(([name, range], bit) => [name, range[(corner >> bit) & 1]])
				) as RodCadParams;
				const cad = await exportVerifiedCad(kernel, params);
				const context = JSON.stringify(params);
				expect(cad.report.valid, context).toBe(true);
				expect(cad.report.solidCount, context).toBe(1);
				expect(cad.report.volumeMm3 / analyticVolume(params), context).toBeCloseTo(1, 8);
				expect(cad.report.relativeVolumeError, context).toBeLessThan(1e-8);
				expect(cad.report.stepRoundTripValid, context).toBe(true);
				expect(cad.report.stepRoundTripRelativeVolumeError, context).toBeLessThan(1e-8);
				const step = new TextDecoder().decode(cad.step);
				expect(step, context).toContain('ISO-10303-21');
				expect(step, context).toContain('MANIFOLD_SOLID_BREP');
			}
		} finally {
			kernel.finalize();
		}
	}, 120000);
	it('solves deep refinement with inertia against the independent native fixture', async () => {
		const kernel = await initialize({ print: () => {}, printErr: () => {} });
		kernel.initialize();
		kernel.option.setNumber('General.Terminal', 0);
		try {
			const reference = deepReference.stats;
			const result = await runBrowserAnalysis(kernel, {
				...deepReference.request,
				refinementLevel: 3,
				loadCase: {
					...deepReference.request.loadCase,
					forceN: deepReference.request.loadCase.forceN as [number, number, number],
					inertia: {
						originAccelerationMps2: deepReference.request.loadCase.inertia
							.originAccelerationMps2 as [number, number, number],
						angularVelocityRadS: deepReference.request.loadCase.inertia.angularVelocityRadS as [
							number,
							number,
							number
						],
						angularAccelerationRadS2: deepReference.request.loadCase.inertia
							.angularAccelerationRadS2 as [number, number, number]
					}
				}
			});
			expect(result.stats.solveResidualRelative).toBeLessThan(1e-7);
			expect(result.stats.forceBalanceRelative).toBeLessThan(1e-5);
			expect(result.stats.momentBalanceRelative).toBeLessThan(1e-5);
			expect(
				Math.abs(result.stats.maxDisplacementMm / reference.maxDisplacementMm - 1)
			).toBeLessThan(0.05);
			expect(Math.abs(result.stats.strainEnergyNmm / reference.strainEnergyNmm - 1)).toBeLessThan(
				0.05
			);
			for (let i = 0; i < 3; i++)
				expect(Math.abs(result.stats.bodyForceN![i] - reference.bodyForceN[i])).toBeLessThan(1);
			console.info(
				'WASM inertia/deep refinement validation',
				JSON.stringify({
					stats: result.stats,
					runtime: result.runtime,
					displacementDifference: result.stats.maxDisplacementMm / reference.maxDisplacementMm - 1,
					energyDifference: result.stats.strainEnergyNmm / reference.strainEnergyNmm - 1
				})
			);
		} finally {
			kernel.finalize();
		}
	}, 120000);
	it('balances a nonbaseline thin long rod and returns an exact zero field for zero load', async () => {
		const kernel = await initialize({ print: () => {}, printErr: () => {} });
		kernel.initialize();
		kernel.option.setNumber('General.Terminal', 0);
		try {
			const params = {
				...DEFAULT_DESIGN_PARAMS,
				rodLengthMm: 160,
				rodWidthMm: 14,
				rodDepthMm: 12,
				webMm: 2,
				flangeMm: 2
			};
			const forceN: [number, number, number] = [500, 12000, -300];
			const result = await runBrowserAnalysis(kernel, {
				params,
				loadCase: { forceN, label: 'Thin long rod under prescribed oblique tension' }
			});
			expect(result.stats.strainEnergyNmm).toBeGreaterThan(0);
			expect(result.stats.maxDisplacementMm).toBeGreaterThan(0);
			expect(result.stats.solveResidualRelative).toBeLessThan(1e-7);
			expect(result.stats.forceBalanceRelative).toBeLessThan(1e-5);
			expect(result.stats.momentBalanceRelative).toBeLessThan(1e-5);
			// External traction work must equal twice the internally integrated strain energy.
			const externalWork = forceN.reduce(
				(sum, force, axis) => sum + force * result.stats.loadedMeanDisplacementMm[axis],
				0
			);
			expect(Math.abs(externalWork / (2 * result.stats.strainEnergyNmm) - 1)).toBeLessThan(1e-7);
			const zero = await runBrowserAnalysis(kernel, {
				params: DEFAULT_DESIGN_PARAMS,
				loadCase: {
					forceN: [0, 0, 0],
					label: 'Zero force and zero inertia',
					inertia: {
						originAccelerationMps2: [0, 0, 0],
						angularVelocityRadS: [0, 0, 0],
						angularAccelerationRadS2: [0, 0, 0]
					}
				}
			});
			for (const field of [zero.surface.displacementMm, zero.surface.vonMisesMpa])
				expect(field.every((v) => v === 0)).toBe(true);
			for (const field of [
				zero.stats.appliedN,
				zero.stats.reactionN,
				zero.stats.appliedMomentNmm!,
				zero.stats.reactionMomentNmm!,
				zero.stats.bodyForceN!
			])
				expect(field.every((v) => v === 0)).toBe(true);
			for (const key of [
				'strainEnergyNmm',
				'maxDisplacementMm',
				'forceBalanceRelative',
				'momentBalanceRelative',
				'solveResidualRelative',
				'solveIterations',
				'p95VonMisesMpa',
				'p99VonMisesMpa',
				'rawMaxElementVonMisesMpa'
			] as const)
				expect(zero.stats[key]).toBe(0);
		} finally {
			kernel.finalize();
		}
	}, 120000);
});
