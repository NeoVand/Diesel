import type { OperatingCycle, OperatingSample } from '$lib/design/operating-cycle';
import * as THREE from 'three';

export function normalizeOperatingPhase(degrees: number): number {
	if (!Number.isFinite(degrees)) throw new RangeError('A finite operating phase is required.');
	return ((degrees % 720) + 720) % 720;
}

export type OperatingVisualSample = Pick<
	OperatingSample,
	'angleDeg' | 'pressureBar' | 'gasForceN' | 'smallEndForceLocalN' | 'bigEndForceLocalN'
>;

/** Interpolate supplied solved samples, including the full exhaust/intake revolution. */
export function operatingVisualSample(cycle: OperatingCycle, phase: number): OperatingVisualSample {
	const angle = normalizeOperatingPhase(phase);
	let lower = 0,
		upper = cycle.samples.length - 1;
	if (upper < 1) throw new RangeError('An operating display needs at least two solved samples.');
	while (upper - lower > 1) {
		const mid = Math.floor((lower + upper) / 2);
		if (cycle.samples[mid].angleDeg <= angle) lower = mid;
		else upper = mid;
	}
	const a = cycle.samples[lower],
		b = cycle.samples[upper];
	const t = Math.max(0, Math.min(1, (angle - a.angleDeg) / (b.angleDeg - a.angleDeg)));
	const interpolate = (av: number, bv: number) => av + (bv - av) * t;
	const vector = (
		av: [number, number, number],
		bv: [number, number, number]
	): [number, number, number] =>
		av.map((value, i) => interpolate(value, bv[i])) as [number, number, number];
	return {
		angleDeg: angle,
		pressureBar: interpolate(a.pressureBar, b.pressureBar),
		gasForceN: interpolate(a.gasForceN, b.gasForceN),
		smallEndForceLocalN: vector(a.smallEndForceLocalN, b.smallEndForceLocalN),
		bigEndForceLocalN: vector(a.bigEndForceLocalN, b.bigEndForceLocalN)
	};
}

/** Embed the solver's planar X-right / bore-up Y in Bank A / station 1. */
export function referencePlaneVectorToWorld(vector: readonly [number, number]): THREE.Vector3 {
	const [x, y] = vector;
	return new THREE.Vector3(0, x / 2 + (y * Math.sqrt(3)) / 2, (x * Math.sqrt(3)) / 2 - y / 2);
}
