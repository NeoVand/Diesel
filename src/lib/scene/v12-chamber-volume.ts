import * as THREE from 'three';
import { screenCoordinate, uniform } from 'three/tsl';
import { ProcessNodeMaterial } from './process-node-material';
import { chamberVolume } from './process-volume-wgsl';
import { V12ChamberDomain } from './v12-chamber-domain';
import { v12ProcessCycle } from '../engine/v12-process-cycle';
import { DIRECTED_FLOW_SPEED_MM_S } from './directed-flow-volume';

type ChamberUniforms = {
	uMin: { value: THREE.Vector3 };
	uMax: { value: THREE.Vector3 };
	uBounds: { value: THREE.DataTexture };
	uDepth: { value: THREE.Texture | null };
	uResolution: { value: THREE.Vector2 };
	uCamera: { value: THREE.Vector3 };
	uModel: { value: THREE.Matrix4 };
	uViewProjection: { value: THREE.Matrix4 };
	uPin: { value: number };
	uNozzle: { value: number };
	uBurn: { value: number };
	uSpray: { value: number };
	uIntake: { value: number };
	uExhaust: { value: number };
	uPhase: { value: number };
	uTravelMm: { value: number };
	uHasDepth: { value: number };
	uHasClip: { value: number };
	uPlane: { value: THREE.Vector4 };
	uValveCenters: { value: THREE.Vector3[] };
	uValveAxes: { value: THREE.Vector3[] };
};

/** Emission/absorption integration of a declared spray-region envelope, clipped to recovered gas bounds. */
export class V12ChamberVolume {
	readonly mesh: THREE.Mesh<THREE.BoxGeometry, ProcessNodeMaterial<ChamberUniforms>>;
	private readonly inverse: THREE.Matrix4;
	private readonly camera = new THREE.Vector3();
	constructor(readonly domain: V12ChamberDomain) {
		const uniforms: ChamberUniforms = {
			uMin: { value: new THREE.Vector3(-42, 100, -42) },
			uMax: { value: new THREE.Vector3(42, 221, 42) },
			uBounds: { value: domain.texture },
			uDepth: { value: null },
			uResolution: { value: new THREE.Vector2(1, 1) },
			uCamera: { value: this.camera },
			uModel: { value: domain.toWorld },
			uViewProjection: { value: new THREE.Matrix4() },
			uPin: { value: 0 },
			uNozzle: { value: domain.datum.nozzleAxialMm },
			uBurn: { value: 0 },
			uSpray: { value: 0 },
			uIntake: { value: 0 },
			uExhaust: { value: 0 },
			uPhase: { value: 0 },
			uTravelMm: { value: 0 },
			uHasDepth: { value: 0 },
			uHasClip: { value: 0 },
			uPlane: { value: new THREE.Vector4() },
			uValveCenters: { value: domain.valveCenters },
			uValveAxes: { value: domain.valveAxes }
		};
		const material = new ProcessNodeMaterial(uniforms, {
			side: THREE.BackSide,
			transparent: true,
			depthTest: false,
			depthWrite: false,
			premultipliedAlpha: true,
			toneMapped: false
		});
		material.fragmentNode = chamberVolume({
			...material.processNodes,
			vPoint: material.boundedPosition(),
			pixel: screenCoordinate,
			c0: uniform(domain.valveCenters[0]),
			a0: uniform(domain.valveAxes[0]),
			c1: uniform(domain.valveCenters[1]),
			a1: uniform(domain.valveAxes[1]),
			c2: uniform(domain.valveCenters[2]),
			a2: uniform(domain.valveAxes[2]),
			c3: uniform(domain.valveCenters[3]),
			a3: uniform(domain.valveAxes[3])
		});
		this.mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
		this.mesh.name = `Bounded spray/combustion volume ${domain.datum.pistonId}`;
		this.mesh.matrixAutoUpdate = false;
		this.mesh.matrix.copy(domain.toWorld);
		this.inverse = domain.toWorld.clone().invert();
		this.mesh.frustumCulled = false;
		this.mesh.visible = false;
		this.mesh.renderOrder = -1;
		this.mesh.onBeforeRender = (_renderer, _scene, camera) => {
			this.camera.setFromMatrixPosition(camera.matrixWorld).applyMatrix4(this.inverse);
			uniforms.uViewProjection.value
				.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
				.multiply(domain.toWorld);
		};
	}
	update(
		phase: number,
		fuel: boolean,
		combustion: boolean,
		clipPlane: THREE.Plane | null,
		air = false,
		exhaust = false,
		flowSeconds = phase / 90
	) {
		const cycle = v12ProcessCycle(this.domain.cylinder, phase),
			u = this.mesh.material.uniforms;
		u.uPin.value = this.domain.pinAxialMm;
		u.uMin.value.y = this.domain.pinAxialMm + 28;
		u.uMax.value.y = this.domain.datum.nozzleAxialMm;
		u.uBurn.value = combustion ? cycle.combustion : 0;
		u.uSpray.value = fuel ? cycle.injection : 0;
		u.uIntake.value = air ? Math.sqrt(cycle.intake) : 0;
		u.uExhaust.value = exhaust ? Math.sqrt(cycle.exhaust) : 0;
		u.uPhase.value = (cycle.cycleDeg * Math.PI) / 180;
		u.uTravelMm.value = flowSeconds * DIRECTED_FLOW_SPEED_MM_S;
		u.uHasClip.value = clipPlane ? 1 : 0;
		if (clipPlane) u.uPlane.value.set(...clipPlane.normal.toArray(), clipPlane.constant);
		this.mesh.visible = u.uBurn.value + u.uSpray.value + u.uIntake.value + u.uExhaust.value > 0.003;
	}
	get heatRelease(): number {
		return this.mesh.visible ? this.mesh.material.uniforms.uBurn.value : 0;
	}
	setDepth(texture: THREE.DepthTexture, width: number, height: number) {
		const u = this.mesh.material.uniforms;
		u.uDepth.value = texture;
		u.uResolution.value.set(width, height);
		u.uHasDepth.value = 1;
	}
	dispose() {
		this.mesh.geometry.dispose();
		this.mesh.material.dispose();
	}
}
