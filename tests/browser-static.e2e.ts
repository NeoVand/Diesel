import { readFile } from 'node:fs/promises';
import { expect, test as base, type Page } from '@playwright/test';
import type { DesignParams } from '../src/lib/design/design-core';
import type { RodCadReport } from '../src/lib/browser-cad/contracts';
import type { StructuralResult } from '../src/lib/design/structural';
import type { OperatingSearchResult } from '../src/lib/design/operating-search';
import { renderedDifference } from './helpers/rendered-image';

type CaseExport = {
	params: DesignParams;
	evaluation: { rod: { massKg: number }; kinematics: { displacementLiters: number } };
	solidVerification: RodCadReport | null;
	beamVerification: { passed: boolean; maxRelativeError: number } | null;
	structuralAnalysis: StructuralResult | null;
	operatingSearch: OperatingSearchResult | null;
	operating: { selectedAngleDeg: number };
	operatingExperiments: {
		params: DesignParams;
		expectedCaseCount: number;
		results: { report: StructuralResult }[];
	}[];
};

// This fixture denies old application endpoints and purchased meshes for every test.
// Browser CAD/FEA and generated geometry must not quietly fall back to either one.
const test = base.extend<{ browserIsolation: void }>({
	browserIsolation: [
		async ({ context, page }, use) => {
			const apiRequests: string[] = [],
				modelRequests: string[] = [],
				errors: string[] = [];
			context.on('request', (request) => {
				const path = new URL(request.url()).pathname;
				if (path.startsWith('/api/')) apiRequests.push(path);
				if (path.startsWith('/models/')) modelRequests.push(path);
			});
			page.on('pageerror', (error) => errors.push(error.message));
			await context.route('**/api/**', (route) => route.abort('blockedbyclient'));
			await context.route('**/models/**', (route) => route.abort('blockedbyclient'));
			await use();
			expect(apiRequests, 'No engineering operation may call an application backend').toEqual([]);
			expect(
				modelRequests,
				'Generated studies must work without the purchased display asset'
			).toEqual([]);
			expect(errors, 'No uncaught browser runtime errors').toEqual([]);
		},
		{ auto: true }
	]
});

async function ready(page: Page, analyze = false) {
	await page.goto(analyze ? '/design/?workspace=analyze' : '/design/');
	await expect(
		page.getByRole('region', { name: 'Parametric design viewport', exact: true })
	).toHaveAttribute('data-scene-ready', 'true', { timeout: 30_000 });
	await expect(page.getByLabel('Interactive parametric 3D design', { exact: true })).toBeVisible();
	expect(await page.evaluate(() => crossOriginIsolated)).toBe(true);
	await expect(page.getByRole('button', { name: 'Split layout', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
}
async function dimension(page: Page, label: string, value: number) {
	const input = page.getByRole('spinbutton', { name: `${label} value`, exact: true });
	await input.fill(String(value));
	await input.press('Tab');
	await expect(input).toHaveValue(String(value));
}
async function exportedCase(page: Page): Promise<CaseExport> {
	const download = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Export case', exact: true }).click();
	return JSON.parse(await readFile((await (await download).path())!, 'utf8'));
}
async function solve(page: Page, refined = false) {
	await page
		.getByRole('button', {
			name: refined ? 'Solve & refine selected case' : 'Solve this load case',
			exact: true
		})
		.click();
	await expect(page.getByRole('button', { name: 'Stop analysis', exact: true })).toHaveCount(0, {
		timeout: 60_000
	});
	await expect(page.getByLabel('Solid field color scale')).toBeVisible();
	const result = (await exportedCase(page)).structuralAnalysis;
	expect(result).not.toBeNull();
	return result!;
}

test('phone visitors see the desktop preview without loading geometry or a solver', async ({
	page,
	context
}) => {
	await page.setViewportSize({ width: 390, height: 844 });
	const heavyRequests: string[] = [];
	context.on('request', (request) => {
		if (/engine-runtime|\.wasm|\.glb/.test(request.url())) heavyRequests.push(request.url());
	});
	await page.goto('/');
	await expect(page.getByRole('heading', { name: 'Explore it on your desktop.' })).toBeVisible();
	await expect(page.getByRole('img')).toBeVisible();
	await expect(page.locator('canvas')).toHaveCount(0);
	expect(heavyRequests).toEqual([]);
});

test('device loss gives an explicit recovery screen instead of silently switching renderers', async ({
	page
}) => {
	await ready(page);
	await page.evaluate(() =>
		window.dispatchEvent(
			new CustomEvent('engine-lab:webgpu-device-lost', { detail: 'test device interruption' })
		)
	);
	await expect(
		page.getByRole('heading', { name: 'The graphics device was interrupted.' })
	).toBeVisible();
	await expect(page.getByRole('button', { name: 'Reload workspace' })).toBeVisible();
	await expect(page.locator('canvas')).toHaveCount(0);
});

test('static design loads, edits and verifies a generated mechanism without an API or model asset', async ({
	page,
	request
}) => {
	expect((await request.post('/api/design/rod-analysis', { data: {} })).status()).toBe(404);
	await ready(page);
	const original = await exportedCase(page);
	await dimension(page, 'Flange width', 24);
	expect((await exportedCase(page)).evaluation.rod.massKg).toBeGreaterThan(
		original.evaluation.rod.massKg
	);
	await page.getByRole('button', { name: 'Undo study change', exact: true }).click();
	expect((await exportedCase(page)).params).toEqual(original.params);
	await page.getByRole('button', { name: 'Cranktrain', exact: true }).click();
	await dimension(page, 'Cylinder bore', 90);
	const changed = await exportedCase(page);
	expect(changed.params.strokeMm).toBeCloseTo((85 ** 2 * 100) / 90 ** 2, 8);
	expect(changed.evaluation.kinematics.displacementLiters).toBeCloseTo(
		original.evaluation.kinematics.displacementLiters,
		10
	);
	await page.getByRole('button', { name: 'Rod', exact: true }).click();
	await page.getByRole('button', { name: 'Verification', exact: true }).click();
	await page.getByRole('button', { name: 'Verify beam solution', exact: true }).click();
	await expect(page.locator('.verify-result')).toContainText('Beam solution independently checked');
	const verification = (await exportedCase(page)).beamVerification;
	expect(verification?.passed).toBe(true);
	expect(verification?.maxRelativeError).toBeLessThan(1e-6);
});

test('WebAssembly CAD verifies an exact solid and downloads a real STEP file', async ({
	page
}, testInfo) => {
	await ready(page);
	await page.getByRole('button', { name: 'Verification', exact: true }).click();
	await page.getByRole('button', { name: 'Verify exact solid', exact: true }).click();
	await expect(
		page.getByText('1 valid solid · STEP round trip passed', { exact: true })
	).toBeVisible({ timeout: 60_000 });
	const evidence = (await exportedCase(page)).solidVerification;
	expect(evidence?.kernel).toContain('WebAssembly');
	expect(evidence?.solidCount).toBe(1);
	expect(evidence?.relativeVolumeError).toBeLessThan(1e-8);
	expect(evidence?.stepRoundTripRelativeVolumeError).toBeLessThan(1e-8);
	const pending = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Download STEP', exact: true }).click();
	const download = await pending;
	expect(download.suggestedFilename()).toMatch(/\.step$/i);
	const step = await readFile((await download.path())!, 'utf8');
	expect(step).toContain('ISO-10303-21;');
	expect(step).toContain('MANIFOLD_SOLID_BREP');
	expect(step).toContain('END-ISO-10303-21;');
	await testInfo.attach('verified-browser-cad', {
		body: await page.screenshot(),
		contentType: 'image/png'
	});
});

test('solid fields solve and refine offline, retain exact evidence under display amplification, and invalidate changed inputs', async ({
	page,
	context
}, testInfo) => {
	await ready(page, true);
	await page.getByRole('button', { name: /Peak compression/ }).click();
	const canvas = page.getByLabel('Interactive parametric 3D design', { exact: true });
	const originalPixels = await canvas.screenshot();
	const first = await solve(page);
	expect(first.runtime.solver).toContain('Browser');
	expect(first.runtime.mesher).toContain('WebAssembly');
	expect(first.loadCase.inertia).toBeDefined();
	expect(first.stats.elements).toBeGreaterThan(1000);
	expect(first.stats.solveResidualRelative).toBeLessThan(1e-7);
	expect(first.stats.forceBalanceRelative).toBeLessThan(1e-5);
	expect(first.stats.momentBalanceRelative).toBeLessThan(1e-5);
	const fieldPixels = await canvas.screenshot();
	expect(
		(await renderedDifference(page, originalPixels, fieldPixels)).changedFraction
	).toBeGreaterThan(0.005);
	// The WASM module is loaded; the next solve must work with all network access removed.
	await context.setOffline(true);
	const refined = await solve(page, true);
	expect(refined.convergence.meshes).toHaveLength(2);
	expect(refined.stats.elements).toBeGreaterThan(first.stats.elements);
	expect(refined.stats.volumeRelativeError).toBeLessThan(0.015);
	await page.getByRole('slider', { name: 'Deformation amplification', exact: true }).fill('25');
	await page.getByRole('button', { name: 'Show finite element mesh', exact: true }).click();
	const amplified = (await exportedCase(page)).structuralAnalysis!;
	expect(amplified.surface.displacementMm).toEqual(refined.surface.displacementMm);
	expect(amplified.stats.maxDisplacementMm).toBe(refined.stats.maxDisplacementMm);
	await testInfo.attach('offline-browser-solid-field', {
		body: await page.screenshot(),
		contentType: 'image/png'
	});
	await dimension(page, 'Piston + pin mass', 1.2);
	await expect(page.getByLabel('Solid field color scale')).toHaveCount(0);
	expect((await exportedCase(page)).structuralAnalysis).toBeNull();
	await context.setOffline(false);
});

test('cancelling an in-flight WASM initialization cannot attach a stale result and the next solve recovers', async ({
	page,
	context
}) => {
	let release!: () => void, observed!: () => void;
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	const requested = new Promise<void>((resolve) => {
		observed = resolve;
	});
	let first = true;
	await context.route('**/vendor/gmsh/gmsh.mjs', async (route) => {
		if (first) {
			first = false;
			observed();
			await gate;
		}
		try {
			await route.continue();
		} catch {
			/* termination may have cancelled this module request */
		}
	});
	await ready(page, true);
	await page.getByRole('button', { name: 'Solve this load case', exact: true }).click();
	await requested;
	await page.getByRole('button', { name: 'Stop analysis', exact: true }).click();
	release();
	await expect(
		page.getByRole('button', { name: 'Solve this load case', exact: true })
	).toBeEnabled();
	expect((await exportedCase(page)).structuralAnalysis).toBeNull();
	await page.getByRole('button', { name: 'Overrun', exact: true }).click();
	const result = await solve(page);
	expect(result.stats.solveResidualRelative).toBeLessThan(1e-7);
	expect(result.loadCase.inertia).toBeDefined();
	await expect(page.getByRole('alert')).toHaveCount(0);
});

test('operating search reports its real compute backend and saved studies preserve the numerical evidence', async ({
	page
}) => {
	test.setTimeout(150_000);
	await ready(page, true);
	await page
		.locator('.solid-results')
		.getByRole('button', { name: 'Run candidate comparison', exact: true })
		.click();
	await expect(page.locator('.solid-results')).toContainText('critical load cases solved', {
		timeout: 120_000
	});
	const result = await exportedCase(page),
		search = result.operatingSearch!;
	expect(search.evaluated).toBe(500);
	expect(search.best?.angularSamples).toBe(721);
	expect(search.computation?.sectionEvaluations).toBe(3_085_500);
	await page.getByRole('button', { name: 'Design map', exact: true }).click();
	const summary = page.getByLabel('Operating search computation');
	await expect(summary).toBeVisible();
	if (search.computation?.backend === 'webgpu') {
		await expect(summary).toContainText('WebGPU');
		expect(search.computation.library).toBe('JAX-JS');
		expect(search.computation.maxRelativeError).toBeLessThanOrEqual(
			search.computation.relativeTolerance
		);
	} else {
		await expect(summary).toContainText(/CPU|Float64/);
		expect(search.computation?.backend).toBe('cpu');
		expect(search.computation?.fallbackReason).toBeTruthy();
	}
	expect(result.operatingExperiments).toHaveLength(2);
	for (const experiment of result.operatingExperiments) {
		expect(experiment.results).toHaveLength(experiment.expectedCaseCount);
		for (const solved of experiment.results) {
			expect(solved.report.runtime.solver).toContain('Browser');
			expect(solved.report.convergence.performed).toBe(true);
			expect(solved.report.stats.solveResidualRelative).toBeLessThan(1e-7);
		}
	}
	await page.getByRole('button', { name: /^Studies/ }).click();
	const library = page.getByRole('complementary', { name: 'Saved studies', exact: true });
	await library
		.getByRole('textbox', { name: 'Save current study as', exact: true })
		.fill('Browser compute reference');
	await library.getByRole('button', { name: 'Save study', exact: true }).click();
	await expect(library.getByRole('button', { name: /^Browser compute reference/ })).toBeVisible();
	await page.reload();
	await expect(
		page.getByRole('region', { name: 'Parametric design viewport', exact: true })
	).toHaveAttribute('data-scene-ready', 'true');
	await page.getByRole('button', { name: /^Studies/ }).click();
	await library.getByRole('button', { name: /^Browser compute reference/ }).click();
	await expect(library).toHaveCount(0);
	const restored = await exportedCase(page);
	expect(restored.operatingSearch).toEqual(result.operatingSearch);
	expect(restored.operatingExperiments).toEqual(result.operatingExperiments);
});

test('AI uses the direct OpenAI endpoint, omits meshes and never persists the visitor key', async ({
	page,
	context
}) => {
	const fakeKey = 'sk-browser-static-test-only-key-0001';
	let calls = 0;
	await context.route('https://api.openai.com/v1/responses', async (route) => {
		const request = route.request();
		const headers = {
			'access-control-allow-origin': '*',
			'access-control-allow-methods': 'POST, OPTIONS',
			'access-control-allow-headers': request.headers()['access-control-request-headers'] ?? '*'
		};
		if (request.method() === 'OPTIONS') {
			await route.fulfill({ status: 204, headers });
			return;
		}
		calls++;
		expect(request.headers().authorization).toBe(`Bearer ${fakeKey}`);
		const payload = request.postDataJSON();
		expect(payload.store).toBe(false);
		const evidence = JSON.parse(payload.input);
		expect(evidence.submittedEvidence.params.boreMm).toBe(85);
		expect(evidence.browserDerived.rod.massKg).toBeGreaterThan(0);
		expect(payload.input).not.toContain(fakeKey);
		expect(payload.input).not.toContain('positionsMm');
		await route.fulfill({
			headers,
			contentType: 'application/json',
			body: JSON.stringify({
				id: 'resp_browser_static',
				object: 'response',
				created_at: 0,
				status: 'completed',
				output: [
					{
						type: 'message',
						id: 'msg_browser_static',
						role: 'assistant',
						status: 'completed',
						content: [
							{
								type: 'output_text',
								annotations: [],
								text: JSON.stringify({
									text: 'The load trace is prescribed. The browser computes forces from that trace and the current geometry.'
								})
							}
						]
					}
				]
			})
		});
	});
	await ready(page, true);
	await page.getByRole('button', { name: 'Assistant', exact: true }).click();
	await page.getByRole('button', { name: 'Connect AI', exact: true }).click();
	await page.getByLabel('OpenAI API key', { exact: true }).fill(fakeKey);
	await page.getByRole('button', { name: 'Connect', exact: true }).click();
	await page.getByRole('button', { name: 'Explain loads', exact: true }).click();
	await expect(page.locator('.reply')).toContainText('The load trace is prescribed.');
	expect(calls).toBe(1);
	const storage = await page.evaluate(() =>
		JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } })
	);
	expect(storage).not.toContain(fakeKey);
	expect(JSON.stringify(await exportedCase(page))).not.toContain(fakeKey);
	await page.reload();
	await expect(page.getByRole('button', { name: 'Assistant', exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Assistant', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Connect AI', exact: true })).toBeVisible();
});
