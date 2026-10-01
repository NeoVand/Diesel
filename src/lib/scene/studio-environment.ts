import * as THREE from 'three';
import { WebGPURenderer } from 'three/webgpu';

/** Every live viewport uses the WebGPU backend; unsupported devices receive an explicit error. */
export function createStrictWebGPURenderer(
	options: ConstructorParameters<typeof WebGPURenderer>[0] = {}
): WebGPURenderer {
	const renderer = new WebGPURenderer(options);
	// r186's WebGPURenderer installs an unconditional fallback, overriding the supplied
	// Renderer option. Disable that hook before init so a lost/unsupported GPU never
	// silently creates a WebGL renderer while the interface reports WebGPU.
	(renderer as unknown as { _getFallback: null })._getFallback = null;
	const markDeviceLost = renderer.onDeviceLost.bind(renderer);
	renderer.onDeviceLost = (info) => {
		if (info.reason === 'destroyed') return;
		// Preserve Three's lost-state bookkeeping; otherwise its RAF loop keeps
		// submitting work to a dead device even after the interface shows an error.
		markDeviceLost(info);
		window.dispatchEvent(
			new CustomEvent('engine-lab:webgpu-device-lost', {
				detail: `The graphics device stopped responding. Reload the page to restart WebGPU. ${info.message}`
			})
		);
	};
	return renderer;
}

export async function initializeWebGPURenderer(renderer: WebGPURenderer): Promise<void> {
	if (!navigator.gpu)
		throw new Error(
			'This engine studio requires WebGPU. Open it in a current desktop Chrome or Edge browser with hardware acceleration enabled.'
		);
	try {
		await renderer.init();
		if (!(renderer.backend as unknown as { isWebGPUBackend?: boolean }).isWebGPUBackend)
			throw new Error('A WebGPU rendering device could not be initialized.');
	} catch (error) {
		throw new Error(
			`WebGPU rendering is unavailable on this device. ${error instanceof Error ? error.message : 'Enable hardware acceleration or use another desktop browser.'}`,
			{ cause: error }
		);
	}
}

/** Authored reflection cards: a dark photographic studio with controlled warm/cool highlights. */
export function createStudioEnvironment(): { scene: THREE.Scene; dispose: () => void } {
	const scene = new THREE.Scene();
	const resources: { geometry: THREE.BufferGeometry; material: THREE.Material }[] = [];
	const roomGeometry = new THREE.BoxGeometry(24, 18, 24);
	const roomMaterial = new THREE.MeshBasicMaterial({ color: 0x121821, side: THREE.BackSide });
	scene.add(new THREE.Mesh(roomGeometry, roomMaterial));
	resources.push({ geometry: roomGeometry, material: roomMaterial });
	const card = (
		width: number,
		height: number,
		position: [number, number, number],
		color: number,
		strength: number
	) => {
		const geometry = new THREE.PlaneGeometry(width, height);
		const material = new THREE.MeshBasicMaterial({
			color: new THREE.Color(color).multiplyScalar(strength),
			side: THREE.DoubleSide,
			toneMapped: false
		});
		const panel = new THREE.Mesh(geometry, material);
		panel.position.set(...position);
		panel.lookAt(0, 0, 0);
		scene.add(panel);
		resources.push({ geometry, material });
	};
	card(4.5, 2.6, [-5, 6, 4], 0xffe6c1, 3.0);
	card(1.1, 5, [5, 3, -4], 0xbbd1ea, 2.0);
	card(2.4, 3, [3, 1, 6], 0x93a2b7, 1.0);
	card(3, 2.5, [0, 8, 0], 0xd1d9e4, 1.4);
	return {
		scene,
		dispose: () =>
			resources.forEach((resource) => {
				resource.geometry.dispose();
				resource.material.dispose();
			})
	};
}
