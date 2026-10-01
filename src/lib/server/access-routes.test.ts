import { beforeEach, describe, expect, it, vi } from 'vitest';

const fixtures = vi.hoisted(() => ({
	env: {
		OPENAI_API_KEY: 'sk-sponsored-offline-test-key-only',
		DIESEL_DEMO_PASSWORD: 'offline-test-invite-password',
		DIESEL_SESSION_SECRET: 'offline-test-signing-secret-32-characters',
		DIESEL_AGENT_MODEL: 'gpt-6-sol',
		DIESEL_AUDIO_MODEL: 'gpt-audio-1.5'
	},
	agent: vi.fn(),
	audio: vi.fn()
}));
vi.mock('$app/environment', () => ({ dev: false }));
vi.mock('$env/dynamic/private', () => ({ env: fixtures.env }));
vi.mock('./engine-agent', () => ({ runEngineAgent: fixtures.agent }));
vi.mock('./audio', () => ({ synthesizeNarration: fixtures.audio }));
import { POST as unlock } from './archive-routes/api/access/unlock/+server';
import { POST as logout } from './archive-routes/api/access/logout/+server';
import { GET as status } from './archive-routes/api/access/status/+server';
import { POST as agent } from './archive-routes/api/agent/+server';
import { POST as narrate } from './archive-routes/api/narrate/+server';
import { DEMO_COOKIE } from './demo-access';

let revision = 0;
beforeEach(() => {
	fixtures.env.DIESEL_SESSION_SECRET = `offline-test-secret-revision-${++revision}-32-characters`;
	fixtures.agent
		.mockReset()
		.mockResolvedValue({ answer: 'Grounded test explanation.', actions: [], sources: ['PERF005'] });
	fixtures.audio.mockReset().mockResolvedValue(Buffer.from('offline-wav-fixture'));
});
function browser() {
	const stored = new Map<string, string>();
	const set = vi.fn((name: string, value: string) => stored.set(name, value));
	return {
		stored,
		set,
		event(path: string, body: unknown = {}, method = 'POST') {
			const url = new URL(`https://diesel.example${path}`);
			return {
				url,
				request: new Request(url, {
					method,
					headers: { origin: url.origin, 'content-type': 'application/json' },
					...(method === 'POST' ? { body: JSON.stringify(body) } : {})
				}),
				getClientAddress: () => '192.0.2.1',
				cookies: {
					get: (name: string) => stored.get(name),
					set,
					delete: (name: string) => stored.delete(name)
				}
			} as never;
		}
	};
}
const question = {
	message: 'Explain 75% load.',
	history: [],
	scene: { selected: null, exploded: false, load: 75 }
};

describe('invited AI HTTP boundaries', () => {
	it('blocks guide/audio without a password session before any paid SDK invocation', async () => {
		const visitor = browser();
		expect((await agent(visitor.event('/api/agent', question))).status).toBe(401);
		expect(
			(await narrate(visitor.event('/api/narrate', { text: 'A test explanation.' }))).status
		).toBe(401);
		expect(fixtures.agent).not.toHaveBeenCalled();
		expect(fixtures.audio).not.toHaveBeenCalled();
	});

	it('sets a private secure cookie, uses the saved server key and pins the sponsored model', async () => {
		const visitor = browser();
		const unlocked = await unlock(
			visitor.event('/api/access/unlock', { password: fixtures.env.DIESEL_DEMO_PASSWORD })
		);
		expect(unlocked.status).toBe(200);
		expect(visitor.set).toHaveBeenCalledWith(
			DEMO_COOKIE,
			expect.any(String),
			expect.objectContaining({ httpOnly: true, secure: true, sameSite: 'strict', path: '/' })
		);
		expect(await unlocked.json()).toMatchObject({
			mode: 'invite',
			authenticated: true,
			aiAvailable: true
		});
		const response = await agent(
			visitor.event('/api/agent', { ...question, model: 'gpt-6-astra' })
		);
		expect(response.status).toBe(200);
		expect(fixtures.agent.mock.calls[0][0]).toMatchObject({
			key: fixtures.env.OPENAI_API_KEY,
			model: 'gpt-6-sol'
		});
		expect(await response.text()).not.toContain(fixtures.env.OPENAI_API_KEY);
		expect(
			await (await status(visitor.event('/api/access/status', {}, 'GET'))).json()
		).toMatchObject({ limits: { guideRemaining: 29 } });
	});

	it('rejects wrong/tampered access, revokes logout cookies and accepts optional BYOK', async () => {
		const visitor = browser();
		expect(
			(await unlock(visitor.event('/api/access/unlock', { password: 'incorrect' }))).status
		).toBe(401);
		await unlock(
			visitor.event('/api/access/unlock', { password: fixtures.env.DIESEL_DEMO_PASSWORD })
		);
		const saved = visitor.stored.get(DEMO_COOKIE)!;
		visitor.stored.set(DEMO_COOKIE, `${saved}tampered`);
		expect((await agent(visitor.event('/api/agent', question))).status).toBe(401);
		visitor.stored.set(DEMO_COOKIE, saved);
		expect((await logout(visitor.event('/api/access/logout'))).status).toBe(200);
		visitor.stored.set(DEMO_COOKIE, saved);
		expect((await agent(visitor.event('/api/agent', question))).status).toBe(401);
		expect(
			(
				await agent(
					visitor.event('/api/agent', {
						...question,
						key: 'sk-visitor-offline-test-key-only',
						model: 'gpt-6-astra'
					})
				)
			).status
		).toBe(200);
		expect(fixtures.agent.mock.calls[0][0].model).toBe('gpt-6-astra');
	});

	it('keeps narration on the server key and cancels pending native work when a visit logs out', async () => {
		const visitor = browser();
		await unlock(
			visitor.event('/api/access/unlock', { password: fixtures.env.DIESEL_DEMO_PASSWORD })
		);
		expect((await narrate(visitor.event('/api/narrate', { text: 'Test narration.' }))).status).toBe(
			200
		);
		expect(fixtures.audio.mock.calls[0][0]).toBe(fixtures.env.OPENAI_API_KEY);
		let started!: () => void;
		const ready = new Promise<void>((resolve) => {
			started = resolve;
		});
		fixtures.agent.mockImplementation(
			(_request, signal: AbortSignal) =>
				new Promise((_resolve, reject) => {
					signal.addEventListener('abort', () => reject(new Error('offline cancellation')), {
						once: true
					});
					started();
				})
		);
		const pending = agent(visitor.event('/api/agent', question));
		await ready;
		await logout(visitor.event('/api/access/logout'));
		expect((await pending).status).toBe(504);
		expect(fixtures.agent.mock.calls[0][1].aborted).toBe(true);
	});
});
