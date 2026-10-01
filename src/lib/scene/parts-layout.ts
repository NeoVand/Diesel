import * as THREE from 'three';
import type { PartId } from '$lib/engine/types';

/** Normalized explosion control remains 0..1; both source and teaching offsets use this gain. */
export const EXPLOSION_MULTIPLIER = 3;
export const LAYOUT_PITCH = 1.16;
export const LAYOUT_MAX_SIZE = 0.9;
export const LAYOUT_FLOOR = -1.884;
export type LayoutInput = {
	id: string;
	parent: PartId;
	kind: 'source' | 'educational';
	bounds: THREE.Box3;
};
export type LayoutPlacement = {
	id: string;
	parent: PartId;
	kind: 'source' | 'educational';
	center: THREE.Vector3;
	position: THREE.Vector3;
	scale: number;
	bounds: THREE.Box3;
};
export type LayoutGroup = {
	parent: PartId;
	bounds: THREE.Box3;
	count: number;
	sourceCount: number;
	teachingCount: number;
	columns: number;
	rows: number;
};
export type PartsLayout = {
	placements: Map<string, LayoutPlacement>;
	bounds: THREE.Box3;
	groups: LayoutGroup[];
};
const ORDER: PartId[] = [
	'block',
	'heads',
	'turbo',
	'air',
	'cooling',
	'fuel',
	'exhaust',
	'flywheel',
	'accessories'
];
const stableId = (a: LayoutInput, b: LayoutInput) =>
	a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id, 'en', { numeric: true });

type Panel = {
	parent: PartId;
	inputs: LayoutInput[];
	columns: number;
	rows: number;
	width: number;
	depth: number;
	x: number;
	z: number;
};

/** Small deterministic skyline packer. Systems remain contiguous, with separate header space. */
function pack(panels: Panel[], width: number): { panels: Panel[]; depth: number } | null {
	const placed: Panel[] = [];
	for (const panel of [...panels].sort(
		(a, b) =>
			b.depth - a.depth || b.width - a.width || ORDER.indexOf(a.parent) - ORDER.indexOf(b.parent)
	)) {
		if (panel.width > width) return null;
		let bestX = 0,
			bestZ = Infinity;
		const candidates = [0, ...placed.map((p) => p.x + p.width + 0.5)];
		for (const x of candidates) {
			if (x + panel.width > width + 1e-6) continue;
			let z = 0;
			for (const p of placed)
				if (x < p.x + p.width + 0.5 && x + panel.width + 0.5 > p.x)
					z = Math.max(z, p.z + p.depth + 0.5);
			if (z < bestZ || (z === bestZ && x < bestX)) {
				bestX = x;
				bestZ = z;
			}
		}
		placed.push({ ...panel, x: bestX, z: bestZ });
	}
	return { panels: placed, depth: Math.max(0, ...placed.map((p) => p.z + p.depth)) };
}

/** Uniform display normalization preserves shape, never physical relative sizes or OEM spacing. */
export function createPartsLayout(inputs: LayoutInput[]): PartsLayout {
	if (!inputs.length) return { placements: new Map(), groups: [], bounds: new THREE.Box3() };
	const unique = new Set<string>();
	for (const input of inputs) {
		if (unique.has(input.id)) throw new Error(`Duplicate atlas component ${input.id}`);
		if (input.bounds.isEmpty()) throw new Error(`Empty atlas component ${input.id}`);
		unique.add(input.id);
	}
	const panels: Panel[] = ORDER.flatMap((parent) => {
		const items = inputs.filter((input) => input.parent === parent).sort(stableId);
		if (!items.length) return [];
		const columns = Math.max(2, Math.ceil(Math.sqrt(items.length) * 1.14));
		const rows = Math.ceil(items.length / columns);
		return [
			{
				parent,
				inputs: items,
				columns,
				rows,
				width: (columns + 0.7) * LAYOUT_PITCH,
				depth: (rows + 1.55) * LAYOUT_PITCH,
				x: 0,
				z: 0
			}
		];
	});
	const area = panels.reduce((sum, p) => sum + p.width * p.depth, 0);
	let best: ReturnType<typeof pack> = null,
		bestWidth = 0,
		score = Infinity;
	const minimum = Math.max(1, ...panels.map((p) => p.width));
	for (
		let width = minimum;
		width <= Math.max(minimum, Math.sqrt(area) * 2.2);
		width += LAYOUT_PITCH
	) {
		const candidate = pack(panels, width);
		if (!candidate) continue;
		const actualWidth = Math.max(...candidate.panels.map((p) => p.x + p.width));
		const ratio = actualWidth / Math.max(1, candidate.depth);
		const value = actualWidth * candidate.depth * (1 + Math.abs(Math.log(ratio / 2)) * 1.8);
		if (value < score) {
			score = value;
			best = candidate;
			bestWidth = actualWidth;
		}
	}
	const placements = new Map<string, LayoutPlacement>(),
		groups: LayoutGroup[] = [],
		bounds = new THREE.Box3();
	if (!best) return { placements, groups, bounds };
	for (const panel of best.panels.sort(
		(a, b) => ORDER.indexOf(a.parent) - ORDER.indexOf(b.parent)
	)) {
		const groupBounds = new THREE.Box3(
			new THREE.Vector3(panel.x - bestWidth / 2, LAYOUT_FLOOR, panel.z - best.depth / 2),
			new THREE.Vector3(
				panel.x + panel.width - bestWidth / 2,
				LAYOUT_FLOOR + 0.054 + LAYOUT_MAX_SIZE,
				panel.z + panel.depth - best.depth / 2
			)
		);
		panel.inputs.forEach((input, index) => {
			const size = input.bounds.getSize(new THREE.Vector3()),
				center = input.bounds.getCenter(new THREE.Vector3());
			const scale = LAYOUT_MAX_SIZE / Math.max(1e-5, size.x, size.y, size.z);
			const position = new THREE.Vector3(
				panel.x + ((index % panel.columns) + 0.5) * LAYOUT_PITCH - bestWidth / 2,
				LAYOUT_FLOOR + 0.054 + (size.y * scale) / 2,
				panel.z + (Math.floor(index / panel.columns) + 1.3) * LAYOUT_PITCH - best.depth / 2
			);
			const box = new THREE.Box3(
				position.clone().addScaledVector(size, -scale / 2),
				position.clone().addScaledVector(size, scale / 2)
			);
			placements.set(input.id, {
				id: input.id,
				parent: input.parent,
				kind: input.kind,
				center,
				position,
				scale,
				bounds: box
			});
		});
		groups.push({
			parent: panel.parent,
			bounds: groupBounds,
			count: panel.inputs.length,
			sourceCount: panel.inputs.filter((p) => p.kind === 'source').length,
			teachingCount: panel.inputs.filter((p) => p.kind === 'educational').length,
			columns: panel.columns,
			rows: panel.rows
		});
		bounds.union(groupBounds);
	}
	return { placements, bounds, groups };
}

/** Exactly the affine map used by the GPU for batched source vertices and by CPU raycast proxies. */
export function sourceLayoutTransform(
	placement: LayoutPlacement,
	offset: THREE.Vector3,
	blend: number
) {
	const amount = THREE.MathUtils.clamp(blend, 0, 1);
	return {
		scale: THREE.MathUtils.lerp(1, placement.scale, amount),
		translation: offset
			.clone()
			.multiplyScalar(1 - amount)
			.addScaledVector(
				placement.position.clone().addScaledVector(placement.center, -placement.scale),
				amount
			)
	};
}

export function layoutVisibleBounds(
	layout: PartsLayout,
	visible: (placement: LayoutPlacement) => boolean,
	focus: string | null = null
) {
	const bounds = new THREE.Box3();
	for (const placement of layout.placements.values())
		if (
			visible(placement) &&
			(!focus ||
				placement.id === focus ||
				placement.parent === focus ||
				placement.id.startsWith(`${focus}:`))
		)
			bounds.union(placement.bounds);
	return bounds;
}
