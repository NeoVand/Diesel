import * as THREE from 'three';
import { V12Mechanism } from './v12-mechanism';
import { V12Timing } from './v12-timing';
import { V12Valvetrain, V12_CAM_CRANK_OFFSETS_DEG } from './v12-valvetrain';
import { V12TurboRig, V12_TURBO_PLAYBACK } from './v12-turbo';
import { V12RigidPoseBlend } from './v12-rigid-pose';
import { loadV12ClearanceGeometry, V12_CLEARANCE_CORRECTION } from './v12-clearance-geometry';
import { V12_MOTION_INVENTORY, V12_MOTION_INVENTORY_SUMMARY } from '../engine/v12-motion-inventory';

/** One owner per source body, one unwrapped clock, and one corrected inspection rest pose. */
export class V12RunningRig {
	private readonly crank = new V12Mechanism();
	private readonly timing = new V12Timing({ camCrankOffsetsDeg: V12_CAM_CRANK_OFFSETS_DEG });
	private readonly valves = new V12Valvetrain();
	private readonly turbo = new V12TurboRig();
	private readonly rest = new V12RigidPoseBlend();
	private readonly matrices = new Map<string, THREE.Matrix4>();
	private readonly timingGeometry = new Set<THREE.BufferGeometry>();
	private readonly ownedGeometry = new Set<THREE.BufferGeometry>();
	private clearanceGeometry = new Map<string, THREE.BufferGeometry>();
	private disposed = false;

	constructor() {
		const initial = this.sources(0);
		// Later maps take ownership of the crank sprocket, which is also measured by the linkage rig.
		for (const source of initial) this.rest.capture(source);
		for (const source of initial)
			for (const id of source.keys()) this.matrices.set(id, new THREE.Matrix4());
		for (const body of V12_MOTION_INVENTORY) {
			if (body.motion === 'rigid' && !this.matrices.has(body.componentId))
				throw new Error(`Missing running-engine binding: ${body.componentId}`);
		}
		for (const attachment of this.valves.getAttachments())
			this.ownedGeometry.add(attachment.geometry);
	}

	private sources(angle: number) {
		return [
			this.crank.matricesForPhase(angle),
			this.turbo.matricesAtTime(angle / (6 * V12_TURBO_PLAYBACK.nominalCrankRpm)),
			this.valves.matricesForPhase(angle),
			this.timing.matricesForPhase(angle)
		];
	}

	async loadGeometry(): Promise<void> {
		await Promise.all([
			this.valves.loadRefinedCams(),
			loadV12ClearanceGeometry().then((geometries) => {
				if (this.disposed) {
					for (const geometry of geometries.values()) geometry.dispose();
					throw new Error('Running rig disposed while loading clearance geometry');
				}
				this.clearanceGeometry = geometries;
				for (const geometry of geometries.values()) this.ownedGeometry.add(geometry);
			})
		]);
	}

	matricesForPhase(angle: number, inspectionAmount = 0): ReadonlyMap<string, THREE.Matrix4> {
		if (this.disposed) throw new Error('Running rig is disposed.');
		if (!Number.isFinite(angle) || !Number.isFinite(inspectionAmount))
			throw new RangeError('Running pose requires finite angle and inspection amount.');
		const amount = THREE.MathUtils.clamp(inspectionAmount, 0, 1);
		for (const source of this.sources(angle))
			for (const [id, matrix] of source)
				this.rest.apply(id, matrix, amount, this.matrices.get(id)!);
		this.valves.updateGeometry(angle, 1 - amount);
		return this.matrices;
	}

	prepareGeometry(id: string, source: THREE.BufferGeometry): THREE.BufferGeometry | null {
		const clearance = this.clearanceGeometry.get(id);
		if (clearance) return clearance;
		const timing = this.timing.createGeometryReplacement(id, source);
		if (timing) {
			this.timingGeometry.add(timing);
			this.ownedGeometry.add(timing);
			return timing;
		}
		const valves = this.valves.prepareGeometry(id, source);
		if (valves) this.ownedGeometry.add(valves);
		return valves;
	}

	getAttachments() {
		return this.valves.getAttachments();
	}

	ownsGeometry(geometry: THREE.BufferGeometry): boolean {
		return this.ownedGeometry.has(geometry);
	}

	getDiagnostics() {
		return {
			inventory: V12_MOTION_INVENTORY_SUMMARY,
			boundMatrices: this.matrices.size,
			timing: this.timing.getDiagnostics(),
			valvetrain: this.valves.getDiagnostics(),
			clearance: V12_CLEARANCE_CORRECTION,
			turbo: { bodies: 8, ...V12_TURBO_PLAYBACK }
		};
	}

	dispose() {
		if (this.disposed) return;
		this.disposed = true;
		this.valves.dispose();
		for (const geometry of this.timingGeometry) geometry.dispose();
		for (const geometry of this.clearanceGeometry.values()) geometry.dispose();
		this.clearanceGeometry.clear();
		this.timingGeometry.clear();
		this.ownedGeometry.clear();
		this.matrices.clear();
	}
}
