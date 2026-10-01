import { ApiProblem } from './validation';

let activeAgentRequests = 0;
let activeAudioRequests = 0;

export function reserveRequest(kind: 'agent' | 'audio'): () => void {
	const active = kind === 'agent' ? activeAgentRequests : activeAudioRequests;
	if (active >= 4)
		throw new ApiProblem(429, 'The engineering guide is busy. Please try again in a moment.');
	if (kind === 'agent') activeAgentRequests += 1;
	else activeAudioRequests += 1;
	return () => {
		if (kind === 'agent') activeAgentRequests -= 1;
		else activeAudioRequests -= 1;
	};
}

export function requestDeadline(request: Request, timeoutMs: number) {
	const controller = new AbortController();
	const cancel = () => controller.abort();
	request.signal.addEventListener('abort', cancel, { once: true });
	if (request.signal.aborted) cancel();
	const timer = setTimeout(cancel, timeoutMs);
	return {
		signal: controller.signal,
		clear() {
			clearTimeout(timer);
			request.signal.removeEventListener('abort', cancel);
		}
	};
}

export function problemResponse(error: unknown, aborted = false): Response {
	let status = 503;
	let message =
		'The AI service could not connect. Check your API key, model access, and the server runtime.';
	if (error instanceof ApiProblem) {
		status = error.status;
		message = error.message;
	} else if (aborted) {
		status = 504;
		message = 'The AI request timed out. Please try a shorter question.';
	} else {
		// Never send or log the raw upstream error: a CLI exception may contain request or credential details.
		const upstreamStatus =
			typeof error === 'object' && error !== null && 'status' in error ? error.status : undefined;
		const hint = error instanceof Error ? error.message : '';
		if (
			upstreamStatus === 401 ||
			upstreamStatus === 403 ||
			/(?:401|403|invalid_api_key|unauthorized)/i.test(hint)
		) {
			status = 401;
			message =
				'OpenAI rejected this API key or model access. Check AI settings and your OpenAI project.';
		} else if (
			upstreamStatus === 404 ||
			/(?:model_not_found|(?:status|HTTP)\s*(?:code)?[:=]?\s*404)/i.test(hint)
		) {
			status = 404;
			message =
				'The selected OpenAI model is unavailable to this project. Choose a model your API key can access.';
		} else if (
			upstreamStatus === 400 ||
			/(?:unsupported_parameter|invalid_request_error|(?:status|HTTP)\s*(?:code)?[:=]?\s*400)/i.test(
				hint
			)
		) {
			status = 400;
			message =
				'OpenAI rejected the model or request settings. Check model access and the AI configuration.';
		} else if (upstreamStatus === 429 || /(?:429|rate.limit|quota)/i.test(hint)) {
			status = 429;
			message =
				'Your OpenAI project reached a rate or usage limit. Try again later or check project billing.';
		}
	}
	return Response.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } });
}
