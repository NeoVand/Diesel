import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { applyV12Opacity, opacityShadowCoverage } from './v12-opacity';
import { EngineStudio } from './v12-studio';
describe('continuous X-ray material and shadow restoration', () => {
	it('retains depth writes at both sides of the former late-opacity jump and changes render queue only at full opacity', () => {
		const material = new THREE.MeshStandardMaterial();
		const mesh = new THREE.Mesh(new THREE.BoxGeometry(), material);
		for (const opacity of [0.12, 0.948, 0.952, 0.9988, 0.9992, 1]) {
			applyV12Opacity(mesh, opacity, true);
			expect(material.depthWrite).toBe(true);
			expect(material.transparent).toBe(opacity < 1);
			expect(material.opacity).toBe(opacity);
			expect(mesh.castShadow).toBe(opacityShadowCoverage(opacity) > 0);
		}
		mesh.geometry.dispose();
		material.dispose();
		mesh.customDepthMaterial?.dispose();
	});
	it('fades shadow coverage continuously instead of switching all shadows at .95', () => {
		expect(opacityShadowCoverage(0.12)).toBe(0);
		expect(opacityShadowCoverage(0)).toBe(0);
		expect(opacityShadowCoverage(1)).toBe(1);
		expect(opacityShadowCoverage(0.952) - opacityShadowCoverage(0.948)).toBeLessThan(0.002);
		const material = new THREE.MeshStandardMaterial();
		const mesh = new THREE.Mesh(new THREE.BoxGeometry(), material);
		applyV12Opacity(mesh, 0.12, true);
		const depth = mesh.customDepthMaterial!;
		expect(depth).toBeInstanceOf(THREE.MeshDepthMaterial);
		expect(depth.alphaHash).toBe(true);
		expect(depth.opacity).toBe(0);
		expect(mesh.castShadow).toBe(false);
		applyV12Opacity(mesh, 0.120001, true);
		expect(mesh.castShadow).toBe(true);
		expect(depth.opacity).toBeGreaterThan(0);
		for (const opacity of [0.8, 0.95, 0.999, 1, 0.5, 0]) {
			applyV12Opacity(mesh, opacity, true);
			expect(mesh.customDepthMaterial).toBe(depth);
			expect(depth.opacity).toBe(opacityShadowCoverage(opacity));
		}
		expect(mesh.castShadow).toBe(false);
		mesh.geometry.dispose();
		material.dispose();
		depth.dispose();
	});
	it('does not recompile for every frame or allocate shadow programs for excluded source hardware', () => {
		const material = new THREE.MeshStandardMaterial();
		const mesh = new THREE.Mesh(new THREE.BoxGeometry(), material);
		applyV12Opacity(mesh, 0.12, false);
		const version = material.version;
		for (const opacity of [0.2, 0.5, 0.9, 0.99, 0.9999]) applyV12Opacity(mesh, opacity, false);
		expect(material.version).toBe(version);
		expect(mesh.customDepthMaterial).toBeUndefined();
		expect(mesh.castShadow).toBe(false);
		applyV12Opacity(mesh, 1, false);
		expect(material.version).toBe(version + 1);
		mesh.geometry.dispose();
		material.dispose();
	});
	it('disposes source shadow materials along with their renderer-owned mesh tree', () => {
		const material = new THREE.MeshStandardMaterial();
		const mesh = new THREE.Mesh(new THREE.BoxGeometry(), material);
		applyV12Opacity(mesh, 0.12, true);
		const dispose = vi.spyOn(mesh.customDepthMaterial!, 'dispose');
		const studio = Object.create(EngineStudio.prototype);
		// Source geometry is renderer-owned; derived moving geometry has its own rig owner.
		Reflect.set(studio, 'runningRig', { ownsGeometry: () => false });
		Reflect.set(studio, 'materialPool', { owns: () => false });
		Reflect.get(studio, 'disposeGraph').call(studio, mesh);
		expect(dispose).toHaveBeenCalledTimes(1);
	});
});
