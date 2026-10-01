import * as THREE from 'three';

/** Bounded ease with zero velocity and acceleration at either end. */
export function transitionEase(progress: number): number {
	const t = Math.max(0, Math.min(1, progress));
	return t * t * t * (t * (t * 6 - 15) + 10);
}

/** A time-based transition that can be redirected from the currently rendered value. */
export class SceneTransition {
	value: number;
	private from: number;
	private to: number;
	private elapsed = 0;
	private duration = 0;

	constructor(value = 0) {
		this.value = this.from = this.to = value;
	}

	get active(): boolean {
		return this.elapsed < this.duration;
	}

	get target(): number {
		return this.to;
	}

	retarget(target: number, duration = 1.2): void {
		if (target === this.to && duration !== 0) return;
		this.from = this.value;
		this.to = target;
		this.elapsed = 0;
		this.duration = duration;
		if (duration === 0) this.value = target;
	}

	advance(seconds: number): number {
		this.elapsed = Math.min(this.duration, this.elapsed + Math.max(0, seconds));
		this.value = this.active
			? this.from + (this.to - this.from) * transitionEase(this.elapsed / this.duration)
			: this.to;
		return this.value;
	}
}

/** Critically damped target tracking: retargeting preserves velocity during direct manipulation. */
export class TrackingTransition {
	value: number;
	private velocity = 0;
	private to: number;
	private response = 0.18;
	constructor(value = 0) {
		this.value = this.to = value;
	}
	get target() {
		return this.to;
	}
	get active() {
		return Math.abs(this.value - this.to) > 0.00001 || Math.abs(this.velocity) > 0.0001;
	}
	retarget(target: number, response = 0.18) {
		this.to = target;
		this.response = response;
		if (!response) {
			this.value = target;
			this.velocity = 0;
		}
	}
	advance(seconds: number) {
		if (!this.active) return (this.value = this.to);
		const omega = 4 / this.response,
			time = Math.max(0, seconds),
			offset = this.value - this.to;
		const term = this.velocity + omega * offset,
			decay = Math.exp(-omega * time);
		this.value = this.to + (offset + term * time) * decay;
		this.velocity = (this.velocity - omega * term * time) * decay;
		// The fraction stays physical even after a fast reversal at an endpoint.
		if (this.value < 0 || this.value > 1) {
			this.value = Math.max(0, Math.min(1, this.value));
			this.velocity = 0;
		}
		if (!this.active) {
			this.value = this.to;
			this.velocity = 0;
		}
		return this.value;
	}
}

/** Rotate along a well-defined arc even when the two views are opposite. */
export function transitionDirection(
	from: THREE.Vector3,
	to: THREE.Vector3,
	progress: number
): THREE.Vector3 {
	const start = from.clone().normalize();
	const end = to.clone().normalize();
	const rotation = new THREE.Quaternion().setFromUnitVectors(start, end);
	rotation.slerp(new THREE.Quaternion(), 1 - Math.max(0, Math.min(1, progress)));
	return start.applyQuaternion(rotation).normalize();
}
