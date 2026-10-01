import * as THREE from 'three';
import { ClippingGroup, PointsNodeMaterial } from 'three/webgpu';
import { ProcessParticles } from './process-particles';
import { v12NativeToDisplay } from '../engine/v12-kinematics';
import { DIRECTED_FLOW_SPEED_MM_S, DIRECTED_FLOW_PITCH_MM } from './directed-flow-volume';

export interface NativeFlowPath {
	positions: Float32Array;
	times: readonly number[];
	duration: number;
	offset: number;
	instanceIndex: number;
	mask: number;
	gainIndex: number;
	/** Network distance at the first native sample; used for continuous downstream phase. */
	distanceOffsetMm?: number;
}
export interface NativeFlowState {
	mask: number;
	gains: readonly number[];
}
// Larger Gaussian parcels overlap into soft flowing density instead of tiny dotted arrows.
// Keep source samples unchanged: only display density, width and traversal pace are illustrative.
export const NATIVE_FLOW_PRESENTATION = {
	parcelSpacingMm: DIRECTED_FLOW_PITCH_MM,
	advectionSpeedMmPerSecond: DIRECTED_FLOW_SPEED_MM_S,
	advectionTimeScale: 1,
	particleSize: 0.24,
	opacity: 0.36
} as const;
const NATIVE_DISPLAY_SCALE = Math.hypot(
	...v12NativeToDisplay([1, 0, 0]).map((value, axis) => value - v12NativeToDisplay([0, 0, 0])[axis])
);

export function nativeFlowPresentationPath(path: NativeFlowPath) {
	const times = [0];
	for (let i = 3; i < path.positions.length; i += 3) {
		const lengthMm =
			Math.hypot(
				path.positions[i] - path.positions[i - 3],
				path.positions[i + 1] - path.positions[i - 2],
				path.positions[i + 2] - path.positions[i - 1]
			) / NATIVE_DISPLAY_SCALE;
		times.push(times[times.length - 1] + lengthMm / DIRECTED_FLOW_SPEED_MM_S);
	}
	const duration = times[times.length - 1];
	const lengthMm = duration * DIRECTED_FLOW_SPEED_MM_S;
	return {
		path,
		times,
		duration,
		lengthMm,
		parcels: Math.max(1, Math.ceil(lengthMm / DIRECTED_FLOW_PITCH_MM))
	};
}

/** Sample the actual offline-integrated polyline; never create smoothing curves across a wall. */
export function sampleNativeFlowPath(
	positions: ArrayLike<number>,
	times: readonly number[],
	seconds: number,
	out: THREE.Vector3
): THREE.Vector3 {
	const last = times.length - 1;
	const time = THREE.MathUtils.clamp(seconds, times[0], times[last]);
	let lo = 0;
	let hi = last;
	while (hi - lo > 1) {
		const mid = (lo + hi) >>> 1;
		if (times[mid] <= time) lo = mid;
		else hi = mid;
	}
	const alpha = (time - times[lo]) / (times[hi] - times[lo]);
	return out.set(
		positions[lo * 3] + alpha * (positions[hi * 3] - positions[lo * 3]),
		positions[lo * 3 + 1] + alpha * (positions[hi * 3 + 1] - positions[lo * 3 + 1]),
		positions[lo * 3 + 2] + alpha * (positions[hi * 3 + 2] - positions[lo * 3 + 2])
	);
}

export function softFlowParticleTexture() {
	const size = 32;
	const data = new Uint8Array(size * size * 4);
	for (let y = 0; y < size; y++) {
		for (let x = 0; x < size; x++) {
			const radius = Math.hypot(
				(x + 0.5 - size / 2) / (size / 2),
				(y + 0.5 - size / 2) / (size / 2)
			);
			const i = (y * size + x) * 4;
			data[i] = data[i + 1] = data[i + 2] = 255;
			data[i + 3] =
				radius >= 1
					? 0
					: Math.round(255 * Math.exp(-2.8 * radius * radius) * (1 - radius * radius));
		}
	}
	const texture = new THREE.DataTexture(data, size, size);
	texture.magFilter = texture.minFilter = THREE.LinearFilter;
	texture.needsUpdate = true;
	return texture;
}

/** Shared one-draw presentation for verified native fluid-domain advection paths. */
export class NativeFlowParticles {
	readonly group = new THREE.Group();
	private readonly parcelClip = new ClippingGroup();
	private readonly geometry = new THREE.BufferGeometry();
	private readonly texture = softFlowParticleTexture();
	private readonly material: PointsNodeMaterial;
	private readonly particles: ProcessParticles;
	private readonly color: THREE.Color;
	private readonly point = new THREE.Vector3();
	private readonly plane = new THREE.Plane();
	private readonly clips = [this.plane];
	private readonly positions: Float32Array;
	private readonly colors: Float32Array;
	private clipping = false;
	private disposed = false;
	private activeParticles = 0;
	private bufferedParticles = 0;
	private lastTime = NaN;
	private readonly lastStates: { mask: number; gains: number[] }[] = [];
	private frameUploads = 0;
	private readonly timeScale: number;
	private readonly presentationPaths: ReturnType<typeof nativeFlowPresentationPath>[];
	constructor(
		paths: readonly NativeFlowPath[],
		options: {
			color: number;
			name: string;
			size?: number;
			opacity?: number;
			blending?: THREE.Blending;
			timeScale?: number;
		}
	) {
		this.group.name = options.name;
		this.presentationPaths = paths.map(nativeFlowPresentationPath);
		this.timeScale = options.timeScale ?? NATIVE_FLOW_PRESENTATION.advectionTimeScale;
		this.group.visible = false;
		this.group.renderOrder = -1;
		this.color = new THREE.Color(options.color);
		this.material = new PointsNodeMaterial({
			size: options.size ?? NATIVE_FLOW_PRESENTATION.particleSize,
			sizeAttenuation: true,
			map: this.texture,
			vertexColors: true,
			transparent: true,
			opacity: options.opacity ?? NATIVE_FLOW_PRESENTATION.opacity,
			blending: options.blending ?? THREE.AdditiveBlending,
			depthTest: true,
			depthWrite: false,
			toneMapped: false
		});
		const count = this.presentationPaths.reduce((sum, path) => sum + path.parcels, 0);
		this.positions = new Float32Array(count * 3);
		// Built-in Three RGBA vertex colors retain the base hue and fade opacity. Multiplying
		// RGB instead would leave opaque black sprites under normal blending at each endpoint.
		this.colors = new Float32Array(count * 4);
		for (let i = 0; i < count; i++) {
			this.colors[i * 4] = this.color.r;
			this.colors[i * 4 + 1] = this.color.g;
			this.colors[i * 4 + 2] = this.color.b;
		}
		this.geometry.setAttribute(
			'position',
			new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage)
		);
		this.geometry.setAttribute(
			'color',
			new THREE.BufferAttribute(this.colors, 4).setUsage(THREE.DynamicDrawUsage)
		);
		const particles = (this.particles = new ProcessParticles(this.geometry, this.material));
		particles.frustumCulled = false;
		particles.renderOrder = -1;
		particles.name = 'Soft native-passage advection';
		this.particles.setCount(0);
		this.parcelClip.add(particles);
		this.group.add(this.parcelClip);
	}
	protected updateParticles(
		timeSeconds: number,
		visible: boolean,
		states: readonly NativeFlowState[],
		clipPlane: THREE.Plane | null
	) {
		if (this.disposed) return;
		this.group.visible = visible;
		if (!visible) {
			this.activeParticles = 0;
			this.particles.setCount(0);
			this.lastTime = NaN;
			return;
		}
		if (!Number.isFinite(timeSeconds)) throw new RangeError('Flow tracer time must be finite.');
		const clipping = clipPlane !== null;
		if (clipPlane) this.plane.copy(clipPlane);
		if (clipping !== this.clipping) {
			this.clipping = clipping;
			this.parcelClip.clippingPlanes = this.clips;
			this.parcelClip.enabled = clipping;
		}
		// Paused frames still accept a moved section plane, but neither resample nor upload buffers.
		const sameState =
			states.length === this.lastStates.length &&
			states.every((state, i) => {
				const previous = this.lastStates[i];
				return (
					state.mask === previous.mask &&
					state.gains.length === previous.gains.length &&
					state.gains.every((gain, j) => gain === previous.gains[j])
				);
			});
		if (timeSeconds === this.lastTime && sameState) return;
		this.lastTime = timeSeconds;
		for (let i = 0; i < states.length; i++) {
			const previous = (this.lastStates[i] ??= { mask: 0, gains: [] });
			previous.mask = states[i].mask;
			for (let j = 0; j < states[i].gains.length; j++) previous.gains[j] = states[i].gains[j];
			previous.gains.length = states[i].gains.length;
		}
		this.lastStates.length = states.length;
		const previousCount = this.bufferedParticles;
		let cursor = 0;
		const displayTime = timeSeconds * this.timeScale;
		for (const presentation of this.presentationPaths) {
			const { path, times, lengthMm, parcels } = presentation;
			const state = states[path.instanceIndex];
			if (!state || state.mask !== path.mask) continue;
			const opening = Math.sqrt(Math.max(0, Math.min(1, state.gains[path.gainIndex] ?? 0)));
			if (opening === 0) continue;
			// Physical spacing replaces eight identical equidistant parcels per short path.
			// That old cadence exceeded 20 Hz even at default playback and could appear to
			// run backwards on a 30 Hz frame stream (the wagon-wheel sampling illusion).
			const periodMm = parcels * DIRECTED_FLOW_PITCH_MM;
			for (let particle = 0; particle < parcels; particle++) {
				const distance =
					displayTime * DIRECTED_FLOW_SPEED_MM_S +
					path.offset * 12 +
					particle * DIRECTED_FLOW_PITCH_MM -
					(path.distanceOffsetMm ?? 0);
				const localMm = ((distance % periodMm) + periodMm) % periodMm;
				if (localMm > lengthMm) continue;
				sampleNativeFlowPath(path.positions, times, localMm / DIRECTED_FLOW_SPEED_MM_S, this.point);
				this.point.toArray(this.positions, cursor);
				const fade = Math.min(1, localMm / 2, (lengthMm - localMm) / 3);
				this.colors[(cursor / 3) * 4 + 3] = opening * fade;
				cursor += 3;
			}
		}
		// Compact only the currently selected mask into the submitted draw range. Clear a retired
		// tail for deterministic seeks; inactive mask variants never reach the vertex shader.
		this.positions.fill(0, cursor, previousCount * 3);
		for (let i = cursor / 3; i < previousCount; i++) this.colors[i * 4 + 3] = 0;
		this.activeParticles = cursor / 3;
		this.bufferedParticles = this.activeParticles;
		this.particles.setCount(this.activeParticles);
		for (const attribute of [this.geometry.attributes.position, this.geometry.attributes.color]) {
			const buffer = attribute as THREE.BufferAttribute;
			buffer.clearUpdateRanges();
			buffer.addUpdateRange(0, Math.max(this.activeParticles, previousCount) * buffer.itemSize);
			buffer.needsUpdate = true;
		}
		this.frameUploads++;
	}
	getDiagnostics() {
		return {
			paths: this.presentationPaths.length,
			allocatedParticles: this.positions.length / 3,
			activeParticles: this.activeParticles,
			drawObjects: this.group.children.length,
			submittedParticles: this.geometry.drawRange.count,
			frameUploads: this.frameUploads,
			presentation: {
				...NATIVE_FLOW_PRESENTATION,
				advectionTimeScale: this.timeScale,
				particleSize: this.material.size,
				opacity: this.material.opacity
			}
		};
	}
	dispose() {
		if (this.disposed) return;
		this.disposed = true;
		this.activeParticles = 0;
		this.particles.setCount(0);
		this.group.visible = false;
		this.group.clear();
		this.particles.dispose();
		this.geometry.dispose();
		this.material.dispose();
		this.texture.dispose();
	}
}
