import * as THREE from 'three';

interface RestPose {
	position: THREE.Vector3;
	orientation: THREE.Quaternion;
}

/** Blends a moving occurrence into its corrected assembly pose without changing its scale. */
export class V12RigidPoseBlend {
	private readonly rest = new Map<string, RestPose>();
	private readonly position = new THREE.Vector3();
	private readonly orientation = new THREE.Quaternion();
	private readonly unitScale = new THREE.Vector3(1, 1, 1);

	capture(matrices: ReadonlyMap<string, THREE.Matrix4>): void {
		for (const [id, matrix] of matrices) {
			const position = new THREE.Vector3();
			const orientation = new THREE.Quaternion();
			const scale = new THREE.Vector3();
			matrix.decompose(position, orientation, scale);
			if (scale.distanceTo(this.unitScale) > 1e-6)
				throw new Error(`Mechanical rest pose is not rigid: ${id}`);
			this.rest.set(id, { position, orientation });
		}
	}

	apply(id: string, current: THREE.Matrix4, restAmount: number, out: THREE.Matrix4): void {
		out.copy(current);
		const rest = this.rest.get(id);
		if (!rest || restAmount <= 0) return;
		const amount = Math.min(1, restAmount);
		current.decompose(this.position, this.orientation, this.unitScale);
		this.position.lerp(rest.position, amount);
		this.orientation.slerp(rest.orientation, amount);
		this.unitScale.set(1, 1, 1);
		out.compose(this.position, this.orientation, this.unitScale);
	}
}
