import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
	initialLabState,
	type ComponentRecord,
	type LabCamera,
	type LabState,
	type LabView
} from '$lib/engine/lab-state';
import type { PartId } from '$lib/engine/types';
import {
	classifySource,
	sourceFinish,
	sourceOffset,
	sourceRecord,
	makeFinish,
	sourceContactSeparation,
	removeRedundantSourceTriangles,
	type Finish
} from './source-components';
import { EducationalMechanism, matchesComponent } from './educational-mechanism';
import { EngineSection, MovingSectionCaps } from './section-plane';
import { createStudioEnvironment } from './studio-environment';
import {
	createPartsLayout,
	sourceLayoutTransform,
	layoutVisibleBounds,
	LAYOUT_FLOOR,
	type PartsLayout,
	type LayoutPlacement
} from './parts-layout';

export type EngineView = LabView;
export type SceneStats = {
	parts: number;
	triangles: number;
	renderer: string;
	educationalParts: number;
};
export type SceneSnapshot = { phase: number; camera: LabCamera };
type Part = {
	id: string;
	parent: PartId;
	proxy: THREE.Mesh;
	offset: THREE.Vector3;
	center: THREE.Vector3;
	contactZ: number;
	removal: number;
	targetRemoval: number;
	index: number;
};
type Batch = {
	mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshPhysicalMaterial>;
	parent: PartId;
	finish: Finish;
	indices: number[];
	hasVisibleParts: boolean;
};

const TABLE_WIDTH = 1024;
const BACKGROUND = 0x0b0e12;

export class EngineStudio {
	private renderer: THREE.WebGLRenderer;
	private scene = new THREE.Scene();
	private camera = new THREE.PerspectiveCamera(34, 1, 0.12, 100);
	private controls: OrbitControls;
	private parts: Part[] = [];
	private batches: Batch[] = [];
	private educational: EducationalMechanism;
	private section = new EngineSection();
	private movingCaps = new MovingSectionCaps();
	private exteriorPlanes = [this.section.plane];
	private fullSourceBounds = new THREE.Box3();
	private partsLayout: PartsLayout | null = null;
	private layoutData = new Float32Array(TABLE_WIDTH * 8);
	private layoutTable = new THREE.DataTexture(
		this.layoutData,
		TABLE_WIDTH,
		2,
		THREE.RGBAFormat,
		THREE.FloatType
	);
	private layoutStage = 0;
	private layoutFitPending = false;
	private layoutDecor = new THREE.Group();
	private layoutResources: {
		geometry: THREE.BufferGeometry;
		material: THREE.Material;
		texture?: THREE.Texture;
	}[] = [];
	private keyLight: THREE.DirectionalLight;
	private studioEnvironmentMode = '';
	private environmentSpan = 12;
	private tableData = new Float32Array(TABLE_WIDTH * 4);
	private partTable = new THREE.DataTexture(
		this.tableData,
		TABLE_WIDTH,
		1,
		THREE.RGBAFormat,
		THREE.FloatType
	);
	private uniforms = {
		uExplosion: { value: 0 },
		uLayout: { value: 0 },
		uLayoutTable: { value: this.layoutTable },
		uPartState: { value: this.partTable },
		uCutActive: { value: 0 },
		uCutPlane: { value: new THREE.Vector4() },
		uStudyActive: { value: 0 },
		uStudyPlaneA: { value: new THREE.Vector4() },
		uStudyPlaneB: { value: new THREE.Vector4() }
	};
	private state: LabState = { ...initialLabState, flows: [], hidden: [], removed: [] };
	private targetPosition = new THREE.Vector3();
	private targetLook = new THREE.Vector3();
	private cameraMoving = false;
	private dragging = false;
	private pointerStart = new THREE.Vector2();
	private raf = 0;
	private lastFrame = 0;
	private lastPhaseReport = 0;
	private disposed = false;
	private loaded = false;
	private phase = 0;
	private time = 0;
	private observer: ResizeObserver;
	private environment: THREE.WebGLRenderTarget;
	private composer: EffectComposer;
	private ao: GTAOPass;
	private floor: THREE.Mesh;
	private reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
	private cancelVisibility: () => void;
	private transitionPending = false;
	private capsNeedRefresh = false;
	private registry: ComponentRecord[] = [];

	constructor(
		private host: HTMLDivElement,
		private onselect: (id: string | null) => void,
		private onphase: (phase: number) => void = () => {},
		private oninteraction: () => void = () => {},
		private onisolate: (id: string) => void = () => {}
	) {
		this.partTable.needsUpdate = true;
		this.renderer = new THREE.WebGLRenderer({
			antialias: true,
			stencil: true,
			powerPreference: 'high-performance'
		});
		this.renderer.setClearColor(BACKGROUND);
		this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.25));
		this.renderer.outputColorSpace = THREE.SRGBColorSpace;
		this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
		this.renderer.toneMappingExposure = 0.9;
		this.renderer.shadowMap.enabled = true;
		this.renderer.shadowMap.autoUpdate = false;
		this.renderer.localClippingEnabled = true;
		this.renderer.shadowMap.type = THREE.PCFShadowMap;
		this.renderer.domElement.setAttribute(
			'aria-label',
			'Interactive engine engineering studio. Drag to orbit, scroll to zoom, and click an individual component.'
		);
		this.renderer.domElement.style.touchAction = 'none';
		this.host.append(this.renderer.domElement);
		this.scene.background = new THREE.Color(BACKGROUND);
		this.scene.fog = new THREE.Fog(BACKGROUND, 19, 40);
		const pmrem = new THREE.PMREMGenerator(this.renderer),
			room = createStudioEnvironment();
		this.environment = pmrem.fromScene(room.scene, 0.035);
		this.scene.environment = this.environment.texture;
		this.scene.environmentIntensity = 0.65;
		room.dispose();
		pmrem.dispose();
		RectAreaLightUniformsLib.init();
		this.scene.add(new THREE.HemisphereLight(0xb0c4de, 0x35465b, 0.58));
		const key = (this.keyLight = new THREE.DirectionalLight(0xffedd4, 1.8));
		key.position.set(-4, 6, 6);
		key.castShadow = true;
		key.shadow.mapSize.set(2048, 2048);
		Object.assign(key.shadow.camera, {
			left: -8,
			right: 8,
			top: 8,
			bottom: -8,
			near: 0.5,
			far: 25
		});
		key.shadow.bias = -0.0001;
		key.shadow.normalBias = 0.008;
		key.shadow.radius = 3;
		this.scene.add(key);
		const fill = new THREE.DirectionalLight(0xb2c6e1, 0.75);
		fill.position.set(6, 3, -3);
		this.scene.add(fill);
		const rim = new THREE.DirectionalLight(0xbdd1ec, 0.85);
		rim.position.set(-5, 4, -5);
		this.scene.add(rim);
		const softbox = new THREE.RectAreaLight(0xffe7c5, 1.4, 4.5, 2.6);
		softbox.position.set(-5, 6, 4);
		softbox.lookAt(0, 0, 0);
		this.scene.add(softbox);
		const strip = new THREE.RectAreaLight(0xaec8e8, 1.1, 1.1, 5);
		strip.position.set(5, 3, -4);
		strip.lookAt(0, 0, 0);
		this.scene.add(strip);
		this.floor = new THREE.Mesh(
			new THREE.PlaneGeometry(800, 800),
			new THREE.MeshPhysicalMaterial({
				color: 0x242d36,
				roughness: 0.9,
				metalness: 0,
				specularIntensity: 0.04,
				envMapIntensity: 0.12
			})
		);
		this.floor.rotation.x = -Math.PI / 2;
		this.floor.position.y = -1.884;
		this.floor.receiveShadow = true;
		this.scene.add(this.floor);
		this.educational = new EducationalMechanism();
		this.educational.group.visible = false;
		this.scene.add(this.educational.group);
		this.scene.add(this.section.group, this.movingCaps.group, this.layoutDecor);
		this.layoutDecor.visible = false;
		const target = new THREE.WebGLRenderTarget(1, 1, {
			type: THREE.HalfFloatType,
			samples: 2,
			stencilBuffer: true
		});
		this.composer = new EffectComposer(this.renderer, target);
		this.composer.addPass(new RenderPass(this.scene, this.camera));
		this.ao = new GTAOPass(this.scene, this.camera, 1, 1);
		// GTAOPass creates this DepthStencilFormat G-buffer internally; r186 typings omit it.
		(
			this.ao as GTAOPass & { normalRenderTarget: THREE.WebGLRenderTarget }
		).normalRenderTarget.stencilBuffer = true;
		this.ao.blendIntensity = 0.62;
		this.ao.updateGtaoMaterial({
			radius: 0.25,
			thickness: 0.3,
			scale: 1.1,
			distanceExponent: 1.3,
			distanceFallOff: 1,
			samples: 8,
			screenSpaceRadius: false
		});
		this.ao.updatePdMaterial({ samples: 8, radius: 4 });
		this.prepareMaterial(this.ao.normalMaterial, false);
		this.composer.addPass(this.ao);
		this.composer.addPass(new OutputPass());
		this.camera.position.set(7, 4.2, 8);
		this.controls = new OrbitControls(this.camera, this.renderer.domElement);
		this.controls.target.set(0, 0, 0);
		this.controls.enableDamping = true;
		this.controls.dampingFactor = 0.085;
		this.controls.minDistance = 0.3;
		this.controls.maxDistance = 32;
		this.controls.maxPolarAngle = Math.PI * 0.55;
		this.controls.addEventListener('start', () => {
			this.dragging = true;
			this.cameraMoving = false;
			this.oninteraction();
			this.invalidate();
		});
		this.controls.addEventListener('end', () => {
			this.dragging = false;
			this.invalidate();
		});
		this.controls.addEventListener('change', this.invalidate);
		this.renderer.domElement.addEventListener('pointerdown', this.pointerDown);
		this.renderer.domElement.addEventListener('pointerup', this.pointerUp);
		this.renderer.domElement.addEventListener('dblclick', this.doubleClick);
		this.observer = new ResizeObserver(this.resize);
		this.observer.observe(host);
		this.resize();
		const visibility = () => {
			if (document.hidden) {
				cancelAnimationFrame(this.raf);
				this.raf = 0;
				this.lastFrame = 0;
			} else this.invalidate();
		};
		document.addEventListener('visibilitychange', visibility);
		this.cancelVisibility = () => document.removeEventListener('visibilitychange', visibility);
	}

	async load(
		onprogress: (percent: number) => void,
		oncomponents: (registry: ComponentRecord[]) => void = () => {}
	): Promise<SceneStats> {
		const loaded = await new GLTFLoader().loadAsync('/models/engine.glb', (event) => {
			if (event.total) onprogress(Math.min(95, Math.round((event.loaded / event.total) * 95)));
		});
		if (this.disposed) {
			loaded.scene.traverse((o) => {
				if (o instanceof THREE.Mesh) o.geometry.dispose();
			});
			throw new Error('Scene closed');
		}
		const grouped = new Map<
			string,
			{ parent: PartId; finish: Finish; geometries: THREE.BufferGeometry[]; indices: number[] }
		>();
		let triangles = 0;
		const transform = new THREE.Matrix4().makeRotationX(-Math.PI / 2);
		transform.premultiply(new THREE.Matrix4().makeScale(0.003, 0.003, 0.003));
		transform.premultiply(new THREE.Matrix4().makeTranslation(0, -1.865481262, 0));
		loaded.scene.traverse((object) => {
			if (!(object instanceof THREE.Mesh)) return;
			const bounds = new THREE.Box3().setFromBufferAttribute(
				object.geometry.getAttribute('position') as THREE.BufferAttribute
			);
			const parent = classifySource(object.name, bounds),
				finish = sourceFinish(object.name, parent, bounds);
			const geometry = object.geometry;
			// Only these two source exports contain repeated same-winding triangles.
			if (object.name === 'Frame_Object_488' || object.name === 'Frame_Object_491')
				removeRedundantSourceTriangles(geometry);
			geometry.applyMatrix4(transform);
			geometry.computeBoundingBox();
			geometry.computeBoundingSphere();
			const center = geometry.boundingBox!.getCenter(new THREE.Vector3()),
				size = geometry.boundingBox!.getSize(new THREE.Vector3());
			const offset = sourceOffset(object.name, parent, center, size),
				index = this.parts.length;
			const vertexCount = geometry.getAttribute('position').count;
			const offsets = new Float32Array(vertexCount * 3),
				ids = new Float32Array(vertexCount),
				contacts = new Float32Array(vertexCount).fill(sourceContactSeparation(object.name));
			for (let i = 0; i < vertexCount; i++) {
				offsets.set(offset.toArray(), i * 3);
				ids[i] = index + 1;
			}
			geometry.setAttribute('explosionOffset', new THREE.BufferAttribute(offsets, 3));
			geometry.setAttribute('sourcePart', new THREE.BufferAttribute(ids, 1));
			geometry.setAttribute('contactSeparation', new THREE.BufferAttribute(contacts, 1));
			const proxy = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
			proxy.userData.componentId = object.name;
			this.parts.push({
				id: object.name,
				parent,
				proxy,
				offset,
				center,
				contactZ: sourceContactSeparation(object.name),
				removal: 0,
				targetRemoval: 0,
				index
			});
			const count = (geometry.index?.count ?? vertexCount) / 3;
			triangles += count;
			this.registry.push(sourceRecord(object.name, parent, finish, count));
			const key = `${parent}:${finish}`;
			if (!grouped.has(key)) grouped.set(key, { parent, finish, geometries: [], indices: [] });
			grouped.get(key)!.geometries.push(geometry);
			grouped.get(key)!.indices.push(index);
			(Array.isArray(object.material) ? object.material : [object.material]).forEach((m) =>
				m.dispose()
			);
		});
		for (const { parent, finish, geometries, indices } of grouped.values()) {
			const geometry = mergeGeometries(geometries, false);
			if (!geometry) throw new Error('Cannot batch purchased geometry');
			const material = makeFinish(finish);
			// Purchased geometry has no UV/tangent basis; anisotropy's derivative frame is invalid here.
			material.anisotropy = 0;
			this.prepareMaterial(material, true);
			const mesh = new THREE.Mesh(geometry, material);
			mesh.frustumCulled = false;
			mesh.castShadow = true;
			mesh.receiveShadow = true;
			const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
			this.prepareMaterial(depth, false);
			mesh.customDepthMaterial = depth;
			this.batches.push({ mesh, parent, finish, indices, hasVisibleParts: true });
			this.scene.add(mesh);
		}
		this.fullSourceBounds.copy(this.sourceBounds());
		this.section.setBounds(this.fullSourceBounds);
		this.educational.alignToSource(
			this.parts
				.filter((part) => /^Frame_Object_0(0[3-9]|1[0-4])$/.test(part.id))
				.map((part) => part.center)
		);
		this.registry.push(...this.educational.registry);
		this.partsLayout = createPartsLayout([
			...this.parts.map((part) => ({
				id: part.id,
				parent: part.parent,
				kind: 'source' as const,
				bounds: part.proxy.geometry.boundingBox!.clone()
			})),
			...this.educational.getLayoutInputs()
		]);
		for (const part of this.parts) {
			const placement = this.partsLayout.placements.get(part.id)!;
			this.layoutData.set([...placement.position.toArray(), placement.scale], part.index * 4);
			this.layoutData.set([...placement.center.toArray(), 0], (TABLE_WIDTH + part.index) * 4);
		}
		this.layoutTable.needsUpdate = true;
		this.buildLayoutDecor();
		this.loaded = true;
		this.refreshPartState();
		this.capsNeedRefresh =
			this.state.display === 'section' &&
			this.state.explosion <= 0.001 &&
			(this.uniforms.uExplosion.value !== this.state.explosion ||
				this.parts.some((part) => part.removal !== part.targetRemoval));
		this.refreshSection();
		this.updateTeaching(0);
		this.syncStudyPlanes();
		onprogress(100);
		oncomponents(this.registry.map((record) => ({ ...record })));
		this.fit(false);
		this.invalidate();
		return {
			parts: this.parts.length,
			triangles,
			educationalParts: this.educational.registry.length,
			renderer: 'WebGL 2 · component-aware GPU batches'
		};
	}

	private updateTeaching(delta: number) {
		const atlas = this.state.display === 'layout' || this.layoutStage > 0;
		this.educational.setLayoutPresentation(
			atlas ? this.partsLayout : null,
			this.uniforms.uLayout.value,
			THREE.MathUtils.smoothstep(this.layoutStage, 0, 1)
		);
		this.educational.update(
			atlas ? 0 : this.phase,
			atlas ? { ...this.state, display: 'layout' } : this.state,
			this.uniforms.uExplosion.value,
			this.time,
			delta,
			this.exteriorPlanes
		);
	}
	private atlasVisible(placement: LayoutPlacement) {
		return (
			(placement.kind === 'source' || this.state.internals) &&
			!this.state.hidden.some((id) => matchesComponent(placement.id, placement.parent, id)) &&
			(!this.state.isolated ||
				!this.state.selected ||
				matchesComponent(placement.id, placement.parent, this.state.selected))
		);
	}
	private syncLayoutEnvironment() {
		const active = this.layoutStage > 0 || this.state.display === 'layout';
		this.layoutDecor.visible = active && !this.state.isolated;
		for (const child of this.layoutDecor.children)
			((child as THREE.Mesh).material as THREE.Material).opacity =
				this.uniforms.uLayout.value *
				(((child as THREE.Mesh).material as THREE.Material).userData.layoutOpacity ?? 1);
		const expanded = this.state.explosion > 0.05 || this.state.removed.length > 0;
		const mode = active
			? 'atlas'
			: expanded
				? `expanded:${this.state.explosion.toFixed(3)}:${this.state.internals}:${this.state.isolated}:${this.state.selected}:${this.state.removed.join('|')}`
				: 'studio';
		if (mode === this.studioEnvironmentMode) return;
		this.studioEnvironmentMode = mode;
		// A camera fitted to widely separated parts must not disappear into the compact studio fog.
		let span = 12,
			floorY = LAYOUT_FLOOR;
		if (active && this.partsLayout)
			span = this.partsLayout.bounds.getSize(new THREE.Vector3()).length();
		else if (expanded) {
			const bounds = this.sourceBounds();
			if (this.state.internals) bounds.union(this.educational.bounds(null, false, true));
			span = Math.max(12, bounds.getSize(new THREE.Vector3()).length());
			floorY = Math.min(LAYOUT_FLOOR, bounds.min.y - 0.08);
		}
		this.environmentSpan = span;
		this.refreshStudioFog();
		this.keyLight.position.set(-span * 0.34, span * 0.5, span * 0.5);
		const shadow = this.keyLight.shadow.camera;
		shadow.left = shadow.bottom = -span * 0.7;
		shadow.right = shadow.top = span * 0.7;
		shadow.far = Math.max(25, span * 3);
		shadow.updateProjectionMatrix();
		if (!active && !expanded) {
			this.keyLight.position.set(-4, 6, 6);
			shadow.left = shadow.bottom = -8;
			shadow.right = shadow.top = 8;
			shadow.far = 25;
			shadow.updateProjectionMatrix();
		}
		this.floor.position.y =
			!active && this.state.display === 'section'
				? Math.min(floorY, this.fullSourceBounds.min.y - 0.14)
				: floorY;
	}
	private refreshStudioFog() {
		if (this.studioEnvironmentMode === 'studio') {
			this.scene.fog = new THREE.Fog(BACKGROUND, 19, 40);
			return;
		}
		// Fade the distant floor beyond every displayed component, never across the expanded engine.
		const distance = this.targetPosition.distanceTo(this.targetLook);
		const far = Math.min(this.camera.far * 0.95, distance + this.environmentSpan * 1.5);
		const near = Math.min(far * 0.88, distance + this.environmentSpan * 0.6);
		this.scene.fog = new THREE.Fog(BACKGROUND, Math.max(1, near), Math.max(2, far));
	}

	private buildLayoutDecor() {
		if (!this.partsLayout) return;
		const names: Record<PartId, string> = {
			block: 'BLOCK & MECHANISM',
			heads: 'HEADS & VALVE GEAR',
			turbo: 'TURBOCHARGERS',
			air: 'AIR INDUCTION',
			cooling: 'COOLING SYSTEM',
			fuel: 'FUEL DELIVERY',
			exhaust: 'EXHAUST SYSTEM',
			flywheel: 'FLYWHEEL & DRIVE',
			accessories: 'ACCESSORIES'
		};
		for (const group of this.partsLayout.groups) {
			const size = group.bounds.getSize(new THREE.Vector3());
			const panelGeometry = new THREE.PlaneGeometry(size.x, size.z);
			const panelMaterial = new THREE.MeshBasicMaterial({
				color: 0x14202a,
				transparent: true,
				opacity: 0,
				depthWrite: false
			});
			panelMaterial.userData.layoutOpacity = 0.75;
			const panel = new THREE.Mesh(panelGeometry, panelMaterial);
			panel.rotation.x = -Math.PI / 2;
			panel.position.copy(group.bounds.getCenter(new THREE.Vector3()));
			panel.position.y = LAYOUT_FLOOR + 0.012;
			this.layoutDecor.add(panel);
			this.layoutResources.push({ geometry: panelGeometry, material: panelMaterial });
			const points: THREE.Vector3[] = [];
			const addLine = (x1: number, z1: number, x2: number, z2: number) =>
				points.push(
					new THREE.Vector3(x1, LAYOUT_FLOOR + 0.023, z1),
					new THREE.Vector3(x2, LAYOUT_FLOOR + 0.023, z2)
				);
			for (const placement of this.partsLayout.placements.values()) {
				if (placement.parent !== group.parent) continue;
				const { x, z } = placement.position,
					half = 0.505,
					tick = 0.12;
				for (const signX of [-1, 1])
					for (const signZ of [-1, 1]) {
						addLine(
							x + signX * half,
							z + signZ * half,
							x + signX * (half - tick),
							z + signZ * half
						);
						addLine(
							x + signX * half,
							z + signZ * half,
							x + signX * half,
							z + signZ * (half - tick)
						);
					}
			}
			const gridGeometry = new THREE.BufferGeometry().setFromPoints(points);
			const gridMaterial = new THREE.LineBasicMaterial({
				color: 0x456171,
				transparent: true,
				opacity: 0,
				depthWrite: false
			});
			gridMaterial.userData.layoutOpacity = 0.3;
			const grid = new THREE.LineSegments(gridGeometry, gridMaterial);
			this.layoutDecor.add(grid);
			this.layoutResources.push({ geometry: gridGeometry, material: gridMaterial });
			const width = size.x - 0.42;
			const canvas = document.createElement('canvas');
			canvas.width = Math.ceil(width * 100);
			canvas.height = 100;
			const context = canvas.getContext('2d')!;
			context.clearRect(0, 0, canvas.width, 100);
			context.fillStyle = '#d5b276';
			context.font = '600 34px Arial';
			context.fillText(names[group.parent], 0, 40);
			context.fillStyle = '#93a2ae';
			context.font = '23px Arial';
			context.fillText(
				`${group.sourceCount} source${group.teachingCount ? ` + ${group.teachingCount} teaching` : ''} · ${group.count} parts`,
				0,
				78
			);
			const texture = new THREE.CanvasTexture(canvas);
			texture.colorSpace = THREE.SRGBColorSpace;
			const geometry = new THREE.PlaneGeometry(width, 1);
			const material = new THREE.MeshBasicMaterial({
				map: texture,
				transparent: true,
				depthWrite: false,
				side: THREE.DoubleSide
			});
			const label = new THREE.Mesh(geometry, material);
			label.rotation.x = -Math.PI / 2;
			label.position.set(
				group.bounds.min.x + 0.21 + width / 2,
				LAYOUT_FLOOR + 0.035,
				group.bounds.min.z + 0.5
			);
			this.layoutDecor.add(label);
			this.layoutResources.push({ geometry, material, texture });
		}
	}

	private prepareMaterial(material: THREE.Material, surface: boolean) {
		const original = material.onBeforeCompile;
		const previousKey = material.customProgramCacheKey();
		material.onBeforeCompile = (shader, renderer) => {
			original.call(material, shader, renderer);
			Object.assign(shader.uniforms, this.uniforms);
			shader.vertexShader =
				'uniform float uExplosion; uniform float uLayout; uniform sampler2D uLayoutTable; uniform float uCutActive; uniform sampler2D uPartState; attribute float sourcePart; attribute float contactSeparation; attribute vec3 explosionOffset; attribute float teachingPart; varying vec4 vSourceData; varying float vTeachingSurface; varying vec3 vModelWorldPosition;\n' +
				shader.vertexShader;
			shader.vertexShader = shader.vertexShader.replace(
				'#include <begin_vertex>',
				`#include <begin_vertex>
				vSourceData=vec4(0.0);vTeachingSurface=teachingPart;
				if(sourcePart>.5){vec4 part=texture2D(uPartState,vec2((sourcePart-.5)/${TABLE_WIDTH.toFixed(1)},.5));transformed+=explosionOffset*max(uExplosion,part.r);transformed.z+=contactSeparation*uCutActive*(1.0-clamp(max(uExplosion,part.r)*100.0,0.0,1.0));vec4 atlas=texture2D(uLayoutTable,vec2((sourcePart-.5)/${TABLE_WIDTH.toFixed(1)},.25));vec3 center=texture2D(uLayoutTable,vec2((sourcePart-.5)/${TABLE_WIDTH.toFixed(1)},.75)).xyz;transformed=mix(transformed,(position-center)*atlas.w+atlas.xyz,uLayout);vSourceData=vec4(part.rgb,1.0);}`
			);
			// Reject invisible source bodies before rasterization, including AO and shadow passes.
			// Fragment-only discard can cause severe overdraw when isolating a small component.
			shader.vertexShader = shader.vertexShader.replace(
				'#include <project_vertex>',
				`vec4 dieselWorldPosition=vec4(transformed,1.0);
#ifdef USE_INSTANCING
dieselWorldPosition=instanceMatrix*dieselWorldPosition;
#endif
vModelWorldPosition=(modelMatrix*dieselWorldPosition).xyz;
#include <project_vertex>
if(vSourceData.a>.5 && vSourceData.g>.5)gl_Position=vec4(2.0,2.0,2.0,1.0);`
			);
			shader.fragmentShader =
				'varying vec4 vSourceData; varying float vTeachingSurface; varying vec3 vModelWorldPosition; uniform float uCutActive; uniform vec4 uCutPlane; uniform float uStudyActive; uniform vec4 uStudyPlaneA; uniform vec4 uStudyPlaneB;\n' +
				shader.fragmentShader;
			shader.fragmentShader = shader.fragmentShader.replace(
				'#include <clipping_planes_fragment>',
				`#include <clipping_planes_fragment>
				if(vSourceData.a>.5 && vSourceData.g>.5)discard;
    if((vSourceData.a>.5||vTeachingSurface>.5)&&uCutActive>.5&&dot(vec4(vModelWorldPosition,1.0),uCutPlane)<-.00001)discard;
    if(vTeachingSurface>.5&&uStudyActive>.5&&(dot(vec4(vModelWorldPosition,1.0),uStudyPlaneA)<-.00001||dot(vec4(vModelWorldPosition,1.0),uStudyPlaneB)<-.00001))discard;`
			);
			if (surface)
				shader.fragmentShader = shader.fragmentShader.replace(
					'#include <opaque_fragment>',
					'outgoingLight+=vec3(1.0,.55,.13)*vSourceData.b*.28;\n#include <opaque_fragment>'
				);
		};
		material.customProgramCacheKey = () =>
			`${previousKey}-diesel-component-table-v6-${surface ? 'surface' : 'depth'}-${material.type}`;
	}

	update(next: LabState) {
		if (this.disposed) return;
		const previous = this.state;
		if (previous.running !== next.running) this.lastFrame = performance.now();
		this.state = {
			...next,
			flows: [...next.flows],
			hidden: [...next.hidden],
			removed: [...next.removed],
			section: { ...next.section }
		};
		if (previous.seekToken !== next.seekToken) {
			this.phase = ((next.phase % 720) + 720) % 720;
			this.onphase(this.phase);
		}
		this.refreshPartState();
		this.capsNeedRefresh =
			this.state.display === 'section' &&
			this.state.explosion <= 0.001 &&
			(this.uniforms.uExplosion.value !== this.state.explosion ||
				this.parts.some((part) => part.removal !== part.targetRemoval));
		this.refreshSection();
		this.updateTeaching(0);
		this.syncStudyPlanes();
		const refit =
			previous.view !== next.view ||
			previous.resetSignal !== next.resetSignal ||
			previous.display !== next.display ||
			previous.explosion !== next.explosion ||
			previous.isolated !== next.isolated ||
			previous.internals !== next.internals ||
			(next.display === 'section' &&
				(previous.section.axis !== next.section.axis ||
					previous.section.flipped !== next.section.flipped)) ||
			(next.isolated && previous.selected !== next.selected) ||
			previous.focusToken !== next.focusToken ||
			previous.removed.join('|') !== next.removed.join('|');
		if (
			next.camera &&
			(!previous.camera ||
				previous.resetSignal !== next.resetSignal ||
				previous.camera.position.some((v, i) => v !== next.camera!.position[i]) ||
				previous.camera.target.some((v, i) => v !== next.camera!.target[i]))
		) {
			this.layoutFitPending = false;
			this.restoreCamera(next.camera);
		} else if (refit && this.loaded) {
			if (
				(next.display === 'layout' || previous.display === 'layout') &&
				previous.display !== next.display &&
				!this.reducedMotion
			)
				this.layoutFitPending = true;
			else this.fit(true, next.focused);
		}
		this.transitionPending = true;
		this.invalidate();
	}

	private refreshSection() {
		const active = this.state.display === 'section' && this.layoutStage === 0;
		this.section.update(
			this.layoutStage > 0 ? { ...this.state, display: 'assembly' } : this.state,
			this.parts
				.filter(
					(part) =>
						part.id === 'Frame_156826' ||
						part.id === 'Frame_Object_002' ||
						/^Frame_Object_0(0[3-9]|1[0-4])$/.test(part.id)
				)
				.map((part) => ({
					id: part.id,
					geometry: part.proxy.geometry,
					visible: this.partVisible(part) && part.targetRemoval === 0,
					offset: part.proxy.position
				}))
		);
		this.uniforms.uCutActive.value = active ? 1 : 0;
		this.uniforms.uCutPlane.value.set(
			this.section.plane.normal.x,
			this.section.plane.normal.y,
			this.section.plane.normal.z,
			this.section.plane.constant
		);
		this.ao.normalMaterial.clippingPlanes = [];
		const normalSide =
			active || this.state.display === 'cylinder' ? THREE.DoubleSide : THREE.FrontSide;
		if (this.ao.normalMaterial.side !== normalSide) {
			this.ao.normalMaterial.side = normalSide;
			this.ao.normalMaterial.needsUpdate = true;
		}
		this.floor.position.y = active ? Math.min(-1.884, this.fullSourceBounds.min.y - 0.14) : -1.884;
		for (const part of this.parts)
			(part.proxy.material as THREE.MeshBasicMaterial).side = active
				? THREE.DoubleSide
				: THREE.FrontSide;
		for (const batch of this.batches) {
			const material = batch.mesh.material;
			const planes = active ? this.exteriorPlanes : [];
			if (material.clippingPlanes?.length !== planes.length) {
				material.clippingPlanes = planes;
				material.side = active ? THREE.DoubleSide : THREE.FrontSide;
				material.needsUpdate = true;
			}
			material.clipShadows = true;
			const depth = batch.mesh.customDepthMaterial as THREE.MeshDepthMaterial;
			depth.clippingPlanes = planes;
			depth.clipShadows = true;
		}
	}
	private syncStudyPlanes() {
		this.uniforms.uStudyActive.value =
			this.state.display === 'cylinder' && this.layoutStage === 0 ? 1 : 0;
		const [a, b] = this.educational.sectionPlanes;
		this.uniforms.uStudyPlaneA.value.set(a.normal.x, a.normal.y, a.normal.z, a.constant);
		this.uniforms.uStudyPlaneB.value.set(b.normal.x, b.normal.y, b.normal.z, b.constant);
	}

	private refreshPartState() {
		for (const part of this.parts) {
			const selected = matchesComponent(part.id, part.parent, this.state.selected);
			const hidden =
				this.state.hidden.some((id) => matchesComponent(part.id, part.parent, id)) ||
				(this.state.isolated && !!this.state.selected && !selected);
			part.targetRemoval = this.state.removed.some((id) =>
				matchesComponent(part.id, part.parent, id)
			)
				? 1
				: 0;
			this.tableData[part.index * 4 + 1] = hidden ? 1 : 0;
			this.tableData[part.index * 4 + 2] = selected ? 1 : 0;
		}
		for (const batch of this.batches)
			batch.hasVisibleParts = batch.indices.some((index) => this.tableData[index * 4 + 1] < 0.5);
		this.partTable.needsUpdate = true;
	}

	private partVisible(part: Part): boolean {
		return this.tableData[part.index * 4 + 1] < 0.5;
	}
	private sourceBounds(focus: string | null = null): THREE.Box3 {
		const bounds = new THREE.Box3();
		for (const part of this.parts) {
			if (!this.partVisible(part) || (focus && !matchesComponent(part.id, part.parent, focus)))
				continue;
			if (this.state.display === 'layout' && this.partsLayout) {
				bounds.union(this.partsLayout.placements.get(part.id)!.bounds);
				continue;
			}
			const box = part.proxy.geometry.boundingBox!.clone();
			box.translate(
				part.offset.clone().multiplyScalar(Math.max(this.state.explosion, part.targetRemoval))
			);
			bounds.union(box);
		}
		return bounds;
	}
	private fit(animate: boolean, focus: string | null = null) {
		const combined =
			this.state.display === 'assembly' ||
			this.state.display === 'section' ||
			this.state.display === 'layout' ||
			this.layoutStage > 0;
		let bounds = new THREE.Box3();
		if (this.state.display === 'layout' && this.partsLayout)
			bounds = layoutVisibleBounds(
				this.partsLayout,
				(placement) => this.atlasVisible(placement),
				focus
			);
		else if (combined) {
			if (!focus || !focus.startsWith('mech:')) bounds.union(this.sourceBounds(focus));
			if (this.state.internals && (!focus || !focus.startsWith('Frame_')))
				bounds.union(this.educational.bounds(focus, !!focus, true));
		} else bounds = this.educational.bounds(focus, !!focus, true);
		if (bounds.isEmpty())
			bounds =
				this.state.display === 'layout' && this.partsLayout
					? this.partsLayout.bounds.clone()
					: combined
						? this.sourceBounds()
						: this.educational.bounds();
		if (this.state.display === 'section') {
			// Frame only the retained half on entry or explicit Fit. Slider motion leaves the camera steady.
			const axis = this.state.section.axis;
			const coordinate = -this.section.plane.constant / this.section.plane.normal[axis];
			if (this.state.section.flipped) bounds.min[axis] = Math.max(bounds.min[axis], coordinate);
			else bounds.max[axis] = Math.min(bounds.max[axis], coordinate);
		}
		if (bounds.isEmpty())
			bounds = new THREE.Box3(new THREE.Vector3(-3, -1.9, -1.8), new THREE.Vector3(3, 1.9, 1.8));
		bounds.getCenter(this.targetLook);
		const directions: Record<LabView, THREE.Vector3> = {
			perspective: new THREE.Vector3(1.1, 0.62, 1.75),
			front: new THREE.Vector3(1, 0.1, 0.001),
			side: new THREE.Vector3(0.001, 0.14, 1),
			top: new THREE.Vector3(0.001, 1, 0.001)
		};
		if (this.state.display === 'layout') {
			// An individual component gets a three-quarter inspection angle, preserving visible depth.
			if (focus && this.partsLayout?.placements.has(focus))
				directions.perspective.set(1.2, 0.9, 1.5);
			else directions.perspective.set(0.12, 1.8, 1.05);
			directions.front.set(0.001, 1.1, 1.6);
			directions.side.set(1.6, 1.1, 0.001);
		}
		if (this.state.display === 'section' && this.state.view === 'perspective') {
			const axis = this.state.section.axis;
			if (axis === 'y') directions.perspective.y = this.state.section.flipped ? -0.2 : 0.62;
			else directions.perspective[axis] *= this.state.section.flipped ? -1 : 1;
		}
		const direction = directions[this.state.view].normalize(),
			right = new THREE.Vector3().crossVectors(Y_AXIS, direction).normalize(),
			up = new THREE.Vector3().crossVectors(direction, right).normalize();
		const tangent = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
		const teaching = this.state.display !== 'assembly';
		const height = Math.max(1, this.host.clientHeight),
			width = Math.max(1, this.host.clientWidth);
		// The page can reserve its actual mobile overlay heights without changing desktop framing.
		// CSS custom properties inherit from the stage to this canvas host; use numeric pixel lengths.
		const styles = getComputedStyle(this.host);
		const inset = (name: string, fallback: number) => {
			const value = Number.parseFloat(styles.getPropertyValue(name));
			return Number.isFinite(value) && value >= 0 ? value : fallback;
		};
		let top = inset('--engine-fit-top', teaching ? Math.min(180, height * 0.25) : 0);
		let bottom = inset(
			'--engine-fit-bottom',
			teaching ? Math.min(this.state.display === 'section' ? 210 : 140, height * 0.28) : 0
		);
		const reserve = top + bottom;
		if (reserve > height - 80) {
			const scale = Math.max(0, height - 80) / reserve;
			top *= scale;
			bottom *= scale;
		}
		let left = inset('--engine-fit-left', 0),
			rightInset = inset('--engine-fit-right', 0);
		const horizontalReserve = left + rightInset;
		if (horizontalReserve > width - 80) {
			const scale = Math.max(0, width - 80) / horizontalReserve;
			left *= scale;
			rightInset *= scale;
		}
		const upper = 1 - (2 * top) / height,
			lower = -1 + (2 * bottom) / height;
		const centerSlope = (upper + lower) / 2;
		const padding = teaching ? 0.94 : 0.96;
		const halfSlope = ((upper - lower) / 2) * padding;
		const shiftPerDistance = -centerSlope * tangent;
		const upperSlope = (centerSlope + halfSlope) * tangent;
		const lowerSlope = (centerSlope - halfSlope) * tangent;
		const horizontalCenter = (-1 + (2 * left) / width + 1 - (2 * rightInset) / width) / 2;
		const horizontalHalf = (1 - (left + rightInset) / width) * (teaching ? 0.92 : padding);
		const horizontalTangent = tangent * this.camera.aspect;
		const horizontalShift = -horizontalCenter * horizontalTangent;
		const leftSlope = (horizontalCenter - horizontalHalf) * horizontalTangent,
			rightSlope = (horizontalCenter + horizontalHalf) * horizontalTangent;
		let distance = 0;
		for (const x of [bounds.min.x, bounds.max.x])
			for (const y of [bounds.min.y, bounds.max.y])
				for (const z of [bounds.min.z, bounds.max.z]) {
					const p = new THREE.Vector3(x, y, z).sub(this.targetLook),
						depth = p.dot(direction),
						rise = p.dot(up);
					distance = Math.max(
						distance,
						(p.dot(right) + rightSlope * depth) / (horizontalShift + rightSlope),
						(p.dot(right) + leftSlope * depth) / (horizontalShift + leftSlope),
						(rise + upperSlope * depth) / (shiftPerDistance + upperSlope),
						(rise + lowerSlope * depth) / (shiftPerDistance + lowerSlope)
					);
				}
		const fittedDistance = Math.max(0.48, distance) * (teaching ? 1.04 : 1.13);
		// Wide explosions and compact viewports can require a distance beyond the initial orbit limit.
		this.controls.maxDistance = Math.max(32, fittedDistance * 1.5);
		this.camera.far = Math.max(100, fittedDistance * 3);
		this.camera.updateProjectionMatrix();
		this.ao.gtaoMaterial.uniforms.cameraFar.value = this.camera.far;
		if (this.ao.pdMaterial.uniforms.cameraFar)
			this.ao.pdMaterial.uniforms.cameraFar.value = this.camera.far;
		this.targetLook
			.addScaledVector(up, shiftPerDistance * fittedDistance)
			.addScaledVector(right, horizontalShift * fittedDistance);
		this.targetPosition.copy(direction).multiplyScalar(fittedDistance).add(this.targetLook);
		this.refreshStudioFog();
		if (animate && !this.reducedMotion) this.cameraMoving = true;
		else {
			this.camera.position.copy(this.targetPosition);
			this.controls.target.copy(this.targetLook);
			this.controls.update();
		}
		this.invalidate();
	}

	getSnapshot(): SceneSnapshot {
		return {
			phase: this.phase,
			camera: {
				position: this.camera.position.toArray() as [number, number, number],
				target: this.controls.target.toArray() as [number, number, number]
			}
		};
	}
	restoreCamera(camera: LabCamera) {
		// Flush orbit/pan/zoom inertia before restoring an acknowledged camera checkpoint.
		const damping = this.controls.enableDamping;
		this.controls.enableDamping = false;
		this.controls.update(0);
		this.cameraMoving = false;
		this.camera.position.fromArray(camera.position);
		this.controls.target.fromArray(camera.target);
		this.camera.far = Math.max(100, this.camera.position.distanceTo(this.controls.target) * 3);
		this.camera.updateProjectionMatrix();
		this.controls.maxDistance = Math.max(
			32,
			this.camera.position.distanceTo(this.controls.target) * 1.5
		);
		this.targetPosition.copy(this.camera.position);
		this.targetLook.copy(this.controls.target);
		this.refreshStudioFog();
		this.controls.update(0);
		this.controls.enableDamping = damping;
		this.invalidate();
	}

	async settle(signal?: AbortSignal): Promise<void> {
		this.invalidate();
		await new Promise<void>((resolve, reject) => {
			const start = performance.now();
			const check = () => {
				if (signal?.aborted) {
					reject(signal.reason ?? new DOMException('Scene action cancelled', 'AbortError'));
					return;
				}
				if (this.disposed) {
					reject(new Error('Scene closed'));
					return;
				}
				if (!this.transitionPending && !this.cameraMoving) {
					resolve();
					return;
				}
				if (performance.now() - start > 10000) {
					reject(new Error('Scene transition did not settle'));
					return;
				}
				requestAnimationFrame(check);
			};
			requestAnimationFrame(check);
		});
	}

	private pointerDown = (event: PointerEvent) => {
		this.pointerStart.set(event.clientX, event.clientY);
	};
	private pickAt(clientX: number, clientY: number): THREE.Intersection | undefined {
		const rect = this.renderer.domElement.getBoundingClientRect(),
			ray = new THREE.Raycaster();
		ray.setFromCamera(
			new THREE.Vector2(
				((clientX - rect.left) / rect.width) * 2 - 1,
				(-(clientY - rect.top) / rect.height) * 2 + 1
			),
			this.camera
		);
		const combined =
			this.state.display === 'assembly' ||
			this.state.display === 'section' ||
			this.state.display === 'layout' ||
			this.layoutStage > 0;
		const candidates = [
			...(combined ? this.parts.filter((p) => this.partVisible(p)).map((p) => p.proxy) : []),
			...this.educational.visiblePickables(),
			...this.section.pickables(),
			...this.movingCaps.pickables()
		];
		return ray.intersectObjects(candidates, false).find((hit) => {
			if (
				this.state.display === 'section' &&
				this.layoutStage === 0 &&
				this.section.plane.distanceToPoint(hit.point) < -0.00002
			)
				return false;
			if (
				this.state.display === 'cylinder' &&
				this.layoutStage === 0 &&
				this.educational.sectionPlanes.some((plane) => plane.distanceToPoint(hit.point) < -0.00002)
			)
				return false;
			return true;
		});
	}
	private pointerUp = (event: PointerEvent) => {
		if (this.pointerStart.distanceTo(new THREE.Vector2(event.clientX, event.clientY)) > 5) return;
		const hit = this.pickAt(event.clientX, event.clientY);
		this.onselect(hit ? hit.object.userData.componentId : null);
	};
	private doubleClick = (event: MouseEvent) => {
		const hit = this.pickAt(event.clientX, event.clientY);
		if (hit) {
			event.preventDefault();
			this.onisolate(hit.object.userData.componentId);
		}
	};

	private resize = () => {
		const { width, height } = this.host.getBoundingClientRect();
		if (width < 1 || height < 1) return;
		this.camera.aspect = width / height;
		this.camera.updateProjectionMatrix();
		this.renderer.setSize(width, height);
		this.composer.setSize(width, height);
		this.ao.setSize(Math.max(1, Math.round(width * 0.5)), Math.max(1, Math.round(height * 0.5)));
		if (this.loaded) this.fit(false, this.state.focused);
		else this.invalidate();
	};
	private invalidate = () => {
		if (!this.raf && !this.disposed && !document.hidden)
			this.raf = requestAnimationFrame(this.render);
	};
	private render = (now: number) => {
		this.raf = 0;
		if (this.disposed) return;
		const elapsed = this.lastFrame ? Math.max(0, (now - this.lastFrame) / 1000) : 0.016;
		const delta = Math.min(elapsed, 0.05);
		this.lastFrame = now;
		// Phase follows elapsed time; only visual transition damping is capped on slow frames.
		if (this.state.running) {
			this.phase = (this.phase + ((elapsed * 1800) / 60) * 360 * this.state.playback) % 720;
			this.time += elapsed;
		}
		let animating = false;
		const damp = (current: number, target: number) => {
			const value = this.reducedMotion ? target : THREE.MathUtils.damp(current, target, 6.5, delta);
			if (Math.abs(value - target) > 0.0008) animating = true;
			return Math.abs(value - target) < 0.0008 ? target : value;
		};
		const targetStage = this.state.display === 'layout' ? 2 : 0;
		const previousStage = this.layoutStage;
		this.layoutStage = this.reducedMotion
			? targetStage
			: THREE.MathUtils.clamp(
					this.layoutStage + Math.sign(targetStage - this.layoutStage) * delta * 1.65,
					Math.min(this.layoutStage, targetStage),
					Math.max(this.layoutStage, targetStage)
				);
		if (Math.abs(this.layoutStage - targetStage) < 0.00001) this.layoutStage = targetStage;
		animating ||= this.layoutStage !== targetStage;
		this.uniforms.uLayout.value = THREE.MathUtils.smoothstep(this.layoutStage, 1, 2);
		const burst = THREE.MathUtils.smoothstep(this.layoutStage, 0, 1);
		this.uniforms.uExplosion.value =
			this.layoutStage > 0
				? THREE.MathUtils.lerp(this.state.explosion, 1, burst)
				: damp(this.uniforms.uExplosion.value, this.state.explosion);
		if (this.layoutFitPending && this.state.display === 'layout' && this.layoutStage >= 1) {
			this.layoutFitPending = false;
			this.fit(true, this.state.focused);
		}
		if (previousStage > 0 && this.layoutStage === 0) {
			this.refreshSection();
			this.syncStudyPlanes();
		}
		this.syncLayoutEnvironment();
		for (const part of this.parts) {
			part.removal = damp(part.removal, part.targetRemoval);
			this.tableData[part.index * 4] = part.removal;
			part.proxy.position
				.copy(part.offset)
				.multiplyScalar(Math.max(this.uniforms.uExplosion.value, part.removal));
			part.proxy.position.z +=
				this.state.display === 'section'
					? part.contactZ *
						(1 -
							THREE.MathUtils.clamp(
								Math.max(this.uniforms.uExplosion.value, part.removal) * 100,
								0,
								1
							))
					: 0;
			if (this.partsLayout && this.uniforms.uLayout.value > 0) {
				const transform = sourceLayoutTransform(
					this.partsLayout.placements.get(part.id)!,
					part.proxy.position,
					this.uniforms.uLayout.value
				);
				part.proxy.position.copy(transform.translation);
				part.proxy.scale.setScalar(transform.scale);
			} else part.proxy.scale.setScalar(1);
			part.proxy.updateMatrixWorld(true);
		}
		this.partTable.needsUpdate = true;
		if (
			this.capsNeedRefresh &&
			this.uniforms.uExplosion.value === this.state.explosion &&
			this.parts.every((part) => part.removal === part.targetRemoval)
		) {
			this.capsNeedRefresh = false;
			this.section.invalidate();
			this.refreshSection();
		}
		this.updateTeaching(delta);
		if (this.layoutFitPending && this.state.display !== 'layout' && this.layoutStage === 0) {
			this.layoutFitPending = false;
			this.fit(true, this.state.focused);
		}
		this.syncStudyPlanes();
		animating ||= this.educational.transitioning;
		for (const batch of this.batches)
			batch.mesh.visible =
				batch.hasVisibleParts &&
				(this.state.display === 'assembly' ||
					this.state.display === 'section' ||
					this.state.display === 'layout' ||
					this.layoutStage > 0);
		if (this.cameraMoving) {
			this.camera.position.lerp(this.targetPosition, 1 - Math.exp(-delta * 6));
			this.controls.target.lerp(this.targetLook, 1 - Math.exp(-delta * 6));
			if (
				this.camera.position.distanceToSquared(this.targetPosition) < 0.000003 &&
				this.controls.target.distanceToSquared(this.targetLook) < 0.000003
			) {
				this.cameraMoving = false;
				this.camera.position.copy(this.targetPosition);
				this.controls.target.copy(this.targetLook);
			}
		}
		const moving = this.controls.update(delta);
		this.educational.group.updateMatrixWorld(true);
		this.movingCaps.update(
			this.educational.visiblePickables(),
			this.state.display === 'section' && this.layoutStage === 0
				? this.exteriorPlanes
				: this.state.display === 'cylinder' && this.layoutStage === 0
					? this.educational.sectionPlanes
					: []
		);
		// Refresh dynamic shadows in the beauty pass once; GTAO also renders the scene for normals.
		this.renderer.shadowMap.needsUpdate = true;
		this.composer.render(delta);
		this.transitionPending = animating || this.cameraMoving || moving || this.dragging;
		if (now - this.lastPhaseReport > 100) {
			this.lastPhaseReport = now;
			this.onphase(this.phase);
		}
		if (animating || this.cameraMoving || moving || this.dragging || this.state.running)
			this.invalidate();
	};

	dispose() {
		this.disposed = true;
		cancelAnimationFrame(this.raf);
		this.observer.disconnect();
		this.cancelVisibility();
		this.controls.dispose();
		this.renderer.domElement.removeEventListener('pointerdown', this.pointerDown);
		this.renderer.domElement.removeEventListener('pointerup', this.pointerUp);
		this.renderer.domElement.removeEventListener('dblclick', this.doubleClick);
		for (const part of this.parts) {
			part.proxy.geometry.dispose();
			(part.proxy.material as THREE.Material).dispose();
		}
		for (const batch of this.batches) {
			batch.mesh.geometry.dispose();
			batch.mesh.material.dispose();
			batch.mesh.customDepthMaterial?.dispose();
		}
		this.educational.dispose();
		this.section.dispose();
		this.movingCaps.dispose();
		this.partTable.dispose();
		this.layoutTable.dispose();
		for (const resource of this.layoutResources) {
			resource.geometry.dispose();
			resource.material.dispose();
			resource.texture?.dispose();
		}
		this.floor.geometry.dispose();
		(this.floor.material as THREE.Material).dispose();
		this.environment.dispose();
		this.composer.passes.forEach((pass) => pass.dispose());
		this.composer.dispose();
		this.renderer.dispose();
		this.renderer.domElement.remove();
	}
}
const Y_AXIS = new THREE.Vector3(0, 1, 0);
