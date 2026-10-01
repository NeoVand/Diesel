import { env } from '$env/dynamic/private';
import { accessContext, demoConfiguration } from '$lib/server/access-http';
import { demoAccess } from '$lib/server/demo-access';
import { problemResponse, requestDeadline, reserveRequest } from '$lib/server/api-runtime';
import { readJsonRequest, validateKey, validateModel } from '$lib/server/validation';
import { runDesignAssistant, validateDesignAssistantRequest } from '$lib/server/design-assistant';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async (event) => {
	let access: ReturnType<typeof demoAccess.reserve> = null;
	let release: (() => void) | undefined;
	let deadline: ReturnType<typeof requestDeadline> | undefined;
	try {
		const body = await readJsonRequest(event.request, event.url, 32_768);
		const input = validateDesignAssistantRequest(body);
		const context = accessContext(event);
		const credential = demoAccess.credential(demoConfiguration(), context, undefined);
		const key = validateKey(credential.key);
		const model = validateModel(env.DIESEL_AGENT_MODEL || 'gpt-6-sol');
		release = reserveRequest('agent');
		access = demoAccess.reserve(credential, context, 'agent');
		deadline = requestDeadline(event.request, 45_000);
		const signal = access ? AbortSignal.any([deadline.signal, access.signal]) : deadline.signal;
		const reply = await runDesignAssistant(input, key, model, signal);
		return Response.json(reply, { headers: { 'Cache-Control': 'no-store' } });
	} catch (error) {
		return problemResponse(error, deadline?.signal.aborted || access?.signal.aborted);
	} finally {
		access?.finish();
		deadline?.clear();
		release?.();
	}
};
