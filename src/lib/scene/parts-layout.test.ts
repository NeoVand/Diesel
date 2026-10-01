import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
	createPartsLayout,
	sourceLayoutTransform,
	layoutVisibleBounds,
	LAYOUT_MAX_SIZE,
	LAYOUT_FLOOR,
	EXPLOSION_MULTIPLIER,
	type LayoutInput
} from './parts-layout';
import type { PartId } from '$lib/engine/types';

const counts: [PartId, number, number][] = [
	['block', 34, 38],
	['heads', 267, 38],
	['turbo', 8, 0],
	['air', 7, 0],
	['cooling', 104, 0],
	['fuel', 76, 12],
	['exhaust', 8, 0],
	['flywheel', 19, 0],
	['accessories', 64, 0]
];
function fixtures(): LayoutInput[] {
	return counts.flatMap(([parent, source, educational]) =>
		['source', 'educational'].flatMap((kind) =>
			Array.from({ length: kind === 'source' ? source : educational }, (_, index) => {
				const center = new THREE.Vector3(index * 0.11, -0.2, index * 0.01);
				const size = new THREE.Vector3(
					0.002 + (index % 13) * 0.2,
					0.01 + (index % 7) * 0.07,
					0.001 + (index % 17) * 0.1
				);
				return {
					id: `${kind}:${parent}:${index}`,
					parent,
					kind: kind as LayoutInput['kind'],
					bounds: new THREE.Box3(
						center.clone().addScaledVector(size, -0.5),
						center.clone().addScaledVector(size, 0.5)
					)
				};
			})
		)
	);
}

describe('parts atlas geometry and identity', () => {
	it('fits every component into separate cells with true gaps and system envelopes', () => {
		const inputs = fixtures(),
			layout = createPartsLayout(inputs);
		expect(inputs).toHaveLength(675);
		expect(layout.placements.size).toBe(675);
		expect(layout.groups).toHaveLength(9);
		for (const placement of layout.placements.values()) {
			const original = inputs.find((input) => input.id === placement.id)!;
			const size = placement.bounds.getSize(new THREE.Vector3());
			expect(Math.max(size.x, size.y, size.z)).toBeCloseTo(LAYOUT_MAX_SIZE, 12);
			const scaled = original.bounds.getSize(new THREE.Vector3()).multiplyScalar(placement.scale);
			for (const axis of ['x', 'y', 'z'] as const) expect(size[axis]).toBeCloseTo(scaled[axis], 12);
			expect(placement.bounds.min.y).toBeCloseTo(LAYOUT_FLOOR + 0.054, 12);
			expect(
				layout.groups
					.find((group) => group.parent === placement.parent)!
					.bounds.containsBox(placement.bounds)
			).toBe(true);
			expect(layout.bounds.containsBox(placement.bounds)).toBe(true);
		}
		const placements = [...layout.placements.values()];
		let minimumGap = Infinity;
		for (let i = 0; i < placements.length; i++)
			for (let j = i + 1; j < placements.length; j++) {
				const a = placements[i].bounds,
					b = placements[j].bounds;
				const gapX = Math.max(a.min.x - b.max.x, b.min.x - a.max.x),
					gapZ = Math.max(a.min.z - b.max.z, b.min.z - a.max.z);
				minimumGap = Math.min(minimumGap, Math.max(gapX, gapZ));
			}
		expect(minimumGap).toBeGreaterThanOrEqual(0.259999);
	});
	it('is deterministic independent of loading order and preserves source/teaching IDs', () => {
		const inputs = fixtures(),
			a = createPartsLayout(inputs),
			b = createPartsLayout([...inputs].reverse());
		expect([...a.placements.keys()]).toEqual([...b.placements.keys()]);
		for (const [id, placement] of a.placements) {
			expect(b.placements.get(id)!.position.toArray()).toEqual(placement.position.toArray());
			expect(b.placements.get(id)!.scale).toBe(placement.scale);
		}
		expect([...a.placements.values()].filter((p) => p.kind === 'source')).toHaveLength(587);
		expect([...a.placements.values()].filter((p) => p.kind === 'educational')).toHaveLength(88);
	});
	it('matches the source shader affine interpolation exactly through the animation', () => {
		const input = fixtures()[14],
			placement = createPartsLayout([input]).placements.get(input.id)!;
		const offset = new THREE.Vector3(2, 3, -5),
			vertex = input.bounds.min.clone();
		for (const blend of [0, 0.17, 0.5, 0.93, 1]) {
			const cpu = sourceLayoutTransform(placement, offset, blend);
			const result = vertex.clone().multiplyScalar(cpu.scale).add(cpu.translation);
			const gpu = vertex
				.clone()
				.add(offset)
				.lerp(
					vertex
						.clone()
						.sub(placement.center)
						.multiplyScalar(placement.scale)
						.add(placement.position),
					blend
				);
			expect(result.distanceTo(gpu)).toBeLessThan(1e-12);
		}
		expect(EXPLOSION_MULTIPLIER).toBe(3);
	});
	it('frames exact parts, complete families and semantic systems without hidden components', () => {
		const layout = createPartsLayout(fixtures());
		const one = [...layout.placements.values()][5];
		expect(layoutVisibleBounds(layout, () => true, one.id).equals(one.bounds)).toBe(true);
		const heads = layoutVisibleBounds(layout, (p) => p.kind === 'source', 'heads');
		expect(
			[...layout.placements.values()]
				.filter((p) => p.parent === 'heads' && p.kind === 'source')
				.every((p) => heads.containsBox(p.bounds))
		).toBe(true);
		expect(layoutVisibleBounds(layout, () => false).isEmpty()).toBe(true);
	});
	it('rejects duplicate or empty geometry identities and handles an empty input', () => {
		const input = fixtures()[0];
		expect(() => createPartsLayout([input, input])).toThrow('Duplicate');
		expect(() => createPartsLayout([{ ...input, bounds: new THREE.Box3() }])).toThrow('Empty');
		const empty = createPartsLayout([]);
		expect(empty.placements.size).toBe(0);
		expect(empty.groups).toHaveLength(0);
		expect(empty.bounds.isEmpty()).toBe(true);
	});
});
