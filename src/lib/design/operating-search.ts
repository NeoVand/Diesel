import type { DesignParams } from './design-core';
import type { GpuComputationReport, GpuComputePreference } from './gpu-types';
import {
	evaluateOperatingEnvelope,
	type OperatingScenario,
	type OperatingDesignScreen
} from './operating-cycle';

/** A bounded discrete study. The original static beam constraints are deliberately not reused. */
export const OPERATING_SEARCH_GRID = Object.freeze({
	rodWidthMm: [14, 18, 20, 24, 28],
	rodDepthMm: [12, 14, 16, 18, 22],
	webMm: [2, 3, 4, 5, 6],
	flangeMm: [2, 3, 4, 5]
});
export interface OperatingDesignSummary {
	id: string;
	params: DesignParams;
	massKg: number;
	peakNominalStressMpa: number;
	utilization: number;
	passesNominalScreen: boolean;
	criticalScenarioIndex: number;
	criticalAngleDeg: number;
	criticalSectionMm: number;
	maxCompressionN: number;
	maxTensionN: number;
	/** Samples per720° in EACH explicit condition. */
	angularSamples: number;
}
export interface OperatingSearchProgress {
	stage: 'coarse' | 'refine';
	completed: number;
	total: number;
	coarsePassCount: number;
}
export interface OperatingSearchResult {
	schemaVersion: 'operating-design-search-v1';
	baseline: OperatingDesignSummary;
	scenarios: OperatingScenario[];
	candidates: OperatingDesignSummary[];
	finalists: OperatingDesignSummary[];
	best: OperatingDesignSummary | null;
	evaluated: number;
	coarsePassCount: number;
	refinedCount: number;
	cancelled: boolean;
	massReductionPercent: number | null;
	method: string;
	limitations: string[];
	/** Present on browser worker searches; absent on legacy saved studies. */
	computation?: GpuComputationReport;
}
export type OperatingSearchRequest = {
	type: 'search';
	revision: string;
	params: DesignParams;
	scenarios: OperatingScenario[];
	compute?: GpuComputePreference;
};
export type OperatingSearchResponse =
	| { type: 'progress'; revision: string; progress: OperatingSearchProgress }
	| { type: 'result'; revision: string; result: OperatingSearchResult }
	| { type: 'error'; revision: string; message: string };

export function operatingDesignId(p: DesignParams): string {
	return [p.rodWidthMm, p.rodDepthMm, p.webMm, p.flangeMm].join('/');
}
export function summarizeOperatingScreen(
	screen: OperatingDesignScreen,
	angularSamples: number
): OperatingDesignSummary {
	return {
		id: operatingDesignId(screen.params),
		params: { ...screen.params },
		massKg: screen.massKg,
		peakNominalStressMpa: screen.peakNominalStressMpa,
		utilization: screen.utilization,
		passesNominalScreen: screen.passesNominalScreen,
		criticalScenarioIndex: screen.criticalScenarioIndex,
		criticalAngleDeg: screen.criticalAngleDeg,
		criticalSectionMm: screen.criticalSectionMm,
		maxCompressionN: screen.maxCompressionN,
		maxTensionN: screen.maxTensionN,
		angularSamples
	};
}

export function createOperatingSearchGrid(params: DesignParams): DesignParams[] {
	const designs: DesignParams[] = [];
	for (const rodWidthMm of OPERATING_SEARCH_GRID.rodWidthMm)
		for (const rodDepthMm of OPERATING_SEARCH_GRID.rodDepthMm)
			for (const webMm of OPERATING_SEARCH_GRID.webMm)
				for (const flangeMm of OPERATING_SEARCH_GRID.flangeMm)
					designs.push({ ...params, rodWidthMm, rodDepthMm, webMm, flangeMm });
	if (!designs.some((p) => operatingDesignId(p) === operatingDesignId(params)))
		designs.push({ ...params });
	return designs;
}

/**500 combinations (+ current geometry if outside grid). Full720° cycles at6° then1°.
 * Refine in increasing mass until three designs pass. A6° grid is a subset of1°,
 * so a coarse rejection cannot become a pass when adding the finer sample angles.
 */
export function searchOperatingDesigns(
	params: DesignParams,
	scenarios: OperatingScenario[],
	onProgress?: (progress: OperatingSearchProgress) => void,
	shouldCancel?: () => boolean
): OperatingSearchResult {
	const baseline = summarizeOperatingScreen(evaluateOperatingEnvelope(params, scenarios, 721), 721);
	const designs = createOperatingSearchGrid(params);
	const candidates: OperatingDesignSummary[] = [],
		finalists: OperatingDesignSummary[] = [];
	let coarsePassCount = 0,
		refinedCount = 0,
		cancelled = false;
	for (const design of designs) {
		if (shouldCancel?.()) {
			cancelled = true;
			break;
		}
		const summary = summarizeOperatingScreen(
			evaluateOperatingEnvelope(design, scenarios, 121),
			121
		);
		candidates.push(summary);
		if (summary.passesNominalScreen) coarsePassCount++;
		onProgress?.({
			stage: 'coarse',
			completed: candidates.length,
			total: designs.length,
			coarsePassCount
		});
	}
	const ranked = candidates
		.filter((c) => c.passesNominalScreen)
		.sort((a, b) => a.massKg - b.massKg || a.id.localeCompare(b.id));
	if (!cancelled) {
		for (const candidate of ranked) {
			if (shouldCancel?.()) {
				cancelled = true;
				break;
			}
			const refined =
				candidate.id === baseline.id
					? baseline
					: summarizeOperatingScreen(
							evaluateOperatingEnvelope(candidate.params, scenarios, 721),
							721
						);
			refinedCount++;
			if (refined.passesNominalScreen) finalists.push(refined);
			onProgress?.({
				stage: 'refine',
				completed: refinedCount,
				total: ranked.length,
				coarsePassCount
			});
			if (finalists.length === 3) break;
		}
	}
	const best = cancelled ? null : (finalists[0] ?? null);
	return {
		schemaVersion: 'operating-design-search-v1',
		baseline,
		scenarios: scenarios.map((s) => ({ ...s })),
		candidates,
		finalists,
		best,
		evaluated: candidates.length,
		coarsePassCount,
		refinedCount,
		cancelled,
		massReductionPercent: best ? (1 - best.massKg / baseline.massKg) * 100 : null,
		method:
			'Bounded500-combination grid; explicit conditions at121 phases; ascending-mass finalists recomputed at721 phases. Nominal shank stress ≤250MPa; exact authored-solid mass.',
		limitations: [
			'Best sampled-grid nominal design, not a continuous or global optimum;17 longitudinal shank sections and1° finalist phases are still discrete.',
			'Pressure shape and piston mass are assumed. Operating load changes with rod mass and inertia for every geometry.',
			'Nominal axial/in-plane bending only; no fatigue, local stress concentrations, contact, deflection, buckling or manufacturing qualification.',
			'Full-solid finite-element checks have separate fixture, linear-material and mesh limits and do not certify the rod.'
		]
	};
}
