import { parts, sources } from '$lib/engine/data';
import type { SceneAction } from '$lib/engine/types';
import { knownComponentIds } from './scene-contract';

export class ApiProblem extends Error {
	constructor(
		public status: number,
		message: string
	) {
		super(message);
		this.name = 'ApiProblem';
	}
}

export type AgentRequest = {
	key: string;
	model: string;
	message: string;
	history: { role: 'user' | 'assistant'; content: string }[];
	scene: { selected: string | null; exploded: boolean; load: number };
	sceneSession?: { sessionId: string; token: string };
	requestId?: string;
};

export type AgentReply = { answer: string; actions: SceneAction[]; sources: string[] };

const partIds = new Set<string>(parts.map((part) => part.id));
const sourceIds = new Set(sources.map((source) => source.id));
const cameraViews = new Set(['perspective', 'front', 'side', 'top']);

function object(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function validateKey(value: unknown): string {
	if (typeof value !== 'string' || !/^sk-[A-Za-z0-9_-]{17,509}$/.test(value.trim())) {
		throw new ApiProblem(400, 'Enter a valid OpenAI API key in AI settings.');
	}
	return value.trim();
}

export function validateModel(value: unknown, fallback = 'gpt-6-sol'): string {
	const model = value ?? fallback;
	if (typeof model !== 'string' || !/^gpt-[a-zA-Z0-9.-]{1,80}$/.test(model)) {
		throw new ApiProblem(400, 'Choose a valid OpenAI model in AI settings.');
	}
	return model;
}

export async function readJsonRequest(
	request: Request,
	url: URL,
	byteLimit = 32_768
): Promise<Record<string, unknown>> {
	const origin = request.headers.get('origin');
	if (
		(origin !== null && origin !== url.origin) ||
		request.headers.get('sec-fetch-site') === 'cross-site'
	) {
		throw new ApiProblem(403, 'AI requests must come from this application.');
	}
	if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
		throw new ApiProblem(415, 'Send the request as JSON.');
	}
	const declaredLength = Number(request.headers.get('content-length') ?? 0);
	if (declaredLength > byteLimit) throw new ApiProblem(413, 'This request is too long.');
	const reader = request.body?.getReader();
	if (!reader) throw new ApiProblem(400, 'The request is empty.');
	const decoder = new TextDecoder();
	let body = '';
	let bytes = 0;
	try {
		while (true) {
			const chunk = await reader.read();
			if (chunk.done) break;
			bytes += chunk.value.byteLength;
			if (bytes > byteLimit) {
				await reader.cancel();
				throw new ApiProblem(413, 'This request is too long.');
			}
			body += decoder.decode(chunk.value, { stream: true });
		}
		body += decoder.decode();
	} finally {
		reader.releaseLock();
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(body);
	} catch {
		throw new ApiProblem(400, 'The request could not be read.');
	}
	if (!object(parsed)) throw new ApiProblem(400, 'The request must be a JSON object.');
	return parsed;
}

export function validateAgentRequest(
	body: Record<string, unknown>,
	defaultModel?: string
): AgentRequest {
	const key = validateKey(body.key);
	const model = validateModel(body.model, defaultModel);
	if (typeof body.message !== 'string' || !body.message.trim() || body.message.length > 2_000) {
		throw new ApiProblem(400, 'Ask a question of up to 2,000 characters.');
	}
	const history = body.history ?? [];
	if (
		!Array.isArray(history) ||
		history.length > 12 ||
		history.some(
			(item) =>
				!object(item) ||
				!['user', 'assistant'].includes(String(item.role)) ||
				typeof item.content !== 'string' ||
				item.content.length > 4_000
		)
	) {
		throw new ApiProblem(400, 'The conversation is too long. Start a new conversation.');
	}
	const scene = body.scene;
	if (
		!object(scene) ||
		(scene.selected !== null &&
			(typeof scene.selected !== 'string' || !knownComponentIds.has(scene.selected))) ||
		typeof scene.exploded !== 'boolean' ||
		typeof scene.load !== 'number' ||
		!Number.isFinite(scene.load) ||
		scene.load < 10 ||
		scene.load > 100
	) {
		throw new ApiProblem(
			400,
			'The current engine view could not be read. Reset the view and try again.'
		);
	}
	const requestId = body.requestId;
	if (
		requestId !== undefined &&
		(typeof requestId !== 'string' ||
			requestId.length !== 36 ||
			!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId))
	)
		throw new ApiProblem(400, 'The guide request identity could not be read. Please retry.');
	const session = body.sceneSession;
	if (
		session !== undefined &&
		(!object(session) ||
			typeof session.sessionId !== 'string' ||
			!/^[0-9a-f-]{36}$/i.test(session.sessionId) ||
			typeof session.token !== 'string' ||
			!/^[0-9a-f]{64}$/.test(session.token))
	)
		throw new ApiProblem(400, 'Reconnect the live engine guide.');
	return {
		key,
		model,
		message: body.message.trim(),
		history: history.map((item) => ({ role: item.role, content: item.content })),
		scene: {
			selected: scene.selected as string | null,
			exploded: scene.exploded,
			load: scene.load
		},
		...(session ? { sceneSession: session as AgentRequest['sceneSession'] } : {}),
		...(requestId ? { requestId: requestId as string } : {})
	};
}

export function validateNarrationRequest(body: Record<string, unknown>): {
	key: string;
	text: string;
} {
	const key = validateKey(body.key);
	if (typeof body.text !== 'string' || !body.text.trim() || body.text.length > 2_000) {
		throw new ApiProblem(400, 'Choose a short explanation to narrate.');
	}
	return { key, text: body.text.trim() };
}

function validAction(value: unknown): value is SceneAction {
	if (!object(value)) return false;
	const fields = Object.keys(value);
	switch (value.type) {
		case 'select':
			return fields.length === 2 && typeof value.part === 'string' && partIds.has(value.part);
		case 'explode':
		case 'isolate':
			return fields.length === 2 && typeof value.value === 'boolean';
		case 'view':
			return fields.length === 2 && typeof value.value === 'string' && cameraViews.has(value.value);
		case 'reset':
			return fields.length === 1;
		default:
			return false;
	}
}

export function parseAgentReply(raw: string): AgentReply {
	let result: unknown;
	try {
		result = JSON.parse(raw);
	} catch {
		throw new ApiProblem(502, 'The AI response could not be read. Please try again.');
	}
	if (
		!object(result) ||
		Object.keys(result).length !== 3 ||
		typeof result.answer !== 'string' ||
		!result.answer.trim() ||
		result.answer.length > 8_000 ||
		!Array.isArray(result.actions) ||
		result.actions.length > 6 ||
		!result.actions.every(validAction) ||
		!Array.isArray(result.sources) ||
		result.sources.length > 10 ||
		!result.sources.every((source) => typeof source === 'string' && sourceIds.has(source))
	) {
		throw new ApiProblem(502, 'The AI returned an unsupported engine action. Please try again.');
	}
	return {
		answer: result.answer.trim(),
		actions: result.actions,
		sources: [...new Set(result.sources)]
	};
}

export const agentOutputSchema = {
	type: 'object',
	additionalProperties: false,
	required: ['answer', 'actions', 'sources'],
	properties: {
		answer: { type: 'string' },
		actions: {
			type: 'array',
			items: {
				anyOf: [
					{
						type: 'object',
						additionalProperties: false,
						required: ['type', 'part'],
						properties: {
							type: { type: 'string', enum: ['select'] },
							part: { type: 'string', enum: [...partIds] }
						}
					},
					{
						type: 'object',
						additionalProperties: false,
						required: ['type', 'value'],
						properties: {
							type: { type: 'string', enum: ['explode', 'isolate'] },
							value: { type: 'boolean' }
						}
					},
					{
						type: 'object',
						additionalProperties: false,
						required: ['type', 'value'],
						properties: {
							type: { type: 'string', enum: ['view'] },
							value: { type: 'string', enum: [...cameraViews] }
						}
					},
					{
						type: 'object',
						additionalProperties: false,
						required: ['type'],
						properties: { type: { type: 'string', enum: ['reset'] } }
					}
				]
			}
		},
		sources: { type: 'array', items: { type: 'string', enum: [...sourceIds] } }
	}
} as const;
