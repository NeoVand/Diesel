import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { v12PartMetadata, getV12Parent } from '../engine/definition';
import {
	createV12Atlas,
	createV12Explosion,
	v12DisassemblyCell,
	type V12Atlas,
	type V12LayoutPart
} from './v12-layout';

const asset = resolve('static/models/v12-review.glb');

// The purchased mesh is intentionally not required in public-source checkouts.
describe.skipIf(!existsSync(asset))('atlas packing of the actual purchased V12 source', () => {
	let root: THREE.Group;
	let parts: V12LayoutPart[];
	let atlas: V12Atlas;
	beforeAll(async () => {
		const file = await readFile(asset);
		const buffer = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
		root = (await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(buffer, '')).scene;
		root.updateMatrixWorld(true);
		const objects = new Map<string, THREE.Object3D>();
		root.traverse((object) => {
			if (v12PartMetadata.has(object.name)) objects.set(object.name, object);
		});
		parts = [...v12PartMetadata.values()].map((metadata) => ({
			id: metadata.id,
			role: metadata.role,
			parent: getV12Parent(metadata.role),
			path: metadata.sourcePath,
			decorative: metadata.decorative,
			bounds: new THREE.Box3().setFromObject(objects.get(metadata.id)!)
		}));
		atlas = createV12Atlas(parts, -4);
	});

	afterAll(() => {
		const materials = new Set<THREE.Material>();
		root?.traverse((object) => {
			if (!(object instanceof THREE.Mesh)) return;
			object.geometry.dispose();
			for (const material of Array.isArray(object.material) ? object.material : [object.material])
				materials.add(material);
		});
		for (const material of materials) material.dispose();
	});

	it('keeps every actual mechanical body inside its category panel and preserves its dimensions', () => {
		expect(atlas.offsets.size).toBe(1229);
		for (const group of atlas.groups) {
			for (const id of group.componentIds) {
				const source = parts.find((part) => part.id === id)!;
				const placed = source.bounds.clone().translate(atlas.offsets.get(id)!);
				expect(group.panelBounds.clone().expandByScalar(1e-8).containsBox(placed)).toBe(true);
				expect(
					placed.getSize(new THREE.Vector3()).distanceTo(source.bounds.getSize(new THREE.Vector3()))
				).toBeLessThan(1e-8);
			}
		}
	});

	it('keeps the three source chain loops coherent and reserves separate panels for major internals', () => {
		const chains = atlas.groups.find((group) => group.id === 'chains')!;
		expect(chains.count).toBe(320);
		expect(chains.cellCount).toBe(3);
		for (const id of ['pistons', 'rods', 'liners']) {
			const group = atlas.groups.find((candidate) => candidate.id === id)!;
			expect(group.count).toBe(12);
			expect(group.cellCount).toBe(12);
		}
		for (let a = 0; a < atlas.groups.length; a++)
			for (let b = a + 1; b < atlas.groups.length; b++)
				expect(atlas.groups[a].panelBounds.intersectsBox(atlas.groups[b].panelBounds)).toBe(false);
	});
	it('fully separates every actual source disassembly cell at 100% without scaling or moving the fixed block', () => {
		const original = new Map(parts.map((part) => [part.id, part.bounds.clone()]));
		const bounds = parts
			.filter((p) => !p.decorative)
			.reduce((box, p) => box.union(p.bounds), new THREE.Box3());
		const floor = bounds.min.y - 0.18;
		const offsets = createV12Explosion(parts, bounds.getCenter(new THREE.Vector3()), floor);
		expect(offsets.size).toBe(1229);
		const cells = new Map<string, THREE.Box3>();
		for (const part of parts.filter((p) => !p.decorative)) {
			const offset = offsets.get(part.id)!;
			const placed = part.bounds.clone().translate(offset);
			expect(placed.min.y).toBeGreaterThanOrEqual(floor + 0.07999);
			expect(part.bounds.equals(original.get(part.id)!)).toBe(true);
			expect(
				placed.getSize(new THREE.Vector3()).distanceTo(part.bounds.getSize(new THREE.Vector3()))
			).toBeLessThan(1e-10);
			const id = v12DisassemblyCell(part);
			if (!cells.has(id)) cells.set(id, new THREE.Box3());
			cells.get(id)!.union(placed);
			if (part.role === 'block') expect(offset.length()).toBe(0);
		}
		const boxes = [...cells.values()];
		let overlaps = 0;
		for (let i = 0; i < boxes.length; i++)
			for (let j = i + 1; j < boxes.length; j++) if (boxes[i].intersectsBox(boxes[j])) overlaps++;
		expect(overlaps).toBe(0);
		const reversed = createV12Explosion(
			[...parts].reverse(),
			bounds.getCenter(new THREE.Vector3()),
			floor
		);
		for (const [id, offset] of offsets)
			expect(offset.distanceTo(reversed.get(id)!)).toBeLessThan(1e-10);
	});
});
