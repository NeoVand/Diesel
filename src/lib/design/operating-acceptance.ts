import type { StructuralResult } from './structural';

export interface OperatingComparisonEvidence {
	massKg: number;
	/** Number of unique critical cases required by this design's operating envelope. */
	expectedCaseCount: number;
	cases: StructuralResult[];
}
export interface OperatingComparisonAssessment {
	/** None of these states certifies strength, service life or manufacturing. */
	status: 'incomplete' | 'needs-refinement' | 'comparison-only';
	caption: string;
	massReductionPercent: number | null;
	/** Changes compare maxima over each design's selected critical-case set, not matched point loads. */
	maxDisplacementIncreasePercent: number | null;
	maxInteriorP95IncreasePercent: number | null;
	/** Maximum displacement/energy change reported by any native refinement. */
	maxRefinementChangePercent: number | null;
	maxInteriorP95RefinementChangePercent: number | null;
	completedCases: number;
	expectedCases: number;
	reasons: string[];
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const ratioChange = (reference: number, candidate: number) =>
	finite(reference) && finite(candidate) && reference > 0
		? (candidate / reference - 1) * 100
		: null;
const maximum = (values: number[]) => (values.length ? Math.max(...values) : null);
/** Same numerical residual check used by the native-results panel; not a strength allowable. */
export const OPERATING_NUMERICAL_RESIDUAL_LIMIT = 1e-5;

export function assessOperatingComparison({
	reference,
	candidate
}: {
	reference: OperatingComparisonEvidence;
	candidate: OperatingComparisonEvidence;
}): OperatingComparisonAssessment {
	const reasons: string[] = [],
		groups = [
			['Reference', reference],
			['Candidate', candidate]
		] as const;
	let incomplete = false,
		needsRefinement = false;
	const displacements: number[] = [],
		energies: number[] = [],
		stresses: number[] = [];
	for (const [label, group] of groups) {
		if (!finite(group.massKg) || group.massKg <= 0) {
			incomplete = true;
			reasons.push(`${label} mass is missing or invalid.`);
		}
		if (
			!Number.isInteger(group.expectedCaseCount) ||
			group.expectedCaseCount < 1 ||
			new Set(group.cases.map((c) => c.analysisHash)).size < group.expectedCaseCount
		) {
			incomplete = true;
			reasons.push(`${label} has not completed every required unique critical load case.`);
		}
		for (const [index, result] of group.cases.entries()) {
			const stats = result.stats,
				c = result.convergence,
				name = `${label} case ${index + 1}`;
			if (
				![
					stats.maxDisplacementMm,
					stats.interiorP95VonMisesMpa,
					stats.forceBalanceRelative,
					stats.momentBalanceRelative,
					stats.solveResidualRelative
				].every(finite) ||
				stats.maxDisplacementMm < 0 ||
				stats.interiorP95VonMisesMpa < 0 ||
				Math.max(
					stats.forceBalanceRelative,
					stats.momentBalanceRelative,
					stats.solveResidualRelative
				) > OPERATING_NUMERICAL_RESIDUAL_LIMIT
			) {
				incomplete = true;
				reasons.push(`${name} has invalid response data or unresolved numerical residuals.`);
			}
			if (!c.performed || c.meshes.length < 2) {
				needsRefinement = true;
				reasons.push(`${name} needs more than one mesh.`);
			} else if (
				c.withinScreeningTolerance !== true ||
				!finite(c.displacementRelativeChange) ||
				!finite(c.strainEnergyRelativeChange)
			) {
				needsRefinement = true;
				reasons.push(`${name} has not met the native integral-response refinement gate.`);
			}
			if (finite(c.displacementRelativeChange))
				displacements.push(c.displacementRelativeChange * 100);
			if (finite(c.strainEnergyRelativeChange)) energies.push(c.strainEnergyRelativeChange * 100);
			if (finite(c.interiorP95RelativeChange)) stresses.push(c.interiorP95RelativeChange * 100);
		}
	}
	const referenceDisplacement = maximum(
		reference.cases.map((c) => c.stats.maxDisplacementMm).filter(finite)
	);
	const candidateDisplacement = maximum(
		candidate.cases.map((c) => c.stats.maxDisplacementMm).filter(finite)
	);
	const referenceStress = maximum(
		reference.cases.map((c) => c.stats.interiorP95VonMisesMpa).filter(finite)
	);
	const candidateStress = maximum(
		candidate.cases.map((c) => c.stats.interiorP95VonMisesMpa).filter(finite)
	);
	const status = incomplete
		? 'incomplete'
		: needsRefinement
			? 'needs-refinement'
			: 'comparison-only';
	const massChange = ratioChange(reference.massKg, candidate.massKg);
	return {
		status,
		caption:
			status === 'incomplete'
				? 'Comparison incomplete. Every required critical case and numerical check must finish before drawing a design conclusion.'
				: status === 'needs-refinement'
					? 'Candidate remains under review. At least one native case needs further mesh refinement; the nominal mass saving is not an accepted design improvement.'
					: 'Comparative evidence only. The selected cases meet the stated integral-response mesh check; local strength, contact, fatigue and manufacturing remain unqualified.',
		massReductionPercent: massChange === null ? null : -massChange,
		maxDisplacementIncreasePercent:
			referenceDisplacement === null || candidateDisplacement === null
				? null
				: ratioChange(referenceDisplacement, candidateDisplacement),
		maxInteriorP95IncreasePercent:
			referenceStress === null || candidateStress === null
				? null
				: ratioChange(referenceStress, candidateStress),
		maxRefinementChangePercent: maximum([...displacements, ...energies]),
		maxInteriorP95RefinementChangePercent: maximum(stresses),
		completedCases: groups.reduce(
			(n, [, g]) => n + new Set(g.cases.map((c) => c.analysisHash)).size,
			0
		),
		expectedCases: reference.expectedCaseCount + candidate.expectedCaseCount,
		reasons
	};
}
