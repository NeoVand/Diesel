import * as THREE from 'three';
import { WebGPURenderer, PointsNodeMaterial, ClippingGroup } from 'three/webgpu';
import { ProcessParticles } from './process-particles';
import { prepareProcessDepthView } from './process-depth-view';
import { softFlowParticleTexture } from './native-flow-particles';
import { DirectedFlowVolume } from './directed-flow-volume';
import { V12ExhaustOutlet } from './v12-exhaust-outlet';
import { V12ChamberVolume } from './v12-chamber-volume';
import { V12ChamberDomain, V12_CHAMBER_DATUMS } from './v12-chamber-domain';

/** Real GPU integration check with synthetic gas bounds; requires no purchased geometry. */
export async function verifyProcessWebGPU() {
	const renderer = new WebGPURenderer({ antialias: true });
	await renderer.init();
	if (!('isWebGPUBackend' in renderer.backend) || !renderer.backend.isWebGPUBackend)
		throw Error('Native WebGPU backend required');
	renderer.setSize(256, 256);
	renderer.setPixelRatio(1);
	renderer.setClearColor(0x000000, 1);
	document.body.append(renderer.domElement);
	const target = new THREE.RenderTarget(256, 256);
	const depthTexture = new THREE.DepthTexture(256, 256, THREE.UnsignedInt248Type);
	depthTexture.format = THREE.DepthStencilFormat;
	const depthTarget = new THREE.RenderTarget(256, 256, {
		depthTexture,
		stencilBuffer: true,
		samples: 0
	});
	const errors: string[] = [];
	const device = (renderer.backend as unknown as { device: GPUDevice }).device;
	device.addEventListener('uncapturederror', (e) =>
		errors.push((e as GPUUncapturedErrorEvent).error.message)
	);
	const scene = new THREE.Scene(),
		empty = new THREE.Scene();
	const camera = new THREE.PerspectiveCamera(42, 1, 0.001, 1000);
	const field = new Float32Array(V12_CHAMBER_DATUMS.floats);
	for (let i = 0; i < field.length; i += 2) {
		field[i] = 40;
		field[i + 1] = 221;
	}
	const domain = new V12ChamberDomain(0, field);
	domain.toWorld.identity();
	domain.pinAxialMm = 0;
	const chamber = new V12ChamberVolume(domain),
		exhaust = new V12ExhaustOutlet();
	const directed = new DirectedFlowVolume(
		[
			{
				id: 'fixture',
				gate: 0,
				radiusMm: 12,
				pointsMm: [
					[0, 0, 0],
					[0, 160, 0]
				]
			}
		],
		0x83dded,
		'Fixture connected flow',
		{ throughSolids: true }
	);
	// Compile placeholders against the MSAA canvas before the first single-sample depth pass.
	chamber.mesh.visible = true;
	exhaust.update(0.25, true, null, [1, 1]);
	directed.update(0.25, true, [1], null);
	scene.add(chamber.mesh, exhaust.group, directed.mesh);
	camera.position.set(0, 0, 10);
	camera.updateMatrixWorld();
	await renderer.compileAsync(scene, camera);
	const results = [];
	for (const kind of ['chamber', 'exhaust', 'directed'] as const) {
		scene.clear();
		let bounds: THREE.Box3;
		if (kind === 'chamber') {
			chamber.update(10, true, true, null);
			const u = chamber.mesh.material.uniforms;
			u.uPin.value = 0;
			u.uMin.value.y = 150;
			u.uMax.value.y = 221;
			u.uNozzle.value = 221;
			u.uBurn.value = 1;
			u.uSpray.value = 0.5;
			chamber.mesh.visible = true;
			scene.add(chamber.mesh);
			bounds = new THREE.Box3(u.uMin.value.clone(), u.uMax.value.clone());
			chamber.setDepth(depthTarget.depthTexture!, 256, 256);
		} else if (kind === 'exhaust') {
			exhaust.update(0.25, true, null, [1, 0]);
			scene.add(exhaust.group);
			const mesh = exhaust.group.children[0] as THREE.Mesh;
			bounds = new THREE.Box3(
				new THREE.Vector3(-48, -48, -4),
				new THREE.Vector3(48, 56, 150)
			).applyMatrix4(mesh.matrix);
			exhaust.setDepth(depthTarget.depthTexture!, 256, 256);
		} else {
			directed.update(0.25, true, [1], null);
			scene.add(directed.mesh);
			bounds = new THREE.Box3().setFromObject(directed.mesh);
			directed.setDepth(depthTarget.depthTexture!, 256, 256);
		}
		const center = bounds.getCenter(new THREE.Vector3()),
			radius = bounds.getSize(new THREE.Vector3()).length() * 0.5;
		camera.position
			.copy(center)
			.add(new THREE.Vector3(0.6, 0.2, 1).normalize().multiplyScalar(radius * 3));
		camera.near = radius * 0.01;
		camera.far = radius * 8;
		camera.updateProjectionMatrix();
		camera.lookAt(center);
		camera.updateMatrixWorld();
		renderer.setRenderTarget(depthTarget);
		renderer.render(empty, camera);
		prepareProcessDepthView(renderer, depthTarget.depthTexture!);
		const draw = async () => {
			renderer.setRenderTarget(target);
			renderer.render(scene, camera);
			return new Uint8Array(await renderer.readRenderTargetPixelsAsync(target, 0, 0, 256, 256));
		};
		const before = await draw();
		if (kind === 'chamber') chamber.mesh.material.uniforms.uPhase.value += 1.2;
		else if (kind === 'exhaust') exhaust.update(0.42, true, null, [1, 0]);
		else directed.update(0.42, true, [1], null);
		const after = await draw();
		// A complete opaque wall in front of the optical domain must suppress ray-integrated volumes.
		const blocker = new THREE.Mesh(
			new THREE.PlaneGeometry(radius * 8, radius * 8),
			new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })
		);
		blocker.position.copy(center).lerp(camera.position, 0.5);
		blocker.quaternion.copy(camera.quaternion);
		empty.add(blocker);
		renderer.setRenderTarget(depthTarget);
		renderer.render(empty, camera);
		prepareProcessDepthView(renderer, depthTarget.depthTexture!);
		const occluded = await draw();
		empty.clear();
		// Cut samples in world coordinates without clipping away the proxy box itself.
		renderer.setRenderTarget(depthTarget);
		renderer.render(empty, camera);
		prepareProcessDepthView(renderer, depthTarget.depthTexture!);
		const sectionNormal = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
		const section = new THREE.Plane(sectionNormal, -sectionNormal.dot(center));
		if (kind === 'chamber') {
			const u = chamber.mesh.material.uniforms;
			u.uHasClip.value = 1;
			u.uPlane.value.set(...section.normal.toArray(), section.constant);
		} else if (kind === 'exhaust') exhaust.update(0.42, true, section, [1, 0]);
		else directed.update(0.42, true, [1], section);
		const sectioned = await draw();
		let energy = 0,
			difference = 0,
			occludedEnergy = 0,
			sectionEnergy = 0,
			phaseEnergy = 0;
		for (let i = 0; i < before.length; i++)
			if (i % 4 !== 3) {
				energy += before[i];
				difference += Math.abs(before[i] - after[i]);
				occludedEnergy += occluded[i];
				sectionEnergy += sectioned[i];
				phaseEnergy += after[i];
			}
		if (energy < 1000) throw Error(`${kind}: optical volume missing (${energy})`);
		if (difference < 100) throw Error(`${kind}: optical phase not moving (${difference})`);
		if (kind !== 'directed' && occludedEnergy > energy * 0.01)
			throw Error(`${kind}: opaque depth leakage (${occludedEnergy}/${energy})`);
		if (sectionEnergy < 100 || sectionEnergy > phaseEnergy * 0.98)
			throw Error(
				`${kind}: section plane did not preserve a visible partial volume (${sectionEnergy}/${phaseEnergy})`
			);
		results.push({ kind, energy, difference, occludedEnergy, sectionEnergy });
		blocker.geometry.dispose();
		blocker.material.dispose();
	}

	// Sized, soft particles must remain billboards on WebGPU, not silently collapse to 1px dots.
	scene.clear();
	const particleGeometry = new THREE.BufferGeometry();
	particleGeometry.setAttribute(
		'position',
		new THREE.BufferAttribute(new Float32Array([0, 0, 0]), 3).setUsage(THREE.DynamicDrawUsage)
	);
	particleGeometry.setAttribute(
		'color',
		new THREE.BufferAttribute(new Float32Array([0.3, 0.7, 1, 0.8]), 4).setUsage(
			THREE.DynamicDrawUsage
		)
	);
	const particleMap = softFlowParticleTexture();
	const particleMaterial = new PointsNodeMaterial({
		size: 0.6,
		sizeAttenuation: true,
		transparent: true,
		map: particleMap,
		depthWrite: false,
		opacity: 0.7,
		toneMapped: false
	});
	const cloud = new ProcessParticles(particleGeometry, particleMaterial);
	cloud.setCount(1);
	const clip = new ClippingGroup();
	clip.add(cloud);
	scene.add(clip);
	camera.position.set(0, 0, 3);
	camera.near = 0.01;
	camera.far = 10;
	camera.lookAt(0, 0, 0);
	camera.updateProjectionMatrix();
	camera.updateMatrixWorld();
	const particlesDraw = async () => {
		renderer.setRenderTarget(target);
		renderer.render(scene, camera);
		return new Uint8Array(await renderer.readRenderTargetPixelsAsync(target, 0, 0, 256, 256));
	};
	const visiblePixels = await particlesDraw();
	let nonzero = 0,
		brightness = 0;
	for (let i = 0; i < visiblePixels.length; i += 4)
		if (visiblePixels[i] + visiblePixels[i + 1] + visiblePixels[i + 2] > 6) {
			nonzero++;
			brightness += visiblePixels[i] + visiblePixels[i + 1] + visiblePixels[i + 2];
		}
	if (nonzero < 100)
		throw Error('WebGPU sized particles regressed to point primitives: ' + nonzero);
	clip.clippingPlanes = [new THREE.Plane(new THREE.Vector3(1, 0, 0), -2)];
	const hiddenPixels = await particlesDraw();
	if (hiddenPixels.some((v, i) => i % 4 !== 3 && v > 2))
		throw Error('Particle section plane did not clip instances');
	results.push({
		kind: 'sized-particle',
		energy: brightness,
		difference: nonzero,
		occludedEnergy: 0
	});
	cloud.dispose();
	particleGeometry.dispose();
	particleMap.dispose();
	particleMaterial.dispose();
	await device.queue.onSubmittedWorkDone();
	if (errors.length) throw Error(errors.join('\n'));
	renderer.setRenderTarget(null);
	renderer.dispose();
	target.dispose();
	depthTarget.dispose();
	chamber.dispose();
	domain.dispose();
	exhaust.dispose();
	directed.dispose();
	return { backend: 'WebGPU', results, errors };
}
