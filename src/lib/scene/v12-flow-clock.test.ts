import { describe, expect, it } from 'vitest';
import { V12FlowClock } from './v12-flow-clock';
import { DIRECTED_FLOW_PITCH_MM, DIRECTED_FLOW_SPEED_MM_S } from './directed-flow-volume';

describe('continuous readable process clock', () => {
	it('keeps every forward step below temporal aliasing at slow and fast playback, even after a stalled frame', () => {
		for (const fps of [5, 15, 30, 60, 120])
			for (const playback of [0.02, 0.1, 0.5, 1]) {
				const clock = new V12FlowClock();
				clock.update(700, false, 1 / fps);
				let last = clock.seconds;
				for (let frame = 1; frame < 50; frame++) {
					const next = clock.update(700 + (frame * 1800 * playback) / fps, true, 1 / fps);
					expect(next).toBeGreaterThan(last);
					expect((next - last) * DIRECTED_FLOW_SPEED_MM_S).toBeLessThanOrEqual(
						DIRECTED_FLOW_PITCH_MM * 0.2 + 1e-10
					);
					last = next;
				}
			}
	});
	it('does not reset on pause/resume or cycle wrap, but reproduces explicit seeks', () => {
		const clock = new V12FlowClock();
		clock.update(719, false, 1 / 60);
		const moving = clock.update(720, true, 1 / 60);
		expect(moving).toBeCloseTo(8, 10);
		expect(clock.update(720, false, 1 / 60)).toBe(moving);
		expect(clock.update(720, true, 1 / 60)).toBe(moving);
		expect(clock.update(185, false, 1 / 60)).toBe(185 / 90);
		clock.update(500, false, 1 / 60);
		expect(clock.update(185, false, 1 / 60)).toBe(185 / 90);
	});
});
