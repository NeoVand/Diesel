import * as THREE from 'three';
import type { LabState } from '$lib/engine/lab-state';
import { makeFinish } from './source-components';

export type SectionSource = {
	id: string;
	geometry: THREE.BufferGeometry;
	visible: boolean;
	offset: THREE.Vector3;
};
export interface SectionCapResult {
	geometry: THREE.BufferGeometry;
	closedContours: number;
	openContours: number;
	triangles: number;
}
const EPSILON = 1e-5;
const AXES = {
	x: new THREE.Vector3(1, 0, 0),
	y: new THREE.Vector3(0, 1, 0),
	z: new THREE.Vector3(0, 0, 1)
};

/** Weld triangle/plane intersections and triangulate only closed contours, preserving nested holes.
 * Open meshes are deliberately not patched with invented solid surfaces.
 */
export function deriveSectionCap(
	geometry: THREE.BufferGeometry,
	plane: THREE.Plane
): SectionCapResult {
	const position = geometry.getAttribute('position'),
		index = geometry.index;
	if (!geometry.boundingBox) geometry.computeBoundingBox();
	const box = geometry.boundingBox!;
	let min = Infinity,
		max = -Infinity;
	for (const x of [box.min.x, box.max.x])
		for (const y of [box.min.y, box.max.y])
			for (const z of [box.min.z, box.max.z]) {
				const d = plane.distanceToPoint(new THREE.Vector3(x, y, z));
				min = Math.min(min, d);
				max = Math.max(max, d);
			}
	// A plane touching an existing outer face is not a cut: adding a cap would duplicate that face.
	if (min >= -EPSILON || max <= EPSILON) {
		const empty = new THREE.BufferGeometry();
		empty.setAttribute('position', new THREE.Float32BufferAttribute([], 3));
		return { geometry: empty, closedContours: 0, openContours: 0, triangles: 0 };
	}
	const normal = plane.normal;
	const basisU =
		Math.abs(normal.y) < 0.9
			? new THREE.Vector3(0, 1, 0).cross(normal).normalize()
			: new THREE.Vector3(1, 0, 0).cross(normal).normalize();
	const basisV = new THREE.Vector3().crossVectors(normal, basisU).normalize();
	const origin = normal.clone().multiplyScalar(-plane.constant);
	const nodes: THREE.Vector3[] = [],
		adjacency: number[][] = [],
		nodeMap = new Map<string, number>(),
		edgeKeys = new Set<string>();
	const node = (p: THREE.Vector3) => {
		const key = `${Math.round(p.x / EPSILON)},${Math.round(p.y / EPSILON)},${Math.round(p.z / EPSILON)}`;
		let id = nodeMap.get(key);
		if (id === undefined) {
			id = nodes.length;
			nodeMap.set(key, id);
			nodes.push(p.clone());
			adjacency.push([]);
		}
		return id;
	};
	const a = new THREE.Vector3(),
		b = new THREE.Vector3(),
		c = new THREE.Vector3();
	const count = index?.count ?? position.count;
	for (let i = 0; i < count; i += 3) {
		a.fromBufferAttribute(position, index ? index.getX(i) : i);
		b.fromBufferAttribute(position, index ? index.getX(i + 1) : i + 1);
		c.fromBufferAttribute(position, index ? index.getX(i + 2) : i + 2);
		const vertices = [a, b, c],
			distances = vertices.map((p) => plane.distanceToPoint(p));
		if (distances.every((d) => d > EPSILON) || distances.every((d) => d < -EPSILON)) continue;
		const hits: THREE.Vector3[] = [];
		for (let edge = 0; edge < 3; edge++) {
			const next = (edge + 1) % 3,
				d0 = distances[edge],
				d1 = distances[next];
			if (Math.abs(d0) <= EPSILON) hits.push(vertices[edge].clone());
			if (d0 * d1 < 0) hits.push(vertices[edge].clone().lerp(vertices[next], d0 / (d0 - d1)));
		}
		const unique = hits.filter((p, i) =>
			hits.slice(0, i).every((other) => p.distanceToSquared(other) > EPSILON * EPSILON)
		);
		if (unique.length !== 2) continue;
		const n0 = node(unique[0]),
			n1 = node(unique[1]);
		if (n0 === n1) continue;
		const key = n0 < n1 ? `${n0}:${n1}` : `${n1}:${n0}`;
		if (edgeKeys.has(key)) continue;
		edgeKeys.add(key);
		adjacency[n0].push(n1);
		adjacency[n1].push(n0);
	}
	const visited = new Set<string>(),
		loops: THREE.Vector2[][] = [];
	let openContours = 0;
	const edgeKey = (i: number, j: number) => (i < j ? `${i}:${j}` : `${j}:${i}`);
	for (let start = 0; start < nodes.length; start++)
		for (const first of adjacency[start]) {
			if (visited.has(edgeKey(start, first))) continue;
			const route = [start];
			let previous = start,
				current = first,
				closed = false;
			for (let guard = 0; guard <= nodes.length; guard++) {
				visited.add(edgeKey(previous, current));
				if (current === start) {
					closed = true;
					break;
				}
				route.push(current);
				const next = adjacency[current].find(
					(candidate) => candidate !== previous && !visited.has(edgeKey(current, candidate))
				);
				if (next === undefined) break;
				previous = current;
				current = next;
			}
			if (!closed || route.length < 3 || route.some((id) => adjacency[id].length !== 2)) {
				openContours++;
				continue;
			}
			const projected = route.map((id) => {
				const p = nodes[id].clone().sub(origin);
				return new THREE.Vector2(p.dot(basisU), p.dot(basisV));
			});
			if (Math.abs(THREE.ShapeUtils.area(projected)) > EPSILON * EPSILON) loops.push(projected);
		}
	const contains = (polygon: THREE.Vector2[], point: THREE.Vector2) => {
		let inside = false;
		for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
			const a = polygon[i],
				b = polygon[j];
			if (
				a.y > point.y !== b.y > point.y &&
				point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
			)
				inside = !inside;
		}
		return inside;
	};
	const areas = loops.map((loop) => Math.abs(THREE.ShapeUtils.area(loop)));
	const parents = loops.map((loop, i) => {
		let parent = -1,
			area = Infinity;
		for (let j = 0; j < loops.length; j++)
			if (i !== j && areas[j] > areas[i] && areas[j] < area && contains(loops[j], loop[0])) {
				parent = j;
				area = areas[j];
			}
		return parent;
	});
	const depth = (i: number) => {
		let d = 0;
		for (
			let parent = parents[i], guard = 0;
			parent >= 0 && guard < loops.length;
			parent = parents[parent], guard++
		)
			d++;
		return d;
	};
	const shapes: THREE.Shape[] = [];
	loops.forEach((loop, i) => {
		if (depth(i) % 2) return;
		const shape = new THREE.Shape(loop);
		loops.forEach((hole, j) => {
			if (parents[j] === i && depth(j) % 2) shape.holes.push(new THREE.Path(hole));
		});
		shapes.push(shape);
	});
	if (!shapes.length) {
		const empty = new THREE.BufferGeometry();
		empty.setAttribute('position', new THREE.Float32BufferAttribute([], 3));
		return { geometry: empty, closedContours: loops.length, openContours, triangles: 0 };
	}
	const cap = new THREE.ShapeGeometry(shapes, 1),
		attribute = cap.getAttribute('position');
	for (let i = 0; i < attribute.count; i++) {
		const point = origin
			.clone()
			.addScaledVector(basisU, attribute.getX(i))
			.addScaledVector(basisV, attribute.getY(i))
			.addScaledVector(normal, EPSILON * 2);
		attribute.setXYZ(i, point.x, point.y, point.z);
	}
	cap.computeVertexNormals();
	cap.computeBoundingBox();
	cap.computeBoundingSphere();
	cap.setAttribute(
		'teachingPart',
		new THREE.Float32BufferAttribute(new Float32Array(attribute.count).fill(1), 1)
	);
	return {
		geometry: cap,
		closedContours: loops.length,
		openContours,
		triangles: (cap.index?.count ?? attribute.count) / 3
	};
}

/** Adjustable world-space cut through the purchased shell. The guide never controls clipping. */
export class EngineSection {
	readonly plane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);
	readonly group = new THREE.Group();
	readonly caps = new THREE.Group();
	private guide: THREE.LineSegments;
	private capMaterial = makeFinish('iron');
	private signature = '';
	private bounds = new THREE.Box3();
	readonly capReport = new Map<
		string,
		{ closedContours: number; openContours: number; triangles: number; rendered: boolean }
	>();
	private cutEdgeMaterial = new THREE.LineBasicMaterial({
		color: 0x8a8270,
		transparent: true,
		opacity: 0.46,
		depthWrite: false
	});
	constructor() {
		this.group.name = 'Adjustable engineering section';
		this.caps.name = 'Derived closed source section faces';
		this.group.add(this.caps);
		this.capMaterial.color.set(0x72767a);
		this.capMaterial.roughness = 0.65;
		this.capMaterial.metalness = 0.6;
		this.capMaterial.side = THREE.DoubleSide;
		this.guide = new THREE.LineSegments(
			new THREE.BufferGeometry(),
			new THREE.LineDashedMaterial({
				color: 0xac9265,
				transparent: true,
				opacity: 0.38,
				dashSize: 0.045,
				gapSize: 0.035,
				depthWrite: false
			})
		);
		this.guide.name = 'Section plane guide';
		this.group.add(this.guide);
	}
	invalidate() {
		this.signature = '';
	}
	setBounds(bounds: THREE.Box3) {
		this.bounds.copy(bounds);
		this.signature = '';
	}
	update(state: LabState, sources: SectionSource[]) {
		this.group.visible = state.display === 'section';
		if (!this.group.visible) return;
		const settings = state.section,
			axis = AXES[settings.axis],
			coordinate = THREE.MathUtils.lerp(
				this.bounds.min[settings.axis],
				this.bounds.max[settings.axis],
				settings.offset
			);
		this.plane.normal.copy(axis).multiplyScalar(settings.flipped ? 1 : -1);
		this.plane.constant = -coordinate * (settings.flipped ? 1 : -1);
		this.guide.visible = settings.visible;
		const signature = [
			settings.axis,
			settings.offset,
			settings.flipped,
			state.explosion,
			state.internals,
			state.isolated ? state.selected : 'combined',
			sources
				.filter((s) => s.visible)
				.map((s) => `${s.id}:${s.offset.lengthSq() > 0.000001 ? 'moving' : 'settled'}`)
				.join('|')
		].join(';');
		if (signature === this.signature) return;
		this.signature = signature;
		const size = this.bounds.getSize(new THREE.Vector3()),
			center = this.bounds.getCenter(new THREE.Vector3());
		center[settings.axis] = coordinate;
		const u = settings.axis === 'x' ? 'y' : 'x',
			v = settings.axis === 'z' ? 'y' : 'z';
		const corners = [
			[-1, -1],
			[1, -1],
			[1, 1],
			[-1, 1]
		].map(([a, b]) => {
			const p = center.clone();
			p[u] += a * (size[u] / 2 + 0.1);
			p[v] += b * (size[v] / 2 + 0.1);
			return p;
		});
		const points: THREE.Vector3[] = [];
		for (let i = 0; i < 4; i++) points.push(corners[i], corners[(i + 1) % 4]);
		this.guide.geometry.dispose();
		this.guide.geometry = new THREE.BufferGeometry().setFromPoints(points);
		this.guide.computeLineDistances();
		for (const child of this.caps.children) (child as THREE.Mesh).geometry.dispose();
		this.caps.clear();
		this.capReport.clear();
		// Caps are computed on demand for major purchased solids. During exploded motion,
		// open separation surfaces remain visible rather than fabricating a moving solid fill.
		if (state.explosion > 0.001) return;
		for (const source of sources) {
			if (!source.visible || source.offset.lengthSq() > 0.000001) continue;
			const result = deriveSectionCap(source.geometry, this.plane);
			const unverifiedInterior =
				source.id === 'Frame_156826' || /^Frame_Object_0(0[3-9]|1[0-4])$/.test(source.id);
			const sourceOnlyInspection = state.isolated && state.selected === source.id;
			const renderFill = !(unverifiedInterior && state.internals && !sourceOnlyInspection);
			this.capReport.set(source.id, {
				closedContours: result.closedContours,
				openContours: result.openContours,
				triangles: result.triangles,
				rendered: renderFill
			});
			if (!result.triangles) {
				result.geometry.dispose();
				continue;
			}
			if (!renderFill) {
				// Purchased casting/cover interior ports are not validated against the teaching rig.
				// Filling their whole contour invents solid material across instructional valve/bore
				// space and makes coincident source/teaching caps fight. Keep the source boundary
				// in this combined presentation; source-only inspection still fills closed contours.
				const boundary = new THREE.LineSegments(
					new THREE.EdgesGeometry(result.geometry, 0.1),
					this.cutEdgeMaterial
				);
				boundary.name = `${source.id} cut boundary · interior volume unverified`;
				this.caps.add(boundary);
				result.geometry.dispose();
				continue;
			}
			const cap = new THREE.Mesh(result.geometry, this.capMaterial);
			cap.name = `Section face · ${source.id}`;
			cap.userData.componentId = source.id;
			cap.receiveShadow = true;
			this.caps.add(cap);
		}
	}
	pickables(): THREE.Mesh[] {
		return this.group.visible
			? (this.caps.children.filter((child) => child instanceof THREE.Mesh) as THREE.Mesh[])
			: [];
	}
	dispose() {
		this.guide.geometry.dispose();
		(this.guide.material as THREE.Material).dispose();
		this.capMaterial.dispose();
		this.cutEdgeMaterial.dispose();
		for (const child of this.caps.children) (child as THREE.Mesh).geometry.dispose();
		this.group.clear();
	}
}

type MovingCapEntry = {
	id: string;
	meshes: THREE.Mesh[];
	group: THREE.Group;
	masks: { source: THREE.Mesh; back: THREE.Mesh; front: THREE.Mesh }[];
	face: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshPhysicalMaterial>;
	backMaterial: THREE.MeshBasicMaterial;
	frontMaterial: THREE.MeshBasicMaterial;
	normalPass: { value: number };
};

/** Nonzero winding in the original, uncut component. Oppositely wound bore surfaces subtract,
 * while overlapping closed detail primitives add. Used only when picking a cut face, not per frame.
 */
export function sectionSolidContainsPoint(meshes: THREE.Mesh[], point: THREE.Vector3): boolean {
	let winding = 0;
	const direction = new THREE.Vector3(0.3713907, 0.557086, 0.742781).normalize();
	const inverse = new THREE.Matrix4(),
		localPoint = new THREE.Vector3();
	const a = new THREE.Vector3(),
		b = new THREE.Vector3(),
		c = new THREE.Vector3();
	const hit = new THREE.Vector3(),
		normal = new THREE.Vector3();
	for (const mesh of meshes) {
		inverse.copy(mesh.matrixWorld).invert();
		localPoint.copy(point).applyMatrix4(inverse);
		const ray = new THREE.Ray(localPoint, direction.clone().transformDirection(inverse));
		const position = mesh.geometry.getAttribute('position'),
			index = mesh.geometry.index;
		const crossings = new Map<number, number>();
		for (let i = 0; i < (index?.count ?? position.count); i += 3) {
			a.fromBufferAttribute(position, index ? index.getX(i) : i);
			b.fromBufferAttribute(position, index ? index.getX(i + 1) : i + 1);
			c.fromBufferAttribute(position, index ? index.getX(i + 2) : i + 2);
			if (!ray.intersectTriangle(a, b, c, false, hit)) continue;
			const distance = hit.distanceTo(localPoint);
			if (distance < EPSILON) continue;
			normal.subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
			const sign = normal.dot(ray.direction) > 0 ? 1 : -1;
			// Shared triangle edges have one geometric crossing, not two.
			const key = Math.round(distance / EPSILON);
			if (!crossings.has(key)) crossings.set(key, sign);
		}
		for (const crossing of crossings.values()) winding += crossing;
	}
	return winding !== 0;
}

/** Moving closed teaching solids are capped by their actual triangle winding on the GPU.
 * No convex hull, filled bounding box, or per-frame CPU triangulation is involved. Every component
 * gets an isolated stencil interval; all its finishes contribute to the union and genuine bores
 * subtract. The same stencil interval runs in beauty and GTAO's normal/depth buffer.
 */
export class MovingSectionCaps {
	readonly group = new THREE.Group();
	readonly report = new Map<string, { planes: number; triangles: number }>();
	private entries = new Map<string, MovingCapEntry>();
	private faceGeometry = new THREE.PlaneGeometry(1, 1);
	private box = new THREE.Box3();
	private localBox = new THREE.Box3();
	private point = new THREE.Vector3();
	private origin = new THREE.Vector3();
	private basisU = new THREE.Vector3();
	private basisV = new THREE.Vector3();
	private orientation = new THREE.Matrix4();
	private activeFaces: THREE.Mesh[] = [];

	constructor() {
		this.group.name = 'Closed moving instructional section faces';
	}

	private create(id: string, meshes: THREE.Mesh[], planeIndex: number): MovingCapEntry {
		const group = new THREE.Group();
		group.name = `${id} · moving solid section ${planeIndex + 1}`;
		// Object and group ordering keeps every back/front/cap interval contiguous in both passes.
		group.renderOrder = 1000 + this.entries.size * 4;
		const backMaterial = new THREE.MeshBasicMaterial({
			colorWrite: false,
			depthWrite: false,
			depthTest: false,
			side: THREE.BackSide,
			stencilWrite: true,
			stencilFunc: THREE.AlwaysStencilFunc,
			stencilFail: THREE.IncrementWrapStencilOp,
			stencilZFail: THREE.IncrementWrapStencilOp,
			stencilZPass: THREE.IncrementWrapStencilOp
		});
		backMaterial.allowOverride = false;
		const frontMaterial = backMaterial.clone();
		frontMaterial.side = THREE.FrontSide;
		frontMaterial.stencilFail = THREE.DecrementWrapStencilOp;
		frontMaterial.stencilZFail = THREE.DecrementWrapStencilOp;
		frontMaterial.stencilZPass = THREE.DecrementWrapStencilOp;
		frontMaterial.allowOverride = false;
		const masks = meshes.map((source) => {
			const back = new THREE.Mesh(source.geometry, backMaterial);
			const front = new THREE.Mesh(source.geometry, frontMaterial);
			for (const mesh of [back, front]) {
				mesh.matrixAutoUpdate = false;
				mesh.frustumCulled = false;
			}
			back.renderOrder = 0;
			front.renderOrder = 1;
			group.add(back, front);
			return { source, back, front };
		});
		const finish = id.startsWith('mech:piston')
			? 'aluminium'
			: id.startsWith('mech:liner') || id === 'mech:block'
				? 'iron'
				: 'steel';
		const material = makeFinish(finish);
		// A cut is a freshly machined face; anisotropy needs UVs and this quad has them.
		material.color.set(finish === 'aluminium' ? 0xb7c2cc : finish === 'iron' ? 0x8b99a2 : 0x9facb7);
		material.roughness = 0.55;
		material.metalness = 0.4;
		material.side = THREE.DoubleSide;
		material.stencilWrite = true;
		material.stencilRef = 0;
		material.stencilFunc = THREE.NotEqualStencilFunc;
		material.stencilFail = THREE.KeepStencilOp;
		material.stencilZFail = THREE.KeepStencilOp;
		material.stencilZPass = THREE.KeepStencilOp;
		material.allowOverride = false;
		const normalPass = { value: 0 };
		const original = material.onBeforeCompile;
		material.onBeforeCompile = (shader, renderer) => {
			original.call(material, shader, renderer);
			shader.uniforms.uSectionNormalPass = normalPass;
			shader.fragmentShader = 'uniform float uSectionNormalPass;\n' + shader.fragmentShader;
			// GTAO needs this cap's normal and depth, not its lighting/IBL/shadow computation.
			shader.fragmentShader = shader.fragmentShader.replace(
				'#include <normal_fragment_maps>',
				'#include <normal_fragment_maps>\nif(uSectionNormalPass>.5){gl_FragColor=vec4(normal*.5+.5,1.0);return;}'
			);
		};
		material.customProgramCacheKey = () => `moving-solid-cap-normal-v2-${finish}`;
		const face = new THREE.Mesh(this.faceGeometry, material);
		face.userData.componentId = id;
		face.renderOrder = 2;
		face.frustumCulled = false;
		face.receiveShadow = true;
		face.onBeforeRender = (_renderer, scene) => {
			normalPass.value = scene.overrideMaterial?.type === 'MeshNormalMaterial' ? 1 : 0;
		};
		face.onAfterRender = (renderer) => renderer.clearStencil();
		const planeRaycast = face.raycast.bind(face);
		face.raycast = (raycaster, intersections) => {
			const hits: THREE.Intersection[] = [];
			planeRaycast(raycaster, hits);
			for (const hit of hits)
				if (sectionSolidContainsPoint(meshes, hit.point)) intersections.push(hit);
		};
		group.add(face);
		this.group.add(group);
		return { id, meshes, group, masks, face, backMaterial, frontMaterial, normalPass };
	}

	update(meshes: THREE.Mesh[], planes: THREE.Plane[]) {
		this.group.visible = planes.length > 0;
		this.report.clear();
		this.activeFaces = [];
		for (const entry of this.entries.values()) entry.group.visible = false;
		if (!planes.length) return;
		const components = new Map<string, THREE.Mesh[]>();
		for (const mesh of meshes) {
			const id = mesh.userData.componentId;
			if (typeof id !== 'string') continue;
			if (!components.has(id)) components.set(id, []);
			components.get(id)!.push(mesh);
		}
		for (const [id, solids] of components) {
			this.box.makeEmpty();
			for (const mesh of solids) {
				if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
				this.localBox.copy(mesh.geometry.boundingBox!).applyMatrix4(mesh.matrixWorld);
				this.box.union(this.localBox);
			}
			for (let planeIndex = 0; planeIndex < planes.length; planeIndex++) {
				const plane = planes[planeIndex];
				let minDistance = Infinity,
					maxDistance = -Infinity;
				for (const x of [this.box.min.x, this.box.max.x])
					for (const y of [this.box.min.y, this.box.max.y])
						for (const z of [this.box.min.z, this.box.max.z]) {
							const d = plane.distanceToPoint(this.point.set(x, y, z));
							minDistance = Math.min(minDistance, d);
							maxDistance = Math.max(maxDistance, d);
						}
				if (minDistance >= -EPSILON || maxDistance <= EPSILON) continue;
				const key = `${id}/${planeIndex}`;
				let entry = this.entries.get(key);
				if (!entry) {
					entry = this.create(id, solids, planeIndex);
					this.entries.set(key, entry);
				}
				entry.group.visible = true;
				// Count the full solid behind this plane; other planes trim the resulting face only.
				// Counting an already doubly-open slab would lose its winding closure.
				entry.backMaterial.clippingPlanes = [plane];
				entry.frontMaterial.clippingPlanes = [plane];
				entry.face.material.clippingPlanes = planes.filter((_p, index) => index !== planeIndex);
				for (const mask of entry.masks) {
					mask.back.matrix.copy(mask.source.matrixWorld);
					mask.front.matrix.copy(mask.source.matrixWorld);
				}
				plane.projectPoint(this.box.getCenter(this.origin), this.origin);
				this.basisU
					.set(Math.abs(plane.normal.y) < 0.9 ? 0 : 1, Math.abs(plane.normal.y) < 0.9 ? 1 : 0, 0)
					.cross(plane.normal)
					.normalize();
				this.basisV.crossVectors(plane.normal, this.basisU).normalize();
				let minU = Infinity,
					maxU = -Infinity,
					minV = Infinity,
					maxV = -Infinity;
				for (const x of [this.box.min.x, this.box.max.x])
					for (const y of [this.box.min.y, this.box.max.y])
						for (const z of [this.box.min.z, this.box.max.z]) {
							this.point.set(x, y, z).sub(this.origin);
							const u = this.point.dot(this.basisU),
								v = this.point.dot(this.basisV);
							minU = Math.min(minU, u);
							maxU = Math.max(maxU, u);
							minV = Math.min(minV, v);
							maxV = Math.max(maxV, v);
						}
				entry.face.position
					.copy(this.origin)
					.addScaledVector(this.basisU, (minU + maxU) / 2)
					.addScaledVector(this.basisV, (minV + maxV) / 2)
					.addScaledVector(plane.normal, EPSILON * 2);
				// The exposed solid face points out of the retained half-space.
				this.orientation.makeBasis(
					this.basisU,
					this.basisV.clone().negate(),
					plane.normal.clone().negate()
				);
				entry.face.quaternion.setFromRotationMatrix(this.orientation);
				entry.face.scale.set(maxU - minU + 0.002, maxV - minV + 0.002, 1);
				this.activeFaces.push(entry.face);
				const report = this.report.get(id) ?? { planes: 0, triangles: 0 };
				report.planes++;
				report.triangles += solids.reduce(
					(sum, mesh) =>
						sum + (mesh.geometry.index?.count ?? mesh.geometry.getAttribute('position').count) / 3,
					0
				);
				this.report.set(id, report);
			}
		}
		this.group.updateMatrixWorld(true);
	}

	pickables() {
		return this.group.visible ? this.activeFaces : [];
	}

	dispose() {
		for (const entry of this.entries.values()) {
			entry.backMaterial.dispose();
			entry.frontMaterial.dispose();
			entry.face.material.dispose();
		}
		this.faceGeometry.dispose();
		this.entries.clear();
		this.group.clear();
	}
}
