import { fetchEngineAsset } from '../engine/local-assets';
import * as THREE from 'three';
import { WebGPURenderer, PMREMGenerator } from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import {
	createStudioEnvironment,
	createStrictWebGPURenderer,
	initializeWebGPURenderer
} from './studio-environment';

export type ReviewMode = 'assembly' | 'internal';
export interface ReviewPart {
	id: string;
	name: string;
	path: string;
	assembly: string;
	role: string;
	material: string;
	internal: boolean;
	triangles: number;
}
export interface ReviewStats {
	parts: number;
	triangles: number;
	materials: number;
	internalParts: number;
}
interface Callbacks {
	onready: (parts: ReviewPart[], stats: ReviewStats) => void;
	onprogress: (progress: number | null, message: string) => void;
	onselect: (id: string | null, isolated: boolean) => void;
	onerror: (message: string) => void;
}
interface PartInstance {
	record: ReviewPart;
	mesh: THREE.Object3D;
	position: THREE.Vector3;
	box: THREE.Box3;
	offset: THREE.Vector3;
	materials: Map<THREE.Mesh, THREE.Material | THREE.Material[]>;
}

/** A source-only viewer: no inferred teaching geometry or simulation motion is added. */
export class SourceAssetReview {
	private readonly scene = new THREE.Scene();
	private readonly camera = new THREE.PerspectiveCamera(36, 1, 0.025, 400);
	private readonly renderer: WebGPURenderer;
	private readonly rendererReady: Promise<void>;
	private readonly controls: OrbitControls;
	private readonly abort = new AbortController();
	private readonly observer: ResizeObserver;
	private readonly instances = new Map<string, PartInstance>();
	private readonly importedMaterials = new Set<THREE.Material>();
	private readonly bounds = new THREE.Box3();
	private readonly raycaster = new THREE.Raycaster();
	private readonly pointer = new THREE.Vector2();
	private readonly pointerStart = new THREE.Vector2();
	private readonly floor: THREE.Mesh;
	private readonly key: THREE.DirectionalLight;
	private environment: THREE.RenderTarget | undefined;
	private readonly selectionBox: THREE.Box3Helper;
	private selected: string | null = null;
	private isolated = false;
	private mode: ReviewMode = 'assembly';
	private explosion = 0;
	private actualExplosion = 0;
	private frame = 0;
	private lastTime = 0;
	private disposed = false;
	private loaded = false;
	private shadowsDirty = true;
	private fitAtRest = false;
	private cameraGoal: { position: THREE.Vector3; target: THREE.Vector3 } | null = null;
	private highlighted: THREE.Material[] = [];
	private root: THREE.Object3D | null = null;
	private width = 1;
	private height = 1;

	constructor(
		private readonly host: HTMLElement,
		private readonly callbacks: Callbacks
	) {
		this.renderer = createStrictWebGPURenderer({
			antialias: true,
			alpha: false
		});
		this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
		this.renderer.outputColorSpace = THREE.SRGBColorSpace;
		this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
		this.renderer.toneMappingExposure = 0.95;
		this.renderer.shadowMap.enabled = true;
		this.renderer.shadowMap.type = THREE.PCFShadowMap;
		this.renderer.domElement.style.cssText =
			'display:block;width:100%;height:100%;touch-action:none;';
		this.renderer.domElement.setAttribute(
			'aria-label',
			'Interactive purchased V12 engine geometry. Drag to orbit, scroll to zoom, double-click a component to isolate.'
		);
		this.host.appendChild(this.renderer.domElement);
		this.scene.background = new THREE.Color(0x0a0d12);
		this.rendererReady = initializeWebGPURenderer(this.renderer).then(() => {
			if (this.disposed) return;
			const studio = createStudioEnvironment();
			const pmrem = new PMREMGenerator(this.renderer);
			this.environment = pmrem.fromScene(studio.scene, 0.08);
			this.scene.environment = this.environment.texture;
			this.scene.environmentIntensity = 0.65;
			studio.dispose();
			pmrem.dispose();
		});
		this.scene.add(new THREE.HemisphereLight(0xb2c7df, 0x333039, 1.1));
		this.key = new THREE.DirectionalLight(0xffefd9, 3.1);
		this.key.position.set(-7, 10, 7);
		this.key.castShadow = true;
		this.key.shadow.autoUpdate = false;
		this.key.shadow.mapSize.set(2048, 2048);
		this.key.shadow.normalBias = 0.018;
		this.key.shadow.bias = -0.00008;
		this.scene.add(this.key, this.key.target);
		const fill = new THREE.DirectionalLight(0xa9c7e8, 1.35);
		fill.position.set(8, 4, -6);
		this.scene.add(fill);
		const rim = new THREE.DirectionalLight(0xd5dfec, 1.65);
		rim.position.set(2, 8, -9);
		this.scene.add(rim);
		this.floor = new THREE.Mesh(
			new THREE.PlaneGeometry(220, 220),
			new THREE.MeshStandardMaterial({ color: 0x070b10, roughness: 0.94, metalness: 0 })
		);
		this.floor.rotation.x = -Math.PI / 2;
		this.floor.receiveShadow = true;
		this.floor.position.y = -3.1;
		this.scene.add(this.floor);
		this.selectionBox = new THREE.Box3Helper(new THREE.Box3(), 0xebba61);
		const lineMaterial = this.selectionBox.material as THREE.LineBasicMaterial;
		lineMaterial.transparent = true;
		lineMaterial.opacity = 0.5;
		lineMaterial.depthTest = false;
		this.selectionBox.renderOrder = 10;
		this.selectionBox.visible = false;
		this.scene.add(this.selectionBox);
		this.camera.position.set(8, 5, 8);
		this.controls = new OrbitControls(this.camera, this.renderer.domElement);
		this.controls.enableDamping = true;
		this.controls.dampingFactor = 0.09;
		this.controls.minDistance = 0.12;
		this.controls.maxDistance = 180;
		this.controls.maxPolarAngle = Math.PI * 0.96;
		this.controls.addEventListener('change', this.invalidate);
		this.controls.addEventListener('start', this.interaction);
		this.renderer.domElement.addEventListener('pointerdown', this.pointerDown);
		this.renderer.domElement.addEventListener('pointerup', this.pointerUp);
		this.renderer.domElement.addEventListener('dblclick', this.doubleClick);
		this.renderer.domElement.addEventListener('webglcontextlost', this.contextLost);
		this.observer = new ResizeObserver(this.resize);
		this.observer.observe(this.host);
		this.resize();
	}

	async load(url: string): Promise<void> {
		await this.rendererReady;
		if (this.disposed) return;
		this.callbacks.onprogress(null, 'Opening purchased geometry');
		const response = await fetchEngineAsset(url, { signal: this.abort.signal });
		if (!response.ok)
			throw new Error(`The V12 review asset could not be loaded (${response.status}).`);
		const total = Number(response.headers.get('content-length'));
		let buffer: ArrayBuffer;
		if (response.body) {
			const reader = response.body.getReader();
			const chunks: Uint8Array[] = [];
			let length = 0;
			for (;;) {
				const result = await reader.read();
				if (result.done) break;
				chunks.push(result.value);
				length += result.value.byteLength;
				this.callbacks.onprogress(total > 0 ? length / total : null, 'Loading the V12 assembly');
			}
			const bytes = new Uint8Array(length);
			let offset = 0;
			for (const chunk of chunks) {
				bytes.set(chunk, offset);
				offset += chunk.byteLength;
			}
			buffer = bytes.buffer;
		} else buffer = await response.arrayBuffer();
		if (this.disposed) return;
		this.callbacks.onprogress(1, 'Preparing source materials and component identities');
		const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
		const gltf = await loader.parseAsync(
			buffer,
			new URL('.', new URL(url, window.location.href)).href
		);
		if (this.disposed) {
			disposeGraph(gltf.scene);
			return;
		}
		this.root = gltf.scene;
		this.scene.add(this.root);
		this.root.updateMatrixWorld(true);
		const materialNames = new Set<string>();
		const records: ReviewPart[] = [];
		let triangles = 0;
		for (const object of this.root.children) {
			const data = object.userData;
			const id = object.name;
			if (!/^v12-\d{4}$/.test(id) || this.instances.has(id))
				throw new Error('The review asset contains a missing or repeated occurrence identity.');
			const materials = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
			let triangleCount = 0;
			object.traverse((child) => {
				if (!(child instanceof THREE.Mesh)) return;
				materials.set(child, child.material);
				for (const material of Array.isArray(child.material) ? child.material : [child.material]) {
					this.importedMaterials.add(material);
					materialNames.add(material.name || 'Unnamed imported finish');
					if (!child.geometry.getAttribute('uv') && material instanceof THREE.MeshPhysicalMaterial)
						material.anisotropy = 0;
				}
				triangleCount +=
					(child.geometry.index?.count ?? child.geometry.getAttribute('position').count) / 3;
				child.userData.reviewId = id;
				child.castShadow = true;
				child.receiveShadow = true;
			});
			if (!materials.size) continue;
			triangles += triangleCount;
			const record: ReviewPart = {
				id,
				name: String(data.sourceName || id),
				path: String(data.sourcePath || id),
				assembly: String(data.assembly || 'Unassigned assembly'),
				role: String(data.role || 'other'),
				material: String(data.sourceMaterial || 'Imported finish'),
				internal: data.internal === true,
				triangles: Math.round(triangleCount)
			};
			const box = new THREE.Box3().setFromObject(object);
			this.bounds.union(box);
			this.instances.set(id, {
				record,
				mesh: object,
				position: object.position.clone(),
				box,
				offset: new THREE.Vector3(),
				materials
			});
			records.push(record);
		}
		if (records.length === 0 || this.bounds.isEmpty())
			throw new Error('The asset did not contain any visible mesh components.');
		const center = this.bounds.getCenter(new THREE.Vector3());
		const assemblyBounds = new Map<string, THREE.Box3>();
		for (const { record, box } of this.instances.values()) {
			const group = assemblyBounds.get(record.assembly) || new THREE.Box3();
			group.union(box);
			assemblyBounds.set(record.assembly, group);
		}
		for (const instance of this.instances.values()) {
			const partCenter = instance.box.getCenter(new THREE.Vector3());
			const groupCenter = assemblyBounds
				.get(instance.record.assembly)!
				.getCenter(new THREE.Vector3());
			instance.offset.copy(partCenter).sub(center).multiplyScalar(1.7);
			const groupDirection = groupCenter.clone().sub(center);
			if (groupDirection.lengthSq() > 0.01) groupDirection.normalize().multiplyScalar(1.15);
			instance.offset.add(groupDirection);
			// Direction is a visual disassembly aid, not an asserted OEM extraction sequence.
			if (instance.record.internal && instance.offset.lengthSq() < 0.4) instance.offset.y += 1.7;
		}
		this.loaded = true;
		this.updateVisibility();
		this.updateEnvironment();
		this.fit(true);
		this.callbacks.onready(records, {
			parts: records.length,
			triangles: Math.round(triangles),
			materials: materialNames.size,
			internalParts: records.filter((part) => part.internal).length
		});
		this.invalidate();
	}

	setMode(mode: ReviewMode): void {
		this.mode = mode;
		this.isolated = false;
		this.updateVisibility();
		this.callbacks.onselect(this.selected, false);
		this.fit();
	}
	setExplosion(value: number): void {
		this.explosion = THREE.MathUtils.clamp(value, 0, 1);
		this.fitAtRest = true;
		this.fit(false, true);
		this.invalidate();
	}
	select(id: string | null, isolate = false): void {
		if (id !== null && !this.instances.has(id)) return;
		this.restoreHighlight();
		this.selected = id;
		this.isolated = id !== null && isolate;
		if (id) {
			const instance = this.instances.get(id)!;
			for (const [mesh, originals] of instance.materials) {
				const source = Array.isArray(originals) ? originals : [originals];
				const highlights = source.map((material) => {
					const highlight = material.clone();
					if (highlight instanceof THREE.MeshStandardMaterial) {
						highlight.emissive.set(0x84603a);
						highlight.emissiveIntensity = 0.12;
					}
					return highlight;
				});
				this.highlighted.push(...highlights);
				mesh.material = Array.isArray(originals) ? highlights : highlights[0];
			}
		}
		this.updateVisibility();
		this.callbacks.onselect(id, this.isolated);
		if (isolate) this.fit();
		this.invalidate();
	}
	focus(id: string): void {
		this.select(id, this.isolated);
		this.fit(false, false, id);
	}
	showAll(): void {
		this.isolated = false;
		this.updateVisibility();
		this.callbacks.onselect(this.selected, false);
		this.fit();
	}
	reset(): void {
		this.explosion = 0;
		this.fitAtRest = true;
		this.mode = 'assembly';
		this.select(null);
		this.fit(false, true);
		this.invalidate();
	}
	fit(immediate = false, targetExplosion = false, focusId?: string): void {
		if (!this.loaded) return;
		const box = this.visibleBox(targetExplosion ? this.explosion : this.actualExplosion, focusId);
		if (box.isEmpty()) return;
		const center = box.getCenter(new THREE.Vector3());
		const size = box.getSize(new THREE.Vector3());
		const style = getComputedStyle(this.host);
		const top = Number.parseFloat(style.getPropertyValue('--review-fit-top')) || 135;
		const bottom = Number.parseFloat(style.getPropertyValue('--review-fit-bottom')) || 118;
		const availableHeight = Math.max(this.height * 0.35, this.height - top - bottom);
		const usableFraction = availableHeight / this.height;
		const direction = new THREE.Vector3(1.1, 0.65, 1.4).normalize();
		if (!immediate && this.camera.position.distanceTo(this.controls.target) > 0.1)
			direction.copy(this.camera.position).sub(this.controls.target).normalize();
		const up = new THREE.Vector3(0, 1, 0);
		const right = new THREE.Vector3().crossVectors(up, direction).normalize();
		up.crossVectors(direction, right).normalize();
		const halfFov = THREE.MathUtils.degToRad(this.camera.fov / 2);
		const tan = Math.tan(halfFov);
		let distance = 0.2;
		for (const instance of this.instances.values()) {
			if (!instance.mesh.visible || (focusId && instance.record.id !== focusId)) continue;
			const partBox = instance.box
				.clone()
				.translate(
					instance.offset
						.clone()
						.multiplyScalar(targetExplosion ? this.explosion : this.actualExplosion)
				);
			for (const x of [partBox.min.x, partBox.max.x])
				for (const y of [partBox.min.y, partBox.max.y])
					for (const z of [partBox.min.z, partBox.max.z]) {
						const corner = new THREE.Vector3(x, y, z).sub(center);
						const depth = corner.dot(direction);
						distance = Math.max(
							distance,
							depth + Math.abs(corner.dot(up)) / (tan * usableFraction),
							depth + Math.abs(corner.dot(right)) / (tan * this.camera.aspect * 0.88)
						);
					}
		}
		distance *= 1.09;
		const target = center
			.clone()
			.addScaledVector(up, ((top - bottom) / this.height) * distance * tan);
		const position = target.clone().addScaledVector(direction, distance);
		this.camera.near = Math.max(0.006, Math.min(0.06, size.length() * 0.003));
		this.camera.far = Math.max(120, distance + size.length() * 5);
		this.camera.updateProjectionMatrix();
		this.controls.maxDistance = Math.max(80, distance * 5);
		this.controls.enableDamping = false;
		this.controls.update();
		this.controls.enableDamping = true;
		if (immediate) {
			this.camera.position.copy(position);
			this.controls.target.copy(target);
			this.controls.update();
			this.cameraGoal = null;
		} else this.cameraGoal = { position, target };
		this.invalidate();
	}

	private visibleBox(amount: number, focusId?: string): THREE.Box3 {
		const box = new THREE.Box3();
		for (const instance of this.instances.values()) {
			if (!instance.mesh.visible || (focusId && instance.record.id !== focusId)) continue;
			box.union(instance.box.clone().translate(instance.offset.clone().multiplyScalar(amount)));
		}
		return box;
	}
	private updateVisibility(): void {
		for (const { record, mesh } of this.instances.values())
			mesh.visible = this.isolated
				? record.id === this.selected
				: this.mode === 'assembly' || record.internal || record.id === this.selected;
		this.shadowsDirty = true;
		this.updateSelectionBox();
		this.invalidate();
	}
	private updateSelectionBox(): void {
		const selected = this.selected ? this.instances.get(this.selected) : null;
		this.selectionBox.visible = !!selected?.mesh.visible;
		if (selected)
			this.selectionBox.box
				.copy(selected.box)
				.translate(selected.offset.clone().multiplyScalar(this.actualExplosion));
	}
	private restoreHighlight(): void {
		if (this.selected) {
			const instance = this.instances.get(this.selected);
			if (instance) for (const [mesh, materials] of instance.materials) mesh.material = materials;
		}
		this.highlighted.forEach((material) => material.dispose());
		this.highlighted = [];
	}
	private updateEnvironment(): void {
		const box = this.visibleBox(this.actualExplosion);
		if (box.isEmpty()) return;
		this.floor.position.y = Math.min(this.bounds.min.y, box.min.y) - 0.045;
		const radius = Math.max(5, box.getSize(new THREE.Vector3()).length() * 0.65);
		const center = box.getCenter(new THREE.Vector3());
		this.key.target.position.copy(center);
		this.key.position.copy(center).add(new THREE.Vector3(-radius, radius * 1.5, radius));
		const camera = this.key.shadow.camera;
		camera.left = camera.bottom = -radius;
		camera.right = camera.top = radius;
		camera.near = 0.1;
		camera.far = radius * 5;
		camera.updateProjectionMatrix();
		this.shadowsDirty = true;
	}
	private interaction = (): void => {
		this.cameraGoal = null;
		this.invalidate();
	};
	private invalidate = (): void => {
		if (!this.disposed && !this.frame) this.frame = requestAnimationFrame(this.render);
	};
	private render = (time: number): void => {
		this.frame = 0;
		if (this.disposed) return;
		const delta = Math.min((time - (this.lastTime || time)) / 1000, 0.05);
		this.lastTime = time;
		const damping = window.matchMedia('(prefers-reduced-motion: reduce)').matches
			? 1
			: 1 - Math.exp(-delta * 10);
		let moving = false;
		if (Math.abs(this.actualExplosion - this.explosion) > 0.0002) {
			this.actualExplosion = THREE.MathUtils.lerp(
				this.actualExplosion,
				this.explosion,
				damping || 0.01
			);
			for (const instance of this.instances.values())
				instance.mesh.position
					.copy(instance.position)
					.addScaledVector(instance.offset, this.actualExplosion);
			this.updateSelectionBox();
			this.updateEnvironment();
			moving = true;
		} else if (this.fitAtRest) {
			this.actualExplosion = this.explosion;
			for (const instance of this.instances.values())
				instance.mesh.position
					.copy(instance.position)
					.addScaledVector(instance.offset, this.actualExplosion);
			this.fitAtRest = false;
			this.updateSelectionBox();
			this.updateEnvironment();
			this.fit();
		}
		if (this.cameraGoal) {
			this.camera.position.lerp(this.cameraGoal.position, damping || 0.01);
			this.controls.target.lerp(this.cameraGoal.target, damping || 0.01);
			if (
				this.camera.position.distanceToSquared(this.cameraGoal.position) +
					this.controls.target.distanceToSquared(this.cameraGoal.target) <
				0.000005
			) {
				this.camera.position.copy(this.cameraGoal.position);
				this.controls.target.copy(this.cameraGoal.target);
				this.cameraGoal = null;
			} else moving = true;
		}
		moving = this.controls.update(delta) || moving;
		if (this.shadowsDirty) {
			this.key.shadow.needsUpdate = true;
			this.shadowsDirty = false;
		}
		this.renderer.render(this.scene, this.camera);
		if (moving) this.invalidate();
		else this.lastTime = 0;
	};
	private resize = (): void => {
		if (this.disposed) return;
		this.width = Math.max(1, this.host.clientWidth);
		this.height = Math.max(1, this.host.clientHeight);
		this.camera.aspect = this.width / this.height;
		this.camera.updateProjectionMatrix();
		this.renderer.setSize(this.width, this.height, false);
		if (this.loaded) this.fit(true);
		this.invalidate();
	};
	private pick(event: MouseEvent | PointerEvent): string | null {
		const rect = this.renderer.domElement.getBoundingClientRect();
		this.pointer.set(
			((event.clientX - rect.left) / rect.width) * 2 - 1,
			-((event.clientY - rect.top) / rect.height) * 2 + 1
		);
		this.raycaster.setFromCamera(this.pointer, this.camera);
		this.scene.updateMatrixWorld(true);
		const meshes = [...this.instances.values()]
			.filter((instance) => instance.mesh.visible)
			.map((instance) => instance.mesh);
		const hit = this.raycaster.intersectObjects(meshes, true)[0];
		return hit ? String(hit.object.userData.reviewId) : null;
	}
	private pointerDown = (event: PointerEvent): void => {
		this.pointerStart.set(event.clientX, event.clientY);
	};
	private pointerUp = (event: PointerEvent): void => {
		if (
			event.button !== 0 ||
			this.pointerStart.distanceTo(new THREE.Vector2(event.clientX, event.clientY)) > 5
		)
			return;
		const id = this.pick(event);
		if (id) this.select(id, this.isolated);
	};
	private doubleClick = (event: MouseEvent): void => {
		const id = this.pick(event);
		if (id) this.select(id, true);
	};
	private contextLost = (event: Event): void => {
		event.preventDefault();
		if (!this.disposed)
			this.callbacks.onerror(
				'The graphics context was interrupted. Reload this review to restore the model.'
			);
	};

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.abort.abort();
		cancelAnimationFrame(this.frame);
		this.observer.disconnect();
		this.controls.removeEventListener('change', this.invalidate);
		this.controls.removeEventListener('start', this.interaction);
		this.controls.dispose();
		this.renderer.domElement.removeEventListener('pointerdown', this.pointerDown);
		this.renderer.domElement.removeEventListener('pointerup', this.pointerUp);
		this.renderer.domElement.removeEventListener('dblclick', this.doubleClick);
		this.renderer.domElement.removeEventListener('webglcontextlost', this.contextLost);
		this.restoreHighlight();
		if (this.root) disposeGraph(this.root);
		this.floor.geometry.dispose();
		(this.floor.material as THREE.Material).dispose();
		this.selectionBox.geometry.dispose();
		(this.selectionBox.material as THREE.Material).dispose();
		this.environment?.dispose();
		this.key.shadow.map?.dispose();
		this.renderer.dispose();
		this.renderer.domElement.remove();
		this.instances.clear();
	}
}

function disposeGraph(root: THREE.Object3D): void {
	const geometries = new Set<THREE.BufferGeometry>();
	const materials = new Set<THREE.Material>();
	const textures = new Set<THREE.Texture>();
	root.traverse((object) => {
		if (!(object instanceof THREE.Mesh)) return;
		geometries.add(object.geometry);
		for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
			materials.add(material);
			for (const value of Object.values(material))
				if (value instanceof THREE.Texture) textures.add(value);
		}
	});
	geometries.forEach((geometry) => geometry.dispose());
	materials.forEach((material) => material.dispose());
	textures.forEach((texture) => {
		const image = texture.source.data;
		if (typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap) image.close();
		texture.dispose();
	});
}
