import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

type ExportedCase = {
	schemaVersion: number;
	params: Record<string, number>;
	baseline: Record<string, number>;
	scope: string;
	evaluation: {
		rod: {
			massKg: number;
			feasible: boolean;
			constraints: { passed: boolean; utilization: number }[];
		};
		kinematics: { displacementLiters: number };
	};
	beamVerification: {
		passed: boolean;
		maxRelativeError: number;
		meshes: { elements: number; residualRelative: number }[];
	} | null;
	search: { evaluated: number; feasible: number; scope: string } | null;
};

async function readyDesign(page: Page) {
	await page.goto('/design');
	await expect(page.getByRole('heading', { name: 'Geometry', exact: true })).toBeVisible();
	await expect(
		page.getByRole('region', { name: 'Parametric design viewport', exact: true })
	).toHaveAttribute('data-scene-ready', 'true', { timeout: 30_000 });
	await expect(page.getByRole('button', { name: /Explore design space/ })).toBeEnabled();
	await expect(page.getByRole('alert')).toHaveCount(0);
	await expect(page.getByLabel('Interactive parametric 3D design', { exact: true })).toBeVisible();
}

async function setDimension(page: Page, label: string, value: number) {
	const input = page.getByRole('spinbutton', { name: `${label} value`, exact: true });
	await input.fill(String(value));
	await input.press('Tab');
	await expect(input).toHaveValue(String(value));
}

async function primaryMetric(page: Page) {
	return Number.parseFloat(
		(await page.locator('.primary-metric > div').innerText()).replaceAll(',', '')
	);
}

async function exportCase(page: Page): Promise<ExportedCase> {
	const promise = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Export case', exact: true }).click();
	const download = await promise;
	expect(download.suggestedFilename()).toBe('engine-lab-design-case.json');
	const file = await download.path();
	expect(file).not.toBeNull();
	return JSON.parse(await readFile(file!, 'utf8')) as ExportedCase;
}

test('design dimensions change measured geometry and reset restores the baseline', async ({
	page
}) => {
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await readyDesign(page);
	const originalMass = await primaryMetric(page);
	await page.getByRole('button', { name: 'Measurements', exact: true }).click();
	const volume = page
		.getByRole('row')
		.filter({ has: page.getByRole('cell', { name: 'Solid volume', exact: true }) })
		.getByRole('cell')
		.last();
	const originalVolume = await volume.innerText();
	await setDimension(page, 'Flange width', 24);
	await expect(volume).not.toHaveText(originalVolume);
	expect(await primaryMetric(page)).toBeGreaterThan(originalMass);
	await page.getByRole('button', { name: 'Shank stress', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Shank stress', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await expect(page.locator('.view-hint')).toContainText('shank only');
	await page.getByRole('button', { name: 'Reset', exact: true }).click();
	await expect(
		page.getByRole('spinbutton', { name: 'Flange width value', exact: true })
	).toHaveValue('20');
	await expect(volume).toHaveText(originalVolume);
	expect(await primaryMetric(page)).toBe(originalMass);
	await expect(page.locator('.primary-metric')).toContainText('Baseline design');
	expect(errors).toEqual([]);
});

test('displacement lock derives stroke from bore and unlock permits a new volume', async ({
	page
}) => {
	await readyDesign(page);
	await page.getByRole('button', { name: 'Cranktrain', exact: true }).click();
	const lock = page.getByRole('checkbox', { name: /Hold displacement/ });
	const stroke = page.getByRole('spinbutton', { name: 'Stroke value', exact: true });
	await expect(lock).toBeChecked();
	await expect(stroke).toBeDisabled();
	const originalVolume = await primaryMetric(page);
	await setDimension(page, 'Cylinder bore', 90);
	const derivedStroke = Number(await stroke.inputValue());
	expect(derivedStroke).toBeLessThan(100);
	expect(derivedStroke).toBeCloseTo((85 ** 2 * 100) / 90 ** 2, 3);
	const lockedCase = await exportCase(page);
	expect(
		(12 * Math.PI * lockedCase.params.boreMm ** 2 * lockedCase.params.strokeMm) / 4 / 1e6
	).toBeCloseTo(6.809402076655877, 10);
	expect(await primaryMetric(page)).toBe(originalVolume);
	await lock.uncheck();
	await expect(stroke).toBeEnabled();
	await setDimension(page, 'Stroke', 100);
	expect(await primaryMetric(page)).toBeGreaterThan(originalVolume);
	await expect(
		page.getByRole('button', { name: 'Run design mechanism', exact: true })
	).toBeVisible();
});

test('blank and repeated out-of-range entries agree with clamped model and exported parameters', async ({
	page
}) => {
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await readyDesign(page);
	const width = page.getByRole('spinbutton', { name: 'Flange width value', exact: true });
	await width.fill('');
	await width.press('Tab');
	await expect(width).toHaveValue('20');
	expect((await exportCase(page)).params.rodWidthMm).toBe(20);
	for (const [raw, expected] of [
		['999', 28],
		['999', 28],
		['-100', 14],
		['-100', 14]
	] as const) {
		await width.fill(raw);
		await width.press('Tab');
		await expect(width).toHaveValue(String(expected));
		await expect(page.getByRole('slider', { name: 'Flange width', exact: true })).toHaveValue(
			String(expected)
		);
		const data = await exportCase(page);
		expect(data.params.rodWidthMm).toBe(expected);
		expect(data.evaluation.rod.massKg * 1000).toBeCloseTo(await primaryMetric(page), 1);
	}
	await expect(page.getByRole('alert')).toHaveCount(0);
	expect(errors).toEqual([]);
});

test('crank playback and seeking work while scenario speed independently changes derivatives', async ({
	page
}) => {
	await readyDesign(page);
	await page.getByRole('button', { name: 'Cranktrain', exact: true }).click();
	const angle = page.getByRole('slider', { name: 'Design crank angle', exact: true });
	await angle.fill('90');
	const velocity = page
		.locator('.motion-readout dl > div')
		.filter({ hasText: 'Piston velocity' })
		.locator('dd');
	const originalVelocity = Number.parseFloat(await velocity.innerText());
	await setDimension(page, 'Scenario speed', 3600);
	await expect(angle).toHaveValue('90');
	expect(Number.parseFloat(await velocity.innerText())).toBeCloseTo(originalVelocity * 2, 1);
	await page.getByRole('button', { name: 'Run design mechanism', exact: true }).click();
	await expect(
		page.getByRole('button', { name: 'Pause design mechanism', exact: true })
	).toBeVisible();
	await expect.poll(() => angle.inputValue()).not.toBe('90');
	await expect(
		page.getByRole('spinbutton', { name: 'Scenario speed value', exact: true })
	).toHaveValue('3600');
	await angle.fill('180');
	await expect(
		page.getByRole('button', { name: 'Run design mechanism', exact: true })
	).toBeVisible();
	await expect(angle).toHaveValue('180');
	await expect(
		page
			.locator('.motion-readout dl > div')
			.filter({ hasText: 'Piston travel from TDC' })
			.locator('dd')
	).toHaveText('100.00 mm');
	await page.evaluate(
		() =>
			new Promise<void>((resolve) =>
				requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
			)
	);
	await expect(angle).toHaveValue('180');
});

test('worker searches 1681 cases and an inspected lighter finalist satisfies the stated limits', async ({
	page
}) => {
	await readyDesign(page);
	const originalMass = await primaryMetric(page);
	await page.getByRole('button', { name: /Explore design space/ }).click();
	await expect(page.locator('.search-progress')).toContainText('1,681 evaluated', {
		timeout: 30_000
	});
	await expect(
		page.getByRole('button', { name: 'Inspect lightest feasible', exact: true })
	).toBeVisible();
	await expect(page.locator('.candidate-list button')).toHaveCount(3);
	await page.getByRole('button', { name: 'Inspect lightest feasible', exact: true }).click();
	expect(await primaryMetric(page)).toBeLessThan(originalMass);
	await expect(page.locator('.constraint-heading')).toContainText('Beam screen passes');
	await expect(page.locator('.constraints .failed')).toHaveCount(0);
	await page.getByRole('button', { name: 'Verification', exact: true }).click();
	await page.getByRole('button', { name: 'Verify beam solution', exact: true }).click();
	await expect(page.locator('.verify-result')).toContainText('Beam solution independently checked');
	const data = await exportCase(page);
	expect(data.search?.evaluated).toBe(1681);
	expect(data.search?.feasible).toBeGreaterThan(0);
	expect(data.search?.scope).toContain('not a certified continuous/global optimum');
	expect(data.evaluation.rod.feasible).toBe(true);
	expect(
		data.evaluation.rod.constraints.every(
			(constraint) => constraint.passed && constraint.utilization <= 1
		)
	).toBe(true);
	expect(data.evaluation.rod.massKg * 1000).toBeLessThan(originalMass);
	expect(data.beamVerification?.passed).toBe(true);
	expect(data.beamVerification?.meshes.map((mesh) => mesh.elements)).toEqual([4, 8, 16, 32]);
	expect(data.beamVerification?.maxRelativeError).toBeLessThan(1e-6);
	for (const key of ['boreMm', 'strokeMm', 'rodLengthMm', 'loadKn', 'lateralLoadN'])
		expect(data.params[key]).toBe(data.baseline[key]);
});

test('beam verification is invalidated when the assessed geometry changes', async ({ page }) => {
	await readyDesign(page);
	await page.getByRole('button', { name: 'Verification', exact: true }).click();
	await page.getByRole('button', { name: 'Verify beam solution', exact: true }).click();
	await expect(page.locator('.verify-result')).toContainText('4 / 8 / 16 / 32 elements');
	await setDimension(page, 'Web thickness', 5);
	await expect(page.locator('.verify-result')).toHaveCount(0);
	await expect(page.locator('.verification-empty')).toBeVisible();
	const data = await exportCase(page);
	expect(data.params.webMm).toBe(5);
	expect(data.beamVerification).toBeNull();
	expect(data.scope).toContain('No combustion');
});

test('an infeasible load case reports no winning candidate instead of relaxing the limits', async ({
	page
}) => {
	await readyDesign(page);
	await page.getByRole('button', { name: 'Cranktrain', exact: true }).click();
	await setDimension(page, 'Rod centre distance', 160);
	await page.getByRole('button', { name: 'Rod', exact: true }).click();
	await setDimension(page, 'Axial compression', 50);
	await setDimension(page, 'Transverse centre load', 2000);
	await page.getByRole('button', { name: /Explore design space/ }).click();
	await expect(page.locator('.search-progress')).toContainText('1,681 evaluated', {
		timeout: 30_000
	});
	await expect(page.locator('.search-progress strong')).toHaveText('0 feasible');
	await expect(
		page.getByRole('button', { name: 'Inspect lightest feasible', exact: true })
	).toHaveCount(0);
	await expect(page.locator('.candidate-list button')).toHaveCount(0);
	await expect(page.locator('.statusbar')).toContainText('No sampled design meets every limit');
	await expect(page.locator('.constraint-heading')).toContainText('OUTSIDE LIMITS');
	const data = await exportCase(page);
	expect(data.search?.feasible).toBe(0);
	expect(data.params.loadKn).toBe(50);
	expect(data.params.lateralLoadN).toBe(2000);
	expect(data.params.rodLengthMm).toBe(160);
	expect(data.evaluation.rod.feasible).toBe(false);
});

test('case and cycle exports preserve units, assumptions and the displayed mechanism', async ({
	page
}) => {
	await readyDesign(page);
	const data = await exportCase(page);
	expect(data.schemaVersion).toBe(1);
	expect(data.params.boreMm).toBe(85);
	expect(data.evaluation.kinematics.displacementLiters).toBeCloseTo(6.809402076655877, 10);
	expect(data.scope).toContain('Timoshenko');
	await page.getByRole('button', { name: 'Cranktrain', exact: true }).click();
	const promise = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Export cycle measurements', exact: true }).click();
	const download = await promise;
	expect(download.suggestedFilename()).toBe('engine-lab-kinematics.csv');
	const rows = (await readFile((await download.path())!, 'utf8')).trim().split('\n');
	expect(rows).toHaveLength(182);
	expect(rows[0]).toBe(
		'crank_angle_deg,displacement_mm,velocity_m_s,acceleration_m_s2,rod_angle_deg'
	);
	const values = rows.slice(1).map((row) => row.split(',').map(Number));
	expect(values[0][0]).toBe(0);
	expect(values.at(-1)![0]).toBe(360);
	expect(values[90][0]).toBe(180);
	expect(values[90][1]).toBeCloseTo(100, 9);
	expect(values.every((row) => row.every(Number.isFinite))).toBe(true);
});

test('scope dialog keeps background controls inert, explains limits and closes with Escape', async ({
	page
}) => {
	await readyDesign(page);
	await page.getByRole('button', { name: 'Verification', exact: true }).click();
	const opener = page.getByRole('button', { name: 'Read assumptions', exact: true });
	await opener.click();
	const dialog = page.getByRole('dialog', { name: 'A reproducible design study.', exact: true });
	await expect(dialog).toBeVisible();
	await expect(dialog).toContainText('Timoshenko');
	await expect(dialog).toContainText('not a proof of a continuous global optimum');
	await expect(dialog).toContainText('fatigue are outside this model');
	await expect.poll(() => dialog.evaluate((element) => element.matches(':modal'))).toBe(true);
	await expect
		.poll(() => dialog.evaluate((element) => element.contains(document.activeElement)))
		.toBe(true);
	for (let i = 0; i < 5; i++) {
		await page.keyboard.press('Tab');
		await expect
			// Native dialogs may temporarily tab into browser chrome (activeElement is body),
			// but must never make an underlying page control keyboard-accessible.
			.poll(() =>
				dialog.evaluate(
					(element) =>
						document.activeElement === document.body || element.contains(document.activeElement)
				)
			)
			.toBe(true);
	}
	await page.keyboard.press('Escape');
	await expect(dialog).not.toBeVisible();
	await expect(opener).toBeFocused();
});

test('mobile design studies retain usable controls without horizontal document overflow', async ({
	page
}) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await readyDesign(page);
	const assertWidth = async () => {
		const size = await page.evaluate(() => ({
			width: document.documentElement.scrollWidth,
			viewport: innerWidth
		}));
		expect(size.width).toBeLessThanOrEqual(size.viewport + 1);
	};
	await assertWidth();
	const widthSlider = page.getByRole('slider', { name: 'Flange width', exact: true });
	await widthSlider.scrollIntoViewIfNeeded();
	const box = await widthSlider.boundingBox();
	expect(box).not.toBeNull();
	expect(box!.x).toBeGreaterThanOrEqual(0);
	expect(box!.x + box!.width).toBeLessThanOrEqual(391);
	await page.getByRole('button', { name: 'Cranktrain', exact: true }).click();
	await page.getByRole('slider', { name: 'Design crank angle', exact: true }).fill('180');
	await expect(page.getByRole('slider', { name: 'Design crank angle', exact: true })).toHaveValue(
		'180'
	);
	await assertWidth();
	await page.getByRole('button', { name: 'Measurements', exact: true }).click();
	await assertWidth();
});
