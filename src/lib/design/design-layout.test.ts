import { describe, expect, it } from 'vitest';
import { BASELINE_DESIGN } from './design-core';
import { deriveDesignLayout } from './design-layout';
import { rodProfile } from '$lib/scene/design-geometry';

describe('generated cranktrain packaging', () => {
	it('keeps cross-bank carriers, liners and adjacent station envelopes separated across bounds', () => {
		for (const boreMm of [70, 85, 105])
			for (const strokeMm of [75, 100, 125])
				for (const rodLengthMm of [110, 125, 160])
					for (const rodDepthMm of [12, 22]) {
						const p = { ...BASELINE_DESIGN, boreMm, strokeMm, rodLengthMm, rodDepthMm };
						const layout = deriveDesignLayout(p);
						expect(layout.minimumLinerBankGapMm).toBeGreaterThanOrEqual(2.999999);
						expect(layout.minimumAdjacentLinerGapMm).toBeGreaterThan(6);
						const minimumPinDistance = rodLengthMm - strokeMm / 2;
						// Support bounds of the actual crown, circular pin bosses, and connecting side walls.
						const crownInnerBankZ =
							(minimumPinDistance + layout.compressionHeightMm) / 2 -
							(((boreMm - 1) / 2) * Math.sqrt(3)) / 2 -
							7 / 2;
						const bossInnerBankZ = minimumPinDistance / 2 - 14;
						const wallInnerBankZ = (minimumPinDistance + 10) / 2 - (7 * Math.sqrt(3)) / 2;
						expect(Math.min(crownInnerBankZ, bossInnerBankZ, wallInnerBankZ)).toBeGreaterThan(1.5);
						// Rods occupy separate axial slabs; fixed pin bosses and walls start at x=14 mm.
						expect(14 - rodDepthMm / 2).toBeGreaterThanOrEqual(3);
						const rodPairOuterX = rodDepthMm + 0.6;
						const webInnerX = rodDepthMm + 2;
						expect(webInnerX - rodPairOuterX).toBeCloseTo(1.4, 10);
						expect(
							layout.borePitchMm / 2 - layout.mainJournalLengthMm / 2 - rodPairOuterX
						).toBeCloseTo(1.4, 10);
					}
	});

	it('screens actual rod profile boundaries against the liner bore throughout a revolution', () => {
		for (const boreMm of [70, 105])
			for (const strokeMm of [75, 125])
				for (const rodLengthMm of [110, 160])
					for (const rodDepthMm of [12, 22]) {
						const p = {
							...BASELINE_DESIGN,
							boreMm,
							strokeMm,
							rodLengthMm,
							rodDepthMm,
							rodWidthMm: 28
						};
						const layout = deriveDesignLayout(p);
						const points = rodProfile(p.rodWidthMm, rodLengthMm).getPoints(40);
						let minimumRadialGap = Infinity;
						for (let degrees = 0; degrees < 360; degrees += 2) {
							const a = (degrees * Math.PI) / 180,
								r = strokeMm / 2;
							const t = r * Math.cos(a),
								q = r * Math.sin(a);
							const projected = Math.sqrt(rodLengthMm ** 2 - q ** 2);
							for (const point of points) {
								const axial = t + (point.x * q) / rodLengthMm + (point.y * projected) / rodLengthMm;
								if (axial < layout.linerBottomDistanceMm) continue;
								const transverse =
									q + (point.x * projected) / rodLengthMm - (point.y * q) / rodLengthMm;
								minimumRadialGap = Math.min(
									minimumRadialGap,
									boreMm / 2 - Math.hypot(transverse, rodDepthMm / 2)
								);
							}
						}
						expect(minimumRadialGap).toBeGreaterThan(0.5);
					}
	});
});
