import { describe, expect, it } from 'vitest';
import evidence from '../../../docs/verification/operating-finalists.json';
import deeper from '../../../docs/verification/rod-solid-deep-refinement.json';
import {
	assessOperatingComparison,
	type OperatingComparisonEvidence
} from './operating-acceptance';
import type { StructuralResult } from './structural';

function fixture() {
	const group = (design: string, massKg: number): OperatingComparisonEvidence => ({
		massKg,
		expectedCaseCount: 2,
		cases: evidence.cases
			.filter((c) => c.design === design)
			.map(
				(c) =>
					({
						...c,
						schemaVersion: 'rod-solid-fea-v1',
						surface: {
							positionsMm: [],
							triangles: [],
							displacementMm: [],
							vonMisesMpa: [],
							fixtureNodes: [],
							loadedNodes: []
						}
					}) as unknown as StructuralResult
			)
	});
	return {
		reference: group('baseline', evidence.search.baseline.massKg),
		candidate: group('candidate', evidence.search.best.massKg)
	};
}

describe('honest operating-candidate comparison gate', () => {
	it('flags the actual lighter candidate tension refinement failure without inventing stress-percentile acceptance', () => {
		const result = assessOperatingComparison(fixture());
		expect(result.status).toBe('needs-refinement');
		expect(result.completedCases).toBe(4);
		expect(result.massReductionPercent).toBeCloseTo(20.42470029496, 9);
		expect(result.maxRefinementChangePercent).toBeGreaterThan(8);
		expect(result.maxDisplacementIncreasePercent).toBeGreaterThan(15);
		expect(result.maxInteriorP95IncreasePercent).toBeGreaterThan(9);
		expect(result.caption).toContain('not an accepted design improvement');
		expect(result.reasons).toHaveLength(1);
	});
	it('treats missing or duplicate cases as incomplete, including a third required stress case', () => {
		const missing = fixture();
		missing.candidate.cases.pop();
		expect(assessOperatingComparison(missing).status).toBe('incomplete');
		const duplicate = fixture();
		duplicate.candidate.cases[1] = duplicate.candidate.cases[0];
		expect(assessOperatingComparison(duplicate).status).toBe('incomplete');
		const third = fixture();
		third.reference.expectedCaseCount = 3;
		expect(assessOperatingComparison(third).status).toBe('incomplete');
	});
	it('uses actual deeper evidence to resolve the mesh gate without promoting the design to accepted', () => {
		const input = fixture();
		input.candidate.cases[1] = {
			...input.candidate.cases[1],
			analysisHash: deeper.analysisHash,
			stats: deeper.stats,
			convergence: deeper.convergence
		} as StructuralResult;
		const result = assessOperatingComparison(input);
		expect(result.status).toBe('comparison-only');
		expect(result.maxRefinementChangePercent).toBeLessThan(8);
		expect(result.caption).toContain('remain unqualified');
		expect(result.reasons).toEqual([]);
	});
	it('never marks even a complete refined comparison safe or approved', () => {
		const input = fixture();
		for (const group of [input.reference, input.candidate])
			for (const result of group.cases) {
				result.convergence = {
					...result.convergence,
					withinScreeningTolerance: true,
					displacementRelativeChange: 0.02,
					strainEnergyRelativeChange: 0.02
				};
				result.stats = { ...result.stats, interiorP95VonMisesMpa: 900 };
			}
		const result = assessOperatingComparison(input);
		expect(result.status).toBe('comparison-only');
		expect(result.caption).toContain('remain unqualified');
		expect(result.reasons).toEqual([]);
	});
	it('rejects missing refinement, failed numerical balance and invalid masses', () => {
		const unrefined = fixture();
		unrefined.reference.cases[0].convergence = {
			...unrefined.reference.cases[0].convergence,
			performed: false
		};
		expect(assessOperatingComparison(unrefined).status).toBe('needs-refinement');
		const invalid = fixture();
		invalid.candidate.cases[0].stats = {
			...invalid.candidate.cases[0].stats,
			forceBalanceRelative: 0.01
		};
		expect(assessOperatingComparison(invalid).status).toBe('incomplete');
		const mass = fixture();
		mass.reference.massKg = 0;
		const result = assessOperatingComparison(mass);
		expect(result.status).toBe('incomplete');
		expect(result.massReductionPercent).toBeNull();
	});
});
