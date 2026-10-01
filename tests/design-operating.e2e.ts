import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

async function operating(page: Page) {
	await page.goto('/design');
	await expect(
		page.getByRole('region', { name: 'Parametric design viewport', exact: true })
	).toHaveAttribute('data-scene-ready', 'true', { timeout: 30_000 });
	await page.getByRole('button', { name: 'Operating loads', exact: true }).click();
	await expect(
		page.getByRole('heading', { name: 'Operating conditions', exact: true })
	).toBeVisible();
}
async function exportCase(page: Page) {
	const event = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Export case', exact: true }).click();
	const file = await (await event).path();
	return JSON.parse(await readFile(file!, 'utf8'));
}
async function solve(page: Page, refine = false) {
	const event = page.waitForResponse((r) => r.url().endsWith('/api/design/rod-analysis'));
	await page
		.getByRole('button', {
			name: refine ? 'Solve & refine selected case' : 'Solve this load case',
			exact: true
		})
		.click();
	const response = await event;
	expect(response.status()).toBe(200);
	const result = await response.json();
	await expect(page.getByLabel('Solid field color scale')).toBeVisible();
	return result;
}

test('operating cycle retains the full four-stroke phase and explicit pressure assumptions', async ({
	page
}) => {
	await operating(page);
	await expect(page).toHaveURL(/workspace=analyze/);
	await page.reload();
	await expect(
		page.getByRole('region', { name: 'Parametric design viewport', exact: true })
	).toHaveAttribute('data-scene-ready', 'true', { timeout: 30_000 });
	await expect(page.getByRole('button', { name: 'Operating loads', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	const angle = page.getByRole('slider', { name: 'Design crank angle', exact: true });
	await expect(angle).toHaveAttribute('max', '720');
	await angle.fill('361');
	await expect(angle).toHaveValue('361');
	const data = await exportCase(page);
	expect(data.operating.selectedAngleDeg).toBe(361);
	expect(data.operating.cycle.samples).toHaveLength(721);
	expect(data.operating.cycle.envelope.maxForceBalanceRelative).toBeLessThan(1e-9);
	expect(data.operating.cycle.samples[0].pressureBar).toBeGreaterThan(50);
	expect(data.operating.cycle.samples[360].pressureBar).toBeLessThan(2);
	await expect(page.getByRole('button', { name: 'Rod', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await expect(page.getByRole('button', { name: 'Run design mechanism', exact: true })).toHaveCount(
		0
	);
	await page.getByRole('button', { name: 'Cranktrain view', exact: true }).click();
	await expect(angle).toHaveValue('361');
	await page.getByRole('button', { name: 'Run design mechanism', exact: true }).click();
	await expect.poll(() => angle.inputValue()).not.toBe('361');
	await page.getByRole('button', { name: 'Pause design mechanism', exact: true }).click();
	await angle.fill('550');
	await page.getByRole('button', { name: 'Kinematics', exact: true }).click();
	await expect(angle).toHaveAttribute('max', '360');
	await expect(angle).toHaveValue('190');
	await expect(page).toHaveURL(/\/design$/);
});

test('native solid result includes cycle inertia and refinement while visual amplification preserves evidence', async ({
	page
}) => {
	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(e.message));
	await operating(page);
	await page.getByRole('button', { name: /Peak compression/ }).click();
	const first = await solve(page);
	expect(first.schemaVersion).toBe('rod-solid-fea-v1');
	expect(first.loadCase.inertia).toBeDefined();
	expect(first.stats.elements).toBeGreaterThan(1000);
	expect(first.stats.forceBalanceRelative).toBeLessThan(1e-8);
	expect(first.stats.momentBalanceRelative).toBeLessThan(1e-8);
	const refined = await solve(page, true);
	expect(refined.convergence.meshes).toHaveLength(2);
	expect(refined.stats.elements).toBeGreaterThan(first.stats.elements);
	await page.getByRole('slider', { name: 'Deformation amplification', exact: true }).fill('25');
	await page.getByRole('button', { name: 'Show finite element mesh', exact: true }).click();
	await expect(
		page.getByRole('button', { name: 'Show finite element mesh', exact: true })
	).toHaveAttribute('aria-pressed', 'true');
	const data = await exportCase(page);
	expect(data.structuralAnalysis.stats.maxDisplacementMm).toBe(refined.stats.maxDisplacementMm);
	expect(data.structuralAnalysis.surface.displacementMm).toEqual(refined.surface.displacementMm);
	await page.getByRole('button', { name: /Peak tension/ }).click();
	await expect(page.getByLabel('Solid field color scale')).toHaveCount(0);
	await page.getByRole('button', { name: 'Show field', exact: true }).click();
	await expect(page.getByLabel('Solid field color scale')).toBeVisible();
	const mass = page.getByRole('spinbutton', { name: 'Piston + pin mass value', exact: true });
	await mass.fill('1.2');
	await mass.press('Tab');
	await expect(page.getByLabel('Solid field color scale')).toHaveCount(0);
	expect((await exportCase(page)).structuralAnalysis).toBeNull();
	expect(errors).toEqual([]);
});

test('multi-condition search compares independently meshed designs and does not certify a nominal winner', async ({
	page
}) => {
	test.setTimeout(90_000);
	await operating(page);
	await page
		.locator('.solid-results')
		.getByRole('button', { name: 'Run candidate comparison', exact: true })
		.click();
	await expect(page.locator('.solid-results')).toContainText('critical load cases solved', {
		timeout: 60_000
	});
	const data = await exportCase(page);
	expect(data.operatingSearch.evaluated).toBe(500);
	expect(data.operatingSearch.scenarios).toHaveLength(3);
	expect(data.operatingSearch.best.angularSamples).toBe(721);
	expect(data.operatingExperiments).toHaveLength(2);
	for (const experiment of data.operatingExperiments) {
		expect(experiment.results).toHaveLength(experiment.expectedCaseCount);
		for (const solved of experiment.results) {
			expect(solved.report.convergence.performed).toBe(true);
			expect(solved.report.loadCase.inertia).toBeDefined();
			expect(solved.report.stats.forceBalanceRelative).toBeLessThan(1e-7);
		}
	}
	const mass = (p: { rodWidthMm: number; rodDepthMm: number; webMm: number; flangeMm: number }) => [
		p.rodWidthMm,
		p.rodDepthMm,
		p.webMm,
		p.flangeMm
	];
	expect(mass(data.operatingExperiments[0].params)).not.toEqual(
		mass(data.operatingExperiments[1].params)
	);
	await page
		.locator('.experiment-table')
		.getByRole('button', { name: 'Inspect', exact: true })
		.last()
		.click();
	await expect(page.getByLabel('Solid field color scale')).toBeVisible();
	const inspected = await exportCase(page);
	const last = data.operatingExperiments[1].results.at(-1);
	expect(inspected.params.rpm).toBe(last.scenario.rpm);
	expect(inspected.operating.selectedAngleDeg).toBe(last.angleDeg);
	let assistantEvidence: Record<string, unknown> | null = null;
	await page.route('**/api/design/explain', async (route) => {
		const payload = route.request().postDataJSON();
		assistantEvidence = payload.evidence;
		expect(payload.evidence.search.scenarios).toHaveLength(3);
		expect(
			payload.evidence.native.some(
				(c: { operatingScenario: { rpm: number } }) => c.operatingScenario.rpm === 3000
			)
		).toBe(true);
		expect(payload.evidence.native.every((c: Record<string, unknown>) => !('surface' in c))).toBe(
			true
		);
		expect((route.request().postData() ?? '').length).toBeLessThan(32768);
		await route.fulfill({
			contentType: 'application/json',
			body: JSON.stringify({
				text: 'The selected cycle and the three-condition envelope are distinct. Native refinement does not certify local strength.',
				provider: 'OpenAI',
				model: 'test-response'
			})
		});
	});
	await page.getByRole('button', { name: 'Assistant', exact: true }).click();
	await page.getByRole('button', { name: 'Review comparison', exact: true }).click();
	await expect(page.locator('.reply')).toContainText('three-condition envelope');
	expect(assistantEvidence).not.toBeNull();
	await page.getByRole('button', { name: 'Overrun', exact: true }).click();
	await expect(page.locator('.experiment-table table')).toHaveCount(0);
	expect((await exportCase(page)).operatingExperiments).toHaveLength(0);
});

test('late native responses cannot attach to a changed scenario', async ({ page }) => {
	await operating(page);
	let release!: () => void;
	const gate = new Promise<void>((r) => (release = r));
	let requested!: () => void;
	const observed = new Promise<void>((r) => (requested = r));
	await page.route('**/api/design/rod-analysis', async (route) => {
		requested();
		await gate;
		try {
			await route.fulfill({
				status: 503,
				contentType: 'application/json',
				body: JSON.stringify({ error: 'stale response' })
			});
		} catch {
			/*Browser may have aborted the old request.*/
		}
	});
	await page.getByRole('button', { name: 'Solve this load case', exact: true }).click();
	await observed;
	await page.getByRole('button', { name: 'Overrun', exact: true }).click();
	release();
	await expect(
		page.getByRole('button', { name: 'Solve this load case', exact: true })
	).toBeEnabled();
	await expect(page.getByRole('alert')).toHaveCount(0);
	expect((await exportCase(page)).structuralAnalysis).toBeNull();
});

test('operating charts and result controls remain usable on mobile', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await operating(page);
	await page.getByRole('button', { name: /Peak tension/ }).click();
	const size = await page.evaluate(() => ({
		width: document.documentElement.scrollWidth,
		viewport: innerWidth
	}));
	expect(size.width).toBeLessThanOrEqual(size.viewport + 1);
	await page.getByRole('button', { name: 'Cranktrain', exact: true }).click();
	await expect(
		page.getByRole('slider', { name: 'Design crank angle', exact: true })
	).toHaveAttribute('max', '720');
});
