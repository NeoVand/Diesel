import * as THREE from 'three';
import {
	V12_CYLINDERS,
	V12_MOTION_DATUMS,
	v12CylinderPose,
	v12MechanicalPhase,
	v12NativeToDisplay,
	type V12CylinderDatum
} from '../engine/v12-kinematics';

interface CylinderTransform {
	datum: V12CylinderDatum;
	bigEnd: THREE.Vector3;
	pin: THREE.Vector3;
	rod: THREE.Matrix4;
	piston: THREE.Matrix4;
}

/**
 * Motion deltas for the purchased world-baked source meshes. Geometry is never replaced or scaled.
 * Returned matrices are reused; callers copy them before adding explosion or atlas transforms.
 */
export class V12Mechanism {
	private readonly matrices = new Map<string, THREE.Matrix4>();
	private readonly crank = new THREE.Matrix4();
	private readonly pivot = new THREE.Vector3(...v12NativeToDisplay([0, 0, 0]));
	private readonly translation = new THREE.Matrix4();
	private readonly rotation = new THREE.Matrix4();
	private readonly movingPin = new THREE.Vector3();
	private readonly cylinders: CylinderTransform[];
	private phase = Number.NaN;

	constructor() {
		for (const id of V12_MOTION_DATUMS.crankshaftIds) this.matrices.set(id, this.crank);
		this.cylinders = V12_CYLINDERS.map((datum) => {
			const rod = new THREE.Matrix4();
			const piston = new THREE.Matrix4();
			this.matrices.set(datum.rodId, rod);
			this.matrices.set(datum.pistonId, piston);
			return {
				datum,
				bigEnd: new THREE.Vector3(...v12NativeToDisplay(datum.rodBigEndCenterMm)),
				pin: new THREE.Vector3(...v12NativeToDisplay(datum.pistonPinCenterMm)),
				rod,
				piston
			};
		});
	}

	matricesForPhase(phaseDeg: number): ReadonlyMap<string, THREE.Matrix4> {
		const phase = v12MechanicalPhase(phaseDeg);
		if (phase === this.phase) return this.matrices;
		this.phase = phase;
		if (phase === 0) {
			for (const matrix of this.matrices.values()) matrix.identity();
			return this.matrices;
		}
		this.crank.makeTranslation(this.pivot.x, this.pivot.y, this.pivot.z);
		this.rotation.makeRotationX((-phase * Math.PI) / 180);
		this.crank.multiply(this.rotation);
		this.translation.makeTranslation(-this.pivot.x, -this.pivot.y, -this.pivot.z);
		this.crank.multiply(this.translation);
		for (const cylinder of this.cylinders) {
			const pose = v12CylinderPose(cylinder.datum, phase);
			this.movingPin.set(...v12NativeToDisplay(pose.pistonPinMm));
			cylinder.piston.makeTranslation(
				this.movingPin.x - cylinder.pin.x,
				this.movingPin.y - cylinder.pin.y,
				this.movingPin.z - cylinder.pin.z
			);
			this.movingPin.set(...v12NativeToDisplay(pose.crankPinMm));
			cylinder.rod.makeTranslation(this.movingPin.x, this.movingPin.y, this.movingPin.z);
			this.rotation.makeRotationX(pose.rodAngleDeltaRadians);
			cylinder.rod.multiply(this.rotation);
			this.translation.makeTranslation(-cylinder.bigEnd.x, -cylinder.bigEnd.y, -cylinder.bigEnd.z);
			cylinder.rod.multiply(this.translation);
		}
		return this.matrices;
	}

	matrixFor(id: string, phaseDeg: number, out = new THREE.Matrix4()): THREE.Matrix4 {
		const matrix = this.matricesForPhase(phaseDeg).get(id);
		return matrix ? out.copy(matrix) : out.identity();
	}
}
