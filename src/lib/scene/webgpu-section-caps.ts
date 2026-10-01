import * as THREE from 'three';
import { ClippingGroup } from 'three/webgpu';
import { sectionSolidContainsPoint } from './section-plane';
const EPSILON = 1e-5;
type MovingCapEntry = {
	id: string;
	meshes: THREE.Mesh[];
	group: THREE.Group;
	masks: { source: THREE.Mesh; back: THREE.Mesh; front: THREE.Mesh }[];
	face: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>;
	backMaterial: THREE.MeshBasicMaterial;
	frontMaterial: THREE.MeshBasicMaterial;
	maskClip: ClippingGroup;
	faceClip: ClippingGroup;
};
/** Moving closed source solids are capped by their actual triangle winding on the GPU.
 * No convex hull, filled bounding box, or per-frame CPU triangulation is involved. Every component
 * gets an isolated stencil interval; all its finishes contribute to the union and genuine bores
 * subtract. The same stencil interval runs in the beauty and process-occlusion depth passes.
 */
export class WebGPUSectionCaps {
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
		this.group.name = 'Closed source-component section faces';
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
		const maskClip = new ClippingGroup();
		maskClip.renderOrder = group.renderOrder;
		group.add(maskClip);
		const masks = meshes.map((source) => {
			const back = new THREE.Mesh(source.geometry, backMaterial);
			const front = new THREE.Mesh(source.geometry, frontMaterial);
			for (const mesh of [back, front]) {
				mesh.matrixAutoUpdate = false;
				mesh.frustumCulled = false;
			}
			back.renderOrder = 0;
			front.renderOrder = 1;
			maskClip.add(back, front);
			return { source, back, front };
		});
		const finish = id.startsWith('mech:piston')
			? 'aluminium'
			: id.startsWith('mech:liner') || id === 'mech:block'
				? 'iron'
				: 'steel';
		const material = new THREE.MeshStandardMaterial();
		// A cut is a freshly machined face; anisotropy needs UVs and this quad has them.
		material.color.set(finish === 'aluminium' ? 0xb7c2cc : finish === 'iron' ? 0x8b99a2 : 0x9facb7);
		material.roughness = 0.55;
		material.metalness = 0.4;
		material.side = THREE.DoubleSide;
		material.stencilWrite = true;
		material.stencilRef = 0;
		material.stencilFunc = THREE.NotEqualStencilFunc;
		material.stencilFail = THREE.ZeroStencilOp;
		material.stencilZFail = THREE.ZeroStencilOp;
		material.stencilZPass = THREE.ZeroStencilOp;
		material.allowOverride = false;
		const face = new THREE.Mesh(this.faceGeometry, material);
		face.userData.componentId = id;
		face.renderOrder = 2;
		face.frustumCulled = false;
		face.receiveShadow = true;
		const planeRaycast = face.raycast.bind(face);
		face.raycast = (raycaster, intersections) => {
			const hits: THREE.Intersection[] = [];
			planeRaycast(raycaster, hits);
			for (const hit of hits)
				if (sectionSolidContainsPoint(meshes, hit.point)) intersections.push(hit);
		};
		const faceClip = new ClippingGroup();
		faceClip.renderOrder = group.renderOrder;
		faceClip.add(face);
		group.add(faceClip);
		this.group.add(group);
		return { id, meshes, group, masks, face, backMaterial, frontMaterial, maskClip, faceClip };
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
				entry.maskClip.clippingPlanes = [plane];
				entry.faceClip.clippingPlanes = planes.filter((_p, index) => index !== planeIndex);
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
