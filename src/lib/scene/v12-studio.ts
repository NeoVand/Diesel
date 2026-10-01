import { fetchEngineAsset, engineAssetUrl } from '../engine/local-assets';
import * as THREE from 'three';
import { WebGPURenderer, PMREMGenerator, ClippingGroup } from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
	createStudioEnvironment,
	createStrictWebGPURenderer,
	initializeWebGPURenderer
} from './studio-environment';
import { WebGPUSectionCaps } from './webgpu-section-caps';
import { sectionGuidePolygon } from './v12-section-guide';
import { sectionCoordinates, sectionProjection } from './v12-section-coordinates';
import { perspectiveFitDistance } from './v12-camera-fit';
import { visibleAtlasLabels, type LabelCandidate } from './v12-label-layout';
import { V12FlowLabels } from './v12-flow-labels';
import {
	SceneTransition,
	TrackingTransition,
	transitionEase,
	transitionDirection
} from './v12-transition';
import {
	createV12Atlas,
	createV12Explosion,
	type V12Atlas,
	type V12LayoutPart
} from './v12-layout';
import { V12RunningRig } from './v12-running-rig';
import { V12PlaybackClock } from './v12-playback-clock';
import { V12ProcessFlow } from './v12-process-flow';
import { processContextOpacity } from './v12-process-context';
import { V12RenderQuality } from './v12-render-quality';
import { V12MaterialPool, applyPooledFinish } from './v12-material-pool';
import { applyV12Opacity } from './v12-opacity';
import { AutoOrbitMotion, CanvasSelectionGesture } from './v12-interaction';
import { applyV12Material, restoreV12MaterialDetail } from './v12-materials';
import type { AtlasPreviewAsset } from './atlas-preview-renderer';
import { engineDefinition, v12Components, v12PartMetadata } from '$lib/engine/definition';
import {
	initialLabState,
	type ComponentRecord,
	type LabState,
	type LabCamera,
	type LabView
} from '$lib/engine/lab-state';

export type EngineView = LabView;
export type SceneStats = {
	parts: number;
	triangles: number;
	renderer: string;
	educationalParts: number;
};
export type SceneSnapshot = { phase: number; driveAngle: number; camera: LabCamera };
interface Component extends V12LayoutPart {
	object: THREE.Object3D;
	meshes: THREE.Mesh[];
	offset: THREE.Vector3;
	removal: number;
	removalTransition: SceneTransition;
	opacity: SceneTransition;
	baseMaterials: Map<THREE.Mesh, THREE.Material | THREE.Material[]>;
}
const BACKGROUND = 0x10161c;
const IDENTITY = new THREE.Matrix4();
const FLOW_ROLES: Record<string, string[]> = {
	air: ['intake'],
	exhaust: ['exhaust'],
	fuel: ['fuel'],
	coolant: ['cooling'],
	oil: ['sump', 'bearings']
};
const FLOW_COLORS: Record<string, number> = {
	air: 0x4ec4df,
	exhaust: 0xee804f,
	fuel: 0xe9b758,
	coolant: 0x689dec,
	oil: 0xba965d
};

/** Purchased V12 studio. All presentations use the same actual component matrices. */
export class EngineStudio {
	private scene = new THREE.Scene();
	private perspective = new THREE.PerspectiveCamera(35, 1, 0.025, 2000);
	private camera = this.perspective;
	private renderer: WebGPURenderer;
	private rendererReady = false;
	private sourceClip = new ClippingGroup();
	private readonly renderQuality: V12RenderQuality;
	private controls: OrbitControls;
	private environment: THREE.RenderTarget | null = null;
	private floor: THREE.Mesh;
	private key: THREE.DirectionalLight;
	private components = new Map<string, Component>();
	private sourceRoot: THREE.Object3D | null = null;
	private sourceBounds = new THREE.Box3();
	private atlas: V12Atlas | null = null;
	private runningRig = new V12RunningRig();
	private replacedSourceGeometry = new Set<THREE.BufferGeometry>();
	private processFlow: V12ProcessFlow | null = null;
	private caps = new WebGPUSectionCaps();
	private plane = new THREE.Plane();
	private guide: THREE.LineSegments;
	private sectionActive = false;
	private sectionTransition = new SceneTransition();
	private state: LabState = {
		...initialLabState,
		flows: [],
		hidden: [],
		removed: [],
		section: { ...initialLabState.section }
	};
	private explosion = 0;
	private layout = 0;
	private explosionTransition = new TrackingTransition();
	private layoutTransition = new SceneTransition();
	private phase = 0;
	private clock = new V12PlaybackClock();
	private frame = 0;
	private lastTime = 0;
	private lastReport = 0;
	private loaded = false;
	private disposed = false;
	private transitionPending = false;
	private shadowDirty = true;
	private materialStateDirty = true;
	private transformDirty = true;
	private cameraGoal: {
		fromTarget: THREE.Vector3;
		target: THREE.Vector3;
		fromDirection: THREE.Vector3;
		direction: THREE.Vector3;
		fromHeight: number;
		height: number;
		fromFov: number;
		fov: number;
		transition: SceneTransition;
		tracking: boolean;
	} | null = null;
	private explosionCamera: LabCamera | null = null;
	private returnCamera: LabCamera | null = null;
	private observer: ResizeObserver;
	private selectionGesture = new CanvasSelectionGesture();
	private autoOrbit = new AutoOrbitMotion();
	private raycaster = new THREE.Raycaster();
	private width = 1;
	private height = 1;
	private floorY = -3;
	private reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
	private abort = new AbortController();
	private selectedMaterials: THREE.Material[] = [];
	private initializedMaterials = new Set<THREE.Material>();
	private materialPool = new V12MaterialPool();
	private pooledMaterials = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
	private temporary = new THREE.Vector3();
	private offsetMatrix = new THREE.Matrix4();
	private hoverLabel: HTMLDivElement;
	private flowLabels: V12FlowLabels;
	private flowBoundaryOverview = true;
	private hoverTimer: ReturnType<typeof setTimeout> | null = null;
	private dragging = false;
	private atlasLabels: {
		element: HTMLButtonElement;
		anchor: THREE.Vector3;
		bounds: THREE.Box3;
		width: number;
	}[] = [];
	private atlasPanels = new THREE.Group();
	private atlasLabelsVisible = true;
	private atlasPreviewPromise: Promise<Record<string, string>> | null = null;
	private lastRenderMilliseconds = 0;
	private renderCount = 0;
	private visibilityHandler = () => {
		this.lastTime = 0;
		if (!document.hidden) this.invalidate();
	};

	constructor(
		private host: HTMLDivElement,
		private onselect: (id: string | null) => void,
		private onphase: (phase: number) => void = () => {},
		private oninteraction: () => void = () => {},
		private onisolate: (id: string) => void = () => {}
	) {
		this.renderQuality = new V12RenderQuality(devicePixelRatio);
		this.renderer = createStrictWebGPURenderer({
			antialias: true,
			stencil: true,
			powerPreference: 'high-performance'
		});
		this.renderer.setPixelRatio(this.renderQuality.pixelRatio);
		this.renderer.outputColorSpace = THREE.SRGBColorSpace;
		this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
		this.renderer.toneMappingExposure = 1.05;
		this.renderer.info.autoReset = false;
		this.renderer.shadowMap.enabled = true;
		this.renderer.shadowMap.type = THREE.PCFShadowMap;
		this.renderer.domElement.style.cssText =
			'display:block;width:100%;height:100%;touch-action:none;';
		this.renderer.domElement.setAttribute(
			'aria-label',
			'V12 diesel engine studio. Drag to orbit, scroll to zoom, and double-click a component to isolate.'
		);
		host.append(this.renderer.domElement);
		this.hoverLabel = document.createElement('div');
		this.hoverLabel.style.cssText =
			'position:absolute;z-index:7;display:none;pointer-events:none;padding:7px 10px;border:1px solid #ffffff20;border-radius:6px;background:#0a0e14ed;color:#e9edf2;font-size:12px;line-height:1.4;box-shadow:0 4px 20px #0006;';
		host.append(this.hoverLabel);
		this.flowLabels = new V12FlowLabels(host);
		this.scene.background = new THREE.Color(BACKGROUND);
		this.scene.fog = new THREE.Fog(BACKGROUND, 28, 75);
		this.scene.add(new THREE.HemisphereLight(0xc4d3e5, 0x343945, 1.0));
		this.key = new THREE.DirectionalLight(0xffeddb, 2.8);
		this.key.position.set(-8, 13, 9);
		this.key.castShadow = true;
		this.key.shadow.autoUpdate = false;
		this.key.shadow.mapSize.set(2048, 2048);
		this.key.shadow.bias = -0.00003;
		this.key.shadow.normalBias = 0.008;
		this.key.shadow.radius = 3;
		this.key.shadow.blurSamples = 4;
		this.key.shadow.intensity = 0.65;
		Object.assign(this.key.shadow.camera, {
			left: -7,
			right: 7,
			top: 7,
			bottom: -7,
			near: 0.5,
			far: 60
		});
		this.scene.add(this.key, this.key.target);
		const fill = new THREE.DirectionalLight(0xb8d0ed, 1.75);
		fill.position.set(9, 5, -5);
		this.scene.add(fill);
		const rim = new THREE.DirectionalLight(0xe1e9f4, 2.1);
		rim.position.set(-2, 9, -10);
		this.scene.add(rim);
		// Broad reflected fill keeps the crankcase readable when inspected from below.
		const underside = new THREE.DirectionalLight(0xc0ccdc, 0.65);
		underside.position.set(-3, -7, 5);
		this.scene.add(underside);
		this.floor = new THREE.Mesh(
			new THREE.PlaneGeometry(240, 240),
			new THREE.ShadowMaterial({ color: 0x000000, opacity: 0.22, depthWrite: false })
		);
		this.floor.rotation.x = -Math.PI / 2;
		this.floor.receiveShadow = true;
		this.scene.add(this.floor);
		this.guide = new THREE.LineSegments(
			new THREE.BufferGeometry(),
			new THREE.LineBasicMaterial({
				color: 0xc9a365,
				transparent: true,
				opacity: 0.58,
				depthWrite: false
			})
		);
		this.guide.visible = false;
		this.sourceClip.clipShadows = true;
		this.scene.add(this.sourceClip, this.guide, this.caps.group, this.atlasPanels);
		this.perspective.position.set(8, 4.2, 9);
		this.controls = new OrbitControls(this.camera, this.renderer.domElement);
		this.controls.enableDamping = true;
		this.controls.dampingFactor = 0.085;
		this.controls.minDistance = 0.2;
		this.controls.maxDistance = 1500;
		this.controls.maxPolarAngle = Math.PI * 0.93;
		this.controls.addEventListener('change', this.invalidate);
		this.controls.addEventListener('start', this.interaction);
		this.renderer.domElement.addEventListener('pointerdown', this.pointerDown);
		this.renderer.domElement.addEventListener('pointerup', this.pointerUp);
		this.renderer.domElement.addEventListener('pointercancel', this.pointerCancel);
		this.renderer.domElement.addEventListener('dblclick', this.doubleClick);
		this.renderer.domElement.addEventListener('pointermove', this.pointerMove);
		this.renderer.domElement.addEventListener('pointerleave', this.hideHover);
		this.observer = new ResizeObserver(this.resize);
		this.observer.observe(host);
		document.addEventListener('visibilitychange', this.visibilityHandler);
		this.resize();
	}

	async load(
		onprogress: (percent: number) => void,
		oncomponents: (registry: ComponentRecord[]) => void = () => {}
	): Promise<SceneStats> {
		await initializeWebGPURenderer(this.renderer);
		if (this.disposed) throw new Error('Scene closed');
		const studio = createStudioEnvironment();
		const pmrem = new PMREMGenerator(this.renderer);
		this.environment = pmrem.fromScene(studio.scene, 0.055);
		this.scene.environment = this.environment.texture;
		this.scene.environmentIntensity = 0.9;
		studio.dispose();
		pmrem.dispose();
		this.rendererReady = true;
		const response = await fetchEngineAsset(engineDefinition.modelUrl, {
			signal: this.abort.signal
		});
		if (!response.ok)
			throw new Error(`The purchased V12 asset could not be loaded (${response.status}).`);
		const total = Number(response.headers.get('content-length'));
		const chunks: Uint8Array[] = [];
		let length = 0;
		if (response.body) {
			const reader = response.body.getReader();
			for (;;) {
				const r = await reader.read();
				if (r.done) break;
				chunks.push(r.value);
				length += r.value.length;
				onprogress(total ? Math.round((length / total) * 85) : 5);
			}
		} else {
			const b = new Uint8Array(await response.arrayBuffer());
			chunks.push(b);
			length = b.length;
		}
		const bytes = new Uint8Array(length);
		let cursor = 0;
		for (const chunk of chunks) {
			bytes.set(chunk, cursor);
			cursor += chunk.length;
		}
		await this.runningRig.loadGeometry();
		const gltf = await new GLTFLoader()
			.setMeshoptDecoder(MeshoptDecoder)
			.parseAsync(bytes.buffer, engineAssetUrl('/models/'));
		if (this.disposed) {
			this.disposeGraph(gltf.scene);
			throw new Error('Scene closed');
		}
		this.sourceRoot = gltf.scene;
		this.sourceClip.add(gltf.scene);
		gltf.scene.updateMatrixWorld(true);
		const registry = new Map(v12Components.map((r) => [r.id, r]));
		let triangles = 0;
		for (const attachment of this.runningRig.getAttachments()) {
			const parent = gltf.scene.getObjectByName(attachment.parentId);
			if (!parent) throw new Error(`Missing retainer parent ${attachment.parentId}`);
			const retainer = new THREE.Mesh(
				attachment.geometry,
				new THREE.MeshStandardMaterial({
					color: 0x929ca5,
					metalness: 0.82,
					roughness: 0.26
				})
			);
			retainer.name = attachment.id;
			retainer.userData.derived = attachment.provenance;
			parent.add(retainer);
		}
		for (const object of gltf.scene.children) {
			const record = registry.get(object.name),
				metadata = v12PartMetadata.get(object.name);
			if (!record || !metadata) throw new Error(`Unregistered source component ${object.name}.`);
			const meshes: THREE.Mesh[] = [];
			const baseMaterials = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
			object.traverse((child) => {
				if (!(child instanceof THREE.Mesh)) return;
				if (!child.userData.derived) {
					const replacement = this.runningRig.prepareGeometry(object.name, child.geometry);
					if (replacement) {
						this.replacedSourceGeometry.add(child.geometry);
						child.geometry = replacement;
					}
				}
				meshes.push(child);
				child.userData.componentId = object.name;
				child.castShadow =
					!['fasteners', 'valvetrain', 'timing'].includes(metadata.role) && !metadata.decorative;
				child.receiveShadow = true;
				// Each source occurrence owns opacity independently; shared imported materials do not.
				child.material = Array.isArray(child.material)
					? child.material.map((material) => material.clone())
					: child.material.clone();
				baseMaterials.set(child, child.material);
				for (const material of Array.isArray(child.material) ? child.material : [child.material]) {
					if (this.initializedMaterials.has(material)) continue;
					this.initializedMaterials.add(material);
					if (material instanceof THREE.MeshStandardMaterial) {
						material.envMapIntensity = 0.95;
						material.roughness = Math.max(0.25, material.roughness);
						material.clipShadows = true;
					}
					if (material instanceof THREE.MeshPhysicalMaterial && !child.geometry.getAttribute('uv'))
						material.anisotropy = 0;
					applyV12Material(material, metadata);
				}
				this.pooledMaterials.set(child, this.materialPool.materials(child.material));
				triangles +=
					(child.geometry.index?.count ?? child.geometry.getAttribute('position').count) / 3;
			});
			const bounds = new THREE.Box3().setFromObject(object);
			object.matrixAutoUpdate = false;
			this.components.set(object.name, {
				id: object.name,
				parent: record.parent,
				role: metadata.role,
				path: metadata.sourcePath,
				decorative: metadata.decorative,
				bounds,
				object,
				meshes,
				baseMaterials,
				offset: new THREE.Vector3(),
				removal: 0,
				removalTransition: new SceneTransition(),
				opacity: new SceneTransition(metadata.decorative ? 0 : 1)
			});
			if (!metadata.decorative) this.sourceBounds.union(bounds);
		}
		if (this.components.size !== engineDefinition.sourceCount)
			throw new Error('The V12 source component inventory does not match the model.');
		const center = this.sourceBounds.getCenter(new THREE.Vector3());
		this.floorY = this.sourceBounds.min.y - 0.18;
		const explosion = createV12Explosion([...this.components.values()], center, this.floorY);
		for (const part of this.components.values())
			part.offset.copy(explosion.get(part.id) ?? new THREE.Vector3());
		this.floor.position.y = this.floorY;
		this.atlas = createV12Atlas([...this.components.values()], this.floorY);
		this.createAtlasLabels();
		this.processFlow = await V12ProcessFlow.load();
		if (this.disposed) {
			this.processFlow.dispose();
			throw new Error('Scene closed');
		}
		this.scene.add(this.processFlow.group, this.processFlow.illumination);
		this.processFlow.setDepthSources([...this.components.values()].flatMap((p) => p.meshes));
		this.loaded = true;
		this.clock.seek(this.state.phase, this.state.driveAngle);
		this.phase = this.clock.phase;
		this.explosionTransition.retarget(this.state.explosion, 0);
		this.layoutTransition.retarget(this.state.display === 'layout' ? 1 : 0, 0);
		this.explosion = this.explosionTransition.value;
		this.layout = this.layoutTransition.value;
		if (this.layout) this.scene.fog = null;
		this.sectionTransition.retarget(
			this.state.display === 'section' || this.state.display === 'cylinder' ? 1 : 0,
			0
		);
		this.refreshVisibility();
		this.refreshMaterials();
		this.evaluateTransforms();
		this.refreshSection();
		this.fit(false);
		onprogress(95);
		// Compile the clipped material variants before the first section animation.
		// Compilation is asynchronous; keep the temporary plane out of the live frame.
		this.rendererReady = false;
		try {
			await this.processFlow.warmup(this.renderer, this.scene, this.camera);
			const warmupPlane = new THREE.Plane(new THREE.Vector3(-1, 0, 0), center.x);
			this.sourceClip.clippingPlanes = [warmupPlane];
			this.caps.update(
				[...this.components.values()]
					.filter((part) => !part.decorative)
					.flatMap((part) => part.meshes),
				[warmupPlane]
			);
			await this.renderer.compileAsync(this.scene, this.camera);
		} finally {
			this.refreshSection();
			this.updateCaps();
			this.rendererReady = !this.disposed;
		}
		if (this.disposed) throw new Error('Scene closed');
		this.invalidate();
		oncomponents(v12Components.map((r) => ({ ...r })));
		onprogress(100);
		return {
			parts: engineDefinition.mechanicalDisplayCount,
			triangles: Math.round(triangles),
			educationalParts: this.runningRig.getAttachments().length,
			renderer: 'WebGPU · purchased V12 · physical component transforms'
		};
	}

	update(next: LabState): void {
		if (this.disposed) return;
		const previous = this.state;
		this.transformDirty ||=
			next.seekToken !== previous.seekToken ||
			next.explosion !== previous.explosion ||
			next.display !== previous.display ||
			next.removed.join() !== previous.removed.join();
		this.state = {
			...next,
			section: { ...next.section },
			flows: [...next.flows],
			hidden: [...next.hidden],
			removed: [...next.removed]
		};
		if (next.seekToken !== previous.seekToken || !this.loaded) {
			this.clock.seek(next.phase, next.driveAngle);
			this.phase = this.clock.phase;
		}
		if (next.running !== previous.running) {
			this.lastTime = 0;
			if (!next.running) {
				// Report the exact stopped pose immediately; the live10Hz readout may lag the last frame.
				this.onphase(this.phase);
				this.lastReport = performance.now();
			}
		}
		if (!this.loaded) return;
		const duration = this.reducedMotion ? 0 : 1.35;
		this.explosionTransition.retarget(next.explosion, this.reducedMotion ? 0 : 0.2);
		this.layoutTransition.retarget(
			next.display === 'layout' ? 1 : 0,
			this.reducedMotion ? 0 : 1.85
		);
		this.sectionTransition.retarget(
			next.display === 'section' || next.display === 'cylinder' ? 1 : 0,
			duration
		);
		for (const part of this.components.values())
			part.removalTransition.retarget(
				next.removed.some((id) => this.matches(part, id)) ? 1 : 0,
				duration
			);
		if (next.display === 'layout' && previous.display !== 'layout') {
			this.scene.fog = null;
			this.returnCamera = this.intendedCamera();
			this.controls.enableRotate = true;
			this.fit(true, null, false, false, undefined, true);
		} else if (next.display !== 'layout' && previous.display === 'layout') {
			this.controls.enableRotate = true;
			if (this.returnCamera) this.animateCamera(this.returnCamera, 35);
			this.returnCamera = null;
		}
		if (next.explosion !== previous.explosion && next.display !== 'layout') {
			if (previous.explosion === 0 && next.explosion > 0)
				this.explosionCamera = this.intendedCamera();
			if (next.explosion === 0 && this.explosionCamera) {
				this.animateCamera(this.explosionCamera, 35, true);
				this.explosionCamera = null;
			} else this.fit(true, null, true, true);
		}
		this.refreshVisibility();
		if (next.selected !== previous.selected || next.flows.join() !== previous.flows.join())
			this.refreshMaterials();
		this.refreshSection();
		if (
			next.camera &&
			(next.resetSignal !== previous.resetSignal ||
				!previous.camera ||
				next.camera.position.some((v, i) => v !== previous.camera!.position[i]) ||
				next.camera.target.some((v, i) => v !== previous.camera!.target[i]) ||
				next.camera.zoom !== previous.camera.zoom)
		)
			this.animateCamera(next.camera, 35);
		else if (
			next.resetSignal !== previous.resetSignal ||
			next.focusToken !== previous.focusToken ||
			next.view !== previous.view ||
			next.isolated !== previous.isolated
		) {
			const canonicalView =
				next.view !== previous.view ||
				(next.resetSignal !== previous.resetSignal &&
					next.focusToken !== previous.focusToken &&
					!next.camera &&
					!next.focused);
			this.fit(
				true,
				next.isolated
					? next.selected
					: next.focusToken !== previous.focusToken
						? next.focused
						: null,
				!canonicalView &&
					!(
						next.focusToken !== previous.focusToken &&
						next.focused &&
						next.display === 'mechanism' &&
						next.flows.length > 0
					),
				// Reset/Fit can arrive before the returning parts reach their assembled
				// matrices. Frame the destination, not the temporary exploded envelope.
				next.explosion !== previous.explosion ||
					(previous.display === 'layout' && next.display !== 'layout') ||
					this.explosionTransition.active ||
					this.layoutTransition.active,
				undefined,
				canonicalView
			);
		}
		this.transitionPending = true;
		this.invalidate();
	}

	private createAtlasLabels() {
		if (!this.atlas) return;
		for (const group of this.atlas.groups) {
			const element = document.createElement('button');
			element.type = 'button';
			const shortNames: Record<string, string> = {
				crank: 'Crankshaft',
				rods: 'Rods',
				liners: 'Liners',
				'seats-guides': 'Seats & guides',
				camshafts: 'Camshafts',
				'valves-tappets': 'Valves & tappets',
				springs: 'Springs',
				covers: 'Covers',
				chains: 'Chains',
				sprockets: 'Sprockets',
				tensioners: 'Tensioners',
				intake: 'Air intake',
				'turbo-rotors': 'Turbo rotors',
				'turbo-housings': 'Turbo housings',
				exhaust: 'Exhaust',
				fuel: 'Injection',
				cooling: 'Cooling',
				unclassified: 'Unclassified'
			};
			const title = shortNames[group.id] ?? group.title;
			element.textContent = title;
			element.title = `${group.title} · ${group.count} source parts · Click to focus`;
			element.setAttribute('aria-label', `Focus ${group.title}`);
			element.style.cssText =
				'position:absolute;left:0;top:0;z-index:3;display:none;text-align:left;background:none;border:0;border-left:1px solid #8d9cac90;border-radius:0;color:#d8e0e8;font-family:inherit;font-size:12px;font-weight:500;line-height:18px;height:22px;padding:2px 6px;white-space:nowrap;cursor:pointer;text-shadow:0 1px 3px #10161c,0 0 6px #10161c;transform-origin:top left;';
			element.addEventListener('click', () => {
				this.oninteraction();
				this.fit(true, null, false, false, group.panelBounds);
			});
			this.host.append(element);
			this.atlasLabels.push({
				element,
				anchor: group.labelAnchor.clone(),
				bounds: group.panelBounds,
				width: title.length * 6.3 + 13
			});
			const box = group.panelBounds;
			const y = this.floorY + 0.028;
			const points = [
				new THREE.Vector3(box.min.x, y, box.min.z),
				new THREE.Vector3(box.max.x, y, box.min.z),
				new THREE.Vector3(box.max.x, y, box.max.z),
				new THREE.Vector3(box.min.x, y, box.max.z),
				new THREE.Vector3(box.min.x, y, box.min.z)
			];
			const line = new THREE.Line(
				new THREE.BufferGeometry().setFromPoints(points),
				new THREE.LineBasicMaterial({
					color: 0x65758b,
					transparent: true,
					opacity: 0,
					depthWrite: false
				})
			);
			this.atlasPanels.add(line);
		}
	}
	private positionAtlasLabels() {
		const opacity = transitionEase((this.layout - 0.45) / 0.55);
		const shown = this.atlasLabelsVisible && opacity > 0.005 && !this.state.isolated;
		this.atlasPanels.visible = shown;
		for (const child of this.atlasPanels.children)
			((child as THREE.Line).material as THREE.LineBasicMaterial).opacity = opacity * 0.24;
		const candidates: LabelCandidate[] = [];
		const style = getComputedStyle(this.host);
		const top = Number.parseFloat(style.getPropertyValue('--engine-fit-top')) || 62;
		const bottom = Number.parseFloat(style.getPropertyValue('--engine-fit-bottom')) || 144;
		for (const [id, label] of this.atlasLabels.entries()) {
			label.element.style.display = 'none';
			if (!shown) continue;
			const projected = label.anchor.clone().project(this.camera);
			const right = label.anchor.clone().setX(label.bounds.max.x).project(this.camera);
			const projectedWidth = Math.hypot(
				((right.x - projected.x) * this.width) / 2,
				((right.y - projected.y) * this.height) / 2
			);
			// Readable labels appear only once the family's projected size can accommodate them.
			if (projected.z < -1 || projected.z > 1 || projectedWidth < label.width + 12) continue;
			const x = ((projected.x + 1) * this.width) / 2;
			const y = ((1 - projected.y) * this.height) / 2 - 24;
			candidates.push({ id, x, y, width: label.width, height: 22, priority: projectedWidth });
		}
		const visible = visibleAtlasLabels(candidates, {
			width: this.width,
			height: this.height,
			top,
			bottom
		});
		for (const candidate of candidates) {
			if (!visible.has(candidate.id)) continue;
			const element = this.atlasLabels[candidate.id].element;
			element.style.display = 'block';
			element.style.opacity = String(opacity);
			element.style.pointerEvents = opacity > 0.9 ? 'auto' : 'none';
			element.style.width = `${candidate.width}px`;
			element.style.transform = `translate(${candidate.x}px,${candidate.y}px)`;
		}
	}
	private matches(part: Component, id: string | null): boolean {
		return id !== null && (part.id === id || part.parent === id);
	}
	private partVisible(part: Component): boolean {
		if (part.decorative && !this.matches(part, this.state.selected)) return false;
		if (this.state.hidden.some((id) => this.matches(part, id))) return false;
		if (this.state.isolated) return this.matches(part, this.state.selected);
		if (this.state.display === 'layout' || this.state.display === 'xray') return true;
		const reveal = this.state.reveal;
		const selected = this.matches(part, this.state.selected);
		if (selected) return true;
		if (reveal === 'covers')
			return (
				part.role !== 'covers' &&
				!(part.role === 'fasteners' && /cam cap|belt cap/i.test(part.path))
			);
		if (reveal === 'rotating')
			return [
				'piston',
				'rod',
				'crankshaft',
				'bearings',
				'flywheel',
				'camshaft',
				'valvetrain',
				'timing',
				'fuel'
			].includes(part.role);
		if (reveal === 'valvetrain')
			return (
				!['covers', 'intake', 'fuel'].includes(part.role) &&
				!(part.role === 'fasteners' && /cam cap|belt cap/i.test(part.path))
			);
		return true;
	}
	private refreshVisibility() {
		const innerRoles = [
			'piston',
			'rod',
			'crankshaft',
			'camshaft',
			'valvetrain',
			'timing',
			'bearings',
			'flywheel'
		];
		for (const part of this.components.values()) {
			let opacity = this.partVisible(part) ? 1 : 0;
			const context = processContextOpacity(part.role, this.state, part.id);
			if (context !== null && !this.matches(part, this.state.selected)) opacity = context;
			if (
				opacity &&
				this.state.display === 'xray' &&
				!this.state.isolated &&
				!this.matches(part, this.state.selected) &&
				!innerRoles.includes(part.role)
			)
				opacity = 0.12;
			part.opacity.retarget(opacity, this.reducedMotion ? 0 : 1.15);
		}
		this.shadowDirty = true;
	}
	private applyOpacity(part: Component) {
		const opacity = part.opacity.value;
		part.object.visible = opacity > 0.003;
		for (const mesh of part.meshes) {
			applyPooledFinish(
				mesh,
				part.baseMaterials.get(mesh)!,
				this.pooledMaterials.get(mesh)!,
				opacity
			);
			applyV12Opacity(
				mesh,
				opacity,
				!['fasteners', 'valvetrain', 'timing'].includes(part.role) && !part.decorative
			);
		}
	}
	private refreshMaterials() {
		this.materialStateDirty = true;
		for (const part of this.components.values())
			for (const [mesh, material] of part.baseMaterials) mesh.material = material;
		for (const material of this.selectedMaterials) material.dispose();
		this.selectedMaterials = [];
		for (const part of this.components.values()) {
			const selected = this.matches(part, this.state.selected);
			const flow = this.state.flows.find(
				(id) =>
					FLOW_ROLES[id]?.includes(part.role) &&
					(id !== 'fuel' || part.id === 'v12-0775' || part.id === 'v12-0776')
			);
			if (!selected && !flow) continue;
			for (const [mesh, base] of part.baseMaterials) {
				const materials = (Array.isArray(base) ? base : [base]).map((material) => {
					const clone = material.clone();
					restoreV12MaterialDetail(clone);
					if (clone instanceof THREE.MeshStandardMaterial) {
						clone.emissive.set(selected ? 0x77a8d8 : FLOW_COLORS[flow!]);
						clone.emissiveIntensity = selected
							? 0.15
							: flow === 'coolant' || flow === 'oil'
								? 0.2
								: 0.07;
					}
					this.selectedMaterials.push(clone);
					return clone;
				});
				mesh.material = Array.isArray(base) ? materials : materials[0];
			}
		}
	}
	private evaluateTransforms() {
		this.transformDirty = false;
		const disassembly = Math.max(this.layout, this.explosion);
		const motion = this.runningRig.matricesForPhase(this.clock.driveAngle, disassembly);
		for (const part of this.components.values()) {
			const offset = this.temporary.copy(part.offset).multiplyScalar(this.explosion);
			if (part.removal > 0) {
				if (part.offset.lengthSq() > 0.01) offset.addScaledVector(part.offset, part.removal * 1.3);
				else offset.add(new THREE.Vector3(0, 2, -6).multiplyScalar(part.removal));
			}
			const atlas = this.atlas?.offsets.get(part.id);
			if (atlas && this.layout > 0) {
				offset.lerp(atlas, this.layout);
				offset.addScaledVector(part.offset, Math.sin(this.layout * Math.PI) * 0.32);
			}
			part.object.matrix.copy(motion.get(part.id) ?? IDENTITY);
			this.offsetMatrix.makeTranslation(offset.x, offset.y, offset.z);
			part.object.matrix.premultiply(this.offsetMatrix);
			part.object.matrixWorldNeedsUpdate = true;
		}
		this.sourceRoot?.updateMatrixWorld(true);
		if (this.layout === 0 && !this.scene.fog) this.scene.fog = new THREE.Fog(BACKGROUND, 28, 75);
	}
	getSectionCoordinates(section: LabState['section'] = this.state.section) {
		return this.sourceBounds.isEmpty() ? null : sectionCoordinates(this.sourceBounds, section);
	}

	private refreshSection() {
		this.sectionActive = this.sectionTransition.value > 0.00001 && this.layout < 0.001;
		const section = this.state.section;
		const {
			normal: axis,
			min,
			max,
			coordinate: cut
		} = sectionProjection(this.sourceBounds, section);
		const outside = section.flipped ? min - 0.05 : max + 0.05;
		const coordinate = THREE.MathUtils.lerp(outside, cut, this.sectionTransition.value);
		const sign = section.flipped ? 1 : -1;
		this.plane.normal.copy(axis).multiplyScalar(sign);
		this.plane.constant = -coordinate * sign;
		this.sourceClip.clippingPlanes = this.sectionActive ? [this.plane] : [];
		this.guide.visible = this.sectionActive && section.visible;
		if (this.guide.visible) {
			const polygon = sectionGuidePolygon(this.sourceBounds, this.plane);
			this.guide.geometry.dispose();
			this.guide.geometry = new THREE.BufferGeometry().setFromPoints(
				polygon.flatMap((point, index) => [point, polygon[(index + 1) % polygon.length]])
			);
			this.guide.visible = polygon.length >= 3;
		}
		this.shadowDirty = true;
	}
	private updateCaps() {
		this.caps.update(
			this.sectionActive
				? [...this.components.values()]
						.filter((p) => p.object.visible && p.opacity.value > 0.95)
						.flatMap((p) => p.meshes)
				: [],
			this.sectionActive ? [this.plane] : []
		);
	}
	private visibleBounds(focus: string | null = null, targetAtlas = false): THREE.Box3 {
		if (targetAtlas && !focus && this.atlas) return this.atlas.bounds.clone();
		const box = new THREE.Box3();
		for (const part of this.components.values())
			if (part.object.visible && (!focus || this.matches(part, focus)))
				box.union(part.bounds.clone().applyMatrix4(part.object.matrix));
		return box;
	}
	private fit(
		animate: boolean,
		focus: string | null = null,
		preserveDirection = false,
		targetTransforms = false,
		specifiedBounds?: THREE.Box3,
		canonicalView = false
	) {
		if (!this.loaded) return;
		const layout = this.state.display === 'layout';
		this.flowBoundaryOverview = !focus;
		const studyBounds =
			focus && this.state.flows.length && this.state.display === 'mechanism'
				? this.processFlow?.getCylinderStudyBounds(focus)
				: null;
		specifiedBounds ??= studyBounds ?? undefined;
		const boxes = specifiedBounds
			? [specifiedBounds]
			: layout && !focus && this.atlas
				? this.atlas.groups.map((group) => group.panelBounds)
				: [...this.components.values()]
						.filter((part) => this.partVisible(part) && (!focus || this.matches(part, focus)))
						.map((part) => {
							if (!targetTransforms) return part.bounds.clone().applyMatrix4(part.object.matrix);
							const offset = part.offset.clone().multiplyScalar(this.state.explosion);
							return part.bounds.clone().translate(offset);
						});
		const box = boxes.reduce((all, box) => all.union(box), new THREE.Box3());
		if (box.isEmpty()) return;
		const center = box.getCenter(new THREE.Vector3());
		const style = getComputedStyle(this.host);
		const top = Number.parseFloat(style.getPropertyValue('--engine-fit-top')) || 110;
		const bottom =
			(Number.parseFloat(style.getPropertyValue('--engine-fit-bottom')) || 144) + (layout ? 40 : 0);
		const horizontalReserve =
			(Number.parseFloat(style.getPropertyValue('--engine-fit-right')) || 0) +
			(Number.parseFloat(style.getPropertyValue('--engine-fit-left')) || 0);
		const usableY = Math.max(0.35, (this.height - top - bottom) / this.height);
		const usableX = Math.max(0.35, (this.width - horizontalReserve) / this.width);
		const direction = new THREE.Vector3(1.05, 0.7, 1.25).normalize();
		if (studyBounds && focus && !preserveDirection) {
			direction.copy(this.processFlow!.getCylinderStudyDirection(focus));
		} else if (canonicalView || (!animate && !preserveDirection)) {
			if (layout) direction.set(0.3, 1, 0.8).normalize();
			else if (this.state.view === 'front') direction.set(1, 0.05, 0).normalize();
			else if (this.state.view === 'side') direction.set(0, 0.1, 1).normalize();
			else if (this.state.view === 'top') direction.set(0, 1, 0.001).normalize();
		} else if (preserveDirection && this.cameraGoal) direction.copy(this.cameraGoal.direction);
		else if (this.controls.target.distanceToSquared(this.camera.position) > 0.01)
			direction.copy(this.camera.position).sub(this.controls.target).normalize();
		const fov = 35;
		const up =
			Math.abs(direction.y) > 0.9999 ? new THREE.Vector3(0, 0, -1) : new THREE.Vector3(0, 1, 0);
		const right = new THREE.Vector3().crossVectors(up, direction).normalize();
		up.crossVectors(direction, right).normalize();
		const tangent = Math.tan(THREE.MathUtils.degToRad(fov / 2));
		const distance =
			perspectiveFitDistance(
				boxes,
				center,
				direction,
				fov,
				this.perspective.aspect,
				usableX,
				usableY
			) * 1.065;
		center.addScaledVector(up, ((top - bottom) / this.height) * distance * tangent);
		const position = center.clone().addScaledVector(direction, distance);
		const snapshot: LabCamera = { position: position.toArray(), target: center.toArray(), zoom: 1 };
		if (animate && !this.reducedMotion) this.animateCamera(snapshot, fov, targetTransforms);
		else {
			this.camera.fov = fov;
			this.camera.updateProjectionMatrix();
			this.restoreCamera(snapshot);
		}
		this.invalidate();
	}
	/** New presentations inherit the destination view, never an in-flight return pose. */
	private intendedCamera(): LabCamera {
		if (!this.cameraGoal) return this.getSnapshot().camera;
		const goal = this.cameraGoal;
		const distance = goal.height / Math.tan(THREE.MathUtils.degToRad(goal.fov / 2));
		return {
			position: goal.target.clone().addScaledVector(goal.direction, distance).toArray(),
			target: goal.target.toArray(),
			zoom: 1
		};
	}
	private animateCamera(snapshot: LabCamera, fov: number, tracking = false) {
		if (this.reducedMotion) {
			this.camera.fov = fov;
			this.restoreCamera(snapshot);
			return;
		}
		const fromDirection = this.camera.position.clone().sub(this.controls.target);
		const target = new THREE.Vector3().fromArray(snapshot.target);
		const direction = new THREE.Vector3().fromArray(snapshot.position).sub(target);
		const transition = new SceneTransition();
		transition.retarget(1, this.state.display === 'layout' || this.layout > 0 ? 1.85 : 1.35);
		this.cameraGoal = {
			fromTarget: this.controls.target.clone(),
			target,
			fromDirection: fromDirection.clone().normalize(),
			direction: direction.clone().normalize(),
			fromHeight:
				(fromDirection.length() * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2))) /
				this.camera.zoom,
			height:
				(direction.length() * Math.tan(THREE.MathUtils.degToRad(fov / 2))) / (snapshot.zoom ?? 1),
			fromFov: this.camera.fov,
			fov,
			tracking,
			transition
		};
		this.camera.zoom = 1;
		this.invalidate();
	}
	/** Share immutable source geometry with an independent, disposable material tree. */
	createAtlasPreviewAsset(categoryId: string): AtlasPreviewAsset | null {
		const atlas = this.atlas;
		const category = atlas?.groups.find((group) => group.id === categoryId);
		if (!this.loaded || this.disposed || !atlas || !category) return null;
		const group = new THREE.Group();
		const materials: THREE.Material[] = [];
		for (const id of category.componentIds) {
			const source = this.components.get(id)!;
			const object = source.object.clone(true);
			object.visible = true;
			object.matrix.makeTranslation(atlas.offsets.get(id)!);
			object.matrixWorldNeedsUpdate = true;
			let meshIndex = 0;
			object.traverse((child) => {
				if (!(child instanceof THREE.Mesh)) return;
				child.visible = true;
				child.castShadow = false;
				child.receiveShadow = false;
				child.customDepthMaterial = undefined;
				const original = source.baseMaterials.get(source.meshes[meshIndex++])!;
				const local = (Array.isArray(original) ? original : [original]).map((base) => {
					const material = base.clone();
					restoreV12MaterialDetail(material);
					material.opacity = 1;
					material.transparent = false;
					material.depthWrite = true;
					material.clippingPlanes = null;
					materials.push(material);
					return material;
				});
				child.material = Array.isArray(original) ? local : local[0];
			});
			group.add(object);
		}
		group.updateMatrixWorld(true);
		let disposed = false;
		return {
			object: group,
			bounds: category.bounds.clone(),
			dispose: () => {
				if (disposed) return;
				disposed = true;
				for (const material of materials) material.dispose();
			}
		};
	}
	/** Preview only: no main scene objects, component matrices or materials are changed. */
	getAtlasPreviews(): Promise<Record<string, string>> {
		if (!this.loaded || !this.atlas)
			return Promise.reject(new Error('The engine studio is still loading.'));
		this.atlasPreviewPromise ??= this.renderAtlasPreviews().catch((cause) => {
			this.atlasPreviewPromise = null;
			throw cause;
		});
		return this.atlasPreviewPromise;
	}
	focusAtlasCategory(id: string): boolean {
		const category = this.atlas?.groups.find((group) => group.id === id);
		if (!category || !this.loaded || this.state.display !== 'layout') return false;
		this.oninteraction();
		this.fit(true, null, false, false, category.bounds);
		return true;
	}
	setAtlasLabelsVisible(visible: boolean): void {
		this.atlasLabelsVisible = visible;
		this.positionAtlasLabels();
	}
	private async renderAtlasPreviews(): Promise<Record<string, string>> {
		const atlas = this.atlas!;
		const width = 640,
			height = 420;
		const previewScene = new THREE.Scene();
		previewScene.background = new THREE.Color(BACKGROUND);
		previewScene.environment = this.scene.environment;
		previewScene.environmentIntensity = this.scene.environmentIntensity;
		for (const object of this.scene.children) {
			if (!(object instanceof THREE.Light)) continue;
			const light = object.clone();
			light.castShadow = false;
			previewScene.add(light);
			if (light instanceof THREE.DirectionalLight) previewScene.add(light.target);
		}
		const camera = new THREE.PerspectiveCamera(30, width / height, 0.025, 1000);
		const target = new THREE.RenderTarget(width, height, {
			format: THREE.RGBAFormat,
			type: THREE.UnsignedByteType,
			colorSpace: THREE.SRGBColorSpace,
			samples: 4,
			depthBuffer: true,
			stencilBuffer: false
		});
		const canvas = document.createElement('canvas');
		canvas.width = width;
		canvas.height = height;
		const context = canvas.getContext('2d');
		if (!context) {
			target.dispose();
			throw new Error('Atlas previews need a 2D canvas context.');
		}
		const image = context.createImageData(width, height);
		const results: Record<string, string> = {};
		try {
			for (const category of atlas.groups) {
				if (this.disposed) throw new Error('Scene closed');
				const asset = this.createAtlasPreviewAsset(category.id)!;
				const group = asset.object;
				previewScene.add(group);
				previewScene.updateMatrixWorld(true);
				const boxes = category.componentIds.map((id) =>
					this.components.get(id)!.bounds.clone().translate(atlas.offsets.get(id)!)
				);
				const center = category.bounds.getCenter(new THREE.Vector3());
				const direction = new THREE.Vector3(0.32, 1, 0.5).normalize();
				const distance = perspectiveFitDistance(
					boxes,
					center,
					direction,
					camera.fov,
					camera.aspect,
					0.9,
					0.85
				);
				camera.position.copy(center).addScaledVector(direction, distance * 1.04);
				camera.lookAt(center);
				camera.updateMatrixWorld(true);
				const previousTarget = this.renderer.getRenderTarget();
				const shadowUpdate = this.key.shadow.needsUpdate;
				try {
					// setRenderTarget installs its physical-pixel viewport. setViewport would
					// multiply these dimensions by the live canvas DPR and crop the preview.
					this.renderer.setRenderTarget(target);
					this.renderer.render(previewScene, camera);
					// GPU readback yields to the event loop. Restore the live target before
					// that await so a running engine frame cannot render into this thumbnail.
					this.renderer.setRenderTarget(previousTarget);
					const pixels = await this.renderer.readRenderTargetPixelsAsync(
						target,
						0,
						0,
						width,
						height
					);
					for (let y = 0; y < height; y++)
						image.data.set(pixels.subarray(y * width * 4, (y + 1) * width * 4), y * width * 4);
					context.putImageData(image, 0, 0);
					results[category.id] = canvas.toDataURL('image/png');
				} finally {
					this.renderer.setRenderTarget(previousTarget);
					this.key.shadow.needsUpdate = shadowUpdate;
					previewScene.remove(group);
					asset.dispose();
				}
				// Let the live canvas and controls paint between independent category renders.
				await new Promise<void>((resolve) => setTimeout(resolve, 0));
			}
		} finally {
			target.dispose();
		}
		return results;
	}
	getSnapshot(): SceneSnapshot {
		return {
			phase: this.phase,
			driveAngle: this.clock.driveAngle,
			camera: {
				position: this.camera.position.toArray() as [number, number, number],
				target: this.controls.target.toArray() as [number, number, number],
				zoom: this.camera.zoom
			}
		};
	}
	restoreCamera(snapshot: LabCamera) {
		this.controls.enableDamping = false;
		this.controls.update(0);
		this.cameraGoal = null;
		this.camera.zoom = snapshot.zoom ?? 1;
		this.camera.updateProjectionMatrix();
		this.camera.position.fromArray(snapshot.position);
		this.controls.target.fromArray(snapshot.target);
		this.controls.update(0);
		this.controls.enableDamping = true;
		this.invalidate();
	}
	setAutoOrbit(enabled: boolean): void {
		if (this.autoOrbit.setEnabled(enabled)) this.invalidate();
	}
	getDiagnostics() {
		const casing = [...this.components.values()].find((part) => part.role === 'block');
		return {
			autoOrbit: this.autoOrbit.enabled,
			autoOrbitActive: this.autoOrbit.active && !this.dragging && !this.cameraGoal && this.loaded,
			autoOrbitPaused: this.dragging || !!this.cameraGoal,
			casingOpacity: casing?.opacity.value ?? null,
			casingShadowCoverage: casing?.meshes[0]?.customDepthMaterial?.opacity ?? null,
			selected: this.state.selected,
			processes: this.processFlow?.getDiagnostics() ?? null,
			processContext: [...this.components.values()]
				.filter((part) => processContextOpacity(part.role, this.state, part.id) !== null)
				.map((part) => ({ id: part.id, role: part.role, opacity: part.opacity.value })),
			pixelRatio: this.renderer.getPixelRatio(),
			maximumPixelRatio: this.renderQuality.maximumPixelRatio,
			sharedOpaqueFinishes: this.materialPool.size,
			motion: this.runningRig.getDiagnostics(),
			assetId: engineDefinition.assetId,
			componentCount: this.components.size,
			visibleCount: [...this.components.values()].filter((p) => p.object.visible).length,
			phase: this.phase,
			driveAngle: this.clock.driveAngle,
			explosion: this.explosion,
			explosionTarget: this.explosionTransition.target,
			layout: this.layout,
			display: this.state.display,
			transitioning: this.transitionPending,
			fov: this.camera.fov,
			translucentCount: [...this.components.values()].filter(
				(part) => part.opacity.value > 0.003 && part.opacity.value < 0.999
			).length,
			camera: this.getSnapshot().camera,
			floor: this.floor.position.toArray(),
			light: this.key.position.toArray(),
			section: {
				active: this.sectionActive,
				normal: this.plane.normal.toArray(),
				constant: this.plane.constant,
				cappedComponents: this.caps.report.size
			},
			renderMilliseconds: this.lastRenderMilliseconds,
			frames: this.renderCount,
			drawCalls: this.renderer.info.render.drawCalls,
			renderingBackend: 'webgpu',
			triangles: this.renderer.info.render.triangles,
			unitScale: [...this.components.values()].every(
				(p) => Math.abs(p.object.matrix.determinant() - 1) < 1e-6
			),
			atlasGroups: this.atlas?.groups.map((g) => ({ parent: g.parent, count: g.count }))
		};
	}
	async settle(signal?: AbortSignal): Promise<void> {
		this.invalidate();
		await new Promise<void>((resolve, reject) => {
			const start = performance.now();
			const check = () => {
				if (signal?.aborted)
					return reject(signal.reason ?? new DOMException('Cancelled', 'AbortError'));
				if (this.disposed) return reject(new Error('Scene closed'));
				if (!this.transitionPending && !this.cameraGoal) return resolve();
				if (performance.now() - start > 15000)
					return reject(new Error('Scene transition did not settle'));
				requestAnimationFrame(check);
			};
			requestAnimationFrame(check);
		});
	}
	private interaction = () => {
		this.cameraGoal = null;
		this.oninteraction();
		this.invalidate();
	};
	private invalidate = () => {
		if (!this.disposed && !this.frame) this.frame = requestAnimationFrame(this.render);
	};
	private render = (now: number) => {
		this.frame = 0;
		if (this.disposed || document.hidden || !this.rendererReady) return;
		const elapsed = this.lastTime ? Math.min((now - this.lastTime) / 1000, 0.08) : 1 / 60;
		this.lastTime = now;
		const previousExplosion = this.explosion;
		const previousLayout = this.layout;
		this.explosion = this.explosionTransition.advance(elapsed);
		this.layout = this.layoutTransition.advance(elapsed);
		this.transformDirty ||= this.explosion !== previousExplosion || this.layout !== previousLayout;
		const previousSection = this.sectionTransition.value;
		this.sectionTransition.advance(elapsed);
		let moving =
			this.explosionTransition.active ||
			this.layoutTransition.active ||
			this.sectionTransition.active ||
			previousSection !== this.sectionTransition.value;
		for (const part of this.components.values()) {
			const previousOpacity = part.opacity.value;
			const previousRemoval = part.removal;
			part.removal = part.removalTransition.advance(elapsed);
			this.transformDirty ||= previousRemoval !== part.removal;
			part.opacity.advance(elapsed);
			moving ||=
				part.removalTransition.active ||
				part.opacity.active ||
				previousRemoval !== part.removal ||
				previousOpacity !== part.opacity.value;
			if (this.materialStateDirty || previousOpacity !== part.opacity.value)
				this.applyOpacity(part);
		}
		this.materialStateDirty = false;
		const running =
			this.state.running &&
			this.state.display !== 'layout' &&
			this.layout === 0 &&
			this.explosion < 0.001 &&
			this.state.removed.length === 0 &&
			[...this.components.values()].every((p) => p.removal === 0);
		if (running) {
			this.clock.advance(elapsed, 1800 * this.state.playback);
			this.phase = this.clock.phase;
		}
		const depthSceneChanged = running || moving || this.shadowDirty || this.transformDirty;
		if (this.loaded) {
			if (running || moving || this.transformDirty) this.evaluateTransforms();
			if (
				previousSection !== this.sectionTransition.value ||
				this.sectionActive !== (this.sectionTransition.value > 0.00001 && this.layout < 0.001)
			)
				this.refreshSection();
			this.updateCaps();
			this.processFlow?.update({
				phase: this.phase,
				driveAngle: this.clock.driveAngle,
				interiorVisible: this.state.display !== 'assembly',
				running,
				elapsedSeconds: elapsed,
				flows: this.state.flows,
				visible:
					this.state.display !== 'layout' &&
					this.layout === 0 &&
					this.state.explosion === 0 &&
					this.explosion === 0 &&
					!this.state.isolated &&
					this.state.removed.length === 0 &&
					this.state.hidden.length === 0 &&
					[...this.components.values()].every((part) => part.removal === 0),
				clipPlane: this.sectionActive ? this.plane : null
			});
		}
		if (this.cameraGoal) {
			const goal = this.cameraGoal;
			if (goal.tracking) {
				goal.fromTarget.copy(this.controls.target);
				goal.fromDirection.copy(this.camera.position).sub(this.controls.target).normalize();
				goal.fromHeight =
					this.camera.position.distanceTo(this.controls.target) *
					Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
				goal.fromFov = this.camera.fov;
			}
			const amount = goal.tracking
				? 1 - Math.exp(-elapsed / 0.085)
				: goal.transition.advance(elapsed);
			this.camera.fov = THREE.MathUtils.lerp(goal.fromFov, goal.fov, amount);
			this.controls.target.lerpVectors(goal.fromTarget, goal.target, amount);
			const direction = transitionDirection(goal.fromDirection, goal.direction, amount);
			const height = THREE.MathUtils.lerp(goal.fromHeight, goal.height, amount);
			const distance = height / Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
			this.camera.position.copy(this.controls.target).addScaledVector(direction, distance);
			this.camera.updateProjectionMatrix();
			if (
				goal.tracking
					? Math.abs(height - goal.height) < 0.0001 &&
						this.controls.target.distanceToSquared(goal.target) < 1e-8 &&
						direction.distanceToSquared(goal.direction) < 1e-8
					: !goal.transition.active
			)
				this.cameraGoal = null;
		}
		const autoAngle = this.autoOrbit.advance(
			elapsed,
			this.dragging || !!this.cameraGoal || !this.loaded
		);
		if (autoAngle) {
			this.temporary.copy(this.camera.position).sub(this.controls.target);
			this.temporary.applyAxisAngle(new THREE.Vector3(0, 1, 0), -autoAngle);
			this.camera.position.copy(this.controls.target).add(this.temporary);
		}
		const orbit = this.controls.update(elapsed);
		const pixelRatio = this.renderQuality.update(
			elapsed * 1000,
			running || moving || !!this.cameraGoal || orbit || autoAngle !== 0
		);
		if (pixelRatio !== this.renderer.getPixelRatio()) this.renderer.setPixelRatio(pixelRatio);
		if (this.shadowDirty || moving || running) {
			this.key.shadow.needsUpdate = true;
			this.shadowDirty = false;
		}
		const start = performance.now();
		this.renderer.info.reset();
		this.processFlow?.prepareDepth(
			this.renderer,
			this.scene,
			this.camera,
			[...this.components.values()].filter((p) => p.opacity.value < 0.95).map((p) => p.object),
			depthSceneChanged
		);
		this.renderer.render(this.scene, this.camera);
		this.positionAtlasLabels();
		this.flowLabels.update(
			this.processFlow?.boundaryLabels ?? [],
			this.camera,
			this.width,
			this.height,
			this.state.display === 'mechanism' &&
				this.flowBoundaryOverview &&
				!!this.processFlow?.group.visible
		);
		this.lastRenderMilliseconds = performance.now() - start;
		this.renderCount++;
		this.transitionPending = moving || !!this.cameraGoal || (orbit && autoAngle === 0);
		if (now - this.lastReport > 100) {
			this.onphase(this.phase);
			this.lastReport = now;
		}
		if (this.transitionPending || running || (this.autoOrbit.active && !this.dragging))
			this.invalidate();
		else this.lastTime = 0;
	};
	private resize = () => {
		if (this.disposed) return;
		const previousAspect = this.width / this.height;
		this.width = Math.max(1, this.host.clientWidth);
		this.height = Math.max(1, this.host.clientHeight);
		this.perspective.aspect = this.width / this.height;
		this.perspective.updateProjectionMatrix();
		this.renderer.setSize(this.width, this.height, false);
		if (this.loaded && Math.abs(previousAspect - this.width / this.height) > 0.0001)
			this.fit(true, this.state.isolated ? this.state.selected : this.state.focused, true);
		this.invalidate();
	};
	private pick(event: PointerEvent | MouseEvent) {
		const rect = this.renderer.domElement.getBoundingClientRect();
		this.raycaster.setFromCamera(
			new THREE.Vector2(
				((event.clientX - rect.left) / rect.width) * 2 - 1,
				(-(event.clientY - rect.top) / rect.height) * 2 + 1
			),
			this.camera
		);
		const objects = [...this.components.values()]
			.filter((p) => p.object.visible && p.opacity.value > 0.3)
			.flatMap((p) => p.meshes);
		const hits = this.raycaster.intersectObjects([...objects, ...this.caps.pickables()], false);
		return hits.find((h) => !this.sectionActive || this.plane.distanceToPoint(h.point) >= -0.00004)
			?.object.userData.componentId as string | undefined;
	}
	private hideHover = () => {
		if (this.hoverTimer) clearTimeout(this.hoverTimer);
		this.hoverTimer = null;
		this.hoverLabel.style.display = 'none';
	};
	private pointerMove = (event: PointerEvent) => {
		this.selectionGesture.move(event);
		this.hideHover();
		if (this.dragging || event.pointerType !== 'mouse' || !this.loaded) return;
		this.hoverTimer = setTimeout(() => {
			const id = this.pick(event),
				record = v12Components.find((p) => p.id === id);
			if (!record) return;
			this.hoverLabel.textContent = record.name;
			const rect = this.host.getBoundingClientRect();
			this.hoverLabel.style.left = `${Math.max(8, Math.min(this.width - 210, event.clientX - rect.left + 14))}px`;
			this.hoverLabel.style.top = `${Math.max(8, Math.min(this.height - 45, event.clientY - rect.top + 14))}px`;
			this.hoverLabel.style.display = 'block';
		}, 100);
	};
	private pointerDown = (event: PointerEvent) => {
		this.selectionGesture.start(event);
		this.dragging = this.selectionGesture.active;
		this.hideHover();
	};
	private pointerUp = (event: PointerEvent) => {
		const clicked = this.selectionGesture.end(event);
		this.dragging = this.selectionGesture.active;
		this.invalidate();
		if (
			!clicked ||
			event.target !== this.renderer.domElement ||
			document.elementFromPoint(event.clientX, event.clientY) !== this.renderer.domElement
		)
			return;
		this.onselect(this.pick(event) ?? null);
	};
	private pointerCancel = (event: PointerEvent) => {
		this.selectionGesture.cancel(event.pointerId);
		this.dragging = this.selectionGesture.active;
		this.invalidate();
	};
	private doubleClick = (event: MouseEvent) => {
		const id = this.pick(event);
		if (id) this.onisolate(id);
	};
	private disposeGraph(root: THREE.Object3D) {
		const geometry = new Set<THREE.BufferGeometry>(),
			materials = new Set<THREE.Material>();
		root.traverse((o) => {
			if (o instanceof THREE.Mesh) {
				geometry.add(o.geometry);
				if (o.customDepthMaterial) materials.add(o.customDepthMaterial);
				for (const m of Array.isArray(o.material) ? o.material : [o.material]) materials.add(m);
			}
		});
		for (const g of geometry) if (!this.runningRig.ownsGeometry(g)) g.dispose();
		for (const m of materials) if (!this.materialPool.owns(m)) m.dispose();
	}
	dispose() {
		if (this.disposed) return;
		this.disposed = true;
		this.abort.abort();
		cancelAnimationFrame(this.frame);
		this.observer.disconnect();
		document.removeEventListener('visibilitychange', this.visibilityHandler);
		this.controls.removeEventListener('change', this.invalidate);
		this.controls.removeEventListener('start', this.interaction);
		this.controls.dispose();
		this.renderer.domElement.removeEventListener('pointerdown', this.pointerDown);
		this.renderer.domElement.removeEventListener('pointerup', this.pointerUp);
		this.renderer.domElement.removeEventListener('pointercancel', this.pointerCancel);
		this.renderer.domElement.removeEventListener('dblclick', this.doubleClick);
		this.renderer.domElement.removeEventListener('pointermove', this.pointerMove);
		this.renderer.domElement.removeEventListener('pointerleave', this.hideHover);
		this.hideHover();
		this.hoverLabel.remove();
		this.flowLabels.dispose();
		this.caps.dispose();
		this.processFlow?.dispose();
		for (const label of this.atlasLabels) label.element.remove();
		this.atlasLabels = [];
		for (const object of this.atlasPanels.children) {
			(object as THREE.Line).geometry.dispose();
			((object as THREE.Line).material as THREE.Material).dispose();
		}
		if (this.sourceRoot) this.disposeGraph(this.sourceRoot);
		this.materialPool.dispose();
		this.pooledMaterials.clear();
		this.runningRig.dispose();
		for (const geometry of this.replacedSourceGeometry) geometry.dispose();
		this.replacedSourceGeometry.clear();
		for (const m of this.initializedMaterials) m.dispose();
		for (const m of this.selectedMaterials) m.dispose();
		this.floor.geometry.dispose();
		(this.floor.material as THREE.Material).dispose();
		this.guide.geometry.dispose();
		(this.guide.material as THREE.Material).dispose();
		this.environment?.dispose();
		this.key.shadow.map?.dispose();
		this.renderer.dispose();
		this.renderer.domElement.remove();
		this.components.clear();
	}
}
