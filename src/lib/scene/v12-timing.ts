import * as THREE from 'three';
import source from '../engine/v12-timing-datums.json';
import corrected from '../engine/v12-corrected-timing.json';
import attachments from '../engine/v12-motion-attachments.json';
import mounts from '../engine/v12-timing-mounts.json';
import {
	V12_MOTION_DATUMS,
	v12NativeToDisplay,
	v12NativeVectorToDisplay
} from '../engine/v12-kinematics';

const modulo = (value: number, period: number) => ((value % period) + period) % period;
const smooth = (t: number) => t * t * (3 - 2 * t);
const scale = V12_MOTION_DATUMS.displayScale / 1000;
export const V12_TIMING_CORRECTIONS = corrected;

class ClosedChain {
	readonly datum;
	readonly derived;
	readonly pins: Float64Array;
	readonly matrices: THREE.Matrix4[];
	private readonly weights: Float64Array;
	private readonly dx: Float64Array;
	private readonly dy: Float64Array;
	private readonly edgeIds: Int32Array;
	private readonly diagonal: Float64Array;
	private readonly offDiagonal: Float64Array;
	private readonly rhs: Float64Array;
	private readonly multipliers: Float64Array;
	private readonly origins: THREE.Vector3[];
	private readonly angles: number[];
	private readonly rotate = new THREE.Matrix4();
	private readonly translate = new THREE.Matrix4();
	maximumLengthErrorMm = 0;
	maximumContactErrorMm = 0;
	iterations = 0;

	constructor(index: number) {
		this.datum = source.chainLoops[index];
		this.derived = corrected.loops.find((loop) => loop.id === this.datum.id)!;
		const n = this.datum.links.length;
		this.pins = new Float64Array(n * 2);
		this.weights = new Float64Array(n);
		this.dx = new Float64Array(n);
		this.dy = new Float64Array(n);
		this.edgeIds = new Int32Array(n);
		this.diagonal = new Float64Array(n);
		this.offDiagonal = new Float64Array(n);
		this.rhs = new Float64Array(n);
		this.multipliers = new Float64Array(n);
		this.origins = this.datum.links.map(
			(link) => new THREE.Vector3(...v12NativeToDisplay(link.centerMm))
		);
		this.angles = this.datum.links.map((link) => Math.atan2(link.tangent[1], link.tangent[0]));
		this.matrices = this.datum.links.map(() => new THREE.Matrix4());
	}

	evaluate(crankDeg: number) {
		const n = this.datum.links.length;
		const advance = modulo(
			(crankDeg * this.datum.driverTeeth * this.datum.driverCrankRatio) / 360,
			n
		);
		const integer = Math.floor(advance);
		const fraction = advance - integer;
		const coordinate = fraction * corrected.samplesPerLinkAdvance;
		const frame = Math.min(corrected.samplesPerLinkAdvance - 1, Math.floor(coordinate));
		const mix = coordinate - frame;
		const a = this.derived.frames[frame],
			b = this.derived.frames[frame + 1];
		this.weights.fill(1);
		for (let i = 0; i < n; i++) {
			const j = (i + integer) % n;
			this.pins[2 * i] = a[j][0] + (b[j][0] - a[j][0]) * mix;
			this.pins[2 * i + 1] = a[j][1] + (b[j][1] - a[j][1]) * mix;
		}
		let fixed = 0;
		for (const wheel of this.derived.contacts) {
			const mid = (wheel.start + wheel.end) / 2;
			for (let i = 0; i < n; i++) {
				let s = i + advance;
				s += Math.round((mid - s) / n) * n;
				const distance = Math.max(wheel.start - s, s - wheel.end, 0);
				if (distance >= 1.5) continue;
				const weight = 1 - smooth(distance / 1.5);
				this.weights[i] = distance === 0 ? 0 : Math.max(1e-7, (1 - weight) ** 2);
				if (distance === 0) {
					const angle = wheel.base - s * wheel.step;
					this.pins[2 * i] = wheel.cx + wheel.radius * Math.cos(angle);
					this.pins[2 * i + 1] = wheel.cy + wheel.radius * Math.sin(angle);
					fixed = i;
				}
			}
		}
		// Start at a fixed pin, cutting the cyclic matrix into independent tridiagonal blocks.
		let edgeCount = 0;
		for (let k = 0; k < n; k++) {
			const i = (fixed + k) % n,
				j = (i + 1) % n;
			if (this.weights[i] + this.weights[j] > 0) this.edgeIds[edgeCount++] = i;
		}
		const pitch = this.datum.pitchMm;
		this.iterations = 0;
		for (let iteration = 0; iteration < 12; iteration++) {
			let maximum = 0;
			for (let i = 0; i < n; i++) {
				const j = (i + 1) % n;
				this.dx[i] = this.pins[2 * j] - this.pins[2 * i];
				this.dy[i] = this.pins[2 * j + 1] - this.pins[2 * i + 1];
				maximum = Math.max(maximum, Math.abs(Math.hypot(this.dx[i], this.dy[i]) - pitch));
			}
			this.maximumLengthErrorMm = maximum;
			if (maximum < 1e-9) break;
			this.iterations = iteration + 1;
			for (let row = 0; row < edgeCount; row++) {
				const i = this.edgeIds[row],
					j = (i + 1) % n;
				const squared = this.dx[i] ** 2 + this.dy[i] ** 2;
				this.diagonal[row] = 4 * squared * (this.weights[i] + this.weights[j]);
				this.rhs[row] = squared - pitch * pitch;
				const previous = row > 0 ? this.edgeIds[row - 1] : -2;
				this.offDiagonal[row] =
					row > 0 && (previous + 1) % n === i
						? -4 *
							this.weights[i] *
							(this.dx[previous] * this.dx[i] + this.dy[previous] * this.dy[i])
						: 0;
			}
			for (let row = 1; row < edgeCount; row++) {
				const factor = this.offDiagonal[row] / this.diagonal[row - 1];
				this.diagonal[row] -= factor * this.offDiagonal[row];
				this.rhs[row] -= factor * this.rhs[row - 1];
			}
			for (let row = edgeCount - 1; row >= 0; row--) {
				this.multipliers[row] =
					(this.rhs[row] -
						(row + 1 < edgeCount ? this.offDiagonal[row + 1] * this.multipliers[row + 1] : 0)) /
					this.diagonal[row];
			}
			for (let row = 0; row < edgeCount; row++) {
				const i = this.edgeIds[row],
					j = (i + 1) % n;
				const amount = 2 * this.multipliers[row];
				this.pins[2 * i] += this.weights[i] * this.dx[i] * amount;
				this.pins[2 * i + 1] += this.weights[i] * this.dy[i] * amount;
				this.pins[2 * j] -= this.weights[j] * this.dx[i] * amount;
				this.pins[2 * j + 1] -= this.weights[j] * this.dy[i] * amount;
			}
		}
		this.maximumContactErrorMm = 0;
		for (const wheel of this.derived.contacts) {
			const mid = (wheel.start + wheel.end) / 2;
			for (let i = 0; i < n; i++) {
				let s = i + advance;
				s += Math.round((mid - s) / n) * n;
				if (s < wheel.start || s > wheel.end) continue;
				const angle = wheel.base - s * wheel.step;
				this.maximumContactErrorMm = Math.max(
					this.maximumContactErrorMm,
					Math.hypot(
						this.pins[2 * i] - wheel.cx - wheel.radius * Math.cos(angle),
						this.pins[2 * i + 1] - wheel.cy - wheel.radius * Math.sin(angle)
					)
				);
			}
		}
		for (let i = 0; i < n; i++) {
			const j = (i + 1) % n,
				origin = this.origins[i];
			const x = (this.pins[2 * i] + this.pins[2 * j]) / 2,
				y = (this.pins[2 * i + 1] + this.pins[2 * j + 1]) / 2;
			const native = this.datum.links[i].centerMm;
			const angle = Math.atan2(
				this.pins[2 * j + 1] - this.pins[2 * i + 1],
				this.pins[2 * j] - this.pins[2 * i]
			);
			const matrix = this.matrices[i];
			matrix.makeTranslation(
				origin.x,
				origin.y + (y - native[1]) * scale,
				origin.z - (x - native[0]) * scale
			);
			this.rotate.makeRotationX(angle - this.angles[i]);
			matrix.multiply(this.rotate);
			this.translate.makeTranslation(-origin.x, -origin.y, -origin.z);
			matrix.multiply(this.translate);
		}
	}
}

/** Finite-pitch derived timing rig. Returned transforms are reused and never scale a chain link. */
export interface V12TimingOptions {
	/** Crank-equivalent cam indexing offsets, keyed by source cam ID; wheel/hub phase is unchanged. */
	camCrankOffsetsDeg?: Readonly<Record<string, number>>;
}

export class V12Timing {
	private readonly loops = source.chainLoops.map((_, i) => new ClosedChain(i));
	private readonly matrices = new Map<string, THREE.Matrix4>();
	private readonly shafts = source.shafts.map((shaft) => ({
		...shaft,
		pivot: new THREE.Vector3(...v12NativeToDisplay(shaft.pivotMm)),
		matrix: new THREE.Matrix4(),
		camMatrix: new THREE.Matrix4()
	}));
	private readonly rotate = new THREE.Matrix4();
	private readonly translate = new THREE.Matrix4();
	private phase = Number.NaN;
	private readonly guides = corrected.guideCorrections.map((guide) => ({
		...guide,
		matrix: new THREE.Matrix4().makeTranslation(
			...v12NativeVectorToDisplay(guide.nativeCorrectionMm)
		)
	}));
	private readonly covers = attachments.camCovers.map((cover) => ({
		...cover,
		matrix: new THREE.Matrix4(),
		correction: new THREE.Matrix4().makeTranslation(
			...v12NativeVectorToDisplay(cover.nativeCorrectionMm)
		)
	}));
	private readonly guideFasteners = mounts.guides.flatMap((guide) =>
		guide.mounts.map((mount) => ({
			id: mount.fastenerId,
			matrix: new THREE.Matrix4().makeTranslation(
				...v12NativeVectorToDisplay(guide.nativeCorrectionMm)
			)
		}))
	);
	constructor(private readonly options: V12TimingOptions = {}) {
		if (Object.values(options.camCrankOffsetsDeg ?? {}).some((offset) => !Number.isFinite(offset)))
			throw new RangeError('Cam indexing offsets must be finite.');
		for (const shaft of this.shafts)
			for (const id of shaft.componentIds)
				this.matrices.set(
					id,
					shaft.id.startsWith('cam-') && id === shaft.componentIds[0]
						? shaft.camMatrix
						: shaft.matrix
				);
		for (const cover of this.covers) this.matrices.set(cover.componentId, cover.matrix);
		for (const guide of this.guides) this.matrices.set(guide.id, guide.matrix);
		for (const fastener of this.guideFasteners) this.matrices.set(fastener.id, fastener.matrix);
		for (const loop of this.loops)
			for (let i = 0; i < loop.datum.links.length; i++)
				this.matrices.set(loop.datum.links[i].componentId, loop.matrices[i]);
		this.matricesForPhase(0);
	}
	matricesForPhase(unwrappedCrankDeg: number): ReadonlyMap<string, THREE.Matrix4> {
		if (!Number.isFinite(unwrappedCrankDeg))
			throw new RangeError('Timing drive angle must be finite.');
		if (this.phase === unwrappedCrankDeg) return this.matrices;
		this.phase = unwrappedCrankDeg;
		for (const shaft of this.shafts) {
			const offset = this.options.camCrankOffsetsDeg?.[shaft.componentIds[0]] ?? 0;
			for (const [matrix, phase] of [
				[shaft.matrix, unwrappedCrankDeg],
				[shaft.camMatrix, unwrappedCrankDeg + offset]
			] as const) {
				const angle = (-modulo(phase * shaft.crankRatio, 360) * Math.PI) / 180;
				if (angle === 0) {
					matrix.identity();
					continue;
				}
				matrix.makeTranslation(shaft.pivot.x, shaft.pivot.y, shaft.pivot.z);
				this.rotate.makeRotationX(angle);
				matrix.multiply(this.rotate);
				this.translate.makeTranslation(-shaft.pivot.x, -shaft.pivot.y, -shaft.pivot.z);
				matrix.multiply(this.translate);
			}
		}
		for (const cover of this.covers)
			cover.matrix
				.copy(this.shafts.find((shaft) => shaft.id === cover.ownerId)!.matrix)
				.multiply(cover.correction);

		for (const loop of this.loops) loop.evaluate(unwrappedCrankDeg);
		return this.matrices;
	}
	/** Clones only the derived tooth-ring geometry; hubs and their mounting registration stay fixed. */
	createGeometryReplacement(
		id: string,
		original: THREE.BufferGeometry
	): THREE.BufferGeometry | null {
		const correction = corrected.wheelCorrections.find((wheel) => wheel.id === id);
		if (!correction) return null;
		const geometry = original.clone();
		const positions = geometry.getAttribute('position');
		const pivot = v12NativeToDisplay(correction.pivotMm);
		for (let i = 0; i < positions.count; i++) {
			const y = (positions.getY(i) - pivot[1]) / scale,
				z = (positions.getZ(i) - pivot[2]) / scale;
			const radius = Math.hypot(y, z);
			const t = Math.min(
				1,
				Math.max(
					0,
					(radius - correction.innerFixedRadiusMm) /
						(correction.fullCorrectionRadiusMm - correction.innerFixedRadiusMm)
				)
			);
			const blend = smooth(t);
			const ratio =
				1 + blend * (correction.derivedPitchRadiusMm / correction.sourcePitchRadiusMm - 1);
			const angle = blend * correction.toothRingPhaseCorrectionRad;
			const c = Math.cos(angle),
				s = Math.sin(angle);
			positions.setXYZ(
				i,
				positions.getX(i),
				pivot[1] + (y * c - z * s) * ratio * scale,
				pivot[2] + (y * s + z * c) * ratio * scale
			);
		}
		positions.needsUpdate = true;
		geometry.computeVertexNormals();
		geometry.computeBoundingBox();
		geometry.computeBoundingSphere();
		geometry.userData = {
			...original.userData,
			derivedTiming: true,
			sourcePreserved: true,
			correction
		};
		return geometry;
	}
	getDiagnostics() {
		return {
			classification: 'derived finite-pitch kinematic rig',
			phase: this.phase,
			movingSourceBodies: this.matrices.size - this.guides.length - this.guideFasteners.length,
			correctedStationaryGuides: this.guides.length,
			correctedStationaryFasteners: this.guideFasteners.length,
			guideClearances: this.guideClearances(),
			maximumHingeGapMm: Math.max(...this.loops.map((loop) => loop.maximumLengthErrorMm)),
			maximumEngagedToothCenterErrorMm: Math.max(
				...this.loops.map((loop) => loop.maximumContactErrorMm)
			),
			maximumProjectionIterations: Math.max(...this.loops.map((loop) => loop.iterations)),
			loops: this.loops.map((loop) => ({
				id: loop.datum.id,
				links: loop.datum.links.length,
				pitchMm: loop.datum.pitchMm,
				circulationPeriodCrankDeg: (360 * loop.datum.links.length) / loop.datum.driverTeeth,
				maximumRestPinCorrectionMm: loop.derived.maximumRestPinCorrectionMm,
				maximumHingeGapMm: loop.maximumLengthErrorMm,
				maximumEngagedToothCenterErrorMm: loop.maximumContactErrorMm
			})),
			limitations: [
				'Coaxial idler coupling inferred from native assembly',
				'Kinematic pin closure and tooth-center engagement; not contact force, wear, or chain dynamics',
				'Tooth rings and initial link placement are explicit derived corrections'
			]
		};
	}
	private guideClearances() {
		return this.guides.map((guide) => {
			const loop = this.loops.find((loop) => loop.datum.id === guide.loopId)!;
			const n = loop.datum.links.length;
			const shift = Math.floor(modulo((this.phase * loop.datum.driverTeeth) / 360, n));
			const cx = guide.nativeSupportCircleCenterMm[0] + guide.nativeCorrectionMm[0];
			const cy = guide.nativeSupportCircleCenterMm[1] + guide.nativeCorrectionMm[1];
			let minimum = Infinity;
			for (const station of guide.sourcePinStations) {
				const i = modulo(station - shift, n),
					j = (i + 1) % n;
				const ax = loop.pins[2 * i],
					ay = loop.pins[2 * i + 1],
					dx = loop.pins[2 * j] - ax,
					dy = loop.pins[2 * j + 1] - ay;
				const t = Math.min(1, Math.max(0, ((cx - ax) * dx + (cy - ay) * dy) / (dx * dx + dy * dy)));
				minimum = Math.min(
					minimum,
					Math.hypot(ax + t * dx - cx, ay + t * dy - cy) -
						guide.supportRadiusMm -
						guide.plateEnvelopeRadiusMm
				);
			}
			return {
				id: guide.id,
				minimumEnvelopeClearanceMm: minimum,
				placementCorrectionMm: guide.nativeCorrectionMm,
				scope: guide.scope
			};
		});
	}

	/** Borrowed coordinates for validation; do not mutate. Indexed in each native loop’s link order. */
	getPinPositionsMm(loopId: string): Readonly<Float64Array> | undefined {
		return this.loops.find((loop) => loop.datum.id === loopId)?.pins;
	}
}
