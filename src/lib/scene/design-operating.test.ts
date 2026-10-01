import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { BASELINE_DESIGN } from '$lib/design/design-core';
import { createOperatingCycle, DEFAULT_OPERATING_SCENARIO } from '$lib/design/operating-cycle';
import { crankTrainPoses } from './design-geometry';
import {
	normalizeOperatingPhase,
	operatingVisualSample,
	referencePlaneVectorToWorld
} from './design-operating';

describe('operating-cycle visualization', () => {
	it('preserves both revolutions and distinguishes firing TDC from gas-exchange TDC', () => {
		const cycle = createOperatingCycle(BASELINE_DESIGN);
		expect(normalizeOperatingPhase(361)).toBe(361);
		expect(normalizeOperatingPhase(721)).toBe(1);
		expect(normalizeOperatingPhase(-1)).toBe(719);
		expect(() => normalizeOperatingPhase(NaN)).toThrow();
		const firing = operatingVisualSample(cycle, 0),
			exchange = operatingVisualSample(cycle, 360);
		expect(firing.pressureBar).toBeGreaterThan(exchange.pressureBar * 10);
		expect(operatingVisualSample(cycle, 720)).toEqual(firing);
		expect(operatingVisualSample(cycle, 360).angleDeg).toBe(360);
	});

	it('maps rod-local pin forces into the same physical crank plane as the dynamics solver', () => {
		for (const params of [
			BASELINE_DESIGN,
			{ ...BASELINE_DESIGN, strokeMm: 125, rodLengthMm: 110 }
		]) {
			const cycle = createOperatingCycle(params, { ...DEFAULT_OPERATING_SCENARIO }, 145);
			for (const sample of cycle.samples) {
				const pose = crankTrainPoses(params, sample.angleDeg)[0];
				for (const [local, planar] of [
					[sample.smallEndForceLocalN, sample.smallEndForceOnRodN],
					[sample.bigEndForceLocalN, sample.bigEndForceOnRodN]
				] as const) {
					const actual = new THREE.Vector3(...local).applyQuaternion(pose.rodRotation);
					const expected = referencePlaneVectorToWorld(planar);
					expect(actual.distanceTo(expected)).toBeLessThan(1e-8);
				}
				const relativePin = pose.pin.clone().setX(0);
				expect(relativePin.distanceTo(referencePlaneVectorToWorld(sample.crankPinMm))).toBeLessThan(
					1e-10
				);
			}
		}
	});

	it('interpolates field values without inventing a new force or mutating the sampled solution', () => {
		const cycle = createOperatingCycle(BASELINE_DESIGN);
		const before = structuredClone(cycle.samples[45]);
		const visual = operatingVisualSample(cycle, 45.25),
			a = cycle.samples[45],
			b = cycle.samples[46];
		expect(visual.pressureBar).toBeCloseTo(a.pressureBar * 0.75 + b.pressureBar * 0.25, 12);
		for (let i = 0; i < 3; i++)
			expect(visual.smallEndForceLocalN[i]).toBeCloseTo(
				a.smallEndForceLocalN[i] * 0.75 + b.smallEndForceLocalN[i] * 0.25,
				10
			);
		expect(cycle.samples[45]).toEqual(before);
	});
});
