import { describe, expect, it } from 'vitest';
import {
	DEFAULT_DESIGN_PARAMS,
	DESIGN_MATERIAL,
	ROD_INTERFACES,
	createKinematicCurve,
	evaluateDesign,
	evaluateRod,
	paretoFront,
	profileAreaMm2,
	rodVolumeMm3,
	rodFieldAt,
	sectionShearAreaMm2,
	searchRodDesigns,
	sliderCrankSample,
	solveBeamFem,
	validateDesign,
	verifyDesign,
	type DesignCandidate
} from './design-core';

const baseline = { ...DEFAULT_DESIGN_PARAMS };

describe('parametric engine geometry', () => {
	it('preserves measured baseline dimensions and displacement', () => {
		const { kinematics } = evaluateDesign(baseline);
		expect(kinematics.displacementLiters).toBeCloseTo(6.809402076655877, 12);
		expect(kinematics.meanPistonSpeedMps).toBe(6);
		expect(kinematics.rodRatio).toBe(2.5);
		expect(ROD_INTERFACES.bigEndInnerRadiusMm).toBe(25);
		expect(ROD_INTERFACES.smallEndInnerRadiusMm).toBe(9);
	});
	it('closes the linkage through a full turn for bounding geometries', () => {
		for (const strokeMm of [75, 100, 125])
			for (const rodLengthMm of [110, 125, 160]) {
				const params = { ...baseline, strokeMm, rodLengthMm };
				for (const sample of createKinematicCurve(params)) {
					expect(
						Math.hypot(
							sample.pistonPinMm[0] - sample.crankPinMm[0],
							sample.pistonPinMm[1] - sample.crankPinMm[1]
						)
					).toBeCloseTo(rodLengthMm, 10);
					expect(sample.displacementMm).toBeGreaterThanOrEqual(-1e-10);
					expect(sample.displacementMm).toBeLessThanOrEqual(strokeMm + 1e-10);
				}
				expect(sliderCrankSample(params, 0).displacementMm).toBeCloseTo(0, 12);
				expect(sliderCrankSample(params, 180).displacementMm).toBeCloseTo(strokeMm, 12);
			}
	});
	it('analytic velocity and acceleration agree with independent time differences', () => {
		const dt = 1e-6;
		const degreesPerSecond = baseline.rpm * 6;
		for (const angle of [0, 15, 60, 95, 150, 200, 270, 335]) {
			const left = sliderCrankSample(baseline, angle - degreesPerSecond * dt);
			const right = sliderCrankSample(baseline, angle + degreesPerSecond * dt);
			const centre = sliderCrankSample(baseline, angle);
			expect((right.displacementMm - left.displacementMm) / 1000 / (2 * dt)).toBeCloseTo(
				centre.velocityMps,
				5
			);
			expect((right.velocityMps - left.velocityMps) / (2 * dt)).toBeCloseTo(
				centre.accelerationMps2,
				3
			);
		}
	});
	it('computes actual union mass rather than double-counting ring/rectangle overlaps', () => {
		// Independent midpoint integration of the union footprint at each y.
		for (const width of [2, 6, 14, 28]) {
			const {
				bigEndOuterRadiusMm: rb,
				smallEndOuterRadiusMm: rs,
				bigEndInnerRadiusMm: hb,
				smallEndInnerRadiusMm: hs
			} = ROD_INTERFACES;
			const step = 0.001,
				start = -rb,
				end = baseline.rodLengthMm + rs;
			let integrated = 0;
			const chord = (r: number, y: number) => (Math.abs(y) < r ? 2 * Math.sqrt(r * r - y * y) : 0);
			for (let y = start + step / 2; y < end; y += step) {
				const outer = Math.max(
					chord(rb, y),
					chord(rs, y - baseline.rodLengthMm),
					y >= 0 && y <= baseline.rodLengthMm ? width : 0
				);
				integrated += (outer - chord(hb, y) - chord(hs, y - baseline.rodLengthMm)) * step;
			}
			expect(Math.abs(profileAreaMm2(width, baseline.rodLengthMm) - integrated)).toBeLessThan(
				0.001
			);
		}
		const rod = evaluateRod(baseline);
		expect(rod.massKg).toBeCloseTo(rodVolumeMm3(baseline) * DESIGN_MATERIAL.densityKgPerMm3, 12);
		expect(rod.massKg).toBeGreaterThan(rod.shankMassKg);
	});
	it('rejects nonfinite, out-of-bounds and invalid cross-section input', () => {
		for (const invalid of [
			{ ...baseline, rpm: NaN },
			{ ...baseline, webMm: 10 },
			{ ...baseline, flangeMm: 8 },
			{ ...baseline, strokeMm: 500 }
		]) {
			expect(validateDesign(invalid).length).toBeGreaterThan(0);
			expect(() => evaluateDesign(invalid)).toThrow(RangeError);
		}
		expect(() => createKinematicCurve(baseline, 10000)).toThrow(RangeError);
	});
});

describe('rod engineering screen and independent 1D FE check', () => {
	it('exposes consistent beam fields and leaves unassessed eye/shoulder regions blank', () => {
		const rod = evaluateRod(baseline);
		const y = ROD_INTERFACES.bigEndOuterRadiusMm + rod.spanMm / 2;
		const field = rodFieldAt(baseline, y, -baseline.rodDepthMm / 2);
		expect(Math.abs(field.stressMpa)).toBeCloseTo(rod.stressMpa, 12);
		expect(field.displacementMm).toBeCloseTo(rod.deflectionMm, 12);
		expect(field.inBeam).toBe(true);
		expect(rodFieldAt(baseline, 0, 0).inBeam).toBe(false);
		expect(rodFieldAt(baseline, baseline.rodLengthMm, 0).inBeam).toBe(false);
		const fe = solveBeamFem(baseline, 16);
		for (let i = 0; i <= 16; i++)
			expect(
				rodFieldAt(baseline, ROD_INTERFACES.bigEndOuterRadiusMm + (rod.spanMm * i) / 16, 0)
					.displacementMm
			).toBeCloseTo(fe.displacementsMm[i], 10);
	});
	it('matches the independent three-rectangle parallel-axis section sum', () => {
		const rod = evaluateRod(baseline),
			b = baseline.rodWidthMm,
			h = baseline.rodDepthMm,
			t = baseline.flangeMm;
		const webHeight = h - 2 * t;
		const strong =
			(baseline.webMm * webHeight ** 3) / 12 +
			2 * ((b * t ** 3) / 12 + b * t * (h / 2 - t / 2) ** 2);
		expect(rod.iStrongMm4).toBeCloseTo(strong, 10);
		expect(rod.areaMm2).toBe(2 * b * t + baseline.webMm * webHeight);
	});
	it('satisfies load, stiffness, length and unit scaling', () => {
		const rod = evaluateRod(baseline);
		const doubled = evaluateRod({
			...baseline,
			loadKn: baseline.loadKn * 2,
			lateralLoadN: baseline.lateralLoadN * 2
		});
		expect(doubled.stressMpa).toBeCloseTo(2 * rod.stressMpa, 12);
		expect(doubled.deflectionMm).toBeCloseTo(2 * rod.deflectionMm, 12);
		expect(doubled.bucklingFactor).toBeCloseTo(rod.bucklingFactor / 2, 12);
		const longer = evaluateRod({ ...baseline, rodLengthMm: 160 });
		expect(longer.bendingDeflectionMm / rod.bendingDeflectionMm).toBeCloseTo(
			(longer.spanMm / rod.spanMm) ** 3,
			12
		);
		expect(longer.shearDeflectionMm / rod.shearDeflectionMm).toBeCloseTo(
			longer.spanMm / rod.spanMm,
			12
		);
		expect(longer.bucklingLoadKn / rod.bucklingLoadKn).toBeCloseTo(
			(rod.spanMm / longer.spanMm) ** 2,
			12
		);
	});
	it('includes the short-section shear energy and treats Euler only as a reference', () => {
		const rod = evaluateRod(baseline);
		expect(sectionShearAreaMm2(baseline)).toBeCloseTo(64.80844085805971, 10);
		expect(rod.shearDeflectionMm).toBeCloseTo(0.003725264305576129, 12);
		expect(rod.deflectionMm).toBeCloseTo(rod.bendingDeflectionMm + rod.shearDeflectionMm, 12);
		expect(rod.elasticBucklingApplicable).toBe(false);
		expect(rod.constraints.some((c) => c.id === 'buckling')).toBe(false);
	});
	it('independent FE solution matches the analytical central-load beam for several sections', () => {
		for (const params of [
			baseline,
			{ ...baseline, rodWidthMm: 14, rodDepthMm: 12, webMm: 2, flangeMm: 2 },
			{ ...baseline, rodLengthMm: 160, lateralLoadN: 1700 }
		]) {
			const report = verifyDesign(params);
			expect(report.passed).toBe(true);
			expect(report.meshes).toHaveLength(4);
			expect(report.maxRelativeError).toBeLessThan(1e-7);
			const fem = solveBeamFem(params, 16);
			expect(fem.displacementsMm[0]).toBe(0);
			expect(fem.displacementsMm.at(-1)).toBe(0);
			for (let i = 0; i < fem.displacementsMm.length; i++)
				expect(fem.displacementsMm[i]).toBeCloseTo(fem.displacementsMm.at(-1 - i)!, 9);
		}
	});
	it('handles zero transverse loading without invented deformation', () => {
		const params = { ...baseline, lateralLoadN: 0 };
		expect(evaluateRod(params).deflectionMm).toBe(0);
		expect(evaluateRod(params).bendingStressMpa).toBe(0);
		expect(verifyDesign(params).passed).toBe(true);
		expect(solveBeamFem(params).displacementsMm.every((value) => value === 0)).toBe(true);
	});
	it('reports violated limits and explicitly bounded screening constraints', () => {
		expect(evaluateRod(baseline).feasible).toBe(true);
		const weak = evaluateRod({
			...baseline,
			rodWidthMm: 14,
			rodDepthMm: 12,
			flangeMm: 2,
			webMm: 2,
			loadKn: 50
		});
		expect(weak.feasible).toBe(false);
		expect(weak.constraints.find((c) => c.id === 'stress')?.passed).toBe(false);
		for (const c of weak.constraints) expect(c.passed).toBe(c.utilization <= 1);
	});
});

describe('deterministic constrained design search', () => {
	it('finds a feasible lighter design, checks its finalist and keeps fixed interfaces/operating conditions', async () => {
		const progress: number[] = [];
		const result = await searchRodDesigns(baseline, (p) => progress.push(p.evaluated));
		expect(result.evaluated).toBe(1681);
		expect(result.feasibleCount).toBeGreaterThan(0);
		expect(result.best?.rod.feasible).toBe(true);
		expect(result.best!.rod.massKg).toBeLessThan(result.baseline.rod.massKg);
		expect(result.verification?.passed).toBe(true);
		expect(progress.at(-1)).toBe(result.evaluated);
		for (const candidate of result.candidates) {
			for (const key of [
				'boreMm',
				'strokeMm',
				'rodLengthMm',
				'rpm',
				'loadKn',
				'lateralLoadN'
			] as const)
				expect(candidate.params[key]).toBe(baseline[key]);
		}
		for (let i = 1; i < result.pareto.length; i++) {
			expect(result.pareto[i].rod.massKg).toBeGreaterThanOrEqual(result.pareto[i - 1].rod.massKg);
			expect(result.pareto[i].rod.complianceMmPerN).toBeLessThan(
				result.pareto[i - 1].rod.complianceMmPerN
			);
		}
	});
	it('removes dominated points and retains actual tradeoffs', () => {
		const rod = evaluateRod(baseline);
		const points: DesignCandidate[] = [
			[1, 3],
			[2, 2],
			[3, 1],
			[4, 2],
			[2, 4]
		].map(([massKg, complianceMmPerN], i) => ({
			id: `${i}`,
			params: baseline,
			rod: { ...rod, massKg, complianceMmPerN }
		}));
		expect(paretoFront(points).map((p) => p.id)).toEqual(['0', '1', '2']);
	});
	it('cancels at a bounded batch boundary without returning stale results', async () => {
		let cancel = false;
		await expect(
			searchRodDesigns(
				baseline,
				() => {
					cancel = true;
				},
				() => cancel
			)
		).rejects.toThrow('cancelled');
	});
});
