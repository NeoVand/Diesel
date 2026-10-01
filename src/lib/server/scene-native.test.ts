import { describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Codex } from '@openai/codex-sdk';
import { createLabState, applyLabAction } from '$lib/engine/lab-state';
import { harnessOptions } from './engine-agent';
import {
	createSceneSession,
	getSceneSession,
	beginSceneRun,
	subscribeScene,
	acknowledgeScene,
	sceneForRunToken,
	finishSceneRun,
	clearSceneSessionsForTests
} from './scene-broker';
import { handleSceneRpc } from './scene-mcp';

/** Real installed native runtime, exclusively local mock inference; no API credential or billable call. */
describe('offline native Codex scene-tool round trip', () => {
	it('queries the actual broker, executes a command, observes its browser acknowledgement and then answers', async () => {
		let modelCalls = 0;
		let toolResultObserved = false;
		const directory = await mkdtemp(join(tmpdir(), 'diesel-native-scene-test-'));
		const server = createServer(async (request, response) => {
			let text = '';
			for await (const chunk of request) text += chunk;
			const body = JSON.parse(text || '{}');
			if (request.url === '/mcp') {
				try {
					const session = sceneForRunToken(
						String(request.headers.authorization ?? '').replace(/^Bearer /, '')
					);
					const result = await handleSceneRpc(session, body);
					response.writeHead(result ? 200 : 202, { 'Content-Type': 'application/json' });
					response.end(result ? JSON.stringify(result) : '');
				} catch {
					response.writeHead(401);
					response.end();
				}
				return;
			}
			if (request.url === '/v1/responses' && request.method === 'POST') {
				modelCalls++;
				if (modelCalls === 3)
					toolResultObserved =
						JSON.stringify(body.input).includes('350') &&
						JSON.stringify(body.input).includes('applied');
				const item =
					modelCalls <= 2
						? {
								type: 'custom_tool_call',
								id: `fc_${modelCalls}`,
								call_id: `call_${modelCalls}`,
								name: 'exec',
								namespace: 'functions',
								input:
									modelCalls === 1
										? 'text(await tools.mcp__engine__get_state({}));'
										: 'text(await tools.mcp__engine__execute_action({expectedRevision:0,action:{type:"seek",value:350}}));'
							}
						: {
								type: 'message',
								id: 'msg_final',
								role: 'assistant',
								status: 'completed',
								content: [
									{
										type: 'output_text',
										text: '{"answer":"The educational mechanism is paused at350degrees.","actions":[],"sources":[]}'
									}
								]
							};
				response.writeHead(200, { 'Content-Type': 'text/event-stream' });
				const emit = (type: string, extra: Record<string, unknown>) =>
					response.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...extra })}\n\n`);
				emit('response.created', {
					response: {
						id: `response_${modelCalls}`,
						object: 'response',
						status: 'in_progress',
						output: []
					}
				});
				emit('response.output_item.added', { output_index: 0, item });
				emit('response.output_item.done', { output_index: 0, item });
				emit('response.completed', {
					response: {
						id: `response_${modelCalls}`,
						object: 'response',
						status: 'completed',
						output: [item],
						usage: { input_tokens: 100, output_tokens: 10, total_tokens: 110 }
					}
				});
				response.end();
				return;
			}
			response.writeHead(404);
			response.end();
		});
		let session: ReturnType<typeof getSceneSession> | undefined;
		let run: ReturnType<typeof beginSceneRun> | undefined;
		try {
			await new Promise<void>((resolve, reject) => {
				server.once('error', reject);
				server.listen(0, '127.0.0.1', resolve);
			});
			const address = server.address();
			if (!address || typeof address === 'string') throw new Error('Local fixture unavailable');
			const origin = `http://127.0.0.1:${address.port}`;
			const components = [{ id: 'v12-0003', name: 'Source piston01', parent: 'block' }];
			const connection = createSceneSession({ state: createLabState(), components }, origin);
			session = getSceneSession(connection.sessionId, connection.token, origin);
			const active = session;
			subscribeScene(active, (event) => {
				if (event.type === 'command')
					queueMicrotask(() => {
						const state = applyLabAction(active.context.state, event.action, components);
						acknowledgeScene(active, {
							id: event.id,
							runId: event.runId,
							status: 'applied',
							state,
							actualPhase: 350
						});
					});
			});
			run = beginSceneRun(active, new AbortController().signal);
			await mkdir(join(directory, 'state'));
			await mkdir(join(directory, 'workspace'));
			const options = harnessOptions(
				'sk-offline-fixture-not-a-real-key',
				join(directory, 'state'),
				{ url: origin + '/mcp', token: run.token, session: active }
			);
			const codex = new Codex({
				...options,
				baseUrl: origin + '/v1',
				config: {
					...options.config,
					model_provider: 'diesel_offline',
					model_providers: {
						diesel_offline: {
							name: 'Offline fixture',
							base_url: origin + '/v1',
							wire_api: 'responses',
							supports_websockets: false,
							requires_openai_auth: true
						}
					}
				}
			});
			const thread = codex.startThread({
				model: 'gpt-6-sol',
				workingDirectory: join(directory, 'workspace'),
				skipGitRepoCheck: true,
				sandboxMode: 'read-only',
				networkAccessEnabled: false,
				webSearchMode: 'disabled',
				approvalPolicy: 'never'
			});
			const result = await thread.run(
				'Read engine state, seek350degrees, verify actual result, then answer.',
				{ signal: AbortSignal.timeout(15_000) }
			);
			expect(modelCalls).toBe(3);
			expect(toolResultObserved).toBe(true);
			expect(active.context.actualPhase).toBe(350);
			expect(active.context.state.revision).toBe(1);
			expect(
				result.items.filter((item) => item.type === 'mcp_tool_call').map((item) => item.status)
			).toEqual(['completed', 'completed']);
		} finally {
			if (session && run) finishSceneRun(session, run);
			clearSceneSessionsForTests();
			server.closeAllConnections();
			await new Promise<void>((resolve) => server.close(() => resolve()));
			await rm(directory, { recursive: true, force: true });
		}
	}, 20_000);
});
