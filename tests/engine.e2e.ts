import { test, expect } from '@playwright/test';
import {
	connectPlaceholder,
	findPart,
	placeholderKey,
	ready,
	silentWav,
	welcomeKey
} from './helpers/v12';

test.setTimeout(120_000);
test.beforeEach(async ({ page }) => {
	// Never spend a provider request from this regression suite.
	await page.route('**/api/agent', (route) =>
		route.fulfill({ status: 503, json: { error: 'No inference configured in this offline test.' } })
	);
	await page.route('**/api/narrate', (route) =>
		route.fulfill({ status: 503, json: { error: 'No audio configured in this offline test.' } })
	);
});

test('opens the source V12 without a permanent component list or inherited performance claims', async ({
	page
}) => {
	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(e.message));
	await ready(page);
	await expect(page.getByRole('heading', { name: 'V12 diesel engine', exact: true })).toBeVisible();
	await expect(page.locator('.inspector')).toHaveCount(0);
	await expect(page.locator('.component-search')).toHaveCount(0);
	await expect(
		page.getByRole('region', { name: 'Inspection controls', exact: true })
	).toContainText('6.81 L');
	await expect(page.locator('body')).not.toContainText('1800 RPM');
	await expect(page.locator('body')).not.toContainText('Caterpillar');
	expect(errors).toEqual([]);
});

test('searches the highest source identity and restores isolated and lifted parts', async ({
	page
}) => {
	await ready(page);
	await findPart(page, 'v12-1253');
	await expect(page.locator('.inspector .eyebrow')).toContainText('v12-1253');
	await page.getByRole('button', { name: 'Isolate', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Show full engine', exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Lift out', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Return', exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Return', exact: true }).click();
	await page.getByRole('button', { name: 'Show all', exact: true }).click();
	await page.getByRole('button', { name: 'Restore engine', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Show full engine', exact: true })).toHaveCount(0);
});

test('separation remains available at zero and reverses repeatedly', async ({ page }) => {
	await ready(page);
	await page.getByRole('button', { name: 'Explode assembly', exact: true }).click();
	const separation = page.getByRole('slider', { name: 'Assembly separation', exact: true });
	for (const amount of ['1', '0', '0.6', '0', '1', '0']) {
		await separation.fill(amount);
		await expect(separation).toHaveValue(amount);
		await expect(separation).toBeVisible();
	}
	await separation.focus();
	await page.keyboard.press('End');
	await expect(separation).toHaveValue('1');
	await page.keyboard.press('Home');
	await expect(separation).toHaveValue('0');
});

test('separation moves the rendered assembly while the pointer is still dragging', async ({
	page
}) => {
	await ready(page);
	await page.getByRole('button', { name: 'Explode assembly', exact: true }).click();
	const separation = page.getByRole('slider', { name: 'Assembly separation', exact: true });
	await separation.fill('0');
	const canvas = page.locator('.engine-canvas canvas');
	// Let the initial camera and assembly return settle before testing continuous retargeting.
	await page.waitForTimeout(2200);
	const before = await canvas.screenshot();
	const bounds = await separation.boundingBox();
	expect(bounds).not.toBeNull();
	const box = bounds!;
	await separation.evaluate((node) => {
		node.dataset.inputCount = '0';
		node.dataset.changeCount = '0';
		node.addEventListener('input', () => {
			node.dataset.inputCount = String(Number(node.dataset.inputCount) + 1);
		});
		node.addEventListener('change', () => {
			node.dataset.changeCount = String(Number(node.dataset.changeCount) + 1);
		});
	});
	await page.mouse.move(box.x + 7, box.y + box.height / 2);
	await page.mouse.down();
	try {
		for (const fraction of [0.08, 0.16, 0.24, 0.32, 0.4, 0.48]) {
			await page.mouse.move(box.x + 7 + (box.width - 14) * fraction, box.y + box.height / 2);
			await page.waitForTimeout(35);
		}
		const during = await canvas.screenshot();
		expect(Number(await separation.getAttribute('data-input-count'))).toBeGreaterThanOrEqual(5);
		await expect(separation).toHaveAttribute('data-change-count', '0');
		expect(Number(await separation.inputValue())).toBeGreaterThan(0.4);
		const changedFraction = await page.evaluate(
			async ([before, after]) => {
				async function pixels(base64: string) {
					const image = new Image();
					image.src = `data:image/png;base64,${base64}`;
					await image.decode();
					const buffer = document.createElement('canvas');
					buffer.width = image.width;
					buffer.height = image.height;
					const context = buffer.getContext('2d')!;
					context.drawImage(image, 0, 0);
					return context.getImageData(0, 0, image.width, image.height).data;
				}
				const [a, b] = await Promise.all([pixels(before), pixels(after)]);
				let changed = 0;
				for (let index = 0; index < a.length; index += 4) {
					if (
						Math.abs(a[index] - b[index]) +
							Math.abs(a[index + 1] - b[index + 1]) +
							Math.abs(a[index + 2] - b[index + 2]) >
						36
					)
						changed++;
				}
				return changed / (a.length / 4);
			},
			[before.toString('base64'), during.toString('base64')]
		);
		// The 3D scene must visibly respond before a pointer-up/change event occurs.
		expect(changedFraction).toBeGreaterThan(0.025);
	} finally {
		await page.mouse.up();
	}
	await expect(separation).toHaveAttribute('data-change-count', '1');
});

test('reveals named anatomy while preserving the complete searchable catalog', async ({ page }) => {
	await ready(page);
	await page.getByRole('button', { name: 'Mechanism', exact: true }).click();
	for (const layer of ['Covers removed', 'Rotating assembly', 'Valve train']) {
		const button = page.getByRole('button', { name: layer, exact: true });
		await button.click();
		await expect(button).toHaveAttribute('aria-pressed', 'true');
	}
	await page.getByRole('button', { name: 'Exterior', exact: true }).click();
	await expect(page.locator('.control-deck select')).toHaveCount(0);
	await page.getByRole('button', { name: 'Search components', exact: true }).click();
	await expect(page.locator('.search-foot')).toContainText('1,229 mechanical bodies');
	await expect(page.locator('.search-foot')).toContainText('24 lettering bodies excluded');
	await page.getByRole('textbox', { name: 'Search parts', exact: true }).fill('v12-0003');
	await expect(page.locator('.search-result')).toHaveCount(1);
});

test('whole-engine section retains axis, guide, flip and oblique-plane controls', async ({
	page
}) => {
	await ready(page);
	await page.getByRole('button', { name: 'Section', exact: true }).click();
	const cut = page.getByRole('slider', { name: 'Cutaway position', exact: true });
	for (const axis of ['X', 'Y', 'Z']) {
		await page.getByRole('button', { name: `Cut on ${axis} axis`, exact: true }).click();
		await expect(
			page.getByRole('button', { name: `Cut on ${axis} axis`, exact: true })
		).toHaveAttribute('aria-pressed', 'true');
	}
	for (const amount of ['0', '1', '0.4']) {
		await cut.fill(amount);
		await expect(cut).toHaveValue(amount);
	}
	await page.getByRole('button', { name: 'Flip section', exact: true }).click();
	await page.locator('.plane-angle summary').click();
	await page.getByRole('button', { name: 'Show section guide', exact: true }).click();
	await expect(
		page.getByRole('button', { name: 'Show section guide', exact: true })
	).toHaveAttribute('aria-pressed', 'false');
	await page.getByRole('slider', { name: 'Section pitch', exact: true }).fill('25');
	await page.getByRole('slider', { name: 'Section yaw', exact: true }).fill('-40');
	await expect(page.getByRole('slider', { name: 'Section pitch', exact: true })).toHaveValue('25');
	await expect(page.getByRole('slider', { name: 'Section yaw', exact: true })).toHaveValue('-40');
	const offset = page.getByRole('spinbutton', {
		name: 'Section offset in millimetres',
		exact: true
	});
	await offset.fill('0');
	await offset.press('Tab');
	await expect(cut).toHaveValue('0.5');
	await expect(offset).toHaveValue('0');
	await expect(page.locator('.engine-canvas canvas')).toBeVisible();
});

test('measured mechanism advances, pauses and seeks without inventing rated rpm', async ({
	page
}) => {
	await ready(page);
	await page.getByRole('button', { name: 'Run engine', exact: true }).click();
	const angle = page.getByRole('slider', { name: 'Crank angle', exact: true });
	const initial = await angle.inputValue();
	await expect.poll(() => angle.inputValue()).not.toBe(initial);
	await page.getByRole('button', { name: 'Pause engine', exact: true }).click();
	await angle.fill('137');
	await expect(angle).toHaveValue('137');
	await page.getByRole('button', { name: 'Advance crank by 30 degrees', exact: true }).click();
	await expect(angle).toHaveValue('167');
	await page.locator('.speed-menu summary').click();
	await page.getByRole('button', { name: /^90°\/s/ }).click();
	await expect(page.locator('.speed-menu summary')).toHaveText('90°/s');
	await expect(page.locator('.transport')).toContainText('Geometric playback');
	await expect(page.locator('.transport')).not.toContainText('1800 rpm');
});

test('Run preserves the exterior and continues through explicitly chosen inspection views', async ({
	page
}) => {
	await ready(page);
	const angle = page.getByRole('slider', { name: 'Crank angle', exact: true });
	await page.getByRole('button', { name: 'Run engine', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Exterior', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await expect(page.getByRole('heading', { name: 'V12 diesel engine', exact: true })).toBeVisible();
	const startedAt = await angle.inputValue();
	await expect.poll(() => angle.inputValue()).not.toBe(startedAt);
	for (const view of ['X-ray', 'Section', 'Mechanism', 'Exterior']) {
		await page.getByRole('button', { name: view, exact: true }).click();
		await expect(page.getByRole('button', { name: view, exact: true })).toHaveAttribute(
			'aria-pressed',
			'true'
		);
		await expect(page.getByRole('button', { name: 'Pause engine', exact: true })).toBeVisible();
		const previousAngle = await angle.inputValue();
		await expect.poll(() => angle.inputValue()).not.toBe(previousAngle);
	}
	await page.getByRole('button', { name: 'Pause engine', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Exterior', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
});

test('the persistent control deck explains why detached parts cannot run', async ({ page }) => {
	await ready(page);
	await page.getByRole('button', { name: 'Explode assembly', exact: true }).click();
	const deck = page.getByRole('region', { name: 'Inspection controls', exact: true });
	await expect(deck).toHaveCount(1);
	await expect(
		deck.getByRole('slider', { name: 'Assembly separation', exact: true })
	).toBeVisible();
	await expect(deck.getByRole('button', { name: 'Run engine', exact: true })).toBeDisabled();
	await expect(deck.locator('.playback-reason')).toBeVisible();
	await deck.getByRole('button', { name: 'Reassemble', exact: true }).click();
	await expect(deck.getByRole('slider', { name: 'Assembly separation', exact: true })).toHaveValue(
		'0'
	);
	await expect(deck.getByRole('button', { name: 'Run engine', exact: true })).toBeEnabled();
	await page.getByRole('button', { name: 'Arrange parts', exact: true }).click();
	await expect(deck).toHaveCount(1);
	await expect(deck.getByRole('button', { name: 'Run engine', exact: true })).toHaveCount(0);
	await expect(deck.locator('.playback-reason')).toBeVisible();
	await expect(deck.getByRole('button', { name: 'Return to engine', exact: true })).toBeVisible();
});

test('kinematic analysis follows the crank, names its source piston and states its limits', async ({
	page
}) => {
	await ready(page);
	await page.getByRole('button', { name: 'Engine analysis', exact: true }).click();
	const analysis = page.getByRole('region', { name: 'Measured kinematic analysis', exact: true });
	await expect(
		analysis.getByRole('heading', { name: 'Piston kinematics', exact: true })
	).toBeVisible();
	await expect(analysis.locator('.bank-pistons button')).toHaveCount(12);
	await analysis.getByRole('button', { name: /^Piston 0003/ }).click();
	await expect(analysis.locator('.picker-heading code')).toHaveText('v12-0003');
	const angle = page.getByRole('slider', { name: 'Crank angle', exact: true });
	await angle.fill('0');
	await expect(analysis.locator('figcaption b')).toHaveText('0°');
	const startTravel = await analysis.locator('.metrics strong').first().innerText();
	await angle.fill('90');
	await expect(analysis.locator('figcaption b')).toHaveText('90°');
	await expect(analysis.locator('.metrics strong').first()).not.toHaveText(startTravel);
	await angle.fill('360');
	await expect(analysis.locator('figcaption b')).toHaveText('0°');
	await expect(analysis.locator('.metrics strong').first()).toHaveText(startTravel);
	await expect(analysis.getByRole('img')).toHaveAccessibleName(
		/Piston displacement over one crank revolution/
	);
	await expect(analysis.locator('.qualification')).toContainText(
		'No loads, bearing clearance, combustion, torque or power model'
	);
	await expect(page.getByRole('button', { name: 'Exterior', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
});

test('3D arrangement stays separate from the component catalog and restores the previous cut and phase', async ({
	page
}) => {
	await ready(page);
	await page.getByRole('button', { name: 'Section', exact: true }).click();
	await page.getByRole('slider', { name: 'Crank angle', exact: true }).fill('137');
	await page.getByRole('slider', { name: 'Cutaway position', exact: true }).fill('0.35');
	await page.getByRole('button', { name: 'Arrange parts', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Parts arrangement', exact: true })).toBeVisible();
	const gallery = page.getByRole('region', { name: 'Component family gallery', exact: true });
	await expect(gallery).toHaveCount(0);
	// Allow the layout transition to finish.
	// A completed layout must never replace the user's 3D view with a timed catalog overlay.
	await page.waitForTimeout(2500);
	await expect(gallery).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Arrange parts', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await expect(page.getByRole('slider', { name: 'Crank angle', exact: true })).toHaveCount(0);
	await expect(page.locator('.stage-subtitle')).toContainText('22 component families');
	await expect(
		page.getByRole('region', { name: 'Inspection controls', exact: true })
	).toContainText('Original source geometry');
	await page.getByRole('button', { name: 'Component atlas', exact: true }).click();
	await expect(gallery).toBeVisible({ timeout: 30_000 });
	await expect(page.getByRole('heading', { name: 'Component atlas', exact: true })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Component atlas', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await expect(page.getByRole('button', { name: 'Arrange parts', exact: true })).toHaveAttribute(
		'aria-pressed',
		'false'
	);
	await expect(page.getByRole('button', { name: 'Fit engine', exact: true })).toHaveCount(0);
	await expect(page.locator('.stage-footer')).toContainText('Scroll to browse');
	await expect(page.locator('.playback-reason')).toHaveCount(0);
	await expect(gallery.locator('.family-card')).toHaveCount(22);
	const rods = gallery.getByRole('button', { name: 'Inspect Connecting rods', exact: true });
	await expect(gallery.locator('canvas')).toBeVisible();
	await gallery
		.getByRole('textbox', { name: 'Search atlas families', exact: true })
		.fill('connecting rod');
	await expect(gallery.locator('.family-card')).toHaveCount(1);
	await expect(rods).toBeVisible();
	await expect(rods.locator('.preview')).toHaveAttribute('data-preview-ready', 'true');
	const previewCanvas = gallery.locator('.atlas-preview-canvas');
	await expect(previewCanvas).toHaveAttribute('data-rotating', 'true');
	await gallery.getByRole('button', { name: 'Pause preview rotation', exact: true }).click();
	await expect(previewCanvas).toHaveAttribute('data-rotating', 'false');
	await gallery.getByRole('button', { name: 'Resume preview rotation', exact: true }).click();
	await expect(previewCanvas).toHaveAttribute('data-rotating', 'true');
	await rods.click();
	await expect(gallery).toHaveCount(0);
	await expect(page.locator('.engine-canvas canvas')).toBeVisible();
	await page.getByRole('button', { name: /^All families/ }).click();
	await expect(gallery).toBeVisible();
	await expect(gallery.locator('.family-card')).toHaveCount(22);
	await gallery.getByRole('button', { name: 'Head & valve train', exact: true }).click();
	await expect(gallery.locator('.family-card')).toHaveCount(6);
	await expect(
		gallery.getByRole('button', { name: 'Inspect Connecting rods', exact: true })
	).toHaveCount(0);
	await gallery.getByRole('button', { name: 'All families', exact: true }).click();
	await expect(gallery.locator('.family-card')).toHaveCount(22);
	await page.getByRole('button', { name: 'View 3D arrangement', exact: true }).click();
	await expect(gallery).toHaveCount(0);
	await expect(page.getByRole('heading', { name: 'Parts arrangement', exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Component atlas', exact: true }).click();
	await expect(gallery).toBeVisible();
	await page.getByRole('button', { name: 'Return to engine', exact: true }).click();
	await expect(gallery).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Section', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await expect(page.getByRole('slider', { name: 'Crank angle', exact: true })).toHaveValue('137');
	await expect(page.getByRole('slider', { name: 'Cutaway position', exact: true })).toHaveValue(
		'0.35'
	);
});

test('catalog previews respect reduced motion and render only visible families', async ({
	page
}) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await ready(page);
	await page.getByRole('button', { name: 'Component atlas', exact: true }).click();
	const gallery = page.getByRole('region', { name: 'Component family gallery', exact: true });
	const canvas = gallery.locator('.atlas-preview-canvas');
	await expect(gallery.locator('.preview[data-preview-ready="true"]').first()).toBeVisible();
	await expect(canvas).toHaveAttribute('data-rotating', 'false');
	await expect(
		gallery.getByRole('button', { name: 'Resume preview rotation', exact: true })
	).toBeEnabled();
	await page.waitForTimeout(250);
	const stillFrame = await canvas.getAttribute('data-render-frames');
	await page.waitForTimeout(250);
	await expect(canvas).toHaveAttribute('data-render-frames', stillFrame!);
	const visible = Number(await canvas.getAttribute('data-visible-previews'));
	expect(visible).toBeGreaterThan(0);
	expect(visible).toBeLessThan(22);
	await gallery.getByRole('button', { name: 'Resume preview rotation', exact: true }).click();
	await expect(canvas).toHaveAttribute('data-rotating', 'true');
	await expect
		.poll(async () => Number(await canvas.getAttribute('data-render-frames')))
		.toBeGreaterThan(Number(stillFrame));
	await page.emulateMedia({ reducedMotion: 'no-preference' });
	// Media change events are delivered with a rendering update; do not coalesce two settings.
	await page.waitForTimeout(100);
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await expect(canvas).toHaveAttribute('data-rotating', 'false');
	for (let reopen = 0; reopen < 3; reopen++) {
		const previousCanvas = await canvas.elementHandle();
		await page.getByRole('button', { name: 'Arrange parts', exact: true }).click();
		await expect(gallery).toHaveCount(0);
		await expect
			.poll(() =>
				previousCanvas!.evaluate((node) =>
					(node as HTMLCanvasElement).getContext('webgl2')?.isContextLost()
				)
			)
			.toBe(true);
		await previousCanvas!.dispose();
		await page.getByRole('button', { name: 'Component atlas', exact: true }).click();
		await expect(canvas).toHaveCount(1);
		await expect(gallery.locator('.preview[data-preview-ready="true"]').first()).toBeVisible();
		await expect(canvas).toHaveAttribute('data-rotating', 'false');
	}
});

test('BYOK connects the actual V12 session without persisting credentials', async ({ page }) => {
	let catalogIds: string[] = [];
	page.on('request', (request) => {
		if (new URL(request.url()).pathname === '/api/scene/session')
			catalogIds = request.postDataJSON().components.map((part: { id: string }) => part.id);
	});
	await page.route('**/api/agent', async (route) => {
		const body = route.request().postDataJSON();
		expect(body.key).toBe(placeholderKey);
		expect(body.sceneSession.sessionId).toBeTruthy();
		await route.fulfill({
			json: {
				answer: 'The actual V12 source has twelve connecting rods.',
				actions: [],
				sources: ['V12_GEOMETRY']
			}
		});
	});
	await ready(page);
	await connectPlaceholder(page);
	await page
		.getByRole('textbox', { name: 'Ask the engine', exact: true })
		.fill('Show the connecting rods');
	await page.getByRole('button', { name: 'Send question', exact: true }).click();
	await expect(page.locator('.messages')).toContainText('twelve connecting rods', {
		timeout: 20_000
	});
	expect(catalogIds).toHaveLength(1253);
	expect(catalogIds).toContain('v12-1253');
	expect(catalogIds.some((id) => id.startsWith('mech:'))).toBe(false);
	const saved = await page.evaluate(() => ({
		local: { ...localStorage },
		session: { ...sessionStorage }
	}));
	expect(saved).toEqual({ local: { [welcomeKey]: 'seen' }, session: {} });
});

test('spoken guide explanation plays and stops using offline audio', async ({ page }) => {
	await page.route('**/api/agent', (route) =>
		route.fulfill({
			json: {
				answer: 'A connecting rod transfers force from piston to crankshaft.',
				actions: [],
				sources: ['V12_GEOMETRY']
			}
		})
	);
	await page.route('**/api/narrate', (route) =>
		route.fulfill({ contentType: 'audio/wav', body: silentWav(8) })
	);
	await ready(page);
	await connectPlaceholder(page);
	await page
		.getByRole('textbox', { name: 'Ask the engine', exact: true })
		.fill('Explain a connecting rod');
	await page.getByRole('button', { name: 'Send question', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Listen', exact: true })).toBeVisible({
		timeout: 20_000
	});
	await page.getByRole('button', { name: 'Listen', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Stop listening', exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Stop listening', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Listen', exact: true })).toBeVisible();
});

test('lesson manual scrubbing pauses progression and preserves the chosen angle', async ({
	page
}) => {
	await ready(page);
	await page.getByRole('button', { name: 'Assembly properties', exact: true }).click();
	await page.getByRole('button', { name: /Inside the mechanism/ }).click();
	await page.getByRole('button', { name: 'Next', exact: true }).click();
	await page.getByRole('button', { name: 'Play lesson', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Pause lesson', exact: true })).toBeVisible();
	await page.getByRole('slider', { name: 'Crank angle', exact: true }).fill('137');
	await expect(page.getByRole('button', { name: 'Play lesson', exact: true })).toBeVisible();
	await expect(page.getByRole('slider', { name: 'Crank angle', exact: true })).toHaveValue('137');
});

test('evidence presents dimensions without an inherited fuel or load curve', async ({ page }) => {
	await ready(page);
	await page.getByRole('button', { name: 'Assembly properties', exact: true }).click();
	await page.getByRole('button', { name: 'Evidence', exact: true }).click();
	await expect(page.locator('.metrics')).toContainText('85');
	await expect(page.locator('.metrics')).toContainText('100');
	await expect(page.locator('.metrics')).toContainText('6.81');
	await expect(page.locator('.facts')).toContainText('125 mm');
	await expect(page.getByRole('slider', { name: 'Generator load' })).toHaveCount(0);
	await expect(page.locator('.evidence-note')).toContainText('performance remains uncalibrated');
	await expect(page.locator('.evidence-note')).toContainText('original files are preserved');
});

test('narrow viewport keeps primary controls inside the screen', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await ready(page);
	await page.getByRole('button', { name: 'Explode assembly', exact: true }).click();
	for (const name of ['Assembly separation']) {
		const box = await page.getByRole('slider', { name, exact: true }).boundingBox();
		expect(box).not.toBeNull();
		expect(box!.x).toBeGreaterThanOrEqual(0);
		expect(box!.x + box!.width).toBeLessThanOrEqual(391);
	}
	await page.getByRole('button', { name: 'Section', exact: true }).click();
	const body = await page
		.locator('body')
		.evaluate((el) => ({ width: el.scrollWidth, viewport: window.innerWidth }));
	expect(body.width).toBeLessThanOrEqual(body.viewport + 1);
	await expect(page.getByRole('slider', { name: 'Cutaway position', exact: true })).toBeVisible();
});

test('the operational tour prepares all eight views without sending a paid question', async ({
	page
}) => {
	let questions = 0;
	await page.route('**/api/agent', (route) => {
		questions++;
		return route.fulfill({
			status: 503,
			json: { error: 'The tour must not send a question automatically.' }
		});
	});
	await ready(page);
	await page.getByRole('button', { name: 'Demo tour', exact: true }).click();
	await page.getByRole('button', { name: 'Start workspace tour', exact: true }).click();
	const title = page.locator('.driver-popover-title');
	const titles = [
		'Source assembly',
		'Exploded view',
		'Section plane',
		'Mechanical playback',
		'Component selection',
		'Component atlas',
		'Geometry and evidence',
		'Assembly assistant'
	];
	for (let index = 0; index < titles.length; index++) {
		await expect(title).toHaveText(titles[index], { timeout: 25_000 });
		if (index === 1)
			await expect(
				page.getByRole('slider', { name: 'Assembly separation', exact: true })
			).toHaveValue('0.65');
		if (index === 2)
			await expect(
				page.getByRole('slider', { name: 'Cutaway position', exact: true })
			).toBeVisible();
		if (index === 3)
			await expect(page.getByRole('button', { name: 'Pause engine', exact: true })).toBeVisible();
		if (index === 5)
			await expect(
				page.getByRole('heading', { name: 'Component atlas', exact: true })
			).toBeVisible();
		if (index === 6)
			await expect(
				page.getByRole('heading', { name: 'Geometry and evidence', exact: true })
			).toBeVisible();
		if (index < titles.length - 1) await page.locator('.driver-popover-next-btn').click();
	}
	await page.locator('.driver-popover-next-btn').click();
	await expect(title).toHaveCount(0);
	await expect(page.getByRole('textbox', { name: 'Ask the engine', exact: true })).toHaveValue(
		'Show me a connecting rod, isolate it, and explain how it transmits force.'
	);
	expect(questions).toBe(0);
});

test('Stop during scene connection prevents a late AI request and permits a fresh request', async ({
	page
}) => {
	let release!: () => void;
	const held = new Promise<void>((resolve) => {
		release = resolve;
	});
	let connectionStarted = false,
		agentCalls = 0;
	await page.route('**/api/scene/session', async (route) => {
		const response = await route.fetch();
		connectionStarted = true;
		await held;
		await route.fulfill({ response });
	});
	await page.route('**/api/agent', (route) => {
		agentCalls++;
		return route.fulfill({
			json: { answer: 'The fresh request completed.', actions: [], sources: [] }
		});
	});
	await ready(page);
	await connectPlaceholder(page);
	const input = page.getByRole('textbox', { name: 'Ask the engine', exact: true });
	await input.fill('Open the cutaway');
	await page.getByRole('button', { name: 'Send question', exact: true }).click();
	await expect.poll(() => connectionStarted).toBe(true);
	await page.getByRole('button', { name: 'Stop', exact: true }).click();
	release();
	await page.waitForTimeout(300);
	expect(agentCalls).toBe(0);
	await input.fill('Explain the source geometry');
	await page.getByRole('button', { name: 'Send question', exact: true }).click();
	await expect(page.locator('.messages')).toContainText('The fresh request completed.', {
		timeout: 20_000
	});
	expect(agentCalls).toBe(1);
});
