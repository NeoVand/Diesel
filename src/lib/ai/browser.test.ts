import { afterEach, describe, expect, it, vi } from 'vitest';
import type OpenAI from 'openai';
import { get } from 'svelte/store';
import { createLabState, applyLabAction, type LabAction } from '$lib/engine/lab-state';
import { BASELINE_DESIGN } from '$lib/design/design-core';
import { browserAI, connectBrowserAI, disconnectBrowserAI } from './session';
import { createBrowserSceneTools } from './scene';
import { runBrowserGuide, parseGuideReply, browserNarration } from './client';
import { validateDesignAssistantRequest, designAssistantPrompt } from './design';

const testKey = 'sk-browser-test-credential-1234567890';
function fixture() {
	let state = createLabState();
	const components = [{ id: 'v12-0001', name: 'Test source component' }];
	const actions: LabAction[] = [];
	const context = () => ({
		state,
		sampledAt: 100,
		actualPhase: 45,
		lesson: { id: null, step: 0, status: 'idle' as const },
		narration: 'idle' as const
	});
	const scene = createBrowserSceneTools({
		context,
		components: () => components,
		progress: vi.fn(),
		execute: async (action, _revision, signal) => {
			signal.throwIfAborted();
			actions.push(action);
			state = applyLabAction(state, action, components);
		}
	});
	return { scene, actions, context };
}
function complete(
	output: unknown[] = [],
	output_text = '{"answer":"The view is ready.","sources":[]}'
) {
	return { status: 'completed', output, output_text };
}
function call(name: string, args: unknown, id = 'call_1') {
	return {
		type: 'function_call',
		id: `fc_${id}`,
		call_id: id,
		name,
		arguments: JSON.stringify(args)
	};
}
function client(create: ReturnType<typeof vi.fn>) {
	return { responses: { create } } as unknown as Pick<OpenAI, 'responses'>;
}

afterEach(() => {
	disconnectBrowserAI();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('memory-only browser credentials', () => {
	it('requires a visitor key, shares it in memory, and clears it explicitly', () => {
		expect(() => connectBrowserAI('invalid', 'gpt-6-sol')).toThrow('valid OpenAI API key');
		connectBrowserAI(testKey, 'gpt-6-sol');
		expect(get(browserAI)).toEqual({ key: testKey, model: 'gpt-6-sol' });
		disconnectBrowserAI();
		expect(get(browserAI).key).toBe('');
	});
});

describe('local scene tool execution', () => {
	it('acknowledges applied commands and rejects stale revisions without changing state', async () => {
		const { scene, context, actions } = fixture();
		const signal = new AbortController().signal;
		expect(
			await scene.call(
				'execute_action',
				{ expectedRevision: 0, action: { type: 'display', value: 'xray' } },
				signal
			)
		).toMatchObject({ status: 'applied', state: { display: 'xray', revision: 1 } });
		expect(
			await scene.call('execute_action', { expectedRevision: 0, action: { type: 'reset' } }, signal)
		).toMatchObject({ status: 'failed', message: expect.stringContaining('Scene changed') });
		expect(context().state.display).toBe('xray');
		expect(actions).toHaveLength(1);
	});
	it('rejects unavailable identities, raw restore payloads and nonexistent performance calibration', async () => {
		const { scene, actions } = fixture();
		const signal = new AbortController().signal;
		for (const action of [
			{ type: 'select', id: 'mech:piston' },
			{ type: 'restore', value: {} },
			{ type: 'load', value: 100 }
		])
			expect(
				await scene.call('execute_action', { expectedRevision: 0, action }, signal)
			).toMatchObject({ status: 'failed' });
		expect(actions).toHaveLength(0);
	});
	it('restores an internally recorded checkpoint and never invents coordinates', async () => {
		const { scene, context } = fixture();
		const signal = new AbortController().signal;
		const checkpoint = scene.checkpoint('Original');
		await scene.call(
			'execute_action',
			{ expectedRevision: 0, action: { type: 'display', value: 'mechanism' } },
			signal
		);
		expect(
			await scene.call('restore_checkpoint', { id: checkpoint.id, expectedRevision: 1 }, signal)
		).toMatchObject({ status: 'applied' });
		expect(context().state.display).toBe('assembly');
		expect(context().state.phase).toBe(45);
	});
	it('cancels before any scene mutation', async () => {
		const { scene, actions } = fixture();
		const controller = new AbortController();
		controller.abort();
		await expect(
			scene.call(
				'execute_action',
				{ expectedRevision: 0, action: { type: 'reset' } },
				controller.signal
			)
		).rejects.toMatchObject({ name: 'AbortError' });
		expect(actions).toHaveLength(0);
	});
});

describe('Responses browser tool loop', () => {
	it('returns acknowledged scene results to OpenAI and preserves stateless reasoning context', async () => {
		connectBrowserAI(testKey, 'gpt-6-sol');
		const { scene, actions } = fixture();
		const reasoning = {
			type: 'reasoning',
			id: 'r_1',
			summary: [],
			encrypted_content: 'opaque-reasoning'
		};
		const create = vi
			.fn()
			.mockResolvedValueOnce(
				complete([
					reasoning,
					call('execute_action', {
						expectedRevision: 0,
						action: { type: 'display', value: 'xray' }
					})
				])
			)
			.mockResolvedValueOnce(complete());
		const reply = await runBrowserGuide({
			question: 'Show X-ray',
			history: [],
			scene,
			signal: new AbortController().signal,
			client: client(create)
		});
		expect(reply.answer).toBe('The view is ready.');
		expect(actions).toEqual([{ type: 'display', value: 'xray' }]);
		const request = create.mock.calls[1][0];
		expect(request.store).toBe(false);
		expect(request.parallel_tool_calls).toBe(false);
		expect(request.input).toContainEqual(reasoning);
		expect(request.input).toContainEqual(
			expect.objectContaining({
				type: 'function_call_output',
				call_id: 'call_1',
				output: expect.stringContaining('"status":"applied"')
			})
		);
		expect(JSON.stringify(request)).not.toContain(testKey);
	});
	it('does not apply a late model command after cancellation', async () => {
		connectBrowserAI(testKey, 'gpt-6-sol');
		const { scene, actions } = fixture();
		const controller = new AbortController();
		const create = vi.fn().mockImplementation(async () => {
			controller.abort();
			return complete([call('execute_action', { expectedRevision: 0, action: { type: 'reset' } })]);
		});
		await expect(
			runBrowserGuide({
				question: 'Reset',
				history: [],
				scene,
				signal: controller.signal,
				client: client(create)
			})
		).rejects.toMatchObject({ name: 'AbortError' });
		expect(actions).toHaveLength(0);
	});
	it('rejects fabricated citations and action payloads in a final answer', () => {
		expect(() => parseGuideReply('{"answer":"OK","sources":["invented-manual"]}')).toThrow(
			'unsupported'
		);
		expect(() =>
			parseGuideReply('{"answer":"OK","sources":[],"actions":[{"type":"reset"}]}')
		).toThrow('unsupported');
	});
	it('sends narration directly to the speech endpoint and returns playable audio', async () => {
		connectBrowserAI(testKey, 'gpt-6-sol');
		const fetcher = vi
			.fn()
			.mockResolvedValue(
				new Response(new Uint8Array([73, 68, 51]), { headers: { 'content-type': 'audio/mpeg' } })
			);
		vi.stubGlobal('fetch', fetcher);
		const blob = await browserNarration(
			'The engine has two cylinder banks.',
			new AbortController().signal
		);
		expect(blob.size).toBe(3);
		expect(String(fetcher.mock.calls[0][0])).toContain('https://api.openai.com/v1/audio/speech');
		expect(JSON.parse(fetcher.mock.calls[0][1].body)).toMatchObject({
			model: 'gpt-4o-mini-tts',
			input: 'The engine has two cylinder banks.',
			response_format: 'mp3'
		});
	});
});

describe('design evidence boundaries', () => {
	it('recomputes declared geometry in the browser and rejects extra mesh data', () => {
		const checked = validateDesignAssistantRequest({
			question: 'Explain this design',
			evidence: { params: BASELINE_DESIGN }
		});
		const prompt = designAssistantPrompt(checked);
		expect(prompt.browserDerived.rod.massKg).toBeGreaterThan(0);
		expect(() =>
			validateDesignAssistantRequest({
				question: 'Explain',
				evidence: { params: BASELINE_DESIGN, meshes: [1, 2, 3] }
			})
		).toThrow('summaries only');
	});
});
