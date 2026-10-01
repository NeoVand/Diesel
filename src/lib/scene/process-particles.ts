import * as THREE from 'three';
import { PointsNodeMaterial } from 'three/webgpu';
import { instancedDynamicBufferAttribute, texture, vec4 } from 'three/tsl';

/** Sized point clouds need instanced billboards on WebGPU, whose point primitive is only 1 px. */
export class ProcessParticles extends THREE.Sprite {
	declare material: PointsNodeMaterial & THREE.SpriteMaterial;
	constructor(
		readonly sourceGeometry: THREE.BufferGeometry,
		material: PointsNodeMaterial
	) {
		// Sprite + PointsNodeMaterial is the documented Three WebGPU sized-particle path.
		super(material as unknown as THREE.SpriteMaterial);
		this.geometry = this.geometry.clone();
		// Three 0.186's node helper alone does not set the underlying vec3/vec4
		// buffer's instance step mode. Ordinary BufferAttributes make four successive
		// parcel positions become a quad's corners, stretching triangles between them.
		// Keep the same arrays and make sourceGeometry own the attributes that callers
		// mark dirty, so both rendering and pause/seek uploads use one version counter.
		const instanced = (name: string) => {
			const source = sourceGeometry.getAttribute(name) as THREE.BufferAttribute;
			const attribute = new THREE.InstancedBufferAttribute(
				source.array,
				source.itemSize,
				source.normalized
			).setUsage(THREE.DynamicDrawUsage);
			sourceGeometry.setAttribute(name, attribute);
			return attribute;
		};
		const position = instanced('position');
		const color = instanced('color');
		material.positionNode = instancedDynamicBufferAttribute<'vec3'>(position, 'vec3');
		const tint =
			color.itemSize === 4
				? instancedDynamicBufferAttribute<'vec4'>(color, 'vec4')
				: vec4(instancedDynamicBufferAttribute<'vec3'>(color, 'vec3'), 1);
		// colorNode replaces the built-in diffuse-map path; sample the Gaussian
		// explicitly so soft parcels do not become opaque square billboards.
		material.colorNode = material.map ? tint.mul(texture(material.map)) : tint;
		material.vertexColors = false;
		// Explicit ownership lets geometry disposal release the instanced GPU buffers too.
		this.geometry.setAttribute('parcelPosition', position);
		this.geometry.setAttribute('parcelColor', color);
		this.frustumCulled = false;
		this.count = 0;
	}
	setCount(count: number) {
		this.count = count;
		this.sourceGeometry.setDrawRange(0, count);
	}
	dispose() {
		this.geometry.dispose();
	}
}
