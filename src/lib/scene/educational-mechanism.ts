import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import {
	calculateMechanism,
	calculateTeachingChamber,
	cylinderPhases,
	MECHANISM_CONFIG,
	TEACHING_GEOMETRY
} from '$lib/engine/mechanism';
import {
	FLOW_COLORS,
	type ComponentRecord,
	type FlowId,
	type LabState
} from '$lib/engine/lab-state';
import type { PartId } from '$lib/engine/types';
import { makeFinish, type Finish } from './source-components';
import { EXPLOSION_MULTIPLIER, type LayoutInput, type PartsLayout } from './parts-layout';

const MM = 0.003;
const Y = new THREE.Vector3(0, 1, 0);
const PITCH = 0.58;
const R = MECHANISM_CONFIG.crankRadiusMm * MM;
const L = MECHANISM_CONFIG.rodLengthMm * MM;
const BORE = MECHANISM_CONFIG.boreMm * MM;
const HEAD = TEACHING_GEOMETRY.linerTopMm * MM;
const LINER_BOTTOM = TEACHING_GEOMETRY.linerBottomMm * MM;
const LINER_WALL = TEACHING_GEOMETRY.linerWallMm * MM;
const NOZZLE_TIP = TEACHING_GEOMETRY.nozzleTipMm * MM;

export function matchesComponent(id: string, parent: PartId, selected: string | null): boolean {
	return !!selected && (id === selected || parent === selected || id.startsWith(`${selected}:`));
}

type Component = {
	group: THREE.Group;
	id: string;
	parent: PartId;
	rest: THREE.Vector3;
	restQuaternion: THREE.Quaternion;
	parentRestMatrix: THREE.Matrix4;
	offset: THREE.Vector3;
	materials: THREE.MeshPhysicalMaterial[];
	removal: number;
	targetRemoval?: number;
	sectionOnly?: boolean;
	dynamic?: boolean;
};
type LayoutEntryPose = {
	position: THREE.Vector3;
	scale: THREE.Vector3;
	bankX: number[];
	components: Map<
		string,
		{ position: THREE.Vector3; quaternion: THREE.Quaternion; scale: THREE.Vector3 }
	>;
};
type Cylinder = {
	index: number;
	restX: number;
	bank: THREE.Group;
	piston: THREE.Group;
	rod: THREE.Group;
	intake: THREE.Group;
	exhaust: THREE.Group;
	injector: THREE.Group;
	glow: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>;
	spray: THREE.Mesh<THREE.ConeGeometry, THREE.MeshBasicMaterial>;
};
type Route = { samples: THREE.Vector3[]; speed: number; offset: number; index?: number };
type Flow = { group: THREE.Group; arrows: THREE.InstancedMesh; routes: Route[]; count: number };

/** Explicitly educational geometry. Bore/stroke are nominal; layout, rods, ports and timing are illustrative. */
export class EducationalMechanism {
	readonly group = new THREE.Group();
	readonly registry: ComponentRecord[] = [];
	readonly pickables: THREE.Mesh[] = [];
	transitioning = false;
	readonly sectionPlanes = [
		new THREE.Plane(new THREE.Vector3(1, 0, 0), 0),
		new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0)
	];
	private components: Component[] = [];
	private cylinders: Cylinder[] = [];
	private crank: THREE.Group;
	private cams: THREE.Group[] = [];
	private flows = new Map<FlowId, Flow>();
	private baseMaterials = new Map<Finish, THREE.MeshPhysicalMaterial>();
	private disposalGeometries = new Set<THREE.BufferGeometry>();
	private disposalMaterials = new Set<THREE.Material>();
	private dummy = new THREE.Object3D();
	private vector = new THREE.Vector3();
	private tangent = new THREE.Vector3();
	private renderState = '';
	private activeCylinder = 0;
	private display = 'assembly';
	private currentExplosion = 0;
	private targetExplosion = 0;
	private embeddedPresentation = false;
	private fuelInspection = false;
	private layoutPresentation: PartsLayout | null = null;
	private layoutBlend = 0;
	private layoutBurst = 0;
	private layoutEntryPose: LayoutEntryPose | null = null;
	private layoutInputs: LayoutInput[] | null = null;
	private embeddedPosition = new THREE.Vector3(-0.22, -0.91, 0);
	private embeddedScale = new THREE.Vector3(0.88, 0.88, 0.88);
	private embeddedAxialSpacing = 0.965 / 0.88;
	readonly placementEvidence = {
		method:
			'Uniform geometry scale and separate axial spacing inferred from purchased exterior bank-cover centers; instructional placement, not verified OEM geometry',
		matchedSourceGroups: 0,
		scale: [0.88, 0.88, 0.88],
		axialSpacingRatio: 0.965 / 0.88,
		position: [-0.22, -0.91, 0]
	};

	constructor() {
		this.group.name = 'Illustrative V12 teaching mechanism';
		this.group.position.y = -0.72;
		for (const finish of [
			'paint',
			'iron',
			'steel',
			'aluminium',
			'rubber',
			'fastener',
			'exhaust',
			'bronze'
		] as Finish[]) {
			const material = makeFinish(finish);
			this.baseMaterials.set(finish, material);
			this.disposalMaterials.add(material);
		}
		this.crank = this.buildCrank();
		this.buildBed();
		for (const cylinder of cylinderPhases(0))
			this.buildCylinder(cylinder.index, cylinder.row, cylinder.bankAngleDeg);
		this.buildCams();
		this.buildFlows();
		this.group.updateMatrixWorld(true);
	}

	/** Match the repeated cover pitch and bank centers without asserting a physical source-export scale. */
	alignToSource(centers: THREE.Vector3[]) {
		if (centers.length !== 12) return;
		const average = new THREE.Vector3();
		centers.forEach((c) => average.add(c));
		average.multiplyScalar(1 / centers.length);
		const bank = centers.filter((c) => c.z > 0).sort((a, b) => a.x - b.x);
		const pitches = bank
			.slice(1)
			.map((c, i) => c.x - bank[i].x)
			.sort((a, b) => a - b);
		const pitch = pitches[Math.floor(pitches.length / 2)],
			bankOffset = centers.reduce((sum, c) => sum + Math.abs(c.z - average.z), 0) / centers.length;
		const radialScale = bankOffset / ((HEAD + 0.105) * 0.5);
		this.embeddedScale.setScalar(radialScale);
		this.embeddedAxialSpacing = pitch / (PITCH * radialScale);
		this.placementEvidence.axialSpacingRatio = this.embeddedAxialSpacing;
		this.embeddedPosition.set(
			average.x,
			average.y - (HEAD + 0.105) * Math.cos(Math.PI / 6) * radialScale,
			average.z
		);
		this.placementEvidence.matchedSourceGroups = centers.length;
		this.placementEvidence.scale = this.embeddedScale.toArray();
		this.placementEvidence.position = this.embeddedPosition.toArray();
	}

	private mesh(
		geometry: THREE.BufferGeometry,
		finish: Finish,
		parent: THREE.Object3D,
		position?: THREE.Vector3
	): THREE.Mesh {
		const mesh = new THREE.Mesh(geometry, this.baseMaterials.get(finish)!);
		if (position) mesh.position.copy(position);
		mesh.castShadow = true;
		mesh.receiveShadow = true;
		parent.add(mesh);
		this.disposalGeometries.add(geometry);
		return mesh;
	}
	private cylinder(
		radius: number,
		height: number,
		finish: Finish,
		parent: THREE.Object3D,
		pos: THREE.Vector3,
		segments = 36
	): THREE.Mesh {
		return this.mesh(
			new THREE.CylinderGeometry(radius, radius, height, segments),
			finish,
			parent,
			pos
		);
	}
	private sleeve(
		inner: number,
		outer: number,
		height: number,
		finish: Finish,
		parent: THREE.Object3D,
		pos: THREE.Vector3
	): THREE.Mesh {
		const shape = new THREE.Shape();
		shape.absarc(0, 0, outer, 0, Math.PI * 2, false);
		const bore = new THREE.Path();
		bore.absarc(0, 0, inner, 0, Math.PI * 2, true);
		shape.holes.push(bore);
		const geometry = new THREE.ExtrudeGeometry(shape, {
			depth: height,
			bevelEnabled: false,
			curveSegments: 36
		});
		geometry.translate(0, 0, -height / 2);
		geometry.rotateY(Math.PI / 2);
		return this.mesh(geometry, finish, parent, pos);
	}
	/** Close open swept-wire ends while retaining their actual circular section. */
	private closeSweepEnds(
		geometry: THREE.BufferGeometry,
		rings: { indices: number[]; center: THREE.Vector3; normal: THREE.Vector3 }[]
	): THREE.BufferGeometry {
		const positions: number[] = [],
			normals: number[] = [],
			uvs: number[] = [];
		const source = geometry.getAttribute('position');
		for (const ring of rings) {
			for (let i = 0; i < ring.indices.length - 1; i++) {
				const a = new THREE.Vector3().fromBufferAttribute(source, ring.indices[i]);
				const b = new THREE.Vector3().fromBufferAttribute(source, ring.indices[i + 1]);
				const cross = a.clone().sub(ring.center).cross(b.clone().sub(ring.center));
				const points = cross.dot(ring.normal) > 0 ? [ring.center, a, b] : [ring.center, b, a];
				for (const point of points) {
					positions.push(point.x, point.y, point.z);
					normals.push(ring.normal.x, ring.normal.y, ring.normal.z);
					uvs.push(0.5, 0.5);
				}
			}
		}
		const caps = new THREE.BufferGeometry();
		caps.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
		caps.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
		caps.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
		const unindexed = geometry.index ? geometry.toNonIndexed() : geometry.clone();
		const closed = mergeGeometries([unindexed, caps], false)!;
		geometry.dispose();
		unindexed.dispose();
		caps.dispose();
		return closed;
	}

	private ring(
		radius: number,
		tube: number,
		finish: Finish,
		parent: THREE.Object3D,
		pos: THREE.Vector3,
		axis: 'x' | 'y' | 'z' = 'y'
	) {
		const ring = this.mesh(new THREE.TorusGeometry(radius, tube, 8, 48), finish, parent, pos);
		if (axis === 'y') ring.rotation.x = Math.PI / 2;
		if (axis === 'x') ring.rotation.y = Math.PI / 2;
		return ring;
	}
	private bolt(
		parent: THREE.Object3D,
		x: number,
		y: number,
		z: number,
		axis: 'x' | 'y' | 'z' = 'y',
		radius = 0.025
	) {
		const bolt = this.cylinder(radius, 0.023, 'fastener', parent, new THREE.Vector3(x, y, z), 6);
		if (axis === 'x') bolt.rotation.z = Math.PI / 2;
		if (axis === 'z') bolt.rotation.x = Math.PI / 2;
		return bolt;
	}
	private box(
		w: number,
		h: number,
		d: number,
		finish: Finish,
		parent: THREE.Object3D,
		pos: THREE.Vector3
	) {
		return this.mesh(
			new RoundedBoxGeometry(w, h, d, 2, Math.min(0.012, w * 0.09, h * 0.09, d * 0.09)),
			finish,
			parent,
			pos
		);
	}

	private component(
		id: string,
		name: string,
		parent: PartId,
		group: THREE.Group,
		offset: THREE.Vector3,
		options: { sectionOnly?: boolean; dynamic?: boolean } = {}
	): THREE.Group {
		group.name = name;
		// Bake static detail into a few finish batches, retaining one selectable articulated component.
		const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
		group.updateMatrixWorld(true);
		const inverse = new THREE.Matrix4().copy(group.matrixWorld).invert();
		group.traverse((object) => {
			if (!(object instanceof THREE.Mesh)) return;
			let geometry = object.geometry
				.clone()
				.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, object.matrixWorld));
			if (geometry.index) {
				const unindexed = geometry.toNonIndexed();
				geometry.dispose();
				geometry = unindexed;
			}
			geometry.name = object.name || object.geometry.type;
			const material = object.material as THREE.Material;
			if (!batches.has(material)) batches.set(material, []);
			batches.get(material)!.push(geometry);
		});
		group.clear();
		const materials: THREE.MeshPhysicalMaterial[] = [];
		let triangleCount = 0;
		for (const [base, geometries] of batches) {
			let start = 0;
			const solidRanges = geometries.map((g) => {
				const count = g.getAttribute('position').count;
				const range = { start, count, name: g.name };
				start += count;
				return range;
			});
			const geometry = mergeGeometries(geometries, false);
			if (geometry) geometry.userData.solidRanges = solidRanges;
			geometries.forEach((g) => g.dispose());
			if (!geometry) throw new Error(`Cannot combine teaching component ${id}`);
			const material = (base as THREE.MeshPhysicalMaterial).clone();
			// Angular lathe-cap UV derivatives are singular at the pole; keep this flat finish isotropic.
			if (id.startsWith('mech:piston:') && base === this.baseMaterials.get('aluminium'))
				material.anisotropy = 0;
			material.onBeforeCompile = base.onBeforeCompile;
			material.customProgramCacheKey = base.customProgramCacheKey;
			materials.push(material);
			this.disposalGeometries.add(geometry);
			this.disposalMaterials.add(material);
			geometry.setAttribute(
				'teachingPart',
				new THREE.Float32BufferAttribute(
					new Float32Array(geometry.getAttribute('position').count).fill(1),
					1
				)
			);
			const mesh = new THREE.Mesh(geometry, material);
			mesh.castShadow = true;
			mesh.receiveShadow = true;
			mesh.userData.componentId = id;
			group.add(mesh);
			this.pickables.push(mesh);
			triangleCount += (geometry.index?.count ?? geometry.getAttribute('position').count) / 3;
		}
		const parentRestMatrix = new THREE.Matrix4();
		for (let node = group.parent; node && node !== this.group; node = node.parent)
			parentRestMatrix.premultiply(
				new THREE.Matrix4().compose(node.position, node.quaternion, node.scale)
			);
		for (const mesh of group.children as THREE.Mesh[]) {
			mesh.geometry.computeBoundingBox();
		}
		this.components.push({
			group,
			id,
			parent,
			rest: group.position.clone(),
			restQuaternion: group.quaternion.clone(),
			parentRestMatrix,
			offset,
			materials,
			removal: 0,
			...options
		});
		this.registry.push({
			id,
			name,
			parent,
			kind: 'educational',
			confidence: 'illustrative',
			triangleCount,
			material: 'Authored engineering display finishes',
			description:
				'Educational component authored for mechanism explanation. Nominal 170 mm bore and 190 mm stroke are references; the 350 mm rod, bank layout, ports, cam profiles, valve timing and component geometry are illustrative, not verified Caterpillar production geometry.'
		});
		return group;
	}

	private buildCrank(): THREE.Group {
		const group = new THREE.Group();
		this.group.add(group);
		// Main journals are separated by the crank throws: a continuous shaft would intersect the rods at BDC.
		for (let bearing = 0; bearing <= 6; bearing++) {
			const journal = this.cylinder(
				0.11,
				0.2,
				'steel',
				group,
				new THREE.Vector3((bearing - 3) * PITCH, 0, 0)
			);
			journal.rotation.z = Math.PI / 2;
			journal.name = `Main journal ${bearing + 1}`;
		}
		for (const end of [-1, 1]) {
			const stub = this.cylinder(0.11, 0.29, 'steel', group, new THREE.Vector3(end * 1.89, 0, 0));
			stub.rotation.z = Math.PI / 2;
			stub.name = `Shaft end stub ${end}`;
		}
		for (let row = 0; row < 6; row++) {
			const x = (row - 2.5) * PITCH;
			const angle = THREE.MathUtils.degToRad(-row * 120 - 30);
			const pin = new THREE.Vector3(x, Math.cos(angle) * R, Math.sin(angle) * R);
			const journal = this.cylinder(0.071, 0.24, 'steel', group, pin);
			journal.rotation.z = Math.PI / 2;
			journal.name = `Crank pin ${row + 1}`;
			for (const side of [-1, 1]) {
				const web = new THREE.Group();
				web.position.x = x + side * 0.155;
				web.rotation.x = angle;
				group.add(web);
				const disc = this.cylinder(0.22, 0.085, 'iron', web, new THREE.Vector3(0, 0, 0));
				disc.rotation.z = Math.PI / 2;
				disc.name = `Crank web ${row + 1} ${side}`;
				this.box(0.086, R, 0.28, 'iron', web, new THREE.Vector3(0, R / 2, 0));
				const upper = this.cylinder(0.14, 0.09, 'iron', web, new THREE.Vector3(0, R, 0));
				upper.rotation.z = Math.PI / 2;
				upper.name = `Throw cheek ${row + 1} ${side}`;
				const weight = this.cylinder(0.38, 0.075, 'iron', web, new THREE.Vector3(0, -0.07, 0));
				weight.rotation.z = Math.PI / 2;
				weight.name = `Counterweight ${row + 1} ${side}`;
				weight.scale.z = 0.75;
			}
		}
		for (const x of [-1.96, 1.96]) {
			const gear = this.cylinder(0.26, 0.11, 'steel', group, new THREE.Vector3(x, 0, 0));
			gear.rotation.z = Math.PI / 2;
			this.ring(0.27, 0.015, 'iron', group, new THREE.Vector3(x, 0, 0), 'x');
			for (let j = 0; j < 36; j++) {
				const a = (j / 36) * Math.PI * 2;
				const tooth = this.box(
					0.105,
					0.035,
					0.045,
					'steel',
					group,
					new THREE.Vector3(x, Math.cos(a) * 0.275, Math.sin(a) * 0.275)
				);
				tooth.rotation.x = a;
			}
		}
		const flywheel = this.cylinder(0.52, 0.1, 'iron', group, new THREE.Vector3(-2.13, 0, 0));
		flywheel.rotation.z = Math.PI / 2;
		this.ring(0.48, 0.02, 'steel', group, new THREE.Vector3(-2.19, 0, 0), 'x');
		for (let j = 0; j < 12; j++) {
			const a = (j * Math.PI) / 6;
			this.bolt(group, -2.19, Math.cos(a) * 0.34, Math.sin(a) * 0.34, 'x', 0.032);
		}
		return this.component(
			'mech:crankshaft',
			'Crankshaft & flywheel',
			'block',
			group,
			new THREE.Vector3(),
			{ dynamic: true }
		);
	}

	private buildBed() {
		const bed = new THREE.Group();
		this.group.add(bed);
		for (const z of [-0.52, 0.52]) {
			this.box(3.85, 0.17, 0.19, 'paint', bed, new THREE.Vector3(0, -0.35, z));
			this.box(3.93, 0.035, 0.26, 'steel', bed, new THREE.Vector3(0, -0.43, z));
		}
		for (let row = 0; row <= 6; row++) {
			const x = (row - 3) * PITCH;
			this.box(0.14, 0.12, 1.16, 'iron', bed, new THREE.Vector3(x, -0.3, 0));
			this.sleeve(0.111, 0.17, 0.14, 'bronze', bed, new THREE.Vector3(x, 0, 0));
			this.ring(0.18, 0.032, 'iron', bed, new THREE.Vector3(x, 0, 0), 'x');
			for (const z of [-0.49, 0.49]) this.bolt(bed, x, -0.245, z, 'y', 0.035);
		}
		for (const x of [-1.74, 1.74])
			for (const z of [-0.61, 0.61]) {
				this.box(0.36, 0.21, 0.36, 'paint', bed, new THREE.Vector3(x, -0.53, z));
				this.bolt(bed, x, -0.405, z, 'y', 0.043);
				this.box(0.25, 0.47, 0.25, 'iron', bed, new THREE.Vector3(x, -0.88, z));
				this.box(0.39, 0.04, 0.39, 'steel', bed, new THREE.Vector3(x, -1.12, z));
			}
		this.component('mech:block', 'Open crankcase & bearing bed', 'block', bed, new THREE.Vector3());
	}

	private linerGeometry(): THREE.BufferGeometry {
		const inner = BORE / 2,
			outer = inner + LINER_WALL,
			bottom = LINER_BOTTOM,
			top = HEAD;
		const positions: number[] = [],
			normals: number[] = [],
			uvs: number[] = [];
		const quad = (
			a: THREE.Vector3,
			b: THREE.Vector3,
			c: THREE.Vector3,
			d: THREE.Vector3,
			normal: THREE.Vector3
		) => {
			for (const [p, u, v] of [
				[a, 0, 0],
				[b, 1, 0],
				[c, 1, 1],
				[a, 0, 0],
				[c, 1, 1],
				[d, 0, 1]
			] as [THREE.Vector3, number, number][]) {
				positions.push(p.x, p.y, p.z);
				normals.push(normal.x, normal.y, normal.z);
				uvs.push(u, v);
			}
		};
		for (let i = 0; i < 48; i++) {
			const a = Math.PI / 2 + (i / 48) * Math.PI,
				b = Math.PI / 2 + ((i + 1) / 48) * Math.PI;
			const at = (r: number, y: number, t: number) =>
				new THREE.Vector3(Math.sin(t) * r, y, Math.cos(t) * r);
			const radial = new THREE.Vector3(Math.sin((a + b) / 2), 0, Math.cos((a + b) / 2));
			quad(
				at(outer, bottom, a),
				at(outer, bottom, b),
				at(outer, top, b),
				at(outer, top, a),
				radial
			);
			quad(
				at(inner, bottom, b),
				at(inner, bottom, a),
				at(inner, top, a),
				at(inner, top, b),
				radial.clone().negate()
			);
			quad(at(inner, top, a), at(outer, top, a), at(outer, top, b), at(inner, top, b), Y);
			quad(
				at(outer, bottom, a),
				at(inner, bottom, a),
				at(inner, bottom, b),
				at(outer, bottom, b),
				Y.clone().negate()
			);
		}
		for (const angle of [Math.PI / 2, Math.PI * 1.5]) {
			const at = (r: number, y: number) =>
				new THREE.Vector3(Math.sin(angle) * r, y, Math.cos(angle) * r);
			const start = angle < Math.PI;
			quad(
				at(start ? inner : outer, bottom),
				at(start ? outer : inner, bottom),
				at(start ? outer : inner, top),
				at(start ? inner : outer, top),
				new THREE.Vector3(0, 0, 1)
			);
		}
		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
		geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
		geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
		return geometry;
	}

	private buildCylinder(index: number, row: number, bankAngle: number) {
		const number = String(index + 1).padStart(2, '0'),
			x = (row - 2.5) * PITCH + (index % 2 ? 0.057 : -0.057);
		const bank = new THREE.Group();
		bank.position.x = x;
		bank.rotation.x = THREE.MathUtils.degToRad(bankAngle);
		this.group.add(bank);
		const liner = new THREE.Group();
		bank.add(liner);
		this.mesh(this.linerGeometry(), 'iron', liner);
		// Thin machined deck and bronze cut edges make actual wall thickness visible.
		for (const edge of [-1, 1])
			this.box(
				LINER_WALL,
				HEAD - LINER_BOTTOM,
				0.012,
				'bronze',
				liner,
				new THREE.Vector3(edge * (BORE / 2 + LINER_WALL / 2), (HEAD + LINER_BOTTOM) / 2, 0)
			);
		const lipRadius = BORE / 2 + 0.012;
		const lipGeometry = new THREE.TorusGeometry(lipRadius, 0.012, 8, 48, Math.PI);
		const lip = this.mesh(
			this.closeSweepEnds(lipGeometry, [
				{
					indices: Array.from({ length: 9 }, (_, j) => j * 49),
					center: new THREE.Vector3(lipRadius, 0, 0),
					normal: new THREE.Vector3(0, -1, 0)
				},
				{
					indices: Array.from({ length: 9 }, (_, j) => j * 49 + 48),
					center: new THREE.Vector3(-lipRadius, 0, 0),
					normal: new THREE.Vector3(0, -1, 0)
				}
			]),
			'steel',
			liner,
			new THREE.Vector3(0, HEAD, 0)
		);
		lip.rotation.x = Math.PI / 2;
		lip.rotation.z = Math.PI / 2;
		this.component(
			`mech:liner:${number}`,
			`Sectioned liner · cylinder ${number}`,
			'block',
			liner,
			new THREE.Vector3(0, 0.12, 0.4),
			{ sectionOnly: true }
		);
		const head = new THREE.Group();
		bank.add(head);
		this.box(0.55, 0.18, 0.21, 'aluminium', head, new THREE.Vector3(0, HEAD + 0.105, -0.18));
		const deckShape = new THREE.Shape();
		deckShape.moveTo(-0.29, -0.13);
		deckShape.lineTo(0.29, -0.13);
		deckShape.lineTo(0.29, 0.32);
		deckShape.lineTo(-0.29, 0.32);
		deckShape.closePath();
		for (const [xx, zz, rr] of [
			[-0.102, 0, 0.078],
			[0.102, 0, 0.078],
			[0, -0.082, 0.035]
		]) {
			const hole = new THREE.Path();
			hole.absarc(xx, zz, rr, 0, Math.PI * 2, true);
			deckShape.holes.push(hole);
		}
		const deckGeometry = new THREE.ExtrudeGeometry(deckShape, {
			depth: 0.055,
			bevelEnabled: true,
			bevelSize: 0.003,
			bevelThickness: 0.003,
			bevelSegments: 2,
			curveSegments: 28
		});
		deckGeometry.rotateX(-Math.PI / 2);
		this.mesh(deckGeometry, 'aluminium', head, new THREE.Vector3(0, HEAD + 0.005, 0)).name =
			'Deck with valve and injector apertures';
		for (const xx of [-0.102, 0.102])
			this.ring(0.079, 0.008, 'iron', head, new THREE.Vector3(xx, HEAD + 0.003, 0));
		for (const xx of [-0.21, 0.21])
			for (const zz of [-0.28, -0.09]) this.bolt(head, xx, HEAD + 0.208, zz, 'y', 0.024);
		this.component(
			`mech:head:${number}`,
			`Cut cylinder head · ${number}`,
			'heads',
			head,
			new THREE.Vector3(0, 0.65, 0),
			{ sectionOnly: true }
		);
		const piston = new THREE.Group();
		bank.add(piston);
		const profile = [
			new THREE.Vector2(0.18, -0.15),
			new THREE.Vector2(0.236, -0.15),
			new THREE.Vector2(0.249, -0.12),
			new THREE.Vector2(0.249, 0.075),
			new THREE.Vector2(0.24, 0.087),
			new THREE.Vector2(0.24, 0.097),
			new THREE.Vector2(0.25, 0.108),
			new THREE.Vector2(0.25, 0.125),
			new THREE.Vector2(0.24, 0.135),
			new THREE.Vector2(0.24, 0.145),
			new THREE.Vector2(0.25, 0.155),
			new THREE.Vector2(0.25, 0.18),
			new THREE.Vector2(0.239, 0.198),
			new THREE.Vector2(0.11, 0.198),
			new THREE.Vector2(0.092, 0.166),
			new THREE.Vector2(0.05, 0.148),
			new THREE.Vector2(0, 0.148),
			// Closed crown/inner skirt: the underside stays a real open cavity, not a solid filled piston.
			new THREE.Vector2(0, 0.085),
			new THREE.Vector2(0.18, 0.085),
			new THREE.Vector2(0.18, -0.15)
		];
		this.mesh(planarLatheGeometry(profile, 56), 'aluminium', piston).name =
			'Crown and hollow skirt';
		for (const y of [0.092, 0.14])
			this.ring(0.247, 0.0075, 'steel', piston, new THREE.Vector3(0, y, 0));
		// The wrist pin stays inside the underside cavity, supported by annular bosses with real bores.
		const pin = this.cylinder(0.036, 0.348, 'steel', piston, new THREE.Vector3());
		pin.rotation.z = Math.PI / 2;
		pin.name = 'Wrist pin';
		for (const side of [-1, 1])
			this.sleeve(0.0365, 0.064, 0.098, 'aluminium', piston, new THREE.Vector3(side * 0.131, 0, 0));
		this.component(
			`mech:piston:${number}`,
			`Piston & rings · cylinder ${number}`,
			'block',
			piston,
			new THREE.Vector3(0, 0.8, 0.2),
			{ dynamic: true }
		);
		const rod = new THREE.Group();
		bank.add(rod);
		const shape = new THREE.Shape();
		// Common external tangents join two circular housings; bearing holes stay strictly inside them.
		const bigRadius = 0.133,
			smallRadius = 0.075;
		const tangentAngle = Math.asin((bigRadius - smallRadius) / L);
		shape.moveTo(bigRadius * Math.cos(tangentAngle), -L / 2 + bigRadius * Math.sin(tangentAngle));
		shape.lineTo(
			smallRadius * Math.cos(tangentAngle),
			L / 2 + smallRadius * Math.sin(tangentAngle)
		);
		shape.absarc(0, L / 2, smallRadius, tangentAngle, Math.PI - tangentAngle, false);
		shape.lineTo(-bigRadius * Math.cos(tangentAngle), -L / 2 + bigRadius * Math.sin(tangentAngle));
		shape.absarc(0, -L / 2, bigRadius, Math.PI - tangentAngle, Math.PI * 2 + tangentAngle, false);
		shape.closePath();
		for (const [yy, rr] of [
			[-L / 2, 0.09],
			[L / 2, 0.049]
		]) {
			const hole = new THREE.Path();
			hole.absarc(0, yy, rr, 0, Math.PI * 2, true);
			shape.holes.push(hole);
		}
		const rodGeometry = new THREE.ExtrudeGeometry(shape, {
			depth: 0.08,
			bevelEnabled: false,
			bevelThickness: 0.009,
			bevelSize: 0.009,
			bevelSegments: 2,
			steps: 1,
			curveSegments: 24
		});
		rodGeometry.translate(0, 0, -0.04);
		rodGeometry.rotateY(Math.PI / 2);
		this.mesh(rodGeometry, 'steel', rod).name = 'Rod housing';
		for (const [yy, inner, outer] of [
			[-L / 2, 0.0715, 0.089],
			[L / 2, 0.0365, 0.048]
		])
			this.sleeve(inner, outer, 0.092, 'bronze', rod, new THREE.Vector3(0, yy, 0)).name =
				yy < 0 ? 'Big-end bearing' : 'Small-end bearing';
		this.box(0.091, L * 0.67, 0.025, 'iron', rod, new THREE.Vector3(0, 0, 0));
		for (const z of [-0.075, 0.075]) {
			const capBolt = this.cylinder(
				0.014,
				0.006,
				'fastener',
				rod,
				new THREE.Vector3(index % 2 ? 0.043 : -0.043, -L / 2 - 0.065, z),
				6
			);
			capBolt.rotation.z = Math.PI / 2;
		}
		this.component(
			`mech:rod:${number}`,
			`Connecting rod · cylinder ${number}`,
			'block',
			rod,
			new THREE.Vector3(0, 0, 0.65),
			{ dynamic: true }
		);
		const intake = this.buildValve(
			bank,
			`mech:intake-valve:${number}`,
			`Intake valve · ${number}`,
			-0.102,
			-0.006
		);
		const exhaust = this.buildValve(
			bank,
			`mech:exhaust-valve:${number}`,
			`Exhaust valve · ${number}`,
			0.102,
			-0.006
		);
		const injector = new THREE.Group();
		injector.position.set(0, 0, 0.082);
		bank.add(injector);
		this.cylinder(0.029, 0.44, 'steel', injector, new THREE.Vector3(0, HEAD + 0.22, 0));
		this.cylinder(0.054, 0.1, 'bronze', injector, new THREE.Vector3(0, HEAD + 0.38, 0), 6);
		this.cylinder(0.013, 0.04, 'steel', injector, new THREE.Vector3(0, NOZZLE_TIP + 0.02, 0));
		this.cylinder(0.045, 0.1, 'iron', injector, new THREE.Vector3(0, HEAD + 0.51, 0), 6);
		this.component(
			`mech:injector:${number}`,
			`Unit injector · cylinder ${number}`,
			'fuel',
			injector,
			new THREE.Vector3(0, 0.8, 0.18)
		);
		const glowMaterial = new THREE.MeshBasicMaterial({
			color: 0x71bedf,
			transparent: true,
			opacity: 0,
			depthWrite: false,
			side: THREE.DoubleSide,
			toneMapped: false
		});
		this.disposalMaterials.add(glowMaterial);
		const glowGeometry = new THREE.CylinderGeometry(0.239, 0.239, 1, 32);
		this.disposalGeometries.add(glowGeometry);
		const glow = new THREE.Mesh(glowGeometry, glowMaterial);
		bank.add(glow);
		const sprayMaterial = new THREE.MeshBasicMaterial({
			color: 0xf4ca76,
			transparent: true,
			opacity: 0,
			depthWrite: false,
			blending: THREE.AdditiveBlending
		});
		this.disposalMaterials.add(sprayMaterial);
		const sprayGeometry = new THREE.ConeGeometry(1, 1, 24, 1, true);
		this.disposalGeometries.add(sprayGeometry);
		const spray = new THREE.Mesh(sprayGeometry, sprayMaterial);
		spray.position.set(0, NOZZLE_TIP, 0.082);
		glow.name = `Trapped charge · cylinder ${number}`;
		spray.name = `Fuel spray · cylinder ${number}`;
		sprayMaterial.side = THREE.DoubleSide;
		sprayMaterial.toneMapped = false;
		bank.add(spray);
		this.cylinders.push({
			index,
			restX: x,
			bank,
			piston,
			rod,
			intake,
			exhaust,
			injector,
			glow,
			spray
		});
	}

	private buildValve(
		bank: THREE.Group,
		id: string,
		name: string,
		x: number,
		z: number
	): THREE.Group {
		const group = new THREE.Group();
		group.position.set(x, 0, z);
		bank.add(group);
		this.cylinder(0.011, 0.5, 'steel', group, new THREE.Vector3(0, HEAD + 0.24, 0));
		this.cylinder(0.077, 0.023, 'steel', group, new THREE.Vector3(0, HEAD - 0.023, 0));
		const path = new THREE.CatmullRomCurve3(
			Array.from({ length: 100 }, (_, i) => {
				const t = i / 99;
				return new THREE.Vector3(
					Math.cos(t * Math.PI * 16) * 0.043,
					HEAD + 0.23 + t * 0.19,
					Math.sin(t * Math.PI * 16) * 0.043
				);
			})
		);
		this.mesh(
			this.closeSweepEnds(new THREE.TubeGeometry(path, 100, 0.006, 6, false), [
				{
					indices: Array.from({ length: 7 }, (_, j) => j),
					center: path.getPointAt(0),
					normal: path.getTangentAt(0).negate()
				},
				{
					indices: Array.from({ length: 7 }, (_, j) => 100 * 7 + j),
					center: path.getPointAt(1),
					normal: path.getTangentAt(1)
				}
			]),
			'iron',
			group
		);
		this.cylinder(0.052, 0.018, 'steel', group, new THREE.Vector3(0, HEAD + 0.435, 0));
		this.box(0.085, 0.035, 0.23, 'steel', group, new THREE.Vector3(0, HEAD + 0.468, -0.052));
		this.bolt(group, 0, HEAD + 0.49, -0.11, 'y', 0.02);
		return this.component(id, name, 'heads', group, new THREE.Vector3(0, 0.7, 0), {
			dynamic: true
		});
	}

	private buildCams() {
		for (const bankAngle of [-30, 30]) {
			const parent = new THREE.Group();
			parent.rotation.x = THREE.MathUtils.degToRad(bankAngle);
			this.group.add(parent);
			const cam = new THREE.Group();
			cam.position.set(0, HEAD + 0.45, -0.18);
			parent.add(cam);
			const shaft = this.cylinder(0.035, 3.52, 'steel', cam, new THREE.Vector3());
			shaft.rotation.z = Math.PI / 2;
			for (let row = 0; row < 6; row++)
				for (const offset of [-0.102, 0.102]) {
					const lobe = this.cylinder(
						0.063,
						0.055,
						'iron',
						cam,
						new THREE.Vector3((row - 2.5) * PITCH + offset, 0.014, 0)
					);
					lobe.rotation.z = Math.PI / 2;
					lobe.scale.z = 0.75;
				}
			const gear = this.cylinder(0.15, 0.05, 'steel', cam, new THREE.Vector3(1.83, 0, 0));
			gear.rotation.z = Math.PI / 2;
			this.ring(0.146, 0.013, 'iron', cam, new THREE.Vector3(1.86, 0, 0), 'x');
			this.component(
				`mech:camshaft:${bankAngle < 0 ? 'A' : 'B'}`,
				`Camshaft · bank ${bankAngle < 0 ? 'A' : 'B'}`,
				'heads',
				cam,
				new THREE.Vector3(0, 0.8, 0),
				{ dynamic: true }
			);
			this.cams.push(cam);
		}
	}

	private buildFlows() {
		for (const id of ['air', 'exhaust', 'fuel', 'coolant', 'oil'] as FlowId[]) {
			const color = new THREE.Color(FLOW_COLORS[id]);
			const group = new THREE.Group();
			group.name = `Schematic ${id} routing`;
			this.group.add(group);
			const routes: Route[] = [];
			const tubes: THREE.BufferGeometry[] = [];
			const add = (points: THREE.Vector3[], speed = 0.22, index?: number) => {
				const curve = new THREE.CatmullRomCurve3(points);
				routes.push({
					samples: curve.getSpacedPoints(80),
					speed,
					offset: routes.length * 0.173,
					index
				});
				tubes.push(new THREE.TubeGeometry(curve, 48, 0.008, 6, false));
			};
			for (const cylinder of this.cylinders) {
				const bank = cylinder.bank;
				const world = (p: THREE.Vector3) =>
					p.applyAxisAngle(new THREE.Vector3(1, 0, 0), bank.rotation.x).add(bank.position);
				if (id === 'air')
					add(
						[
							new THREE.Vector3(-2.25, 2.0, 1.12),
							new THREE.Vector3(bank.position.x, 1.95, 1.03),
							world(new THREE.Vector3(-0.16, HEAD + 0.03, 0.24)),
							world(new THREE.Vector3(-0.1, HEAD - 0.03, 0)),
							world(new THREE.Vector3(0, HEAD - 0.025, 0))
						],
						0.25,
						cylinder.index
					);
				if (id === 'exhaust')
					add(
						[
							world(new THREE.Vector3(0, HEAD - 0.025, 0)),
							world(new THREE.Vector3(0.1, HEAD - 0.03, 0)),
							world(new THREE.Vector3(0.17, HEAD + 0.04, -0.32)),
							new THREE.Vector3(bank.position.x, 1.12, -1.02),
							new THREE.Vector3(2.28, 0.96, -1.08)
						],
						0.3,
						cylinder.index
					);
				if (id === 'fuel')
					add(
						[
							new THREE.Vector3(-2.05, 1.93, 0.48),
							new THREE.Vector3(bank.position.x, 1.88, 0.54),
							world(new THREE.Vector3(0, HEAD + 0.54, 0.082)),
							world(new THREE.Vector3(0, NOZZLE_TIP, 0.082))
						],
						0.4,
						cylinder.index
					);
				if (id === 'oil')
					add(
						[
							new THREE.Vector3(-1.96, -0.52, 0.34),
							new THREE.Vector3(bank.position.x, -0.22, 0.28),
							world(new THREE.Vector3(0, 0.54, 0)),
							world(new THREE.Vector3(0, HEAD + 0.4, -0.18))
						],
						0.13,
						cylinder.index
					);
			}
			if (id === 'coolant')
				for (const side of [-1, 1])
					add(
						[
							new THREE.Vector3(2.28, -0.2, side * 0.85),
							new THREE.Vector3(1.92, 0.8, side * 0.91),
							new THREE.Vector3(1.45, 1.42, side * 0.76),
							new THREE.Vector3(-1.45, 1.42, side * 0.76),
							new THREE.Vector3(-1.94, 0.7, side * 0.76),
							new THREE.Vector3(-1.9, -0.24, side * 0.85),
							new THREE.Vector3(2.28, -0.2, side * 0.85)
						],
						0.18
					);
			if (id === 'oil')
				add(
					[
						new THREE.Vector3(1.9, -0.55, -0.32),
						new THREE.Vector3(1.9, -0.7, 0.35),
						new THREE.Vector3(-1.96, -0.7, 0.35),
						new THREE.Vector3(-1.96, -0.52, 0.34)
					],
					0.13
				);
			const merged = mergeGeometries(tubes, false);
			tubes.forEach((g) => g.dispose());
			if (merged) {
				const mat = new THREE.MeshBasicMaterial({
					color,
					transparent: true,
					opacity: 0.22,
					depthWrite: false
				});
				this.disposalGeometries.add(merged);
				this.disposalMaterials.add(mat);
				group.add(new THREE.Mesh(merged, mat));
			}
			const arrowGeometry = new THREE.ConeGeometry(0.016, 0.065, 8);
			arrowGeometry.translate(0, 0.025, 0);
			this.disposalGeometries.add(arrowGeometry);
			const arrowMaterial = new THREE.MeshBasicMaterial({
				color: color.clone().multiplyScalar(1.4),
				toneMapped: false
			});
			this.disposalMaterials.add(arrowMaterial);
			const arrows = new THREE.InstancedMesh(arrowGeometry, arrowMaterial, routes.length * 4);
			arrows.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
			arrows.frustumCulled = false;
			group.add(arrows);
			this.flows.set(id, { group, arrows, routes, count: routes.length * 4 });
		}
	}

	/** Canonical standalone phase-zero component boxes; obtaining them does not alter the live pose. */
	getLayoutInputs(): LayoutInput[] {
		if (!this.layoutInputs) {
			const kinematics = cylinderPhases(0).map((cylinder) => calculateMechanism(cylinder.phaseDeg));
			const origin = new THREE.Matrix4().makeTranslation(
				STANDALONE_POSITION.x,
				STANDALONE_POSITION.y,
				STANDALONE_POSITION.z
			);
			this.layoutInputs = this.components.map((component) => {
				const position = component.rest.clone(),
					quaternion = component.restQuaternion.clone();
				const numbered = component.id.match(/:(\d{2})$/);
				if (numbered) {
					const k = kinematics[Number(numbered[1]) - 1];
					if (component.id.startsWith('mech:piston:')) position.y = k.pistonPinYmm * MM;
					else if (component.id.startsWith('mech:rod:')) {
						const top = new THREE.Vector3(0, k.pistonPinYmm * MM, 0);
						const bottom = new THREE.Vector3(0, k.crankPinYmm * MM, k.crankPinXmm * MM);
						position.copy(top).add(bottom).multiplyScalar(0.5);
						quaternion.setFromUnitVectors(Y, top.clone().sub(bottom).normalize());
					} else if (component.id.startsWith('mech:intake-valve:'))
						position.y = -k.intakeLift * 0.028;
					else if (component.id.startsWith('mech:exhaust-valve:'))
						position.y = -k.exhaustLift * 0.028;
				}
				const matrix = origin
					.clone()
					.multiply(component.parentRestMatrix)
					.multiply(new THREE.Matrix4().compose(position, quaternion, UNIT_SCALE));
				const bounds = new THREE.Box3();
				for (const mesh of component.group.children as THREE.Mesh[])
					bounds.union(mesh.geometry.boundingBox!.clone().applyMatrix4(matrix));
				return { id: component.id, parent: component.parent, kind: 'educational' as const, bounds };
			});
		}
		return this.layoutInputs.map((item) => ({ ...item, bounds: item.bounds.clone() }));
	}

	/** Static presentation: burst from the displayed pose, then arrange canonical parts in shared cells. */
	setLayoutPresentation(layout: PartsLayout | null, blend: number, burst = 0) {
		if (!Number.isFinite(blend) || !Number.isFinite(burst))
			throw new RangeError('Layout blend and burst must be finite');
		if (layout && !this.layoutPresentation) {
			this.layoutEntryPose = {
				position: this.group.position.clone(),
				scale: this.group.scale.clone(),
				bankX: this.cylinders.map((cylinder) => cylinder.bank.position.x),
				components: new Map(
					this.components.map((component) => [
						component.id,
						{
							position: component.group.position.clone(),
							quaternion: component.group.quaternion.clone(),
							scale: component.group.scale.clone()
						}
					])
				)
			};
		}
		if (!layout) this.layoutEntryPose = null;
		this.layoutPresentation = layout;
		this.layoutBlend = layout ? THREE.MathUtils.clamp(blend, 0, 1) : 0;
		this.layoutBurst = layout ? THREE.MathUtils.clamp(burst, 0, 1) : 0;
	}

	private applyLayoutPresentation() {
		if (!this.layoutPresentation) return;
		// During the initial burst, preserve continuity from the actual phase and embedding.
		// Arrangement starts only after canonicalization; this is a static exploded-parts transition.
		const progress = this.layoutBlend > 0 ? 1 : this.layoutBurst;
		const entry = this.layoutEntryPose;
		if (entry && progress < 1) {
			this.group.position.lerpVectors(entry.position, STANDALONE_POSITION, progress);
			this.group.scale.lerpVectors(entry.scale, UNIT_SCALE, progress);
			for (const cylinder of this.cylinders)
				cylinder.bank.position.x = THREE.MathUtils.lerp(
					entry.bankX[cylinder.index],
					cylinder.restX,
					progress
				);
			for (const component of this.components) {
				const pose = entry.components.get(component.id);
				if (!pose) continue;
				component.group.position.lerpVectors(pose.position, component.group.position, progress);
				component.group.quaternion.slerpQuaternions(
					pose.quaternion,
					component.group.quaternion.clone(),
					progress
				);
				component.group.scale.lerpVectors(pose.scale, component.group.scale, progress);
			}
		}
		this.group.updateMatrixWorld(true);
		for (const component of this.components) {
			const placement = this.layoutPresentation.placements.get(component.id);
			if (!placement || !component.group.parent) continue;
			const center = placement.center.clone().lerp(placement.position, this.layoutBlend);
			const scale = THREE.MathUtils.lerp(1, placement.scale, this.layoutBlend);
			const world = new THREE.Matrix4()
				.makeTranslation(center.x, center.y, center.z)
				.multiply(new THREE.Matrix4().makeScale(scale, scale, scale))
				.multiply(
					new THREE.Matrix4().makeTranslation(
						-placement.center.x,
						-placement.center.y,
						-placement.center.z
					)
				)
				.multiply(component.group.matrixWorld);
			// Same affine as the source shader: canonical rigid part + burst offset at blend zero;
			// the offset decays by (1-blend), leaving the exact normalized cell at blend one.
			const offset = this.explosionOffset(component)
				.multiplyScalar(EXPLOSION_MULTIPLIER * this.layoutBurst * (1 - this.layoutBlend))
				.applyMatrix3(new THREE.Matrix3().setFromMatrix4(component.group.parent.matrixWorld));
			world.elements[12] += offset.x;
			world.elements[13] += offset.y;
			world.elements[14] += offset.z;
			new THREE.Matrix4()
				.copy(component.group.parent.matrixWorld)
				.invert()
				.multiply(world)
				.decompose(component.group.position, component.group.quaternion, component.group.scale);
		}
	}

	update(
		phase: number,
		state: LabState,
		explosion: number,
		time: number,
		delta = 0,
		exteriorPlanes: THREE.Plane[] = []
	) {
		this.transitioning = false;
		const atlas = state.display === 'layout' || (!!this.layoutPresentation && this.layoutBlend > 0);
		if (atlas) {
			phase = 0;
			if (state.display !== 'layout') state = { ...state, display: 'layout' };
		}
		const embedded = state.display === 'assembly' || state.display === 'section';
		this.group.visible = !(embedded || atlas) || state.internals;
		if (!this.group.visible) return;
		this.display = state.display;
		this.currentExplosion = explosion;
		this.targetExplosion = state.explosion;
		this.embeddedPresentation = embedded;
		this.fuelInspection =
			state.flows.includes('fuel') && state.display === 'cylinder' && explosion <= 0.02;
		this.group.scale.copy(embedded ? this.embeddedScale : UNIT_SCALE);
		this.group.position.copy(embedded ? this.embeddedPosition : STANDALONE_POSITION);
		// Shift the layout along the crank axis while keeping nominal circular bores uniformly scaled.
		// Axial shaft stretching changes lengths only: circular journal sections are in the YZ plane.
		const axialSpacing = embedded ? this.embeddedAxialSpacing : 1;
		for (const cylinder of this.cylinders) cylinder.bank.position.x = cylinder.restX * axialSpacing;
		for (const component of this.components) {
			component.group.quaternion.copy(component.restQuaternion);
			const shaftScale =
				component.id === 'mech:crankshaft' ||
				component.id === 'mech:block' ||
				component.id.startsWith('mech:camshaft:')
					? axialSpacing
					: 1;
			component.group.scale.set(shaftScale, 1, 1);
		}
		for (const flow of this.flows.values()) flow.group.scale.x = axialSpacing;
		const requested = (state.focused ?? state.selected ?? '').match(/^mech:[\w-]+:(\d{2})$/);
		this.activeCylinder = requested ? Math.max(0, Math.min(11, Number(requested[1]) - 1)) : 0;
		const row = Math.floor(this.activeCylinder / 2),
			center = (row - 2.5) * PITCH,
			min = center - 0.38,
			max = center + 0.38;
		this.sectionPlanes[0].constant = -min;
		this.sectionPlanes[1].constant = max;
		for (const cylinder of this.cylinders)
			cylinder.bank.visible =
				state.display !== 'cylinder' || cylinder.index === this.activeCylinder;
		const signature = [
			state.selected,
			state.focused,
			state.isolated,
			state.display,
			state.internals,
			explosion > 0.05,
			state.hidden.join('|')
		].join(';');
		if (signature !== this.renderState) {
			this.renderState = signature;
			for (const component of this.components) {
				const selected = matchesComponent(component.id, component.parent, state.selected);
				const inspected = state.focused ?? state.selected;
				const explicitlyInspected =
					!!inspected?.startsWith('mech:') &&
					matchesComponent(component.id, component.parent, inspected);
				component.group.visible =
					!(
						embedded &&
						explosion <= 0.05 &&
						(component.id.startsWith('mech:head:') || component.id.startsWith('mech:camshaft:')) &&
						!explicitlyInspected
					) &&
					!(
						embedded &&
						component.id === 'mech:block' &&
						state.selected !== 'mech:block' &&
						state.focused !== 'mech:block'
					) &&
					!(
						component.sectionOnly &&
						state.display === 'mechanism' &&
						!matchesComponent(component.id, component.parent, state.focused ?? state.selected)
					) &&
					(!state.isolated || !state.selected || selected) &&
					!state.hidden.some((id) => matchesComponent(component.id, component.parent, id));
				if (state.display === 'cylinder' && component.id.startsWith('mech:camshaft:'))
					component.group.visible &&= component.id.endsWith(this.activeCylinder % 2 ? 'B' : 'A');
				for (const material of component.materials) {
					material.emissive.set(selected ? 0xdeaa4f : 0x000000);
					material.emissiveIntensity = selected ? 0.2 : 0;
				}
				for (const material of component.materials) {
					material.clippingPlanes =
						state.display === 'cylinder'
							? this.sectionPlanes
							: state.display === 'section'
								? exteriorPlanes
								: [];
					material.clipShadows = true;
					material.needsUpdate = true;
				}
			}
			for (const cylinder of this.cylinders) {
				for (const cue of [cylinder.glow, cylinder.spray]) {
					cue.material.clippingPlanes =
						state.display === 'cylinder'
							? this.sectionPlanes
							: state.display === 'section'
								? exteriorPlanes
								: [];
					cue.material.needsUpdate = true;
				}
			}
			for (const flow of this.flows.values())
				flow.group.traverse((object) => {
					if (object instanceof THREE.Mesh) {
						const material = object.material as THREE.Material;
						material.clippingPlanes =
							state.display === 'cylinder'
								? this.sectionPlanes
								: state.display === 'section'
									? exteriorPlanes
									: [];
						material.needsUpdate = true;
					}
				});
		}
		this.crank.rotation.x = THREE.MathUtils.degToRad(phase);
		for (const cam of this.cams) cam.rotation.x = THREE.MathUtils.degToRad(phase / 2);
		const phases = cylinderPhases(phase),
			kinematics = phases.map((cylinder) => calculateMechanism(cylinder.phaseDeg));
		for (const cylinder of this.cylinders) {
			const k = kinematics[cylinder.index];
			cylinder.piston.position.y = k.pistonPinYmm * MM;
			const top = new THREE.Vector3(0, k.pistonPinYmm * MM, 0);
			const bottom = new THREE.Vector3(0, k.crankPinYmm * MM, k.crankPinXmm * MM);
			cylinder.rod.position.copy(top).add(bottom).multiplyScalar(0.5);
			cylinder.rod.quaternion.setFromUnitVectors(Y, top.clone().sub(bottom).normalize());
			cylinder.intake.position.y = -k.intakeLift * 0.028;
			cylinder.exhaust.position.y = -k.exhaustLift * 0.028;
			const chamber = calculateTeachingChamber(k.phaseDeg);
			cylinder.glow.scale.y = chamber.heightMm * MM;
			cylinder.glow.position.y = ((chamber.bottomMm + chamber.topMm) * MM) / 2;
			cylinder.glow.material.color
				.set(0x71bedf)
				.lerp(WARM_CHARGE, k.compressionIntensity)
				.lerp(BURNING_CHARGE, k.combustionIntensity);
			const chamberComponentVisible =
				!state.isolated ||
				['piston', 'liner', 'head', 'injector'].some((kind) =>
					matchesComponent(
						`mech:${kind}:${String(cylinder.index + 1).padStart(2, '0')}`,
						kind === 'injector' ? 'fuel' : kind === 'head' ? 'heads' : 'block',
						state.selected
					)
				);
			const separated =
				explosion > 0.02 ||
				state.removed.some((id) =>
					['piston', 'liner', 'head', 'injector'].some((kind) =>
						matchesComponent(
							`mech:${kind}:${String(cylinder.index + 1).padStart(2, '0')}`,
							kind === 'injector' ? 'fuel' : kind === 'head' ? 'heads' : 'block',
							id
						)
					)
				);
			cylinder.glow.visible = !atlas && chamberComponentVisible && !separated;
			cylinder.glow.material.opacity =
				0.035 + k.compressionIntensity * 0.075 + k.combustionIntensity * 0.24;
			cylinder.spray.scale.set(
				chamber.sprayRadiusMm * MM,
				chamber.sprayHeightMm * MM,
				chamber.sprayRadiusMm * MM
			);
			cylinder.spray.position.y = (chamber.sprayTopMm - chamber.sprayHeightMm / 2) * MM;
			cylinder.spray.visible =
				!atlas &&
				chamberComponentVisible &&
				!separated &&
				state.flows.includes('fuel') &&
				k.injectionActive;
			cylinder.spray.material.opacity = k.injectionIntensity * 0.7;
		}
		for (const component of this.components) {
			if (!component.dynamic) component.group.position.copy(component.rest);
			else if (
				component.id.startsWith('mech:intake-valve') ||
				component.id.startsWith('mech:exhaust-valve') ||
				component.id.startsWith('mech:piston')
			) {
				component.group.position.x = component.rest.x;
				component.group.position.z = component.rest.z;
			} else if (!component.id.startsWith('mech:rod'))
				component.group.position.copy(component.rest);
			const removed = state.removed.some((id) =>
				matchesComponent(component.id, component.parent, id)
			);
			const target = removed ? 1 : 0;
			component.targetRemoval = target;
			if (!atlas) {
				if (delta > 0)
					component.removal = THREE.MathUtils.damp(component.removal, target, 6.5, delta);
				if (Math.abs(component.removal - target) < 0.0008) component.removal = target;
				else this.transitioning = true;
			}
			const amount = Math.max(component.removal, explosion);
			if (atlas) continue;
			if (embedded)
				component.group.position.addScaledVector(
					this.explosionOffset(component),
					amount * EXPLOSION_MULTIPLIER
				);
			else if (
				(!component.id.startsWith('mech:rod') && !component.id.startsWith('mech:piston')) ||
				removed
			)
				component.group.position.addScaledVector(component.offset, amount * EXPLOSION_MULTIPLIER);
		}
		if (atlas) this.applyLayoutPresentation();
		this.group.updateMatrixWorld(true);
		for (const [id, flow] of this.flows) {
			flow.group.visible = !atlas && state.flows.includes(id) && !state.isolated;
			if (!flow.group.visible) continue;
			let instance = 0;
			for (const route of flow.routes)
				for (let arrow = 0; arrow < 4; arrow++) {
					const t = (time * route.speed + route.offset + arrow / 4) % 1;
					const sample = t * (route.samples.length - 1),
						j = Math.floor(sample),
						next = Math.min(j + 1, route.samples.length - 1);
					this.vector.copy(route.samples[j]).lerp(route.samples[next], sample - j);
					this.tangent
						.copy(route.samples[next])
						.sub(route.samples[Math.max(0, j - 1)])
						.normalize();
					this.dummy.position.copy(this.vector);
					this.dummy.quaternion.setFromUnitVectors(Y, this.tangent);
					this.dummy.scale.setScalar(1);
					if (route.index !== undefined) {
						const k = kinematics[route.index];
						// Faint tubes mark schematic routing; particles cross a valve/nozzle only during its event.
						if (
							(id === 'air' && !k.intakeOpen) ||
							(id === 'exhaust' && !k.exhaustOpen) ||
							(id === 'fuel' && !k.injectionActive)
						)
							this.dummy.scale.setScalar(0);
					}
					this.dummy.updateMatrix();
					flow.arrows.setMatrixAt(instance++, this.dummy.matrix);
				}
			flow.arrows.instanceMatrix.needsUpdate = true;
		}
	}

	private explosionOffset(component: Component): THREE.Vector3 {
		const offset = component.offset.clone(),
			cylinder = component.id.match(/:(\d{2})$/);
		if (cylinder) {
			const index = Number(cylinder[1]) - 1;
			offset.z *= index % 2 ? 1 : -1;
			offset.x += (Math.floor(index / 2) - 2.5) * 0.1;
		}
		if (component.id === 'mech:crankshaft') offset.set(0, -0.28, 0);
		return offset;
	}

	bounds(selected: string | null = null, isolated = false, includeTarget = false): THREE.Box3 {
		const bounds = new THREE.Box3();
		this.group.updateMatrixWorld(true);
		for (const component of this.components) {
			let visible = component.group.visible;
			let parent: THREE.Object3D | null = component.group.parent;
			while (parent) {
				if (!parent.visible) visible = false;
				parent = parent.parent;
			}
			const focal =
				this.display !== 'cylinder' ||
				component.id.endsWith(`:${String(this.activeCylinder + 1).padStart(2, '0')}`);
			if (
				visible &&
				focal &&
				(!isolated || !selected || matchesComponent(component.id, component.parent, selected))
			) {
				const box = new THREE.Box3().expandByObject(component.group);
				if (includeTarget && this.display !== 'layout' && component.group.parent) {
					const offset = this.embeddedPresentation
						? this.explosionOffset(component)
						: component.offset.clone();
					const articulated =
						component.id.startsWith('mech:rod') || component.id.startsWith('mech:piston');
					const current =
						this.embeddedPresentation || !articulated || (component.targetRemoval ?? 0) > 0
							? Math.max(component.removal, this.currentExplosion)
							: 0;
					const future =
						this.embeddedPresentation || !articulated || (component.targetRemoval ?? 0) > 0
							? Math.max(component.targetRemoval ?? 0, this.targetExplosion)
							: 0;
					const worldOffset = offset
						.multiplyScalar((future - current) * EXPLOSION_MULTIPLIER)
						.applyMatrix3(new THREE.Matrix3().setFromMatrix4(component.group.parent.matrixWorld));
					box.union(box.clone().translate(worldOffset));
				}
				bounds.union(box);
			}
		}
		if (
			this.display === 'cylinder' &&
			(!isolated ||
				!selected ||
				selected === 'mech:crankshaft' ||
				selected === 'mech:block' ||
				selected === 'block')
		) {
			const x = (Math.floor(this.activeCylinder / 2) - 2.5) * PITCH;
			bounds.union(
				new THREE.Box3(
					new THREE.Vector3(x - 0.38, -1.14, -0.75),
					new THREE.Vector3(x + 0.38, 0.48, 0.75)
				).translate(this.group.position)
			);
		}
		// An exact injector focus includes the real chamber/crown context instead of cropping at its nozzle.
		// This changes camera framing only; it does not enlarge the near-TDC spray or gas geometry.
		const injector = selected?.match(/^mech:injector:(\d{2})$/);
		if (this.fuelInspection && injector) {
			const cylinder = this.cylinders[Number(injector[1]) - 1];
			if (cylinder?.bank.visible) {
				bounds.union(
					new THREE.Box3(
						new THREE.Vector3(
							-BORE / 2 - 0.03,
							cylinder.piston.position.y + 0.148,
							-BORE / 2 - 0.03
						),
						new THREE.Vector3(BORE / 2 + 0.03, HEAD + 0.18, BORE / 2 + 0.03)
					).applyMatrix4(cylinder.bank.matrixWorld)
				);
			}
		}
		return bounds;
	}
	visiblePickables() {
		return this.pickables.filter((mesh) => {
			let p: THREE.Object3D | null = mesh;
			while (p) {
				if (!p.visible) return false;
				p = p.parent;
			}
			return true;
		});
	}
	dispose() {
		this.disposalGeometries.forEach((g) => g.dispose());
		this.disposalMaterials.forEach((m) => m.dispose());
		this.group.clear();
	}
}

/** Keep manufactured flat lathe faces axial instead of smoothing the coincident pole into a fan.
 * Only normals change: the nonindexed triangle order is the same one component batching uses.
 */
function planarLatheGeometry(profile: THREE.Vector2[], segments: number): THREE.BufferGeometry {
	const indexed = new THREE.LatheGeometry(profile, segments);
	const geometry = indexed.toNonIndexed();
	indexed.dispose();
	const position = geometry.getAttribute('position'),
		normal = geometry.getAttribute('normal');
	for (let i = 0; i < position.count; i += 3) {
		const aY = position.getY(i),
			bY = position.getY(i + 1),
			cY = position.getY(i + 2);
		if (Math.max(aY, bY, cY) - Math.min(aY, bY, cY) > 1e-7) continue;
		const abX = position.getX(i + 1) - position.getX(i),
			abZ = position.getZ(i + 1) - position.getZ(i);
		const acX = position.getX(i + 2) - position.getX(i),
			acZ = position.getZ(i + 2) - position.getZ(i);
		const crossY = abZ * acX - abX * acZ;
		if (Math.abs(crossY) < 1e-14) continue;
		for (let j = 0; j < 3; j++) normal.setXYZ(i + j, 0, Math.sign(crossY), 0);
	}
	return geometry;
}

const UNIT_SCALE = new THREE.Vector3(1, 1, 1);
const STANDALONE_POSITION = new THREE.Vector3(0, -0.72, 0);

const WARM_CHARGE = new THREE.Color(0xe9bf78);
const BURNING_CHARGE = new THREE.Color(0xe58a4b);
