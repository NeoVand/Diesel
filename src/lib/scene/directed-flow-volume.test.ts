import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
	DIRECTED_FLOW_SPEED_MM_S,
	DirectedFlowVolume,
	directedFlowPulse
} from './directed-flow-volume';

describe('directed connection envelopes', () => {
	it('a density feature advances downstream at the declared display speed, including negative seeks', () => {
		for (const time of [-3, 0, 0.3, 18])
			for (const distance of [0, 4, 53, 500])
				expect(
					directedFlowPulse(distance + DIRECTED_FLOW_SPEED_MM_S * 0.15, time + 0.15)
				).toBeCloseTo(directedFlowPulse(distance, time), 10);
	});
	it('updates only uniforms while respecting gates, sections, hiding and disposal', () => {
		const volume = new DirectedFlowVolume(
			[
				{
					id: 'upstream-to-downstream',
					pointsMm: [
						[0, 0, 0],
						[0, 100, 0]
					],
					gate: 0,
					radiusMm: 4
				},
				{
					id: 'closed-branch',
					pointsMm: [
						[0, 100, 0],
						[0, 150, 30]
					],
					gate: 1,
					radiusMm: 4
				}
			],
			0x83dded,
			'Connection test'
		);
		const attribute = volume.mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
		const version = attribute.version;
		volume.update(1, true, [1, 0], null);
		expect(volume.getDiagnostics()).toMatchObject({ routes: 2, activeRoutes: 1, drawCalls: 1 });
		volume.update(2, true, [0, 1], new THREE.Plane(new THREE.Vector3(1, 0, 0), 2));
		expect(attribute.version).toBe(version);
		expect(volume.mesh.material.uniforms.uHasClip.value).toBe(1);
		expect(volume.mesh.material.uniforms.uPlane.value.toArray()).toEqual([1, 0, 0, 2]);
		volume.update(3, false, [1, 1], null);
		expect(volume.mesh.visible).toBe(false);
		volume.dispose();
		volume.dispose();
		volume.update(4, true, [1, 1], null);
		expect(volume.mesh.visible).toBe(false);
	});
});
