import { describe, expect, it } from 'vitest';
import {
	DEFAULT_V12_CYCLE_CASE as base,
	integrateV12CylinderCycle,
	solveV12PeriodicCycle,
	v12CycleVolume,
	v12CycleHeatBetween,
	v12ReservoirFlow,
	sampleV12CylinderCycle
} from './v12-cylinder-cycle';
import { V12_CYLINDERS, v12CylinderPose } from './v12-kinematics';
import { V12_VALVE_CYCLES } from './v12-valve-events';
import { V12_CYCLE_STUDY, sampleV12CycleStudy } from './v12-cycle-study';
import reference from '../../../references/00_Active_V12/cycle-verification/independent-reference.json';

describe('source-based open-cylinder air-standard cycle', () => {
	it('uses the same measured piston motion while keeping assumed clearance volume explicit', () => {
		const cylinder = V12_CYLINDERS.find((c) => c.pistonId === base.pistonId)!;
		const tdc = V12_VALVE_CYCLES.find((c) => c.pistonId === base.pistonId)!.compressionTdcCrankDeg;
		const area = (Math.PI * 0.085 ** 2) / 4;
		for (let a = 0; a <= 720; a += 2) {
			const v = v12CycleVolume(a, base.compressionRatio);
			expect(((v.volumeM3 - v.clearanceM3) / area) * 1000).toBeCloseTo(
				v12CylinderPose(cylinder, a + tdc).pistonTravelMm,
				8
			);
			const h = 1e-3;
			expect(v.volumeDerivativeM3PerDeg).toBeCloseTo(
				(v12CycleVolume(a + h).volumeM3 - v12CycleVolume(a - h).volumeM3) / (2 * h),
				12
			);
		}
		expect(v12CycleVolume(180).volumeM3 / v12CycleVolume(0).volumeM3).toBeCloseTo(16, 12);
	});
	it('recovers the closed adiabatic motored solution without heat or valve flow', () => {
		const scenario = {
			...base,
			valveAreaScale: 0,
			heatInputPerCycleJ: 0,
			wallCoefficientWPerM2K: 0
		};
		const result = integrateV12CylinderCycle(scenario, { stepDeg: 0.25 });
		const start = result.samples[0];
		for (const sample of result.samples) {
			const ratio = start.volumeM3 / sample.volumeM3;
			expect(sample.massKg).toBe(start.massKg);
			expect(
				Math.abs(sample.pressurePa / (start.pressurePa * ratio ** base.gamma) - 1)
			).toBeLessThan(1e-8);
			expect(
				Math.abs(sample.temperatureK / (start.temperatureK * ratio ** (base.gamma - 1)) - 1)
			).toBeLessThan(1e-8);
		}
		expect(Math.abs(result.balance.workByGasJ)).toBeLessThan(1e-5);
	});
	it('allows reverse flow and transports donor enthalpy with the NASA choking limit', () => {
		const gamma = 1.4,
			R = 287.05,
			A = 1e-4,
			Cd = 0.65,
			pu = 2e5,
			T = 400;
		const expected =
			Cd *
			A *
			pu *
			Math.sqrt(gamma / (R * T)) *
			(2 / (gamma + 1)) ** ((gamma + 1) / (2 * (gamma - 1)));
		const inward = v12ReservoirFlow(0.5e5, 900, pu, T, A);
		const outward = v12ReservoirFlow(pu, T, 0.5e5, 900, A);
		expect(inward.choked).toBe(true);
		expect(inward.massFlowKgS).toBeCloseTo(expected, 12);
		expect(outward.massFlowKgS).toBeCloseTo(-expected, 12);
		expect(outward.enthalpyFlowW).toBeCloseTo(((-expected * gamma * R) / (gamma - 1)) * T, 8);
		expect(v12ReservoirFlow(pu, T, pu, T, A).massFlowKgS).toBe(0);
		const subsonic = v12ReservoirFlow(1.9e5, T, pu, T, A);
		expect(subsonic.choked).toBe(false);
		expect(subsonic.massFlowKgS).toBeGreaterThan(0);
		expect(subsonic.massFlowKgS).toBeLessThan(expected);
	});
	it('integrates the prescribed heat exactly across cycle wrap and arbitrary partitions', () => {
		for (const start of [-1000.5, -4, 0, 71.2, 700])
			expect(v12CycleHeatBetween(start, start + 720, base)).toBeCloseTo(950, 10);
		let sum = 0;
		for (let i = 0; i < 2000; i++) sum += v12CycleHeatBetween(i * 0.36, (i + 1) * 0.36, base);
		expect(sum).toBeCloseTo(950, 9);
	});
	it('converges to a positive periodic state and closes signed mass and first-law balances', () => {
		const result = solveV12PeriodicCycle(base, { stepDeg: 0.125, tolerance: 1e-9 });
		expect(result.periodic.converged).toBe(true);
		expect(result.periodic.cycles).toBeLessThan(20);
		expect(
			result.samples.every(
				(s) => s.massKg > 0 && s.pressurePa > 0 && s.temperatureK > 0 && s.internalEnergyJ > 0
			)
		).toBe(true);
		expect(Math.abs(result.balance.massResidualKg)).toBeLessThan(1e-12);
		expect(Math.abs(result.balance.energyResidualJ)).toBeLessThan(1e-7);
		expect(result.balance.heatInputJ).toBeCloseTo(950, 8);
		expect(result.balance.massIntakeKg).toBeGreaterThan(0);
		expect(result.balance.massExhaustKg).toBeLessThan(0);
		expect(result.summary.intakeReverseFlowKg).toBeGreaterThan(4e-6);
		expect(result.samples.some((s) => s.intakeMassFlowKgS < 0)).toBe(true);
		expect(result.samples.some((s) => s.wallHeatIntoGasJPerDeg > 0)).toBe(true);
		expect(result.samples.some((s) => s.wallHeatIntoGasJPerDeg < 0)).toBe(true);
	});
	it('agrees with independent DOP853 and a half-step refinement', () => {
		const fine = solveV12PeriodicCycle(base, { stepDeg: 0.0625, tolerance: 1e-9 });
		const coarse = solveV12PeriodicCycle(base, { stepDeg: 0.125, tolerance: 1e-9 });
		expect(Math.abs(coarse.balance.workByGasJ / fine.balance.workByGasJ - 1)).toBeLessThan(1e-5);
		for (const r of reference.samples) {
			const s = fine.samples[r.angleDeg * 16];
			for (const key of ['pressurePa', 'temperatureK', 'massKg', 'internalEnergyJ'] as const)
				expect(Math.abs(s[key] / r[key] - 1)).toBeLessThan(5e-5);
		}
		for (const s of fine.samples) {
			const interpolated = sampleV12CycleStudy(s.angleDeg);
			expect(Math.abs(interpolated.pressurePa / s.pressurePa - 1)).toBeLessThan(5e-4);
		}
	});
	it('samples the saved case without seek history and reports failed convergence honestly', () => {
		for (const angle of [-360.125, 0, 0.01, 123.5, 719.999, 10000]) {
			const a = sampleV12CycleStudy(angle),
				b = sampleV12CycleStudy(angle + 720);
			expect(a.pressurePa).toBeCloseTo(b.pressurePa, 7);
			expect(a.temperatureK).toBeCloseTo(b.temperatureK, 9);
			expect(a).toEqual(sampleV12CylinderCycle(V12_CYCLE_STUDY, angle));
		}
		expect(solveV12PeriodicCycle(base, { maxCycles: 1 }).periodic.converged).toBe(false);
		expect(() => sampleV12CycleStudy(Infinity)).toThrow();
		expect(() => integrateV12CylinderCycle({ ...base, rpm: 0 })).toThrow();
		expect(() =>
			integrateV12CylinderCycle(base, { initialState: { massKg: -1, internalEnergyJ: 20 } })
		).toThrow();
	});
});
