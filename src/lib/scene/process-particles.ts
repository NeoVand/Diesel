import * as THREE from 'three';
import { PointsNodeMaterial } from 'three/webgpu';
import { instancedBufferAttribute } from 'three/tsl';

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
		const position = sourceGeometry.getAttribute('position') as THREE.BufferAttribute;
		const color = sourceGeometry.getAttribute('color') as THREE.BufferAttribute;
		material.positionNode = instancedBufferAttribute<'vec3'>(position, 'vec3');
		material.colorNode =
			color.itemSize === 4
				? instancedBufferAttribute<'vec4'>(color, 'vec4')
				: instancedBufferAttribute<'vec3'>(color, 'vec3');
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
