import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { V12Mechanism } from './v12-mechanism';
import { V12_CYLINDERS, v12CylinderPose, v12NativeToDisplay } from '../engine/v12-kinematics';

describe('purchased source rigid motion matrices', () => {
	it('transforms the actual source rod endpoints onto the moving piston and crank pins', () => {
		const mechanism = new V12Mechanism();
		let maximumError = 0;
		for (let phase = 0; phase <= 720; phase += 3) {
			const matrices = mechanism.matricesForPhase(phase);
			for (const cylinder of V12_CYLINDERS) {
				const pose = v12CylinderPose(cylinder, phase);
				const actualSmall = new THREE.Vector3(...v12NativeToDisplay(cylinder.pistonPinCenterMm));
				const actualBig = new THREE.Vector3(...v12NativeToDisplay(cylinder.rodBigEndCenterMm));
				const pistonPin = actualSmall.clone().applyMatrix4(matrices.get(cylinder.pistonId)!);
				const crankPin = actualBig.clone().applyMatrix4(matrices.get('v12-0661')!);
				actualSmall.applyMatrix4(matrices.get(cylinder.rodId)!);
				actualBig.applyMatrix4(matrices.get(cylinder.rodId)!);
				maximumError = Math.max(
					maximumError,
					actualSmall.distanceTo(pistonPin),
					actualBig.distanceTo(crankPin),
					actualBig.distanceTo(new THREE.Vector3(...v12NativeToDisplay(pose.crankPinMm)))
				);
			}
		}
		expect(maximumError).toBeLessThan(1e-9);
	});

	it('never scales a moving source part, including during repeated seek and reversal', () => {
		const mechanism = new V12Mechanism();
		const scale = new THREE.Vector3();
		const position = new THREE.Vector3();
		const rotation = new THREE.Quaternion();
		for (const phase of [0, 123, -6, 450, 18, 720, 92, 0]) {
			for (const matrix of mechanism.matricesForPhase(phase).values()) {
				matrix.decompose(position, rotation, scale);
				expect(scale.distanceTo(new THREE.Vector3(1, 1, 1))).toBeLessThan(1e-12);
				expect(matrix.determinant()).toBeCloseTo(1, 12);
			}
		}
		for (const matrix of mechanism.matricesForPhase(0).values()) {
			expect(matrix.equals(new THREE.Matrix4())).toBe(true);
		}
	});

	it('leaves unresolved timing geometry static and reuses phase evaluation', () => {
		const mechanism = new V12Mechanism();
		const first = mechanism.matricesForPhase(20);
		expect(first.size).toBe(27);
		expect(mechanism.matricesForPhase(380)).toBe(first);
		expect(mechanism.matrixFor('v12-0664', 20).equals(new THREE.Matrix4())).toBe(true);
		expect(first.has('v12-0285')).toBe(false);
	});
});
