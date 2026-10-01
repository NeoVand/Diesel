import { getWebGPUDevice, init } from '@jax-js/jax';
import type { DesignParams } from './design-core';
import { evaluateOperatingEnvelope, type OperatingScenario } from './operating-cycle';
import {
	createOperatingSearchGrid,
	searchOperatingDesigns,
	summarizeOperatingScreen,
	type OperatingDesignSummary,
	type OperatingSearchProgress,
	type OperatingSearchResult
} from './operating-search';
import {
	executeOperatingBatch,
	prepareOperatingBatch,
	GPU_OPERATING_PHASES,
	GPU_OPERATING_RELATIVE_TOLERANCE,
	GPU_OPERATING_SECTIONS
} from './gpu-operating-kernel';
import type { GpuComputationReport, GpuComputePreference } from './gpu-types';

const yieldToWorker = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
export const assertSearchActive = (shouldCancel: () => boolean) => {
	if (shouldCancel()) throw new DOMException('Operating design search cancelled.', 'AbortError');
};

function relativeError(actual: number, reference: number): number {
	return Math.abs(actual - reference) / Math.max(1, Math.abs(reference));
}

/** Validation rejects bad GPU arithmetic before any candidate can be selected. */
export function operatingSummaryError(
	actual: OperatingDesignSummary,
	reference: OperatingDesignSummary
): number {
	return Math.max(
		...(['peakNominalStressMpa', 'maxCompressionN', 'maxTensionN'] as const).map((key) =>
			relativeError(actual[key], reference[key])
		)
	);
}

/** Conservative guard: values near the stress threshold must be recomputed in Float64. */
export function needsFloat64ThresholdCheck(utilization: number): boolean {
	return Math.abs(utilization - 1) <= 2 * GPU_OPERATING_RELATIVE_TOLERANCE;
}

function errorMessage(error: unknown) {
	const message =
		error instanceof Error ? error.message : 'The browser could not complete WebGPU compute.';
	return message.slice(0, 1500);
}

/** No engineering request leaves the browser; CPU fallback executes in this same worker. */
export async function searchOperatingDesignsBrowser(
	params: DesignParams,
	scenarios: OperatingScenario[],
	onProgress?: (progress: OperatingSearchProgress) => void,
	shouldCancel: () => boolean = () => false,
	requested: GpuComputePreference = 'auto'
): Promise<OperatingSearchResult> {
	const start = performance.now();
	assertSearchActive(shouldCancel);
	let fallbackReason: string | undefined;
	if (requested !== 'cpu') {
		try {
			const available = await init('webgpu');
			assertSearchActive(shouldCancel);
			if (!available.includes('webgpu'))
				throw new Error('WebGPU is unavailable in this browser or worker.');
			const result = await searchWithWebGpu(params, scenarios, onProgress, shouldCancel, requested);
			assertSearchActive(shouldCancel);
			result.computation!.totalMs = performance.now() - start;
			return result;
		} catch (error) {
			assertSearchActive(shouldCancel);
			if (error instanceof DOMException && error.name === 'AbortError') throw error;
			fallbackReason = errorMessage(error);
		}
	}
	await yieldToWorker();
	assertSearchActive(shouldCancel);
	const cpuStart = performance.now();
	const result = searchOperatingDesigns(params, scenarios, onProgress, shouldCancel);
	assertSearchActive(shouldCancel);
	result.computation = {
		backend: 'cpu',
		library: 'JavaScript',
		precision: 'Float64',
		device: 'Browser CPU worker',
		requested,
		totalMs: performance.now() - start,
		batchMs: performance.now() - cpuStart,
		geometryPreparationMs: 0,
		verificationMs: 0,
		validatedDesigns: result.evaluated,
		maxRelativeError: 0,
		relativeTolerance: 0,
		guardedThresholdDesigns: 0,
		coarseDesigns: result.evaluated,
		coarsePhasesPerCondition: GPU_OPERATING_PHASES,
		sectionEvaluations:
			result.evaluated * scenarios.length * GPU_OPERATING_PHASES * GPU_OPERATING_SECTIONS,
		...(fallbackReason ? { fallbackReason } : {}),
		note: 'All geometry, prescribed-load screening and finalist refinement ran locally in a JavaScript Float64 worker. CPU batch time includes refinement; no native server is used.'
	};
	return result;
}

async function searchWithWebGpu(
	params: DesignParams,
	scenarios: OperatingScenario[],
	onProgress: ((progress: OperatingSearchProgress) => void) | undefined,
	shouldCancel: () => boolean,
	requested: GpuComputePreference
): Promise<OperatingSearchResult> {
	const designs = createOperatingSearchGrid(params);
	const baseline = summarizeOperatingScreen(evaluateOperatingEnvelope(params, scenarios, 721), 721);
	onProgress?.({ stage: 'coarse', completed: 0, total: designs.length, coarsePassCount: 0 });
	await yieldToWorker();
	assertSearchActive(shouldCancel);
	const prepared = prepareOperatingBatch(designs, scenarios);
	const { candidates, batchMs } = await executeOperatingBatch(prepared, 'webgpu');
	assertSearchActive(shouldCancel);
	const verificationStart = performance.now();
	const checked = new Set<number>();
	let maxRelativeError = 0,
		guardedThresholdDesigns = 0;
	// Spread deterministic validation across the grid, including both geometric extremes.
	const probes = [
		...new Set([
			0,
			Math.floor(designs.length / 4),
			Math.floor(designs.length / 2),
			Math.floor((3 * designs.length) / 4),
			designs.length - 1
		])
	];
	for (const index of probes) {
		assertSearchActive(shouldCancel);
		const reference = summarizeOperatingScreen(
			evaluateOperatingEnvelope(designs[index], scenarios, GPU_OPERATING_PHASES),
			GPU_OPERATING_PHASES
		);
		const error = operatingSummaryError(candidates[index], reference);
		if (!Number.isFinite(error) || error > GPU_OPERATING_RELATIVE_TOLERANCE)
			throw new Error(
				`WebGPU verification failed: relative error ${error.toExponential(3)} exceeds ${GPU_OPERATING_RELATIVE_TOLERANCE}.`
			);
		maxRelativeError = Math.max(maxRelativeError, error);
		candidates[index] = reference;
		checked.add(index);
		await yieldToWorker();
	}
	for (let i = 0; i < candidates.length; i++) {
		if (!checked.has(i) && needsFloat64ThresholdCheck(candidates[i].utilization)) {
			assertSearchActive(shouldCancel);
			const reference = summarizeOperatingScreen(
				evaluateOperatingEnvelope(designs[i], scenarios, GPU_OPERATING_PHASES),
				GPU_OPERATING_PHASES
			);
			const error = operatingSummaryError(candidates[i], reference);
			if (!Number.isFinite(error) || error > GPU_OPERATING_RELATIVE_TOLERANCE)
				throw new Error(
					'WebGPU threshold verification failed; using the Float64 reference search.'
				);
			maxRelativeError = Math.max(maxRelativeError, error);
			candidates[i] = reference;
			guardedThresholdDesigns++;
			checked.add(i);
			await yieldToWorker();
		}
	}
	const coarsePassCount = candidates.filter((c) => c.passesNominalScreen).length;
	onProgress?.({
		stage: 'coarse',
		completed: candidates.length,
		total: designs.length,
		coarsePassCount
	});
	const ranked = candidates
		.filter((c) => c.passesNominalScreen)
		.sort((a, b) => a.massKg - b.massKg || a.id.localeCompare(b.id));
	const finalists: OperatingDesignSummary[] = [];
	let refinedCount = 0;
	for (const candidate of ranked) {
		await yieldToWorker();
		assertSearchActive(shouldCancel);
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
	assertSearchActive(shouldCancel);
	const device = getWebGPUDevice();
	const info = device.adapterInfo;
	const deviceName =
		[info?.vendor, info?.architecture, info?.device, info?.description]
			.filter(Boolean)
			.join(' / ') || 'Browser WebGPU adapter';
	const best = finalists[0] ?? null;
	const computation: GpuComputationReport = {
		backend: 'webgpu',
		library: 'JAX-JS',
		precision: 'float32 + Float64 verification',
		device: deviceName,
		requested,
		totalMs: 0,
		batchMs,
		geometryPreparationMs: prepared.preparationMs,
		verificationMs: performance.now() - verificationStart,
		validatedDesigns: checked.size,
		maxRelativeError,
		relativeTolerance: GPU_OPERATING_RELATIVE_TOLERANCE,
		guardedThresholdDesigns,
		coarseDesigns: candidates.length,
		coarsePhasesPerCondition: GPU_OPERATING_PHASES,
		sectionEvaluations:
			candidates.length * scenarios.length * GPU_OPERATING_PHASES * GPU_OPERATING_SECTIONS,
		note: 'JAX-JS WebGPU float32 evaluates rigid-body endpoint forces and nominal section stress for every coarse design × phase × section. Exact shape integrals, shared prescribed pressure/kinematics and finalist refinement run in browser Float64. Five spread-out designs and every near-threshold result are checked independently before ranking.'
	};
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
		cancelled: false,
		massReductionPercent: best ? (1 - best.massKg / baseline.massKg) * 100 : null,
		method:
			'Bounded 500-combination grid; JAX-JS WebGPU float32 nominal-load screening at 121 phases/condition and 17 shank sections; independent Float64 checks and 721-phase finalist refinement.',
		limitations: [
			'Best sampled-grid nominal design, not a continuous or global optimum; sampled angle and section extrema can miss peaks.',
			'Pressure trace and piston mass are explicit assumptions; this is not combustion, CFD, fatigue or certified capacity.',
			'GPU float32 screening is checked against independent Float64 probes and conservatively rechecks near-threshold designs. Only finalists are refined at 1°.',
			'Nominal axial/in-plane bending excludes contact, fillet stress concentrations, deflection, buckling and manufacturing qualification.'
		],
		computation
	};
}
