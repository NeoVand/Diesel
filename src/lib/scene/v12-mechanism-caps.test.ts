import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { MovingSectionCaps } from './section-plane';
import { V12Mechanism } from './v12-mechanism';
import { V12_CYLINDERS, V12_MOTION_DATUMS, v12NativeToDisplay } from '../engine/v12-kinematics';

const asset = resolve('static/models/v12-review.glb');

// Licensed source derivatives are intentionally absent from clean public checkouts.
describe.skipIf(!existsSync(asset))('actual V12 rod sections during motion and disassembly', () => {
	let root: THREE.Group;
	let rod: THREE.Object3D;
	const meshes: THREE.Mesh[] = [];
	const cylinder = V12_CYLINDERS[0];
	const mechanism = new V12Mechanism();
	const caps = new MovingSectionCaps();

	beforeAll(async () => {
		const file = await readFile(asset);
		const buffer = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
		root = (await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(buffer, '')).scene;
		rod = root.getObjectByName(cylinder.rodId)!;
		rod.matrixAutoUpdate = false;
		rod.traverse((object) => {
			if (object instanceof THREE.Mesh) {
				object.userData.componentId = cylinder.rodId;
				meshes.push(object);
			}
		});
	});

	afterAll(() => {
		caps.dispose();
		const materials = new Set<THREE.Material>();
		root?.traverse((object) => {
			if (object instanceof THREE.Mesh) {
				object.geometry.dispose();
				for (const material of Array.isArray(object.material) ? object.material : [object.material])
					materials.add(material);
			}
		});
		for (const material of materials) material.dispose();
	});

	it('keeps the real big-end hole open and follows the same moved wall in both flip directions', () => {
		const nativeCenter = new THREE.Vector3(...v12NativeToDisplay(cylinder.rodBigEndCenterMm));
		const displayMm = V12_MOTION_DATUMS.displayScale / 1000;
		for (const phase of [0, 42, 137, 299, 720]) {
			for (const displacement of [new THREE.Vector3(), new THREE.Vector3(0, 1.05, 1.4)]) {
				rod.matrix
					.copy(mechanism.matrixFor(cylinder.rodId, phase))
					.premultiply(new THREE.Matrix4().makeTranslation(...displacement.toArray()));
				root.updateMatrixWorld(true);
				const center = nativeCenter.clone().applyMatrix4(rod.matrixWorld);
				for (const sign of [-1, 1]) {
					const normal = new THREE.Vector3(sign, 0, 0);
					caps.update(meshes, [new THREE.Plane(normal, -center.x * sign)]);
					expect(caps.report.has(cylinder.rodId)).toBe(true);
					const origin = center.clone().addScaledVector(normal, -0.4);
					const ray = new THREE.Raycaster(origin, normal);
					expect(ray.intersectObjects(caps.pickables())).toHaveLength(0);
					// Sample the actual annular wall around the 25 mm bore. At least one material
					// segment must be pickable; a bounding-box fill would incorrectly hit the centre.
					let wallHits = 0;
					for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 4) {
						ray.ray.origin
							.copy(origin)
							.add(
								new THREE.Vector3(0, Math.sin(angle), Math.cos(angle)).multiplyScalar(
									28 * displayMm
								)
							);
						const hits = ray.intersectObjects(caps.pickables());
						wallHits += hits.length;
						for (const hit of hits) expect(hit.object.userData.componentId).toBe(cylinder.rodId);
					}
					expect(wallHits).toBeGreaterThan(0);
				}
			}
		}
	});

	it('removes cap pick targets when isolation hides the component and restores the same source ID', () => {
		rod.matrix.identity();
		root.updateMatrixWorld(true);
		const center = new THREE.Vector3(...v12NativeToDisplay(cylinder.rodBigEndCenterMm));
		const plane = new THREE.Plane(new THREE.Vector3(1, 0, 0), -center.x);
		caps.update(meshes, [plane]);
		expect(caps.pickables()).toHaveLength(1);
		caps.update([], [plane]);
		expect(caps.pickables()).toHaveLength(0);
		expect(caps.report.size).toBe(0);
		caps.update(meshes, [plane]);
		expect(caps.pickables()[0].userData.componentId).toBe(cylinder.rodId);
	});
});
