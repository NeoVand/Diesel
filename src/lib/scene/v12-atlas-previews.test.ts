import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { EngineStudio } from './v12-studio';
import { createV12Atlas } from './v12-layout';

/** Test preview isolation and resource restoration without creating a GPU or browser. */
function fixture() {
	const material = new THREE.MeshStandardMaterial({
		opacity: 0.25,
		transparent: true,
		depthWrite: false
	});
	material.clippingPlanes = [new THREE.Plane(new THREE.Vector3(1, 0, 0), -0.5)];
	const geometry = new THREE.BoxGeometry(1, 2, 1);
	const mesh = new THREE.Mesh(geometry, material);
	const object = new THREE.Group();
	object.matrixAutoUpdate = false;
	object.visible = false;
	object.add(mesh);
	const part = {
		id: 'test-rod',
		role: 'rod',
		path: '/connecting rod',
		parent: 'block' as const,
		bounds: new THREE.Box3(new THREE.Vector3(-0.5, -1, -0.5), new THREE.Vector3(0.5, 1, 0.5))
	};
	const atlas = createV12Atlas([part], -4);
	const target = { name: 'live-render-target' };
	const key = { shadow: { needsUpdate: true } };
	const viewport = new THREE.Vector4(14, 21, 800, 500);
	const scissor = new THREE.Vector4(4, 9, 400, 300);
	const renderer = {
		getRenderTarget: vi.fn(() => target),
		setRenderTarget: vi.fn(),
		getViewport: vi.fn((value: THREE.Vector4) => value.copy(viewport)),
		setViewport: vi.fn(),
		getScissor: vi.fn((value: THREE.Vector4) => value.copy(scissor)),
		setScissor: vi.fn(),
		getScissorTest: vi.fn(() => true),
		setScissorTest: vi.fn(),
		render: vi.fn(),
		readRenderTargetPixelsAsync: vi.fn(async () => new Uint8Array(640 * 420 * 4))
	};
	const canvas = {
		width: 0,
		height: 0,
		getContext: vi.fn(() => ({
			createImageData: (width: number, height: number) => ({
				data: new Uint8ClampedArray(width * height * 4)
			}),
			putImageData: vi.fn()
		})),
		toDataURL: vi.fn(() => 'data:image/png;base64,source-preview')
	};
	vi.stubGlobal('document', { createElement: vi.fn(() => canvas) });
	// Skip device initialization; invoke the real public API and preview implementation.
	const studio = Object.assign(Object.create(EngineStudio.prototype), {
		loaded: true,
		disposed: false,
		atlas,
		atlasPreviewPromise: null,
		scene: new THREE.Scene(),
		renderer,
		key,
		components: new Map([
			[part.id, { ...part, object, meshes: [mesh], baseMaterials: new Map([[mesh, material]]) }]
		])
	}) as EngineStudio;
	return { studio, renderer, key, target, viewport, scissor, material, mesh, object, canvas };
}

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('source geometry atlas preview API', () => {
	it('coalesces concurrent requests into one cached render and produces the expected preview resolution', async () => {
		const { studio, renderer, canvas } = fixture();
		const first = studio.getAtlasPreviews();
		const second = studio.getAtlasPreviews();
		expect(second).toBe(first);
		await expect(first).resolves.toEqual({ rods: 'data:image/png;base64,source-preview' });
		expect(studio.getAtlasPreviews()).toBe(first);
		expect(renderer.render).toHaveBeenCalledTimes(1);
		expect(canvas.width).toBe(640);
		expect(canvas.height).toBe(420);
	});

	it('renders opaque source-material clones without changing the hidden, clipped live component', async () => {
		const { studio, renderer, material, mesh, object } = fixture();
		let previewMaterial: THREE.MeshStandardMaterial | undefined;
		renderer.render.mockImplementation((scene: THREE.Scene) => {
			scene.traverse((child) => {
				if (child instanceof THREE.Mesh) {
					previewMaterial = child.material as THREE.MeshStandardMaterial;
					expect(child.geometry).toBe(mesh.geometry);
					expect(child.visible).toBe(true);
				}
			});
		});
		await studio.getAtlasPreviews();
		expect(previewMaterial).not.toBe(material);
		expect(previewMaterial).toMatchObject({
			opacity: 1,
			transparent: false,
			depthWrite: true,
			clippingPlanes: null
		});
		expect(material.opacity).toBe(0.25);
		expect(material.clippingPlanes).toHaveLength(1);
		expect(object.visible).toBe(false);
		expect(object.matrix.equals(new THREE.Matrix4())).toBe(true);
	});

	it('restores live render state on failed pixel readback and permits a fresh successful preview request', async () => {
		const { studio, renderer, key, target } = fixture();
		const dispose = vi.spyOn(THREE.RenderTarget.prototype, 'dispose');
		renderer.readRenderTargetPixelsAsync.mockRejectedValueOnce(new Error('Readback interrupted'));
		await expect(studio.getAtlasPreviews()).rejects.toThrow('Readback interrupted');
		expect(renderer.setRenderTarget).toHaveBeenLastCalledWith(target);
		// Render-target binding restores its physical viewport. Manual setViewport
		// would multiply by canvas DPR and reintroduce cropped thumbnails.
		expect(renderer.setViewport).not.toHaveBeenCalled();
		expect(renderer.setScissor).not.toHaveBeenCalled();
		expect(renderer.setScissorTest).not.toHaveBeenCalled();
		expect(key.shadow.needsUpdate).toBe(true);
		expect(dispose).toHaveBeenCalledTimes(1);
		await expect(studio.getAtlasPreviews()).resolves.toEqual({
			rods: 'data:image/png;base64,source-preview'
		});
		expect(renderer.render).toHaveBeenCalledTimes(2);
		expect(dispose).toHaveBeenCalledTimes(2);
	});
	it('exports an independent live preview tree and disposes its materials exactly once without source geometry', () => {
		const { studio, mesh, material, object } = fixture();
		const sourceDispose = vi.spyOn(mesh.geometry, 'dispose');
		const materialDispose = vi.spyOn(material, 'dispose');
		const asset = studio.createAtlasPreviewAsset('rods')!;
		expect(asset.object).not.toBe(object);
		expect(asset.bounds.isEmpty()).toBe(false);
		const materials: THREE.Material[] = [];
		asset.object.traverse((child) => {
			if (child instanceof THREE.Mesh) {
				expect(child.geometry).toBe(mesh.geometry);
				materials.push(...(Array.isArray(child.material) ? child.material : [child.material]));
			}
		});
		const disposals = materials.map((m) => vi.spyOn(m, 'dispose'));
		asset.dispose();
		asset.dispose();
		for (const dispose of disposals) expect(dispose).toHaveBeenCalledTimes(1);
		expect(sourceDispose).not.toHaveBeenCalled();
		expect(materialDispose).not.toHaveBeenCalled();
		expect(studio.createAtlasPreviewAsset('unknown')).toBeNull();
	});
});
