import { describe, expect, it } from 'vitest';
import { V12_CYLINDERS, v12CylinderPose } from './v12-kinematics';
import {
	V12_ANALYSIS_CYLINDERS,
	createV12KinematicCurve,
	v12KinematicMeasurement
} from './v12-analysis';

describe('source V12 geometric analysis', () => {
	it('resolves each source piston, rod and liner to the same measured linkage', () => {
		expect(V12_ANALYSIS_CYLINDERS).toHaveLength(12);
		for (const cylinder of V12_CYLINDERS) {
			const measurement = v12KinematicMeasurement(cylinder.pistonId, 35);
			expect(v12KinematicMeasurement(cylinder.rodId, 35)).toEqual(measurement);
			expect(v12KinematicMeasurement(cylinder.linerId, 35)).toEqual(measurement);
			expect(measurement.rodLengthMm).toBeCloseTo(125, 8);
			expect(measurement.crankThrowMm).toBeCloseTo(50, 8);
			expect(measurement.strokeMm).toBeCloseTo(100, 8);
		}
	});

	it('matches renderer displacement and independently measured rod inclinations over a full turn', () => {
		for (const cylinder of V12_CYLINDERS) {
			for (let phase = 0; phase <= 360; phase += 7.5) {
				const measurement = v12KinematicMeasurement(cylinder.pistonId, phase);
				const pose = v12CylinderPose(cylinder, phase);
				expect(measurement.displacementMm).toBe(pose.pistonTravelMm);
				const dot = pose.pistonPinMm.reduce(
					(sum, coordinate, index) =>
						sum + (coordinate - pose.crankPinMm[index]) * cylinder.bankAxis[index],
					0
				);
				const inclination = (Math.acos(Math.min(1, dot / cylinder.rodLengthMm)) * 180) / Math.PI;
				expect(Math.abs(measurement.rodAngleDeg)).toBeCloseTo(inclination, 7);
				expect(Math.abs(measurement.rodAngleDeg)).toBeLessThanOrEqual(
					(Math.asin(50 / 125) * 180) / Math.PI + 1e-8
				);
			}
		}
	});

	it('reports the actual dead centres and periodic curves without inventing cylinder firing timing', () => {
		for (const cylinder of V12_CYLINDERS) {
			const top = v12KinematicMeasurement(cylinder.pistonId, -cylinder.nativeMechanicalPhaseDeg);
			const bottom = v12KinematicMeasurement(
				cylinder.pistonId,
				180 - cylinder.nativeMechanicalPhaseDeg
			);
			expect(top.displacementMm).toBeCloseTo(0, 8);
			expect(top.rodAngleDeg).toBeCloseTo(0, 8);
			expect(bottom.displacementMm).toBeCloseTo(100, 8);
			expect(bottom.rodAngleDeg).toBeCloseTo(0, 8);
			const curve = createV12KinematicCurve(cylinder.pistonId);
			expect(curve).toHaveLength(181);
			expect(curve[0]).toEqual({ ...curve.at(-1), phaseDeg: 0 });
			expect(curve.at(-1)?.phaseDeg).toBe(360);
			expect(Object.isFrozen(curve)).toBe(true);
			expect(Object.isFrozen(curve[0])).toBe(true);
		}
	});

	it('rejects unsupported parts, nonfinite phase and unbounded curve requests', () => {
		expect(() => v12KinematicMeasurement('mech:piston:01', 0)).toThrow(RangeError);
		expect(() => v12KinematicMeasurement('v12-0014', Infinity)).toThrow(RangeError);
		for (const count of [0, 1.5, 11, 1441, NaN])
			expect(() => createV12KinematicCurve('v12-0014', count)).toThrow(RangeError);
	});
});
