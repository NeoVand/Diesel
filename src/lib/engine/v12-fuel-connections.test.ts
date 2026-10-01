import { describe, expect, it } from 'vitest';
import chambers from './v12-chamber-datums.json';
import {
	V12_FUEL_CONNECTION_DATUMS,
	V12_FUEL_CONNECTIONS,
	V12_FUEL_RAILS,
	V12_FUEL_SUPPLY_SCOPE
} from './v12-fuel-connections';

const distance = (a: readonly number[], b: readonly number[]) =>
	Math.hypot(...a.map((value, i) => value - b[i]));

describe('native connected fuel passages', () => {
	it('uses one supply rail per bank and covers every chamber exactly once', () => {
		expect(V12_FUEL_RAILS).toHaveLength(2);
		expect(V12_FUEL_CONNECTIONS).toHaveLength(12);
		expect(V12_FUEL_CONNECTIONS.map((connection) => connection.pistonId).sort()).toEqual(
			chambers.cylinders.map((chamber) => chamber.pistonId).sort()
		);
		for (const rail of V12_FUEL_RAILS) {
			expect(rail.pistonIds).toHaveLength(6);
			expect(rail.pointsMm[0]).toEqual(rail.supplyMm);
			expect(rail.pointsMm).toHaveLength(8);
			for (let i = 1; i < rail.pointsMm.length; i++) {
				const direction = rail.bank === 'negativeX' ? 1 : -1;
				expect((rail.pointsMm[i][2] - rail.pointsMm[i - 1][2]) * direction).toBeGreaterThan(0);
			}
		}
	});

	it('joins every branch to a shared rail and ends at the actual chamber nozzle', () => {
		for (const connection of V12_FUEL_CONNECTIONS) {
			const rail = V12_FUEL_RAILS.find((candidate) => candidate.id === connection.railId)!;
			const chamber = chambers.cylinders.find((c) => c.pistonId === connection.pistonId)!;
			expect(rail.bank).toBe(chamber.bank);
			expect(connection.sourceInjectorId).toBe(chamber.sourceInjectorId);
			expect(connection.sourceFaces.nozzleBore).toBe(chamber.sourceNozzleFace);
			expect(connection.pointsMm[0]).toEqual(connection.railJunctionMm);
			expect(rail.pointsMm.some((p) => distance(p, connection.railJunctionMm) < 1e-8)).toBe(true);
			expect(connection.pointsMm.at(-1)).toEqual(chamber.nozzleMm);
			expect(connection.nozzleMm).toEqual(chamber.nozzleMm);
			expect(connection.pointsMm.some((p) => distance(p, connection.injectorInletMm) < 1e-7)).toBe(
				true
			);
		}
	});

	it('contains finite continuous source paths with injector travel directed into the chamber', () => {
		for (const connection of V12_FUEL_CONNECTIONS) {
			const chamber = chambers.cylinders.find((c) => c.pistonId === connection.pistonId)!;
			for (let i = 1; i < connection.pointsMm.length; i++) {
				const current = connection.pointsMm[i];
				expect(current.every(Number.isFinite)).toBe(true);
				expect(distance(current, connection.pointsMm[i - 1])).toBeGreaterThan(1e-7);
			}
			const final = connection.pointsMm.at(-1)!;
			const previous = connection.pointsMm.at(-2)!;
			const axialTravel = final.reduce((sum, v, i) => sum + (v - previous[i]) * chamber.axis[i], 0);
			expect(axialTravel).toBeCloseTo(-102.5, 6);
			expect(connection.verifiedEmptySamples).toBeGreaterThan(50);
		}
	});

	it('keeps geometric containment evidence distinct from unsolved supply equipment and hydraulics', () => {
		expect(V12_FUEL_CONNECTION_DATUMS.validationStatus).toBe('passed');
		expect(V12_FUEL_SUPPLY_SCOPE.upstreamEquipmentModeled).toBe(false);
		expect(V12_FUEL_SUPPLY_SCOPE.pressureSolved).toBe(false);
		expect(V12_FUEL_CONNECTION_DATUMS.centerlineVerification.maximumSegmentStepMm).toBe(8);
		for (const rail of V12_FUEL_CONNECTION_DATUMS.rails) {
			expect(rail.sourceSha256).toMatch(/^[a-f0-9]{64}$/);
			expect(rail.inletRadiusMm).toBe(4);
			expect(rail.galleryRadiusMm).toBe(12);
		}
	});
});
