import { describe, expect, it } from 'vitest';
import {
	V12_VALVES,
	V12_VALVE_CYCLES,
	V12_CAM_CRANK_OFFSETS_DEG,
	v12ValveLift,
	v12CylinderValveState
} from './v12-valve-events';
import { V12_CYLINDERS, v12CylinderPose } from './v12-kinematics';

describe('source-profile corrected valve events', () => {
	it('maps every real valve, tappet, guide, seat and coil fragment exactly once', () => {
		expect(V12_VALVES).toHaveLength(48);
		for (const key of ['valveId', 'tappetId', 'seatId', 'guideId'] as const)
			expect(new Set(V12_VALVES.map((v) => v[key])).size).toBe(48);
		const springIds = V12_VALVES.flatMap((v) => v.spring.parts.map((p) => p.id));
		expect(springIds).toHaveLength(336);
		expect(new Set(springIds).size).toBe(336);
		expect(Object.keys(V12_CAM_CRANK_OFFSETS_DEG)).toHaveLength(4);
		const events = V12_VALVE_CYCLES.map((c) => c.compressionTdcCrankDeg).sort((a, b) => a - b);
		expect(new Set(events.map((e) => e.toFixed(6))).size).toBe(12);
		for (let i = 0; i < 12; i++)
			expect((events[(i + 1) % 12] - events[i] + 720) % 720).toBeCloseTo(60, 6);
	});
	it('is deterministic and720-degree periodic, including reverse and unwrapped drive angles', () => {
		for (const v of V12_VALVES)
			for (const angle of [-1080.25, -0.1, 0, 123.456, 719.999, 25000.25])
				expect(v12ValveLift(v, angle + 720)).toBeCloseTo(v12ValveLift(v, angle), 10);
		expect(() => v12ValveLift(V12_VALVES[0], Infinity)).toThrow();
		expect(() => v12ValveLift('missing', 0)).toThrow();
	});
	it('keeps both valve families seated through the compression TDC injection window', () => {
		for (const cycle of V12_VALVE_CYCLES)
			for (let d = -12; d <= 12; d += 0.25) {
				const state = v12CylinderValveState(cycle.pistonId, cycle.compressionTdcCrankDeg + d);
				expect(state.intake.liftMm).toBe(0);
				expect(state.exhaust.liftMm).toBe(0);
			}
	});
	it('places real-profile main lift in intake/exhaust strokes of the declared cycle', () => {
		for (const cycle of V12_VALVE_CYCLES) {
			for (const role of ['intake', 'exhaust'] as const) {
				let max = 0,
					at = 0;
				for (let d = 0; d < 720; d++) {
					const state = v12CylinderValveState(cycle.pistonId, cycle.compressionTdcCrankDeg + d);
					if (state[role].liftMm > max) {
						max = state[role].liftMm;
						at = d;
					}
				}
				expect(max).toBeGreaterThan(5);
				expect(at).toBeGreaterThan(role === 'intake' ? 430 : 230);
				expect(at).toBeLessThan(role === 'intake' ? 490 : 290);
			}
		}
	});
	it('maintains conservative piston crown-plane clearance through a quarter-degree720-degree sweep', () => {
		let minimum = Infinity;
		for (const v of V12_VALVES) {
			const cylinder = V12_CYLINDERS.find((c) => c.pistonId === v.cylinderPistonId)!;
			for (let phase = 0; phase <= 720; phase += 0.25) {
				const pose = v12CylinderPose(cylinder, phase);
				const along = pose.pistonPinMm.reduce((s, x, i) => s + x * cylinder.bankAxis[i], 0);
				const clearance =
					v.clearance.closedValveMinimumAlongBankMm -
					v12ValveLift(v, phase) * v.clearance.axisBankDot -
					along -
					v.clearance.pistonCrownOffsetMm;
				minimum = Math.min(minimum, clearance);
			}
		}
		expect(minimum).toBeGreaterThan(0.5);
	});
	it('bounds curtain areas by the actual source seat bores and rejects unknown cylinders', () => {
		for (const cycle of V12_VALVE_CYCLES)
			for (let phase = 0; phase < 720; phase += 7.5) {
				const s = v12CylinderValveState(cycle.pistonId, phase);
				for (const r of [s.intake, s.exhaust]) {
					expect(r.curtainAreaMm2).toBeGreaterThanOrEqual(0);
					expect(r.curtainAreaMm2).toBeLessThanOrEqual(2 * Math.PI * 12.5 ** 2 + 1e-8);
				}
			}
		expect(() => v12CylinderValveState('bad', 0)).toThrow();
	});
});
