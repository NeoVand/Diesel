import { ROD_INTERFACES, type DesignParams } from './design-core';

/** Packaging of the generated piston-carrier study, not the purchased engine casting. */
export function deriveDesignLayout(params: DesignParams) {
	const r = params.strokeMm / 2;
	const l = params.rodLengthMm;
	const pitch = Math.max(params.boreMm + 15, 92);
	const linerOuterRadiusMm = params.boreMm * 0.5425;
	// Reserve radial running clearance and account for the rod's axial thickness.
	const freeRadius = Math.sqrt((params.boreMm / 2 - 1) ** 2 - (params.rodDepthMm / 2) ** 2);
	let highestRodOutsideBore = -Infinity;
	for (let i = 0; i < 720; i++) {
		const angle = (i * Math.PI) / 360;
		const t = r * Math.cos(angle),
			q = Math.abs(r * Math.sin(angle));
		const projectedLength = Math.sqrt(l * l - q * q);
		// A 15 mm capsule bounds the shank and small eye; a separate 32 mm disc bounds the big eye.
		const small = ROD_INTERFACES.smallEndOuterRadiusMm;
		if (q > freeRadius - small)
			highestRodOutsideBore = Math.max(
				highestRodOutsideBore,
				t + projectedLength - ((freeRadius - small) * projectedLength) / q + small
			);
		const big = ROD_INTERFACES.bigEndOuterRadiusMm;
		if (q + big > freeRadius)
			highestRodOutsideBore = Math.max(
				highestRodOutsideBore,
				t + Math.sqrt(big * big - Math.max(0, freeRadius - q) ** 2)
			);
	}
	const crossBankHeight = Math.sqrt(3) * linerOuterRadiusMm + 16 - (l - r);
	const rodEnvelopeHeight = Number.isFinite(highestRodOutsideBore)
		? highestRodOutsideBore + 3 - (l - r) + 13
		: 0;
	const compressionHeightMm = Math.max(32, crossBankHeight, rodEnvelopeHeight);
	const linerBottomDistanceMm = l - r + compressionHeightMm - 13;
	return {
		borePitchMm: pitch,
		compressionHeightMm,
		linerOuterRadiusMm,
		linerCenterDistanceMm: l + compressionHeightMm,
		linerLengthMm: params.strokeMm + 26,
		linerBottomDistanceMm,
		deckHeightMm: l + r + compressionHeightMm + 13,
		mainJournalLengthMm: pitch - 2 * (params.rodDepthMm + 2),
		minimumRodWebAxialGapMm: 1.4,
		minimumLinerBankGapMm: linerBottomDistanceMm - Math.sqrt(3) * linerOuterRadiusMm,
		minimumAdjacentLinerGapMm: pitch - 2 * linerOuterRadiusMm,
		highestRodOutsideBoreMm: highestRodOutsideBore
	};
}
