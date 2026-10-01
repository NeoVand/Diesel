import * as THREE from 'three';
import type { V12ChamberVolume } from './v12-chamber-volume';

/** Two fixed, short-range lights add a warm reflection to the bounded combustion emission.
 * They remain in the scene at zero intensity when idle, avoiding per-cycle shader recompilation.
 * This optical teaching treatment is not a radiative heat-transfer solution. */
export class V12CombustionGlow {
	readonly group = new THREE.Group();
	private readonly lights = Array.from({ length: 2 }, () => {
		const light = new THREE.PointLight(0xffad52, 0, 0.65, 2);
		light.castShadow = false;
		return light;
	});
	private readonly candidates = new Int8Array(2);
	private readonly strength = new Float32Array(2);
	private readonly point = new THREE.Vector3();
	constructor() {
		this.group.name = 'Cycle-synchronized chamber illumination';
		this.group.add(...this.lights);
	}
	update(volumes: readonly V12ChamberVolume[], enabled: boolean, plane: THREE.Plane | null) {
		this.candidates.fill(-1);
		this.strength.fill(0);
		for (const light of this.lights) light.intensity = 0;
		if (!enabled) return;
		for (let i = 0; i < volumes.length; i++) {
			const volume = volumes[i],
				domain = volume.domain;
			let burn = volume.heatRelease;
			if (burn < 0.003) continue;
			const axial = domain.datum.nozzleAxialMm - 6;
			if (!domain.contains(0, axial, 0)) continue;
			this.point.set(0, axial, 0).applyMatrix4(domain.toWorld);
			if (plane) burn *= THREE.MathUtils.smoothstep(plane.distanceToPoint(this.point), 0, 0.08);
			if (burn <= 0) continue;
			if (burn > this.strength[0]) {
				this.strength[1] = this.strength[0];
				this.candidates[1] = this.candidates[0];
				this.strength[0] = burn;
				this.candidates[0] = i;
			} else if (burn > this.strength[1]) {
				this.strength[1] = burn;
				this.candidates[1] = i;
			}
		}
		this.lights.forEach((light, i) => {
			const index = this.candidates[i];
			if (index < 0) return;
			const domain = volumes[index].domain;
			light.position.set(0, domain.datum.nozzleAxialMm - 6, 0).applyMatrix4(domain.toWorld);
			light.intensity = 0.24 * this.strength[i] ** 0.65;
		});
	}
	getDiagnostics() {
		return {
			activeLights: this.lights.filter((light) => light.intensity > 0).length,
			fixedLightCount: this.lights.length,
			shadowPasses: 0
		};
	}
	dispose() {
		for (const light of this.lights) {
			light.intensity = 0;
			light.dispose();
		}
		this.group.removeFromParent();
		this.group.clear();
	}
}
