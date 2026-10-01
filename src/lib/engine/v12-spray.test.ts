import { describe, expect, it } from 'vitest';
import { V12_CYLINDERS } from './v12-kinematics';
import { V12_VALVE_CYCLES } from './v12-valve-events';
import {
	V12_SPRAY_ASSUMPTIONS,
	V12_SPRAY_EXIT_SPEED_MM_S,
	V12_SPRAY_LIFETIME_SECONDS,
	v12SprayParcel
} from './v12-spray';

describe('declared reduced diesel spray', () => {
	it('satisfies analytic drag distance and D-squared evaporation with finite nonnegative mass', () => {
		const c = V12_CYLINDERS[0],
			tdc = V12_VALVE_CYCLES.find((v) => v.pistonId === c.pistonId)!.compressionTdcCrankDeg;
		let previousDistance = 0,
			previousDiameter = Infinity;
		for (let phase = tdc - 13; phase < tdc - 3; phase += 0.2) {
			const parcel = v12SprayParcel(c, phase, 0);
			if (!parcel) continue;
			expect(parcel.distanceMm).toBeGreaterThanOrEqual(previousDistance);
			expect(parcel.distanceMm).toBeLessThan(
				V12_SPRAY_EXIT_SPEED_MM_S * V12_SPRAY_ASSUMPTIONS.dragRelaxationSeconds
			);
			expect(parcel.diameterMm).toBeLessThanOrEqual(previousDiameter);
			expect(parcel.diameterMm ** 2).toBeCloseTo(
				V12_SPRAY_ASSUMPTIONS.initialDropletDiameterMm ** 2 -
					V12_SPRAY_ASSUMPTIONS.evaporationD2Mm2PerSecond * parcel.ageSeconds,
				12
			);
			expect(parcel.liquidMassFraction).toBeGreaterThan(0);
			previousDistance = parcel.distanceMm;
			previousDiameter = parcel.diameterMm;
		}
		expect(V12_SPRAY_LIFETIME_SECONDS).toBeGreaterThan(0);
		expect(v12SprayParcel(c, tdc + 80, 0)).toBeNull();
	});
	it('keeps the spray tied to compression TDC, with deterministic nonparallel jets', () => {
		const c = V12_CYLINDERS[0],
			tdc = V12_VALVE_CYCLES.find((v) => v.pistonId === c.pistonId)!.compressionTdcCrankDeg;
		const first = v12SprayParcel(c, tdc - 9, 0)!;
		expect(first).toEqual(v12SprayParcel(c, tdc - 9, 0));
		expect(first.direction).not.toEqual(v12SprayParcel(c, tdc - 9, 80)!.direction);
		expect(v12SprayParcel(c, tdc + 360 - 9, 0)).toBeNull();
	});
});
