import { describe, expect, it } from 'vitest';
import { V12PlaybackClock } from './v12-playback-clock';

describe('continuous engine playback clock', () => {
	it('crosses the four-stroke boundary without rewinding the drive', () => {
		const clock = new V12PlaybackClock();
		clock.seek(719.5);
		clock.advance(0.1, 36);
		expect(clock.driveAngle).toBeCloseTo(723.1, 10);
		expect(clock.phase).toBeCloseTo(3.1, 10);
	});
	it('restores the exact drive revolution and preserves the 720 degree scrub endpoint', () => {
		const clock = new V12PlaybackClock();
		clock.seek(720, 2160);
		expect(clock.phase).toBe(720);
		expect(clock.driveAngle).toBe(2160);
		clock.advance(1, 36);
		expect(clock.phase).toBe(36);
		expect(clock.driveAngle).toBe(2196);
		clock.seek(180);
		expect(clock.driveAngle).toBe(180);
	});
	it('is independent of render subdivision and rejects contradictory checkpoints', () => {
		const a = new V12PlaybackClock();
		const b = new V12PlaybackClock();
		a.advance(40, 36);
		for (let frame = 0; frame < 2400; frame++) b.advance(1 / 60, 36);
		expect(b.driveAngle).toBeCloseTo(a.driveAngle, 8);
		expect(() => b.seek(20, 720)).toThrow('match');
		expect(() => b.advance(-1, 36)).toThrow();
		expect(() => b.seek(0, Infinity)).toThrow();
	});
});
