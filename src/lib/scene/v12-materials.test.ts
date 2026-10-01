import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { applyV12Material, restoreV12MaterialDetail } from './v12-materials';

const part = (role: string, sourcePath = '') => ({
	id: 'example',
	role,
	sourcePath,
	sourceMaterial: ''
});
const material = (name: string) => {
	const value = new THREE.MeshPhysicalMaterial();
	value.name = name;
	value.specularColor.setRGB(2, 2, 2);
	return value;
};

describe('authored V12 display finishes', () => {
	it('keeps separate polymer, rubber and metal slots within a composite fuel body', () => {
		const steel = material('Steel - Satin');
		const polymer = material('Plastic - Matte (White)');
		const rubber = material('Rubber - Hard');
		for (const slot of [steel, polymer, rubber]) applyV12Material(slot, part('fuel'));
		expect(steel.metalness).toBe(1);
		expect(polymer.metalness).toBe(0);
		expect(rubber.metalness).toBe(0);
		expect(polymer.color.getHex()).not.toBe(steel.color.getHex());
		expect(rubber.roughness).toBeGreaterThan(polymer.roughness);
	});

	it('distinguishes head castings from metallic seats and guides in the same source role', () => {
		const head = material('Powder Coat - Rough (Dark Grey)');
		const guide = material('Iron - Cast');
		applyV12Material(head, part('head', '/cylinder head/body'));
		applyV12Material(guide, part('head', '/cylinder head/valve guide:1/body'));
		expect(head.userData.displayFinish).not.toBe(guide.userData.displayFinish);
		expect(guide.metalness).toBe(1);
	});

	it('normalizes imported specular response without changing clipping or transition state', () => {
		const cover = material('Titanium - Polished');
		const plane = new THREE.Plane(new THREE.Vector3(1, 0, 0));
		cover.opacity = 0.12;
		cover.transparent = true;
		cover.depthWrite = false;
		cover.clippingPlanes = [plane];
		applyV12Material(cover, part('covers'));
		expect(cover.specularColor.toArray()).toEqual([1, 1, 1]);
		expect(cover.metalness).toBeGreaterThan(0.5);
		expect(cover.opacity).toBe(0.12);
		expect(cover.transparent).toBe(true);
		expect(cover.depthWrite).toBe(false);
		expect(cover.clippingPlanes?.[0]).toBe(plane);
	});

	it('preserves the original orange cam-cover family and separate graphite timing cover', () => {
		const cam = material('Titanium - Polished');
		const timing = material('Powder Coat - Rough (Dark Grey)');
		applyV12Material(cam, { ...part('covers'), id: 'v12-0259' });
		applyV12Material(timing, { ...part('covers'), id: 'v12-0317' });
		expect(timing.color.getHex()).not.toBe(cam.color.getHex());
		expect(timing.userData.displayFinish).toContain('Graphite');
		expect(cam.roughness).toBeLessThan(0.3);
		expect(cam.clearcoat).toBeGreaterThan(0);
		const hsl = cam.color.getHSL({ h: 0, s: 0, l: 0 }, THREE.SRGBColorSpace);
		// Original source orange is ~26 degrees: retain its saturation and a small warm shift.
		expect(hsl.h * 360).toBeGreaterThan(26);
		expect(hsl.h * 360).toBeLessThan(36);
		expect(hsl.s).toBeGreaterThan(0.9);
	});

	it('restores source-space surface detail after Three clones the preview or selected material', () => {
		const source = material('Powder Coat - Rough (Dark Grey)');
		applyV12Material(source, part('block'));
		const clone = source.clone();
		expect(clone.onBeforeCompile).not.toBe(source.onBeforeCompile);
		restoreV12MaterialDetail(clone);
		expect(clone.customProgramCacheKey()).toBe(source.customProgramCacheKey());
		const shader = {
			uniforms: {},
			vertexShader: '#include <common>\n#include <begin_vertex>',
			fragmentShader: '#include <common>\n#include <roughnessmap_fragment>'
		} as Parameters<typeof clone.onBeforeCompile>[0];
		clone.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
		expect(shader.uniforms.uFinishGrain.value).toBe(source.userData.displayRoughnessGrain);
		expect(shader.vertexShader).toContain('vFinishPosition = position');
		expect(shader.fragmentShader).toContain('dFdx(finishP)');
		expect(shader.fragmentShader).not.toContain('normal =');
	});
});
