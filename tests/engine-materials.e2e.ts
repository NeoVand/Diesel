import { expect, test, type Page } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { findPart, ready } from './helpers/v12';
import { renderedDifference } from './helpers/rendered-image';

test.setTimeout(90_000);

function captureRenderingErrors(page: Page) {
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	page.on('console', (message) => {
		if (
			/shader error|GL_INVALID|VALIDATE_STATUS|invalid program|WebGL.*(?:error|lost)/i.test(
				message.text()
			)
		)
			errors.push(message.text());
	});
	return errors;
}

test('X-ray changes the rendered view and restores the original exterior finish', async ({
	page
}, testInfo) => {
	const errors = captureRenderingErrors(page);
	await page.setViewportSize({ width: 1280, height: 900 });
	await ready(page);
	await page.waitForTimeout(1700);
	const canvas = page.locator('.engine-canvas canvas');
	const exterior = await canvas.screenshot();
	await page.getByRole('button', { name: 'X-ray', exact: true }).click();
	await page.waitForTimeout(1700);
	const xray = await canvas.screenshot();
	await page.getByRole('button', { name: 'Exterior', exact: true }).click();
	await page.waitForTimeout(1700);
	const restored = await canvas.screenshot();
	for (const [name, image] of [
		['exterior', exterior],
		['xray', xray],
		['restored-exterior', restored]
	] as const) {
		const path = testInfo.outputPath(`${name}.png`);
		await writeFile(path, image);
		await testInfo.attach(name, { path, contentType: 'image/png' });
	}
	const revealed = await renderedDifference(page, exterior, xray);
	const restoration = await renderedDifference(page, exterior, restored);
	expect(revealed.changedFraction).toBeGreaterThan(0.025);
	expect(restoration.changedFraction).toBeLessThan(0.002);
	expect(errors).toEqual([]);
});

test('material shading remains valid through section, isolation, and live atlas previews', async ({
	page
}, testInfo) => {
	const errors = captureRenderingErrors(page);
	await ready(page);
	await page.getByRole('button', { name: 'Section', exact: true }).click();
	await page.getByRole('slider', { name: 'Cutaway position', exact: true }).fill('0.4');
	await page.getByRole('button', { name: 'Flip section', exact: true }).click();
	await page.waitForTimeout(1400);
	await testInfo.attach('section-materials', {
		body: await page.screenshot(),
		contentType: 'image/png'
	});
	await page.getByRole('button', { name: 'Exterior', exact: true }).click();
	await findPart(page, 'v12-0003');
	await page.getByRole('button', { name: 'Isolate', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Show full engine', exact: true })).toBeVisible();
	await page.waitForTimeout(1400);
	await testInfo.attach('isolated-piston-material', {
		body: await page.screenshot(),
		contentType: 'image/png'
	});
	await page.getByRole('button', { name: 'Show full engine', exact: true }).click();
	await page.getByRole('button', { name: 'Component atlas', exact: true }).click();
	const gallery = page.getByRole('region', { name: 'Component family gallery', exact: true });
	await expect(gallery.locator('.preview[data-preview-ready="true"]').first()).toBeVisible();
	await gallery
		.getByRole('textbox', { name: 'Search atlas families', exact: true })
		.fill('engine covers');
	await expect(gallery.locator('.family-card')).toHaveCount(1);
	await expect(gallery.locator('.preview')).toHaveAttribute('data-preview-ready', 'true');
	await page.waitForTimeout(600);
	await testInfo.attach('atlas-cover-materials', {
		body: await page.screenshot(),
		contentType: 'image/png'
	});
	expect(errors).toEqual([]);
});
