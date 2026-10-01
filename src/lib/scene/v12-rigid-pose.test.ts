import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { V12RigidPoseBlend } from './v12-rigid-pose';

describe('corrected mechanism disassembly pose', () => {
	it('returns to the derived rest pose instead of the flawed purchased placement', () => {
		const blend = new V12RigidPoseBlend();
		const rest = new THREE.Matrix4().makeRotationX(0.3).setPosition(1, 2, 3);
		const source = rest.clone();
		blend.capture(new Map([['link', rest]]));
		// Rig matrices are reused; capture must not hold the mutable frame result.
		rest.makeRotationX(2.8).setPosition(5, 6, 7);
		const out = new THREE.Matrix4();
		blend.apply('link', rest, 1, out);
		out.elements.forEach((value, index) => expect(value).toBeCloseTo(source.elements[index], 12));
		blend.apply('link', rest, 0.5, out);
		expect(new THREE.Vector3().setFromMatrixPosition(out).toArray()).toEqual([3, 4, 5]);
		expect(out.determinant()).toBeCloseTo(1, 12);
		expect(rest.elements).toEqual(new THREE.Matrix4().makeRotationX(2.8).setPosition(5, 6, 7).elements);
	});
});
