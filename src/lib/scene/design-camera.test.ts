import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
	canonicalDesignDirection,
	designCameraFrame,
	designOrthographicFrame,
	interpolateDesignCamera,
	validateDesignCameraPose
} from './design-camera';

describe('design viewport framing', () => {
	it('fits visible dimension backplates, not just their anchors, above the laptop bottom toolbar', () => {
		const bounds = new THREE.Box3(new THREE.Vector3(-73, -53, -8), new THREE.Vector3(32, 140, 22));
		const annotations = [
			{ position: new THREE.Vector3(-73, 62.5, 0), halfWidthPx: 39, halfHeightPx: 14 },
			{ position: new THREE.Vector3(0, 50, 22), halfWidthPx: 35, halfHeightPx: 14 },
			{ position: new THREE.Vector3(0, -53, 0), halfWidthPx: 36, halfHeightPx: 14 }
		];
		const direction = new THREE.Vector3(235, 44, 290),
			up = new THREE.Vector3(0, 1, 0);
		for (const [width, height] of [
			[698, 348],
			[698, 398],
			[390, 610]
		]) {
			const perspective = designCameraFrame(
				bounds,
				direction,
				width,
				height,
				33,
				1,
				up,
				annotations
			);
			const orthographic = designOrthographicFrame(
				bounds,
				direction,
				width,
				height,
				1,
				up,
				annotations
			);
			for (const [frame, camera] of [
				[perspective, new THREE.PerspectiveCamera(33, width / height, 1, 6000)],
				[
					orthographic,
					new THREE.OrthographicCamera(
						(-orthographic.verticalSpanMm * width) / height / 2,
						(orthographic.verticalSpanMm * width) / height / 2,
						orthographic.verticalSpanMm / 2,
						-orthographic.verticalSpanMm / 2,
						1,
						6000
					)
				]
			] as const) {
				camera.position.copy(frame.position);
				camera.lookAt(frame.target);
				camera.updateMatrixWorld();
				if (width === 698) {
					expect(frame.inset.top).toBe(30);
					expect(frame.inset.bottom).toBe(110);
				}
				for (const label of annotations) {
					const projected = label.position.clone().project(camera),
						x = ((projected.x + 1) * width) / 2,
						y = ((1 - projected.y) * height) / 2;
					expect(x - label.halfWidthPx).toBeGreaterThan(frame.inset.left);
					expect(x + label.halfWidthPx).toBeLessThan(width - frame.inset.right);
					expect(y - label.halfHeightPx).toBeGreaterThan(frame.inset.top);
					expect(y + label.halfHeightPx).toBeLessThan(height - frame.inset.bottom);
				}
			}
		}
	});
	it('reserves mobile toolbar and playback space without enlarging desktop insets', () => {
		const bounds = new THREE.Box3(new THREE.Vector3(-32, -32, -8), new THREE.Vector3(32, 140, 8));
		const direction = canonicalDesignDirection('isometric');
		for (const fit of [
			designCameraFrame(bounds, direction, 390, 610),
			designOrthographicFrame(bounds, direction, 390, 610)
		]) {
			expect(fit.inset.top).toBe(160);
			expect(fit.inset.bottom).toBe(95);
		}
		expect(designCameraFrame(bounds, direction, 900, 610).inset.top).toBe(30);
	});
	it('fits each canonical orthographic projection and preserves its actual world axis', () => {
		const bounds = new THREE.Box3(
			new THREE.Vector3(-100, -30, -20),
			new THREE.Vector3(50, 190, 20)
		);
		for (const view of ['front', 'right', 'top', 'isometric'] as const)
			for (const [width, height] of [
				[900, 700],
				[380, 500],
				[1000, 400]
			]) {
				const direction = canonicalDesignDirection(view);
				const frame = designOrthographicFrame(bounds, direction, width, height);
				const half = frame.verticalSpanMm / 2;
				const camera = new THREE.OrthographicCamera(
					(-half * width) / height,
					(half * width) / height,
					half,
					-half,
					0.1,
					6000
				);
				camera.position.copy(frame.position);
				camera.lookAt(frame.target);
				camera.updateMatrixWorld();
				for (const x of [bounds.min.x, bounds.max.x])
					for (const y of [bounds.min.y, bounds.max.y])
						for (const z of [bounds.min.z, bounds.max.z]) {
							const point = new THREE.Vector3(x, y, z).project(camera);
							const px = ((point.x + 1) * width) / 2,
								py = ((1 - point.y) * height) / 2;
							expect(px).toBeGreaterThan(frame.inset.left);
							expect(px).toBeLessThan(width - frame.inset.right);
							expect(py).toBeGreaterThan(frame.inset.top);
							expect(py).toBeLessThan(height - frame.inset.bottom);
						}
			}
		expect(canonicalDesignDirection('front').toArray()).toEqual([0, 0, 1]);
		expect(canonicalDesignDirection('right').toArray()).toEqual([1, 0, 0]);
		expect(canonicalDesignDirection('top').y).toBeCloseTo(1, 10);
	});

	it('rotates between opposite views without plunging through the model or changing distance', () => {
		for (const fraction of [0, 0.25, 0.5, 0.75, 1]) {
			const frame = interpolateDesignCamera(
				new THREE.Vector3(0, 0, 500),
				new THREE.Vector3(),
				new THREE.Vector3(0, 0, -500),
				new THREE.Vector3(),
				fraction
			);
			expect(frame.position.length()).toBeCloseTo(500, 10);
		}
	});

	it('rejects malformed synchronized camera state before it can affect the peer viewport', () => {
		const pose = {
			position: [0, 0, 100] as [number, number, number],
			target: [0, 0, 0] as [number, number, number],
			up: [0, 1, 0] as [number, number, number],
			projection: 'orthographic' as const,
			verticalSpanMm: 200
		};
		expect(validateDesignCameraPose(pose)).toBe(true);
		for (const invalid of [
			{ ...pose, verticalSpanMm: -1 },
			{ ...pose, target: pose.position },
			{ ...pose, up: [0, 0, 1] as [number, number, number] },
			{ ...pose, position: [NaN, 0, 100] as [number, number, number] }
		])
			expect(validateDesignCameraPose(invalid)).toBe(false);
	});
	it('fits every bound corner inside the heading/control insets at desktop and mobile sizes', () => {
		const bounds = [
			new THREE.Box3(new THREE.Vector3(-95, -60, -15), new THREE.Vector3(62, 185, 20)),
			new THREE.Box3(new THREE.Vector3(-370, -96, -220), new THREE.Vector3(400, 320, 220))
		];
		for (const box of bounds)
			for (const [width, height] of [
				[900, 700],
				[390, 430],
				[320, 430],
				[800, 400]
			])
				for (const direction of [
					new THREE.Vector3(235, 44, 290),
					new THREE.Vector3(570, 320, 760),
					new THREE.Vector3(-400, -200, 300)
				]) {
					const frame = designCameraFrame(box, direction, width, height);
					const camera = new THREE.PerspectiveCamera(33, width / height, 1, 5000);
					camera.position.copy(frame.position);
					camera.lookAt(frame.target);
					camera.updateMatrixWorld();
					for (const x of [box.min.x, box.max.x])
						for (const y of [box.min.y, box.max.y])
							for (const z of [box.min.z, box.max.z]) {
								const ndc = new THREE.Vector3(x, y, z).project(camera);
								const px = ((ndc.x + 1) * width) / 2,
									py = ((1 - ndc.y) * height) / 2;
								expect(px).toBeGreaterThan(frame.inset.left);
								expect(px).toBeLessThan(width - frame.inset.right);
								expect(py).toBeGreaterThan(frame.inset.top);
								expect(py).toBeLessThan(height - frame.inset.bottom);
							}
				}
	});
	it('retains orbit direction and relative zoom when refitted to a narrow viewport', () => {
		const bounds = new THREE.Box3(
			new THREE.Vector3(-370, -96, -220),
			new THREE.Vector3(400, 320, 220)
		);
		const direction = new THREE.Vector3(600, 180, -470).normalize();
		const desktop = designCameraFrame(bounds, direction, 1100, 750, 33, 1.35);
		const mobile = designCameraFrame(bounds, direction, 390, 430, 33, 1.35);
		expect(
			desktop.position.clone().sub(desktop.target).normalize().distanceTo(direction)
		).toBeLessThan(1e-12);
		expect(
			mobile.position.clone().sub(mobile.target).normalize().distanceTo(direction)
		).toBeLessThan(1e-12);
		expect(mobile.distance / designCameraFrame(bounds, direction, 390, 430).distance).toBeCloseTo(
			1.35,
			12
		);
	});
});
