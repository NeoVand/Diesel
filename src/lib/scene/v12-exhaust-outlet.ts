import * as THREE from 'three';
import { screenCoordinate } from 'three/tsl';
import { ProcessNodeMaterial } from './process-node-material';
import { exhaustVolume } from './process-volume-wgsl';
import datums from '../engine/v12-exhaust-outlet-datums.json';
import { v12NativeToDisplay, v12NativeVectorToDisplay } from '../engine/v12-kinematics';
import { DIRECTED_FLOW_PITCH_MM, DIRECTED_FLOW_SPEED_MM_S } from './directed-flow-volume';

export const V12_EXHAUST_OUTLETS = datums;
export const V12_EXHAUST_PLUME = {
	lengthMm: 150,
	startMm: -4,
	steps: 32,
	// These are optical presentation dimensions, not inferred exhaust mass flow or emissions.
	coreRadiusMm: 16,
	spreadMm: 10,
	speedMmS: DIRECTED_FLOW_SPEED_MM_S,
	pitchMm: DIRECTED_FLOW_PITCH_MM
} as const;

type ExhaustUniforms = {
	uMin: { value: THREE.Vector3 };
	uMax: { value: THREE.Vector3 };
	uCamera: { value: THREE.Vector3 };
	uModel: { value: THREE.Matrix4 };
	uViewProjection: { value: THREE.Matrix4 };
	uDepth: { value: THREE.Texture | null };
	uResolution: { value: THREE.Vector2 };
	uHasDepth: { value: number };
	uHasClip: { value: number };
	uPlane: { value: THREE.Vector4 };
	uTime: { value: number };
	uGain: { value: number };
};

/** Local z is strictly outward. Local x/y span the recovered 60 mm diameter mouth. */
export function v12ExhaustOutletFrame(instance: number): THREE.Matrix4 {
	const outlet = datums.outlets[instance];
	if (!outlet) throw new RangeError('Unknown exhaust outlet');
	const z = new THREE.Vector3(...outlet.axis).normalize();
	const x = new THREE.Vector3(0, 1, 0).cross(z).normalize();
	const y = z.clone().cross(x).normalize();
	return new THREE.Matrix4()
		.makeBasis(
			new THREE.Vector3(...v12NativeVectorToDisplay(x.toArray())),
			new THREE.Vector3(...v12NativeVectorToDisplay(y.toArray())),
			new THREE.Vector3(...v12NativeVectorToDisplay(z.toArray()))
		)
		.setPosition(...v12NativeToDisplay(outlet.centerMm));
}

/** Continuous optical density at measured rims; no particles, smoke/emissions claim, or solved jet. */
export class V12ExhaustOutlet {
	readonly group = new THREE.Group();
	private readonly geometry = new THREE.BoxGeometry(1, 1, 1);
	private readonly meshes: THREE.Mesh<THREE.BoxGeometry, ProcessNodeMaterial<ExhaustUniforms>>[];
	private disposed = false;
	constructor() {
		this.group.name = 'Measured exhaust mouths · bounded illustrative exit volumes';
		this.group.visible = false;
		this.meshes = datums.outlets.map((outlet, index) => {
			const toWorld = v12ExhaustOutletFrame(index);
			const inverse = toWorld.clone().invert();
			const camera = new THREE.Vector3();
			const uniforms: ExhaustUniforms = {
				uMin: { value: new THREE.Vector3(-48, -48, V12_EXHAUST_PLUME.startMm) },
				uMax: { value: new THREE.Vector3(48, 56, V12_EXHAUST_PLUME.lengthMm) },
				uCamera: { value: camera },
				uModel: { value: toWorld },
				uViewProjection: { value: new THREE.Matrix4() },
				uDepth: { value: null },
				uResolution: { value: new THREE.Vector2(1, 1) },
				uHasDepth: { value: 0 },
				uHasClip: { value: 0 },
				uPlane: { value: new THREE.Vector4() },
				uTime: { value: 0 },
				uGain: { value: 0 }
			};
			const material = new ProcessNodeMaterial(uniforms, {
				side: THREE.BackSide,
				transparent: true,
				depthTest: false,
				depthWrite: false,
				premultipliedAlpha: true,
				toneMapped: false
			});
			material.fragmentNode = exhaustVolume({
				...material.processNodes,
				vPoint: material.boundedPosition(),
				pixel: screenCoordinate
			});
			const mesh = new THREE.Mesh(this.geometry, material);
			mesh.name = `Continuous outward exhaust volume · ${outlet.componentId}`;
			mesh.matrixAutoUpdate = false;
			mesh.matrix.copy(toWorld);
			mesh.frustumCulled = false;
			mesh.visible = false;
			mesh.renderOrder = 2;
			mesh.onBeforeRender = (_renderer, _scene, viewCamera) => {
				camera.setFromMatrixPosition(viewCamera.matrixWorld).applyMatrix4(inverse);
				uniforms.uViewProjection.value
					.multiplyMatrices(viewCamera.projectionMatrix, viewCamera.matrixWorldInverse)
					.multiply(toWorld);
			};
			return mesh;
		});
		this.group.add(...this.meshes);
	}
	update(
		timeSeconds: number,
		visible: boolean,
		clipPlane: THREE.Plane | null,
		bankGains: readonly number[]
	) {
		if (this.disposed) return;
		if (!Number.isFinite(timeSeconds)) throw new RangeError('Finite exhaust clock required');
		this.group.visible = visible;
		for (const [index, mesh] of this.meshes.entries()) {
			const uniforms = mesh.material.uniforms;
			const gain = bankGains[index] ?? 0;
			uniforms.uTime.value = timeSeconds;
			uniforms.uGain.value = Number.isFinite(gain) ? Math.sqrt(Math.max(0, Math.min(1, gain))) : 0;
			uniforms.uHasClip.value = clipPlane ? 1 : 0;
			if (clipPlane) uniforms.uPlane.value.set(...clipPlane.normal.toArray(), clipPlane.constant);
			mesh.visible = visible && uniforms.uGain.value > 0;
		}
	}
	get needsDepth() {
		return this.group.visible && this.meshes.some((mesh) => mesh.visible);
	}
	setDepth(texture: THREE.DepthTexture, width: number, height: number) {
		for (const mesh of this.meshes) {
			const uniforms = mesh.material.uniforms;
			uniforms.uDepth.value = texture;
			uniforms.uResolution.value.set(width, height);
			uniforms.uHasDepth.value = 1;
		}
	}
	warmupVisibility(): () => void {
		const groupVisible = this.group.visible;
		const visible = this.meshes.map((mesh) => mesh.visible);
		this.group.visible = true;
		this.meshes.forEach((mesh) => (mesh.visible = true));
		return () => {
			this.group.visible = groupVisible;
			this.meshes.forEach((mesh, i) => (mesh.visible = visible[i]));
		};
	}
	getDiagnostics() {
		return {
			activeVolumes: this.group.visible ? this.meshes.filter((mesh) => mesh.visible).length : 0,
			drawObjects: this.disposed ? 0 : this.meshes.length,
			steps: V12_EXHAUST_PLUME.steps,
			presentation: 'Continuous bounded optical density, advected outward from measured rims',
			speedMmS: V12_EXHAUST_PLUME.speedMmS,
			opaqueDepth: this.meshes.every((mesh) => mesh.material.uniforms.uHasDepth.value === 1)
		};
	}
	dispose() {
		if (this.disposed) return;
		this.disposed = true;
		this.group.visible = false;
		this.geometry.dispose();
		this.meshes.forEach((mesh) => mesh.material.dispose());
		this.group.clear();
	}
}
