import { expect, test } from '@playwright/test';
import { ready } from './helpers/v12';

test('cylinder study follows selection and crank angle, survives inspection views and exports SI data', async ({
	page
}) => {
	test.setTimeout(120_000);
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await ready(page);
	await page.getByRole('button', { name: 'Engine analysis', exact: true }).click();
	await page.getByRole('button', { name: 'Cylinder cycle', exact: true }).click();
	const study = page.getByRole('region', { name: 'Cylinder cycle analysis', exact: true });
	await expect(study).toContainText('1,800 rpm');
	await expect(study).toContainText('bar IMEP');
	await expect(study).toContainText('no calibrated engine-performance claim');
	await page.getByRole('button', { name: 'Cycle Piston 0014 · bank A', exact: true }).click();
	await page.getByRole('slider', { name: 'Crank angle', exact: true }).fill('190');
	await expect(study.locator('.phase-heading')).toContainText('Expansion');
	await expect(study.locator('.phase-heading')).toContainText('19.7°');
	await expect(study.locator('.metrics').first()).toContainText('38.90');
	await page.getByRole('button', { name: 'Mechanism', exact: true }).click();
	await expect(study).toBeVisible();
	await expect(
		page.getByRole('button', { name: 'Cycle Piston 0014 · bank A', exact: true })
	).toHaveAttribute('aria-pressed', 'true');
	await page.getByRole('button', { name: 'Run engine', exact: true }).click();
	await expect(study.locator('.phase-heading')).not.toContainText('19.7°');
	await page.getByRole('button', { name: 'Pause engine', exact: true }).click();
	const frozen = await study.locator('.metrics').innerText();
	await page.waitForTimeout(300);
	expect(await study.locator('.metrics').innerText()).toBe(frozen);
	await page.getByRole('button', { name: 'X-ray', exact: true }).click();
	await expect(study).toBeVisible();
	await study.locator('summary').filter({ hasText: 'Numerical verification' }).click();
	await expect(study).toContainText('Converged');
	await study.locator('summary').filter({ hasText: 'Case assumptions' }).click();
	await expect(study).toContainText('16:1');
	const [download] = await Promise.all([
		page.waitForEvent('download'),
		study.getByRole('button', { name: 'Export cycle data CSV · SI units' }).click()
	]);
	expect(download.suggestedFilename()).toMatch(/air-standard.*\.csv$/);
	const stream = await download.createReadStream();
	const chunks: Buffer[] = [];
	for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
	const csv = Buffer.concat(chunks).toString('utf8');
	expect(csv.split('\n')).toHaveLength(1442);
	expect(csv.split('\n')[0]).toContain('pressurePa,volumeM3,temperatureK,massKg');
	expect(csv).not.toMatch(/NaN|undefined|Infinity/);
	for (const width of [1512, 390]) {
		await page.setViewportSize({ width, height: 982 });
		const overflow = await page
			.locator('.panel-tabs')
			.evaluate((el) => el.scrollWidth - el.clientWidth);
		expect(overflow).toBeLessThanOrEqual(1);
		await expect(
			page.getByRole('button', { name: 'Close inspector', exact: true })
		).toBeInViewport();
		await expect(
			page.getByRole('button', { name: 'Close inspector', exact: true }).locator('svg')
		).toBeVisible();
	}
	expect(errors).toEqual([]);
});
