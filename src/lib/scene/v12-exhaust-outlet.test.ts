import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { v12NativeToDisplay, v12NativeVectorToDisplay } from '../engine/v12-kinematics';
import { directedFlowPulse } from './directed-flow-volume';
import {
	V12ExhaustOutlet,
	V12_EXHAUST_OUTLETS,
	V12_EXHAUST_PLUME,
	v12ExhaustOutletFrame
} from './v12-exhaust-outlet';

describe('measured exhaust outlet presentation', () => {
	it('places each volume inside its measured rim and strictly along the native outward axis', () => {
		expect(V12_EXHAUST_OUTLETS.outlets.map((outlet) => outlet.componentId)).toEqual([
			'v12-0768',
			'v12-0769'
		]);
		for (const [instance, outlet] of V12_EXHAUST_OUTLETS.outlets.entries()) {
			expect(outlet.rimAngleRadians).toBeCloseTo(2 * Math.PI, 10);
			expect(outlet.centralCorridorChecks).toBe(336);
			const frame = v12ExhaustOutletFrame(instance);
			const mouth = new THREE.Vector3(...v12NativeToDisplay(outlet.centerMm));
			const outward = new THREE.Vector3(...v12NativeVectorToDisplay(outlet.axis)).normalize();
			const nativeScale = new THREE.Vector3(...v12NativeVectorToDisplay([1, 0, 0])).length();
			expect(new THREE.Vector3().applyMatrix4(frame).distanceTo(mouth)).toBeLessThan(1e-12);
			expect(frame.determinant()).toBeGreaterThan(0);
			for (let z = V12_EXHAUST_PLUME.startMm; z <= V12_EXHAUST_PLUME.lengthMm; z += 1) {
				const delta = new THREE.Vector3(0, 0, z).applyMatrix4(frame).sub(mouth);
				expect(delta.dot(outward) / nativeScale).toBeCloseTo(z, 8);
				const transverse = delta.clone().addScaledVector(outward, -delta.dot(outward));
				expect(transverse.length()).toBeLessThan(1e-10);
			}
			for (let angle = 0; angle < 2 * Math.PI; angle += 0.1) {
				const edge = new THREE.Vector3(
					Math.cos(angle) * V12_EXHAUST_PLUME.coreRadiusMm,
					Math.sin(angle) * V12_EXHAUST_PLUME.coreRadiusMm,
					0
				).applyMatrix4(frame);
				expect(edge.distanceTo(mouth) / nativeScale).toBeLessThan(outlet.rimRadiusMm);
			}
		}
	});

	it('carries a continuous density feature outward with the connected downpipe phase', () => {
		// Track the same feature for several update intervals, not whichever periodic crest is nearest.
		for (const outlet of V12_EXHAUST_OUTLETS.outlets) {
			const outward = new THREE.Vector3(...outlet.axis);
			for (let t = 0; t < 0.5; t += 0.01) {
				const distance = 3 + t * V12_EXHAUST_PLUME.speedMmS;
				expect(directedFlowPulse(distance, t)).toBeCloseTo(directedFlowPulse(3, 0), 10);
				const a = new THREE.Vector3(...outlet.centerMm).addScaledVector(outward, distance);
				const b = new THREE.Vector3(...outlet.centerMm).addScaledVector(
					outward,
					distance + 0.01 * V12_EXHAUST_PLUME.speedMmS
				);
				expect(b.sub(a).dot(outward)).toBeGreaterThan(0);
			}
		}
	});

	it('uses two soft bounded volumes with opaque depth and updates the section plane while paused', () => {
		const flow = new V12ExhaustOutlet();
		const meshes = flow.group.children as THREE.Mesh<THREE.BoxGeometry, THREE.ShaderMaterial>[];
		expect(meshes).toHaveLength(2);
		expect(meshes.every((mesh) => mesh.isMesh)).toBe(true);
		flow.update(0.25, true, null, [1, 0]);
		expect(flow.getDiagnostics().activeVolumes).toBe(1);
		expect(flow.needsDepth).toBe(true);
		const depth = new THREE.DepthTexture(320, 240);
		flow.setDepth(depth, 320, 240);
		for (const mesh of meshes) {
			expect(mesh.material.blending).toBe(THREE.NormalBlending);
			expect(mesh.material.premultipliedAlpha).toBe(true);
			expect(mesh.material.depthWrite).toBe(false);
			expect(mesh.material.uniforms.uDepth.value).toBe(depth);
			expect(mesh.material.uniforms.uResolution.value.toArray()).toEqual([320, 240]);
			expect(mesh.material.uniforms.uHasDepth.value).toBe(1);
		}
		const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 4);
		flow.update(0.25, true, plane, [1, 0]);
		expect(meshes[0].material.uniforms.uPlane.value.toArray()).toEqual([0, 1, 0, 4]);
		plane.constant = 8;
		flow.update(0.25, true, plane, [1, 0]);
		expect(meshes[0].material.uniforms.uPlane.value.toArray()).toEqual([0, 1, 0, 8]);
		flow.update(0.25, true, null, [0, 0]);
		expect(flow.getDiagnostics().activeVolumes).toBe(0);
		expect(flow.needsDepth).toBe(false);
		flow.update(0.25, false, null, [1, 1]);
		expect(flow.group.visible).toBe(false);
		flow.dispose();
		depth.dispose();
	});

	it('replays seeks, restores warmup state, and disposes shared geometry exactly once', () => {
		const flow = new V12ExhaustOutlet();
		const meshes = flow.group.children as THREE.Mesh<THREE.BoxGeometry, THREE.ShaderMaterial>[];
		const geometry = meshes[0].geometry;
		expect(meshes[1].geometry).toBe(geometry);
		const dispose = vi.spyOn(geometry, 'dispose');
		flow.update(1.5, true, null, [0.7, 0]);
		const uniforms = meshes.map((mesh) => [
			mesh.material.uniforms.uTime.value,
			mesh.material.uniforms.uGain.value
		]);
		flow.update(40, true, null, [0, 1]);
		flow.update(1.5, true, null, [0.7, 0]);
		expect(
			meshes.map((mesh) => [mesh.material.uniforms.uTime.value, mesh.material.uniforms.uGain.value])
		).toEqual(uniforms);
		const restore = flow.warmupVisibility();
		expect(meshes.every((mesh) => mesh.visible)).toBe(true);
		restore();
		expect(meshes.map((mesh) => mesh.visible)).toEqual([true, false]);
		flow.dispose();
		flow.dispose();
		expect(dispose).toHaveBeenCalledTimes(1);
		expect(flow.getDiagnostics()).toMatchObject({ activeVolumes: 0, drawObjects: 0 });
		flow.update(1, true, null, [1, 1]);
		expect(flow.group.visible).toBe(false);
	});
});
