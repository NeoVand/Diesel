import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import intake from '../engine/v12-intake-flow-field.json';
import intakeRight from '../engine/v12-intake-flow-field-1.json';
import intakeLeft from '../engine/v12-intake-flow-field-2.json';
import exhaust from '../engine/v12-exhaust-flow-field.json';
import { v12NativeToDisplay } from '../engine/v12-kinematics';
import { DIRECTED_FLOW_PITCH_MM, DIRECTED_FLOW_SPEED_MM_S } from './directed-flow-volume';
import { nativeFlowPresentationPath } from './native-flow-particles';

function tangent(points: readonly number[], offset: number, end: number) {
	return new THREE.Vector3()
		.fromArray(points, end)
		.sub(new THREE.Vector3().fromArray(points, offset))
		.normalize();
}

describe('native fluid advection direction audit', () => {
	it('enters every intake mouth and leaves each solved path toward its cylinder in all 3 valve masks', () => {
		for (const field of [intake, intakeRight, intakeLeft])
			for (const path of field.paths) {
				const entry = field.ports[path.inletPort];
				const exit = field.ports[path.outletPort];
				expect([0, 2]).toContain(path.inletPort);
				expect([1, 3]).toContain(path.outletPort);
				// Inward CAD axis at all four intake caps; source samples run inward at
				// the external supply caps and outward from the manifold at the head caps.
				expect(
					tangent(path.positionsMm, 0, 3).dot(new THREE.Vector3(...entry.axis))
				).toBeGreaterThan(0.9);
				const n = path.positionsMm.length;
				expect(
					tangent(path.positionsMm, n - 6, n - 3).dot(new THREE.Vector3(...exit.axis))
				).toBeLessThan(-0.9);
			}
	});

	it('all 7 exhaust masks flow from head caps to collector outlets, including placed bank transforms', () => {
		for (const variant of exhaust.variants)
			for (const path of variant.paths)
				for (const instance of exhaust.instances) {
					const placed = path.positionsMm.map(
						(value, index) => value * instance.scale[index % 3] + instance.translationMm[index % 3]
					);
					const entryAxis = exhaust.ports[path.inletPort].axis.map((v, i) => v * instance.scale[i]);
					const exitAxis = exhaust.ports[0].axis.map((v, i) => v * instance.scale[i]);
					expect(path.outletPort).toBe(0);
					expect(path.inletPort).toBeGreaterThan(0);
					expect(tangent(placed, 0, 3).dot(new THREE.Vector3(...entryAxis))).toBeGreaterThan(0.4);
					const n = placed.length;
					expect(tangent(placed, n - 6, n - 3).dot(new THREE.Vector3(...exitAxis))).toBeGreaterThan(
						0.9
					);
				}
	});

	it('uses one nonaliased physical display cadence instead of eight repeats per short solved path', () => {
		let shortest = Infinity;
		for (const source of exhaust.variants.flatMap((variant) => variant.paths)) {
			const positions = new Float32Array(source.positionsMm.length);
			for (let i = 0; i < source.positionsMm.length; i += 3)
				positions.set(v12NativeToDisplay(source.positionsMm.slice(i, i + 3)), i);
			const path = nativeFlowPresentationPath({
				positions,
				times: source.timesSeconds,
				duration: source.durationSeconds,
				offset: 0,
				instanceIndex: 0,
				mask: 1,
				gainIndex: 0
			});
			shortest = Math.min(shortest, path.duration);
			expect(path.parcels).toBe(Math.ceil(path.lengthMm / DIRECTED_FLOW_PITCH_MM));
			for (let i = 1; i < path.times.length; i++)
				expect(path.times[i]).toBeGreaterThan(path.times[i - 1]);
		}
		expect(shortest).toBeGreaterThan(0);
		// Default 36 degrees/s → 0.4 presentation seconds/s. Even a 15 Hz view
		// gets more than 16 frames per repeated density feature, rather than <1.
		const featuresPerSecond = (0.4 * DIRECTED_FLOW_SPEED_MM_S) / DIRECTED_FLOW_PITCH_MM;
		expect(featuresPerSecond).toBeLessThan(1);
	});
});
