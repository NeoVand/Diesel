import { describe, expect, it } from 'vitest';
import {
	DEFAULT_DESIGN_PARAMS,
	DESIGN_MATERIAL,
	evaluateRod,
	type DesignParams
} from './design-core';
import {
	DEFAULT_OPERATING_SCENARIO,
	OPERATING_BOUNDS,
	createOperatingCycle,
	cylinderPressureBar,
	evaluateOperatingEnvelope,
	operatingScenarioPresets,
	operatingSectionResult,
	rodMassProperties,
	screenOperatingDesigns,
	solveRodDynamics,
	structuralLoadCase,
	validateOperatingScenario
} from './operating-cycle';

const p = { ...DEFAULT_DESIGN_PARAMS };
const scenario = { ...DEFAULT_OPERATING_SCENARIO };

/** Independent scan-line integration of actual solid occupancy, not union moment formulae. */
function integrateSolid(params: DesignParams, end = params.rodLengthMm + 15) {
	const start = -32,
		count = 100000,
		dy = (end - start) / count;
	let volume = 0,
		firstY = 0,
		secondX = 0,
		secondY = 0;
	const halfDisc = (radius: number, y: number) => Math.sqrt(Math.max(0, radius * radius - y * y));
	for (let i = 0; i < count; i++) {
		const y = start + (i + 0.5) * dy;
		for (const [width, depth] of [
			[params.webMm, params.rodDepthMm - 2 * params.flangeMm],
			[params.rodWidthMm, 2 * params.flangeMm]
		]) {
			const x = Math.max(
				halfDisc(32, y),
				halfDisc(15, y - params.rodLengthMm),
				y >= 0 && y <= params.rodLengthMm ? width / 2 : 0
			);
			const h1 = halfDisc(25, y),
				h2 = halfDisc(9, y - params.rodLengthMm);
			const row = 2 * (x - h1 - h2) * depth * dy;
			volume += row;
			firstY += row * y;
			secondY += row * y * y;
			secondX += (2 / 3) * (x ** 3 - h1 ** 3 - h2 ** 3) * depth * dy;
		}
	}
	return { volume, firstY, secondX, secondY };
}

describe('authored-solid mass properties for operating loads', () => {
	it('agrees with independent occupancy integration for baseline and bounding families', () => {
		for (const design of [
			p,
			{ ...p, rodWidthMm: 28, rodDepthMm: 22, webMm: 2, flangeMm: 5, rodLengthMm: 160 },
			{ ...p, rodWidthMm: 14, rodDepthMm: 12, webMm: 6, flangeMm: 2, rodLengthMm: 110 }
		]) {
			const exact = rodMassProperties(design),
				numeric = integrateSolid(design);
			const cy = numeric.firstY / numeric.volume;
			const inertia =
				DESIGN_MATERIAL.densityKgPerMm3 *
				(numeric.secondX + numeric.secondY - numeric.volume * cy ** 2) *
				1e-6;
			expect(Math.abs(exact.volumeMm3 / numeric.volume - 1)).toBeLessThan(2e-6);
			expect(Math.abs(exact.centreOfMassMm[1] / cy - 1)).toBeLessThan(2e-6);
			expect(Math.abs(exact.inertiaZKgM2 / inertia - 1)).toBeLessThan(3e-6);
			expect(exact.massKg).toBeCloseTo(evaluateRod(design).massKg, 13);
			expect(exact.inertiaZKgM2).toBeGreaterThan(0);
		}
	});
});

describe('explicit illustrative cylinder pressure', () => {
	it('repeats every720 degrees, distinguishes the two TDCs, and has known gas-exchange plateaus', () => {
		for (const a of [-1000, -1, 0, 10, 179, 350, 361, 540, 719, 720, 3000]) {
			expect(cylinderPressureBar(p, scenario, a)).toBeCloseTo(
				cylinderPressureBar(p, scenario, a + 720),
				10
			);
		}
		expect(cylinderPressureBar(p, scenario, 260)).toBe(scenario.exhaustPressureBar);
		expect(cylinderPressureBar(p, scenario, 440)).toBe(scenario.intakePressureBar);
		expect(cylinderPressureBar(p, scenario, 0)).toBeGreaterThan(50);
		expect(cylinderPressureBar(p, scenario, 360)).toBeCloseTo(1.15, 12);
	});
	it('rejects invalid conditions and impossible sample counts rather than silently inventing loads', () => {
		expect(validateOperatingScenario(scenario)).toEqual([]);
		for (const key of Object.keys(OPERATING_BOUNDS) as (keyof typeof OPERATING_BOUNDS)[]) {
			expect(validateOperatingScenario({ ...scenario, [key]: NaN })).toHaveLength(1);
			expect(
				validateOperatingScenario({ ...scenario, [key]: OPERATING_BOUNDS[key].max + 1 })
			).toHaveLength(1);
		}
		expect(() => createOperatingCycle(p, scenario, 10)).toThrow(RangeError);
		expect(() => createOperatingCycle(p, { ...scenario, rpm: -1 })).toThrow(RangeError);
		expect(() => solveRodDynamics(p, NaN, 1000, 1, 50, 1)).toThrow(RangeError);
	});
});

describe('rigid-body pin loads', () => {
	it('reduces to a two-force member and exact static generalized gas torque at zero speed', () => {
		for (const angle of [0, 20, 90, 150, 230, 310]) {
			const s = solveRodDynamics(p, angle, 0, 0.85, 50, 1);
			expect(s.bigEndForceOnRodN[0]).toBeCloseTo(-s.smallEndForceOnRodN[0], 10);
			expect(s.bigEndForceOnRodN[1]).toBeCloseTo(-s.smallEndForceOnRodN[1], 10);
			expect(s.smallEndForceLocalN[0]).toBeCloseTo(0, 9);
			expect(Math.hypot(...s.inertia.originAccelerationMps2)).toBe(0);
			// Virtual-work reference: gas force times piston displacement derivative, independently finite-differenced.
			const eps = 1e-4;
			const lo = solveRodDynamics(p, angle - eps, 0, 0, 50, 1).pistonDisplacementMm;
			const hi = solveRodDynamics(p, angle + eps, 0, 0, 50, 1).pistonDisplacementMm;
			const reference = (s.gasForceN * (hi - lo)) / 1000 / ((2 * eps * Math.PI) / 180);
			expect(s.crankTorqueNm).toBeCloseTo(reference, 5);
		}
	});
	it('closes force and moment balances over720 degrees for bounding geometries and speeds', () => {
		for (const design of [
			p,
			{
				...p,
				strokeMm: 125,
				rodLengthMm: 110,
				rodWidthMm: 28,
				rodDepthMm: 22,
				webMm: 6,
				flangeMm: 5
			}
		]) {
			for (const rpm of [0, 600, 3600]) {
				const cycle = createOperatingCycle(design, { ...scenario, rpm }, 181);
				expect(cycle.envelope.maxForceBalanceRelative).toBeLessThan(1e-12);
				expect(cycle.envelope.maxMomentBalanceRelative).toBeLessThan(1e-11);
				for (const s of cycle.samples) {
					expect(Math.abs(s.pistonResidualN)).toBeLessThan(1e-10);
					expect(s.nominalStressMpa).toBeGreaterThanOrEqual(0);
				}
			}
		}
	});
	it('obeys independent kinetic-energy / gas-work balance including rod rotational inertia', () => {
		const rpm = 2300,
			radiansPerSecond = (rpm * Math.PI) / 30,
			degreesPerSecond = rpm * 6,
			dt = 1e-7;
		for (const angle of [5, 31, 82, 129, 175, 243, 319, 370, 612]) {
			const s = solveRodDynamics(p, angle, rpm, 1.1, 45, 1);
			const lo = solveRodDynamics(p, angle - degreesPerSecond * dt, rpm, 1.1, 45, 1);
			const hi = solveRodDynamics(p, angle + degreesPerSecond * dt, rpm, 1.1, 45, 1);
			const energyRate = (hi.kineticEnergyJ - lo.kineticEnergyJ) / (2 * dt);
			const gasPower = -s.gasForceN * s.pistonVelocityMps;
			const crankPower = s.crankTorqueNm * radiansPerSecond;
			expect(
				Math.abs(
					(gasPower - energyRate - crankPower) /
						Math.max(1, Math.abs(gasPower), Math.abs(crankPower))
				)
			).toBeLessThan(2e-8);
		}
	});
	it('has no fictitious loads at zero pressure difference and zero speed', () => {
		for (const angle of [0, 35, 90, 180, 295]) {
			const s = solveRodDynamics(p, angle, 0, 0, 1, 1);
			expect(Math.hypot(...s.smallEndForceLocalN, ...s.bigEndForceLocalN)).toBe(0);
			expect(s.nominalStressMpa).toBe(0);
			expect(s.forceBalanceRelative).toBe(0);
			expect(s.momentBalanceRelative).toBe(0);
		}
	});
	it('delivers local endpoint force and body inertia without aliasing or replacing them with centre loads', () => {
		const s = solveRodDynamics(p, 31, 2200, 0.85, 65, 1),
			load = structuralLoadCase(s);
		expect(load.forceN).toEqual(s.smallEndForceLocalN);
		expect(load.inertia).toEqual(s.inertia);
		expect(load.forceN[0]).not.toBe(0);
		expect(load.forceN[2]).toBe(0);
		load.forceN[0] = 999;
		load.inertia!.angularVelocityRadS[2] = 999;
		expect(s.smallEndForceLocalN[0]).not.toBe(999);
		expect(s.inertia.angularVelocityRadS[2]).not.toBe(999);
	});
});

describe('multi-condition nominal shank screening', () => {
	it('reduces to uniform axial stress at stationary TDC', () => {
		const s = solveRodDynamics(p, 0, 0, 1, 50, 1),
			area = 2 * p.rodWidthMm * p.flangeMm + p.webMm * (p.rodDepthMm - 2 * p.flangeMm);
		for (const cut of [32, 50, 80, 110]) {
			const section = operatingSectionResult(p, s, cut);
			expect(section.axialForceN).toBeCloseTo(-s.gasForceN, 10);
			expect(section.bendingMomentNm).toBeCloseTo(0, 12);
			expect(section.nominalStressMpa).toBeCloseTo(s.gasForceN / area, 10);
		}
		expect(() => operatingSectionResult(p, s, 31)).toThrow(RangeError);
	});
	it('matches an independent numerical integration of segment body inertia and moment', () => {
		const cutMm = 76,
			cutM = cutMm / 1000,
			numeric = integrateSolid(p, cutMm),
			rho = DESIGN_MATERIAL.densityKgPerMm3;
		for (const angle of [35, 95, 250]) {
			const sample = solveRodDynamics(p, angle, 3600, 1.1, 50, 1);
			const [ax, ay] = sample.inertia.originAccelerationMps2,
				omega = sample.rodAngularVelocityRadS,
				alpha = sample.rodAngularAccelerationRadS2;
			// Direct integrals of a(x,y)=(ax-alpha*y-omega²*x, ay+alpha*x-omega²*y).
			const m = numeric.volume * rho,
				sy = numeric.firstY * rho * 1e-3;
			const x2 = numeric.secondX * rho * 1e-6,
				y2 = numeric.secondY * rho * 1e-6;
			const fx = ax * m - alpha * sy,
				fy = ay * m - omega ** 2 * sy;
			const moment = alpha * (x2 + y2 - cutM * sy) - ax * (sy - cutM * m);
			const result = operatingSectionResult(p, sample, cutMm);
			expect(result.axialForceN).toBeCloseTo(fy - sample.bigEndForceLocalN[1], 2);
			expect(result.shearForceN).toBeCloseTo(fx - sample.bigEndForceLocalN[0], 2);
			expect(result.bendingMomentNm).toBeCloseTo(moment - cutM * sample.bigEndForceLocalN[0], 4);
		}
	});
	it('tracks actual sampled compression, tension and stress cases across explicit conditions', () => {
		const conditions = operatingScenarioPresets(scenario),
			screen = evaluateOperatingEnvelope(p, conditions);
		expect(conditions.map((s) => s.rpm)).toEqual([800, 1800, 3000]);
		for (const cycle of screen.cycles) {
			const e = cycle.envelope;
			expect(e.maxCompressionN).toBe(-cycle.samples[e.compressionSampleIndex].smallEndAxialForceN);
			expect(e.maxTensionN).toBe(cycle.samples[e.tensionSampleIndex].smallEndAxialForceN);
			expect(e.peakNominalStressMpa).toBe(cycle.samples[e.stressSampleIndex].nominalStressMpa);
			expect(cycle.samples[0].pressureBar).toBeCloseTo(cycle.samples.at(-1)!.pressureBar, 10);
			expect(cycle.samples[0].smallEndAxialForceN).toBeCloseTo(
				cycle.samples.at(-1)!.smallEndAxialForceN,
				7
			);
		}
		expect(screen.peakNominalStressMpa).toBe(
			Math.max(...screen.cycles.map((c) => c.envelope.peakNominalStressMpa))
		);
		expect(screen.cycles[2].envelope.maxTensionN).toBeGreaterThan(
			screen.cycles[1].envelope.maxTensionN
		);
		expect(screen.utilization).toBe(screen.peakNominalStressMpa / 250);
		expect(screenOperatingDesigns([p], conditions)[0].peakNominalStressMpa).toBe(
			screen.peakNominalStressMpa
		);
		expect(() => evaluateOperatingEnvelope(p, [])).toThrow(RangeError);
	});
});
