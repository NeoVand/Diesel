import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { V12RunningRig } from './v12-running-rig';
import { V12_MOTION_INVENTORY } from '../engine/v12-motion-inventory';

function snapshot(rig: V12RunningRig, angle: number, inspection = 0) {
	return new Map([...rig.matricesForPhase(angle, inspection)].map(([id, m]) => [id, m.clone()]));
}
function distance(a: THREE.Matrix4, b: THREE.Matrix4) {
	return Math.max(...a.elements.map((v, i) => Math.abs(v - b.elements[i])));
}

describe('complete running-engine integration', () => {
	it('binds every rigid source body and preserves scale through inspection transitions', () => {
		const rig = new V12RunningRig();
		try {
			const rest = snapshot(rig, 0);
			for (const amount of [0, 0.35, 1]) {
				const pose = snapshot(rig, 2311.25, amount);
				for (const body of V12_MOTION_INVENTORY.filter((b) => b.motion === 'rigid')) {
					expect(pose.has(body.componentId), body.componentId).toBe(true);
					expect(pose.get(body.componentId)!.determinant(), body.componentId).toBeCloseTo(1, 8);
				}
				if (amount === 1)
					for (const [id, matrix] of pose)
						expect(distance(matrix, rest.get(id)!)).toBeLessThan(1e-10);
			}
			expect(rig.getDiagnostics().inventory.unresolved).toEqual([]);
		} finally {
			rig.dispose();
		}
	});

	it('does not reset the chains or turbo rotors at the 720-degree display wrap', () => {
		const rig = new V12RunningRig();
		try {
			const before = snapshot(rig, 720 - 1e-5);
			const after = snapshot(rig, 720 + 1e-5);
			for (const [id, matrix] of after)
				expect(distance(matrix, before.get(id)!), id).toBeLessThan(1e-4);
			const replay = snapshot(rig, 2914.75);
			rig.matricesForPhase(52);
			for (const [id, matrix] of snapshot(rig, 2914.75))
				expect(distance(matrix, replay.get(id)!)).toBeLessThan(1e-10);
		} finally {
			rig.dispose();
		}
	});
});
