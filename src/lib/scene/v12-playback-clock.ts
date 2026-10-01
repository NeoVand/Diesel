/** Continuous drive position is distinct from the public four-stroke cycle phase. */
export class V12PlaybackClock {
	private angle = 0;
	private displayed = 0;

	get driveAngle(): number {
		return this.angle;
	}
	get phase(): number {
		return this.displayed;
	}

	seek(phase: number, driveAngle: number | null = null): void {
		if (!Number.isFinite(phase) || phase < 0 || phase > 720)
			throw new RangeError('Cycle phase must be between 0 and 720 degrees.');
		const angle = driveAngle ?? phase;
		if (!Number.isFinite(angle) || angle < 0 || angle > 1e12)
			throw new RangeError('Drive angle must be finite and nonnegative.');
		const error = Math.abs(((((angle - phase + 360) % 720) + 720) % 720) - 360);
		if (error > 1e-4) throw new RangeError('Drive angle must match the displayed cycle phase.');
		this.angle = angle;
		this.displayed = phase;
	}

	advance(elapsedSeconds: number, degreesPerSecond: number): void {
		if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0)
			throw new RangeError('Elapsed time must be finite and nonnegative.');
		if (!Number.isFinite(degreesPerSecond) || degreesPerSecond < 0)
			throw new RangeError('Playback rate must be finite and nonnegative.');
		this.angle += elapsedSeconds * degreesPerSecond;
		this.displayed = this.angle % 720;
	}
}
