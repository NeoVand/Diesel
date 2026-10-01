import { describe, it, expect } from 'vitest';
import { AutoOrbitMotion, CanvasSelectionGesture } from './v12-interaction';
const pointer = (pointerId = 1, x = 10, y = 10, button = 0, isPrimary = true) => ({
	pointerId,
	clientX: x,
	clientY: y,
	button,
	isPrimary
});
describe('canvas selection intent', () => {
	it('selects only a primary pointer click, not right-button or unmatched pointer-up', () => {
		const gesture = new CanvasSelectionGesture();
		expect(gesture.end(pointer())).toBe(false);
		gesture.start(pointer());
		expect(gesture.end(pointer(1, 12, 11))).toBe(true);
		gesture.start(pointer(1, 10, 10, 2));
		expect(gesture.end(pointer(1, 10, 10, 2))).toBe(false);
	});
	it('retains movement history when a drag returns to its starting point', () => {
		const gesture = new CanvasSelectionGesture();
		gesture.start(pointer());
		gesture.move(pointer(1, 80, 10));
		gesture.move(pointer());
		expect(gesture.end(pointer())).toBe(false);
	});
	it('never interprets multitouch or cancellation as a blank-canvas deselect', () => {
		const gesture = new CanvasSelectionGesture();
		gesture.start(pointer());
		gesture.start(pointer(2, 20, 20, 0, false));
		expect(gesture.end(pointer(2))).toBe(false);
		expect(gesture.active).toBe(true);
		expect(gesture.end(pointer())).toBe(false);
		expect(gesture.active).toBe(false);
		gesture.start(pointer());
		gesture.cancel(1);
		expect(gesture.end(pointer())).toBe(false);
	});
});
describe('deliberate slow auto orbit', () => {
	it('has identical travel at 30,60 and144Hz with smooth bounded speed', () => {
		const results = [30, 60, 144].map((fps) => {
			const motion = new AutoOrbitMotion();
			motion.setEnabled(true);
			let angle = 0;
			for (let i = 0; i < fps * 2; i++) {
				const step = motion.advance(1 / fps, false);
				expect(step).toBeGreaterThan(0);
				expect(step).toBeLessThanOrEqual(motion.rate / fps);
				angle += step;
			}
			return angle;
		});
		expect(Math.max(...results) - Math.min(...results)).toBeLessThan(1e-12);
		expect((results[0] * 180) / Math.PI).toBeLessThan(6);
		expect((results[0] * 180) / Math.PI).toBeGreaterThan(4);
	});
	it('holds exactly during drag/camera tween, then resumes from zero speed', () => {
		const motion = new AutoOrbitMotion();
		motion.setEnabled(true);
		motion.advance(1, false);
		expect(motion.advance(0.4, true)).toBe(0);
		expect(motion.advance(0.4, true)).toBe(0);
		expect(motion.advance(1 / 60, false)).toBeLessThan(motion.rate / 60 / 10);
	});
	it('fully idles after disabling and never animates by default', () => {
		const motion = new AutoOrbitMotion();
		expect(motion.active).toBe(false);
		expect(motion.advance(1, false)).toBe(0);
		motion.setEnabled(true);
		motion.advance(1, false);
		motion.setEnabled(false);
		for (let i = 0; i < 240; i++) motion.advance(1 / 60, false);
		expect(motion.active).toBe(false);
		expect(motion.advance(1, false)).toBe(0);
	});
});
