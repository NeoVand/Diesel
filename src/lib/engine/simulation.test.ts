import { describe, expect, it } from 'vitest';
import { parts, sources, tutorials } from './data';
import { engineSpecs } from './legacy-reference-specs';
import { calculateOperatingPoint, nominalKinematics, performanceMap } from './simulation';

describe('EM1898-00 nominal performance lookup', () => {
	it('preserves every published channel at all twelve source anchors', () => {
		for (const anchor of performanceMap) {
			const result = calculateOperatingPoint(anchor.loadPercent);
			for (const field of Object.keys(anchor) as (keyof typeof anchor)[]) {
				expect(result[field]).toBeCloseTo(anchor[field], 10);
			}
			expect(result.evidence).toBe('reported');
			expect(result.performanceNumber).toBe('EM1898-00');
			expect(result.rpm).toBe(1800);
		}
	});

	it('reproduces the selected full-load report without confusing brake and electrical power', () => {
		const result = calculateOperatingPoint(100);
		expect(result.electricalKW).toBe(1500);
		expect(result.brakeKW).toBe(1644.9);
		expect(result.fuelLh).toBe(390.8);
		expect(result.bsfc).toBe(201.9);
		expect(result.exhaustC).toBe(402.6);
		expect(result.exhaustManifoldC).toBe(618.6);
		expect(result.pressureReference).toBe('unresolved');
	});

	it('interpolates only adjacent anchors and identifies the result as interpolated', () => {
		const result = calculateOperatingPoint(62.5);
		const lower = calculateOperatingPoint(60);
		const upper = calculateOperatingPoint(70);
		expect(result.electricalKW).toBe(937.5);
		expect(result.fuelLh).toBeCloseTo(lower.fuelLh + 0.25 * (upper.fuelLh - lower.fuelLh));
		expect(result.brakeKW).toBeCloseTo(lower.brakeKW + 0.25 * (upper.brakeKW - lower.brakeKW));
		expect(result.exhaustC).toBeCloseTo(lower.exhaustC + 0.25 * (upper.exhaustC - lower.exhaustC));
		expect(result.evidence).toBe('interpolated');
	});

	it('rejects off-map and nonfinite requests instead of inventing idle or overload behavior', () => {
		for (const load of [-1, 0, 9.99, 100.01, Infinity, -Infinity, NaN]) {
			expect(() => calculateOperatingPoint(load)).toThrow(RangeError);
		}
		expect(calculateOperatingPoint(10).loadPercent).toBe(10);
		expect(calculateOperatingPoint(100).loadPercent).toBe(100);
	});

	it('derives torque and LHV efficiency from the declared fuel basis and brake power', () => {
		const result = calculateOperatingPoint(100);
		const fuelKW = (390.8 * 0.85 * 42780) / 3600;
		expect(result.fuelThermalKW).toBeCloseTo(3947.405666666667, 6);
		expect(result.efficiencyPercent).toBeCloseTo((1500 / fuelKW) * 100, 8);
		expect(result.brakeEfficiencyPercent).toBeCloseTo((1644.9 / fuelKW) * 100, 8);
		expect(result.torqueNm).toBeCloseTo(1644900 / ((1800 * 2 * Math.PI) / 60), 8);
		expect(result.efficiencyPercent).toBeLessThan(result.brakeEfficiencyPercent);
	});

	it('keeps the archived reference on its original short-stroke configuration', () => {
		expect(engineSpecs.displacementL).toBe(51.8);
		expect(engineSpecs.strokeMm).toBe(190);
		expect(nominalKinematics.computedDisplacementL).toBeCloseTo(51.751, 3);
		expect(nominalKinematics.meanPistonSpeedMs).toBeCloseTo(11.4);
		expect(nominalKinematics.cyclesPerCylinderPerSecond).toBe(15);
		expect(nominalKinematics.firingEventsPerSecond).toBe(180);
	});
});

describe('engine teaching content', () => {
	it('links every curated part and tutorial to the defined semantic ontology', () => {
		const ids = new Set(parts.map((part) => part.id));
		const sourceIds = new Set(sources.map((source) => source.id));
		expect(ids.size).toBe(9);
		for (const part of parts) {
			expect(part.sources.length).toBeGreaterThan(0);
			for (const source of part.sources) expect(sourceIds.has(source.id)).toBe(true);
		}
		for (const tutorial of tutorials) {
			expect(tutorial.steps.length).toBeGreaterThanOrEqual(4);
			for (const step of tutorial.steps) expect(ids.has(step.part)).toBe(true);
		}
	});
});
