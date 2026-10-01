import { expect, test, type Locator, type Page } from '@playwright/test';
import { ready } from './helpers/v12';

type Rect = { x: number; y: number; width: number; height: number };
const overlaps = (a: Rect, b: Rect) =>
	a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
async function bounds(locator: Locator): Promise<Rect> {
	const value = await locator.boundingBox();
	expect(value).not.toBeNull();
	return value!;
}
async function designReady(page: Page, url = '/design') {
	await page.goto(url);
	await expect(page.locator('.viewport')).toHaveAttribute('data-scene-ready', 'true', {
		timeout: 30_000
	});
}
async function clearDesignOverlays(page: Page) {
	const viewport = await bounds(page.locator('.viewport'));
	const canvas = await bounds(page.getByLabel('Interactive parametric 3D design', { exact: true }));
	const tools = await bounds(page.locator('.camera-tools'));
	const heading = await bounds(page.locator('.viewport-heading'));
	const legend = await bounds(page.locator('.field-legend'));
	const controls = await bounds(page.locator('.viewport-bottom'));
	// The WebGL orientation triad uses a96px viewport inset8px from the right.
	const triadBottom = canvas.width < 600 && canvas.height > 450 ? 100 : 60;
	const triad = {
		x: canvas.x + canvas.width - 104,
		y: canvas.y + canvas.height - triadBottom - 96,
		width: 96,
		height: 96
	};
	expect(tools.y - viewport.y).toBeGreaterThanOrEqual(8);
	expect(tools.y - viewport.y).toBeLessThanOrEqual(16);
	expect(viewport.x + viewport.width - tools.x - tools.width).toBeGreaterThanOrEqual(8);
	expect(viewport.x + viewport.width - tools.x - tools.width).toBeLessThanOrEqual(16);
	expect(overlaps(tools, heading), 'Camera commands stay separate from the heading').toBe(false);
	expect(overlaps(legend, triad), 'Field scale leaves the rendered coordinate triad visible').toBe(
		false
	);
	expect(
		overlaps(legend, controls),
		'Field scale and material/field controls do not cover one another'
	).toBe(false);
	expect(legend.x).toBeGreaterThanOrEqual(viewport.x);
	expect(legend.x + legend.width).toBeLessThanOrEqual(viewport.x + viewport.width);
}

for (const workspace of ['design', 'analyze'] as const) {
	test(`${workspace} opens in Split even after an older Results preference`, async ({ page }) => {
		await page.addInitScript(() => {
			localStorage.setItem('engine-lab-design-layout', 'results');
		});
		await designReady(page, workspace === 'analyze' ? '/design?workspace=analyze' : '/design');
		await expect(page.getByRole('button', { name: 'Split layout', exact: true })).toHaveAttribute(
			'aria-pressed',
			'true'
		);
		await expect(
			page.getByLabel('Interactive parametric 3D design', { exact: true })
		).toBeVisible();
		await expect(page).toHaveTitle(
			`${workspace === 'analyze' ? 'Analyze' : 'Design'} — V12 Diesel Engine Lab`
		);
		// An explicit layout is honored within the visit, including the active workspace link.
		await page.getByRole('button', { name: 'Results layout', exact: true }).click();
		await page
			.getByRole('navigation', { name: 'Workspaces' })
			.getByRole('link', {
				name: workspace === 'analyze' ? 'Analyze' : 'Design',
				exact: true
			})
			.click();
		await expect(page.getByRole('button', { name: 'Results layout', exact: true })).toHaveAttribute(
			'aria-pressed',
			'true'
		);
		await page.reload();
		await expect(page.getByRole('button', { name: 'Split layout', exact: true })).toHaveAttribute(
			'aria-pressed',
			'true'
		);
		await expect(
			page.getByLabel('Interactive parametric 3D design', { exact: true })
		).toBeVisible();
	});
}

test('entering Design or Analyze restores Split without hiding the 3D view', async ({ page }) => {
	await designReady(page);
	for (const destination of ['Analyze', 'Design']) {
		await page.getByRole('button', { name: 'Results layout', exact: true }).click();
		await page
			.getByRole('navigation', { name: 'Workspaces' })
			.getByRole('link', {
				name: destination,
				exact: true
			})
			.click();
		await expect(page.getByRole('button', { name: 'Split layout', exact: true })).toHaveAttribute(
			'aria-pressed',
			'true'
		);
		await expect(
			page.getByLabel('Interactive parametric 3D design', { exact: true })
		).toBeVisible();
	}
});

test('explorer commands float over a full-width canvas with labels on hover and keyboard focus', async ({
	page
}) => {
	await page.setViewportSize({ width: 1512, height: 960 });
	await ready(page);
	await expect(page).toHaveTitle('V12 Diesel Engine — Engine Lab');
	await expect(page.getByRole('heading', { name: 'V12 diesel engine', exact: true })).toBeVisible();
	for (const size of [
		{ width: 1512, height: 960 },
		{ width: 390, height: 844 }
	]) {
		await page.setViewportSize(size);
		await page.mouse.move(size.width - 4, 55);
		const canvas = await bounds(page.locator('.engine-canvas canvas'));
		const dock = await bounds(page.locator('.workspace-rail'));
		expect(canvas.x).toBe(0);
		expect(canvas.width).toBe(size.width);
		expect(dock.x).toBe(12);
		expect(dock.width).toBeLessThanOrEqual(46);
		expect(dock.height).toBeLessThan(450);
		expect(dock.y).toBeGreaterThan(100);
		expect(dock.y + dock.height).toBeLessThan(size.height - 150);
		const exterior = page.getByRole('button', { name: 'Exterior', exact: true });
		await expect(exterior.locator('span')).toBeHidden();
		await exterior.hover();
		await expect(exterior.locator('span')).toBeVisible();
		await exterior.focus();
		await page.keyboard.press('Tab');
		const section = page.getByRole('button', { name: 'Section', exact: true });
		await expect(section).toBeFocused();
		await expect(section.locator('span')).toBeVisible();
		await page.mouse.click(size.width - 5, 55);
	}
});

test('design orientation and analytical field scales stay clear in Model, Split, and baseline comparison', async ({
	page
}) => {
	await designReady(page);
	await page.getByRole('button', { name: 'Show baseline outline', exact: true }).click();
	for (const size of [
		{ width: 1512, height: 960 },
		{ width: 1280, height: 800 },
		{ width: 768, height: 1024 },
		{ width: 390, height: 844 }
	]) {
		await page.setViewportSize(size);
		for (const layout of ['Model', 'Split']) {
			await page.getByRole('button', { name: `${layout} layout`, exact: true }).click();
			for (const field of ['Shank stress', 'Deflection']) {
				await page.getByRole('button', { name: field, exact: true }).click();
				await expect(page.getByLabel('Field color scale', { exact: true })).toBeVisible();
				await clearDesignOverlays(page);
			}
		}
	}
});

test('native solid field legends clear the triad and controls on desktop and mobile', async ({
	page
}) => {
	test.setTimeout(90_000);
	await designReady(page, '/design?workspace=analyze');
	await page.getByRole('button', { name: /Peak compression/ }).click();
	const response = page.waitForResponse((r) => r.url().endsWith('/api/design/rod-analysis'));
	await page.getByRole('button', { name: 'Solve this load case', exact: true }).click();
	expect((await response).status()).toBe(200);
	await expect(page.getByLabel('Solid field color scale', { exact: true })).toBeVisible();
	for (const size of [
		{ width: 1512, height: 960 },
		{ width: 1280, height: 800 },
		{ width: 390, height: 844 }
	]) {
		await page.setViewportSize(size);
		for (const field of ['Solid stress', 'Displacement']) {
			await page.getByRole('button', { name: field, exact: true }).click();
			await clearDesignOverlays(page);
		}
	}
});
