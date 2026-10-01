import * as THREE from 'three';
import { restoreV12MaterialDetail } from './v12-materials';

/** Share identical fully opaque finishes; every fading or highlighted occurrence keeps its own material. */
export class V12MaterialPool {
	private readonly byDescription = new Map<string, THREE.Material>();
	private readonly owned = new Set<THREE.Material>();
	private readonly sourceToShared = new Map<THREE.Material, THREE.Material>();
	get(source: THREE.Material): THREE.Material {
		const known = this.sourceToShared.get(source);
		if (known) return known;
		const description = source.toJSON();
		// Identity and descriptive labels do not affect shading. The authored grain shader does.
		const {
			uuid: _uuid,
			name: _name,
			metadata: _metadata,
			userData: _userData,
			...renderState
		} = description;
		void _uuid;
		void _name;
		void _metadata;
		void _userData;
		const key = JSON.stringify([
			renderState,
			source.userData.displayRoughnessGrain ?? 0,
			source.userData.pistonSkirtFiltering === true
		]);
		let shared = this.byDescription.get(key);
		if (!shared) {
			shared = source.clone();
			restoreV12MaterialDetail(shared);
			this.byDescription.set(key, shared);
			this.owned.add(shared);
		}
		this.sourceToShared.set(source, shared);
		return shared;
	}
	materials(source: THREE.Material | THREE.Material[]) {
		return Array.isArray(source) ? source.map((m) => this.get(m)) : this.get(source);
	}
	get size() {
		return this.owned.size;
	}
	owns(material: THREE.Material) {
		return this.owned.has(material);
	}
	dispose() {
		for (const material of this.owned) material.dispose();
		this.owned.clear();
		this.byDescription.clear();
		this.sourceToShared.clear();
	}
}

/** Switch only an unhighlighted base/pooled pair; clipping survives a mid-section fade. */
export function applyPooledFinish(
	mesh: THREE.Mesh,
	base: THREE.Material | THREE.Material[],
	shared: THREE.Material | THREE.Material[],
	opacity: number
) {
	if (mesh.material !== base && mesh.material !== shared) return;
	const target = opacity === 1 ? shared : base;
	if (mesh.material === target) return;
	const old = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
	const next = Array.isArray(target) ? target : [target];
	for (let i = 0; i < next.length; i++) next[i].clippingPlanes = old[i].clippingPlanes;
	mesh.material = target;
}
