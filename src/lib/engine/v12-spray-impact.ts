import datums from './v12-spray-impact-datums.json';

export const V12_SPRAY_IMPACT_PROVENANCE = datums.provenance;
const byPiston = new Map(datums.cylinders.map((c) => [c.pistonId, c.firstImpactAgeSeconds]));

/**
 * First moving-wall contact since this parcel's birth, in physical seconds.
 * Null means no contact before evaporation. The immutable offline lookup is independent
 * of render history, so a seek cannot revive a parcel that struck the receding piston.
 */
export function getV12SprayImpactAge(pistonId: string, parcelIndex: number): number | null {
	const ages = byPiston.get(pistonId);
	if (!ages) throw new RangeError(`Unknown spray cylinder: ${pistonId}`);
	if (!Number.isInteger(parcelIndex) || parcelIndex < 0 || parcelIndex >= ages.length)
		throw new RangeError(`Invalid spray parcel index: ${parcelIndex}`);
	return ages[parcelIndex];
}

/** Wall contact is absorbing for this injection event; it does not create a wall-film model. */
export function v12SpraySurvivesWall(pistonId: string, parcelIndex: number, ageSeconds: number) {
	if (!Number.isFinite(ageSeconds) || ageSeconds < 0)
		throw new RangeError('Spray parcel age must be finite and nonnegative.');
	const impact = getV12SprayImpactAge(pistonId, parcelIndex);
	return impact === null || ageSeconds < impact;
}
