import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import datums from './v12-spray-impact-datums.json';
import { V12_VALVE_CYCLES } from './v12-valve-events';
import { V12_SPRAY_ASSUMPTIONS, V12_SPRAY_LIFETIME_SECONDS } from './v12-spray';
import { getV12SprayImpactAge, v12SpraySurvivesWall } from './v12-spray-impact';
import { LICENSED_CHAMBER_PATH, licensedChamberAvailable } from '../scene/chamber-test-fixture';

describe('deterministic first contact against moving chamber walls', () => {
	it('covers all cylinders and parcel identities in the precomputed impact table', () => {
		expect(datums.cylinders.map((c) => c.pistonId).sort()).toEqual(
			V12_VALVE_CYCLES.map((c) => c.pistonId).sort()
		);
		expect(datums.provenance.assumptions).toEqual(V12_SPRAY_ASSUMPTIONS);
		for (const cylinder of datums.cylinders) {
			expect(cylinder.firstImpactAgeSeconds).toHaveLength(640);
			for (const age of cylinder.firstImpactAgeSeconds) {
				if (age === null) continue;
				expect(age).toBeGreaterThan(0);
				expect(age).toBeLessThanOrEqual(V12_SPRAY_LIFETIME_SECONDS);
			}
		}
	});
	it.skipIf(!licensedChamberAvailable)(
		'licensed asset: impact table matches the source chamber binary',
		() => {
			const binary = readFileSync(LICENSED_CHAMBER_PATH);
			expect(createHash('sha256').update(binary).digest('hex')).toBe(
				datums.provenance.sourceBinarySha256
			);
		}
	);
	it('cannot resurrect an absorbed parcel during expansion or after reverse seeks', () => {
		// This actual source-domain parcel previously reappeared at +6.4° ATDC.
		const id = 'v12-0003',
			index = 590;
		const first = getV12SprayImpactAge(id, index)!;
		expect(first).toBeGreaterThan(0);
		expect(first).toBeLessThan(0.0006886574074074054);
		for (const age of [first, 0.0006886574074074054, V12_SPRAY_LIFETIME_SECONDS])
			expect(v12SpraySurvivesWall(id, index, age)).toBe(false);
		expect(v12SpraySurvivesWall(id, index, first / 2)).toBe(true);
		expect(v12SpraySurvivesWall(id, index, first * 1.01)).toBe(false);
	});
	it('keeps absorbing contact monotone across every precomputed trajectory', () => {
		for (const cylinder of datums.cylinders)
			cylinder.firstImpactAgeSeconds.forEach((age, index) => {
				if (age === null) {
					expect(v12SpraySurvivesWall(cylinder.pistonId, index, V12_SPRAY_LIFETIME_SECONDS)).toBe(
						true
					);
					return;
				}
				expect(v12SpraySurvivesWall(cylinder.pistonId, index, age - 1e-12)).toBe(true);
				expect(v12SpraySurvivesWall(cylinder.pistonId, index, age)).toBe(false);
				expect(v12SpraySurvivesWall(cylinder.pistonId, index, age + 1e-12)).toBe(false);
			});
	});
	it('rejects invalid inputs instead of silently assigning a different parcel', () => {
		expect(() => getV12SprayImpactAge('unknown', 0)).toThrow();
		for (const index of [-1, 640, 0.5, Infinity])
			expect(() => getV12SprayImpactAge('v12-0003', index)).toThrow();
		for (const age of [-1, Infinity, NaN])
			expect(() => v12SpraySurvivesWall('v12-0003', 0, age)).toThrow();
	});
});
