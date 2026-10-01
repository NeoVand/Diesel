import { existsSync, readFileSync } from 'node:fs';
import datums from '../engine/v12-chamber-datums.json';

export const LICENSED_CHAMBER_PATH = 'static/models/v12-chamber-domains.bin';
export const licensedChamberAvailable = existsSync(LICENSED_CHAMBER_PATH);

/**
 * Analytic test geometry: flat piston crowns and flat heads, with the runtime's
 * moving pin positions, cylindrical bores and valve exclusions. This deliberately
 * contains no sampled purchased geometry and cannot certify source-mesh fit.
 */
export function syntheticChamberBounds(): Float32Array {
	const bounds = new Float32Array(datums.floats);
	for (const cylinder of datums.cylinders) {
		for (let cell = 0; cell < datums.resolution ** 2; cell++) {
			const at = cylinder.offsetFloats + cell * 2;
			bounds[at] = 38.5;
			bounds[at + 1] = cylinder.nozzleAxialMm;
		}
	}
	return bounds;
}

/** Call only in explicitly optional licensed-asset tests. Missing data must fail. */
export function readLicensedChamberBounds(): Float32Array {
	const bytes = readFileSync(LICENSED_CHAMBER_PATH);
	return new Float32Array(
		bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
	);
}
