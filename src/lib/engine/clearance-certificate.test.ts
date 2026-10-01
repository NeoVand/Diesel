import { describe, expect, it } from 'vitest';
import { clearanceThresholdCertificate } from './clearance-certificate';

describe('thresholded continuous clearance certification', () => {
	it('does not accept an early witness just above the requested margin', () => {
		// The old naive witness-minus-half-width rule would falsely accept this.
		expect(clearanceThresholdCertificate(0.80001, 0.7, 0.1, 0.800005)).toEqual({
			certified: false,
			lowerBoundMm: null
		});
	});
	it('bounds a distant returned pair by the searched radius, not its distance', () => {
		expect(clearanceThresholdCertificate(2, 1, 0.1, 120)).toEqual({
			certified: true,
			lowerBoundMm: 1
		});
	});
	it('accepts exhausted search and an exact-threshold witness with only the search bound', () => {
		for (const distance of [null, 0.80001]) {
			const certificate = clearanceThresholdCertificate(0.80001, 0.7, 0.1, distance);
			expect(certificate.certified).toBe(true);
			expect(certificate.lowerBoundMm).toBeCloseTo(0.10001, 12);
		}
	});
	it('rejects insufficient search radius and invalid query state', () => {
		expect(clearanceThresholdCertificate(0.7, 0.7, 0.1, null).certified).toBe(false);
		for (const distance of [-1, NaN, Infinity])
			expect(() => clearanceThresholdCertificate(1, 0.7, 0.1, distance)).toThrow();
	});
});
