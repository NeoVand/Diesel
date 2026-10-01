import { v12ProcessCycle } from './v12-process-cycle';
import type { V12CylinderDatum } from './v12-kinematics';

/** Explicit teaching assumptions; the purchased CAD does not resolve nozzle micro-orifices. */
export const V12_SPRAY_ASSUMPTIONS = Object.freeze({
	nozzleHoles: 8,
	includedAngleDeg: 140,
	jetSpreadDeg: 3.5,
	pressureDifferencePa: 100e6,
	fuelDensityKgM3: 830,
	dischargeCoefficient: 0.75,
	dragRelaxationSeconds: 0.00007,
	initialDropletDiameterMm: 0.025,
	evaporationD2Mm2PerSecond: 0.6,
	nominalRpm: 1800,
	injectionStartDeg: -14,
	injectionEndDeg: 20,
	scope:
		'Reduced ballistic drag and D-squared evaporation illustration. Assumed 8-hole spray at recovered source tip. No breakup, wall film, chemistry, pressure or efficiency prediction.'
});
export const V12_SPRAY_EXIT_SPEED_MM_S =
	V12_SPRAY_ASSUMPTIONS.dischargeCoefficient *
	Math.sqrt(
		(2 * V12_SPRAY_ASSUMPTIONS.pressureDifferencePa) / V12_SPRAY_ASSUMPTIONS.fuelDensityKgM3
	) *
	1000;
export const V12_SPRAY_LIFETIME_SECONDS =
	V12_SPRAY_ASSUMPTIONS.initialDropletDiameterMm ** 2 /
	V12_SPRAY_ASSUMPTIONS.evaporationD2Mm2PerSecond;

export function sprayRandom(seed: number): number {
	let x = (seed + 1) | 0;
	x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
	x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
	return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

export function v12SprayParcel(
	cylinder: V12CylinderDatum,
	phase: number,
	index: number,
	perJet = 80
) {
	return v12SprayParcelAtCycle(v12ProcessCycle(cylinder, phase).cycleDeg, index, perJet);
}

export function v12SprayParcelAtCycle(cycle: number, index: number, perJet = 80) {
	const a = V12_SPRAY_ASSUMPTIONS;
	const angle = cycle > 540 ? cycle - 720 : cycle;
	const birth =
		a.injectionStartDeg +
		(((index % perJet) + 0.5) / perJet) * (a.injectionEndDeg - a.injectionStartDeg);
	const age = (angle - birth) / (6 * a.nominalRpm);
	if (age <= 0 || age >= V12_SPRAY_LIFETIME_SECONDS) return null;
	const azimuth =
		(Math.floor(index / perJet) / a.nozzleHoles) * 2 * Math.PI +
		(sprayRandom(index * 3) - 0.5) * 0.12;
	const polar =
		((a.includedAngleDeg / 2 + (sprayRandom(index * 3 + 1) - 0.5) * 2 * a.jetSpreadDeg) * Math.PI) /
		180;
	const distance =
		V12_SPRAY_EXIT_SPEED_MM_S *
		a.dragRelaxationSeconds *
		-Math.expm1(-age / a.dragRelaxationSeconds);
	const liquidFraction = Math.max(0, 1 - age / V12_SPRAY_LIFETIME_SECONDS);
	return {
		ageSeconds: age,
		distanceMm: distance,
		direction: [
			Math.sin(polar) * Math.cos(azimuth),
			-Math.cos(polar),
			Math.sin(polar) * Math.sin(azimuth)
		] as const,
		diameterMm: a.initialDropletDiameterMm * Math.sqrt(liquidFraction),
		liquidMassFraction: liquidFraction ** 1.5,
		weight: Math.sin(Math.PI * (((index % perJet) + 0.5) / perJet)) ** 2
	};
}
