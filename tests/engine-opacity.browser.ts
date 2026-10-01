import { expect, test, type Page } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { ready } from './helpers/v12';
import { renderedDifference } from './helpers/rendered-image';

test.setTimeout(90_000);

type Diagnostics = {
	casingOpacity: number;
	casingShadowCoverage: number;
	camera: { position: number[]; target: number[]; zoom: number };
};

function diagnostics(page: Page): Promise<Diagnostics> {
	return page.evaluate(() =>
		(window as unknown as { __engineDiagnostics: () => Diagnostics }).__engineDiagnostics()
	);
}

test('X-ray depth and shadow handoff stays continuous at the actual opacity threshold in both directions', async ({
	page
}, testInfo) => {
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.setViewportSize({ width: 1280, height: 900 });
	await ready(page);
	await expect.poll(async () => (await diagnostics(page)).casingOpacity).toBe(1);
	await page.waitForTimeout(1500);
	const bounds = await page.locator('.engine-canvas canvas').boundingBox();
	expect(bounds).not.toBeNull();
	const capture = () => page.screenshot({ clip: bounds! });
	await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
	await page.clock.pauseAt(new Date('2026-01-01T00:00:01Z'));

	for (const mode of ['X-ray', 'Exterior'] as const) {
		await page.getByRole('button', { name: mode, exact: true }).click();
		if (mode === 'Exterior') await page.clock.runFor(950);
		let before: { state: Diagnostics; image: Buffer } | null = null;
		let after: { state: Diagnostics; image: Buffer } | null = null;
		for (let step = 0; step < 50; step++) {
			const state = await diagnostics(page);
			const crossed =
				mode === 'Exterior' ? state.casingOpacity >= 0.999 : state.casingOpacity < 0.999;
			if (crossed && before) {
				after = { state, image: await capture() };
				break;
			}
			if (!crossed && Math.abs(state.casingOpacity - 0.999) < 0.002)
				before = { state, image: await capture() };
			await page.clock.runFor(8);
		}
		expect(before, `${mode}: captured immediately before opacity handoff`).not.toBeNull();
		expect(after, `${mode}: captured immediately after opacity handoff`).not.toBeNull();
		expect(Math.abs(after!.state.casingOpacity - before!.state.casingOpacity)).toBeLessThan(0.002);
		expect(after!.state.camera).toEqual(before!.state.camera);
		const delta = await renderedDifference(page, before!.image, after!.image);
		const evidence = { before: before!.state, after: after!.state, delta };
		await writeFile(testInfo.outputPath(`${mode}-handoff.json`), JSON.stringify(evidence, null, 2));
		for (const [name, sample] of [
			['before', before!],
			['after', after!]
		] as const) {
			const path = testInfo.outputPath(`${mode}-${name}.png`);
			await writeFile(path, sample.image);
			await testInfo.attach(`${mode}-${name}`, { path, contentType: 'image/png' });
		}
		// The old depth-write/queue handoff changed over16% of the image across this tiny interval.
		expect(delta.changedFraction).toBeLessThan(0.005);
		expect(delta.mean).toBeLessThan(0.15);
		await page.clock.runFor(1500);
		await expect
			.poll(async () => (await diagnostics(page)).casingOpacity)
			.toBe(mode === 'X-ray' ? 0.12 : 1);
	}
	expect(errors).toEqual([]);
});
