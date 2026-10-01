import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ClippingGroup } from 'three/webgpu';
import { WebGPUSectionCaps } from './webgpu-section-caps';

describe('WebGPU winding section caps', () => {
	it('keeps genuine bores open for picking and follows the actual solid transforms', () => {
		const mesh = new THREE.Mesh(
			new THREE.TorusGeometry(1, 0.35, 16, 48),
			new THREE.MeshStandardMaterial()
		);
		mesh.userData.componentId = 'test-torus';
		mesh.updateMatrixWorld(true);
		const caps = new WebGPUSectionCaps();
		const plane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);
		caps.update([mesh], [plane]);
		expect(caps.report.size).toBe(1);
		const ray = new THREE.Raycaster(new THREE.Vector3(0, 0, 2), new THREE.Vector3(0, 0, -1));
		expect(ray.intersectObjects(caps.pickables())).toHaveLength(0);
		ray.ray.origin.x = 1;
		expect(ray.intersectObjects(caps.pickables()).length).toBeGreaterThan(0);
		mesh.position.x = 3;
		mesh.updateMatrixWorld(true);
		caps.update([mesh], [plane]);
		expect(ray.intersectObjects(caps.pickables())).toHaveLength(0);
		ray.ray.origin.x = 4;
		expect(ray.intersectObjects(caps.pickables()).length).toBeGreaterThan(0);
		caps.dispose();
		mesh.geometry.dispose();
		mesh.material.dispose();
	});
	it('uses real clipping groups and resets each stencil interval inside the GPU render pass', () => {
		const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
		mesh.userData.componentId = 'test-box';
		mesh.updateMatrixWorld(true);
		const caps = new WebGPUSectionCaps();
		const plane = new THREE.Plane(new THREE.Vector3(1, 0, 0), 0);
		caps.update([mesh], [plane]);
		const component = caps.group.children[0];
		const [mask, faceGroup] = component.children as ClippingGroup[];
		expect(mask).toBeInstanceOf(ClippingGroup);
		expect(mask.clippingPlanes).toEqual([plane]);
		expect(faceGroup).toBeInstanceOf(ClippingGroup);
		expect(mask.renderOrder).toBe(component.renderOrder);
		expect(faceGroup.renderOrder).toBe(component.renderOrder);
		const material = (
			caps.pickables()[0] as THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>
		).material;
		expect(material.stencilFail).toBe(THREE.ZeroStencilOp);
		expect(material.stencilZFail).toBe(THREE.ZeroStencilOp);
		expect(material.stencilZPass).toBe(THREE.ZeroStencilOp);
		plane.constant = 3;
		caps.update([mesh], [plane]);
		expect(caps.report.size).toBe(0);
		expect(caps.pickables()).toHaveLength(0);
		caps.dispose();
		mesh.geometry.dispose();
		mesh.material.dispose();
	});
});
