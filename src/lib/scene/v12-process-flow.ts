import * as THREE from 'three';
import { V12IntakeFlow } from './v12-intake-flow';
import { V12ExhaustFlow } from './v12-exhaust-flow';
import { V12ChamberDomain, V12_CHAMBER_DATUMS } from './v12-chamber-domain';
import { V12ChamberVolume } from './v12-chamber-volume';
import { v12SprayParcelAtCycle, V12_SPRAY_ASSUMPTIONS } from '../engine/v12-spray';
import { V12_PROCESS_SCOPE, v12ProcessCycle } from '../engine/v12-process-cycle';
import { getV12SprayImpactAge } from '../engine/v12-spray-impact';
import { V12ConnectedFlow } from './v12-connected-flow';
import { V12_GAS_CONNECTIONS } from '../engine/v12-gas-connections';
import { v12NativeToDisplay } from '../engine/v12-kinematics';
import { V12_FUEL_CONNECTIONS } from '../engine/v12-fuel-connections';
import { V12CombustionGlow } from './v12-combustion-glow';
import { V12FlowClock } from './v12-flow-clock';

export interface V12ProcessFlowState {
	phase: number;
	driveAngle?: number;
	running: boolean;
	elapsedSeconds?: number;
	flows: readonly string[];
	visible: boolean;
	interiorVisible?: boolean;
	clipPlane: THREE.Plane | null;
}
const PER_JET = 80;
const PARCELS = PER_JET * V12_SPRAY_ASSUMPTIONS.nozzleHoles;
function dropletTexture() {
	const size = 32,
		data = new Uint8Array(size * size * 4);
	for (let y = 0; y < size; y++)
		for (let x = 0; x < size; x++) {
			const r = Math.hypot((x + 0.5 - size / 2) / (size / 2), (y + 0.5 - size / 2) / (size / 2)),
				at = (y * size + x) * 4;
			data[at] = data[at + 1] = data[at + 2] = 255;
			data[at + 3] = r < 1 ? Math.round(255 * Math.exp(-6 * r * r) * (1 - r * r)) : 0;
		}
	const texture = new THREE.DataTexture(data, size, size);
	texture.minFilter = texture.magFilter = THREE.LinearFilter;
	texture.needsUpdate = true;
	return texture;
}

/** Source-contained field tracers, reduced fuel parcels and bounded ray-marched optical envelopes. */
export class V12ProcessFlow {
	readonly group = new THREE.Group();
	private readonly glow = new V12CombustionGlow();
	private readonly flowClock = new V12FlowClock();
	// Separate from the process meshes: hiding overlays must not change the scene's light count.
	readonly illumination = this.glow.group;
	private readonly intake = new V12IntakeFlow();
	private readonly exhaust = new V12ExhaustFlow();
	private readonly connections = new V12ConnectedFlow();
	get boundaryLabels() {
		return this.connections.labels;
	}
	private readonly domains: V12ChamberDomain[];
	private readonly volumes: V12ChamberVolume[];
	private readonly geometry = new THREE.BufferGeometry();
	private readonly texture = dropletTexture();
	private readonly material = new THREE.PointsMaterial({
		size: 0.014,
		sizeAttenuation: true,
		map: this.texture,
		vertexColors: true,
		transparent: true,
		opacity: 0.82,
		depthWrite: false,
		depthTest: true,
		blending: THREE.AdditiveBlending,
		toneMapped: false
	});
	private readonly positions = new Float32Array(V12_CHAMBER_DATUMS.cylinders.length * PARCELS * 3);
	private readonly colors = new Float32Array(this.positions.length);
	private readonly point = new THREE.Vector3();
	private readonly color = new THREE.Color(0xd7d5b8);
	private readonly clips: THREE.Plane[] = [];
	private readonly depthMaterial = new THREE.MeshBasicMaterial({
		colorWrite: false,
		side: THREE.DoubleSide
	});
	private depthSources: THREE.Mesh[] = [];
	private depthTarget: THREE.WebGLRenderTarget | null = null;
	private readonly drawingSize = new THREE.Vector2();
	private phase = 0;
	private channels: string[] = [];
	private particles = 0;
	private rejected = 0;
	private disposed = false;
	private warming = false;
	private lastUpdateKey = '';
	private lastDepthStateKey = '';
	private depthValid = false;
	private readonly depthCameraWorld = new THREE.Matrix4();
	private readonly depthProjection = new THREE.Matrix4();
	private readonly depthMaterials: (THREE.Material | THREE.Material[])[] = [];
	private readonly hiddenDepthObjects: THREE.Object3D[] = [];
	private depthPasses = 0;

	static async load(): Promise<V12ProcessFlow> {
		const response = await fetch(V12_CHAMBER_DATUMS.binaryUrl);
		if (!response.ok) throw new Error(`Chamber domains could not be loaded (${response.status}).`);
		const data = new Float32Array(await response.arrayBuffer());
		if (data.length !== V12_CHAMBER_DATUMS.floats || data.some((v) => !Number.isFinite(v)))
			throw new Error('Invalid chamber domain data');
		return new V12ProcessFlow(data);
	}
	constructor(data: Float32Array) {
		this.group.name = 'Engine process study';
		this.group.renderOrder = -1;
		this.group.visible = false;
		this.group.userData.scope = V12_PROCESS_SCOPE;
		this.domains = V12_CHAMBER_DATUMS.cylinders.map((_, i) => new V12ChamberDomain(i, data));
		this.volumes = this.domains.map((domain) => new V12ChamberVolume(domain));
		this.geometry.setAttribute(
			'position',
			new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage)
		);
		this.geometry.setAttribute(
			'color',
			new THREE.BufferAttribute(this.colors, 3).setUsage(THREE.DynamicDrawUsage)
		);
		const points = new THREE.Points(this.geometry, this.material);
		points.frustumCulled = false;
		points.name = 'Reduced liquid-fuel parcels';
		this.group.add(
			this.intake.group,
			this.exhaust.group,
			this.connections.group,
			points,
			...this.volumes.map((v) => v.mesh)
		);
	}
	setDepthSources(meshes: THREE.Mesh[]) {
		this.depthSources = meshes;
		this.depthValid = false;
	}

	getCylinderStudyBounds(pistonId: string): THREE.Box3 | null {
		const domain = this.domains.find((d) => d.datum.pistonId === pistonId);
		const bounds = domain
			? new THREE.Box3(
					new THREE.Vector3(-48, 145, -48),
					new THREE.Vector3(48, 240, 48)
				).applyMatrix4(domain.toWorld)
			: null;
		const connections = V12_GAS_CONNECTIONS.find((c) => c.pistonId === pistonId);
		if (bounds && connections) {
			for (const port of [connections.intake, connections.exhaust])
				for (const path of port.paths)
					for (const point of path.pathMm)
						bounds.expandByPoint(new THREE.Vector3(...v12NativeToDisplay(point)));
		}
		if (bounds) {
			for (const point of V12_FUEL_CONNECTIONS.find((c) => c.pistonId === pistonId)?.pointsMm ?? [])
				bounds.expandByPoint(new THREE.Vector3(...v12NativeToDisplay(point)));
		}
		return bounds;
	}
	getCylinderStudyDirection(pistonId: string): THREE.Vector3 {
		const domain = this.domains.find((d) => d.datum.pistonId === pistonId);
		return new THREE.Vector3(
			(domain?.datum.originMm[2] ?? 310) < 310 ? -0.45 : 0.45,
			0.28,
			domain?.datum.bank === 'positiveX' ? -1 : 1
		).normalize();
	}

	/** Compile the bounded volume and depth variants while the engine loading screen is still visible. */
	async warmup(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
		this.warming = true;
		const visible = this.group.visible;
		const depthScene = new THREE.Scene();
		const geometry = new THREE.BoxGeometry(1, 1, 1);
		const proxy = new THREE.Mesh(geometry, this.depthMaterial);
		proxy.frustumCulled = false;
		depthScene.add(proxy);
		const originalPlanes = this.depthMaterial.clippingPlanes;
		this.group.visible = true;
		for (const volume of this.volumes) volume.mesh.visible = true;
		const connectionVisibility = this.connections.group.children.map((mesh) => mesh.visible);
		for (const mesh of this.connections.group.children) mesh.visible = true;
		const restoreExhaust = this.exhaust.warmupVisibility();
		try {
			await renderer.compileAsync(scene, camera);
			for (const planes of [null, [new THREE.Plane(new THREE.Vector3(1, 0, 0), 0)]]) {
				this.depthMaterial.clippingPlanes = planes;
				this.depthMaterial.needsUpdate = true;
				await renderer.compileAsync(depthScene, camera);
			}
		} finally {
			restoreExhaust();
			this.depthMaterial.clippingPlanes = originalPlanes;
			this.depthMaterial.needsUpdate = true;
			geometry.dispose();
			depthScene.clear();
			this.group.visible = visible;
			for (const volume of this.volumes) volume.mesh.visible = false;
			this.connections.group.children.forEach((mesh, i) => {
				mesh.visible = connectionVisibility[i];
			});
			this.warming = false;
		}
	}
	update(state: V12ProcessFlowState) {
		if (this.disposed || this.warming) return;
		if (!Number.isFinite(state.phase) || !Number.isFinite(state.driveAngle ?? state.phase))
			throw new RangeError('Finite process clock required');
		const updateKey = [
			state.phase,
			state.driveAngle,
			state.visible,
			state.interiorVisible,
			state.flows.join(','),
			...(state.clipPlane?.normal.toArray() ?? []),
			state.clipPlane?.constant
		].join('|');
		if (this.lastUpdateKey === updateKey) return;
		this.lastUpdateKey = updateKey;
		const depthStateKey = [
			state.phase,
			...(state.clipPlane?.normal.toArray() ?? []),
			state.clipPlane?.constant
		].join('|');
		if (depthStateKey !== this.lastDepthStateKey) this.depthValid = false;
		this.lastDepthStateKey = depthStateKey;
		this.phase = state.phase;
		const flowSeconds = this.flowClock.update(
			state.driveAngle ?? state.phase,
			state.running,
			state.elapsedSeconds
		);
		this.channels = state.flows.filter((id) =>
			['air', 'fuel', 'exhaust', 'combustion'].includes(id)
		);
		this.group.visible = state.visible && this.channels.length > 0;
		this.particles = 0;
		this.rejected = 0;
		if (!this.group.visible) {
			this.glow.update(this.volumes, false, state.clipPlane);
			return;
		}
		// Travel time is deliberately slowed for inspecting the solved steady passage field.
		this.intake.update(flowSeconds, state.flows.includes('air'), state.clipPlane, state.phase);
		this.exhaust.update(flowSeconds, state.flows.includes('exhaust'), state.clipPlane, state.phase);
		this.connections.update(
			state.phase,
			state.driveAngle ?? state.phase,
			state.flows,
			state.interiorVisible !== false,
			state.clipPlane,
			flowSeconds
		);
		const clipping = !!state.clipPlane;
		if (clipping !== this.clips.length > 0) this.material.needsUpdate = true;
		this.clips.length = 0;
		if (state.clipPlane) this.clips.push(state.clipPlane);
		this.material.clippingPlanes = clipping ? this.clips : null;
		if (clipping !== !!this.depthMaterial.clippingPlanes?.length)
			this.depthMaterial.needsUpdate = true;
		this.depthMaterial.clippingPlanes = clipping ? this.clips : null;
		const fuel = state.flows.includes('fuel'),
			burn = state.flows.includes('combustion');
		for (let cylinderIndex = 0; cylinderIndex < this.domains.length; cylinderIndex++) {
			const domain = this.domains[cylinderIndex];
			domain.update(state.phase);
			this.volumes[cylinderIndex].update(
				state.phase,
				fuel,
				burn,
				state.clipPlane,
				state.flows.includes('air'),
				state.flows.includes('exhaust'),
				flowSeconds
			);
			if (state.interiorVisible === false) this.volumes[cylinderIndex].mesh.visible = false;
			if (!fuel) continue;
			const cycleAngle = v12ProcessCycle(domain.cylinder, state.phase).cycleDeg;
			const injectionAngle = cycleAngle > 540 ? cycleAngle - 720 : cycleAngle;
			if (injectionAngle < -14 || injectionAngle > 32) continue;
			for (let index = 0; index < PARCELS; index++) {
				const parcel = v12SprayParcelAtCycle(cycleAngle, index, PER_JET);
				if (!parcel) continue;
				const firstImpact = getV12SprayImpactAge(domain.datum.pistonId, index);
				if (firstImpact !== null && parcel.ageSeconds >= firstImpact) {
					this.rejected++;
					continue;
				}
				const [dx, dy, dz] = parcel.direction,
					tip = domain.datum.nozzleAxialMm - 0.18;
				let confined = true;
				// Retire at first wall contact; do not teleport through a piston/valve or pretend wall-film physics.
				for (let d = Math.min(0.2, parcel.distanceMm); d <= parcel.distanceMm + 0.5; d += 0.5) {
					const length = Math.min(d, parcel.distanceMm);
					if (!domain.contains(dx * length, tip + dy * length, dz * length)) {
						confined = false;
						break;
					}
				}
				if (!confined) {
					this.rejected++;
					continue;
				}
				this.point
					.set(dx * parcel.distanceMm, tip + dy * parcel.distanceMm, dz * parcel.distanceMm)
					.applyMatrix4(domain.toWorld);
				const at = this.particles++ * 3,
					weight = parcel.weight * Math.sqrt(parcel.liquidMassFraction);
				this.positions[at] = this.point.x;
				this.positions[at + 1] = this.point.y;
				this.positions[at + 2] = this.point.z;
				this.colors[at] = this.color.r * weight;
				this.colors[at + 1] = this.color.g * weight;
				this.colors[at + 2] = this.color.b * weight;
			}
		}
		this.glow.update(this.volumes, burn && state.interiorVisible !== false, state.clipPlane);
		this.geometry.setDrawRange(0, this.particles);
		this.geometry.getAttribute('position').needsUpdate = true;
		this.geometry.getAttribute('color').needsUpdate = true;
	}

	/** Exact opaque/section depth for volume integration. Ghost shells intentionally do not occlude inspection. */
	prepareDepth(
		renderer: THREE.WebGLRenderer,
		scene: THREE.Scene,
		camera: THREE.Camera,
		ghosts: readonly THREE.Object3D[],
		sceneChanged = true
	) {
		if (
			this.warming ||
			!this.group.visible ||
			(!this.volumes.some((v) => v.mesh.visible) &&
				!this.connections.needsDepth &&
				!this.exhaust.needsDepth)
		)
			return;
		renderer.getDrawingBufferSize(this.drawingSize);
		const width = this.drawingSize.x,
			height = this.drawingSize.y;
		if (!this.depthTarget) {
			const texture = new THREE.DepthTexture(width, height, THREE.UnsignedInt248Type);
			texture.format = THREE.DepthStencilFormat;
			this.depthTarget = new THREE.WebGLRenderTarget(width, height, {
				depthTexture: texture,
				stencilBuffer: true,
				depthBuffer: true
			});
		}
		if (this.depthTarget.width !== width || this.depthTarget.height !== height) {
			this.depthTarget.setSize(width, height);
			this.depthValid = false;
		}
		camera.updateMatrixWorld();
		if (
			this.depthValid &&
			!sceneChanged &&
			this.depthCameraWorld.equals(camera.matrixWorld) &&
			this.depthProjection.equals(camera.projectionMatrix)
		)
			return;
		const target = renderer.getRenderTarget(),
			shadow = renderer.shadowMap.needsUpdate;
		const hidden = this.hiddenDepthObjects;
		hidden.length = 0;
		for (const object of ghosts) if (object.visible) hidden.push(object);
		const materials = this.depthMaterials;
		materials.length = this.depthSources.length;
		this.depthSources.forEach((mesh, index) => {
			materials[index] = mesh.material;
		});
		this.group.visible = false;
		for (const object of hidden) object.visible = false;
		for (const mesh of this.depthSources) mesh.material = this.depthMaterial;
		try {
			renderer.shadowMap.needsUpdate = false;
			renderer.setRenderTarget(this.depthTarget);
			renderer.render(scene, camera);
		} finally {
			renderer.setRenderTarget(target);
			renderer.shadowMap.needsUpdate = shadow;
			this.group.visible = true;
			for (const object of hidden) object.visible = true;
			this.depthSources.forEach((mesh, index) => {
				mesh.material = materials[index];
			});
		}
		for (const volume of this.volumes)
			volume.setDepth(this.depthTarget.depthTexture!, width, height);
		this.connections.setDepth(this.depthTarget.depthTexture!, width, height);
		this.exhaust.setDepth(this.depthTarget.depthTexture!, width, height);
		this.depthCameraWorld.copy(camera.matrixWorld);
		this.depthProjection.copy(camera.projectionMatrix);
		this.depthValid = true;
		this.depthPasses++;
	}
	getDiagnostics() {
		return {
			scope: V12_PROCESS_SCOPE,
			phase: this.phase,
			opticalTimeSeconds: this.flowClock.seconds,
			visible: this.group.visible,
			cylinders: this.domains.length,
			channels: this.channels,
			intake: this.intake.getDiagnostics(),
			exhaust: this.exhaust.getDiagnostics(),
			connections: this.connections.getDiagnostics(),
			liquidParcels: this.group.visible ? this.particles : 0,
			retiredAtWall: this.rejected,
			depthPasses: this.depthPasses,
			activeVolumes: this.group.visible ? this.volumes.filter((v) => v.mesh.visible).length : 0,
			combustionGlow: this.glow.getDiagnostics(),
			spray: V12_SPRAY_ASSUMPTIONS,
			volume:
				'Ray-marched illustrative mixing/heat-release envelope; not spatial temperature or reacting CFD',
			disposed: this.disposed
		};
	}
	dispose() {
		if (this.disposed) return;
		this.disposed = true;
		this.group.visible = false;
		this.group.removeFromParent();
		this.intake.dispose();
		this.exhaust.dispose();
		this.connections.dispose();
		this.glow.dispose();
		this.volumes.forEach((v) => v.dispose());
		this.domains.forEach((d) => d.dispose());
		this.geometry.dispose();
		this.material.dispose();
		this.depthMaterial.dispose();
		this.texture.dispose();
		this.depthTarget?.dispose();
		this.group.clear();
	}
}
