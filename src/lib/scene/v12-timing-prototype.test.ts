import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { V12_MOTION_DATUMS, v12NativeToDisplay } from '../engine/v12-kinematics';
import {
	V12_TIMING_DATUMS,
	V12TimingPrototype,
	sampleTimingLinkFrame,
	timingChainPeriodDeg
} from './v12-timing-prototype';

const displayPerMm = V12_MOTION_DATUMS.displayScale / 1000;
const identity = new THREE.Matrix4();
const toDisplay = (point: readonly number[]) => new THREE.Vector3(...v12NativeToDisplay(point));

describe('source timing audit prototype — not enabled in the production renderer', () => {
	it('keeps every recovered source occurrence distinct and returns the exact authored rest pose', () => {
		const prototype = new V12TimingPrototype();
		const ids = [
			...V12_TIMING_DATUMS.shafts.flatMap((shaft) => shaft.componentIds),
			...V12_TIMING_DATUMS.chainLoops.flatMap((loop) => loop.links.map((link) => link.componentId))
		];
		expect(new Set(ids).size).toBe(ids.length);
		const result = prototype.matricesForPhase(0);
		expect(result.size).toBe(ids.length);
		for (const matrix of result.values()) expect(matrix.equals(identity)).toBe(true);
		expect(() => prototype.matricesForPhase(Number.NaN)).toThrow(RangeError);
	});

	it('rotates measured shaft axes in place with the recovered 30:30 then 20:40 ratio', () => {
		const prototype = new V12TimingPrototype();
		for (const phase of [90, 237, 360, 517, 720]) {
			const matrices = prototype.matricesForPhase(phase);
			for (const shaft of V12_TIMING_DATUMS.shafts) {
				const pivot = toDisplay(shaft.pivotMm);
				const matrix = matrices.get(shaft.componentIds[0])!;
				expect(pivot.clone().applyMatrix4(matrix).distanceTo(pivot)).toBeLessThan(1e-12);
				const radial = new THREE.Vector3(0, 1, 0);
				const expected = radial
					.clone()
					.applyAxisAngle(new THREE.Vector3(1, 0, 0), (-phase * shaft.crankRatio * Math.PI) / 180);
				expect(radial.transformDirection(matrix).distanceTo(expected)).toBeLessThan(1e-12);
				if (phase === 360 && shaft.crankRatio === 0.5) expect(matrix.equals(identity)).toBe(false);
				if (phase === 720) expect(matrix.equals(identity)).toBe(true);
			}
		}
	});

	it('preserves rigid pin length and scale throughout fractional, reverse and repeated seeks', () => {
		const prototype = new V12TimingPrototype();
		const point = new THREE.Vector3();
		const scale = new THREE.Vector3();
		const rotation = new THREE.Quaternion();
		for (const phase of [0, 0.5, 45, 222.33, 360, 719.99, 720, 900, 2232, -36.81, 0]) {
			const matrices = prototype.matricesForPhase(phase);
			for (const matrix of matrices.values()) {
				matrix.decompose(point, rotation, scale);
				expect(scale.distanceTo(new THREE.Vector3(1, 1, 1))).toBeLessThan(1e-12);
				expect(matrix.determinant()).toBeCloseTo(1, 12);
			}
			for (const loop of V12_TIMING_DATUMS.chainLoops) {
				for (const link of loop.links) {
					const matrix = matrices.get(link.componentId)!;
					const a = toDisplay(link.pinCentersMm[0]).applyMatrix4(matrix);
					const b = toDisplay(link.pinCentersMm[1]).applyMatrix4(matrix);
					expect(a.distanceTo(b) / displayPerMm).toBeCloseTo(link.pinDistanceMm, 9);
				}
			}
		}
	});

	it('reproduces every native link frame at each integer advance, with closed C1 interpolation', () => {
		for (const loop of V12_TIMING_DATUMS.chainLoops) {
			const count = loop.links.length;
			for (let i = 0; i < count; i++) {
				const frame = sampleTimingLinkFrame(loop, i);
				const source = loop.links[i];
				expect(frame.x).toBeCloseTo(source.centerMm[0], 11);
				expect(frame.y).toBeCloseTo(source.centerMm[1], 11);
				expect(Math.cos(frame.angle)).toBeCloseTo(source.tangent[0], 11);
				expect(Math.sin(frame.angle)).toBeCloseTo(source.tangent[1], 11);
				const h = 1e-5;
				const left = sampleTimingLinkFrame(loop, i - h);
				const right = sampleTimingLinkFrame(loop, i + h);
				for (const key of ['x', 'y'] as const) {
					const velocityLeft = (frame[key] - left[key]) / h;
					const velocityRight = (right[key] - frame[key]) / h;
					expect(Math.abs(velocityLeft - velocityRight)).toBeLessThan(0.001);
				}
				// Compare sine/cosine, since angle itself has a harmless 2π branch cut.
				for (const component of [Math.sin, Math.cos]) {
					const velocityLeft = (component(frame.angle) - component(left.angle)) / h;
					const velocityRight = (component(right.angle) - component(frame.angle)) / h;
					expect(Math.abs(velocityLeft - velocityRight)).toBeLessThan(0.001);
				}
			}
		}
	});

	it('returns identified links only at their actual circulation periods and stays continuous across 720°', () => {
		const prototype = new V12TimingPrototype();
		const periods = V12_TIMING_DATUMS.chainLoops.map(timingChainPeriodDeg);
		expect(periods).toEqual([864, 2232, 2232]);
		for (const loop of V12_TIMING_DATUMS.chainLoops) {
			const link = loop.links[0];
			const before = prototype.matricesForPhase(719.999).get(link.componentId)!.clone();
			const after = prototype.matricesForPhase(720.001).get(link.componentId)!;
			const pin = toDisplay(link.pinCentersMm[0]);
			expect(
				pin.clone().applyMatrix4(before).distanceTo(pin.clone().applyMatrix4(after)) / displayPerMm
			).toBeLessThan(0.002);
			expect(prototype.matricesForPhase(720).get(link.componentId)!.equals(identity)).toBe(false);
			for (const nativeLink of loop.links) {
				expect(
					prototype
						.matricesForPhase(timingChainPeriodDeg(loop))
						.get(nativeLink.componentId)!
						.equals(identity)
				).toBe(true);
			}
		}
	});

	it('exposes substantial existing hinge gaps instead of declaring a smooth interpolated chain closed', () => {
		const prototype = new V12TimingPrototype();
		for (const loop of V12_TIMING_DATUMS.chainLoops) {
			let maximum = 0;
			let restMaximum = 0;
			// Integer advances permute the same spatial frames; one pitch samples every fractional state.
			for (let sample = 0; sample <= 200; sample++) {
				const phase = (sample / 200) * (360 / (loop.driverTeeth * loop.driverCrankRatio));
				const matrices = prototype.matricesForPhase(phase);
				for (let i = 0; i < loop.links.length; i++) {
					const link = loop.links[i];
					const next = loop.links[(i + 1) % loop.links.length];
					const outgoing = toDisplay(link.pinCentersMm[1]).applyMatrix4(
						matrices.get(link.componentId)!
					);
					const incoming = toDisplay(next.pinCentersMm[0]).applyMatrix4(
						matrices.get(next.componentId)!
					);
					const gapMm = outgoing.distanceTo(incoming) / displayPerMm;
					maximum = Math.max(maximum, gapMm);
					if (sample === 0) restMaximum = Math.max(restMaximum, gapMm);
				}
			}
			expect(restMaximum).toBeCloseTo(loop.hingeMismatchMm.max, 9);
			expect(maximum - restMaximum).toBeLessThan(0.00001);
			// This is a rejection criterion, not a contact/clearance validation.
			expect(maximum / loop.pitchMm).toBeGreaterThan(0.14);
		}
	});

	it('records the incompatible upper-stage chain and roller-seat pitches', () => {
		const upper = V12_TIMING_DATUMS.chainLoops.find((loop) => loop.id === 'bank-positive-x')!;
		const driver = V12_TIMING_DATUMS.wheels.find((wheel) => wheel.id === upper.driverId)!;
		const cam = V12_TIMING_DATUMS.wheels.find((wheel) => wheel.id === 'v12-0289')!;
		expect(driver.toothCount / cam.toothCount).toBe(0.5);
		expect(driver.rollerSeatChordPitchMm - upper.pitchMm).toBeCloseTo(0.02544632307, 9);
		expect(upper.pitchMm - cam.rollerSeatChordPitchMm).toBeCloseTo(0.00981110767, 9);
	});
});
