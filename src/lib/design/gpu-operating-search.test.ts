import { afterEach, describe, expect, it, vi } from 'vitest';
import * as jax from '@jax-js/jax';
import * as kernel from './gpu-operating-kernel';
import { DEFAULT_DESIGN_PARAMS } from './design-core';
import { DEFAULT_OPERATING_SCENARIO } from './operating-cycle';
import {
	searchOperatingDesignsBrowser,
	needsFloat64ThresholdCheck,
	operatingSummaryError
} from './gpu-operating-search';
import {
	createSavedStudy,
	validateSavedStudy,
	validateSnapshot,
	type StudySnapshot
} from './study-storage';

vi.mock('@jax-js/jax', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@jax-js/jax')>();
	return { ...actual, init: vi.fn(actual.init) };
});
vi.mock('./gpu-operating-kernel', async (importOriginal) => {
	const actual = await importOriginal<typeof import('./gpu-operating-kernel')>();
	return { ...actual, executeOperatingBatch: vi.fn(actual.executeOperatingBatch) };
});

const params = { ...DEFAULT_DESIGN_PARAMS },
	scenarios = [{ ...DEFAULT_OPERATING_SCENARIO }];

afterEach(() => {
	vi.mocked(jax.init).mockReset();
	vi.mocked(kernel.executeOperatingBatch).mockReset();
});

describe('browser operating search backend safeguards', () => {
	it('records CPU provenance and the failure reason when a GPU device is lost after initialization', async () => {
		vi.mocked(jax.init).mockResolvedValue(['webgpu']);
		vi.mocked(kernel.executeOperatingBatch).mockRejectedValue(
			new Error('GPU device lost during readback.')
		);
		const result = await searchOperatingDesignsBrowser(
			params,
			scenarios,
			undefined,
			undefined,
			'webgpu'
		);
		expect(result.computation?.backend).toBe('cpu');
		expect(result.computation?.library).toBe('JavaScript');
		expect(result.computation?.precision).toBe('Float64');
		expect(result.computation?.fallbackReason).toBe('GPU device lost during readback.');
		expect(result.best?.angularSamples).toBe(721);
	});
	it('cancellation during a failing GPU dispatch never launches a CPU fallback or publishes a winner', async () => {
		vi.mocked(jax.init).mockResolvedValue(['webgpu']);
		let cancel = false;
		vi.mocked(kernel.executeOperatingBatch).mockImplementation(async () => {
			cancel = true;
			throw new Error('GPU device lost.');
		});
		await expect(
			searchOperatingDesignsBrowser(params, scenarios, undefined, () => cancel, 'webgpu')
		).rejects.toMatchObject({ name: 'AbortError' });
	});
	it('uses the full Float64 search when requested and preserves backend provenance in saved studies', async () => {
		const result = await searchOperatingDesignsBrowser(
			params,
			scenarios,
			undefined,
			undefined,
			'cpu'
		);
		expect(result.computation?.backend).toBe('cpu');
		expect(result.computation?.requested).toBe('cpu');
		expect(result.computation?.fallbackReason).toBeUndefined();
		expect(result.computation?.sectionEvaluations).toBe(500 * 121 * 17);
		const snapshot: StudySnapshot = {
			version: 1,
			params,
			baseline: params,
			scenario: scenarios[0],
			phase: 0,
			study: 'rod',
			tab: 'operating',
			volumeLocked: false,
			lockedVolume: 6.8094,
			structural: null,
			structuralContext: null,
			experiments: [],
			operatingSearch: result,
			search: null
		};
		const saved = await createSavedStudy('Browser reference', snapshot);
		expect(saved.snapshot.operatingSearch?.computation).toEqual(result.computation);
		await expect(validateSavedStudy(saved)).resolves.toBeUndefined();
		for (const patch of [
			{ backend: 'server' },
			{ precision: 'float16' },
			{ coarseDesigns: 499 },
			{ maxRelativeError: NaN },
			{ secret: 'should not persist' }
		]) {
			const bad = structuredClone(snapshot);
			Object.assign(bad.operatingSearch!.computation!, patch);
			expect(() => validateSnapshot(bad)).toThrow();
		}
	});
	it('falls back locally and records why when WebGPU cannot initialize', async () => {
		const result = await searchOperatingDesignsBrowser(
			params,
			scenarios,
			undefined,
			undefined,
			'webgpu'
		);
		// This test executes in Node without navigator.gpu; real GPU execution has a separate browser verifier.
		expect(result.computation?.backend).toBe('cpu');
		expect(result.computation?.requested).toBe('webgpu');
		expect(result.computation?.fallbackReason).toMatch(/WebGPU|webgpu|navigator/);
		expect(result.best?.angularSamples).toBe(721);
	});
	it('never returns a stale winner if cancellation happens before or during a search', async () => {
		await expect(
			searchOperatingDesignsBrowser(params, scenarios, undefined, () => true)
		).rejects.toMatchObject({ name: 'AbortError' });
		let cancel = false;
		await expect(
			searchOperatingDesignsBrowser(
				params,
				scenarios,
				() => {
					cancel = true;
				},
				() => cancel,
				'cpu'
			)
		).rejects.toMatchObject({ name: 'AbortError' });
	});
	it('widens the threshold in both directions before any float32 acceptance decision', () => {
		for (const value of [1, 1 - 0.00059, 1 + 0.00059])
			expect(needsFloat64ThresholdCheck(value)).toBe(true);
		for (const value of [0.9, 1.1]) expect(needsFloat64ThresholdCheck(value)).toBe(false);
	});
	it('detects independent reference disagreement even when a scalar is near zero', async () => {
		const result = await searchOperatingDesignsBrowser(
			params,
			scenarios,
			undefined,
			undefined,
			'cpu'
		);
		const candidate = result.candidates[0];
		expect(operatingSummaryError(candidate, candidate)).toBe(0);
		expect(
			operatingSummaryError({ ...candidate, maxTensionN: 0.001 }, { ...candidate, maxTensionN: 0 })
		).toBe(0.001);
	});
});
