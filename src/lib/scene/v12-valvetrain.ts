import { fetchEngineAsset, engineAssetUrl } from '../engine/local-assets';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
	V12_VALVES,
	V12_VALVETRAIN_DATUMS,
	v12ValvePose,
	type V12ValveDatum
} from '../engine/v12-valve-events';
import { v12NativeVectorToDisplay, V12_MOTION_DATUMS } from '../engine/v12-kinematics';
export { V12_CAM_CRANK_OFFSETS_DEG } from '../engine/v12-valve-events';

export interface V12DerivedValveAttachment {
	id: string;
	parentId: string;
	label: string;
	geometry: THREE.BufferGeometry;
	provenance: string;
}
interface SpringSegment {
	valve: V12ValveDatum;
	geometry: THREE.BufferGeometry;
	lastHeight: number;
	samples: { cosine: number; sine: number; rise: number; derivative: number }[];
}
const AXIAL_STEPS = 18;
const WIRE_STEPS = 8;
const WIRE_CIRCLE = Array.from({ length: WIRE_STEPS }, (_, k) => {
	const phi = (k * Math.PI * 2) / WIRE_STEPS;
	return { cosine: Math.cos(phi), sine: Math.sin(phi) };
});
const nativePoint = (display: THREE.Vector3): THREE.Vector3 => {
	const [cx, cy, cz] = V12_MOTION_DATUMS.sourceCenterMeters,
		s = V12_MOTION_DATUMS.displayScale;
	return new THREE.Vector3(
		1000 * (cx - display.z / s),
		1000 * (display.y / s + cz),
		1000 * (display.x / s - cy)
	);
};
const DISPLAY_SCALE = V12_MOTION_DATUMS.displayScale / 1000;
const [SOURCE_CX, SOURCE_CY, SOURCE_CZ] = V12_MOTION_DATUMS.sourceCenterMeters;
const setNative = (a: THREE.BufferAttribute, i: number, p: THREE.Vector3) =>
	a.setXYZ(
		i,
		p.z * DISPLAY_SCALE + SOURCE_CY * V12_MOTION_DATUMS.displayScale,
		p.y * DISPLAY_SCALE - SOURCE_CZ * V12_MOTION_DATUMS.displayScale,
		-p.x * DISPLAY_SCALE + SOURCE_CX * V12_MOTION_DATUMS.displayScale
	);

/** Fraction of axial rise along a continuous, constant-wire helix with grounded end arcs. */
export function v12SpringRise(t: number, turns = 3.5): { value: number; derivative: number } {
	const end = 0.25,
		ramp = 0.15,
		u = Math.max(0, Math.min(turns, t * turns));
	const total = turns - 2 * end - ramp;
	const first = (x: number): { area: number; rate: number } => {
		if (x <= end) return { area: 0, rate: 0 };
		const q = x - end;
		if (q < ramp)
			return {
				area: q / 2 - (ramp * Math.sin((Math.PI * q) / ramp)) / (2 * Math.PI),
				rate: (1 - Math.cos((Math.PI * q) / ramp)) / 2
			};
		return { area: q - ramp / 2, rate: 1 };
	};
	const sample = u <= turns / 2 ? first(u) : first(turns - u);
	return {
		value: (u <= turns / 2 ? sample.area : total - sample.area) / total,
		derivative: (sample.rate * turns) / total
	};
}

function springGeometry(): THREE.BufferGeometry {
	const geometry = new THREE.BufferGeometry();
	const positions = new Float32Array((AXIAL_STEPS + 1) * WIRE_STEPS * 3);
	geometry.setAttribute(
		'position',
		new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage)
	);
	geometry.setAttribute(
		'normal',
		new THREE.BufferAttribute(new Float32Array(positions.length), 3).setUsage(
			THREE.DynamicDrawUsage
		)
	);
	const indices: number[] = [];
	for (let j = 0; j < AXIAL_STEPS; j++)
		for (let k = 0; k < WIRE_STEPS; k++) {
			const a = j * WIRE_STEPS + k,
				b = j * WIRE_STEPS + ((k + 1) % WIRE_STEPS),
				c = a + WIRE_STEPS,
				d = b + WIRE_STEPS;
			indices.push(a, b, c, b, d, c);
		}
	// Individually closed source-mapped segments support section caps; coincident seam end faces are internal.
	for (let k = 1; k < WIRE_STEPS - 1; k++) {
		indices.push(0, k + 1, k);
		const base = AXIAL_STEPS * WIRE_STEPS;
		indices.push(base, base + k, base + k + 1);
	}
	geometry.setIndex(indices);
	return geometry;
}

function retainerGeometry(valve: V12ValveDatum): THREE.BufferGeometry {
	const n = new THREE.Vector3(...valve.axis),
		e = new THREE.Vector3(-n.y, n.x, 0),
		z = new THREE.Vector3(0, 0, 1);
	const p = new THREE.Vector3(...valve.correctedPadCenterMm);
	const axial = valve.closedPadShiftMm - valve.closedValveShiftMm;
	// Annular split-keeper seat and spring retainer; carried by the valve's rigid source delta.
	const profile = [
		new THREE.Vector2(1.5, axial - 6.2),
		new THREE.Vector2(11.8, axial - 6.2),
		new THREE.Vector2(11.8, axial - 5),
		new THREE.Vector2(1.5, axial - 5),
		new THREE.Vector2(1.5, axial - 6.2)
	];
	const g = new THREE.LatheGeometry(profile, 32);
	const position = g.getAttribute('position') as THREE.BufferAttribute;
	const q = new THREE.Vector3();
	for (let i = 0; i < position.count; i++) {
		q.copy(p)
			.addScaledVector(e, position.getX(i))
			.addScaledVector(n, position.getY(i))
			.addScaledVector(z, position.getZ(i));
		setNative(position, i, q);
	}
	g.computeVertexNormals();
	g.computeBoundingBox();
	g.computeBoundingSphere();
	return g;
}

/**
 * Corrected source-cam-driven valves. Only source pose corrections and rigid translations enter matrices.
 * Coil shapes deform about fixed support planes with invariant wire radius. The purchased asset stays immutable.
 */
export class V12Valvetrain {
	private readonly matrices = new Map<string, THREE.Matrix4>();
	private readonly springs = new Map<string, SpringSegment>();
	private readonly springHeights = new Map<string, { rest: number; current: number }>();
	private readonly replacements = new Map<string, THREE.BufferGeometry>();
	private readonly attachments: V12DerivedValveAttachment[] = [];
	private readonly byValve = new Map(V12_VALVES.map((v) => [v.valveId, v]));
	private phase = Number.NaN;
	private geometryPhase = Number.NaN;
	private geometryBlend = Number.NaN;
	private disposed = false;
	private refinedCamsLoaded = false;
	private refinedCamPromise: Promise<void> | null = null;

	constructor() {
		for (const valve of V12_VALVES) {
			this.matrices.set(valve.valveId, new THREE.Matrix4());
			this.matrices.set(valve.tappetId, new THREE.Matrix4());
			this.springHeights.set(valve.valveId, {
				rest: v12ValvePose(valve, 0).springHeightMm,
				current: Number.NaN
			});
			valve.spring.parts.forEach((part, index) =>
				this.springs.set(part.id, {
					valve,
					geometry: springGeometry(),
					lastHeight: Number.NaN,
					samples: Array.from({ length: AXIAL_STEPS + 1 }, (_, j) => {
						const t = (index + j / AXIAL_STEPS) / 7,
							theta = t * Math.PI * 2 * valve.spring.turns,
							rise = v12SpringRise(t, valve.spring.turns);
						return {
							cosine: Math.cos(theta),
							sine: Math.sin(theta),
							rise: rise.value,
							derivative: rise.derivative
						};
					})
				})
			);
			this.attachments.push({
				id: `derived-retainer-${valve.valveId}`,
				parentId: valve.valveId,
				label: 'Derived spring retainer',
				geometry: retainerGeometry(valve),
				provenance:
					'Source has segmented coil geometry without an independently identified retainer; 1.2 mm steel annular teaching retainer, not an OEM part.'
			});
		}
		this.matricesForPhase(0);
		this.updateGeometry(0);
	}

	matricesForPhase(unwrappedCrankDeg: number): ReadonlyMap<string, THREE.Matrix4> {
		if (this.disposed) throw new Error('Valvetrain is disposed.');
		if (!Number.isFinite(unwrappedCrankDeg)) throw new RangeError('Crank angle must be finite.');
		if (unwrappedCrankDeg === this.phase) return this.matrices;
		this.phase = unwrappedCrankDeg;
		for (const valve of V12_VALVES) {
			const pose = v12ValvePose(valve, unwrappedCrankDeg);
			for (const [id, shift, correction] of [
				[valve.tappetId, pose.tappetTravelFromSourceMm, valve.tappetLateralCorrectionMm],
				[valve.valveId, pose.valveTravelFromSourceMm, valve.stemLateralCorrectionMm]
			] as const) {
				const native = valve.axis.map((a, i) => a * shift + correction[i]);
				this.matrices.get(id)!.makeTranslation(...v12NativeVectorToDisplay(native));
			}
		}
		return this.matrices;
	}

	/** Load the four validated native-derived cam solids before source mesh/cap construction. */
	loadRefinedCams(url = '/models/v12-cams-refined.glb'): Promise<void> {
		if (this.disposed) return Promise.reject(new Error('Valvetrain is disposed.'));
		if (this.refinedCamPromise) return this.refinedCamPromise;
		this.refinedCamPromise = (async () => {
			const response = await fetchEngineAsset(url);
			if (!response.ok) throw new Error('The corrected cams could not be loaded.');
			const result = await new GLTFLoader().parseAsync(
				await response.arrayBuffer(),
				engineAssetUrl('/models/')
			);
			const found = new Map<string, THREE.BufferGeometry>();
			const materials = new Set<THREE.Material>();
			result.scene.traverse((object) => {
				if (!(object instanceof THREE.Mesh)) return;
				const id = object.name.startsWith('v12-') ? object.name : object.parent?.name;
				if (id && ['v12-0285', 'v12-0286', 'v12-0287', 'v12-0288'].includes(id)) {
					object.geometry.computeVertexNormals();
					object.geometry.computeBoundingBox();
					object.geometry.computeBoundingSphere();
					found.set(id, object.geometry);
				}
				for (const material of Array.isArray(object.material) ? object.material : [object.material])
					materials.add(material);
			});
			materials.forEach((material) => material.dispose());
			if (this.disposed || found.size !== 4) {
				found.forEach((geometry) => geometry.dispose());
				throw new Error(
					this.disposed
						? 'Valvetrain disposed during cam loading.'
						: 'Native cam asset must contain all four identified shafts.'
				);
			}
			for (const [id, geometry] of found) this.replacements.set(id, geometry);
			this.refinedCamsLoaded = true;
		})();
		return this.refinedCamPromise;
	}

	/** Caller replaces mesh geometry before cap construction. Caller must not dispose returned owned geometry. */
	prepareGeometry(id: string, sourceGeometry: THREE.BufferGeometry): THREE.BufferGeometry | null {
		if (this.disposed) throw new Error('Valvetrain is disposed.');
		const spring = this.springs.get(id);
		if (spring) return spring.geometry;
		if (this.replacements.has(id)) return this.replacements.get(id)!;
		const valve = this.byValve.get(id);
		if (!valve) return null;
		const geometry = sourceGeometry.clone();
		const positions = geometry.getAttribute('position') as THREE.BufferAttribute;
		const p = new THREE.Vector3(...valve.correctedPadCenterMm),
			axis = new THREE.Vector3(...valve.axis),
			q = new THREE.Vector3();
		for (let i = 0; i < positions.count; i++) {
			q.fromBufferAttribute(positions, i);
			q.copy(nativePoint(q));
			const axial = q.clone().sub(p).dot(axis);
			const fraction = THREE.MathUtils.clamp(
				(axial - valve.stemStretchStartFromPadMm) /
					(valve.sourceValveTopFromPadMm - valve.stemStretchStartFromPadMm),
				0,
				1
			);
			q.addScaledVector(axis, valve.stemExtensionMm * fraction);
			setNative(positions, i, q);
		}
		positions.needsUpdate = true;
		geometry.computeVertexNormals();
		geometry.computeBoundingBox();
		geometry.computeBoundingSphere();
		this.replacements.set(id, geometry);
		return geometry;
	}

	getAttachments(): readonly V12DerivedValveAttachment[] {
		return this.attachments;
	}

	/** blend=0 is the corrected phase-zero rest rig, not the defective purchased pose. */
	updateGeometry(unwrappedCrankDeg: number, blend = 1): void {
		if (this.disposed) throw new Error('Valvetrain is disposed.');
		if (!Number.isFinite(unwrappedCrankDeg) || !Number.isFinite(blend))
			throw new RangeError('Finite phase and blend required.');
		const mix = THREE.MathUtils.clamp(blend, 0, 1);
		if (this.geometryPhase === unwrappedCrankDeg && this.geometryBlend === mix) return;
		this.geometryPhase = unwrappedCrankDeg;
		this.geometryBlend = mix;
		for (const valve of V12_VALVES) {
			const heights = this.springHeights.get(valve.valveId)!;
			heights.current = THREE.MathUtils.lerp(
				heights.rest,
				v12ValvePose(valve, unwrappedCrankDeg).springHeightMm,
				mix
			);
		}
		const p = new THREE.Vector3(),
			axis = new THREE.Vector3(),
			e = new THREE.Vector3(),
			radial = new THREE.Vector3(),
			tangent = new THREE.Vector3(),
			normal2 = new THREE.Vector3(),
			center = new THREE.Vector3(),
			normal = new THREE.Vector3(),
			q = new THREE.Vector3();
		for (const segment of this.springs.values()) {
			const { valve, geometry, samples } = segment;
			const height = this.springHeights.get(valve.valveId)!.current;
			// A seated valve keeps exactly the same spring. Preserve its buffers and bounds
			// instead of rebuilding and uploading them at every new crank angle.
			if (height === segment.lastHeight) continue;
			segment.lastHeight = height;
			const radius = valve.spring.wireRadiusMm,
				centreRise = height - 2 * radius;
			p.fromArray(valve.correctedPadCenterMm);
			axis.fromArray(valve.axis);
			e.set(-axis.y, axis.x, 0);
			const positions = geometry.getAttribute('position') as THREE.BufferAttribute,
				normals = geometry.getAttribute('normal') as THREE.BufferAttribute;
			for (let j = 0; j <= AXIAL_STEPS; j++) {
				const { cosine: c, sine: s, rise, derivative } = samples[j];
				radial.copy(e).multiplyScalar(c);
				radial.z += s;
				center
					.copy(p)
					.addScaledVector(axis, valve.spring.baseFromPadMm + radius + centreRise * rise)
					.addScaledVector(radial, valve.spring.coilRadiusMm);
				tangent.copy(e).multiplyScalar(-s);
				tangent.z += c;
				tangent
					.multiplyScalar(Math.PI * 2 * valve.spring.turns * valve.spring.coilRadiusMm)
					.addScaledVector(axis, centreRise * derivative)
					.normalize();
				normal2.crossVectors(tangent, radial).normalize();
				for (let k = 0; k < WIRE_STEPS; k++) {
					const wire = WIRE_CIRCLE[k];
					normal.copy(radial).multiplyScalar(wire.cosine).addScaledVector(normal2, wire.sine);
					q.copy(center).addScaledVector(normal, radius);
					const vertex = j * WIRE_STEPS + k;
					setNative(positions, vertex, q);
					normals.setXYZ(vertex, normal.z, normal.y, -normal.x);
				}
			}
			positions.needsUpdate = true;
			normals.needsUpdate = true;
			geometry.computeBoundingBox();
			geometry.computeBoundingSphere();
		}
	}

	getDiagnostics() {
		return {
			...V12_VALVETRAIN_DATUMS.summary,
			source: 'derived contact-corrected teaching rig',
			rigidBodies: this.matrices.size,
			deformingSourceBodies: this.springs.size,
			derivedRetainers: this.attachments.length,
			refinedCamsLoaded: this.refinedCamsLoaded,
			phaseDeg: this.phase,
			geometryBlend: this.geometryBlend,
			disposed: this.disposed
		};
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		for (const spring of this.springs.values()) spring.geometry.dispose();
		for (const geometry of this.replacements.values()) geometry.dispose();
		for (const attachment of this.attachments) attachment.geometry.dispose();
		this.springs.clear();
		this.springHeights.clear();
		this.replacements.clear();
		this.matrices.clear();
		this.attachments.length = 0;
	}
}
