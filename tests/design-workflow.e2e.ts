import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

async function ready(page: Page, path = '/design') {
	await page.goto(path);
	await expect(
		page.getByRole('region', { name: 'Parametric design viewport', exact: true })
	).toHaveAttribute('data-scene-ready', 'true', { timeout: 30_000 });
}

async function dimension(page: Page, name: string, value: number) {
	const input = page.getByRole('spinbutton', { name: `${name} value`, exact: true });
	await input.fill(String(value));
	await input.press('Tab');
	await expect(input).toHaveValue(String(value));
}

async function exportedCase(page: Page) {
	const event = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Export case', exact: true }).click();
	return JSON.parse(await readFile((await (await event).path())!, 'utf8'));
}

test('undo and redo restore independent geometry edits and a new edit discards the forward branch', async ({
	page
}) => {
	await ready(page);
	const undo = page.getByRole('button', { name: 'Undo study change', exact: true });
	const redo = page.getByRole('button', { name: 'Redo study change', exact: true });
	await expect(undo).toBeDisabled();
	await expect(redo).toBeDisabled();
	await dimension(page, 'Flange width', 24);
	await dimension(page, 'Web thickness', 5);
	const changed = await exportedCase(page);
	await undo.click();
	await expect(
		page.getByRole('spinbutton', { name: 'Web thickness value', exact: true })
	).toHaveValue('4');
	await expect(
		page.getByRole('spinbutton', { name: 'Flange width value', exact: true })
	).toHaveValue('24');
	await undo.focus();
	await page.keyboard.press('ControlOrMeta+Shift+z');
	await expect(
		page.getByRole('spinbutton', { name: 'Web thickness value', exact: true })
	).toHaveValue('5');
	const restored = await exportedCase(page);
	expect(restored.params).toEqual(changed.params);
	expect(restored.evaluation.rod.massKg).toBe(changed.evaluation.rod.massKg);
	await undo.click();
	await dimension(page, 'Flange thickness', 4);
	await expect(redo).toBeDisabled();
	const branched = await exportedCase(page);
	expect(branched.params.webMm).toBe(4);
	expect(branched.params.flangeMm).toBe(4);
	expect(branched.params.rodWidthMm).toBe(24);
});

test('a named study reloads its solved inputs and native evidence without running another solver', async ({
	page
}) => {
	test.setTimeout(90_000);
	let solves = 0;
	page.on('request', (request) => {
		if (new URL(request.url()).pathname === '/api/design/rod-analysis') solves++;
	});
	await ready(page, '/design?workspace=analyze');
	await expect(page.getByRole('link', { name: 'Analyze', exact: true })).toHaveAttribute(
		'aria-current',
		'page'
	);
	await expect(page.getByRole('button', { name: 'Rod', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await dimension(page, 'Piston + pin mass', 1.1);
	await page.getByRole('button', { name: /Peak compression/ }).click();
	const response = page.waitForResponse((item) => item.url().endsWith('/api/design/rod-analysis'));
	await page.getByRole('button', { name: 'Solve this load case', exact: true }).click();
	expect((await response).status()).toBe(200);
	await expect(page.getByLabel('Solid field color scale')).toBeVisible();
	const original = await exportedCase(page);
	expect(original.structuralAnalysis.analysisHash).toBeTruthy();
	await page.getByRole('button', { name: /^Studies/ }).click();
	const library = page.getByRole('complementary', { name: 'Saved studies', exact: true });
	await library
		.getByRole('textbox', { name: 'Save current study as', exact: true })
		.fill('Compression reference');
	await library.getByRole('button', { name: 'Save study', exact: true }).click();
	await expect(library.getByRole('button', { name: /^Compression reference/ })).toContainText(
		'1 solved case'
	);
	await page.reload();
	await expect(
		page.getByRole('region', { name: 'Parametric design viewport', exact: true })
	).toHaveAttribute('data-scene-ready', 'true', { timeout: 30_000 });
	await expect(page.getByLabel('Solid field color scale')).toHaveCount(0);
	await page.getByRole('button', { name: /^Studies/ }).click();
	await library.getByRole('button', { name: /^Compression reference/ }).click();
	await expect(library).toHaveCount(0);
	await expect(page.getByLabel('Solid field color scale')).toBeVisible();
	await expect(
		page.getByRole('spinbutton', { name: 'Piston + pin mass value', exact: true })
	).toHaveValue('1.1');
	const restored = await exportedCase(page);
	expect(restored.params).toEqual(original.params);
	expect(restored.structuralContext).toEqual(original.structuralContext);
	expect(restored.operating.selectedAngleDeg).toBe(original.operating.selectedAngleDeg);
	expect(restored.structuralAnalysis).toEqual(original.structuralAnalysis);
	expect(solves).toBe(1);
	await dimension(page, 'Piston + pin mass', 1.2);
	await expect(page.getByRole('region', { name: 'Saved solution', exact: true })).toContainText(
		'Outdated'
	);
	await expect(page.getByLabel('Solid field color scale')).toHaveCount(0);
	expect((await exportedCase(page)).structuralAnalysis).toBeNull();
	await page.getByRole('button', { name: 'Restore solved setup', exact: true }).click();
	await expect(page.getByLabel('Solid field color scale')).toBeVisible();
	expect((await exportedCase(page)).structuralAnalysis).toEqual(original.structuralAnalysis);
	expect(solves).toBe(1);
});
