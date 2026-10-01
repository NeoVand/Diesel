import { env } from '$env/dynamic/private';
import { accessContext, demoConfiguration } from '$lib/server/access-http';
import { demoAccess } from '$lib/server/demo-access';
import { mcpCallbackUrl } from '$lib/server/mcp-origin';
import { runEngineAgent } from '$lib/server/engine-agent';
import { problemResponse, requestDeadline, reserveRequest } from '$lib/server/api-runtime';
import { readJsonRequest, validateAgentRequest } from '$lib/server/validation';
import {
	beginSceneRun,
	finishSceneRun,
	getSceneSession,
	type SceneSession,
	type SceneRun
} from '$lib/server/scene-broker';
import type { RequestHandler } from '@sveltejs/kit';
export const POST: RequestHandler = async (event) => {
	const { request, url } = event;
	let access: ReturnType<typeof demoAccess.reserve> = null;
	let release: (() => void) | undefined;
	let deadline: ReturnType<typeof requestDeadline> | undefined;
	let session: SceneSession | undefined;
	let run: SceneRun | undefined;
	try {
		const body = await readJsonRequest(request, url);
		const context = accessContext(event);
		const credential = demoAccess.credential(demoConfiguration(), context, body.key);
		body.key = credential.key;
		// Sponsored visitors cannot choose a different or more expensive model.
		if (credential.source !== 'byok') body.model = env.DIESEL_AGENT_MODEL || 'gpt-6-sol';
		const input = validateAgentRequest(body, env.DIESEL_AGENT_MODEL || 'gpt-6-sol');
		if (credential.source !== 'byok')
			input.history = input.history
				.slice(-6)
				.map((entry) => ({ ...entry, content: entry.content.slice(0, 2_000) }));
		release = reserveRequest('agent');
		access = demoAccess.reserve(credential, context, 'agent');
		deadline = requestDeadline(request, input.sceneSession ? 90_000 : 45_000);
		const accessSignal = access
			? AbortSignal.any([deadline.signal, access.signal])
			: deadline.signal;
		if (input.sceneSession) {
			session = getSceneSession(input.sceneSession.sessionId, input.sceneSession.token, url.origin);
			run = beginSceneRun(session, accessSignal, input.requestId ?? null);
		}
		const signal = run ? AbortSignal.any([accessSignal, run.controller.signal]) : accessSignal;
		const reply = await runEngineAgent(
			input,
			signal,
			session && run
				? { url: mcpCallbackUrl(url.origin, env.DIESEL_MCP_ORIGIN), token: run.token, session }
				: undefined
		);
		return Response.json(
			{
				...reply,
				...(run ? { execution: 'acknowledged', runId: run.id, requestId: run.requestId } : {})
			},
			{ headers: { 'Cache-Control': 'no-store' } }
		);
	} catch (error) {
		return problemResponse(
			error,
			deadline?.signal.aborted || run?.controller.signal.aborted || access?.signal.aborted
		);
	} finally {
		if (session && run) finishSceneRun(session, run);
		access?.finish();
		deadline?.clear();
		release?.();
	}
};
