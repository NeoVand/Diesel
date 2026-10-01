import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
	V12_TURBO_DATUMS,
	V12_TURBO_PLAYBACK,
	V12TurboRig,
	v12TurboAngleAtTime
} from './v12-turbo';
import { v12NativeToDisplay, v12NativeVectorToDisplay } from '../engine/v12-kinematics';

const identity = new THREE.Matrix4().toArray();

describe('purchased turbo rotor kinematics', () => {
	it('assigns exactly the eight actual rotors to four measured coaxial shaft pairs', () => {
		const rig = new V12TurboRig();
		const matrices = rig.matricesAtTime(0.0005);
		expect([...matrices.keys()]).toEqual([
			'v12-0799',
			'v12-0800',
			'v12-0805',
			'v12-0806',
			'v12-0811',
			'v12-0812',
			'v12-0817',
			'v12-0818'
		]);
		for (const shaft of V12_TURBO_DATUMS.shafts) {
			expect(matrices.get(shaft.compressorId)).toBe(matrices.get(shaft.turbineId));
			for (const id of shaft.fixedHousingIds) expect(matrices.has(id)).toBe(false);
			expect(shaft.validation.coaxialResidualMm).toBeLessThan(1e-6);
			expect(shaft.validation.axisParallelError).toBeLessThan(1e-10);
		}
	});

	it('keeps every shaft axis fixed, preserves scale and rotates source geometry by a quarter turn', () => {
		const matrices = new V12TurboRig().matricesAtTime(0.0005, 30_000);
		for (const shaft of V12_TURBO_DATUMS.shafts) {
			const matrix = matrices.get(shaft.compressorId)!;
			const pivot = new THREE.Vector3(...v12NativeToDisplay(shaft.pivotMm));
			const axis = new THREE.Vector3(...v12NativeVectorToDisplay(shaft.axis)).normalize();
			const axisPoint = pivot.clone().addScaledVector(axis, 2.3);
			expect(axisPoint.clone().applyMatrix4(matrix).distanceTo(axisPoint)).toBeLessThan(1e-12);
			const radial = new THREE.Vector3(0, 1, 0).cross(axis).normalize();
			const rotated = pivot.clone().add(radial).applyMatrix4(matrix).sub(pivot);
			expect(rotated.length()).toBeCloseTo(1, 12);
			expect(rotated.dot(radial)).toBeCloseTo(0, 12);
			expect(rotated.distanceTo(axis.clone().cross(radial))).toBeLessThan(1e-12);
			expect(matrix.determinant()).toBeCloseTo(1, 12);
		}
	});

	it('samples independent speeds without any crank-angle input', () => {
		const matrices = new V12TurboRig().matricesAtTime(0.0005, {
			'turbo-1': 0,
			'turbo-2': 30_000,
			'turbo-3': 60_000,
			'turbo-4': 90_000
		});
		expect(matrices.get('v12-0799')!.toArray()).toEqual(identity);
		for (const [id, angle] of [
			['v12-0805', Math.PI / 2],
			['v12-0811', Math.PI],
			['v12-0817', Math.PI * 1.5]
		] as const) {
			const rotation = new THREE.Matrix3().setFromMatrix4(matrices.get(id)!);
			const trace = rotation.elements[0] + rotation.elements[4] + rotation.elements[8];
			expect(trace).toBeCloseTo(1 + 2 * Math.cos(angle), 12);
		}
		expect(V12_TURBO_PLAYBACK.speedBasis).toContain('no mechanical crank coupling');
	});

	it('returns the exact source pose at zero and is invariant to pause, backwards seek and frame history', () => {
		const rig = new V12TurboRig();
		const snapshot = (time: number) =>
			[...rig.matricesAtTime(time)].map(([id, m]) => [id, m.toArray()]);
		const reference = snapshot(0.01039);
		for (const time of [0.6, 2.71, -0.03, 0, 10.35, 0.01039, 0.01039]) snapshot(time);
		expect(snapshot(0.01039)).toEqual(reference);
		for (const matrix of rig.matricesAtTime(0).values()) expect(matrix.toArray()).toEqual(identity);
		expect(v12TurboAngleAtTime(60 / 30_000, 30_000)).toBe(0);
	});

	it('rejects nonfinite or negative speed without corrupting any previously sampled pose', () => {
		const rig = new V12TurboRig();
		const matrices = rig.matricesAtTime(0.0003);
		const before = [...matrices.values()].map((m) => m.toArray());
		for (const time of [NaN, Infinity, -Infinity])
			expect(() => rig.matricesAtTime(time)).toThrow(RangeError);
		for (const speed of [NaN, Infinity, -1]) {
			expect(() => rig.matricesAtTime(0.001, { 'turbo-4': speed })).toThrow(RangeError);
		}
		expect([...matrices.values()].map((m) => m.toArray())).toEqual(before);
	});
});
