import { describe, expect, it } from 'vitest';
import {
	V12_CYLINDERS,
	V12_MOTION_DATUMS,
	v12CylinderPose,
	v12MechanicalPhase,
	v12NativeToDisplay,
	v12NativeVectorToDisplay
} from './v12-kinematics';

describe('measured V12 source kinematics', () => {
	it('maps exactly twelve unique source piston, rod and liner occurrences', () => {
		expect(V12_CYLINDERS).toHaveLength(12);
		for (const key of ['pistonId', 'rodId', 'linerId'] as const) {
			expect(new Set(V12_CYLINDERS.map((cylinder) => cylinder[key])).size).toBe(12);
		}
		expect(V12_MOTION_DATUMS.configuration.sweptDisplacementLiters).toBeCloseTo(6.809402, 6);
	});

	it('keeps both ends connected through two revolutions on the measured bore axes', () => {
		let maximumClosure = 0;
		let maximumAxisResidual = 0;
		for (let phase = 0; phase <= 720; phase += 1) {
			for (const cylinder of V12_CYLINDERS) {
				const pose = v12CylinderPose(cylinder, phase);
				const [sx, sy, sz] = pose.pistonPinMm;
				const [bx, by, bz] = pose.crankPinMm;
				maximumClosure = Math.max(
					maximumClosure,
					Math.abs(Math.hypot(sx - bx, sy - by, sz - bz) - cylinder.rodLengthMm)
				);
				maximumAxisResidual = Math.max(
					maximumAxisResidual,
					Math.abs(sx * cylinder.bankAxis[1] - sy * cylinder.bankAxis[0])
				);
			}
		}
		expect(maximumClosure).toBeLessThan(1e-9);
		expect(maximumAxisResidual).toBeLessThan(1e-9);
	});

	it('reaches a measured 100 mm stroke at each cylinder’s own dead centres', () => {
		for (const cylinder of V12_CYLINDERS) {
			const top = v12CylinderPose(cylinder, -cylinder.nativeMechanicalPhaseDeg);
			const bottom = v12CylinderPose(cylinder, 180 - cylinder.nativeMechanicalPhaseDeg);
			expect(top.pistonTravelMm).toBeCloseTo(0, 8);
			expect(bottom.pistonTravelMm).toBeCloseTo(100, 8);
			expect(top.mechanicalPhaseDeg).toBeCloseTo(0, 8);
		}
	});

	it('preserves native source coordinates at rest and repeats for reverse playback and 720°', () => {
		for (const cylinder of V12_CYLINDERS) {
			for (const phase of [0, 360, 720, -360]) {
				expect(v12CylinderPose(cylinder, phase).pistonPinMm).toEqual(cylinder.pistonPinCenterMm);
				expect(v12CylinderPose(cylinder, phase).crankPinMm).toEqual(cylinder.rodBigEndCenterMm);
			}
			expect(v12CylinderPose(cylinder, -43.5)).toEqual(v12CylinderPose(cylinder, 676.5));
		}
	});

	it('applies the audited right-handed native-to-display basis without translating vectors', () => {
		const scale = V12_MOTION_DATUMS.displayScale / 1000;
		expect(v12NativeVectorToDisplay([1, 0, 0])).toEqual([0, 0, -scale]);
		expect(v12NativeVectorToDisplay([0, 1, 0])).toEqual([0, scale, -0]);
		expect(v12NativeVectorToDisplay([0, 0, 1])).toEqual([scale, 0, -0]);
		const origin = v12NativeToDisplay([0, 0, 0]);
		// Independently inspected GLB crank sprocket 0663 and flywheel bounds share this Y/Z axis.
		expect(origin[1]).toBeCloseTo(-1.2916, 5);
		expect(origin[2]).toBeCloseTo(0, 5);
	});

	it('rejects nonfinite phase before it can poison render matrices', () => {
		expect(() => v12MechanicalPhase(Number.NaN)).toThrow(RangeError);
		expect(() => v12MechanicalPhase(Infinity)).toThrow(RangeError);
	});
});
