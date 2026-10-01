import { describe, it, expect } from 'vitest';
import { visibleAtlasLabels } from './v12-label-layout';
describe('arrangement label collision and viewport LOD', () => {
	const viewport = { width: 390, height: 600, top: 60, bottom: 157 };
	it('keeps the more legible panel and suppresses overlapping labels', () => {
		expect([
			...visibleAtlasLabels(
				[
					{ id: 0, x: 30, y: 80, width: 130, height: 22, priority: 50 },
					{ id: 1, x: 80, y: 90, width: 110, height: 22, priority: 120 },
					{ id: 2, x: 200, y: 200, width: 100, height: 22, priority: 40 }
				],
				viewport
			)
		]).toEqual([1, 2]);
	});
	it('excludes toolbar, transport and edge collisions without changing text size', () => {
		expect([
			...visibleAtlasLabels(
				[
					{ id: 0, x: 20, y: 30, width: 100, height: 22, priority: 1 },
					{ id: 1, x: 310, y: 80, width: 100, height: 22, priority: 1 },
					{ id: 2, x: 10, y: 430, width: 100, height: 22, priority: 1 },
					{ id: 3, x: 20, y: 100, width: 100, height: 22, priority: 1 }
				],
				viewport
			)
		]).toEqual([3]);
	});
});
