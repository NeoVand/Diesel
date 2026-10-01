import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { EngineStudio } from './v12-studio';
import { SceneTransition } from './v12-transition';
import { initialLabState } from '$lib/engine/lab-state';

function returningFromAtlas() {
	const camera = new THREE.PerspectiveCamera(12, 2, 0.025, 2000);
	camera.position.set(0, 50, 0.1);
	const direction = new THREE.Vector3(1.05, 0.52, 1.25).normalize();
	const target = new THREE.Vector3(1, 2, 3);
	const destination = target.clone().addScaledVector(direction, 20);
	const controls = { target: new THREE.Vector3(), enableRotate: true };
	const part = {
		id: 'sample',
		parent: 'block',
		role: 'block',
		path: 'sample',
		bounds: new THREE.Box3(new THREE.Vector3(-2, -2, -2), new THREE.Vector3(2, 2, 2)),
		offset: new THREE.Vector3(),
		removalTransition: new SceneTransition(),
		object: new THREE.Group()
	};
	vi.stubGlobal('getComputedStyle', () => ({ getPropertyValue: () => '' }));
	const studio = Object.assign(Object.create(EngineStudio.prototype), {
		state: { ...initialLabState },
		loaded: true,
		disposed: false,
		reducedMotion: false,
		phase: 0,
		width: 1280,
		height: 640,
		host: {},
		camera,
		perspective: camera,
		controls,
		components: new Map([[part.id, part]]),
		explosionTransition: new SceneTransition(),
		layoutTransition: new SceneTransition(),
		sectionTransition: new SceneTransition(),
		cameraGoal: {
			target,
			direction,
			height: 20 * Math.tan(THREE.MathUtils.degToRad(35 / 2)),
			fov: 35
		},
		invalidate: vi.fn(),
		oninteraction: vi.fn(),
		refreshVisibility: vi.fn(),
		refreshMaterials: vi.fn(),
		refreshSection: vi.fn()
	}) as EngineStudio;
	return { studio, camera, controls, direction, target, destination };
}

afterEach(() => vi.unstubAllGlobals());

describe('interrupted presentation camera intent', () => {
	it('frames the actual family geometry instead of unused atlas panel space', () => {
		const { studio } = returningFromAtlas();
		const bounds = new THREE.Box3(new THREE.Vector3(1, 0, 5), new THREE.Vector3(2, 2, 7));
		const panelBounds = new THREE.Box3(
			new THREE.Vector3(-10, 0, -10),
			new THREE.Vector3(10, 2, 10)
		);
		Reflect.set(studio, 'state', { ...initialLabState, display: 'layout' });
		Reflect.set(studio, 'atlas', { groups: [{ id: 'rods', bounds, panelBounds }] });
		expect(studio.focusAtlasCategory('rods')).toBe(true);
		const goal = Reflect.get(studio, 'cameraGoal');
		// Asymmetric UI reserves shift the optical target along camera-up, including
		// its world-X component in the oblique arrangement view. Horizontal centering
		// must still use the actual family, never the surrounding category panel.
		const center = bounds.getCenter(new THREE.Vector3());
		const right = new THREE.Vector3()
			.crossVectors(new THREE.Vector3(0, 1, 0), goal.direction)
			.normalize();
		expect(goal.target.clone().sub(center).dot(right)).toBeCloseTo(0, 12);
		const fitted = new THREE.PerspectiveCamera(goal.fov, 2, 0.025, 2000);
		const distance = goal.height / Math.tan(THREE.MathUtils.degToRad(goal.fov / 2));
		fitted.position.copy(goal.target).addScaledVector(goal.direction, distance);
		fitted.lookAt(goal.target);
		fitted.updateMatrixWorld(true);
		for (const x of [bounds.min.x, bounds.max.x])
			for (const y of [bounds.min.y, bounds.max.y])
				for (const z of [bounds.min.z, bounds.max.z]) {
					const ndc = new THREE.Vector3(x, y, z).project(fitted);
					expect(Math.abs(ndc.x)).toBeLessThan(1);
					expect(ndc.y).toBeLessThan(1 - (2 * 110) / 640);
					expect(ndc.y).toBeGreaterThan(-1 + (2 * 184) / 640);
				}
		expect(goal.height).toBeLessThan(4);
		expect(bounds.getSize(new THREE.Vector3()).toArray()).toEqual([1, 2, 2]);
		expect(studio.focusAtlasCategory('missing-family')).toBe(false);
	});

	it('uses the pre-atlas destination as the restore anchor when explosion starts during return', () => {
		const { studio, destination, target } = returningFromAtlas();
		studio.update({ ...initialLabState, explosion: 1 });
		const anchor = Reflect.get(studio, 'explosionCamera');
		expect(new THREE.Vector3().fromArray(anchor.position).distanceTo(destination)).toBeLessThan(
			1e-12
		);
		expect(anchor.target).toEqual(target.toArray());
	});

	it('frames the explosion along the intended orbit while interpolation starts at the rendered pose', () => {
		const { studio, camera, controls, direction } = returningFromAtlas();
		const renderedDirection = camera.position.clone().sub(controls.target).normalize();
		studio.update({ ...initialLabState, explosion: 1 });
		const nextGoal = Reflect.get(studio, 'cameraGoal');
		expect(nextGoal.direction.distanceTo(direction)).toBeLessThan(1e-12);
		expect(nextGoal.fromDirection.distanceTo(renderedDirection)).toBeLessThan(1e-12);
		expect(camera.position.toArray()).toEqual([0, 50, 0.1]);
	});
	it('honors a repeated explicit Perspective command instead of retaining the last manual orbit', () => {
		const { studio } = returningFromAtlas();
		studio.update({ ...initialLabState, resetSignal: 1, focusToken: 1, focused: null });
		const direction = Reflect.get(studio, 'cameraGoal').direction;
		expect(direction.distanceTo(new THREE.Vector3(1.05, 0.7, 1.25).normalize())).toBeLessThan(
			1e-12
		);
	});
	it('ordinary Fit retains the intended orbit even when the remembered view is front', () => {
		const { studio, direction } = returningFromAtlas();
		Reflect.set(studio, 'state', { ...initialLabState, view: 'front' });
		studio.update({ ...initialLabState, view: 'front', resetSignal: 1 });
		expect(Reflect.get(studio, 'cameraGoal').direction.distanceTo(direction)).toBeLessThan(1e-12);
	});
});
