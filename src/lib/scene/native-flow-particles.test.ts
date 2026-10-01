import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { NativeFlowParticles, type NativeFlowState } from './native-flow-particles';
import { v12NativeToDisplay } from '../engine/v12-kinematics';
import { DIRECTED_FLOW_SPEED_MM_S, DIRECTED_FLOW_PITCH_MM } from './directed-flow-volume';
const nativeScale = Math.hypot(
	...v12NativeToDisplay([1, 0, 0]).map((v, i) => v - v12NativeToDisplay([0, 0, 0])[i])
);

class TestFlow extends NativeFlowParticles {
	update(time: number, states: NativeFlowState[], visible = true, clip: THREE.Plane | null = null) {
		this.updateParticles(time, visible, states, clip);
	}
}
const path = (mask: number) => ({
	positions: new Float32Array([0, 0, 0, 1, 0, 0]),
	times: [0, 1],
	duration: 1,
	offset: 0.03,
	instanceIndex: 0,
	gainIndex: 0,
	mask
});

describe('soft native flow presentation', () => {
	it('fades per-parcel alpha without turning normal-blended endpoint density black', () => {
		const flow = new TestFlow([path(1)], {
			color: 0x88ddff,
			name: 'test',
			blending: THREE.NormalBlending
		});
		// First parcel begins at source fraction0: it must disappear through alpha, not RGB.
		flow.update((-0.03 * 12) / DIRECTED_FLOW_SPEED_MM_S, [{ mask: 1, gains: [1] }]);
		const points = flow.group.children[0] as THREE.Points;
		const color = points.geometry.attributes.color;
		const base = new THREE.Color(0x88ddff);
		expect(color.itemSize).toBe(4);
		expect(color.getW(0)).toBeCloseTo(0, 7);
		expect(color.getX(0)).toBeCloseTo(base.r, 7);
		expect(color.getY(0)).toBeCloseTo(base.g, 7);
		expect(color.getZ(0)).toBeCloseTo(base.b, 7);
		flow.update(0.1, [{ mask: 1, gains: [0.25] }]);
		expect(color.getW(0)).toBeCloseTo(0.5, 7);
		expect(color.getX(0)).toBeCloseTo(base.r, 7);
		flow.update(0.1, [{ mask: 0, gains: [0] }]);
		expect(color.getW(0)).toBe(0);
		expect(flow.getDiagnostics().submittedParticles).toBe(0);
		flow.dispose();
	});
	it('submits only active-mask parcels and removes all geometry when the valve closes', () => {
		const flow = new TestFlow([path(1), path(2), path(3)], { color: 0x88ddff, name: 'test' });
		flow.update(0.1, [{ mask: 1, gains: [1] }]);
		const diagnostics = flow.getDiagnostics();
		expect(diagnostics.submittedParticles).toBeGreaterThan(0);
		expect(diagnostics.submittedParticles).toBeLessThan(8);
		expect(diagnostics.submittedParticles).toBeLessThan(diagnostics.allocatedParticles);
		flow.update(0.2, [{ mask: 0, gains: [0] }]);
		expect(flow.getDiagnostics().submittedParticles).toBe(0);
		expect(flow.getDiagnostics().activeParticles).toBe(0);
		flow.dispose();
	});

	it('does not resample or upload an unchanged paused frame but still moves its section plane', () => {
		const flow = new TestFlow([path(1)], { color: 0x88ddff, name: 'test' });
		const states = [{ mask: 1, gains: [0.5] }];
		flow.update(0.1, states);
		const points = flow.group.children[0] as THREE.Points<
			THREE.BufferGeometry,
			THREE.PointsMaterial
		>;
		const attribute = points.geometry.attributes.position as THREE.BufferAttribute;
		const version = attribute.version;
		flow.update(0.1, states, true, new THREE.Plane(new THREE.Vector3(1, 0, 0), 5));
		expect(attribute.version).toBe(version);
		expect(flow.getDiagnostics().frameUploads).toBe(1);
		expect(points.material.clippingPlanes?.[0].constant).toBe(5);
		// A changed valve gain is not incorrectly treated as a paused replay.
		flow.update(0.1, [{ mask: 1, gains: [0.75] }]);
		expect(attribute.version).toBeGreaterThan(version);
		flow.dispose();
	});

	it('advects downstream at the same spatial pace as connected envelopes, with no eightfold pulse alias', () => {
		const flow = new TestFlow([path(1)], { color: 0x88ddff, name: 'test' });
		flow.update(0.1, [{ mask: 1, gains: [1] }]);
		const points = flow.group.children[0] as THREE.Points;
		const position = points.geometry.attributes.position;
		expect(position.getX(0)).toBeCloseTo(
			(0.1 * DIRECTED_FLOW_SPEED_MM_S + 0.03 * 12) * nativeScale,
			6
		);
		for (let i = 1; i < flow.getDiagnostics().activeParticles; i++)
			expect(Math.abs(position.getX(i) - position.getX(i - 1)) / nativeScale).toBeCloseTo(
				DIRECTED_FLOW_PITCH_MM,
				4
			);
		const initialX = position.getX(0);
		flow.update(0.11, [{ mask: 1, gains: [1] }]);
		expect(position.getX(0)).toBeGreaterThan(initialX);
		for (let i = 0; i < flow.getDiagnostics().activeParticles; i++) {
			expect(position.getX(i)).toBeGreaterThanOrEqual(0);
			expect(position.getX(i)).toBeLessThanOrEqual(1);
			expect(position.getY(i)).toBe(0);
			expect(position.getZ(i)).toBe(0);
		}
		flow.dispose();
	});
});
