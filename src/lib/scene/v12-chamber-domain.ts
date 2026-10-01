import * as THREE from 'three';
import datums from '../engine/v12-chamber-datums.json';
import {
	V12_CYLINDERS,
	v12CylinderPose,
	v12NativeToDisplay,
	v12NativeVectorToDisplay
} from '../engine/v12-kinematics';
import { V12_VALVES, v12ValvePose } from '../engine/v12-valve-events';

export const V12_CHAMBER_DATUMS = datums;
export class V12ChamberDomain {
	readonly datum: (typeof datums.cylinders)[number];
	readonly cylinder: (typeof V12_CYLINDERS)[number];
	readonly texture: THREE.DataTexture;
	readonly toWorld: THREE.Matrix4;
	readonly valveCenters = Array.from({ length: 4 }, () => new THREE.Vector3());
	readonly valveAxes = Array.from({ length: 4 }, () => new THREE.Vector3());
	readonly valves;
	pinAxialMm = 0;
	private readonly data: Float32Array;
	private readonly axis: THREE.Vector3;
	private readonly radial: THREE.Vector3;
	private readonly origin: THREE.Vector3;
	private readonly point = new THREE.Vector3();
	constructor(index: number, allData: Float32Array) {
		this.datum = datums.cylinders[index];
		this.cylinder = V12_CYLINDERS.find((c) => c.pistonId === this.datum.pistonId)!;
		this.axis = new THREE.Vector3(...this.datum.axis);
		this.radial = new THREE.Vector3(...this.datum.radialAxis);
		this.origin = new THREE.Vector3(...this.datum.originMm);
		this.valves = V12_VALVES.filter((v) => v.cylinderPistonId === this.datum.pistonId);
		this.data = allData.subarray(
			this.datum.offsetFloats,
			this.datum.offsetFloats + datums.resolution ** 2 * 2
		);
		if (this.data.length !== datums.resolution ** 2 * 2)
			throw new Error('Incomplete chamber domain');
		this.texture = new THREE.DataTexture(
			this.data,
			datums.resolution,
			datums.resolution,
			THREE.RGFormat,
			THREE.FloatType
		);
		this.texture.minFilter = this.texture.magFilter = THREE.NearestFilter;
		this.texture.needsUpdate = true;
		this.toWorld = new THREE.Matrix4().makeBasis(
			new THREE.Vector3(...v12NativeVectorToDisplay(this.datum.radialAxis)),
			new THREE.Vector3(...v12NativeVectorToDisplay(this.datum.axis)),
			new THREE.Vector3(...v12NativeVectorToDisplay([0, 0, 1]))
		);
		this.toWorld.setPosition(...v12NativeToDisplay(this.datum.originMm));
		this.update(0);
	}
	update(phase: number) {
		this.pinAxialMm = new THREE.Vector3(...v12CylinderPose(this.cylinder, phase).pistonPinMm)
			.sub(this.origin)
			.dot(this.axis);
		this.valves.forEach((v, i) => {
			const pose = v12ValvePose(v, phase);
			this.point
				.fromArray(v.correctedPadCenterMm)
				.addScaledVector(
					new THREE.Vector3(...v.axis),
					v.sourceValveBottomFromPadMm + pose.valveTravelFromSourceMm + 2
				);
			this.point.sub(this.origin);
			this.valveCenters[i].set(
				this.point.dot(this.radial),
				this.point.dot(this.axis),
				this.point.z
			);
			this.point.fromArray(v.axis);
			this.valveAxes[i].set(this.point.dot(this.radial), this.point.dot(this.axis), this.point.z);
		});
	}
	contains(x: number, y: number, z: number): boolean {
		if (x * x + z * z >= datums.boreRadiusMm ** 2) return false;
		const i = Math.floor((x + datums.halfWidthMm) / datums.cellMm),
			j = Math.floor((z + datums.halfWidthMm) / datums.cellMm);
		if (i < 0 || j < 0 || i >= datums.resolution || j >= datums.resolution) return false;
		const at = (j * datums.resolution + i) * 2;
		if (y <= this.data[at] + this.pinAxialMm || y >= this.data[at + 1]) return false;
		for (let n = 0; n < 4; n++) {
			this.point.set(x, y, z).sub(this.valveCenters[n]);
			const axial = this.point.dot(this.valveAxes[n]);
			const radial2 = this.point.lengthSq() - axial * axial;
			if (axial > -3 && axial < 5 && radial2 < 14 ** 2) return false;
			if (axial >= 0 && axial < 85 && radial2 < 2 ** 2) return false;
		}
		return true;
	}
	dispose() {
		this.texture.dispose();
	}
}
