import * as THREE from 'three';
import { WebGPURenderer, PMREMGenerator, MeshStandardNodeMaterial } from 'three/webgpu';
import { attribute, uniform, positionLocal, min, max, abs, clamp, mix } from 'three/tsl';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { BASELINE_DESIGN, type DesignParams } from '$lib/design/design-core';
import { deriveDesignLayout } from '$lib/design/design-layout';
import type { StructuralResult } from '$lib/design/structural';
import { rodMassProperties, type OperatingCycle } from '$lib/design/operating-cycle';
import {
	canonicalDesignDirection,
	designCameraFrame,
	designOrthographicFrame,
	interpolateDesignCamera,
	validateDesignCameraPose,
	DESIGN_CAMERA_FOV,
	type DesignCameraPose,
	type DesignCameraView,
	type DesignProjection
} from './design-camera';
export type { DesignCameraPose, DesignCameraView, DesignProjection } from './design-camera';
export type { StructuralProbe } from './design-structural';
import { designFieldCoefficients } from './design-field';
import { normalizeOperatingPhase, operatingVisualSample } from './design-operating';
import {
	createStudioEnvironment,
	createStrictWebGPURenderer,
	initializeWebGPURenderer
} from './studio-environment';
import {
	createStructuralGeometry,
	probeStructuralGeometry,
	type StructuralProbe,
	deformStructuralGeometry,
	structuralSurfaceLimits,
	DEFAULT_STRUCTURAL_DISPLAY,
	type StructuralDisplay
} from './design-structural';
import {
	crankTrainPoses,
	createRodGeometries,
	normalizeCrankPhase,
	ringGeometry
} from './design-geometry';

export type DesignView = 'rod' | 'engine';
export type DesignOverlay = 'material' | 'stress' | 'displacement';
export type DesignRenderPreset = 'technical' | 'presentation';
export type StudioCallbacks = {
	onPhase?: (phaseDegrees: number) => void;
	onProbe?: (probe: StructuralProbe | null) => void;
	onCameraChange?: (pose: DesignCameraPose) => void;
};
const Y = new THREE.Vector3(0, 1, 0);
const STEEL = 0xb3bdc9;
const COOL = new THREE.Color('#4b9dda');
const MID = new THREE.Color('#ecd18d');
const HOT = new THREE.Color('#f1744f');

function disposeTree(root: THREE.Object3D) {
	const geometries = new Set<THREE.BufferGeometry>();
	const materials = new Set<THREE.Material>();
	root.traverse((object) => {
		if (
			object instanceof THREE.Mesh ||
			object instanceof THREE.Line ||
			object instanceof THREE.Points ||
			object instanceof THREE.Sprite
		) {
			// Sprite geometry is shared by Three across viewports; only its per-label
			// material and texture belong to this studio.
			if (!(object instanceof THREE.Sprite)) geometries.add(object.geometry);
			for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
				materials.add(material);
			}
		}
	});
	for (const geometry of geometries) geometry.dispose();
	for (const material of materials) {
		if ('map' in material && material.map instanceof THREE.Texture) material.map.dispose();
		material.dispose();
	}
}

/** A generated design derivative. The purchased engine mesh is deliberately not deformed. */
export class DesignStudio {
	private scene = new THREE.Scene();
	private camera: THREE.PerspectiveCamera | THREE.OrthographicCamera = new THREE.PerspectiveCamera(
		DESIGN_CAMERA_FOV,
		1,
		1,
		6000
	);
	private projection: DesignProjection = 'perspective';
	private renderPreset: DesignRenderPreset = 'technical';
	private lighting = {
		hemisphere: new THREE.HemisphereLight(),
		key: new THREE.DirectionalLight(),
		rim: new THREE.DirectionalLight(),
		fill: new THREE.DirectionalLight()
	};
	private cameraEventsMuted = false;
	private lastCameraPose = '';
	private probeEnabled = false;
	private probe: StructuralProbe | null = null;
	private probePointer: { x: number; y: number; id: number } | null = null;
	private raycaster = new THREE.Raycaster();
	private probeMarker = new THREE.Points(
		new THREE.BufferGeometry().setFromPoints([new THREE.Vector3()]),
		new THREE.PointsMaterial({
			color: 0xffffff,
			size: 8,
			sizeAttenuation: false,
			depthTest: false,
			depthWrite: false
		})
	);
	private triad = new THREE.Scene();
	private triadCamera = new THREE.OrthographicCamera(-54, 54, 54, -54, 0.1, 500);
	private renderer: WebGPURenderer;
	readonly ready: Promise<void>;
	private rendererReady = false;
	private controls: OrbitControls;
	private observer: ResizeObserver;
	private environment: THREE.RenderTarget | undefined;
	private root = new THREE.Group();
	private rod = new THREE.Group();
	private engine = new THREE.Group();
	private baseline = new THREE.Group();
	private dimensions = new THREE.Group();
	private forces = new THREE.Group();
	private transverseForces = new THREE.Group();
	private structural = new THREE.Group();
	private operating = new THREE.Group();
	private operatingCycle: OperatingCycle | null = null;
	private operatingMaximumForce = 1;
	private operatingArrows = {
		gas: new THREE.ArrowHelper(new THREE.Vector3(0, -1, 0), new THREE.Vector3(), 1, 0xf2bd70),
		small: new THREE.ArrowHelper(new THREE.Vector3(0, -1, 0), new THREE.Vector3(), 1, 0x7ed8e0),
		big: new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(), 1, 0xb9c9f4)
	};
	private structuralResult: StructuralResult | null = null;
	private structuralDisplay: StructuralDisplay = { ...DEFAULT_STRUCTURAL_DISPLAY };
	private structuralSurface: THREE.Mesh<THREE.BufferGeometry, MeshStandardNodeMaterial> | null =
		null;
	private structuralWire: THREE.Mesh | null = null;
	private structuralGhost = new THREE.Group();
	private structuralBoundaries = new THREE.Group();
	private structuralBoundaryPoints: THREE.Points[] = [];
	private structuralForceArrows: {
		arrow: THREE.ArrowHelper;
		origin: THREE.Vector3;
		displacement: THREE.Vector3;
	}[] = [];
	private structuralLimits = { maximumStressMpa: 0, maximumDisplacementMm: 0 };
	private structuralUniforms = {
		uStructuralMode: { value: 1 },
		uStructuralMaximum: { value: 1 },
		uStructuralCool: { value: COOL },
		uStructuralMid: { value: MID },
		uStructuralHot: { value: HOT }
	};
	private floor: THREE.Mesh;
	private grid: THREE.GridHelper;
	private view: DesignView = 'rod';
	private overlay: DesignOverlay = 'material';
	private design = { ...BASELINE_DESIGN };
	private targetDesign = { ...BASELINE_DESIGN };
	private rodGeometries = createRodGeometries(BASELINE_DESIGN);
	private fieldUniforms = {
		uDesignBeam: { value: new THREE.Vector4() },
		uDesignStress: { value: new THREE.Vector3() },
		uDesignDeflection: { value: new THREE.Vector3() },
		uDesignUnassessed: { value: new THREE.Color('#66727f') },
		uDesignCool: { value: COOL },
		uDesignMid: { value: MID },
		uDesignHot: { value: HOT }
	};
	private rodMaterial = new MeshStandardNodeMaterial({
		color: 0xffffff,
		metalness: 0.78,
		roughness: 0.25,
		envMapIntensity: 1.6,
		vertexColors: false
	});
	private mechanismMaterial = new THREE.MeshStandardMaterial({
		color: 0xaab4c0,
		metalness: 0.76,
		roughness: 0.3,
		envMapIntensity: 1.3
	});
	private rodInstances: THREE.Group[] = [];
	private pistons: THREE.Group[] = [];
	private liners: THREE.Mesh[] = [];
	private crankPins: THREE.Mesh[] = [];
	private crankWebs: THREE.Mesh[] = [];
	private journals: THREE.Mesh[] = [];
	private flywheel: THREE.Mesh;
	private labels: THREE.Mesh[] = [];
	private phase = 26;
	private running = false;
	private frame = 0;
	private lastTime = 0;
	private lastReport = 0;
	private disposed = false;
	private baselineEnabled = false;
	private dimensionsEnabled = true;
	private forcesEnabled = false;
	private exploded = 0;
	private targetExploded = 0;
	private needsGeometry = false;
	private lastGeometryBuild = 0;
	private dimensionRefresh = 0;
	private reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	private cameraGoal: {
		position: THREE.Vector3;
		target: THREE.Vector3;
		verticalSpanMm?: number;
		emit?: boolean;
	} | null = null;
	private contextLost = false;
	private viewportWidth = 0;
	private viewportHeight = 0;

	constructor(
		private canvas: HTMLCanvasElement,
		private callbacks: StudioCallbacks = {}
	) {
		this.renderer = createStrictWebGPURenderer({ canvas, antialias: true, alpha: false });
		this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
		this.renderer.setClearColor(0x070b10);
		this.renderer.outputColorSpace = THREE.SRGBColorSpace;
		this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
		this.renderer.toneMappingExposure = 1.22;
		this.renderer.shadowMap.enabled = true;
		this.renderer.shadowMap.type = THREE.PCFShadowMap;
		this.scene.fog = new THREE.Fog(0x070b10, 1500, 3300);
		this.ready = initializeWebGPURenderer(this.renderer).then(() => {
			if (this.disposed) return;
			const studio = createStudioEnvironment();
			const reflectionCardGeometry = new THREE.PlaneGeometry(3.8, 7);
			const reflectionCardMaterial = new THREE.MeshBasicMaterial({
				color: new THREE.Color(0xd8e2f0).multiplyScalar(2.4),
				side: THREE.DoubleSide,
				toneMapped: false
			});
			const reflectionCard = new THREE.Mesh(reflectionCardGeometry, reflectionCardMaterial);
			reflectionCard.position.set(-6, 0.5, 6);
			reflectionCard.lookAt(0, 0, 0);
			studio.scene.add(reflectionCard);
			const pmrem = new PMREMGenerator(this.renderer);
			this.environment = pmrem.fromScene(studio.scene, 0.06);
			this.scene.environment = this.environment.texture;
			this.scene.environmentIntensity = 0.8;
			studio.dispose();
			reflectionCardGeometry.dispose();
			reflectionCardMaterial.dispose();
			pmrem.dispose();
			this.rendererReady = true;
		});
		this.lighting.hemisphere = new THREE.HemisphereLight(0xdceaff, 0x7b858f, 1.55);
		this.scene.add(this.lighting.hemisphere);
		const key = (this.lighting.key = new THREE.DirectionalLight(0xffeed4, 3.2));
		key.position.set(-240, 450, 330);
		key.castShadow = true;
		key.shadow.mapSize.set(2048, 2048);
		Object.assign(key.shadow.camera, {
			left: -560,
			right: 560,
			top: 500,
			bottom: -420,
			near: 1,
			far: 1500
		});
		key.shadow.bias = -0.0002;
		key.shadow.normalBias = 0.9;
		key.shadow.radius = 2.5;
		this.scene.add(key);
		const rim = (this.lighting.rim = new THREE.DirectionalLight(0xa8c8fb, 2.3));
		rim.position.set(260, 150, -250);
		this.scene.add(rim);
		const fill = (this.lighting.fill = new THREE.DirectionalLight(0xb7c8e3, 0.65));
		fill.position.set(0, -150, 250);
		this.scene.add(fill);
		this.floor = new THREE.Mesh(
			new THREE.PlaneGeometry(8000, 8000),
			new THREE.MeshStandardMaterial({
				color: 0x03060a,
				roughness: 1,
				metalness: 0,
				envMapIntensity: 0.15
			})
		);
		this.floor.rotation.x = -Math.PI / 2;
		this.floor.position.y = -57;
		this.floor.receiveShadow = true;
		this.scene.add(this.floor);
		this.grid = new THREE.GridHelper(1800, 60, 0x182738, 0x101923);
		this.grid.position.y = -56.8;
		const gridMaterial = this.grid.material as THREE.Material;
		gridMaterial.transparent = true;
		gridMaterial.opacity = 0.38;
		this.scene.add(this.grid);
		this.scene.add(this.root);
		this.root.add(
			this.rod,
			this.engine,
			this.baseline,
			this.dimensions,
			this.forces,
			this.structural,
			this.operating
		);
		this.rod.rotation.z = 0;
		this.structural.rotation.z = this.rod.rotation.z;
		this.structural.visible = false;
		this.operating.visible = false;
		for (const arrow of Object.values(this.operatingArrows)) {
			this.operating.add(arrow);
			for (const child of [arrow.line, arrow.cone]) {
				(child.material as THREE.Material).depthTest = false;
				child.renderOrder = 5;
			}
		}
		this.configureFieldMaterial();
		this.buildRod();
		this.colorOverlay();
		const engineParts = this.buildEngine();
		this.flywheel = engineParts.flywheel;
		this.engine.visible = false;
		this.baseline.visible = false;
		this.buildBaseline();
		this.refreshDimensions();
		this.buildForces();
		this.controls = new OrbitControls(this.camera, canvas);
		this.configureControls();
		this.probeMarker.visible = false;
		this.probeMarker.renderOrder = 30;
		this.root.add(this.probeMarker);
		this.createTriad();
		this.setRenderPreset('technical');
		canvas.addEventListener('pointerdown', this.onProbeDown);
		canvas.addEventListener('pointerup', this.onProbeUp);
		canvas.addEventListener('webglcontextlost', this.onContextLost);
		canvas.addEventListener('webglcontextrestored', this.onContextRestored);
		this.observer = new ResizeObserver(this.resize);
		this.observer.observe(canvas);
		this.resize();
		this.resetView(true);
		this.frame = requestAnimationFrame(this.tick);
	}

	private configureControls() {
		this.controls.enableDamping = true;
		this.controls.dampingFactor = 0.065;
		this.controls.enablePan = true;
		this.controls.screenSpacePanning = true;
		this.controls.minDistance = 30;
		this.controls.minZoom = 0.05;
		this.controls.maxZoom = 50;
		this.controls.maxDistance = 2400;
		this.controls.rotateSpeed = 0.7;
		this.controls.zoomSpeed = 0.75;
		this.controls.addEventListener('start', this.cancelCameraGoal);
		this.controls.addEventListener('change', this.onCameraChange);
	}

	/** Neutral inspection is the default. Presentation is an explicit optical treatment. */
	setRenderPreset(preset: DesignRenderPreset) {
		this.renderPreset = preset;
		const technical = preset === 'technical';
		this.renderer.setClearColor(technical ? 0x11161c : 0x070b10);
		this.renderer.toneMappingExposure = technical ? 1.05 : 1.22;
		this.renderer.shadowMap.enabled = !technical;
		this.scene.fog = technical ? null : new THREE.Fog(0x070b10, 1500, 3300);
		this.scene.environmentIntensity = technical ? 0.55 : 0.8;
		this.floor.visible = !technical;
		this.grid.visible = !technical;
		this.lighting.hemisphere.color.set(technical ? 0xe3e8ee : 0xdceaff);
		this.lighting.hemisphere.groundColor.set(technical ? 0xbac2cc : 0x7b858f);
		this.lighting.hemisphere.intensity = technical ? 2.2 : 1.55;
		this.lighting.key.color.set(technical ? 0xffffff : 0xffeed4);
		this.lighting.key.intensity = technical ? 2 : 3.2;
		this.lighting.rim.color.set(technical ? 0xdde4ec : 0xa8c8fb);
		this.lighting.rim.intensity = technical ? 1.2 : 2.3;
		this.lighting.fill.color.set(technical ? 0xdde4ec : 0xb7c8e3);
		this.lighting.fill.intensity = technical ? 1.1 : 0.65;
		this.rodMaterial.envMapIntensity = technical ? 0.65 : 1.6;
		this.mechanismMaterial.metalness = technical ? 0.32 : 0.76;
		this.mechanismMaterial.roughness = technical ? 0.5 : 0.3;
		this.mechanismMaterial.envMapIntensity = technical ? 0.55 : 1.3;
		this.engine.traverse((object) => {
			if (!(object instanceof THREE.Mesh)) return;
			for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
				if (
					!(material instanceof THREE.MeshStandardMaterial) ||
					material.transparent ||
					material === this.mechanismMaterial
				)
					continue;
				const original = (material.userData.presentation ??= {
					metalness: material.metalness,
					roughness: material.roughness,
					envMapIntensity: material.envMapIntensity
				});
				material.metalness = technical ? Math.min(0.35, original.metalness) : original.metalness;
				material.roughness = technical ? Math.max(0.44, original.roughness) : original.roughness;
				material.envMapIntensity = technical ? 0.6 : original.envMapIntensity;
			}
		});
		this.setOverlay(this.overlay);
		this.applyStructuralDisplay(false);
	}

	getCameraPose(): DesignCameraPose {
		return {
			position: this.camera.position.toArray() as [number, number, number],
			target: this.controls.target.toArray() as [number, number, number],
			up: this.camera.up.toArray() as [number, number, number],
			projection: this.projection,
			verticalSpanMm:
				this.camera instanceof THREE.OrthographicCamera
					? (this.camera.top - this.camera.bottom) / this.camera.zoom
					: 2 *
						this.camera.position.distanceTo(this.controls.target) *
						Math.tan(THREE.MathUtils.degToRad(DESIGN_CAMERA_FOV / 2))
		};
	}

	/** Applying a peer pose is silent by default, preventing two-way synchronization loops. */
	applyCameraPose(pose: DesignCameraPose, options: { emit?: boolean; immediate?: boolean } = {}) {
		if (!validateDesignCameraPose(pose))
			throw new RangeError('The camera pose must be finite and nondegenerate.');
		const muted = this.cameraEventsMuted;
		this.cameraEventsMuted = true;
		this.flushControls();
		if (this.projection !== pose.projection) this.replaceCamera(pose.projection);
		const up = new THREE.Vector3(...pose.up).normalize();
		if (this.camera.up.distanceToSquared(up) > 1e-12) {
			this.camera.up.copy(up);
			this.replaceControls();
		}
		const frame = {
			position: new THREE.Vector3(...pose.position),
			target: new THREE.Vector3(...pose.target),
			verticalSpanMm: pose.verticalSpanMm
		};
		if (pose.projection === 'perspective') {
			const distance =
				pose.verticalSpanMm / (2 * Math.tan(THREE.MathUtils.degToRad(DESIGN_CAMERA_FOV / 2)));
			frame.position.sub(frame.target).normalize().multiplyScalar(distance).add(frame.target);
		}
		// Synchronized peers copy exactly. Local commands can opt into a smooth transition.
		if (options.immediate !== false || this.reducedMotion) {
			this.cameraGoal = null;
			this.camera.position.copy(frame.position);
			this.controls.target.copy(frame.target);
			this.setOrthographicSpan(pose.verticalSpanMm);
			this.controls.update();
			this.lastCameraPose = JSON.stringify(this.getCameraPose());
		} else this.cameraGoal = { ...frame, emit: options.emit ?? false };
		this.cameraEventsMuted = muted;
		if (options.emit && !muted) this.callbacks.onCameraChange?.(this.getCameraPose());
	}

	setProjection(projection: DesignProjection) {
		if (projection === this.projection) return;
		const pose = this.getCameraPose();
		this.applyCameraPose({ ...pose, projection }, { emit: true });
	}

	private replaceCamera(projection: DesignProjection) {
		const old = this.camera;
		this.camera =
			projection === 'orthographic'
				? new THREE.OrthographicCamera(-100, 100, 100, -100, 0.1, 6000)
				: new THREE.PerspectiveCamera(
						DESIGN_CAMERA_FOV,
						(this.viewportWidth || 800) / (this.viewportHeight || 600),
						1,
						6000
					);
		this.camera.position.copy(old.position);
		this.camera.up.copy(old.up);
		this.camera.quaternion.copy(old.quaternion);
		this.projection = projection;
		this.replaceControls();
	}

	private replaceControls() {
		const target = this.controls.target.clone();
		this.controls.removeEventListener('start', this.cancelCameraGoal);
		this.controls.removeEventListener('change', this.onCameraChange);
		this.controls.dispose();
		this.controls = new OrbitControls(this.camera, this.canvas);
		this.controls.target.copy(target);
		this.configureControls();
		this.canvas.style.cursor = this.probeEnabled ? 'crosshair' : '';
	}

	private flushControls() {
		const muted = this.cameraEventsMuted;
		this.cameraEventsMuted = true;
		const position = this.camera.position.clone(),
			target = this.controls.target.clone();
		this.controls.enableDamping = false;
		this.controls.update();
		this.controls.enableDamping = true;
		this.camera.position.copy(position);
		this.controls.target.copy(target);
		this.cameraEventsMuted = muted;
	}

	private setOrthographicSpan(span: number) {
		if (!(this.camera instanceof THREE.OrthographicCamera)) return;
		const half = span / 2,
			aspect = (this.viewportWidth || 800) / (this.viewportHeight || 600);
		this.camera.top = half;
		this.camera.bottom = -half;
		this.camera.left = -half * aspect;
		this.camera.right = half * aspect;
		this.camera.zoom = 1;
		this.camera.updateProjectionMatrix();
	}

	private onCameraChange = () => {
		if (this.cameraEventsMuted || this.cameraGoal?.emit === false) return;
		const pose = this.getCameraPose();
		const serialized = JSON.stringify(pose);
		if (serialized === this.lastCameraPose) return;
		this.lastCameraPose = serialized;
		this.callbacks.onCameraChange?.(pose);
	};

	setProbeEnabled(enabled: boolean) {
		this.probeEnabled = enabled;
		this.canvas.style.cursor = enabled ? 'crosshair' : '';
		if (!enabled) this.clearProbe();
	}

	clearProbe() {
		this.probe = null;
		this.probeMarker.visible = false;
		this.callbacks.onProbe?.(null);
	}

	private updateProbeMarker() {
		if (!this.probe || !this.structuralSurface) return;
		this.structuralSurface.updateWorldMatrix(true, false);
		this.probeMarker.position
			.set(...this.probe.positionMm)
			.addScaledVector(
				new THREE.Vector3(...this.probe.displacementMm),
				this.structuralDisplay.deformationScale
			);
		this.probeMarker.position.applyMatrix4(this.structuralSurface.matrixWorld);
		this.probeMarker.visible = this.structural.visible;
	}

	private onProbeDown = (event: PointerEvent) => {
		this.probePointer =
			this.probeEnabled && event.button === 0
				? { x: event.clientX, y: event.clientY, id: event.pointerId }
				: null;
	};

	private onProbeUp = (event: PointerEvent) => {
		const start = this.probePointer;
		this.probePointer = null;
		if (
			!start ||
			start.id !== event.pointerId ||
			Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5 ||
			!this.structural.visible ||
			!this.structuralSurface ||
			!this.structuralResult
		)
			return;
		const rect = this.canvas.getBoundingClientRect();
		this.camera.updateMatrixWorld();
		this.structuralSurface.updateWorldMatrix(true, false);
		this.raycaster.setFromCamera(
			new THREE.Vector2(
				(2 * (event.clientX - rect.left)) / rect.width - 1,
				1 - (2 * (event.clientY - rect.top)) / rect.height
			),
			this.camera
		);
		const hit = this.raycaster.intersectObject(this.structuralSurface, false)[0];
		if (!hit || hit.faceIndex === undefined || hit.faceIndex === null) {
			this.clearProbe();
			return;
		}
		this.probe = probeStructuralGeometry(
			this.structuralSurface.geometry,
			hit.faceIndex,
			this.structuralSurface.worldToLocal(hit.point.clone()),
			this.structuralResult.analysisHash
		);
		this.updateProbeMarker();
		this.callbacks.onProbe?.(this.probe);
	};

	private createTriad() {
		this.triadCamera.position.z = 200;
		for (const [axis, color, end] of [
			['X', '#d7857c', new THREE.Vector3(31, 0, 0)],
			['Y', '#93b88a', new THREE.Vector3(0, 31, 0)],
			['Z', '#85acd0', new THREE.Vector3(0, 0, 31)]
		] as const) {
			this.triad.add(
				new THREE.Line(
					new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), end]),
					new THREE.LineBasicMaterial({ color })
				)
			);
			const canvas = document.createElement('canvas');
			canvas.width = canvas.height = 64;
			const context = canvas.getContext('2d')!;
			context.font = '500 46px Inter, system-ui, sans-serif';
			context.textAlign = 'center';
			context.textBaseline = 'middle';
			context.fillStyle = color;
			context.fillText(axis, 32, 34);
			const texture = new THREE.CanvasTexture(canvas);
			texture.colorSpace = THREE.SRGBColorSpace;
			const sprite = new THREE.Sprite(
				new THREE.SpriteMaterial({ map: texture, depthTest: false, toneMapped: false })
			);
			sprite.position.copy(end).multiplyScalar(1.35);
			sprite.scale.set(20, 20, 1);
			this.triad.add(sprite);
		}
	}

	private renderScene() {
		if (!this.rendererReady || this.disposed) return;
		this.renderer.setViewport(0, 0, this.viewportWidth, this.viewportHeight);
		this.renderer.render(this.scene, this.camera);
		if (this.viewportWidth < 260 || this.viewportHeight < 240) return;
		this.triad.quaternion.copy(this.camera.quaternion).invert();
		const size = 96;
		const bottom = this.viewportWidth < 600 && this.viewportHeight > 450 ? 100 : 60;
		this.renderer.clearDepth();
		this.renderer.setViewport(
			this.viewportWidth - size - 8,
			this.viewportHeight - size - bottom,
			size,
			size
		);
		this.renderer.autoClear = false;
		this.renderer.render(this.triad, this.triadCamera);
		this.renderer.autoClear = true;
		this.renderer.setViewport(0, 0, this.viewportWidth, this.viewportHeight);
	}

	private mesh(geometry: THREE.BufferGeometry, material: THREE.Material, parent: THREE.Object3D) {
		const mesh = new THREE.Mesh(geometry, material);
		mesh.castShadow = true;
		mesh.receiveShadow = true;
		parent.add(mesh);
		return mesh;
	}

	private buildRod() {
		for (const geometry of this.rodGeometries) {
			const mesh = this.mesh(geometry, this.rodMaterial, this.rod);
			mesh.receiveShadow = false;
		}
	}

	private configureFieldMaterial() {
		const beam = uniform(this.fieldUniforms.uDesignBeam.value);
		const stress = uniform(this.fieldUniforms.uDesignStress.value);
		const deflection = uniform(this.fieldUniforms.uDesignDeflection.value);
		const x = min(positionLocal.y.sub(beam.x), beam.y.sub(positionLocal.y));
		const stressValue = abs(stress.x.negate().add(stress.y.mul(x).mul(positionLocal.z))).div(
			max(stress.z, 1e-12)
		);
		const displacement = deflection.x
			.mul(x)
			.mul(beam.z.pow(2).mul(3).sub(x.pow(2).mul(4)))
			.add(deflection.y.mul(x));
		const fraction = clamp(
			beam.w.lessThan(1.5).select(stressValue, abs(displacement).div(max(deflection.z, 1e-12))),
			0,
			1
		);
		const cool = uniform(COOL).rgb,
			mid = uniform(MID).rgb,
			hot = uniform(HOT).rgb;
		const ramp = fraction
			.lessThan(0.55)
			.select(mix(cool, mid, fraction.div(0.55)), mix(mid, hot, fraction.sub(0.55).div(0.45)));
		const outside = positionLocal.y.lessThan(beam.x).or(positionLocal.y.greaterThan(beam.y));
		this.rodMaterial.colorNode = beam.w
			.greaterThan(0.5)
			.select(
				outside.select(uniform(this.fieldUniforms.uDesignUnassessed.value).rgb, ramp),
				attribute('color', 'vec3')
			);
	}

	private buildBaseline() {
		for (const geometry of createRodGeometries(BASELINE_DESIGN, 40)) {
			const edges = new THREE.EdgesGeometry(geometry, 24);
			geometry.dispose();
			const outline = new THREE.LineSegments(
				edges,
				new THREE.LineBasicMaterial({
					color: 0xc9b990,
					transparent: true,
					opacity: 0.22,
					depthWrite: false
				})
			);
			this.baseline.add(outline);
		}
		this.baseline.rotation.z = this.rod.rotation.z;
	}

	private buildEngine() {
		const dark = new THREE.MeshStandardMaterial({
			color: 0x627184,
			roughness: 0.3,
			metalness: 0.84
		});
		const gold = new THREE.MeshStandardMaterial({
			color: 0xaa8857,
			roughness: 0.35,
			metalness: 0.8
		});
		const pistonGeo = new THREE.CylinderGeometry(1, 1, 14, 56, 1, false);
		const pistonMaterial = new THREE.MeshStandardMaterial({
			color: 0xd4dce3,
			roughness: 0.22,
			metalness: 0.83
		});
		const linerMaterial = new THREE.MeshPhysicalMaterial({
			color: 0x739cac,
			metalness: 0.08,
			roughness: 0.3,
			transparent: true,
			opacity: 0.065,
			depthWrite: false,
			side: THREE.DoubleSide
		});
		const linerGeometry = ringGeometry(1, 1.085, 100, 48);
		linerGeometry.rotateX(-Math.PI / 2);
		for (let i = 0; i < 12; i++) {
			const rod = new THREE.Group();
			for (const geometry of this.rodGeometries) {
				const mesh = this.mesh(geometry, this.mechanismMaterial, rod);
				mesh.receiveShadow = false;
			}
			this.engine.add(rod);
			this.rodInstances.push(rod);
			const piston = new THREE.Group();
			const crownMaterial = i === 0 ? pistonMaterial.clone() : pistonMaterial;
			if (i === 0) crownMaterial.color.set(0xc7a16e);
			const body = this.mesh(pistonGeo, crownMaterial, piston);
			body.name = 'piston-crown';
			for (const height of [-3, 1, 5]) {
				const ring = this.mesh(new THREE.TorusGeometry(1, 0.006, 8, 56), dark, piston);
				ring.rotation.x = Math.PI / 2;
				ring.userData.crownOffset = height;
				ring.name = 'piston-ring';
			}
			for (const side of [-1, 1]) {
				const bossGeometry = ringGeometry(9.1, 14, 8, 32);
				bossGeometry.rotateY(Math.PI / 2);
				const boss = this.mesh(bossGeometry, pistonMaterial, piston);
				boss.position.x = side * 18;
				const wall = this.mesh(new THREE.BoxGeometry(8, 1, 14), pistonMaterial, piston);
				wall.position.x = side * 18;
				wall.name = 'piston-carrier';
			}
			const pin = this.mesh(new THREE.CylinderGeometry(8.8, 8.8, 52, 24), dark, piston);
			pin.rotation.z = Math.PI / 2;
			pin.name = 'gudgeon-pin';
			this.engine.add(piston);
			this.pistons.push(piston);
			const liner = this.mesh(linerGeometry, linerMaterial, this.engine);
			liner.castShadow = false;
			this.liners.push(liner);
		}
		const pinGeo = new THREE.CylinderGeometry(24.7, 24.7, 1, 40);
		pinGeo.rotateZ(Math.PI / 2);
		const journalGeo = new THREE.CylinderGeometry(24, 24, 16, 40);
		journalGeo.rotateZ(Math.PI / 2);
		for (let i = 0; i < 6; i++) {
			this.crankPins.push(this.mesh(pinGeo, gold, this.engine));
			for (let side = 0; side < 2; side++) {
				const web = this.mesh(new THREE.BoxGeometry(10, 1, 40), dark, this.engine);
				this.crankWebs.push(web);
			}
		}
		for (let i = 0; i < 7; i++) this.journals.push(this.mesh(journalGeo, dark, this.engine));
		const wheelGeometry = ringGeometry(24.3, 68, 12);
		wheelGeometry.rotateY(Math.PI / 2);
		const flywheel = this.mesh(wheelGeometry, dark, this.engine);
		return { flywheel };
	}

	private label(text: string, position: THREE.Vector3) {
		const canvas = document.createElement('canvas');
		canvas.width = 512;
		canvas.height = 96;
		const ctx = canvas.getContext('2d')!;
		ctx.font = '400 40px Inter, system-ui, sans-serif';
		const labelWidth = ctx.measureText(text).width + 30;
		ctx.fillStyle = '#dbe6f2';
		ctx.strokeStyle = 'rgba(10, 16, 24, 0.85)';
		ctx.lineWidth = 3;
		ctx.lineJoin = 'round';
		ctx.shadowColor = 'rgba(10, 16, 24, 0.65)';
		ctx.shadowBlur = 5;
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.strokeText(text, 256, 48);
		ctx.fillText(text, 256, 48);
		const texture = new THREE.CanvasTexture(canvas);
		texture.colorSpace = THREE.SRGBColorSpace;
		const label = new THREE.Mesh(
			new THREE.PlaneGeometry(57, 10.7),
			new THREE.MeshBasicMaterial({
				map: texture,
				transparent: true,
				depthWrite: false,
				depthTest: false
			})
		);
		label.userData.halfWidthPx = ((57 / 10.7) * 34 * labelWidth) / 512 / 2 + 2;
		label.userData.halfHeightPx = (34 * 64) / 96 / 2 + 2;
		label.position.copy(position);
		label.renderOrder = 20;
		this.labels.push(label);
		this.dimensions.add(label);
	}

	private dimension(a: THREE.Vector3, b: THREE.Vector3, text: string, labelOffset: THREE.Vector3) {
		const dir = b.clone().sub(a).normalize();
		const tick = new THREE.Vector3(-dir.y, dir.x, 0).multiplyScalar(3);
		const geometry = new THREE.BufferGeometry().setFromPoints([
			a,
			b,
			a.clone().sub(tick),
			a.clone().add(tick),
			b.clone().sub(tick),
			b.clone().add(tick)
		]);
		this.dimensions.add(
			new THREE.LineSegments(
				geometry,
				new THREE.LineBasicMaterial({
					color: 0x61758b,
					transparent: true,
					opacity: 0.72,
					depthTest: false
				})
			)
		);
		this.label(text, a.clone().add(b).multiplyScalar(0.5).add(labelOffset));
	}

	private refreshDimensions() {
		disposeTree(this.dimensions);
		this.dimensions.clear();
		this.labels = [];
		const p = this.design;
		this.dimension(
			new THREE.Vector3(-48, 0, 0),
			new THREE.Vector3(-48, p.rodLengthMm, 0),
			`${p.rodLengthMm.toFixed(1)} mm`,
			new THREE.Vector3(-25, 0, 0)
		);
		this.dimension(
			new THREE.Vector3(-p.rodWidthMm / 2, p.rodLengthMm * 0.48, 22),
			new THREE.Vector3(p.rodWidthMm / 2, p.rodLengthMm * 0.48, 22),
			`${p.rodWidthMm.toFixed(1)} mm`,
			new THREE.Vector3(0, -10, 0)
		);
		this.dimension(
			new THREE.Vector3(-25, -43, 0),
			new THREE.Vector3(25, -43, 0),
			'Ø 50 mm',
			new THREE.Vector3(0, -10, 0)
		);
		this.dimensions.rotation.z = this.rod.rotation.z;
		this.dimensions.visible = this.dimensionsEnabled && this.view === 'rod';
	}

	private buildForces() {
		const length = this.design.rodLengthMm;
		for (const [position, direction] of [
			[new THREE.Vector3(0, length + 38, 0), new THREE.Vector3(0, -1, 0)],
			[new THREE.Vector3(0, -55, 0), new THREE.Vector3(0, 1, 0)]
		]) {
			this.forces.add(new THREE.ArrowHelper(direction, position, 26, 0xf2bd70, 8, 4));
		}
		this.forces.rotation.z = this.rod.rotation.z;
		this.forces.add(this.transverseForces);
		const lateral = new THREE.ArrowHelper(
			new THREE.Vector3(0, 0, 1),
			new THREE.Vector3(),
			30,
			0x7ed8e0,
			8,
			4
		);
		this.transverseForces.add(lateral);
		for (let i = 0; i < 2; i++)
			this.transverseForces.add(
				new THREE.ArrowHelper(new THREE.Vector3(0, 0, -1), new THREE.Vector3(), 22, 0x7ba1bd, 6, 3)
			);
		this.updateForces();
		this.forces.visible = this.forcesEnabled && this.view === 'rod';
	}

	private updateForces() {
		const p = this.design,
			start = 32,
			end = p.rodLengthMm - 15;
		this.forces.children[0].position.y = p.rodLengthMm + 38;
		this.transverseForces.visible = p.lateralLoadN > 0;
		this.transverseForces.children[0].position.set(0, (start + end) / 2, -p.rodDepthMm / 2 - 30);
		this.transverseForces.children[1].position.set(0, start, p.rodDepthMm / 2 + 22);
		this.transverseForces.children[2].position.set(0, end, p.rodDepthMm / 2 + 22);
	}

	/** Adopt a native solution without changing the user's camera, orbit, or zoom. */
	setStructuralResult(result: StructuralResult | null) {
		if (result === this.structuralResult) return;
		// Validate and prepare first so an invalid result cannot destroy the current display.
		const geometry = result ? createStructuralGeometry(result.surface) : null;
		this.clearProbe();
		disposeTree(this.structural);
		this.structural.clear();
		this.structuralSurface = null;
		this.structuralWire = null;
		this.structuralGhost = new THREE.Group();
		this.structuralBoundaries = new THREE.Group();
		this.structuralBoundaryPoints = [];
		this.structuralForceArrows = [];
		this.structuralResult = result;
		if (result && geometry) {
			this.structuralLimits = structuralSurfaceLimits(result.surface);
			const material = new MeshStandardNodeMaterial({
				color: STEEL,
				metalness: 0.12,
				roughness: 0.58,
				envMapIntensity: 0.65
			});
			const mode = uniform(1).onRenderUpdate(() => this.structuralUniforms.uStructuralMode.value);
			const maximum = uniform(1).onRenderUpdate(
				() => this.structuralUniforms.uStructuralMaximum.value
			);
			const scalar = mode
				.lessThan(1.5)
				.select(attribute('resultStress', 'float'), attribute('resultMagnitude', 'float'));
			const fraction = clamp(scalar.div(max(maximum, 1e-12)), 0, 1);
			const ramp = fraction
				.lessThan(0.5)
				.select(
					mix(uniform(COOL).rgb, uniform(MID).rgb, fraction.mul(2)),
					mix(uniform(MID).rgb, uniform(HOT).rgb, fraction.sub(0.5).mul(2))
				);
			material.colorNode = mode.greaterThan(0.5).select(ramp, uniform(new THREE.Color(STEEL)).rgb);
			this.structuralSurface = new THREE.Mesh(geometry, material);
			this.structuralSurface.castShadow = true;
			this.structural.add(this.structuralSurface);
			this.structuralWire = new THREE.Mesh(
				geometry,
				new THREE.MeshBasicMaterial({
					color: 0x08121d,
					wireframe: true,
					transparent: true,
					opacity: 0.3,
					depthWrite: false
				})
			);
			this.structuralWire.renderOrder = 2;
			this.structural.add(this.structuralWire, this.structuralGhost, this.structuralBoundaries);
			const outline = new THREE.LineSegments(
				new THREE.EdgesGeometry(geometry, 24),
				new THREE.LineBasicMaterial({
					color: 0xbdd0df,
					transparent: true,
					opacity: 0.3,
					depthWrite: false
				})
			);
			this.structuralGhost.add(outline);
			this.buildStructuralBoundaries(result);
			this.applyStructuralDisplay(true);
		}
		this.refreshVisibility();
	}

	setStructuralDisplay(display: Partial<StructuralDisplay>) {
		const next = { ...this.structuralDisplay, ...display };
		if (
			!Number.isFinite(next.deformationScale) ||
			next.deformationScale < 0 ||
			next.deformationScale > 100_000
		)
			throw new RangeError('Deformation amplification must be between 0 and 100000.');
		if (
			next.fieldMaximum !== undefined &&
			(!Number.isFinite(next.fieldMaximum) || next.fieldMaximum <= 0)
		)
			throw new RangeError('A display field maximum must be positive.');
		const deform = next.deformationScale !== this.structuralDisplay.deformationScale;
		this.structuralDisplay = next;
		this.applyStructuralDisplay(deform);
		this.refreshVisibility();
	}

	private applyStructuralDisplay(deform: boolean) {
		const mesh = this.structuralSurface;
		if (!mesh) return;
		const settings = this.structuralDisplay;
		if (deform) {
			deformStructuralGeometry(mesh.geometry, settings.deformationScale);
			for (const points of this.structuralBoundaryPoints) {
				const position = points.geometry.getAttribute('position') as THREE.BufferAttribute;
				const reference = points.geometry.getAttribute('referencePosition');
				const displacement = points.geometry.getAttribute('resultDisplacement');
				for (let i = 0; i < position.count; i++)
					position.setXYZ(
						i,
						reference.getX(i) + displacement.getX(i) * settings.deformationScale,
						reference.getY(i) + displacement.getY(i) * settings.deformationScale,
						reference.getZ(i) + displacement.getZ(i) * settings.deformationScale
					);
				position.needsUpdate = true;
				points.geometry.computeBoundingSphere();
			}
			for (const { arrow, origin, displacement } of this.structuralForceArrows)
				arrow.position.copy(origin).addScaledVector(displacement, settings.deformationScale);
		}
		this.structuralUniforms.uStructuralMode.value =
			settings.field === 'material' ? 0 : settings.field === 'stress' ? 1 : 2;
		this.structuralUniforms.uStructuralMaximum.value =
			settings.fieldMaximum ??
			(settings.field === 'stress'
				? this.structuralLimits.maximumStressMpa
				: this.structuralLimits.maximumDisplacementMm);
		mesh.material.color.set(settings.field === 'material' ? STEEL : 0xffffff);
		mesh.material.metalness =
			settings.field === 'material' ? (this.renderPreset === 'technical' ? 0.25 : 0.78) : 0.08;
		mesh.material.roughness =
			settings.field === 'material' ? (this.renderPreset === 'technical' ? 0.5 : 0.27) : 0.6;
		mesh.material.envMapIntensity =
			settings.field === 'material' ? (this.renderPreset === 'technical' ? 0.5 : 1.5) : 0.6;
		this.updateProbeMarker();
		this.structuralGhost.visible = settings.showUndeformed;
		if (this.structuralWire) this.structuralWire.visible = settings.showMesh;
		this.structuralBoundaries.visible = settings.showBoundaryConditions;
	}

	private buildStructuralBoundaries(result: StructuralResult) {
		for (const [nodes, color] of [
			[result.surface.fixtureNodes, 0x83b3dd],
			[result.surface.loadedNodes, 0xf2bd70]
		] as const) {
			const positions = new Float32Array(nodes.length * 3);
			const displacements = new Float32Array(nodes.length * 3);
			nodes.forEach((node, index) => {
				for (let axis = 0; axis < 3; axis++) {
					positions[index * 3 + axis] = result.surface.positionsMm[node * 3 + axis];
					displacements[index * 3 + axis] = result.surface.displacementMm[node * 3 + axis];
				}
			});
			const geometry = new THREE.BufferGeometry();
			geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
			geometry.setAttribute('referencePosition', new THREE.BufferAttribute(positions.slice(), 3));
			geometry.setAttribute('resultDisplacement', new THREE.BufferAttribute(displacements, 3));
			const points = new THREE.Points(
				geometry,
				new THREE.PointsMaterial({
					color,
					size: 2.8,
					sizeAttenuation: false,
					transparent: true,
					opacity: 0.7,
					depthWrite: false
				})
			);
			this.structuralBoundaries.add(points);
			this.structuralBoundaryPoints.push(points);
		}
		for (const [values, centerY, radius, color, displacement] of [
			[
				result.loadCase.forceN,
				result.geometryParams.rodLengthMm,
				15,
				0xf2bd70,
				result.stats.loadedMeanDisplacementMm
			],
			[result.stats.reactionN, 0, 32, 0x83b3dd, [0, 0, 0]]
		] as const) {
			const direction = new THREE.Vector3(...values);
			if (direction.length() < 1e-8) continue;
			direction.normalize();
			// Apply the resultant through its bearing centre; keep the vector inside the existing frame.
			const length = radius + 10;
			const origin = new THREE.Vector3(0, centerY, 0).addScaledVector(direction, -length);
			const arrow = new THREE.ArrowHelper(direction, origin, length, color, 7, 3.5);
			for (const child of [arrow.line, arrow.cone]) {
				(child.material as THREE.Material).depthTest = false;
				child.renderOrder = 4;
			}
			this.structuralBoundaries.add(arrow);
			this.structuralForceArrows.push({
				arrow,
				origin,
				displacement: new THREE.Vector3(...displacement)
			});
		}
		if (result.loadCase.inertia) {
			const bodyResultant = new THREE.Vector3(...result.stats.appliedN).sub(
				new THREE.Vector3(...result.loadCase.forceN)
			);
			if (bodyResultant.length() > 1e-8) {
				const centre = new THREE.Vector3(
					...rodMassProperties({
						...BASELINE_DESIGN,
						...result.geometryParams
					}).centreOfMassMm
				);
				const direction = bodyResultant.normalize();
				const arrow = new THREE.ArrowHelper(
					direction,
					centre.addScaledVector(direction, -30),
					30,
					0x7ed8e0,
					7,
					3.5
				);
				for (const child of [arrow.line, arrow.cone]) {
					(child.material as THREE.Material).depthTest = false;
					child.renderOrder = 4;
				}
				this.structuralBoundaries.add(arrow);
			}
		}
	}

	private refreshVisibility() {
		const nativeVisible =
			this.structuralDisplay.enabled && this.structuralResult !== null && this.view === 'rod';
		this.structural.visible = nativeVisible;
		this.probeMarker.visible = nativeVisible && this.probe !== null;
		this.rod.visible = this.view === 'rod' && !nativeVisible;
		this.engine.visible = this.view === 'engine';
		this.baseline.visible = this.baselineEnabled && this.view === 'rod';
		this.dimensions.visible = this.dimensionsEnabled && this.view === 'rod';
		this.forces.visible = this.forcesEnabled && this.view === 'rod' && !nativeVisible;
		if (this.operatingCycle) this.forces.visible = false;
		this.operating.visible =
			this.operatingCycle !== null &&
			!nativeVisible &&
			(this.view === 'rod' || this.exploded < 0.005);
	}

	/** The reference cylinder follows a complete four-stroke cycle; other cylinders are kinematics only. */
	setOperatingCycle(cycle: OperatingCycle | null) {
		if (this.operatingCycle === cycle) return;
		this.operatingCycle = cycle;
		if (cycle) {
			this.phase = normalizeOperatingPhase(this.phase);
			this.operatingMaximumForce = Math.max(
				1,
				cycle.envelope.maxSmallEndResultantN,
				cycle.envelope.maxBigEndResultantN,
				...cycle.samples.map((sample) => Math.abs(sample.gasForceN))
			);
		} else this.phase = normalizeCrankPhase(this.phase);
		this.refreshVisibility();
	}

	setDesign(params: DesignParams) {
		if (!Object.values(params).every(Number.isFinite)) return;
		if (
			this.structuralResult &&
			Object.entries(this.structuralResult.geometryParams).some(
				([key, value]) => params[key as keyof DesignParams] !== value
			)
		)
			this.setStructuralResult(null);
		this.targetDesign = { ...params };
		this.needsGeometry = true;
	}

	setView(view: DesignView) {
		if (view === this.view) return;
		this.view = view;
		this.refreshVisibility();
		this.floor.position.y = view === 'rod' ? -57 : -100;
		this.grid.position.y = this.floor.position.y + 0.2;
		this.resetView();
	}

	setRunning(running: boolean) {
		this.running = running;
	}
	setPhase(phaseDegrees: number) {
		if (Number.isFinite(phaseDegrees))
			this.phase = this.operatingCycle
				? normalizeOperatingPhase(phaseDegrees)
				: normalizeCrankPhase(phaseDegrees);
	}
	setOverlay(overlay: DesignOverlay) {
		this.overlay = overlay;
		this.rodMaterial.vertexColors = true;
		this.rodMaterial.color.set(0xffffff);
		this.rodMaterial.metalness =
			overlay === 'material' ? (this.renderPreset === 'technical' ? 0.3 : 0.78) : 0.12;
		this.rodMaterial.roughness =
			overlay === 'material' ? (this.renderPreset === 'technical' ? 0.5 : 0.25) : 0.58;
		this.rodMaterial.needsUpdate = true;
		this.colorOverlay();
	}
	setBaseline(enabled: boolean) {
		this.baselineEnabled = enabled;
		this.baseline.visible = enabled && this.view === 'rod';
	}
	setDimensions(enabled: boolean) {
		this.dimensionsEnabled = enabled;
		this.dimensions.visible = enabled && this.view === 'rod';
	}
	setForces(enabled: boolean) {
		this.forcesEnabled = enabled;
		this.refreshVisibility();
	}
	setExploded(amount: number) {
		this.targetExploded = Math.max(0, Math.min(1, amount));
	}

	resetView(immediate = false) {
		this.fitDirection(
			this.view === 'rod' ? new THREE.Vector3(235, 44, 290) : new THREE.Vector3(570, 320, 760),
			immediate
		);
	}

	setCameraView(view: DesignCameraView, immediate = false) {
		this.fitDirection(canonicalDesignDirection(view), immediate);
	}

	private fitDirection(direction: THREE.Vector3, immediate = false) {
		const bounds = this.viewBounds(),
			width = this.viewportWidth || 800,
			height = this.viewportHeight || 600;
		const frame =
			this.projection === 'orthographic'
				? designOrthographicFrame(
						bounds,
						direction,
						width,
						height,
						1,
						this.camera.up,
						this.viewAnnotations()
					)
				: designCameraFrame(
						bounds,
						direction,
						width,
						height,
						DESIGN_CAMERA_FOV,
						1,
						this.camera.up,
						this.viewAnnotations()
					);
		this.flushControls();
		if (immediate || this.reducedMotion) {
			this.camera.position.copy(frame.position);
			this.controls.target.copy(frame.target);
			if ('verticalSpanMm' in frame) this.setOrthographicSpan(frame.verticalSpanMm);
			this.controls.update();
			this.cameraGoal = null;
		} else this.cameraGoal = frame;
	}

	private viewAnnotations() {
		if (!this.dimensionsEnabled || this.view !== 'rod') return [];
		this.dimensions.updateWorldMatrix(true, true);
		return this.labels.map((label) => ({
			position: label.getWorldPosition(new THREE.Vector3()),
			halfWidthPx: label.userData.halfWidthPx as number,
			halfHeightPx: label.userData.halfHeightPx as number
		}));
	}

	private viewBounds() {
		if (this.view === 'engine') {
			const p = this.design,
				layout = deriveDesignLayout(p);
			const outer = layout.linerOuterRadiusMm,
				pitch = layout.borePitchMm;
			const halfDepth = layout.deckHeightMm / 2 + (outer * Math.sqrt(3)) / 2;
			return new THREE.Box3(
				new THREE.Vector3(
					-2.5 * pitch - p.rodDepthMm / 2 - 0.6 - outer,
					-Math.max(p.strokeMm / 2 + 32, 68),
					-halfDepth
				),
				new THREE.Vector3(
					3 * pitch + 36,
					(layout.deckHeightMm * Math.sqrt(3)) / 2 + outer / 2,
					halfDepth
				)
			);
		}
		this.root.updateWorldMatrix(true, true);
		const bounds = new THREE.Box3().setFromObject(
			this.structural.visible && this.structuralSurface ? this.structuralSurface : this.rod
		);
		if (this.dimensionsEnabled) {
			for (const child of this.dimensions.children) {
				if (child instanceof THREE.Line) bounds.union(new THREE.Box3().setFromObject(child));
				else bounds.expandByPoint(child.getWorldPosition(new THREE.Vector3()));
			}
		}
		if (this.baselineEnabled) bounds.union(new THREE.Box3().setFromObject(this.baseline));
		if (this.forcesEnabled) bounds.union(new THREE.Box3().setFromObject(this.forces));
		return bounds;
	}

	private reframe(previousBounds: THREE.Box3, previousWidth: number, previousHeight: number) {
		if (!previousWidth || !previousHeight) return;
		const nextBounds = this.viewBounds();
		if (this.camera instanceof THREE.OrthographicCamera) {
			const direction = this.camera.position.clone().sub(this.controls.target);
			const previous = designOrthographicFrame(
				previousBounds,
				direction,
				previousWidth,
				previousHeight,
				1,
				this.camera.up,
				this.viewAnnotations()
			);
			const span = (this.camera.top - this.camera.bottom) / this.camera.zoom;
			const ratio = span / previous.verticalSpanMm;
			const previousWithZoom = designOrthographicFrame(
				previousBounds,
				direction,
				previousWidth,
				previousHeight,
				ratio,
				this.camera.up,
				this.viewAnnotations()
			);
			const next = designOrthographicFrame(
				nextBounds,
				direction,
				this.viewportWidth,
				this.viewportHeight,
				ratio,
				this.camera.up,
				this.viewAnnotations()
			);
			const pan = this.controls.target.clone().sub(previousWithZoom.target);
			this.camera.position.copy(next.position).add(pan);
			this.controls.target.copy(next.target).add(pan);
			this.setOrthographicSpan(next.verticalSpanMm);
			this.cameraGoal = null;
			this.controls.update();
			return;
		}
		const transform = (position: THREE.Vector3, target: THREE.Vector3) => {
			const direction = position.clone().sub(target);
			const oldFit = designCameraFrame(
				previousBounds,
				direction,
				previousWidth,
				previousHeight,
				DESIGN_CAMERA_FOV,
				1,
				this.camera.up,
				this.viewAnnotations()
			);
			const zoom = direction.length() / oldFit.distance;
			const previous = designCameraFrame(
				previousBounds,
				direction,
				previousWidth,
				previousHeight,
				DESIGN_CAMERA_FOV,
				zoom,
				this.camera.up,
				this.viewAnnotations()
			);
			const pan = target.clone().sub(previous.target);
			const next = designCameraFrame(
				nextBounds,
				direction,
				this.viewportWidth,
				this.viewportHeight,
				DESIGN_CAMERA_FOV,
				zoom,
				this.camera.up,
				this.viewAnnotations()
			);
			position.copy(next.position).add(pan);
			target.copy(next.target).add(pan);
		};
		transform(this.camera.position, this.controls.target);
		if (this.cameraGoal) transform(this.cameraGoal.position, this.cameraGoal.target);
		this.controls.update();
	}

	capture() {
		this.renderScene();
		return this.canvas.toDataURL('image/png');
	}

	private colorOverlay() {
		const p = this.design;
		const field = designFieldCoefficients(p);
		this.fieldUniforms.uDesignBeam.value.set(
			field.start,
			field.end,
			field.span,
			this.overlay === 'material' ? 0 : this.overlay === 'stress' ? 1 : 2
		);
		this.fieldUniforms.uDesignStress.value.set(
			field.axial,
			field.bendingCoefficient,
			field.maximumStress
		);
		this.fieldUniforms.uDesignDeflection.value.set(
			field.bendingDeflectionCoefficient,
			field.shearDeflectionCoefficient,
			field.maximumDeflection
		);
		const c = new THREE.Color();
		for (const geometry of this.rodGeometries) {
			const positions = geometry.getAttribute('position');
			const normals = geometry.getAttribute('normal');
			let colors = geometry.getAttribute('color') as THREE.BufferAttribute | undefined;
			if (!colors || colors.count !== positions.count) {
				colors = new THREE.BufferAttribute(new Float32Array(positions.count * 3), 3);
				geometry.setAttribute('color', colors);
			}
			for (let i = 0; i < positions.count; i++) {
				const x = positions.getX(i),
					y = positions.getY(i);
				const onBore =
					Math.abs(normals.getZ(i)) < 0.2 &&
					(Math.abs(Math.hypot(x, y) - 25) < 0.04 ||
						Math.abs(Math.hypot(x, y - p.rodLengthMm) - 9) < 0.04);
				c.set(onBore ? 0xc8a66f : STEEL);
				colors.setXYZ(i, c.r, c.g, c.b);
			}
			colors.needsUpdate = true;
		}
	}

	private updateDesign(dt: number, now: number) {
		const alpha = this.reducedMotion ? 1 : 1 - Math.exp(-dt * 12);
		this.exploded += (this.targetExploded - this.exploded) * alpha;
		if (this.needsGeometry && now - this.lastGeometryBuild >= 32) {
			const previousBounds = this.viewBounds();
			const step = this.reducedMotion
				? 1
				: 1 - Math.exp(-Math.min(0.06, (now - this.lastGeometryBuild) / 1000) * 15);
			let moving = false;
			const next = { ...this.design };
			for (const key of Object.keys(next) as (keyof DesignParams)[]) {
				const delta = this.targetDesign[key] - next[key];
				if (Math.abs(delta) > 0.015) {
					next[key] += delta * step;
					moving = true;
				} else next[key] = this.targetDesign[key];
			}
			try {
				const old = this.rodGeometries;
				this.rodGeometries = createRodGeometries(next);
				for (const group of [this.rod, ...this.rodInstances]) {
					group.children.forEach((mesh, index) => {
						if (mesh instanceof THREE.Mesh) mesh.geometry = this.rodGeometries[index];
					});
				}
				old.forEach((geometry) => geometry.dispose());
				this.design = next;
			} catch {
				this.needsGeometry = false;
				return;
			}
			this.needsGeometry = moving;
			this.lastGeometryBuild = now;
			this.colorOverlay();
			if (now - this.dimensionRefresh > 140 || !moving) {
				this.refreshDimensions();
				this.dimensionRefresh = now;
			}
			this.updateForces();
			this.reframe(previousBounds, this.viewportWidth, this.viewportHeight);
		}
	}

	private updateEngine() {
		const p = this.design;
		const layout = deriveDesignLayout(p);
		const poses = crankTrainPoses(p, this.phase);
		const pitch = layout.borePitchMm;
		const radius = p.strokeMm / 2;
		for (let i = 0; i < poses.length; i++) {
			const pose = poses[i];
			const explodeOffset = pose.axis.clone().multiplyScalar(this.exploded * 70);
			this.rodInstances[i].position.copy(pose.pin).add(explodeOffset);
			this.rodInstances[i].quaternion.copy(pose.rodRotation);
			const piston = this.pistons[i];
			piston.position.copy(pose.piston).addScaledVector(explodeOffset, 2);
			piston.quaternion.setFromUnitVectors(Y, pose.axis);
			for (const child of piston.children) {
				if (child.name === 'piston-crown') {
					child.scale.set((p.boreMm - 1) / 2, 1, (p.boreMm - 1) / 2);
					child.position.y = layout.compressionHeightMm;
				}
				if (child.name === 'piston-ring') {
					child.scale.setScalar((p.boreMm - 0.8) / 2);
					child.position.y = layout.compressionHeightMm + child.userData.crownOffset;
				}
				if (child.name === 'piston-carrier') {
					child.scale.y = layout.compressionHeightMm - 17;
					child.position.y = (layout.compressionHeightMm + 3) / 2;
				}
			}
			const liner = this.liners[i];
			liner.position
				.copy(pose.axis)
				.multiplyScalar(layout.linerCenterDistanceMm)
				.addScaledVector(explodeOffset, 3);
			liner.position.x = pose.piston.x;
			liner.quaternion.setFromUnitVectors(Y, pose.axis);
			liner.scale.set(p.boreMm / 2, layout.linerLengthMm / 100, p.boreMm / 2);
			if (i % 2 === 0) {
				const station = pose.station;
				const pin = this.crankPins[station];
				pin.position.set((station - 2.5) * pitch, pose.pin.y, pose.pin.z);
				pin.scale.x = 2 * p.rodDepthMm + 5;
				for (let side = 0; side < 2; side++) {
					const web = this.crankWebs[station * 2 + side];
					web.position.set(
						(station - 2.5) * pitch + (side ? 1 : -1) * (p.rodDepthMm + 7),
						pose.pin.y / 2,
						pose.pin.z / 2
					);
					web.rotation.x = pose.journalAngle;
					web.scale.y = radius + 35;
				}
			}
		}
		for (let i = 0; i < this.journals.length; i++) {
			this.journals[i].position.x = (i - 3) * pitch;
			this.journals[i].scale.x = layout.mainJournalLengthMm / 16;
		}
		this.flywheel.position.x = pitch * 3 + 30;
		this.flywheel.rotation.x = (this.phase * Math.PI) / 180;
	}

	private updateOperating() {
		const cycle = this.operatingCycle;
		if (!cycle) return;
		this.operating.visible =
			!this.structural.visible && (this.view === 'rod' || this.exploded < 0.005);
		if (!this.operating.visible) return;
		const sample = operatingVisualSample(cycle, this.phase);
		const draw = (
			arrow: THREE.ArrowHelper,
			force: THREE.Vector3,
			anchor: THREE.Vector3,
			headAtAnchor = false
		) => {
			const magnitude = force.length();
			const length = (55 * magnitude) / this.operatingMaximumForce;
			arrow.visible = length > 1.25;
			if (!arrow.visible) return;
			force.divideScalar(magnitude);
			arrow.setDirection(force);
			arrow.setLength(length, Math.min(7, length * 0.3), Math.min(3.5, length * 0.15));
			arrow.position.copy(anchor);
			if (headAtAnchor) arrow.position.addScaledVector(force, -length);
		};
		const smallForce = new THREE.Vector3(...sample.smallEndForceLocalN);
		const bigForce = new THREE.Vector3(...sample.bigEndForceLocalN);
		if (this.view === 'rod') {
			this.operating.rotation.copy(this.rod.rotation);
			draw(
				this.operatingArrows.small,
				smallForce,
				new THREE.Vector3(0, this.design.rodLengthMm, 0)
			);
			draw(this.operatingArrows.big, bigForce, new THREE.Vector3());
			this.operatingArrows.gas.visible = false;
		} else {
			this.operating.rotation.set(0, 0, 0);
			const rod = this.rodInstances[0];
			const bigPin = rod.position.clone();
			const smallPin = new THREE.Vector3(0, this.design.rodLengthMm, 0)
				.applyQuaternion(rod.quaternion)
				.add(bigPin);
			draw(this.operatingArrows.small, smallForce.applyQuaternion(rod.quaternion), smallPin);
			draw(this.operatingArrows.big, bigForce.applyQuaternion(rod.quaternion), bigPin);
			const axis = Y.clone().applyQuaternion(this.pistons[0].quaternion);
			const crown = this.pistons[0].getObjectByName('piston-crown');
			const gasAnchor = this.pistons[0].position
				.clone()
				.addScaledVector(axis, (crown?.position.y ?? 0) + 11);
			draw(this.operatingArrows.gas, axis.multiplyScalar(-sample.gasForceN), gasAnchor, true);
		}
	}

	private resize = () => {
		const rect = this.canvas.getBoundingClientRect();
		if (rect.width < 1 || rect.height < 1) return;
		if (rect.width === this.viewportWidth && rect.height === this.viewportHeight) return;
		const previousBounds = this.viewBounds(),
			previousWidth = this.viewportWidth,
			previousHeight = this.viewportHeight;
		this.viewportWidth = rect.width;
		this.viewportHeight = rect.height;
		this.renderer.setSize(rect.width, rect.height, false);
		if (this.camera instanceof THREE.PerspectiveCamera)
			this.camera.aspect = rect.width / rect.height;
		else this.setOrthographicSpan((this.camera.top - this.camera.bottom) / this.camera.zoom);
		this.camera.updateProjectionMatrix();
		this.reframe(previousBounds, previousWidth, previousHeight);
	};
	private cancelCameraGoal = () => {
		this.cameraGoal = null;
	};
	private onContextLost = (event: Event) => {
		event.preventDefault();
		this.contextLost = true;
	};
	private onContextRestored = () => {
		this.contextLost = false;
	};
	private tick = (now: number) => {
		if (this.disposed) return;
		this.frame = requestAnimationFrame(this.tick);
		const dt = this.lastTime ? Math.min((now - this.lastTime) / 1000, 0.05) : 1 / 60;
		this.lastTime = now;
		if (!this.rendererReady || document.hidden || this.contextLost) return;
		this.updateDesign(dt, now);
		if (this.running && this.exploded < 0.005)
			this.phase = this.operatingCycle
				? normalizeOperatingPhase(this.phase + dt * 48)
				: normalizeCrankPhase(this.phase + dt * 48);
		if (this.view === 'engine') this.updateEngine();
		this.updateOperating();
		const cameraWasMuted = this.cameraEventsMuted;
		if (this.cameraGoal?.emit === false) this.cameraEventsMuted = true;
		if (this.cameraGoal) {
			const alpha = 1 - Math.exp(-dt * 4.6);
			const next = interpolateDesignCamera(
				this.camera.position,
				this.controls.target,
				this.cameraGoal.position,
				this.cameraGoal.target,
				alpha
			);
			this.camera.position.copy(next.position);
			this.controls.target.copy(next.target);
			if (
				this.cameraGoal.verticalSpanMm !== undefined &&
				this.camera instanceof THREE.OrthographicCamera
			)
				this.setOrthographicSpan(
					THREE.MathUtils.lerp(
						(this.camera.top - this.camera.bottom) / this.camera.zoom,
						this.cameraGoal.verticalSpanMm,
						alpha
					)
				);
			if (this.camera.position.distanceTo(this.cameraGoal.position) < 0.05) {
				this.camera.position.copy(this.cameraGoal.position);
				this.controls.target.copy(this.cameraGoal.target);
				if (this.cameraGoal.verticalSpanMm !== undefined)
					this.setOrthographicSpan(this.cameraGoal.verticalSpanMm);
				this.cameraGoal = null;
			}
		}
		this.controls.update();
		this.cameraEventsMuted = cameraWasMuted;
		const inverse = this.dimensions.getWorldQuaternion(new THREE.Quaternion()).invert();
		const labelPosition = new THREE.Vector3();
		for (const label of this.labels) {
			label.quaternion.copy(inverse).multiply(this.camera.quaternion);
			const depth = -label
				.getWorldPosition(labelPosition)
				.applyMatrix4(this.camera.matrixWorldInverse).z;
			const worldPerPixel =
				this.camera instanceof THREE.OrthographicCamera
					? (this.camera.top - this.camera.bottom) /
						this.camera.zoom /
						Math.max(1, this.viewportHeight)
					: (2 * Math.max(1, depth) * Math.tan(THREE.MathUtils.degToRad(DESIGN_CAMERA_FOV / 2))) /
						Math.max(1, this.viewportHeight);
			// A 96px canvas with 40px type: 34px projected height gives readable 14px labels.
			label.scale.setScalar((34 * worldPerPixel) / 10.7);
		}
		this.renderScene();
		if (now - this.lastReport > 120) {
			this.callbacks.onPhase?.(this.phase);
			this.lastReport = now;
		}
	};

	dispose() {
		this.disposed = true;
		cancelAnimationFrame(this.frame);
		this.observer.disconnect();
		this.controls.removeEventListener('start', this.cancelCameraGoal);
		this.controls.removeEventListener('change', this.onCameraChange);
		this.controls.dispose();
		this.canvas.removeEventListener('pointerdown', this.onProbeDown);
		this.canvas.removeEventListener('pointerup', this.onProbeUp);
		this.canvas.removeEventListener('webglcontextlost', this.onContextLost);
		this.canvas.removeEventListener('webglcontextrestored', this.onContextRestored);
		disposeTree(this.scene);
		disposeTree(this.triad);
		this.environment?.dispose();
		this.renderer.dispose();
	}
}
