import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
	SceneTransition,
	TrackingTransition,
	transitionEase,
	transitionDirection
} from './v12-transition';

describe('continuous presentation transitions', () => {
	it('travels through a stable unit-direction arc from underside views to the atlas', () => {
		const from = new THREE.Vector3(0, -1, 0);
		const to = new THREE.Vector3(0, 1, 0);
		let previous = from;
		for (let i = 0; i <= 120; i++) {
			const direction = transitionDirection(from, to, i / 120);
			expect(direction.length()).toBeCloseTo(1, 12);
			expect(direction.angleTo(previous)).toBeLessThan(0.027);
			previous = direction;
		}
		expect(previous.distanceTo(to)).toBeLessThan(1e-12);
	});
	it('finishes at the same exact value across different render rates', () => {
		for (const fps of [30, 60, 144]) {
			const transition = new SceneTransition();
			transition.retarget(1, 1.2);
			for (let i = 0; i < fps * 1.2 - 1; i++) transition.advance(1 / fps);
			expect(transition.value).toBeLessThan(1);
			transition.advance(2 / fps);
			expect(transition.value).toBe(1);
			expect(transition.active).toBe(false);
		}
	});

	it('redirects at the rendered value without a position discontinuity or overshoot', () => {
		const transition = new SceneTransition();
		transition.retarget(1);
		transition.advance(0.7);
		const midpoint = transition.value;
		transition.retarget(0);
		expect(transition.value).toBe(midpoint);
		let previous = midpoint;
		for (let i = 0; i < 100; i++) {
			transition.advance(1 / 60);
			expect(transition.value).toBeLessThanOrEqual(previous);
			expect(transition.value).toBeGreaterThanOrEqual(0);
			previous = transition.value;
		}
		expect(transition.value).toBe(0);
	});

	it('does not restart a transition when unchanged state is delivered', () => {
		const transition = new SceneTransition();
		transition.retarget(1);
		transition.advance(0.6);
		transition.retarget(1);
		transition.advance(0.6);
		expect(transition.value).toBe(1);
	});

	it('supports immediate reduced-motion values and smooth bounded end velocities', () => {
		const transition = new SceneTransition();
		transition.retarget(0.12, 0);
		expect(transition.value).toBe(0.12);
		expect(transition.active).toBe(false);
		expect(transitionEase(-1)).toBe(0);
		expect(transitionEase(2)).toBe(1);
		expect(transitionEase(0.01)).toBeLessThan(0.00001);
		expect(1 - transitionEase(0.99)).toBeLessThan(0.00001);
	});
});

describe('live separation target tracking', () => {
	it('moves substantially while targets continue arriving before pointer release', () => {
		const transition = new TrackingTransition();
		for (let i = 1; i <= 6; i++) {
			transition.retarget(i / 6);
			transition.advance(0.035);
		}
		expect(transition.value).toBeGreaterThan(0.6);
		expect(transition.value).toBeLessThan(1);
		expect(transition.active).toBe(true);
	});
	it('has the same physical response at different frame rates', () => {
		const values = [30, 60, 144].map((fps) => {
			const transition = new TrackingTransition();
			transition.retarget(1);
			for (let i = 0; i < fps / 2; i++) transition.advance(1 / fps);
			return transition.value;
		});
		expect(Math.max(...values) - Math.min(...values)).toBeLessThan(1e-12);
	});
	it('preserves continuity through reversals and settles exactly at both endpoints', () => {
		const transition = new TrackingTransition();
		transition.retarget(1);
		transition.advance(0.1);
		const before = transition.value;
		transition.retarget(0);
		expect(transition.value).toBe(before);
		for (let i = 0; i < 120; i++) expect(transition.advance(1 / 60)).toBeGreaterThanOrEqual(0);
		expect(transition.value).toBe(0);
		expect(transition.active).toBe(false);
		transition.retarget(1);
		transition.advance(0.05);
		transition.retarget(1, 0);
		expect(transition.value).toBe(1);
		expect(transition.active).toBe(false);
	});
});
