import { describe, expect, it } from 'vitest';
import { V12RenderQuality } from './v12-render-quality';

const frames = (quality: V12RenderQuality, count: number, elapsed = 33.3) => {
	for (let frame = 0; frame < count; frame++) quality.update(elapsed, true);
	return quality.pixelRatio;
};

describe('adaptive viewport pixel budget', () => {
	it('ignores startup intervals and reduces at most one quarter per sustained slow window', () => {
		const quality = new V12RenderQuality(2);
		expect(quality.pixelRatio).toBe(1.5);
		expect(frames(quality, 2, 1000)).toBe(1.5);
		expect(frames(quality, 15)).toBe(1.5);
		expect(frames(quality, 1)).toBe(1.25);
		expect(frames(quality, 15)).toBe(1.25);
		expect(frames(quality, 1)).toBe(1);
		expect(frames(quality, 64, 100)).toBe(1);
	});
	it('does not react to brief spikes or increase detail during the same active period', () => {
		const quality = new V12RenderQuality(2);
		frames(quality, 2);
		for (let window = 0; window < 3; window++) {
			frames(quality, 13, 16.7);
			frames(quality, 3, 100);
		}
		expect(quality.pixelRatio).toBe(1.5);
		expect(frames(quality, 16, 24)).toBe(1.5);
		expect(frames(quality, 16, 33.3)).toBe(1.25);
		expect(frames(quality, 64, 16.7)).toBe(1.25);
	});

	it('restores full detail and a fresh warmup/window when motion ends', () => {
		const quality = new V12RenderQuality(2);
		frames(quality, 34);
		expect(quality.pixelRatio).toBe(1);
		expect(quality.update(0, false)).toBe(1.5);
		expect(frames(quality, 17)).toBe(1.5);
		expect(frames(quality, 1)).toBe(1.25);
		frames(quality, 10);
		quality.update(Number.NaN, false);
		expect(frames(quality, 17)).toBe(1.5);
	});

	it('respects native device resolution and its one-pixel floor', () => {
		for (const [device, maximum, minimum] of [
			[1, 1, 1],
			[0.8, 0.8, 0.8],
			[1.3, 1.3, 1],
			[3, 1.5, 1]
		]) {
			const quality = new V12RenderQuality(device);
			expect(quality.pixelRatio).toBe(maximum);
			expect(frames(quality, 98)).toBe(minimum);
			expect(quality.update(16.7, false)).toBe(maximum);
		}
	});

	it('ignores invalid timing samples and falls back safely for an invalid device ratio', () => {
		for (const device of [Number.NaN, Infinity, -1, 0])
			expect(new V12RenderQuality(device).pixelRatio).toBe(1);
		const quality = new V12RenderQuality(2);
		frames(quality, 2);
		frames(quality, 15);
		for (const invalid of [Number.NaN, Infinity, -Infinity, -1, 0])
			expect(quality.update(invalid, true)).toBe(1.5);
		expect(quality.update(33.3, true)).toBe(1.25);
	});
});
