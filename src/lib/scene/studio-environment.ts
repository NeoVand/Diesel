import * as THREE from 'three';

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
