import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createV12Atlas, v12ExplosionOffset, type V12LayoutPart } from './v12-layout';
import { V12_CYLINDERS } from '$lib/engine/v12-kinematics';
import { v12PartMetadata } from '$lib/engine/definition';

function part(id: string, role = 'fasteners', x = 0, z = 0): V12LayoutPart {
	return {
		id,
		parent: 'accessories',
		role,
		path: `V12/${id}`,
		bounds: new THREE.Box3(new THREE.Vector3(x, 0, z), new THREE.Vector3(x + 0.12, 0.18, z + 0.1))
	};
}
describe('V12 physical disassembly and atlas', () => {
	it('retains all source identities beyond both previous registry limits without changing dimensions', () => {
		const inputs = Array.from({ length: 1253 }, (_, i) =>
			part(`v12-${String(i + 1).padStart(4, '0')}`)
		);
		const atlas = createV12Atlas(inputs, -3);
		expect(atlas.offsets.size).toBe(1253);
		expect(atlas.offsets.has('v12-1253')).toBe(true);
		for (const input of inputs) {
			const placed = input.bounds.clone().translate(atlas.offsets.get(input.id)!);
			expect(
				placed.getSize(new THREE.Vector3()).distanceTo(input.bounds.getSize(new THREE.Vector3()))
			).toBeLessThan(1e-12);
			expect(placed.min.y).toBeCloseTo(-2.94, 8);
		}
		expect(atlas.groups.reduce((n, g) => n + g.count, 0)).toBe(1253);
	});
	it('keeps chain loops rigid while retaining every link as a selectable source occurrence', () => {
		const a = part('a', 'timing', -2, 0),
			b = part('b', 'timing', -2, 1);
		a.path = 'V12/chain:1/chain/loop:1/Body1';
		b.path = 'V12/chain:1/chain/loop:1/Body2';
		const atlas = createV12Atlas([a, b], -3);
		expect(atlas.offsets.get('a')!.equals(atlas.offsets.get('b')!)).toBe(true);
		expect(
			v12ExplosionOffset(a, new THREE.Vector3()).equals(v12ExplosionOffset(b, new THREE.Vector3()))
		).toBe(true);
	});
	it('uses measured bank membership for paired pistons and rods rather than their bounding-box midpoint', () => {
		for (const cylinder of V12_CYLINDERS) {
			const piston = part(cylinder.pistonId, 'piston', 0, -3);
			const rod = part(cylinder.rodId, 'rod', 0, 3);
			expect(
				v12ExplosionOffset(piston, new THREE.Vector3()).equals(
					v12ExplosionOffset(rod, new THREE.Vector3())
				)
			).toBe(true);
		}
	});
	it('does not allocate physical atlas positions to decorative lettering', () => {
		const decoration = { ...part('letter'), decorative: true };
		const atlas = createV12Atlas([part('real'), decoration], -3);
		expect([...atlas.offsets.keys()]).toEqual(['real']);
		expect(atlas.groups[0].count).toBe(1);
	});
	it('does not overlap independent physical cells', () => {
		const parts = Array.from({ length: 80 }, (_, i) =>
			part(String(i), 'fasteners', i * 0.2, i * 0.1)
		);
		const atlas = createV12Atlas(parts, -3);
		const boxes = parts.map((p) => p.bounds.clone().translate(atlas.offsets.get(p.id)!));
		for (let a = 0; a < boxes.length; a++)
			for (let b = a + 1; b < boxes.length; b++)
				expect(boxes[a].intersectsBox(boxes[b])).toBe(false);
	});
	it('places the complete source catalog into nonoverlapping category panels with clear label gutters', () => {
		const inputs: V12LayoutPart[] = [...v12PartMetadata.values()].map((metadata, index) => ({
			...part(metadata.id, metadata.role, index * 0.03, index * 0.01),
			path: metadata.sourcePath,
			decorative: metadata.decorative
		}));
		const atlas = createV12Atlas(inputs, -3);
		expect(atlas.groups).toHaveLength(22);
		expect(atlas.offsets.size).toBe(1229);
		const seen = atlas.groups.flatMap((group) => group.componentIds);
		expect(new Set(seen).size).toBe(1229);
		for (const group of atlas.groups) {
			expect(atlas.bounds.containsBox(group.panelBounds)).toBe(true);
			expect(group.panelBounds.containsBox(group.bounds)).toBe(true);
			expect(group.panelBounds.containsPoint(group.labelAnchor)).toBe(true);
			expect(group.bounds.min.z - group.labelAnchor.z).toBeCloseTo(0.92, 10);
		}
		for (let i = 0; i < atlas.groups.length; i++)
			for (let j = i + 1; j < atlas.groups.length; j++)
				expect(atlas.groups[i].panelBounds.intersectsBox(atlas.groups[j].panelBounds)).toBe(false);
	});
	it('produces the same atlas after source traversal order changes', () => {
		const inputs = Array.from({ length: 50 }, (_, index) =>
			part(String(index), 'piston', index * 0.4, index * 0.1)
		);
		const first = createV12Atlas(inputs, -3);
		const reordered = createV12Atlas([...inputs].reverse(), -3);
		for (const input of inputs)
			expect(first.offsets.get(input.id)).toEqual(reordered.offsets.get(input.id));
		expect(first.groups).toEqual(reordered.groups);
	});
});
