import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { V12MaterialPool, applyPooledFinish } from './v12-material-pool';
import { applyV12Opacity } from './v12-opacity';

describe('opaque finish pooling', () => {
	it('shares render-equivalent finishes while preserving independent fades, selection and sections', () => {
		const pool = new V12MaterialPool();
		const a = new THREE.MeshStandardMaterial({ color: '#aabbcc', roughness: 0.3 });
		const b = a.clone();
		b.name = 'Another source component';
		const shared = pool.get(a);
		expect(pool.get(b)).toBe(shared);
		const different = a.clone();
		different.roughness = 0.6;
		expect(pool.get(different)).not.toBe(shared);
		const geometry = new THREE.BoxGeometry();
		const left = new THREE.Mesh(geometry, a),
			right = new THREE.Mesh(geometry, b);
		applyPooledFinish(left, a, shared, 1);
		applyPooledFinish(right, b, shared, 1);
		const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0.3);
		shared.clippingPlanes = [plane];
		applyPooledFinish(left, a, shared, 0.2);
		applyV12Opacity(left, 0.2, false);
		expect(left.material).toBe(a);
		expect(a.clippingPlanes?.[0]).toBe(plane);
		expect(right.material.opacity).toBe(1);
		const highlight = a.clone();
		left.material = highlight;
		applyPooledFinish(left, a, shared, 1);
		expect(left.material).toBe(highlight);
		const dispose = vi.spyOn(shared, 'dispose');
		pool.dispose();
		pool.dispose();
		expect(dispose).toHaveBeenCalledTimes(1);
		[a, b, different, highlight].forEach((m) => m.dispose());
		geometry.dispose();
	});
});
