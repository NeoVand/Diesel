import * as THREE from 'three';
import type { PartId } from '$lib/engine/types';
import { V12_CYLINDERS } from '$lib/engine/v12-kinematics';
import { getV12TaxonomyGroup, V12_TAXONOMY, type V12TaxonomyId } from '$lib/engine/v12-taxonomy';

export interface V12LayoutPart {
	id: string;
	parent: PartId;
	role: string;
	path: string;
	bounds: THREE.Box3;
	decorative?: boolean;
}
export interface V12AtlasGroup {
	id: V12TaxonomyId;
	title: string;
	description: string;
	parent: PartId;
	/** Geometry-only bounds for framing the source components. */
	bounds: THREE.Box3;
	/** Reserved panel includes padding and a clear header gutter. */
	panelBounds: THREE.Box3;
	labelAnchor: THREE.Vector3;
	count: number;
	cellCount: number;
	componentIds: string[];
}
export interface V12Atlas {
	offsets: Map<string, THREE.Vector3>;
	/** Includes every panel and its header gutter, so framing never crops category labels. */
	bounds: THREE.Box3;
	groups: V12AtlasGroup[];
}

/** Source chain loops stay rigid during disassembly; individual source identities stay selectable. */
export function v12ExplosionOffset(
	part: V12LayoutPart,
	engineCenter: THREE.Vector3
): THREE.Vector3 {
	const c = part.bounds.getCenter(new THREE.Vector3()).sub(engineCenter);
	const datum = V12_CYLINDERS.find(
		(d) => d.pistonId === part.id || d.rodId === part.id || d.linerId === part.id
	);
	const bank = datum ? -Math.sign(datum.bankAxis[0]) : c.z < 0 ? -1 : 1;
	const end = c.x < 0 ? -1 : 1;
	const path = part.path.toLowerCase();
	let role = part.role;
	if (role === 'fasteners') {
		if (/belt cap|chain|wheel/.test(path)) role = 'timing';
		else if (/cam cap/.test(path)) role = 'covers';
		else if (/oil/.test(path)) role = 'sump';
		else if (/inlet/.test(path)) role = 'intake';
		else role = c.y > 0.1 ? 'head' : 'block';
	}
	switch (role) {
		case 'block':
			return new THREE.Vector3(0, 0, 0);
		case 'crankshaft':
			return new THREE.Vector3(0, 0, 2.1);
		case 'sump':
			return new THREE.Vector3(-4.5, 0, 0);
		case 'piston':
		case 'rod':
			return new THREE.Vector3(0, 1.05, bank * 1.4);
		case 'liner':
			return new THREE.Vector3(0, 2.4, bank * 2.3);
		case 'head':
		case 'bearings':
			return new THREE.Vector3(0, 3.45, bank * 2.7);
		case 'valvetrain':
		case 'camshaft':
			return new THREE.Vector3(0, 4.25, bank * 3.15);
		case 'covers':
			return /chain|wheel/.test(path)
				? new THREE.Vector3(end * 4.6, 0.1, 0)
				: new THREE.Vector3(0, 5.4, bank * 4.15);
		case 'timing':
			return new THREE.Vector3(end * 3.2, 0.1, 0);
		case 'turbo':
			return new THREE.Vector3(end * 0.8, 0.4, bank * 4.1);
		case 'intake':
			return new THREE.Vector3(0, 5, 0);
		case 'exhaust':
			return new THREE.Vector3(end * 0.3, 1, bank * 3.1);
		case 'fuel':
			return new THREE.Vector3(0, 5.9, bank * 1.5);
		case 'flywheel':
			return new THREE.Vector3(end * 3.7, 0, 0);
		case 'cooling':
			return new THREE.Vector3(end * 2.3, 0.3, bank * 1.8);
		default:
			return new THREE.Vector3(end * 1.2, 1.2, bank * 1.8);
	}
}

/** Chain loops keep their authored engagement; every other body is an independent cell. */
export function v12DisassemblyCell(part: V12LayoutPart): string {
	const loop = /\/chain:1\/chain\/([^/]+)/.exec(part.path)?.[1];
	return loop ? `chain/${loop}` : part.id;
}

/** Minimum displacement along a ray that clears the occupied AABB intervals. */
function clearanceDistance(
	box: THREE.Box3,
	direction: THREE.Vector3,
	occupied: THREE.Box3[],
	gap: number
) {
	const intervals: [number, number][] = [];
	for (const obstacle of occupied) {
		let enter = -Infinity,
			exit = Infinity;
		for (const axis of ['x', 'y', 'z'] as const) {
			const speed = direction[axis];
			if (Math.abs(speed) < 1e-10) {
				if (box.max[axis] < obstacle.min[axis] - gap || box.min[axis] > obstacle.max[axis] + gap) {
					exit = -Infinity;
					break;
				}
			} else {
				const a = (obstacle.min[axis] - gap - box.max[axis]) / speed;
				const b = (obstacle.max[axis] + gap - box.min[axis]) / speed;
				enter = Math.max(enter, Math.min(a, b));
				exit = Math.min(exit, Math.max(a, b));
			}
		}
		if (exit >= 0 && enter <= exit) intervals.push([enter, exit]);
	}
	intervals.sort((a, b) => a[0] - b[0]);
	let distance = 0;
	for (const [enter, exit] of intervals) {
		if (enter > distance) break;
		if (exit >= distance) distance = exit + 0.0001;
	}
	return distance;
}

/**
 * Translation-only disassembly with conservative source-bounds clearance at 100%.
 * This is an inspection layout, not a collision-certified manufacturing sequence.
 */
export function createV12Explosion(
	parts: readonly V12LayoutPart[],
	center: THREE.Vector3,
	floor: number
) {
	const cells = new Map<string, { parts: V12LayoutPart[]; bounds: THREE.Box3 }>();
	for (const part of parts) {
		if (part.decorative) continue;
		const id = v12DisassemblyCell(part);
		if (!cells.has(id)) cells.set(id, { parts: [], bounds: new THREE.Box3() });
		cells.get(id)!.parts.push(part);
		cells.get(id)!.bounds.union(part.bounds);
	}
	const sorted = [...cells.values()].sort((a, b) => {
		const fixedA = a.parts.some((p) => p.role === 'block'),
			fixedB = b.parts.some((p) => p.role === 'block');
		if (fixedA !== fixedB) return fixedA ? -1 : 1;
		const sa = a.bounds.getSize(new THREE.Vector3()),
			sb = b.bounds.getSize(new THREE.Vector3());
		return sb.x * sb.y * sb.z - sa.x * sa.y * sa.z || a.parts[0].id.localeCompare(b.parts[0].id);
	});
	const occupied: THREE.Box3[] = [],
		offsets = new Map<string, THREE.Vector3>();
	for (const cell of sorted) {
		const reference = [...cell.parts].sort((a, b) => a.id.localeCompare(b.id))[0];
		const base = v12ExplosionOffset(reference, center).multiplyScalar(1.5);
		base.y = Math.max(base.y, floor + 0.08 - cell.bounds.min.y);
		const box = cell.bounds.clone().translate(base);
		const preferred = base.clone();
		preferred.y = Math.max(0, preferred.y);
		if (preferred.lengthSq() < 1e-8) preferred.set(0, 1, 0);
		else preferred.normalize();
		const directions = [
			preferred,
			new THREE.Vector3(0, 1, 0),
			new THREE.Vector3(Math.sign(base.x) || 1, 0, 0),
			new THREE.Vector3(0, 0, Math.sign(base.z) || 1)
		];
		let best = base.clone(),
			cost = Infinity;
		for (const direction of directions) {
			const distance = clearanceDistance(box, direction, occupied, 0.075);
			const score = distance * (1 + 0.25 * (1 - direction.dot(preferred)));
			if (score < cost) {
				cost = score;
				best = base.clone().addScaledVector(direction, distance);
			}
		}
		occupied.push(cell.bounds.clone().translate(best));
		for (const part of cell.parts) offsets.set(part.id, best.clone());
	}
	return offsets;
}

/**
 * Curated, physical-size atlas. A masonry of equal-width category panels makes the spatial
 * order legible; every component placement is still a translation at its original scale.
 * Chain loops are single cells, but retain every individual source occurrence and ID.
 */
export function createV12Atlas(parts: V12LayoutPart[], floor: number): V12Atlas {
	const offsets = new Map<string, THREE.Vector3>();
	const groups: V12AtlasGroup[] = [];
	const bounds = new THREE.Box3();
	const padding = 0.32;
	const header = 0.92;
	const gap = 0.18;
	const gutter = 0.82;
	const categories = V12_TAXONOMY.map((category) => {
		const items = parts
			.filter((part) => !part.decorative && getV12TaxonomyGroup(part).id === category.id)
			.sort((a, b) => a.id.localeCompare(b.id));
		const clusters = new Map<string, V12LayoutPart[]>();
		for (const part of items) {
			const key = v12DisassemblyCell(part);
			if (!clusters.has(key)) clusters.set(key, []);
			clusters.get(key)!.push(part);
		}
		const cells = [...clusters.values()].map((members) => ({
			members,
			box: members.reduce((box, part) => box.union(part.bounds), new THREE.Box3())
		}));
		cells.sort((a, b) => {
			const sa = a.box.getSize(new THREE.Vector3());
			const sb = b.box.getSize(new THREE.Vector3());
			return sb.z - sa.z || sb.x - sa.x || a.members[0].id.localeCompare(b.members[0].id);
		});
		return { category, items, cells };
	}).filter(({ items }) => items.length > 0);
	// Consistent panel widths align headers and gutters while preserving the source scale.
	const panelWidth = Math.max(
		8.5,
		...categories.flatMap(({ cells }) =>
			cells.map(({ box }) => box.max.x - box.min.x + padding * 2)
		)
	);
	const columns = Math.min(4, categories.length);
	const columnDepths = Array.from({ length: columns }, () => 0);
	for (const { category, items, cells } of categories) {
		const column = columnDepths.indexOf(Math.min(...columnDepths));
		const panelX = column * (panelWidth + gutter);
		const panelZ = columnDepths[column];
		let x = 0;
		let z = 0;
		let shelfDepth = 0;
		const groupBounds = new THREE.Box3();
		for (const cell of cells) {
			const size = cell.box.getSize(new THREE.Vector3());
			if (x > 0 && x + size.x > panelWidth - padding * 2) {
				x = 0;
				z += shelfDepth + gap;
				shelfDepth = 0;
			}
			const translation = new THREE.Vector3(
				panelX + padding + x - cell.box.min.x,
				floor + 0.06 - cell.box.min.y,
				panelZ + padding + header + z - cell.box.min.z
			);
			for (const part of cell.members) offsets.set(part.id, translation.clone());
			groupBounds.union(cell.box.clone().translate(translation));
			x += size.x + gap;
			shelfDepth = Math.max(shelfDepth, size.z);
		}
		const panelDepth = Math.max(2.4, padding * 2 + header + z + shelfDepth);
		const panelBounds = new THREE.Box3(
			new THREE.Vector3(panelX, floor + 0.035, panelZ),
			new THREE.Vector3(panelX + panelWidth, groupBounds.max.y, panelZ + panelDepth)
		);
		groups.push({
			...category,
			bounds: groupBounds,
			panelBounds,
			labelAnchor: new THREE.Vector3(panelX + padding, floor + 0.08, panelZ + padding),
			count: items.length,
			cellCount: cells.length,
			componentIds: items.map((part) => part.id)
		});
		bounds.union(panelBounds);
		columnDepths[column] += panelDepth + gutter;
	}
	const center = bounds.getCenter(new THREE.Vector3());
	center.y = 0;
	for (const offset of offsets.values()) offset.sub(center);
	const shift = center.clone().negate();
	for (const group of groups) {
		group.bounds.translate(shift);
		group.panelBounds.translate(shift);
		group.labelAnchor.add(shift);
	}
	bounds.translate(shift);
	return { offsets, bounds, groups };
}
