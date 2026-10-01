import { describe, expect, it } from 'vitest';
import {
	MECHANISM_CONFIG,
	TEACHING_GEOMETRY,
	calculateTeachingChamber,
	advancePhase,
	bankToWorld,
	calculateMechanism,
	countPhaseCrossings,
	cylinderPhases,
	strokeForPhase,
	wrapPhase
} from './mechanism';

describe('constrained nominal slider-crank', () => {
	it('produces the 190 mm stroke at dead centers and preserves its nominal compression ratio', () => {
		const top = calculateMechanism(0);
		const bottom = calculateMechanism(180);
		expect(top.pistonDisplacementMm).toBe(0);
		expect(bottom.pistonDisplacementMm).toBe(190);
		expect(top.pistonPinYmm - bottom.pistonPinYmm).toBe(190);
		expect(bottom.cylinderVolumeL / top.cylinderVolumeL).toBeCloseTo(14.7, 10);
		expect(top.sweptVolumeL * 12).toBeCloseTo(51.75145578258467, 9);
	});

	it('keeps the rod endpoints connected at constant length and the crank pin on its orbit', () => {
		for (let angle = 0; angle <= 720; angle += 3) {
			const state = calculateMechanism(angle);
			const pinDistance = Math.hypot(state.crankPinXmm, state.pistonPinYmm - state.crankPinYmm);
			expect(pinDistance).toBeCloseTo(350, 9);
			expect(Math.hypot(state.crankPinXmm, state.crankPinYmm)).toBeCloseTo(95, 9);
			expect(state.pistonDisplacementMm).toBeGreaterThanOrEqual(-1e-10);
			expect(state.pistonDisplacementMm).toBeLessThanOrEqual(190 + 1e-10);
		}
	});

	it('includes rod obliquity instead of approximating the piston with a sine', () => {
		const state = calculateMechanism(90);
		expect(state.pistonPinYmm).toBeCloseTo(Math.sqrt(350 ** 2 - 95 ** 2), 9);
		expect(state.pistonDisplacementMm).toBeGreaterThan(95);
		const longerRod = calculateMechanism(90, { rodLengthMm: 450 });
		expect(longerRod.pistonDisplacementMm).toBeLessThan(state.pistonDisplacementMm);
		expect(
			Math.hypot(longerRod.crankPinXmm, longerRod.pistonPinYmm - longerRod.crankPinYmm)
		).toBeCloseTo(450, 9);
	});

	it('repeats geometry after 360 degrees and the full cycle after 720 degrees', () => {
		const start = calculateMechanism(53.5);
		const revolution = calculateMechanism(413.5);
		const cycle = calculateMechanism(773.5);
		expect(revolution.pistonPinYmm).toBeCloseTo(start.pistonPinYmm, 10);
		expect(revolution.cycleStroke).toBe('power');
		expect(start.cycleStroke).toBe('intake');
		expect(cycle).toEqual(start);
		expect(wrapPhase(-1)).toBe(719);
		expect(wrapPhase(720)).toBe(0);
	});

	it('rejects nonfinite phase and physically impossible dimension sets', () => {
		for (const phase of [NaN, Infinity, -Infinity])
			expect(() => calculateMechanism(phase)).toThrow(RangeError);
		for (const overrides of [
			{ rodLengthMm: 95 },
			{ rodLengthMm: 0 },
			{ boreMm: -170 },
			{ strokeMm: 180 },
			{ compressionRatio: 1 },
			{ rodLengthMm: NaN }
		])
			expect(() => calculateMechanism(0, overrides)).toThrow(RangeError);
		expect(MECHANISM_CONFIG.rodLengthMm).toBe(350);
	});
});

describe('idealized four-stroke teaching events', () => {
	it('has two closed-valve strokes and gates each gas path to its declared stroke', () => {
		expect([0, 180, 360, 540, 720].map(strokeForPhase)).toEqual([
			'intake',
			'compression',
			'power',
			'exhaust',
			'intake'
		]);
		for (let angle = 0; angle < 720; angle += 2) {
			const state = calculateMechanism(angle);
			expect(state.intakeOpen && state.exhaustOpen).toBe(false);
			if (state.intakeOpen) expect(state.cycleStroke).toBe('intake');
			if (state.exhaustOpen) expect(state.cycleStroke).toBe('exhaust');
			if (state.cycleStroke === 'compression' || state.cycleStroke === 'power') {
				expect(state.intakeLift).toBe(0);
				expect(state.exhaustLift).toBe(0);
			}
		}
		expect(calculateMechanism(90).intakeLift).toBe(1);
		expect(calculateMechanism(630).exhaustLift).toBe(1);
	});

	it('restricts injection indication to the assumed compression-TDC window', () => {
		for (const angle of [0, 180, 349, 350, 370, 540, 719]) {
			expect(calculateMechanism(angle).injectionActive).toBe(false);
		}
		expect(calculateMechanism(351).injectionActive).toBe(true);
		expect(calculateMechanism(360).injectionIntensity).toBe(1);
		expect(calculateMechanism(369).injectionActive).toBe(true);
	});

	it('makes the two pedagogical bank rods share each world crank pin', () => {
		for (let global = 0; global < 720; global += 17) {
			const cylinders = cylinderPhases(global);
			for (let pair = 0; pair < 6; pair++) {
				const left = cylinders[pair * 2];
				const right = cylinders[pair * 2 + 1];
				const localLeft = calculateMechanism(left.phaseDeg);
				const localRight = calculateMechanism(right.phaseDeg);
				const a = bankToWorld(localLeft.crankPinXmm, localLeft.crankPinYmm, left.bankAngleDeg);
				const b = bankToWorld(localRight.crankPinXmm, localRight.crankPinYmm, right.bankAngleDeg);
				expect(a.xMm).toBeCloseTo(b.xMm, 8);
				expect(a.yMm).toBeCloseTo(b.yMm, 8);
				expect(left.row).toBe(right.row);
			}
		}
	});

	it('counts all firing events across skipped display frames and separates playback from rpm', () => {
		const cylinders = cylinderPhases(0);
		expect(new Set(cylinders.map((cylinder) => cylinder.id)).size).toBe(12);
		const eventsPerSecond = cylinders.reduce(
			(total, cylinder) => total + countPhaseCrossings(0, 1800 * 6, 360 + cylinder.firingOffsetDeg),
			0
		);
		expect(eventsPerSecond).toBe(180);
		expect(countPhaseCrossings(359, 2, 360)).toBe(1);
		expect(countPhaseCrossings(360, 0, 360)).toBe(0);
		expect(advancePhase(0, 1, 0.02)).toBe(216);
		expect(advancePhase(0, 1, 1)).toBe(0);
		expect(advancePhase(271, 1, 0)).toBe(271);
	});
});

describe('bounded instructional chamber and liner envelope', () => {
	it('keeps the liner, piston skirt and rings clear of the crank envelope across every cycle degree', () => {
		const g = TEACHING_GEOMETRY;
		expect(g.linerBottomMm).toBeGreaterThan(g.crankThrowEnvelopeMm);
		expect(2 * (MECHANISM_CONFIG.boreMm / 2 + g.linerWallMm)).toBeLessThan(g.cylinderPitchMm);
		for (let phase = 0; phase <= 720; phase++) {
			const k = calculateMechanism(phase);
			expect(k.pistonPinYmm + g.pistonSkirtOffsetMm).toBeGreaterThan(g.crankThrowEnvelopeMm);
			expect(k.pistonPinYmm + 0.0845 / 0.003).toBeGreaterThan(g.linerBottomMm);
			expect(k.pistonPinYmm + g.pistonCrownOffsetMm).toBeLessThan(g.linerTopMm);
		}
	});
	it('bounds spray below the nozzle and above the crown even when paused at compression TDC', () => {
		for (let phase = 0; phase <= 720; phase++) {
			const k = calculateMechanism(phase),
				chamber = calculateTeachingChamber(phase);
			expect(chamber.heightMm).toBeGreaterThan(0);
			expect(chamber.bottomMm).toBeGreaterThan(
				k.pistonPinYmm + TEACHING_GEOMETRY.pistonCrownOffsetMm
			);
			expect(chamber.topMm).toBeLessThan(TEACHING_GEOMETRY.linerTopMm);
			expect(chamber.sprayTopMm - chamber.sprayHeightMm).toBeGreaterThanOrEqual(
				chamber.bottomMm - 1e-9
			);
			expect(chamber.sprayTopMm).toBeLessThan(chamber.topMm);
			expect(chamber.sprayRadiusMm + 0.082 / 0.003).toBeLessThan(MECHANISM_CONFIG.boreMm / 2);
		}
		expect(calculateMechanism(180).compressionIntensity).toBeCloseTo(0, 10);
		expect(calculateMechanism(360).compressionIntensity).toBeCloseTo(1, 10);
		expect(calculateMechanism(355).compressionIntensity).toBeGreaterThan(0.95);
		expect(calculateMechanism(90).compressionIntensity).toBe(0);
	});
});
