/** Track the whole gesture, so a drag that returns to its starting point is never a click. */
export class CanvasSelectionGesture {
	private pointers = new Set<number>();
	private candidate: number | null = null;
	private x = 0;
	private y = 0;
	private moved = false;
	get active() {
		return this.pointers.size > 0;
	}
	start(event: Pick<PointerEvent, 'pointerId' | 'clientX' | 'clientY' | 'button' | 'isPrimary'>) {
		this.pointers.add(event.pointerId);
		if (this.pointers.size === 1 && event.button === 0 && event.isPrimary) {
			this.candidate = event.pointerId;
			this.x = event.clientX;
			this.y = event.clientY;
			this.moved = false;
		} else this.candidate = null;
	}
	move(event: Pick<PointerEvent, 'pointerId' | 'clientX' | 'clientY'>) {
		if (
			event.pointerId === this.candidate &&
			(event.clientX - this.x) ** 2 + (event.clientY - this.y) ** 2 > 25
		)
			this.moved = true;
	}
	end(event: Pick<PointerEvent, 'pointerId' | 'clientX' | 'clientY' | 'button'>) {
		this.move(event);
		const clicked =
			this.pointers.size === 1 &&
			event.pointerId === this.candidate &&
			!this.moved &&
			event.button === 0;
		this.pointers.delete(event.pointerId);
		this.candidate = null;
		return clicked;
	}
	cancel(pointerId: number) {
		this.pointers.delete(pointerId);
		this.candidate = null;
	}
}

/** Analytic speed ramp: no frame-rate dependence or residual control damping on pause. */
export class AutoOrbitMotion {
	enabled = false;
	private speed = 0;
	readonly rate = (3 * Math.PI) / 180;
	private response = 0.35;
	get active() {
		return this.enabled || this.speed !== 0;
	}
	setEnabled(enabled: boolean) {
		if (this.enabled === enabled) return false;
		this.enabled = enabled;
		return true;
	}
	advance(seconds: number, paused: boolean) {
		if (paused) {
			this.speed = 0;
			return 0;
		}
		const dt = Math.max(0, seconds),
			target = this.enabled ? this.rate : 0,
			decay = Math.exp(-dt / this.response);
		const angle = target * dt + (this.speed - target) * this.response * (1 - decay);
		this.speed = target + (this.speed - target) * decay;
		if (!this.enabled && Math.abs(this.speed) < 1e-5) this.speed = 0;
		return angle;
	}
}
