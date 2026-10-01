import { expect, test, type Page } from '@playwright/test';
import { findPart, ready } from './helpers/v12';

test.setTimeout(90_000);
type Diagnostics = {
	phase: number;
	driveAngle: number;
	motion: {
		boundMatrices: number;
		inventory: { rigid: number; deforming: number; unresolved: string[] };
		timing: { maximumHingeGapMm: number };
	};
	selected: string | null;
	transitioning: boolean;
	autoOrbit: boolean;
	autoOrbitActive: boolean;
	camera: { position: number[]; target: number[] };
	processes: {
		phase: number;
		visible: boolean;
		cylinders: number;
		intake: { paths: number; activeParticles: number };
		exhaust: {
			paths: number;
			activeParticles: number;
			outlet: { activeVolumes: number; opaqueDepth: boolean };
		};
		combustionGlow: { activeLights: number; fixedLightCount: number };
		liquidParcels: number;
		activeVolumes: number;
		channels: string[];
		connections: {
			air: { routes: number; visible: boolean };
			fuel: { routes: number; visible: boolean };
			exhaust: { routes: number; visible: boolean };
		};
	};
	processContext: { id: string; role: string; opacity: number }[];
	pixelRatio: number;
	maximumPixelRatio: number;
};
const diagnostics = (page: Page) =>
	page.evaluate(() =>
		(window as unknown as { __engineDiagnostics: () => Diagnostics }).__engineDiagnostics()
	);
async function viewMenu(page: Page) {
	const menu = page.locator('details.view-menu');
	if ((await menu.getAttribute('open')) === null) await menu.locator('summary').click();
	return menu;
}

test.describe('High-density process inspection', () => {
	test.use({ deviceScaleFactor: 2 });
	test('mechanism flow retains native passage context and clears it with the channels', async ({
		page
	}) => {
		await ready(page);
		await page.getByRole('button', { name: 'Mechanism', exact: true }).click();
		await page.locator('.process-control summary').click();
		await page.getByRole('button', { name: 'Show all', exact: true }).click();
		await page.locator('.process-control summary').click();
		await expect(page.getByLabel('Flow path legend', { exact: true })).toBeVisible();
		await expect
			.poll(async () => (await diagnostics(page)).processes.connections.fuel.routes)
			.toBe(14);
		await expect
			.poll(async () => page.locator('.flow-boundary-label:visible').count())
			.toBeGreaterThan(0);
		await page.getByLabel('Flow path legend', { exact: true }).click();
		await page.getByRole('button', { name: 'Trace fuel in only', exact: true }).click();
		await expect.poll(async () => (await diagnostics(page)).processes.channels).toEqual(['fuel']);
		await expect(page.locator('[data-flow-boundary="air"]')).toBeHidden();
		await page.getByLabel('Flow path legend', { exact: true }).click();
		await page.locator('.process-control summary').click();
		await page.getByRole('button', { name: 'Show all', exact: true }).click();
		await page.locator('.process-control summary').click();
		await expect
			.poll(async () => {
				const context = (await diagnostics(page)).processContext;
				return ['v12-0777', 'v12-0768', 'v12-0769'].every((id) =>
					context.some((p) => p.id === id && p.opacity > 0.1 && p.opacity < 0.5)
				);
			})
			.toBe(true);
		await page.getByRole('button', { name: 'Run engine', exact: true }).click();
		await expect.poll(async () => (await diagnostics(page)).phase).toBeGreaterThan(100);
		await page.getByRole('button', { name: 'Pause engine', exact: true }).click();
		await expect
			.poll(async () => {
				const state = await diagnostics(page);
				return state.pixelRatio === state.maximumPixelRatio;
			})
			.toBe(true);
		await page.locator('.process-control summary').click();
		await page.getByRole('button', { name: 'Hide all', exact: true }).click();
		await expect.poll(async () => (await diagnostics(page)).processContext.length).toBe(0);
		await expect.poll(async () => (await diagnostics(page)).processes.visible).toBe(false);
		await expect
			.poll(async () => (await diagnostics(page)).processes.combustionGlow.activeLights)
			.toBe(0);
	});
});

function direction(state: Diagnostics) {
	const d = state.camera.position.map((value, index) => value - state.camera.target[index]);
	const length = Math.hypot(...d);
	return d.map((value) => value / length);
}

test('cycle overlays follow run, pause and seek, and suppress disconnected presentations', async ({
	page
}, testInfo) => {
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	page.on('console', (message) => {
		if (/shader error|GL_INVALID|VALIDATE_STATUS|invalid program/i.test(message.text()))
			errors.push(message.text());
	});
	await ready(page);
	await page.getByRole('button', { name: 'X-ray', exact: true }).click();
	await page.locator('.process-control summary').click();
	await page
		.locator('.process-menu')
		.getByRole('button', { name: 'Show all', exact: true })
		.click();
	await expect.poll(async () => (await diagnostics(page)).processes?.visible).toBe(true);
	const process = (await diagnostics(page)).processes;
	expect(process.cylinders).toBe(12);
	expect(process.intake.paths).toBeGreaterThan(0);
	expect(process.exhaust.paths).toBe(384);
	const motion = (await diagnostics(page)).motion;
	expect(motion.inventory).toMatchObject({ rigid: 466, deforming: 336, unresolved: [] });
	// 466 moving source bodies plus six corrected fixed guides and their22 fixed screws.
	expect(motion.boundMatrices).toBe(494);
	expect(motion.timing.maximumHingeGapMm).toBeLessThan(1e-7);
	expect(process.channels).toEqual(
		expect.arrayContaining(['air', 'fuel', 'combustion', 'exhaust'])
	);
	await page.locator('.process-control summary').click();
	await page.getByRole('slider', { name: 'Crank angle', exact: true }).fill('185');
	await expect
		.poll(async () => (await diagnostics(page)).processes.liquidParcels)
		.toBeGreaterThan(0);
	await expect
		.poll(async () => (await diagnostics(page)).processes.activeVolumes)
		.toBeGreaterThan(0);
	await expect
		.poll(async () => (await diagnostics(page)).processes.exhaust.activeParticles)
		.toBeGreaterThan(0);
	await page.getByRole('slider', { name: 'Crank angle', exact: true }).fill('310');
	await expect
		.poll(async () => (await diagnostics(page)).processes.combustionGlow.activeLights)
		.toBeGreaterThan(0);
	await expect
		.poll(async () => (await diagnostics(page)).processes.exhaust.outlet.opaqueDepth)
		.toBe(true);
	await expect
		.poll(async () => (await diagnostics(page)).processes.exhaust.outlet.activeVolumes)
		.toBe(2);
	await expect.poll(async () => (await diagnostics(page)).processes.phase).toBe(310);
	await expect.poll(async () => (await diagnostics(page)).transitioning).toBe(false);
	await testInfo.attach('cycle-overlays-xray', {
		body: await page.screenshot(),
		contentType: 'image/png'
	});
	await page.getByRole('slider', { name: 'Crank angle', exact: true }).fill('719');
	await page.getByRole('button', { name: 'Run engine', exact: true }).click();
	await expect.poll(async () => (await diagnostics(page)).driveAngle).toBeGreaterThan(725);
	expect((await diagnostics(page)).processes.phase).toBeLessThan(100);
	expect((await diagnostics(page)).motion.timing.maximumHingeGapMm).toBeLessThan(1e-7);
	await page.getByRole('button', { name: 'Pause engine', exact: true }).click();
	const paused = await diagnostics(page);
	expect(paused.processes.phase).toBe(paused.phase);
	await page.waitForTimeout(250);
	expect((await diagnostics(page)).processes.phase).toBe(paused.phase);
	// Opening the study must retain an explicitly framed cylinder, not refit the full engine.
	await page.locator('.process-control summary').click();
	await page.getByRole('button', { name: 'Inspect this cylinder', exact: true }).click();
	await expect.poll(async () => (await diagnostics(page)).transitioning).toBe(false);
	await expect(page.locator('.flow-boundary-label:visible')).toHaveCount(0);
	const focused = (await diagnostics(page)).camera;
	// A cylinder study uses an outward bank view instead of flying down the cylinder row.
	expect(direction(await diagnostics(page))[2]).toBeGreaterThan(0.6);
	const distance = (camera: Diagnostics['camera']) =>
		Math.hypot(...camera.position.map((v, i) => v - camera.target[i]));
	await page.getByRole('button', { name: 'Engine analysis', exact: true }).click();
	await expect.poll(async () => (await diagnostics(page)).transitioning).toBe(false);
	const inspected = (await diagnostics(page)).camera;
	expect(distance(inspected)).toBeLessThan(distance(focused) * 2);
	expect(Math.hypot(...inspected.target.map((v, i) => v - focused.target[i]))).toBeLessThan(
		distance(focused) * 0.2
	);
	await page.getByRole('button', { name: 'Close inspector', exact: true }).click();
	await findPart(page, 'v12-0003');
	await page.getByRole('button', { name: 'Isolate', exact: true }).click();
	await expect.poll(async () => (await diagnostics(page)).processes.visible).toBe(false);
	await page.getByRole('button', { name: 'Show full engine', exact: true }).click();
	await expect.poll(async () => (await diagnostics(page)).processes.visible).toBe(true);
	await page.getByRole('button', { name: 'Explode assembly', exact: true }).click();
	await expect.poll(async () => (await diagnostics(page)).processes.visible).toBe(false);
	await page.getByRole('slider', { name: 'Assembly separation', exact: true }).fill('0');
	await expect.poll(async () => (await diagnostics(page)).processes.visible).toBe(true);
	await page.getByRole('button', { name: 'Component atlas', exact: true }).click();
	await expect.poll(async () => (await diagnostics(page)).processes.visible).toBe(false);
	expect(errors).toEqual([]);
});

test('orbit is optional, perspective restores a canonical view, and blank clicks clear selection', async ({
	page
}) => {
	await ready(page);
	await expect(
		page.getByRole('link', { name: 'Source repository on GitHub', exact: true })
	).toHaveAttribute('href', 'https://github.com/NeoVand/Diesel');
	await (await viewMenu(page)).getByRole('button', { name: 'Side view', exact: true }).click();
	await expect.poll(async () => (await diagnostics(page)).transitioning).toBe(false);
	await (
		await viewMenu(page)
	)
		.getByRole('button', { name: 'Perspective view', exact: true })
		.click();
	await expect.poll(async () => (await diagnostics(page)).transitioning).toBe(false);
	const canonical = direction(await diagnostics(page));
	expect(canonical.every((axis) => axis > 0.2)).toBe(true);
	await (await viewMenu(page)).getByRole('checkbox', { name: 'Auto orbit', exact: true }).check();
	await expect.poll(async () => (await diagnostics(page)).autoOrbit).toBe(true);
	const initial = (await diagnostics(page)).camera.position;
	await expect
		.poll(async () =>
			Math.hypot(
				...(await diagnostics(page)).camera.position.map((value, index) => value - initial[index])
			)
		)
		.toBeGreaterThan(0.08);
	await page.getByRole('checkbox', { name: 'Auto orbit', exact: true }).uncheck();
	await expect.poll(async () => (await diagnostics(page)).autoOrbitActive).toBe(false);
	await (
		await viewMenu(page)
	)
		.getByRole('button', { name: 'Perspective view', exact: true })
		.click();
	await expect.poll(async () => (await diagnostics(page)).transitioning).toBe(false);
	direction(await diagnostics(page)).forEach((axis, index) =>
		expect(axis).toBeCloseTo(canonical[index], 4)
	);
	await findPart(page, 'v12-0003');
	await expect.poll(async () => (await diagnostics(page)).selected).toBe('v12-0003');
	const canvas = (await page.locator('.engine-canvas canvas').boundingBox())!;
	// Keep the gesture on the viewport: the floating view toolbar occupies the left 60px.
	const blank = { x: canvas.x + 110, y: canvas.y + 185 };
	expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName, blank)).toBe(
		'CANVAS'
	);
	await page.mouse.move(blank.x, blank.y);
	await page.mouse.down();
	await page.mouse.move(blank.x + 90, blank.y + 35, { steps: 8 });
	await page.mouse.move(blank.x, blank.y, { steps: 8 });
	await page.mouse.up();
	expect((await diagnostics(page)).selected).toBe('v12-0003');
	await page.mouse.click(blank.x, blank.y);
	await expect.poll(async () => (await diagnostics(page)).selected).toBeNull();
});
