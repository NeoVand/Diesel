import * as THREE from 'three';
import { WebGPURenderer, PMREMGenerator } from 'three/webgpu';
import {
	createStudioEnvironment,
	createStrictWebGPURenderer,
	initializeWebGPURenderer
} from './studio-environment';

/** A borrowed source-geometry tree with independently owned preview materials. */
export type AtlasPreviewAsset = {
	object: THREE.Group;
	bounds: THREE.Box3;
	dispose: () => void;
};

type CachedPreview = {
	asset: AtlasPreviewAsset;
	radius: number;
	lastUsed: number;
};

/** One context renders the visible catalog cells. No source geometry or main-scene state is changed. */
export class AtlasPreviewRenderer {
	private renderer: WebGPURenderer;
	private rendererReady = false;
	private scene = new THREE.Scene();
	private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 1000);
	private environment: THREE.RenderTarget | undefined;
	private scroll: HTMLElement;
	private intersection: IntersectionObserver;
	private mutation: MutationObserver;
	private resize: ResizeObserver;
	private observed = new Set<HTMLElement>();
	private visible = new Set<HTMLElement>();
	private cache = new Map<string, CachedPreview>();
	private frame = 0;
	private disposed = false;
	private playing = false;
	private dirty = true;
	private angle = 0;
	private previousTime = 0;
	private paintedAt = 0;
	private contextLost = false;
	private frames = 0;
	private maxRenderMs = 0;
	private width = 0;
	private height = 0;

	constructor(
		private host: HTMLElement,
		private canvas: HTMLCanvasElement,
		private createAsset: (id: string) => AtlasPreviewAsset | null,
		private onerror: (message: string) => void = () => {}
	) {
		this.scroll = host.querySelector<HTMLElement>('.gallery-scroll')!;
		canvas.dataset.rotating = 'false';
		this.renderer = createStrictWebGPURenderer({
			canvas,
			antialias: true,
			alpha: true
		});
		this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
		this.renderer.outputColorSpace = THREE.SRGBColorSpace;
		this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
		this.renderer.toneMappingExposure = 1.12;
		this.renderer.shadowMap.enabled = false;
		this.scene.background = new THREE.Color('#1b2027');
		void initializeWebGPURenderer(this.renderer)
			.then(() => {
				if (this.disposed) return;
				this.environment = this.createEnvironment();
				this.scene.environment = this.environment.texture;
				this.rendererReady = true;
				this.invalidate();
			})
			.catch((error) =>
				this.onerror(error instanceof Error ? error.message : 'WebGPU previews could not start.')
			);
		this.scene.environmentIntensity = 0.75;
		this.scene.add(new THREE.HemisphereLight(0xe7ecf2, 0x525862, 2));
		const key = new THREE.DirectionalLight(0xf3f5f7, 2.6);
		key.position.set(-3, 6, 4);
		const fill = new THREE.DirectionalLight(0xc8d2df, 1.4);
		fill.position.set(4, 2, -2);
		this.scene.add(key, fill);
		this.intersection = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					const element = entry.target as HTMLElement;
					if (entry.isIntersecting) this.visible.add(element);
					else this.visible.delete(element);
				}
				this.invalidate();
			},
			{ root: this.scroll }
		);
		this.mutation = new MutationObserver(() => this.scan());
		this.mutation.observe(this.scroll, { childList: true, subtree: true });
		this.resize = new ResizeObserver(() => this.invalidate());
		this.resize.observe(host);
		this.scroll.addEventListener('scroll', this.invalidate, { passive: true });
		document.addEventListener('visibilitychange', this.visibilityChanged);
		window.addEventListener('engine-lab:webgpu-device-lost', this.deviceLost);
		this.scan();
	}

	private createEnvironment() {
		const environment = createStudioEnvironment();
		const pmrem = new PMREMGenerator(this.renderer);
		const texture = pmrem.fromScene(environment.scene, 0.04);
		environment.dispose();
		pmrem.dispose();
		return texture;
	}

	setPlaying(playing: boolean) {
		if (this.playing === playing) return;
		this.playing = playing;
		this.previousTime = 0;
		this.canvas.dataset.rotating = String(playing);
		this.invalidate();
	}

	private scan() {
		const current = new Set(this.scroll.querySelectorAll<HTMLElement>('[data-preview-id]'));
		for (const element of this.observed)
			if (!current.has(element)) {
				this.intersection.unobserve(element);
				this.visible.delete(element);
			}
		for (const element of current)
			if (!this.observed.has(element)) this.intersection.observe(element);
		this.observed = current;
		this.invalidate();
	}

	private visibilityChanged = () => {
		this.previousTime = 0;
		if (document.hidden) {
			cancelAnimationFrame(this.frame);
			this.frame = 0;
		} else this.invalidate();
	};
	private deviceLost = () => {
		this.contextLost = true;
		cancelAnimationFrame(this.frame);
		this.frame = 0;
		for (const node of this.observed) delete node.dataset.previewReady;
		this.onerror('Live previews are unavailable. Select a family to inspect the source geometry.');
	};

	private invalidate = () => {
		this.dirty = true;
		if (!this.disposed && !this.contextLost && !document.hidden && !this.frame)
			this.frame = requestAnimationFrame(this.render);
	};

	private preview(id: string, now: number): CachedPreview | null {
		const known = this.cache.get(id);
		if (known) {
			known.lastUsed = now;
			return known;
		}
		const asset = this.createAsset(id);
		if (!asset) return null;
		const center = asset.bounds.getCenter(new THREE.Vector3());
		asset.object.position.sub(center);
		asset.object.updateMatrixWorld(true);
		const radius = Math.max(0.01, asset.bounds.getBoundingSphere(new THREE.Sphere()).radius);
		const entry = { asset, radius, lastUsed: now };
		this.cache.set(id, entry);
		return entry;
	}

	private render = (now: number) => {
		this.frame = 0;
		if (!this.rendererReady || this.disposed || this.contextLost || document.hidden) return;
		const visible = [...this.visible].filter((element) => element.isConnected);
		if (this.playing && visible.length) {
			if (this.previousTime) this.angle += Math.min((now - this.previousTime) / 1000, 0.1) * 0.09;
			this.previousTime = now;
		}
		if (!this.dirty && (!this.playing || now - this.paintedAt < 50)) {
			if (this.playing && visible.length) this.frame = requestAnimationFrame(this.render);
			return;
		}
		const started = performance.now();
		this.dirty = false;
		this.paintedAt = now;
		const host = this.host.getBoundingClientRect();
		if (host.width < 1 || host.height < 1) return;
		if (this.width !== this.host.clientWidth || this.height !== this.host.clientHeight) {
			this.width = this.host.clientWidth;
			this.height = this.host.clientHeight;
			this.renderer.setSize(this.width, this.height, false);
		}
		const clip = this.scroll.getBoundingClientRect();
		this.renderer.setScissorTest(false);
		this.renderer.setClearColor(0, 0);
		this.renderer.clear(true, true, true);
		this.renderer.setScissorTest(true);
		let rendered = 0;
		try {
			for (const element of visible) {
				const rect = element.getBoundingClientRect();
				const left = Math.max(rect.left, clip.left, host.left),
					right = Math.min(rect.right, clip.right, host.right);
				const top = Math.max(rect.top, clip.top, host.top),
					bottom = Math.min(rect.bottom, clip.bottom, host.bottom);
				if (right <= left || bottom <= top) continue;
				const id = element.dataset.previewId;
				if (!id) continue;
				const entry = this.preview(id, now);
				if (!entry) continue;
				const aspect = rect.width / rect.height;
				const halfHeight = entry.radius * 1.12 * Math.max(1, 1 / aspect);
				this.camera.left = -halfHeight * aspect;
				this.camera.right = halfHeight * aspect;
				this.camera.top = halfHeight;
				this.camera.bottom = -halfHeight;
				this.camera.near = Math.max(0.001, entry.radius * 0.01);
				this.camera.far = entry.radius * 12;
				this.camera.updateProjectionMatrix();
				const azimuth = 0.57 + this.angle;
				this.camera.position
					.set(Math.sin(azimuth) * 0.62, 1, Math.cos(azimuth) * 0.62)
					.normalize()
					.multiplyScalar(entry.radius * 4);
				this.camera.lookAt(0, 0, 0);
				this.scene.add(entry.asset.object);
				// WebGPU viewports have a top-left origin and must stay inside their
				// attachment. Preserve the full card's framing with a projection crop
				// when scrolling; a negative viewport would be a GPU validation error.
				this.camera.setViewOffset(
					rect.width,
					rect.height,
					left - rect.left,
					top - rect.top,
					right - left,
					bottom - top
				);
				this.renderer.setViewport(left - host.left, top - host.top, right - left, bottom - top);
				this.renderer.setScissor(left - host.left, top - host.top, right - left, bottom - top);
				try {
					this.renderer.render(this.scene, this.camera);
				} finally {
					this.scene.remove(entry.asset.object);
				}
				element.dataset.previewReady = 'true';
				rendered++;
			}
		} catch (cause) {
			this.playing = false;
			this.canvas.dataset.rotating = 'false';
			this.onerror(cause instanceof Error ? cause.message : 'Live previews are unavailable.');
		}
		const visibleIds = new Set(visible.map((element) => element.dataset.previewId));
		for (const [id, entry] of [...this.cache.entries()].sort(
			(a, b) => a[1].lastUsed - b[1].lastUsed
		)) {
			if (this.cache.size <= 12) break;
			if (!visibleIds.has(id)) {
				entry.asset.dispose();
				this.cache.delete(id);
			}
		}
		this.frames++;
		this.maxRenderMs = Math.max(this.maxRenderMs, performance.now() - started);
		this.canvas.dataset.visiblePreviews = String(rendered);
		this.canvas.dataset.cachedPreviews = String(this.cache.size);
		this.canvas.dataset.renderFrames = String(this.frames);
		this.canvas.dataset.maxRenderMs = this.maxRenderMs.toFixed(1);
		if (this.playing && visible.length) this.frame = requestAnimationFrame(this.render);
	};

	dispose() {
		this.disposed = true;
		cancelAnimationFrame(this.frame);
		this.intersection.disconnect();
		this.mutation.disconnect();
		this.resize.disconnect();
		this.scroll.removeEventListener('scroll', this.invalidate);
		document.removeEventListener('visibilitychange', this.visibilityChanged);
		window.removeEventListener('engine-lab:webgpu-device-lost', this.deviceLost);
		for (const entry of this.cache.values()) entry.asset.dispose();
		this.cache.clear();
		this.environment?.dispose();
		this.renderer.dispose();
		// Geometries are borrowed from the main scene; release this context, never their owners.
	}
}
