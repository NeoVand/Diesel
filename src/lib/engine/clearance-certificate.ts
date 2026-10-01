/**
 * The query must use this same search radius as BOTH its early-out and pruning threshold.
 * A witness inside it stops search early and cannot certify the global minimum.
 * Exhaustion without such a witness proves only the searched radius, even if a returned
 * candidate pair is farther away. Translation changes distance by at most its length.
 */
export function clearanceThresholdCertificate(
	searchRadiusMm: number,
	intervalHalfWidthMm: number,
	requiredMarginMm: number,
	witnessDistanceMm: number | null
): { certified: boolean; lowerBoundMm: number | null } {
	if (
		![searchRadiusMm, intervalHalfWidthMm, requiredMarginMm].every(Number.isFinite) ||
		searchRadiusMm <= 0 ||
		intervalHalfWidthMm < 0 ||
		requiredMarginMm < 0 ||
		(witnessDistanceMm !== null && (!Number.isFinite(witnessDistanceMm) || witnessDistanceMm < 0))
	) {
		throw new RangeError('Clearance certificate inputs must be finite nonnegative lengths.');
	}
	if (witnessDistanceMm !== null && witnessDistanceMm < searchRadiusMm)
		return { certified: false, lowerBoundMm: null };
	const lowerBoundMm = searchRadiusMm - intervalHalfWidthMm;
	return lowerBoundMm > requiredMarginMm
		? { certified: true, lowerBoundMm }
		: { certified: false, lowerBoundMm: null };
}
