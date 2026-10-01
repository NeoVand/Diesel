import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { EducationalMechanism } from './educational-mechanism';
import { createLabState } from '$lib/engine/lab-state';
import { calculateMechanism, cylinderPhases } from '$lib/engine/mechanism';
import { createPartsLayout, EXPLOSION_MULTIPLIER } from './parts-layout';

const group = (rig: EducationalMechanism, name: string) => rig.group.getObjectByName(name)!;

describe('authored mechanism presentation and collisions', () => {
	it('uses uniform embedded cylinder geometry with separate axial layout and connected journal positions', () => {
		const rig = new EducationalMechanism();
		const covers = Array.from(
			{ length: 12 },
			(_, index) =>
				new THREE.Vector3((Math.floor(index / 2) - 2.5) * 0.62, 0.6, index % 2 ? 0.75 : -0.75)
		);
		rig.alignToSource(covers);
		const state = { ...createLabState(), display: 'section' as const };
		for (const phase of [0, 90, 180, 355, 420, 630]) {
			rig.update(phase, state, 0, 0);
			expect(rig.group.scale.x).toBe(rig.group.scale.y);
			expect(rig.group.scale.y).toBe(rig.group.scale.z);
			const crank = group(rig, 'Crankshaft & flywheel');
			for (const cylinder of cylinderPhases(phase)) {
				const piston = group(
						rig,
						`Piston & rings · cylinder ${String(cylinder.index + 1).padStart(2, '0')}`
					),
					bank = piston.parent!;
				const origin = bank.localToWorld(new THREE.Vector3());
				const xAxis = bank.localToWorld(new THREE.Vector3(1, 0, 0)).sub(origin),
					zAxis = bank.localToWorld(new THREE.Vector3(0, 0, 1)).sub(origin);
				expect(xAxis.length()).toBeCloseTo(zAxis.length(), 12);
				expect(xAxis.dot(zAxis)).toBeCloseTo(0, 12);
				const k = calculateMechanism(cylinder.phaseDeg);
				const rodPin = bank.localToWorld(
					new THREE.Vector3(0, k.crankPinYmm * 0.003, k.crankPinXmm * 0.003)
				);
				const angle = ((-cylinder.row * 120 - 30) * Math.PI) / 180;
				const journalPin = crank.localToWorld(
					new THREE.Vector3(
						(cylinder.row - 2.5) * 0.58,
						Math.cos(angle) * 0.285,
						Math.sin(angle) * 0.285
					)
				);
				expect(rodPin.y).toBeCloseTo(journalPin.y, 12);
				expect(rodPin.z).toBeCloseTo(journalPin.z, 12);
				expect(Math.abs(rodPin.x - journalPin.x) + 0.049 * rig.group.scale.x).toBeLessThan(
					0.12 * crank.scale.x * rig.group.scale.x
				);
			}
		}
		rig.update(90, { ...state, display: 'mechanism' }, 0, 0);
		expect(rig.group.scale.toArray()).toEqual([1, 1, 1]);
		expect(group(rig, 'Crankshaft & flywheel').scale.x).toBe(1);
		rig.dispose();
	});

	it('suppresses duplicate heads and cams only in intact source presentations', () => {
		const rig = new EducationalMechanism();
		const state = { ...createLabState(), display: 'assembly' as const };
		rig.update(355, state, 0, 0);
		expect(group(rig, 'Cut cylinder head · 01').visible).toBe(false);
		expect(group(rig, 'Piston & rings · cylinder 01').visible).toBe(true);
		rig.update(355, { ...state, selected: 'heads' }, 0, 0);
		expect(group(rig, 'Cut cylinder head · 01').visible).toBe(false);
		rig.update(355, state, 1, 0);
		expect(group(rig, 'Cut cylinder head · 01').visible).toBe(true);
		rig.update(355, { ...state, display: 'cylinder' }, 0, 0);
		expect(group(rig, 'Cut cylinder head · 01').visible).toBe(true);
		rig.dispose();
	});
	it('shows a bounded fuel spray and compression/ignition cue at a paused phase and clips both', () => {
		const rig = new EducationalMechanism();
		const plane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);
		const state = {
			...createLabState(),
			display: 'section' as const,
			running: false,
			flows: ['fuel' as const]
		};
		rig.update(355, state, 0, 0, 0, [plane]);
		const spray = group(rig, 'Fuel spray · cylinder 01') as THREE.Mesh<
			THREE.ConeGeometry,
			THREE.MeshBasicMaterial
		>;
		const charge = group(rig, 'Trapped charge · cylinder 01') as THREE.Mesh<
			THREE.CylinderGeometry,
			THREE.MeshBasicMaterial
		>;
		expect(spray.visible).toBe(true);
		expect(spray.material.opacity).toBeGreaterThan(0);
		expect(charge.material.opacity).toBeGreaterThan(0.1);
		expect(spray.material.clippingPlanes).toEqual([plane]);
		expect(charge.material.clippingPlanes).toEqual([plane]);
		const piston = group(rig, 'Piston & rings · cylinder 01');
		expect(spray.position.y - spray.scale.y / 2).toBeGreaterThan(piston.position.y + 0.198);
		rig.update(420, state, 0, 0, 0, [plane]);
		expect(spray.visible).toBe(false);
		expect(charge.material.opacity).toBeGreaterThan(0.24);
		rig.update(355, state, 1, 0, 0, [plane]);
		expect(spray.visible).toBe(false);
		expect(charge.visible).toBe(false);
		rig.dispose();
	});
	it('keeps the actual liner and piston mesh envelopes outside the local rotating crank', () => {
		const rig = new EducationalMechanism(),
			state = { ...createLabState(), display: 'mechanism' as const };
		rig.update(180, state, 0, 0);
		let maxCrankRadius = 0;
		group(rig, 'Crankshaft & flywheel').traverse((object) => {
			if (!(object instanceof THREE.Mesh)) return;
			const position = object.geometry.getAttribute('position');
			for (let i = 0; i < position.count; i++) {
				if (Math.abs(position.getX(i)) < 1.8)
					maxCrankRadius = Math.max(maxCrankRadius, Math.hypot(position.getY(i), position.getZ(i)));
			}
		});
		let minPistonOffsetY = Infinity,
			minLinerRadius = Infinity,
			linerWidth = 0;
		group(rig, 'Piston & rings · cylinder 01').traverse((object) => {
			if (!(object instanceof THREE.Mesh)) return;
			const p = object.geometry.getAttribute('position');
			for (let i = 0; i < p.count; i++) minPistonOffsetY = Math.min(minPistonOffsetY, p.getY(i));
		});
		group(rig, 'Sectioned liner · cylinder 01').traverse((object) => {
			if (!(object instanceof THREE.Mesh)) return;
			object.geometry.computeBoundingBox();
			linerWidth = Math.max(
				linerWidth,
				object.geometry.boundingBox!.max.x - object.geometry.boundingBox!.min.x
			);
			const p = object.geometry.getAttribute('position');
			for (let i = 0; i < p.count; i++)
				minLinerRadius = Math.min(minLinerRadius, Math.hypot(p.getY(i), p.getZ(i)));
		});
		expect(linerWidth).toBeLessThan(0.58);
		expect(minLinerRadius).toBeGreaterThan(maxCrankRadius);
		for (let phase = 0; phase <= 720; phase++) {
			rig.update(phase, state, 0, 0);
			for (let cylinder = 1; cylinder <= 12; cylinder++) {
				const piston = group(rig, `Piston & rings · cylinder ${String(cylinder).padStart(2, '0')}`);
				expect(piston.position.y + minPistonOffsetY).toBeGreaterThan(maxCrankRadius);
			}
		}
		rig.dispose();
	}, 30000);
});

type SolidRange = { start: number; count: number; name: string };
const solidRanges = (mesh: THREE.Mesh) => mesh.geometry.userData.solidRanges as SolidRange[];
const componentMeshes = (root: THREE.Object3D) => {
	const meshes: THREE.Mesh[] = [];
	root.traverse((object) => {
		if (object instanceof THREE.Mesh) meshes.push(object);
	});
	return meshes;
};
const namedSolid = (root: THREE.Object3D, name: string) => {
	for (const mesh of componentMeshes(root)) {
		const range = solidRanges(mesh).find((r) => r.name === name);
		if (range) return { mesh, range };
	}
	throw new Error(`Missing solid ${name}`);
};
const insideSolid = (mesh: THREE.Mesh, range: SolidRange, point: THREE.Vector3) => {
	const direction = new THREE.Vector3(1, 0.173, 0.071).normalize();
	const ray = new THREE.Ray(point, direction),
		target = new THREE.Vector3();
	const p = mesh.geometry.getAttribute('position');
	let winding = 0;
	for (let i = range.start; i < range.start + range.count; i += 3) {
		const a = new THREE.Vector3().fromBufferAttribute(p, i),
			b = new THREE.Vector3().fromBufferAttribute(p, i + 1),
			c = new THREE.Vector3().fromBufferAttribute(p, i + 2);
		if (ray.intersectTriangle(a, b, c, false, target))
			winding += Math.sign(b.sub(a).cross(c.sub(a)).dot(direction));
	}
	return winding !== 0;
};

describe('solid teaching sections and joint clearances', () => {
	it('keeps every constituent solid closed, consistently oriented and volumetric', () => {
		const rig = new EducationalMechanism();
		let solids = 0;
		for (const mesh of rig.pickables) {
			expect(solidRanges(mesh), mesh.userData.componentId).toBeDefined();
		}
		for (const mesh of rig.pickables)
			for (const range of solidRanges(mesh) ?? []) {
				const p = mesh.geometry.getAttribute('position');
				const edges = new Map<string, { count: number; winding: number }>();
				const key = (v: THREE.Vector3) =>
					v
						.toArray()
						.map((x) => Math.round(x / 1e-6))
						.join(',');
				let volume = 0;
				for (let i = range.start; i < range.start + range.count; i += 3) {
					const a = new THREE.Vector3().fromBufferAttribute(p, i),
						b = new THREE.Vector3().fromBufferAttribute(p, i + 1),
						c = new THREE.Vector3().fromBufferAttribute(p, i + 2);
					if (b.clone().sub(a).cross(c.clone().sub(a)).lengthSq() < 1e-18) continue;
					volume += a.dot(b.clone().cross(c)) / 6;
					const keys = [key(a), key(b), key(c)];
					for (let j = 0; j < 3; j++) {
						const aKey = keys[j],
							bKey = keys[(j + 1) % 3];
						if (aKey === bKey) continue;
						const pair = aKey < bKey ? `${aKey}|${bKey}` : `${bKey}|${aKey}`;
						const edge = edges.get(pair) ?? { count: 0, winding: 0 };
						edge.count++;
						edge.winding += aKey < bKey ? 1 : -1;
						edges.set(pair, edge);
					}
				}
				const invalid = [...edges.values()].filter(
					(edge) => edge.count !== 2 || edge.winding !== 0
				);
				expect(invalid, `${mesh.userData.componentId}: ${range.name}`).toEqual([]);
				expect(volume).toBeGreaterThan(1e-12);
				solids++;
			}
		expect(solids).toBeGreaterThan(700);
		const piston = group(rig, 'Piston & rings · cylinder 01');
		const crown = namedSolid(piston, 'Crown and hollow skirt');
		expect(insideSolid(crown.mesh, crown.range, new THREE.Vector3(0, 0.07, 0))).toBe(false);
		expect(insideSolid(crown.mesh, crown.range, new THREE.Vector3(0, 0.1, 0))).toBe(true);
		expect(insideSolid(crown.mesh, crown.range, new THREE.Vector3(0.2, 0, 0))).toBe(true);
		expect(insideSolid(crown.mesh, crown.range, new THREE.Vector3(0.174, 0, 0))).toBe(false);
		rig.dispose();
	}, 30000);

	it('keeps rods axially clear of every non-joint crank solid and of their paired rod', () => {
		const rig = new EducationalMechanism();
		rig.update(180, { ...createLabState(), display: 'mechanism' }, 0, 0);
		const crank = group(rig, 'Crankshaft & flywheel');
		let minimumGap = Infinity,
			pairedGap = Infinity;
		for (let cylinder = 1; cylinder <= 12; cylinder++) {
			const rod = group(rig, `Connecting rod · cylinder ${String(cylinder).padStart(2, '0')}`);
			const box = new THREE.Box3().expandByObject(rod);
			for (const mesh of componentMeshes(crank))
				for (const range of solidRanges(mesh)) {
					if (range.name.startsWith('Crank pin ')) continue;
					const p = mesh.geometry.getAttribute('position');
					let min = Infinity,
						max = -Infinity;
					for (let i = range.start; i < range.start + range.count; i++) {
						const x = new THREE.Vector3()
							.fromBufferAttribute(p, i)
							.applyMatrix4(mesh.matrixWorld).x;
						min = Math.min(min, x);
						max = Math.max(max, x);
					}
					minimumGap = Math.min(minimumGap, Math.max(min - box.max.x, box.min.x - max));
				}
			if (cylinder % 2) {
				const other = new THREE.Box3().expandByObject(
					group(rig, `Connecting rod · cylinder ${String(cylinder + 1).padStart(2, '0')}`)
				);
				pairedGap = Math.min(pairedGap, other.min.x - box.max.x);
			}
		}
		// These measured authored gaps are not production clearance specifications. Axial rotation preserves them.
		expect(minimumGap / 0.003).toBeGreaterThan(2.3);
		expect(pairedGap / 0.003).toBeGreaterThan(7.3);
		rig.dispose();
	});

	it('retains real pin apertures and keeps the rod inside the piston cavity through all phases', () => {
		const rig = new EducationalMechanism();
		const rod = group(rig, 'Connecting rod · cylinder 01'),
			piston = group(rig, 'Piston & rings · cylinder 01');
		for (const name of ['Big-end bearing', 'Small-end bearing']) {
			const bearing = namedSolid(rod, name);
			expect(
				insideSolid(
					bearing.mesh,
					bearing.range,
					new THREE.Vector3(0, name === 'Big-end bearing' ? -0.525 : 0.525, 0)
				)
			).toBe(false);
		}
		const points = componentMeshes(rod).flatMap((mesh) => {
			const p = mesh.geometry.getAttribute('position');
			return Array.from({ length: p.count }, (_, i) =>
				new THREE.Vector3().fromBufferAttribute(p, i)
			);
		});
		let minimumCrownGap = Infinity,
			minimumSkirtGap = Infinity;
		const matrix = new THREE.Matrix4();
		for (let phase = 0; phase <= 720; phase++) {
			rig.update(phase, { ...createLabState(), display: 'mechanism' }, 0, 0);
			matrix.copy(piston.matrixWorld).invert().multiply(rod.matrixWorld);
			const transformed = points.map((point) => point.clone().applyMatrix4(matrix));
			for (const point of transformed) {
				minimumCrownGap = Math.min(minimumCrownGap, 0.085 - point.y);
				if (point.y >= -0.15)
					minimumSkirtGap = Math.min(minimumSkirtGap, 0.18 - Math.hypot(point.x, point.z));
			}
			// Include edge crossings at the skirt's lower plane; checking vertices alone would miss a clipped triangle.
			for (let i = 0; i < transformed.length; i += 3)
				for (let j = 0; j < 3; j++) {
					const a = transformed[i + j],
						b = transformed[i + ((j + 1) % 3)];
					if ((a.y + 0.15) * (b.y + 0.15) < 0) {
						const p = a.clone().lerp(b, (-0.15 - a.y) / (b.y - a.y));
						minimumSkirtGap = Math.min(minimumSkirtGap, 0.18 - Math.hypot(p.x, p.z));
					}
				}
		}
		expect(minimumCrownGap / 0.003).toBeGreaterThan(3);
		expect(minimumSkirtGap / 0.003).toBeGreaterThan(14);
		rig.dispose();
	}, 30000);

	it('frames the real injector, chamber and crown together only for assembled fuel inspection', () => {
		const rig = new EducationalMechanism();
		const state = {
			...createLabState(),
			display: 'cylinder' as const,
			focused: 'mech:injector:01',
			flows: ['fuel' as const]
		};
		for (const phase of [355, 420]) {
			rig.update(phase, state, 0, 0);
			const box = rig.bounds('mech:injector:01', true);
			const piston = group(rig, 'Piston & rings · cylinder 01');
			expect(box.containsPoint(piston.localToWorld(new THREE.Vector3(0, 0.198, 0)))).toBe(true);
			expect(box.getSize(new THREE.Vector3()).length()).toBeLessThan(1.6);
		}
		rig.dispose();
	});
});

describe('teaching injector deck clearance', () => {
	it('keeps the injector body inside an actual open deck bore', () => {
		const rig = new EducationalMechanism();
		const deck = namedSolid(
			group(rig, 'Cut cylinder head · 01'),
			'Deck with valve and injector apertures'
		);
		// Check the axis and full body radius through the deck's real material, not a bounding-box cut.
		for (const angle of Array.from({ length: 72 }, (_, i) => (i * Math.PI) / 36)) {
			expect(
				insideSolid(
					deck.mesh,
					deck.range,
					new THREE.Vector3(Math.cos(angle) * 0.029, 1.625, 0.082 + Math.sin(angle) * 0.029)
				)
			).toBe(false);
		}
		expect(insideSolid(deck.mesh, deck.range, new THREE.Vector3(0, 1.625, 0.082))).toBe(false);
		expect(insideSolid(deck.mesh, deck.range, new THREE.Vector3(0.04, 1.625, 0.082))).toBe(true);
		rig.dispose();
	});
});

describe('piston crown planar shading', () => {
	it('uses axial normals on every real flat face and retains the original vertices and topology', () => {
		const rig = new EducationalMechanism();
		const { mesh, range } = namedSolid(
			group(rig, 'Piston & rings · cylinder 01'),
			'Crown and hollow skirt'
		);
		const position = mesh.geometry.getAttribute('position'),
			normal = mesh.geometry.getAttribute('normal');
		const fingerprint = (array: ArrayBufferView) =>
			createHash('sha256')
				.update(new Uint8Array(array.buffer, array.byteOffset, array.byteLength))
				.digest('hex');
		// Recorded before the normals-only repair: all positions, order, UVs and solid ranges are fixed.
		expect(fingerprint(position.array)).toBe(
			'eaeb0281ef432a2a5152062dbda314d95d50a98921f341e78ff0900627735748'
		);
		expect(fingerprint(mesh.geometry.getAttribute('uv').array)).toBe(
			'd6f607f95d4b054921f6d94c47fc1aa732aa460a75b6a3f4387ebcaf7ad66ab7'
		);
		expect((mesh.material as THREE.MeshPhysicalMaterial).anisotropy).toBe(0);
		expect(mesh.geometry.index).toBe(null);
		expect(position.count).toBe(9840);
		expect(range).toEqual({ start: 0, count: 6384, name: 'Crown and hollow skirt' });
		const steelMesh = componentMeshes(group(rig, 'Piston & rings · cylinder 01')).find(
			(part) => part !== mesh
		)!;
		expect((steelMesh.material as THREE.MeshPhysicalMaterial).anisotropy).toBe(0.25);
		const headAluminium = namedSolid(
			group(rig, 'Cut cylinder head · 01'),
			'Deck with valve and injector apertures'
		).mesh;
		expect((headAluminium.material as THREE.MeshPhysicalMaterial).anisotropy).toBe(0.2);
		let flatFaces = 0,
			crownFaces = 0,
			bowlFaces = 0;
		for (let i = range.start; i < range.start + range.count; i += 3) {
			const a = new THREE.Vector3().fromBufferAttribute(position, i),
				b = new THREE.Vector3().fromBufferAttribute(position, i + 1),
				c = new THREE.Vector3().fromBufferAttribute(position, i + 2);
			const cross = b.clone().sub(a).cross(c.clone().sub(a));
			if (cross.lengthSq() < 1e-20 || Math.max(a.y, b.y, c.y) - Math.min(a.y, b.y, c.y) > 1e-7)
				continue;
			flatFaces++;
			if (Math.abs(a.y - 0.198) < 1e-7) crownFaces++;
			if (Math.abs(a.y - 0.148) < 1e-7) bowlFaces++;
			for (let j = 0; j < 3; j++) {
				expect(normal.getX(i + j)).toBeCloseTo(0, 7);
				expect(normal.getY(i + j)).toBeCloseTo(Math.sign(cross.y), 7);
				expect(normal.getZ(i + j)).toBeCloseTo(0, 7);
			}
		}
		expect(flatFaces).toBeGreaterThan(250);
		expect(crownFaces).toBe(112);
		expect(bowlFaces).toBe(56);
		rig.dispose();
	});
});

const expectMatrixClose = (actual: THREE.Matrix4, expected: THREE.Matrix4) => {
	actual.elements.forEach((value, index) =>
		expect(value).toBeCloseTo(expected.elements[index], 11)
	);
};

describe('teaching parts atlas', () => {
	it('exposes all canonical boxes without changing the live pose or leaking mutable bounds', () => {
		const rig = new EducationalMechanism();
		rig.update(
			355,
			{ ...createLabState(), display: 'assembly', explosion: 0.6, selected: 'mech:piston:01' },
			0.6,
			12
		);
		const matrices = rig.registry.map((item) => group(rig, item.name).matrixWorld.clone());
		const inputs = rig.getLayoutInputs();
		expect(inputs).toHaveLength(88);
		expect(inputs.map((item) => item.id)).toEqual(rig.registry.map((item) => item.id));
		for (const [index, item] of rig.registry.entries())
			expectMatrixClose(group(rig, item.name).matrixWorld, matrices[index]);
		const original = inputs[0].bounds.clone();
		inputs[0].bounds.min.setScalar(-1000);
		expect(rig.getLayoutInputs()[0].bounds.equals(original)).toBe(true);
		rig.update(0, { ...createLabState(), display: 'mechanism' }, 0, 0);
		for (const input of rig.getLayoutInputs()) {
			const record = rig.registry.find((item) => item.id === input.id)!;
			const actual = new THREE.Box3().expandByObject(group(rig, record.name));
			expect(actual.min.distanceTo(input.bounds.min)).toBeLessThan(1e-11);
			expect(actual.max.distanceTo(input.bounds.max)).toBeLessThan(1e-11);
		}
		rig.dispose();
	});

	it('starts the burst at the displayed pose and reaches exact cells without offset leakage', () => {
		const rig = new EducationalMechanism();
		const state = { ...createLabState(), display: 'assembly' as const, explosion: 0.4 };
		rig.update(355, state, 0.4, 0);
		const entry = new Map(
			rig.registry.map((item) => [item.id, group(rig, item.name).matrixWorld.clone()])
		);
		const entryPosition = rig.group.position.clone(),
			entryScale = rig.group.scale.clone();
		const entryCrank = group(rig, 'Crankshaft & flywheel').quaternion.clone();
		const layout = createPartsLayout(rig.getLayoutInputs());
		const atlas = { ...state, display: 'layout' as const };
		rig.setLayoutPresentation(layout, 0, 0);
		rig.update(0, atlas, 0.4, 0);
		for (const item of rig.registry)
			expectMatrixClose(group(rig, item.name).matrixWorld, entry.get(item.id)!);
		rig.setLayoutPresentation(layout, 0, 0.5);
		rig.update(0, atlas, 0.7, 0);
		expect(
			rig.group.position.distanceTo(entryPosition.clone().lerp(new THREE.Vector3(0, -0.72, 0), 0.5))
		).toBeLessThan(1e-12);
		expect(
			rig.group.scale.distanceTo(entryScale.clone().lerp(new THREE.Vector3(1, 1, 1), 0.5))
		).toBeLessThan(1e-12);
		const halfwayCrank = entryCrank.clone().slerp(new THREE.Quaternion(), 0.5);
		expect(group(rig, 'Crankshaft & flywheel').quaternion.angleTo(halfwayCrank)).toBeLessThan(1e-7);
		// The burst finishes at the same threefold local displacement used by assembly explosion.
		rig.setLayoutPresentation(layout, 0, 1);
		rig.update(0, atlas, 1, 0);
		const head = group(rig, 'Cut cylinder head · 01');
		expect(head.position.distanceTo(new THREE.Vector3(-0.75, 1.95, 0))).toBeLessThan(1e-12);
		const explodedBoxes = new Map(
			rig.registry.map((item) => [item.id, new THREE.Box3().expandByObject(group(rig, item.name))])
		);
		for (const blend of [0.2, 0.5, 0.9, 1]) {
			rig.setLayoutPresentation(layout, blend, 1);
			rig.update(420, atlas, 1, 99);
			for (const item of rig.registry) {
				const placement = layout.placements.get(item.id)!;
				const start = explodedBoxes.get(item.id)!;
				// Positive uniform scales preserve each AABB corner under the source shader affine.
				const expected = new THREE.Box3(
					start.min.clone().lerp(placement.bounds.min, blend),
					start.max.clone().lerp(placement.bounds.max, blend)
				);
				const actual = new THREE.Box3().expandByObject(group(rig, item.name));
				expect(actual.min.distanceTo(expected.min), item.id).toBeLessThan(1e-10);
				expect(actual.max.distanceTo(expected.max), item.id).toBeLessThan(1e-10);
			}
		}

		expect(() => rig.setLayoutPresentation(layout, 0, NaN)).toThrow(RangeError);
		rig.dispose();
	});

	it('honors the Internals toggle throughout an atlas and restores its meshes when enabled', () => {
		const rig = new EducationalMechanism(),
			layout = createPartsLayout(rig.getLayoutInputs());
		rig.setLayoutPresentation(layout, 1, 1);
		rig.update(0, { ...createLabState(), display: 'layout', internals: false }, 0, 0);
		expect(rig.group.visible).toBe(false);
		expect(rig.visiblePickables()).toHaveLength(0);
		expect(rig.bounds().isEmpty()).toBe(true);
		rig.update(0, { ...createLabState(), display: 'layout', internals: true }, 0, 0);
		expect(rig.group.visible).toBe(true);
		expect(new Set(rig.visiblePickables().map((mesh) => mesh.userData.componentId)).size).toBe(88);
		rig.dispose();
	});

	it('places every rigid component in its shared cell with uniform scaling and no cycle or flow effects', () => {
		const rig = new EducationalMechanism(),
			layout = createPartsLayout(rig.getLayoutInputs());
		const state = {
			...createLabState(),
			display: 'layout' as const,
			running: true,
			flows: ['fuel' as const, 'air' as const],
			explosion: 1,
			removed: ['mech:piston:01']
		};
		rig.setLayoutPresentation(layout, 1);
		rig.update(355, state, 1, 10, 0.3);
		const matrices = new Map<string, THREE.Matrix4>();
		for (const item of rig.registry) {
			const object = group(rig, item.name),
				placement = layout.placements.get(item.id)!;
			const box = new THREE.Box3().expandByObject(object);
			expect(box.min.distanceTo(placement.bounds.min)).toBeLessThan(1e-10);
			expect(box.max.distanceTo(placement.bounds.max)).toBeLessThan(1e-10);
			const scale = new THREE.Vector3();
			object.matrixWorld.decompose(new THREE.Vector3(), new THREE.Quaternion(), scale);
			expect(scale.x).toBeCloseTo(placement.scale, 12);
			expect(scale.y).toBeCloseTo(placement.scale, 12);
			expect(scale.z).toBeCloseTo(placement.scale, 12);
			matrices.set(item.id, object.matrixWorld.clone());
		}
		for (const name of ['air', 'exhaust', 'fuel', 'coolant', 'oil'])
			expect(group(rig, `Schematic ${name} routing`).visible).toBe(false);
		expect(group(rig, 'Fuel spray · cylinder 01').visible).toBe(false);
		expect(group(rig, 'Trapped charge · cylinder 01').visible).toBe(false);
		expect(rig.transitioning).toBe(false);
		rig.update(630, state, 0.6, 100, 0.3);
		for (const item of rig.registry)
			expectMatrixClose(group(rig, item.name).matrixWorld, matrices.get(item.id)!);
		// Raycasting uses the very same scaled mesh, not the component's old assembly location.
		const piston = group(rig, 'Piston & rings · cylinder 01');
		const origin = piston.localToWorld(new THREE.Vector3(0.2, 0.35, 0));
		const direction = new THREE.Vector3(0, -1, 0).transformDirection(piston.matrixWorld);
		const hit = new THREE.Raycaster(origin, direction).intersectObjects(
			componentMeshes(piston),
			false
		)[0];
		expect(hit?.object.userData.componentId).toBe('mech:piston:01');
		rig.dispose();
	});

	it('keeps semantic isolation and hidden parts aligned with the atlas bounds and picking', () => {
		const rig = new EducationalMechanism(),
			layout = createPartsLayout(rig.getLayoutInputs());
		rig.setLayoutPresentation(layout, 1);
		rig.update(
			0,
			{
				...createLabState(),
				display: 'layout',
				selected: 'mech:piston',
				isolated: true,
				hidden: ['mech:piston:06'],
				removed: ['mech:piston:02']
			},
			0,
			0
		);
		const visible = new Set(rig.visiblePickables().map((mesh) => mesh.userData.componentId));
		expect(visible.size).toBe(11);
		expect(visible.has('mech:piston:06')).toBe(false);
		expect(visible.has('mech:piston:02')).toBe(true);
		const expected = new THREE.Box3();
		for (const id of visible) expected.union(layout.placements.get(id)!.bounds);
		const actual = rig.bounds('mech:piston', true, true);
		expect(actual.min.distanceTo(expected.min)).toBeLessThan(1e-10);
		expect(actual.max.distanceTo(expected.max)).toBeLessThan(1e-10);
		rig.update(
			0,
			{ ...createLabState(), display: 'layout', selected: 'heads', isolated: true },
			0,
			0
		);
		for (const mesh of rig.visiblePickables())
			expect(rig.registry.find((item) => item.id === mesh.userData.componentId)?.parent).toBe(
				'heads'
			);
		rig.dispose();
	});

	it('restores assembly scales, section planes and phase after complete or partial layout presentation', () => {
		const rig = new EducationalMechanism();
		const plane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);
		const state = {
			...createLabState(),
			display: 'section' as const,
			explosion: 0.4,
			flows: ['fuel' as const]
		};
		rig.update(420, state, 0.4, 1, 0, [plane]);
		const matrices = rig.registry.map((item) => group(rig, item.name).matrixWorld.clone());
		const layout = createPartsLayout(rig.getLayoutInputs());
		for (const blend of [0.5, 1, 0.3]) {
			rig.setLayoutPresentation(layout, blend);
			// Reverse transitions can already carry the real display; the frame presentation stays an atlas.
			rig.update(630, state, 0.4, 12, 0, [plane]);
			for (const mesh of rig.visiblePickables())
				expect((mesh.material as THREE.Material).clippingPlanes).toEqual([]);
		}
		rig.setLayoutPresentation(null, 0);
		rig.update(420, state, 0.4, 1, 0, [plane]);
		for (const [index, item] of rig.registry.entries())
			expectMatrixClose(group(rig, item.name).matrixWorld, matrices[index]);
		for (const mesh of rig.visiblePickables())
			expect((mesh.material as THREE.Material).clippingPlanes).toEqual([plane]);
		expect(() => rig.setLayoutPresentation(layout, NaN)).toThrow(RangeError);
		rig.dispose();
	});

	it('widens teaching explosion by the shared factor while retaining a normalized control', () => {
		const rig = new EducationalMechanism();
		const state = { ...createLabState(), display: 'assembly' as const };
		rig.update(0, state, 0, 0);
		const head = group(rig, 'Cut cylinder head · 01'),
			rest = head.position.clone();
		rig.update(0, { ...state, explosion: 1 }, 1, 0);
		expect(head.position.y - rest.y).toBeCloseTo(0.65 * EXPLOSION_MULTIPLIER, 12);
		expect(head.visible).toBe(true);
		rig.dispose();
	});
});

describe('presentation-only atlas and explosion scope', () => {
	it('applies exactly one shared threefold displacement to every teaching component', () => {
		const rig = new EducationalMechanism(),
			state = { ...createLabState(), display: 'assembly' as const };
		expect(EXPLOSION_MULTIPLIER).toBe(3);
		rig.update(355, state, 0, 0);
		const originals = new Map(
			rig.registry.map((item) => [item.id, group(rig, item.name).position.clone()])
		);
		for (const amount of [0.25, 0.5, 1]) {
			rig.update(355, { ...state, explosion: amount }, amount, 0);
			for (const item of rig.registry) {
				const expected = new THREE.Vector3();
				const match = item.id.match(/^mech:([\w-]+):(\d{2})$/);
				if (match) {
					const index = Number(match[2]) - 1;
					const offsets: Record<string, [number, number, number]> = {
						liner: [0, 0.12, 0.4],
						head: [0, 0.65, 0],
						piston: [0, 0.8, 0.2],
						rod: [0, 0, 0.65],
						'intake-valve': [0, 0.7, 0],
						'exhaust-valve': [0, 0.7, 0],
						injector: [0, 0.8, 0.18]
					};
					expected.fromArray(offsets[match[1]]);
					expected.z *= index % 2 ? 1 : -1;
					expected.x += (Math.floor(index / 2) - 2.5) * 0.1;
				} else if (item.id === 'mech:crankshaft') expected.set(0, -0.28, 0);
				else if (item.id.startsWith('mech:camshaft:')) expected.set(0, 0.8, 0);
				expected.multiplyScalar(3 * amount);
				const actual = group(rig, item.name).position.clone().sub(originals.get(item.id)!);
				expect(actual.distanceTo(expected), item.id).toBeLessThan(1e-12);
			}
		}
		rig.dispose();
	});

	it('keeps all mesh vertex, normal, UV and index bytes unchanged across presentation transforms', () => {
		const rig = new EducationalMechanism();
		const buffers = rig.pickables.map((mesh) => ({
			mesh,
			attributes: Object.fromEntries(
				Object.entries(mesh.geometry.attributes).map(([name, attribute]) => [
					name,
					{
						reference: attribute.array,
						bytes: Uint8Array.from(
							new Uint8Array(
								attribute.array.buffer,
								attribute.array.byteOffset,
								attribute.array.byteLength
							)
						)
					}
				])
			),
			index: mesh.geometry.index?.array
		}));
		const assembly = { ...createLabState(), display: 'assembly' as const };
		rig.update(420, { ...assembly, explosion: 1 }, 1, 0);
		const layout = createPartsLayout(rig.getLayoutInputs());
		for (const blend of [0.25, 1, 0.5]) {
			rig.setLayoutPresentation(layout, blend);
			rig.update(355, { ...assembly, display: 'layout' }, 0.7, 120);
		}
		rig.setLayoutPresentation(null, 0);
		rig.update(420, assembly, 0, 0);
		for (const { mesh, attributes, index } of buffers) {
			for (const [name, original] of Object.entries(attributes)) {
				const attribute = mesh.geometry.getAttribute(name);
				expect(attribute.array).toBe(original.reference);
				const current = new Uint8Array(
					attribute.array.buffer,
					attribute.array.byteOffset,
					attribute.array.byteLength
				);
				// A byte comparison catches even small coordinate, normal or topology edits.
				expect(
					Buffer.from(current).equals(Buffer.from(original.bytes)),
					`${mesh.userData.componentId}: ${name}`
				).toBe(true);
			}
			expect(mesh.geometry.index?.array).toBe(index);
		}
		rig.dispose();
	});
});
