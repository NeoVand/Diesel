const WINDOW_FRAMES = 16;
const SLOW_FRAME_MS = 24;
const PIXEL_RATIO_STEP = 0.25;

/** Reduce pixel work only after sustained motion misses its budget; restore detail when idle. */
export class V12RenderQuality {
	readonly maximumPixelRatio: number;
	readonly minimumPixelRatio: number;
	private ratio: number;
	private active = false;
	private warmupFrames = 0;
	private readonly frameTimes: number[] = [];

	constructor(devicePixelRatio: number) {
		this.maximumPixelRatio =
			Number.isFinite(devicePixelRatio) && devicePixelRatio > 0
				? Math.min(devicePixelRatio, 1.5)
				: 1;
		this.minimumPixelRatio = Math.min(this.maximumPixelRatio, 1);
		this.ratio = this.maximumPixelRatio;
	}

	get pixelRatio(): number {
		return this.ratio;
	}

	update(elapsedMs: number, active: boolean): number {
		if (!active) {
			this.active = false;
			this.warmupFrames = 0;
			this.frameTimes.length = 0;
			return (this.ratio = this.maximumPixelRatio);
		}
		if (!this.active) {
			this.active = true;
			this.warmupFrames = 2;
			this.frameTimes.length = 0;
		}
		if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return this.ratio;
		// The first interval can include idle time; the next can include shader warmup.
		if (this.warmupFrames > 0) {
			this.warmupFrames--;
			return this.ratio;
		}
		this.frameTimes.push(elapsedMs);
		if (this.frameTimes.length < WINDOW_FRAMES) return this.ratio;
		this.frameTimes.sort((a, b) => a - b);
		const p75 = this.frameTimes[Math.ceil(WINDOW_FRAMES * 0.75) - 1];
		if (p75 > SLOW_FRAME_MS)
			this.ratio = Math.max(this.minimumPixelRatio, this.ratio - PIXEL_RATIO_STEP);
		this.frameTimes.length = 0;
		// Never increase resolution inside a continuous gesture or playback period.
		return this.ratio;
	}
}
