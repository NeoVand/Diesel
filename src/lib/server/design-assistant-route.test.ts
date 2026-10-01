import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_DESIGN_PARAMS } from '$lib/design/design-core';

const fixture = vi.hoisted(() => ({
	env: {
		OPENAI_API_KEY: 'sk-sponsored-offline-design-test-key',
		DIESEL_DEMO_PASSWORD: 'offline-design-password',
		DIESEL_SESSION_SECRET: 'offline-design-secret-32-characters',
		DIESEL_AGENT_MODEL: 'gpt-6-sol'
	},
	run: vi.fn()
}));
vi.mock('$app/environment', () => ({ dev: false }));
vi.mock('$env/dynamic/private', () => ({ env: fixture.env }));
vi.mock('./design-assistant', async (importOriginal) => ({
	...(await importOriginal<typeof import('./design-assistant')>()),
	runDesignAssistant: fixture.run
}));
import { POST } from '../../routes/api/design/explain/+server';
import { POST as unlock } from '../../routes/api/access/unlock/+server';
import { POST as logout } from '../../routes/api/access/logout/+server';

let revision = 0;
beforeEach(() => {
	fixture.env.DIESEL_SESSION_SECRET = `offline-design-secret-${++revision}-32-characters`;
	fixture.run.mockReset().mockResolvedValue({
		text: 'A screening explanation.',
		provider: 'OpenAI',
		model: 'gpt-6-sol'
	});
});
const body = {
	question: 'Explain this candidate.',
	evidence: { params: { ...DEFAULT_DESIGN_PARAMS } }
};
function visitor() {
	const cookies = new Map<string, string>();
	return {
		event(
			payload: unknown = body,
			path = '/api/design/explain',
			origin = 'https://diesel.example'
		) {
			const url = new URL(`https://diesel.example${path}`);
			return {
				url,
				request: new Request(url, {
					method: 'POST',
					headers: { origin, 'content-type': 'application/json' },
					body: JSON.stringify(payload)
				}),
				getClientAddress: () => '192.0.2.81',
				cookies: {
					get: (key: string) => cookies.get(key),
					set: (key: string, value: string) => cookies.set(key, value),
					delete: (key: string) => cookies.delete(key)
				}
			} as never;
		}
	};
}

describe('private design assistant HTTP boundary', () => {
	it('requires existing invited access and refuses a client credential bypass', async () => {
		const client = visitor();
		expect((await POST(client.event())).status).toBe(401);
		expect((await POST(client.event({ ...body, key: 'sk-client-must-not-bypass' }))).status).toBe(
			400
		);
		expect(fixture.run).not.toHaveBeenCalled();
	});

	it('uses the server key and pinned model after the existing password unlock', async () => {
		const client = visitor();
		expect(
			(
				await unlock(
					client.event({ password: fixture.env.DIESEL_DEMO_PASSWORD }, '/api/access/unlock')
				)
			).status
		).toBe(200);
		const response = await POST(client.event());
		expect(response.status).toBe(200);
		expect(response.headers.get('cache-control')).toBe('no-store');
		expect(fixture.run.mock.calls[0][1]).toBe(fixture.env.OPENAI_API_KEY);
		expect(fixture.run.mock.calls[0][2]).toBe('gpt-6-sol');
		expect(await response.text()).not.toContain(fixture.env.OPENAI_API_KEY);
	});

	it('rejects cross-origin, oversized and malformed input before paid work', async () => {
		const client = visitor();
		expect(
			(await POST(client.event(body, '/api/design/explain', 'https://other.example'))).status
		).toBe(403);
		expect((await POST(client.event({ ...body, question: 'x'.repeat(33000) }))).status).toBe(413);
		expect((await POST(client.event({ ...body, evidence: {} }))).status).toBe(400);
		expect(fixture.run).not.toHaveBeenCalled();
	});

	it('uses shared visit cancellation and removes raw upstream error details', async () => {
		const client = visitor();
		await unlock(
			client.event({ password: fixture.env.DIESEL_DEMO_PASSWORD }, '/api/access/unlock')
		);
		let started!: () => void;
		const ready = new Promise<void>((resolve) => {
			started = resolve;
		});
		fixture.run.mockImplementation(
			(_input, _key, _model, signal: AbortSignal) =>
				new Promise((_resolve, reject) => {
					signal.addEventListener(
						'abort',
						() => reject(new Error(`private upstream detail ${fixture.env.OPENAI_API_KEY}`)),
						{ once: true }
					);
					started();
				})
		);
		const pending = POST(client.event());
		await ready;
		expect((await POST(client.event())).status).toBe(429);
		await logout(client.event({}, '/api/access/logout'));
		const response = await pending;
		expect(response.status).toBe(504);
		expect(await response.text()).not.toContain(fixture.env.OPENAI_API_KEY);
	});
});
