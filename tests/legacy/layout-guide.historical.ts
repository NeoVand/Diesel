import { expect, test } from '@playwright/test';
import type { LabState } from '../../src/lib/engine/lab-state';

type SceneContext = { state: LabState; actualPhase: number };
type SceneAck = SceneContext & { id: string; runId: string; status: string };
type MockStream = {
	__pushLayoutSceneEvent: (event: Record<string, unknown>) => void;
	__closeLayoutSceneStream: () => void;
};

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
		localStorage.setItem('diesel.welcome.v4', 'seen');
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
		await expect(page.getByText('ENGINE STUDIO READY', { exact: true })).toBeVisible({
			timeout: 60_000
		});
		await page.getByRole('button', { name: 'Run & inspect inside', exact: true }).click();
		await page.getByRole('button', { name: 'Pause engine', exact: true }).click();
		const angle = page.getByRole('slider', { name: 'Crank angle', exact: true });
		await angle.fill('355');
		await expect(angle).toHaveValue('355');
		await page.getByRole('button', { name: 'AI connection settings', exact: true }).click();
		await page.getByText('Use my own API key', { exact: true }).click();
		await page.getByLabel('API key', { exact: true }).fill('sk-test-local-placeholder-only');
		await page.getByRole('button', { name: 'Connect key', exact: true }).click();
		await page
			.getByRole('textbox', { name: 'Ask the engineering guide', exact: true })
			.fill('Open the Parts layout.');
		await page.getByRole('button', { name: 'Send question', exact: true }).click();
		await expect(page.locator('.messages')).toContainText('The Parts inspection layout is open.', {
			timeout: 25_000
		});
		expect(agentCalls).toBe(1);
		expect(initial).toMatchObject({
			state: { display: 'section', running: false, phase: 355 },
			actualPhase: 355
		});
		expect(acknowledgement).toMatchObject({
			id: commandId,
			runId,
			status: 'applied',
			state: { display: 'layout', running: false, flows: [], phase: 355 },
			actualPhase: 355
		});
		await expect(page.locator('.view-switch button.active')).toHaveText('Parts');
		await expect(angle).toHaveCount(0);
		await page.getByRole('button', { name: 'Restore previous view', exact: true }).click();
		await expect(page.locator('.view-switch button.active')).toHaveText('Cutaway');
		await expect(angle).toHaveValue('355');
		await expect(page.getByRole('button', { name: 'Run engine', exact: true })).toBeVisible();
		await expect.poll(() => latest?.state.display).toBe('section');
		expect(latest).toMatchObject({
			state: { display: 'section', running: false, phase: 355, flows: ['air', 'fuel', 'exhaust'] },
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
