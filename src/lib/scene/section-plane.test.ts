import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createLabState } from '$lib/engine/lab-state';
import {
	deriveSectionCap,
	EngineSection,
	MovingSectionCaps,
	sectionSolidContainsPoint
} from './section-plane';

function capArea(geometry: THREE.BufferGeometry): number {
	const positions = geometry.getAttribute('position'),
		index = geometry.index;
	const a = new THREE.Vector3(),
		b = new THREE.Vector3(),
		c = new THREE.Vector3();
	let area = 0;
	for (let i = 0; i < (index?.count ?? positions.count); i += 3) {
		a.fromBufferAttribute(positions, index ? index.getX(i) : i);
		b.fromBufferAttribute(positions, index ? index.getX(i + 1) : i + 1);
		c.fromBufferAttribute(positions, index ? index.getX(i + 2) : i + 2);
		area += b.sub(a).cross(c.sub(a)).length() / 2;
	}
	return area;
}

function coversPoint(geometry: THREE.BufferGeometry, point: THREE.Vector3): boolean {
	const positions = geometry.getAttribute('position'),
		index = geometry.index;
	const triangle = new THREE.Triangle();
	for (let i = 0; i < (index?.count ?? positions.count); i += 3) {
		triangle.a.fromBufferAttribute(positions, index ? index.getX(i) : i);
		triangle.b.fromBufferAttribute(positions, index ? index.getX(i + 1) : i + 1);
		triangle.c.fromBufferAttribute(positions, index ? index.getX(i + 2) : i + 2);
		if (triangle.containsPoint(point)) return true;
	}
	return false;
}

describe('purchased-mesh section faces', () => {
	it('cuts a closed box into a planar 2 by 2 face', () => {
		const box = new THREE.BoxGeometry(2, 2, 2);
		const plane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);
		const cap = deriveSectionCap(box, plane);
		expect(cap.closedContours).toBe(1);
		expect(cap.openContours).toBe(0);
		expect(capArea(cap.geometry)).toBeCloseTo(4, 5);
		const positions = cap.geometry.getAttribute('position');
		for (let i = 0; i < positions.count; i++)
			expect(Math.abs(positions.getZ(i))).toBeLessThan(0.00003);
		cap.geometry.dispose();
		box.dispose();
	});

	it('does not duplicate an existing exterior face when a plane merely touches it', () => {
		const geometry = new THREE.BoxGeometry(2, 2, 2);
		const result = deriveSectionCap(geometry, new THREE.Plane(new THREE.Vector3(0, 0, -1), 1));
		expect(result.triangles).toBe(0);
		expect(result.closedContours).toBe(0);
		result.geometry.dispose();
		geometry.dispose();
	});

	it('preserves the bore through an annular section instead of filling its center', () => {
		// A torus has a known analytic equatorial cross-section: radii 1.3 and .7.
		const torus = new THREE.TorusGeometry(1, 0.3, 32, 128);
		const cap = deriveSectionCap(torus, new THREE.Plane(new THREE.Vector3(0, 0, -1), 0));
		expect(cap.closedContours).toBe(2);
		expect(capArea(cap.geometry)).toBeCloseTo(Math.PI * (1.3 ** 2 - 0.7 ** 2), 2);
		expect(coversPoint(cap.geometry, new THREE.Vector3(0, 0, -0.00002))).toBe(false);
		expect(coversPoint(cap.geometry, new THREE.Vector3(1, 0, -0.00002))).toBe(true);
		cap.geometry.dispose();
		torus.dispose();
	});

	it('leaves a cut through an open sheet uncapped', () => {
		const sheet = new THREE.PlaneGeometry(2, 2);
		const cap = deriveSectionCap(sheet, new THREE.Plane(new THREE.Vector3(1, 0, 0), 0));
		expect(cap.openContours).toBeGreaterThan(0);
		expect(cap.triangles).toBe(0);
		expect(capArea(cap.geometry)).toBe(0);
		cap.geometry.dispose();
		sheet.dispose();
	});

	it('honors guide visibility independently of isolation and clipping', () => {
		const section = new EngineSection();
		section.setBounds(new THREE.Box3(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, 1, 1)));
		const state = createLabState({
			display: 'section',
			isolated: true,
			selected: 'Frame_Object_003'
		});
		section.update(state, []);
		const guide = section.group.getObjectByName('Section plane guide');
		expect(guide?.visible).toBe(true);
		expect(section.group.visible).toBe(true);
		const plane = section.plane.clone();
		section.update({ ...state, section: { ...state.section, visible: false } }, []);
		expect(guide?.visible).toBe(false);
		expect(section.group.visible).toBe(true);
		expect(section.plane.equals(plane)).toBe(true);
		section.dispose();
	});

	it('recovers closed caps after exploded parts settle back into assembly', () => {
		const section = new EngineSection(),
			geometry = new THREE.BoxGeometry(2, 2, 2);
		section.setBounds(new THREE.Box3(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, 1, 1)));
		const source = { id: 'Frame_Object_002', geometry, visible: true, offset: new THREE.Vector3() };
		const state = createLabState({ display: 'section' });
		section.update(state, [source]);
		expect(section.pickables()).toHaveLength(1);
		source.offset.set(0, 1, 0);
		section.update({ ...state, explosion: 1 }, [source]);
		expect(section.pickables()).toHaveLength(0);
		section.update(state, [source]);
		expect(section.pickables()).toHaveLength(0);
		source.offset.set(0, 0, 0);
		section.update(state, [source]);
		expect(section.pickables()).toHaveLength(1);
		section.dispose();
		geometry.dispose();
	});

	it('shows an unverified main-casting boundary rather than an opaque invented interior slab', () => {
		const section = new EngineSection(),
			geometry = new THREE.BoxGeometry(2, 2, 2);
		section.setBounds(new THREE.Box3(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, 1, 1)));
		const state = createLabState({ display: 'section', internals: true });
		const source = { id: 'Frame_156826', geometry, visible: true, offset: new THREE.Vector3() };
		section.update(state, [source]);
		expect(section.capReport.get(source.id)?.closedContours).toBe(1);
		expect(section.capReport.get(source.id)?.rendered).toBe(false);
		expect(section.pickables()).toHaveLength(0);
		expect(section.caps.children[0]).toBeInstanceOf(THREE.LineSegments);
		section.update({ ...state, internals: false }, [source]);
		expect(section.pickables()).toHaveLength(1);
		expect(section.capReport.get(source.id)?.rendered).toBe(true);
		section.dispose();
		geometry.dispose();
	});
});

describe('moving instructional solid caps', () => {
	it('retains the bearing hole and overlapping closed solid unions in cap picking', () => {
		const outer = new THREE.Shape();
		outer.absarc(0, 0, 1, 0, Math.PI * 2, false);
		const hole = new THREE.Path();
		hole.absarc(0, 0, 0.35, 0, Math.PI * 2, true);
		outer.holes.push(hole);
		const geometry = new THREE.ExtrudeGeometry(outer, {
			depth: 0.8,
			bevelEnabled: false,
			curveSegments: 32
		}).translate(0, 0, -0.4);
		const ring = new THREE.Mesh(geometry);
		ring.updateMatrixWorld(true);
		expect(sectionSolidContainsPoint([ring], new THREE.Vector3(0, 0, 0))).toBe(false);
		expect(sectionSolidContainsPoint([ring], new THREE.Vector3(0.7, 0, 0))).toBe(true);
		const box = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8));
		box.updateMatrixWorld(true);
		expect(sectionSolidContainsPoint([ring, box], new THREE.Vector3(0, 0, 0))).toBe(true);
		expect(sectionSolidContainsPoint([ring, box], new THREE.Vector3(1.5, 0, 0))).toBe(false);
		geometry.dispose();
		box.geometry.dispose();
	});

	it('tracks the same rigid solid through arbitrary cuts and moving/exploded transforms', () => {
		const caps = new MovingSectionCaps();
		const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
		mesh.userData.componentId = 'mech:piston:01';
		mesh.updateMatrixWorld(true);
		for (const normal of [
			new THREE.Vector3(1, 0, 0),
			new THREE.Vector3(0, 1, 0),
			new THREE.Vector3(0, 0, 1),
			new THREE.Vector3(0.3, -0.7, 0.5).normalize()
		]) {
			caps.update([mesh], [new THREE.Plane(normal, 0)]);
			expect(caps.pickables()).toHaveLength(1);
			expect(caps.pickables()[0].userData.componentId).toBe('mech:piston:01');
		}
		mesh.position.set(5, 0, 0);
		mesh.updateMatrixWorld(true);
		caps.update([mesh], [new THREE.Plane(new THREE.Vector3(1, 0, 0), 0)]);
		expect(caps.pickables()).toHaveLength(0);
		caps.update([mesh], [new THREE.Plane(new THREE.Vector3(1, 0, 0), -5)]);
		expect(caps.pickables()).toHaveLength(1);
		caps.update([], [new THREE.Plane(new THREE.Vector3(1, 0, 0), -5)]);
		expect(caps.pickables()).toHaveLength(0);
		caps.dispose();
		mesh.geometry.dispose();
	});

	it('a cut-face ray selects the solid wall but never its bearing aperture', () => {
		const caps = new MovingSectionCaps();
		const shape = new THREE.Shape();
		shape.absarc(0, 0, 1, 0, Math.PI * 2, false);
		const hole = new THREE.Path();
		hole.absarc(0, 0, 0.3, 0, Math.PI * 2, true);
		shape.holes.push(hole);
		const mesh = new THREE.Mesh(
			new THREE.ExtrudeGeometry(shape, {
				depth: 1,
				bevelEnabled: false,
				curveSegments: 32
			}).translate(0, 0, -0.5)
		);
		mesh.userData.componentId = 'mech:rod:01';
		mesh.updateMatrixWorld(true);
		caps.update([mesh], [new THREE.Plane(new THREE.Vector3(0, 0, -1), 0)]);
		const holeRay = new THREE.Raycaster(new THREE.Vector3(0, 0, 2), new THREE.Vector3(0, 0, -1));
		const wallRay = new THREE.Raycaster(new THREE.Vector3(0.7, 0, 2), new THREE.Vector3(0, 0, -1));
		expect(holeRay.intersectObjects(caps.pickables())).toHaveLength(0);
		expect(wallRay.intersectObjects(caps.pickables())).toHaveLength(1);
		caps.dispose();
		mesh.geometry.dispose();
	});
});

describe('source and instructional section provenance', () => {
	it('keeps unverified source cover fills out of teaching ports while closing source-only inspection', () => {
		const section = new EngineSection();
		const geometry = new THREE.BoxGeometry(2, 2, 2);
		section.setBounds(new THREE.Box3(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, 1, 1)));
		const source = { id: 'Frame_Object_003', geometry, visible: true, offset: new THREE.Vector3() };
		const state = createLabState({ display: 'section', internals: true });
		section.update(state, [source]);
		expect(section.capReport.get(source.id)?.rendered).toBe(false);
		expect(section.caps.children[0]).toBeInstanceOf(THREE.LineSegments);
		section.update({ ...state, isolated: true, selected: source.id }, [source]);
		expect(section.capReport.get(source.id)?.rendered).toBe(true);
		expect(section.pickables()).toHaveLength(1);
		section.dispose();
		geometry.dispose();
	});
});
