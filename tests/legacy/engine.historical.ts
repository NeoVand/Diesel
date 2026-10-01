import { test, expect, type Page } from '@playwright/test';

const screenshotRoot = process.env.DIESEL_QA_OUTPUT || 'test-results';
test.setTimeout(90_000);

async function ready(page: Page) {
	await page.addInitScript(() => localStorage.setItem('diesel.welcome.v4', 'seen'));
	await page.goto('/');
	await expect(page.getByText('ENGINE STUDIO READY', { exact: true })).toBeVisible({
		timeout: 60_000
	});
	await expect(page.locator('.engine-canvas canvas')).toBeVisible();
}

async function connectPlaceholder(page: Page) {
	await page.getByRole('button', { name: 'AI connection settings', exact: true }).click();
	await page.getByText('Use my own API key', { exact: true }).click();
	await page.getByLabel('API key', { exact: true }).fill('sk-test-local-placeholder-only');
	await page.getByRole('button', { name: 'Connect key', exact: true }).click();
}

test('individual source components can be selected, removed, isolated and restored', async ({
	page
}) => {
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.setViewportSize({ width: 1512, height: 982 });
	await ready(page);
	await page.waitForTimeout(1800);
	await page.screenshot({ path: `${screenshotRoot}/engine-assembled.png` });
	await page.getByRole('button', { name: 'Explode assembly', exact: true }).first().click();
	await expect(page.getByRole('slider', { name: 'Assembly separation' })).toHaveValue('1');
	await page.getByRole('button', { name: 'Components 587', exact: true }).click();
	const sourcePart = page
		.locator('.tree-part')
		.filter({ hasNot: page.locator('.educational') })
		.first();
	await sourcePart.click();
	await expect(page.locator('.component-id')).toContainText('Frame_');
	await page.getByRole('button', { name: 'Remove', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Replace', exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Isolate', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Show all', exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Replace', exact: true }).click();
	await page.getByRole('button', { name: 'Show all', exact: true }).click();
	await page.getByRole('button', { name: 'Close component library' }).click();
	await page.waitForTimeout(1800);
	await page.screenshot({ path: `${screenshotRoot}/engine-exploded.png` });
	await page.getByRole('button', { name: 'Restore previous view', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Power, understood.' })).toBeVisible();
	await expect(page.getByRole('slider', { name: 'Assembly separation' })).toHaveCount(0);
	expect(errors).toEqual([]);
});

test('working cycle advances, pauses and scrubs without changing the reference speed', async ({
	page
}) => {
	await page.setViewportSize({ width: 1512, height: 982 });
	await ready(page);
	await page.getByRole('button', { name: 'Run & inspect inside', exact: true }).click();
	const angle = page.getByRole('slider', { name: 'Crank angle', exact: true });
	const initial = await angle.inputValue();
	await expect.poll(() => angle.inputValue()).not.toBe(initial);
	const pauseIcon = await page
		.getByRole('button', { name: 'Pause engine', exact: true })
		.locator('svg')
		.innerHTML();
	await page.getByRole('button', { name: 'Pause engine', exact: true }).click();
	await expect
		.poll(() =>
			page.getByRole('button', { name: 'Run engine', exact: true }).locator('svg').innerHTML()
		)
		.not.toBe(pauseIcon);
	await angle.fill('300');
	await expect(angle).toHaveValue('300');
	await expect(page.locator('.cycle-description')).toContainText('Closed valves');
	await page.waitForTimeout(250);
	await expect(angle).toHaveValue('300');
	await page.getByRole('combobox', { name: 'Playback speed', exact: true }).selectOption('0.05');
	await expect(page.getByRole('combobox', { name: 'Playback speed', exact: true })).toHaveValue(
		'0.05'
	);
	await expect(page.locator('.stage-caption')).toContainText('1800 RPM REFERENCE');
	await expect(page.getByRole('button', { name: 'Run engine', exact: true })).toBeVisible();
	await page.waitForTimeout(1800);
	await page.screenshot({ path: `${screenshotRoot}/engine-cutaway.png` });
	await page.getByRole('button', { name: 'Mechanism', exact: true }).click();
	await expect(page.locator('.view-switch button.active')).toHaveText('Mechanism');
	await page.waitForTimeout(1800);
	await page.screenshot({ path: `${screenshotRoot}/engine-mechanism.png` });
});

test('system overlays and phase events can be inspected independently', async ({ page }) => {
	await ready(page);
	await page.getByRole('button', { name: 'Operate', exact: true }).click();
	await expect(page.locator('.flow-legend button')).toHaveCount(3);
	await page.getByRole('button', { name: 'Jacket water OFF', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Jacket water ON', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await page.getByRole('button', { name: 'Lubrication OFF', exact: true }).click();
	await expect(page.locator('.flow-legend button')).toHaveCount(5);
	await page
		.locator('.flow-legend')
		.getByRole('button', { name: 'Charge air', exact: true })
		.click();
	await expect(page.getByRole('button', { name: 'Charge air OFF', exact: true })).toHaveAttribute(
		'aria-pressed',
		'false'
	);
	await page.getByRole('slider', { name: 'Crank angle', exact: true }).fill('630');
	await expect(page.locator('.cycle-description')).toContainText('burned gas');
});

test('guided lesson drives the cutaway and has readable enabled navigation', async ({ page }) => {
	await ready(page);
	await page.getByRole('button', { name: 'Learn', exact: true }).click();
	await page.getByRole('button', { name: /The four-stroke cycle/ }).click();
	await expect(
		page.getByRole('heading', { name: 'One cylinder. Four strokes.', exact: true })
	).toBeVisible();
	await expect(page.getByRole('button', { name: 'Back', exact: true })).toBeDisabled();
	const next = page.getByRole('button', { name: 'Next', exact: true });
	const contrast = await next.evaluate((button) => {
		const style = getComputedStyle(button);
		const luminance = (rgb: string) => {
			const values = (rgb.match(/[\d.]+/g) || [])
				.slice(0, 3)
				.map((n) => Number(n) / 255)
				.map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
			return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
		};
		const a = luminance(style.color),
			b = luminance(style.backgroundColor);
		return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
	});
	expect(contrast).toBeGreaterThanOrEqual(4.5);
	await next.click();
	await next.click();
	await expect(page.getByRole('heading', { name: 'Compression: store the energy.' })).toBeVisible();
	await expect(page.getByRole('slider', { name: 'Crank angle', exact: true })).toHaveValue('300');
	await page.getByRole('button', { name: 'Play lesson', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Pause lesson', exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Stop engine and guide', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Play lesson', exact: true })).toBeVisible();
	await page.waitForTimeout(1800);
	await page.screenshot({ path: `${screenshotRoot}/engine-lesson.png` });
});

test('performance reference retains published and interpolated values', async ({ page }) => {
	await ready(page);
	await page.getByRole('button', { name: 'Performance', exact: true }).click();
	await expect(page.getByText('Published operating point', { exact: true })).toBeVisible();
	await expect(page.locator('.metrics')).toContainText('306.4');
	await page.getByRole('button', { name: '100%', exact: true }).click();
	await expect(page.locator('.metrics')).toContainText('390.8');
	await page.getByRole('slider', { name: 'Generator load' }).fill('63');
	await expect(page.getByText('Interpolated operating point', { exact: true })).toBeVisible();
	await expect(page.locator('.metrics')).toContainText('264.3');
	await expect(page.locator('.metrics')).toContainText('945');
	await page.getByRole('button', { name: 'References', exact: true }).click();
	await expect(page.getByRole('link', { name: /EM1898-00.*nominal steady-state/ })).toHaveAttribute(
		'href',
		/PDS-EM1898-00/
	);
	await page.getByRole('button', { name: 'Close references', exact: true }).click();
	await page.waitForTimeout(1800);
	await page.screenshot({ path: `${screenshotRoot}/engine-performance.png` });
});

test('BYOK uses a live scene session, renders the reply and does not persist credentials', async ({
	page
}) => {
	await page.route('**/api/agent', async (route) => {
		const body = route.request().postDataJSON();
		expect(body.key).toBe('sk-test-local-placeholder-only');
		expect(body.sceneSession.sessionId).toBeTruthy();
		expect(body.sceneSession.token).toBeTruthy();
		await route.fulfill({
			json: {
				answer:
					'During compression, both valves are closed and the piston compresses the trapped air.',
				sources: ['SPEC001'],
				actions: [],
				execution: 'acknowledged'
			}
		});
	});
	await ready(page);
	await connectPlaceholder(page);
	await page
		.getByRole('textbox', { name: 'Ask the engineering guide', exact: true })
		.fill('Explain compression');
	await page.getByRole('button', { name: 'Send question', exact: true }).click();
	await expect(page.locator('.messages')).toContainText('both valves are closed', {
		timeout: 15000
	});
	const stored = await page.evaluate(() => ({
		local: Object.keys(localStorage),
		session: Object.keys(sessionStorage)
	}));
	expect(stored).toEqual({ local: ['diesel.welcome.v4'], session: [] });
	await page.getByRole('button', { name: 'AI connection settings', exact: true }).click();
	await page.getByRole('button', { name: 'Disconnect for this session', exact: true }).click();
	await expect(page.getByRole('button', { name: 'AI guide', exact: true })).toBeVisible();
});

test('spoken explanation plays and stops through the connected guide', async ({ page }) => {
	const samples = 64_000,
		wav = Buffer.alloc(44 + samples * 2);
	wav.write('RIFF', 0);
	wav.writeUInt32LE(wav.length - 8, 4);
	wav.write('WAVEfmt ', 8);
	wav.writeUInt32LE(16, 16);
	wav.writeUInt16LE(1, 20);
	wav.writeUInt16LE(1, 22);
	wav.writeUInt32LE(8000, 24);
	wav.writeUInt32LE(16000, 28);
	wav.writeUInt16LE(2, 32);
	wav.writeUInt16LE(16, 34);
	wav.write('data', 36);
	wav.writeUInt32LE(samples * 2, 40);
	await page.route('**/api/agent', (route) =>
		route.fulfill({
			json: {
				answer: 'Compression heats the trapped air before fuel injection.',
				sources: [],
				actions: [],
				execution: 'acknowledged'
			}
		})
	);
	await page.route('**/api/narrate', async (route) => {
		expect(route.request().postDataJSON().key).toBe('sk-test-local-placeholder-only');
		await route.fulfill({ body: wav, contentType: 'audio/wav' });
	});
	await ready(page);
	await connectPlaceholder(page);
	await page
		.getByRole('textbox', { name: 'Ask the engineering guide', exact: true })
		.fill('Explain compression');
	await page.getByRole('button', { name: 'Send question', exact: true }).click();
	await page.getByRole('button', { name: 'Listen', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Stop narration', exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Stop narration', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Listen', exact: true })).toBeVisible();
});

test('mobile engine, operating controls and inspector fit the viewport', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await ready(page);
	expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
	await page.getByRole('button', { name: 'Run & inspect inside', exact: true }).click();
	await expect(page.getByRole('slider', { name: 'Crank angle', exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Pause engine', exact: true }).click();
	await page.getByRole('slider', { name: 'Crank angle', exact: true }).fill('300');
	expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
	await page.waitForTimeout(1800);
	await page.screenshot({ path: `${screenshotRoot}/engine-mobile.png`, fullPage: true });
});

test('Stop during scene connection prevents a late agent request', async ({ page }) => {
	let releaseConnection!: () => void;
	const held = new Promise<void>((resolve) => {
		releaseConnection = resolve;
	});
	let connectionStarted = false;
	let agentCalls = 0;
	await page.route('**/api/scene/session', async (route) => {
		const response = await route.fetch();
		connectionStarted = true;
		await held;
		await route.fulfill({ response });
	});
	await page.route('**/api/agent', async (route) => {
		agentCalls++;
		await route.fulfill({
			json: {
				answer: 'The new request completed.',
				sources: [],
				actions: [],
				execution: 'acknowledged'
			}
		});
	});
	await ready(page);
	await connectPlaceholder(page);
	const input = page.getByRole('textbox', { name: 'Ask the engineering guide', exact: true });
	await input.fill('Open the cutaway');
	await page.getByRole('button', { name: 'Send question', exact: true }).click();
	await expect.poll(() => connectionStarted).toBe(true);
	await page.getByRole('button', { name: 'Stop', exact: true }).click();
	releaseConnection();
	await page.waitForTimeout(300);
	expect(agentCalls).toBe(0);
	await expect(input).toBeEnabled();
	await input.fill('Explain the engine');
	await page.getByRole('button', { name: 'Send question', exact: true }).click();
	await expect(page.locator('.messages')).toContainText('The new request completed.');
	expect(agentCalls).toBe(1);
});

test('a second cylinder uses its own visible phase and global scene offset', async ({ page }) => {
	let globalPhase: number | undefined;
	await page.route('**/api/scene/session', async (route) => {
		globalPhase = route.request().postDataJSON().actualPhase;
		await route.continue();
	});
	await page.route('**/api/agent', (route) =>
		route.fulfill({
			json: {
				answer: 'Observed the paused cylinder.',
				sources: [],
				actions: [],
				execution: 'acknowledged'
			}
		})
	);
	await ready(page);
	await page.getByRole('button', { name: 'Cutaway', exact: true }).click();
	await page.getByRole('button', { name: 'Cylinder study', exact: true }).click();
	await page.getByRole('button', { name: 'Components 587', exact: true }).click();
	await page.getByRole('textbox', { name: 'Search components' }).fill('mech:piston:02');
	await page.locator('.tree-part').click();
	await page.getByRole('button', { name: 'Close component library' }).click();
	await page.getByRole('slider', { name: 'Crank angle', exact: true }).fill('300');
	await expect(page.locator('.cycle-label')).toContainText('CYL 02');
	await expect(page.locator('.cycle-label')).toContainText('Compression');
	await page.getByRole('button', { name: 'Focus', exact: true }).click();
	await page.getByRole('button', { name: 'Fit engine', exact: true }).click();
	await expect(page.locator('.cycle-label')).toContainText('CYL 02');
	await expect(page.getByRole('slider', { name: 'Crank angle', exact: true })).toHaveValue('300');
	await connectPlaceholder(page);
	await page
		.getByRole('textbox', { name: 'Ask the engineering guide', exact: true })
		.fill('What is visible?');
	await page.getByRole('button', { name: 'Send question', exact: true }).click();
	await expect(page.locator('.messages')).toContainText('Observed the paused cylinder.');
	expect(globalPhase).toBe(360);
});

test('section plane controls preserve the whole engine and reach the live scene state', async ({
	page
}) => {
	let observed: Record<string, unknown> | undefined;
	await page.route('**/api/scene/session', async (route) => {
		observed = route.request().postDataJSON().state;
		await route.continue();
	});
	await page.route('**/api/agent', (route) =>
		route.fulfill({
			json: {
				answer: 'Observed the whole-engine section plane.',
				sources: [],
				actions: [],
				execution: 'acknowledged'
			}
		})
	);
	await page.setViewportSize({ width: 1512, height: 982 });
	await ready(page);
	await page.getByRole('button', { name: 'Cutaway', exact: true }).click();
	const position = page.getByRole('slider', { name: 'Section position', exact: true });
	await expect(position).toBeVisible();
	await page.getByRole('button', { name: 'Y section axis', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Y section axis', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await position.fill('0.25');
	await page.getByRole('button', { name: 'Flip section direction', exact: true }).click();
	await page.getByRole('button', { name: 'Show section plane', exact: true }).click();
	await expect(
		page.getByRole('button', { name: 'Show section plane', exact: true })
	).toHaveAttribute('aria-pressed', 'false');
	await expect(page.locator('.view-switch button.active')).toHaveText('Cutaway');
	await expect(page.locator('.stage-caption')).toContainText('About this model');
	await connectPlaceholder(page);
	await page
		.getByRole('textbox', { name: 'Ask the engineering guide', exact: true })
		.fill('Describe the section settings.');
	await page.getByRole('button', { name: 'Send question', exact: true }).click();
	await expect(page.locator('.messages')).toContainText('Observed the whole-engine section plane.');
	expect(observed?.display).toBe('section');
	expect(observed?.section).toEqual({ axis: 'y', offset: 0.25, flipped: true, visible: false });
	expect(observed?.internals).toBe(true);
});

test('double-click isolates source geometry and teaching internals within the assembly', async ({
	page
}) => {
	await page.setViewportSize({ width: 1512, height: 982 });
	await ready(page);
	await page.waitForTimeout(1800);
	const canvas = page.locator('.engine-canvas canvas');
	const bounds = await canvas.boundingBox();
	if (!bounds) throw Error('Missing canvas');
	await canvas.dblclick({
		position: { x: bounds.width * 0.5, y: bounds.height * 0.52 },
		delay: 80
	});
	await expect(page.locator('.component-id')).toContainText('Frame_');
	await expect(page.getByRole('button', { name: 'Show all', exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Show all', exact: true }).click();
	await page.getByRole('button', { name: 'Fit engine', exact: true }).click();
	await page.getByRole('button', { name: 'Explode assembly', exact: true }).first().click();
	await page.getByRole('button', { name: 'Include teaching internals', exact: true }).click();
	await expect(
		page.getByRole('button', { name: 'Include teaching internals', exact: true })
	).toHaveAttribute('aria-pressed', 'false');
	await page.getByRole('button', { name: 'Components 587', exact: true }).click();
	await page.getByRole('textbox', { name: 'Search components' }).fill('mech:piston:06');
	await page.locator('.tree-part').dblclick();
	await page.getByRole('button', { name: 'Close component library' }).click();
	await expect(page.locator('.view-switch button.active')).toHaveText('Assembly');
	await expect(page.locator('.component-id')).toContainText('mech:piston:06');
	await expect(page.getByRole('button', { name: 'Show all', exact: true })).toBeVisible();
	await expect(
		page.getByRole('button', { name: 'Include teaching internals', exact: true })
	).toHaveAttribute('aria-pressed', 'true');
});

test('welcome explains provenance and the operational tour prepares all eight live views', async ({
	page
}) => {
	await page.setViewportSize({ width: 1512, height: 982 });
	await page.goto('/');
	await expect(page.getByRole('dialog', { name: /Engineering/ })).toBeVisible();
	await expect(page.locator('.welcome')).toContainText(
		'publicly available Caterpillar documentation'
	);
	await expect(page.locator('.welcome')).toContainText('purchased 3512 exterior model');
	await expect(page.getByText('ENGINE STUDIO READY', { exact: true })).toBeVisible({
		timeout: 60_000
	});
	await page.screenshot({ path: `${screenshotRoot}/engine-welcome.png` });
	await page.getByRole('button', { name: 'Start the guided demo', exact: true }).click();
	const titles = [
		'A complete engine, one view at a time',
		'Separate the assembly',
		'Move through the complete engine',
		'Follow one working cycle',
		'Watch the injector deliver fuel',
		'Compression ignition becomes power',
		'Connect the picture to evidence',
		'Now ask the engine'
	];
	for (let index = 0; index < titles.length; index++) {
		await expect(page.locator('.driver-popover-title')).toHaveText(titles[index], {
			timeout: 20_000
		});
		if (index === 1)
			await expect(page.getByRole('slider', { name: 'Assembly separation' })).toHaveValue('0.8');
		if (index === 2)
			await expect(page.getByRole('slider', { name: 'Section position' })).toHaveValue('0.5');
		if (index === 3)
			await expect(page.getByRole('button', { name: 'Pause engine', exact: true })).toBeVisible();
		if (index === 4 || index === 5) {
			await expect(page.getByRole('slider', { name: 'Crank angle' })).toHaveValue(
				index === 4 ? '355' : '420'
			);
			await expect(page.getByRole('button', { name: 'Run engine', exact: true })).toBeVisible();
		}
		if (index === 6) await expect(page.locator('.metrics')).toContainText('306.4');
		if (index === 2 || index === 4 || index === 5) {
			await page.locator('.driver-popover').evaluate(async (element) => {
				await Promise.all(element.getAnimations().map((animation) => animation.finished));
			});
			await page.screenshot({ path: `${screenshotRoot}/tour-${index}.png` });
		}
		await page
			.getByRole('button', { name: index === 7 ? 'Ask the guide' : 'Continue', exact: true })
			.click();
	}
	await expect(page.locator('.driver-popover')).toHaveCount(0);
	await expect(page.getByRole('textbox', { name: 'Ask the engineering guide' })).toHaveValue(
		/compression ignition/
	);
	await page.reload();
	await expect(page.locator('.welcome')).not.toBeVisible();
	await page.getByRole('button', { name: 'Demo tour', exact: true }).click();
	await expect(page.locator('.welcome')).toBeVisible();
});

test('fuel study pauses at injection and power and centers the crank thumb track', async ({
	page
}) => {
	await ready(page);
	await page.getByRole('button', { name: 'Operate', exact: true }).click();
	await page.getByRole('button', { name: 'Inspect fuel & ignition', exact: true }).click();
	await expect(page.getByRole('slider', { name: 'Crank angle' })).toHaveValue('355');
	await page.getByRole('button', { name: /Combustion\s*420°/ }).click();
	await expect(page.getByRole('slider', { name: 'Crank angle' })).toHaveValue('420');
	const centers = await page.locator('.scrubber').evaluate((el) => {
		const line = el.querySelector('.stroke-track')!.getBoundingClientRect();
		const input = el.querySelector('input')!.getBoundingClientRect();
		return { line: line.y + line.height / 2, input: input.y + input.height / 2 };
	});
	expect(Math.abs(centers.line - centers.input)).toBeLessThan(0.6);
	await expect(page.getByRole('button', { name: 'Run engine', exact: true })).toBeVisible();
});

test('assembly separation stays available at zero and can be scrubbed repeatedly', async ({
	page
}) => {
	await page.setViewportSize({ width: 1512, height: 982 });
	await ready(page);
	await page.getByRole('button', { name: 'Explode assembly', exact: true }).first().click();
	const separation = page.getByRole('slider', { name: 'Assembly separation', exact: true });
	await expect(separation).toHaveValue('1');
	await separation.focus();
	await separation.press('Home');
	await expect(separation).toHaveValue('0');
	await expect(separation).toBeFocused();
	await expect(separation).toBeVisible();
	await separation.press('End');
	await expect(separation).toHaveValue('1');
	await separation.fill('0');
	await expect(separation).toBeVisible();
	await separation.fill('0.65');
	await expect(separation).toHaveValue('0.65');
	await separation.fill('0');
	await page.getByRole('button', { name: 'Explode assembly', exact: true }).first().click();
	await expect(separation).toHaveValue('1');
	await page.getByRole('button', { name: 'Parts layout', exact: true }).click();
	await expect(page.locator('.view-switch button.active')).toHaveText('Parts');
	await page.waitForTimeout(1800);
	await page.getByRole('button', { name: 'Restore previous view', exact: true }).click();
	await expect(separation).toHaveValue('1');
	await expect(separation).toBeVisible();
});

test('parts layout browses all components by system and restores physical assembly', async ({
	page
}) => {
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.setViewportSize({ width: 1512, height: 982 });
	await ready(page);
	await page.getByRole('button', { name: 'Arrange parts', exact: true }).click();
	await expect(page.locator('.view-switch button.active')).toHaveText('Parts');
	await expect(
		page.getByRole('heading', { name: 'The engine, laid out.', exact: true })
	).toBeVisible();
	await expect(page.locator('.collection-count strong')).toHaveText('675');
	await expect(page.getByRole('slider', { name: 'Crank angle', exact: true })).toHaveCount(0);
	await expect(
		page.getByText('Parts resized individually for inspection. Dimensions are not comparable here.')
	).toBeVisible();
	await page.waitForTimeout(3500);
	await page.screenshot({ path: `${screenshotRoot}/engine-parts-layout.png` });
	await page.getByRole('button', { name: 'Include teaching internals', exact: true }).click();
	await expect(page.locator('.collection-count strong')).toHaveText('587');
	await page.getByRole('button', { name: 'Include teaching internals', exact: true }).click();
	await expect(page.locator('.collection-count strong')).toHaveText('675');
	await page
		.locator('.system-list')
		.getByRole('button', { name: /Cylinder-head/ })
		.click();
	await expect(page.locator('.system-list button.active')).toContainText('Cylinder-head');
	await page.waitForTimeout(1800);
	await page.screenshot({ path: `${screenshotRoot}/engine-parts-heads.png` });
	await page.getByRole('button', { name: 'Components 587', exact: true }).click();
	await page.getByRole('textbox', { name: 'Search components' }).fill('mech:piston:06');
	await page.locator('.tree-part').dblclick();
	await expect(page.getByRole('button', { name: 'Show all', exact: true })).toBeVisible();
	await expect(page.locator('.component-id')).toContainText('mech:piston:06');
	await expect(page.getByRole('button', { name: 'Remove', exact: true })).toHaveCount(0);
	await page.getByRole('button', { name: 'Close component library', exact: true }).click();
	await page.waitForTimeout(1800);
	await page.screenshot({ path: `${screenshotRoot}/engine-parts-piston.png` });
	await page.getByRole('button', { name: 'Fit all parts', exact: true }).click();
	await expect(
		page.getByRole('heading', { name: 'The engine, laid out.', exact: true })
	).toBeVisible();
	await page.getByRole('button', { name: 'Back to assembly', exact: true }).click();
	await expect(page.locator('.view-switch button.active')).toHaveText('Assembly');
	await expect(
		page.getByRole('heading', { name: 'Power, understood.', exact: true })
	).toBeVisible();
	await page.waitForTimeout(2500);
	await page.screenshot({ path: `${screenshotRoot}/engine-parts-return.png` });
	expect(errors).toEqual([]);
});

test('parts layout and persistent separation controls fit a narrow phone', async ({ page }) => {
	await page.setViewportSize({ width: 360, height: 800 });
	await ready(page);
	await page.getByRole('button', { name: 'Explode assembly', exact: true }).first().click();
	const separation = page.getByRole('slider', { name: 'Assembly separation', exact: true });
	await separation.fill('0');
	await expect(separation).toBeVisible();
	const bounds = await separation.boundingBox();
	expect(bounds).not.toBeNull();
	expect(bounds!.x).toBeGreaterThanOrEqual(0);
	expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(360);
	await page.getByRole('button', { name: 'Parts layout', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Parts layout', exact: true })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Back to assembly', exact: true })).toBeVisible();
	await expect(page.locator('.collection-count strong')).toHaveText('675');
	await page.waitForTimeout(3500);
	await page.screenshot({ path: `${screenshotRoot}/engine-parts-mobile.png`, fullPage: true });
	expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
});

test('parts layout retains a working phase for Restore previous view', async ({ page }) => {
	await page.setViewportSize({ width: 1512, height: 982 });
	await ready(page);
	await page.getByRole('button', { name: 'Run & inspect inside', exact: true }).click();
	await page.getByRole('slider', { name: 'Crank angle', exact: true }).fill('355');
	await page.getByRole('button', { name: 'Parts layout', exact: true }).click();
	await expect(page.locator('.view-switch button.active')).toHaveText('Parts');
	await page.waitForTimeout(1800);
	await page.getByRole('button', { name: 'Restore previous view', exact: true }).click();
	await expect(page.locator('.view-switch button.active')).toHaveText('Cutaway');
	await expect(page.getByRole('slider', { name: 'Crank angle', exact: true })).toHaveValue('355');
	await expect(page.getByRole('button', { name: 'Run engine', exact: true })).toBeVisible();
	await page.waitForTimeout(2200);
	await expect(page.getByRole('slider', { name: 'Crank angle', exact: true })).toHaveValue('355');
});
