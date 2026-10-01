import { describe, expect, it } from 'vitest';
import { V12_CYLINDERS, v12CylinderPose } from './v12-kinematics';
import { v12ProcessCycle, v12TeachingRevolution } from './v12-process-cycle';
import { v12CylinderValveState, V12_VALVE_CYCLES } from './v12-valve-events';

describe('illustrative diesel cycle tied to source crank geometry', () => {
	it('assigns twelve evenly spaced firing TDCs, each at the actual geometric TDC', () => {
		const events = V12_CYLINDERS.map((cylinder) => {
			const phase =
				(((-cylinder.nativeMechanicalPhaseDeg - v12TeachingRevolution(cylinder)) % 720) + 720) %
				720;
			expect(v12CylinderPose(cylinder, phase).pistonTravelMm).toBeCloseTo(0, 9);
			expect(v12ProcessCycle(cylinder, phase + 0.000001).cycleDeg).toBeCloseTo(0, 4);
			return phase;
		}).sort((a, b) => a - b);
		for (let index = 0; index < 12; index++)
			expect((((events[(index + 1) % 12] - events[index]) % 720) + 720) % 720).toBeCloseTo(60, 8);
	});
	it('uses actual corrected-cam lift, including early exhaust opening and late intake closing', () => {
		for (const cylinder of V12_CYLINDERS) {
			const event = V12_VALVE_CYCLES.find((c) => c.pistonId === cylinder.pistonId)!;
			for (let phase = 0; phase < 720; phase += 2) {
				const cycle = v12ProcessCycle(cylinder, phase);
				const valves = v12CylinderValveState(cylinder.pistonId, phase);
				expect(cycle.intake).toBeCloseTo(
					Math.min(1, valves.intake.curtainAreaMm2 / (2 * Math.PI * 12.5 ** 2)),
					12
				);
				expect(cycle.exhaust).toBeCloseTo(
					Math.min(1, valves.exhaust.curtainAreaMm2 / (2 * Math.PI * 12.5 ** 2)),
					12
				);
				for (const value of [cycle.intake, cycle.exhaust, cycle.injection, cycle.combustion]) {
					expect(value).toBeGreaterThanOrEqual(0);
					expect(value).toBeLessThanOrEqual(1);
				}
			}
			expect(v12ProcessCycle(cylinder, event.compressionTdcCrankDeg + 550).intake).toBeGreaterThan(
				0
			);
			expect(v12ProcessCycle(cylinder, event.compressionTdcCrankDeg + 170).exhaust).toBeGreaterThan(
				0
			);
			expect(v12ProcessCycle(cylinder, event.compressionTdcCrankDeg).intake).toBe(0);
			expect(v12ProcessCycle(cylinder, event.compressionTdcCrankDeg).exhaust).toBe(0);
		}
	});
	it('is deterministic under pause, backwards seek and whole cycle repetition', () => {
		const cylinder = V12_CYLINDERS[0];
		for (const angle of [-360, -5, 0, 125, 719, 720, 1500]) {
			const a = v12ProcessCycle(cylinder, angle),
				b = v12ProcessCycle(cylinder, angle + 720);
			expect(a.cycleDeg).toBeCloseTo(b.cycleDeg, 9);
			expect(a.stroke).toBe(b.stroke);
			expect(a.combustion).toBeCloseTo(b.combustion, 9);
			expect(v12ProcessCycle(cylinder, angle)).toEqual(a);
		}
		expect(() => v12ProcessCycle(cylinder, NaN)).toThrow(RangeError);
	});
	it('shows injection near compression TDC and heat release after ignition without a spark event', () => {
		const cylinder = V12_CYLINDERS[0];
		const tdc = -cylinder.nativeMechanicalPhaseDeg - v12TeachingRevolution(cylinder);
		expect(v12ProcessCycle(cylinder, tdc - 8).injection).toBeGreaterThan(0);
		expect(v12ProcessCycle(cylinder, tdc - 8).combustion).toBe(0);
		expect(v12ProcessCycle(cylinder, tdc + 3).igniting).toBe(true);
		expect(v12ProcessCycle(cylinder, tdc + 25).combustion).toBeGreaterThan(0.8);
		expect(v12ProcessCycle(cylinder, tdc + 80).combustion).toBe(0);
	});
});
