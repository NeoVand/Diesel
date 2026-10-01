import { env } from '$env/dynamic/private';
import { accessContext, demoConfiguration } from '$lib/server/access-http';
import { demoAccess } from '$lib/server/demo-access';
import { synthesizeNarration } from '$lib/server/audio';
import { problemResponse, requestDeadline, reserveRequest } from '$lib/server/api-runtime';
import { readJsonRequest, validateNarrationRequest } from '$lib/server/validation';
import type { RequestHandler } from '@sveltejs/kit';

export const POST: RequestHandler = async (event) => {
	const { request, url } = event;
	let access: ReturnType<typeof demoAccess.reserve> = null;
	let release: (() => void) | undefined;
	let deadline: ReturnType<typeof requestDeadline> | undefined;
	try {
		const body = await readJsonRequest(request, url);
		const context = accessContext(event);
		const credential = demoAccess.credential(demoConfiguration(), context, body.key);
		body.key = credential.key;
		const input = validateNarrationRequest(body);
		release = reserveRequest('audio');
		access = demoAccess.reserve(credential, context, 'audio');
		deadline = requestDeadline(request, 45_000);
		const signal = access ? AbortSignal.any([deadline.signal, access.signal]) : deadline.signal;
		const audio = await synthesizeNarration(
			input.key,
			input.text,
			signal,
			env.DIESEL_AUDIO_MODEL || 'gpt-audio-1.5'
		);
		return new Response(new Uint8Array(audio), {
			headers: {
				'Content-Type': 'audio/wav',
				'Cache-Control': 'no-store',
				'X-Audio-Provenance': 'AI-generated narration'
			}
		});
	} catch (error) {
		return problemResponse(error, deadline?.signal.aborted || access?.signal.aborted);
	} finally {
		access?.finish();
		deadline?.clear();
		release?.();
	}
};
