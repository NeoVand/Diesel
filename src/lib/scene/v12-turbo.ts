import * as THREE from 'three';
import datums from '../engine/v12-turbo-datums.json';
import { v12NativeToDisplay, v12NativeVectorToDisplay } from '../engine/v12-kinematics';

export const V12_TURBO_DATUMS = datums;
export const V12_TURBO_SHAFT_IDS = ['turbo-1', 'turbo-2', 'turbo-3', 'turbo-4'] as const;
export type V12TurboShaftId = (typeof V12_TURBO_SHAFT_IDS)[number];
export type V12TurboSpeeds = number | Readonly<Partial<Record<V12TurboShaftId, number>>>;

/** Presentation rates, not measured operating points or a torque/boost/spool model. */
export const V12_TURBO_PLAYBACK = Object.freeze({
	nominalCrankRpm: 1800,
	illustrativeShaftRpm: 30_000,
	speedBasis: 'Prescribed independent shaft speeds; no mechanical crank coupling',
	timeBasis: 'Illustrative physical seconds; global playback slowdown is applied by the caller',
	rotationBasis: 'Right-hand about native turbine axes; operating rotation direction unverified'
});

/** Absolute-time phase avoids frame-history drift and gives identical pause/seek/replay results. */
export function v12TurboAngleAtTime(physicalTimeSeconds: number, shaftRpm: number): number {
	if (!Number.isFinite(physicalTimeSeconds) || !Number.isFinite(shaftRpm) || shaftRpm < 0) {
		throw new RangeError(
			'Turbo time must be finite and prescribed shaft speed finite and nonnegative.'
		);
	}
	if (shaftRpm === 0 || physicalTimeSeconds === 0) return 0;
	const turns = (physicalTimeSeconds * shaftRpm) / 60;
	if (!Number.isFinite(turns))
		throw new RangeError('Turbo time × shaft speed exceeds finite range.');
	return (((turns % 1) + 1) % 1) * Math.PI * 2;
}

/**
 * Rigid motion of the eight actual purchased rotors about four native STEP shaft axes.
 * Each turbine/compressor pair shares one world-space delta. Housings stay stationary.
 *
 * `physicalTimeSeconds` is an absolute presentation clock, independent of crank angle.
 * The caller may map its slowed crank clock through nominalCrankRpm, but this is only
 * a declared time basis. It does not establish a crank/turbo drive ratio. Speeds are
 * constant prescribed profiles for a seek; changing them changes that profile rather
 * than simulating acceleration. A future spool model must supply integrated phases.
 * Returned matrices are reused; copy them before composing explosion/selection deltas.
 */
export class V12TurboRig {
	private readonly matrices = new Map<string, THREE.Matrix4>();
	private readonly rotation = new THREE.Matrix4();
	private readonly inversePivot = new THREE.Matrix4();
	private readonly shafts = datums.shafts.map((datum, index) => {
		const matrix = new THREE.Matrix4();
		for (const id of datum.componentIds) this.matrices.set(id, matrix);
		return {
			id: V12_TURBO_SHAFT_IDS[index],
			pivot: new THREE.Vector3(...v12NativeToDisplay(datum.pivotMm)),
			axis: new THREE.Vector3(...v12NativeVectorToDisplay(datum.axis)).normalize(),
			matrix,
			angle: Number.NaN
		};
	});

	matricesAtTime(
		physicalTimeSeconds: number,
		shaftRpm: V12TurboSpeeds = V12_TURBO_PLAYBACK.illustrativeShaftRpm
	): ReadonlyMap<string, THREE.Matrix4> {
		// Validate every phase first, avoiding a partially updated pose on invalid input.
		const angles = this.shafts.map((shaft) =>
			v12TurboAngleAtTime(
				physicalTimeSeconds,
				typeof shaftRpm === 'number'
					? shaftRpm
					: (shaftRpm[shaft.id] ?? V12_TURBO_PLAYBACK.illustrativeShaftRpm)
			)
		);
		for (let index = 0; index < this.shafts.length; index++) {
			const shaft = this.shafts[index];
			const angle = angles[index];
			if (angle === shaft.angle) continue;
			shaft.angle = angle;
			if (angle === 0) {
				shaft.matrix.identity();
				continue;
			}
			shaft.matrix.makeTranslation(shaft.pivot.x, shaft.pivot.y, shaft.pivot.z);
			this.rotation.makeRotationAxis(shaft.axis, angle);
			this.inversePivot.makeTranslation(-shaft.pivot.x, -shaft.pivot.y, -shaft.pivot.z);
			shaft.matrix.multiply(this.rotation).multiply(this.inversePivot);
		}
		return this.matrices;
	}
}
