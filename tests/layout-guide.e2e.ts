import { expect, test } from '@playwright/test';
import type { LabState } from '../src/lib/engine/lab-state';
import { ready } from './helpers/v12';

type SceneContext = { state: LabState; actualPhase: number };
type SceneAck = SceneContext & { id: string; runId: string; status: string };
type MockStream = {
	__pushLayoutSceneEvent: (event: Record<string, unknown>) => void;
	__closeLayoutSceneStream: () => void;
};

test('manual atlas search reveals its source part and keeps live analysis unavailable in the atlas', async ({
	page
}) => {
	test.setTimeout(120_000);
	await ready(page);
	await page.getByRole('button', { name: 'Component atlas', exact: true }).click();
	const gallery = page.getByRole('region', { name: 'Component family gallery', exact: true });
	await expect(gallery).toBeVisible({ timeout: 30_000 });
	await expect(page.getByRole('button', { name: 'Engine analysis', exact: true })).toBeDisabled();
	await page.getByRole('button', { name: 'Search components', exact: true }).click();
	await page.getByRole('textbox', { name: 'Search parts', exact: true }).fill('v12-1253');
	await page.locator('.search-result').filter({ hasText: 'v12-1253' }).click();
	await expect(gallery).toHaveCount(0);
	await expect(page.locator('.component-search')).toHaveCount(0);
	await expect(page.locator('.inspector .eyebrow')).toContainText('v12-1253');
	await expect(
		page.getByRole('button', { name: /^All families.*Selected components/ })
	).toBeVisible();
	await expect(
		page.locator('.inspector').getByRole('button', { name: 'Analysis', exact: true })
	).toBeDisabled();
	await expect(
		page.getByRole('region', { name: 'Measured kinematic analysis', exact: true })
	).toHaveCount(0);
	await page.getByRole('button', { name: 'Return to engine', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Exterior', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await expect(page.getByRole('button', { name: 'Engine analysis', exact: true })).toBeEnabled();
});

test('starting a lesson returns lifted parts for connected motion and preserves the prior inspection checkpoint', async ({
	page
}) => {
	test.setTimeout(120_000);
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.route('**/api/agent', (route) =>
		route.fulfill({ status: 503, json: { error: 'No model request is needed for this lesson.' } })
	);
	await page.route('**/api/narrate', (route) =>
		route.fulfill({ status: 503, json: { error: 'No narration is enabled in this test.' } })
	);
	await ready(page);
	await page.getByRole('button', { name: 'Search components', exact: true }).click();
	await page.getByRole('textbox', { name: 'Search parts', exact: true }).fill('v12-0014');
	await page.locator('.search-result').filter({ hasText: 'v12-0014' }).click();
	await page.getByRole('button', { name: 'Lift out', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Run engine', exact: true })).toBeDisabled();
	await expect(page.locator('.playback-reason')).toContainText('Return lifted parts');
	await page.getByRole('button', { name: 'Engine overview', exact: true }).click();
	await page.getByRole('button', { name: /Inside the mechanism/ }).click();
	await expect(page.getByRole('button', { name: 'Run engine', exact: true })).toBeEnabled();
	await expect(page.locator('.playback-reason')).toHaveCount(0);
	await page.getByRole('button', { name: 'See the connected motion', exact: true }).click();
	await expect(
		page.getByRole('heading', { name: 'See the connected motion', exact: true })
	).toBeVisible();
	await expect(page.getByRole('button', { name: 'Pause engine', exact: true })).toBeVisible();
	const angle = page.getByRole('slider', { name: 'Crank angle', exact: true });
	const initial = await angle.inputValue();
	await expect.poll(() => angle.inputValue()).not.toBe(initial);
	await page.getByRole('button', { name: 'Restore engine', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Exterior', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await expect(page.getByRole('button', { name: 'Run engine', exact: true })).toBeDisabled();
	await expect(page.locator('.playback-reason')).toContainText('Return lifted parts');
	expect(errors).toEqual([]);
});

test('an acknowledged guide layout preserves the paused view for Restore previous view', async ({
	page
}) => {
	test.setTimeout(90_000);
	let initial: SceneContext | undefined;
	let latest: SceneContext | undefined;
	let acknowledgement: SceneAck | undefined;
	let agentCalls = 0;
	let resolveAck!: (value: SceneAck) => void;
	const receivedAck = new Promise<SceneAck>((resolve) => {
		resolveAck = resolve;
	});
	const commandId = 'c82ca73a-0198-4e2a-bafd-2909c65fdf11';
	const runId = '26aed4c3-ff76-49c7-8887-a155c6515035';
	const session = {
		sessionId: 'ecbaf565-a23a-48d4-8cd2-1b4d4db34426',
		token: 'offline-layout-scene-token'
	};

	// Exercise the real SSE parser/command executor without invoking a model or native harness.
	await page.addInitScript(() => {
		localStorage.setItem('diesel.welcome.v12.1', 'seen');
		const originalFetch = window.fetch.bind(window);
		const encoder = new TextEncoder();
		let stream: ReadableStreamDefaultController<Uint8Array> | null = null;
		const harness = window as unknown as MockStream;
		harness.__pushLayoutSceneEvent = (event) => {
			if (!stream) throw new Error('The mock scene stream is not connected.');
			stream.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
		};
		harness.__closeLayoutSceneStream = () => {
			try {
				stream?.close();
			} catch {
				/* Browser teardown may already have canceled the stream. */
			}
			stream = null;
		};
		window.fetch = (input, init) => {
			const url = new URL(input instanceof Request ? input.url : String(input), location.href);
			if (url.pathname !== '/api/scene/events') return originalFetch(input, init);
			const body = new ReadableStream<Uint8Array>({
				start(controller) {
					stream = controller;
					controller.enqueue(encoder.encode('data: {"type":"ready"}\n\n'));
				},
				cancel() {
					stream = null;
				}
			});
			const signal = init?.signal ?? (input instanceof Request ? input.signal : null);
			signal?.addEventListener('abort', harness.__closeLayoutSceneStream, { once: true });
			return Promise.resolve(
				new Response(body, { headers: { 'Content-Type': 'text/event-stream' } })
			);
		};
	});
	await page.route('**/api/scene/session', async (route) => {
		initial = route.request().postDataJSON();
		await route.fulfill({ json: session });
	});
	await page.route('**/api/scene/state', async (route) => {
		latest = route.request().postDataJSON();
		await route.fulfill({ json: { ok: true } });
	});
	await page.route('**/api/scene/cancel', (route) => route.fulfill({ json: { ok: true } }));
	await page.route('**/api/scene/ack', async (route) => {
		const payload = route.request().postDataJSON() as SceneAck;
		if (payload.id === commandId) {
			acknowledgement = payload;
			resolveAck(payload);
		}
		await route.fulfill({ json: { ok: true } });
	});
	await page.route('**/api/narrate', (route) =>
		route.fulfill({ status: 409, json: { error: 'Narration is not used in this offline test.' } })
	);
	await page.route('**/api/agent', async (route) => {
		agentCalls++;
		const request = route.request().postDataJSON();
		const command = {
			type: 'command',
			id: commandId,
			runId,
			requestId: request.requestId,
			expectedRevision: initial!.state.revision,
			action: { type: 'display', value: 'layout' }
		};
		await page.evaluate((event) => {
			(window as unknown as MockStream).__pushLayoutSceneEvent(event);
		}, command);
		let timeout: ReturnType<typeof setTimeout> | undefined;
		try {
			const ack = await Promise.race([
				receivedAck,
				new Promise<null>((resolve) => {
					timeout = setTimeout(() => resolve(null), 20_000);
				})
			]);
			if (ack?.status !== 'applied') {
				await route.fulfill({
					status: 502,
					json: { error: 'The offline layout command was not acknowledged.' }
				});
				return;
			}
			await route.fulfill({
				json: {
					answer: 'The Parts inspection layout is open.',
					actions: [],
					sources: [],
					execution: 'acknowledged'
				}
			});
		} finally {
			if (timeout) clearTimeout(timeout);
		}
	});

	try {
		await page.goto('/');
		await expect(page.getByRole('button', { name: 'Exterior', exact: true })).toBeEnabled({
			timeout: 60_000
		});
		await page.getByRole('button', { name: 'Run engine', exact: true }).click();
		await page.getByRole('button', { name: 'Pause engine', exact: true }).click();
		const angle = page.getByRole('slider', { name: 'Crank angle', exact: true });
		await angle.fill('355');
		await expect(angle).toHaveValue('355');
		await page.getByRole('button', { name: 'AI connection settings', exact: true }).click();
		await page.getByText('Use my own API key', { exact: true }).click();
		await page.getByLabel('API key', { exact: true }).fill('sk-test-local-placeholder-only');
		await page.getByRole('button', { name: 'Connect key', exact: true }).click();
		await page
			.getByRole('textbox', { name: 'Ask the engine', exact: true })
			.fill('Open the Parts layout.');
		await page.getByRole('button', { name: 'Send question', exact: true }).click();
		await expect(page.locator('.messages')).toContainText('The Parts inspection layout is open.', {
			timeout: 25_000
		});
		expect(agentCalls).toBe(1);
		expect(initial).toMatchObject({
			state: { display: 'assembly', running: false, phase: 355 },
			actualPhase: 355
		});
		expect(acknowledgement).toMatchObject({
			id: commandId,
			runId,
			status: 'applied',
			state: { display: 'layout', running: false, flows: [], phase: 355 },
			actualPhase: 355
		});
		await expect(page.locator('.view-switch button.active')).toHaveText('Arrange parts');
		await expect(angle).toHaveCount(0);
		await expect(
			page.getByRole('region', { name: 'Component family gallery', exact: true })
		).toHaveCount(0);
		await page.getByRole('button', { name: 'Return to engine', exact: true }).click();
		await expect(page.locator('.view-switch button.active')).toHaveText('Exterior');
		await expect(angle).toHaveValue('355');
		await expect(page.getByRole('button', { name: 'Run engine', exact: true })).toBeVisible();
		await expect.poll(() => latest?.state.display).toBe('assembly');
		expect(latest).toMatchObject({
			state: { display: 'assembly', running: false, phase: 355, flows: [] },
			actualPhase: 355
		});
		await page.waitForTimeout(250);
		await expect(angle).toHaveValue('355');
	} finally {
		if (!page.isClosed()) {
			await page
				.evaluate(() => (window as unknown as MockStream).__closeLayoutSceneStream?.())
				.catch(() => {});
		}
	}
});
