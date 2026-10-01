import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { removeRedundantSourceTriangles } from './source-components';

describe('source display mesh cleanup', () => {
	it('removes a repeated oriented face while preserving its reversed thin-sheet skin', () => {
		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute(
			'position',
			new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3)
		);
		geometry.setIndex([0, 1, 2, 1, 2, 0, 0, 2, 1]);
		expect(removeRedundantSourceTriangles(geometry)).toBe(1);
		expect([...geometry.index!.array]).toEqual([0, 1, 2, 0, 2, 1]);
		expect(geometry.getAttribute('position').count).toBe(3);
		geometry.dispose();
	});
	it('preserves distinct nearby faces rather than welding a thin physical gap', () => {
		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute(
			'position',
			new THREE.Float32BufferAttribute(
				[0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0.000001, 1, 0, 0.000001, 0, 1, 0.000001],
				3
			)
		);
		geometry.setIndex([0, 1, 2, 3, 4, 5]);
		expect(removeRedundantSourceTriangles(geometry)).toBe(0);
		expect(geometry.index!.count).toBe(6);
		geometry.dispose();
	});
});
