import OpenAI from 'openai';
import type { ResponseInput, FunctionTool } from 'openai/resources/responses/responses';
import { sources } from '$lib/engine/data';
import { engineDefinition } from '$lib/engine/definition';
import { browserCredentials } from './session';
import { BrowserAIError } from './errors';
import { engineInstructions } from './instructions';
import { sceneTools } from './scene-tools';
import type { createBrowserSceneTools } from './scene';

export function createBrowserOpenAI() {
	const { key } = browserCredentials();
	// Explicit BYOK: this is the visitor's key, never a secret shipped by the application.
	return new OpenAI({ apiKey: key, dangerouslyAllowBrowser: true, maxRetries: 0, timeout: 90_000 });
}

/** Preserve the previous guide's low reasoning latency on GPT-5/6; other families omit it. */
export function browserReasoning(model: string) {
	return /^gpt-(5|6)(?:[.-]|$)/.test(model) ? { reasoning: { effort: 'low' as const } } : {};
}

export const guideResponseSchema = {
	type: 'object',
	additionalProperties: false,
	required: ['answer', 'sources'],
	properties: {
		answer: {
			type: 'string',
			description:
				'Concise plain-text explanation. Cite evidence through the sources field, without Markdown links or raw URLs in this text.'
		},
		sources: {
			type: 'array',
			description:
				'IDs of the evidence used in the answer. The interface renders each as a named, clickable source link.',
			items: { type: 'string', enum: sources.map((source) => source.id) }
		}
	}
};

export function parseGuideReply(text: string): { answer: string; sources: string[] } {
	let value: unknown;
	try {
		value = JSON.parse(text);
	} catch {
		throw new BrowserAIError(502, 'The assistant response could not be read. Please retry.');
	}
	if (
		typeof value !== 'object' ||
		value === null ||
		!('answer' in value) ||
		typeof value.answer !== 'string' ||
		!value.answer.trim() ||
		value.answer.length > 8000 ||
		!('sources' in value) ||
		!Array.isArray(value.sources) ||
		value.sources.length > 10 ||
		!value.sources.every((id) => sources.some((source) => source.id === id)) ||
		Object.keys(value).some((key) => !['answer', 'sources'].includes(key))
	)
		throw new BrowserAIError(502, 'The assistant returned an unsupported response. Please retry.');
	return { answer: value.answer.trim(), sources: [...new Set(value.sources)] as string[] };
}

export async function runBrowserGuide(options: {
	question: string;
	history: { role: 'user' | 'assistant'; content: string }[];
	scene: ReturnType<typeof createBrowserSceneTools>;
	signal: AbortSignal;
	client?: Pick<OpenAI, 'responses'>;
}) {
	const { question, history, scene, signal } = options;
	if (!question.trim() || question.length > 4000)
		throw new BrowserAIError(400, 'Ask a question of up to 4,000 characters.');
	const { model } = browserCredentials();
	const client = options.client ?? createBrowserOpenAI();
	const input: ResponseInput = [
		...history.slice(-12).map(({ role, content }) => ({ role, content: content.slice(0, 8000) })),
		{
			role: 'user',
			content: JSON.stringify({
				question,
				scene: scene.state(),
				engine: { assetId: engineDefinition.assetId, geometry: engineDefinition.geometry }
			})
		}
	];
	const tools: FunctionTool[] = sceneTools.map((tool) => ({
		type: 'function',
		name: tool.name,
		description: tool.description,
		parameters: tool.inputSchema,
		strict: false
	}));
	let operations = 0;
	scene.checkpoint('Before assistant exploration');
	for (let round = 0; round < 32; round++) {
		signal.throwIfAborted();
		const response = await client.responses.create(
			{
				model,
				...browserReasoning(model),
				instructions: engineInstructions,
				input,
				tools,
				store: false,
				include: ['reasoning.encrypted_content'],
				parallel_tool_calls: false,
				max_output_tokens: 6000,
				text: {
					format: {
						type: 'json_schema',
						name: 'engine_guide',
						schema: guideResponseSchema,
						strict: true
					}
				}
			},
			{ signal }
		);
		signal.throwIfAborted();
		if (response.status !== 'completed')
			throw new BrowserAIError(
				502,
				'The assistant response was incomplete. Try a shorter request.'
			);
		for (const item of response.output) {
			// Only these output types can arise from the explicitly registered local functions.
			// Preserve reasoning items (including encrypted content) for stateless tool continuation.
			if (item.type === 'message' || item.type === 'reasoning' || item.type === 'function_call')
				input.push(item);
		}
		const calls = response.output.filter((item) => item.type === 'function_call');
		if (!calls.length) return parseGuideReply(response.output_text);
		for (const call of calls) {
			signal.throwIfAborted();
			if (['execute_action', 'restore_checkpoint'].includes(call.name) && ++operations > 24)
				throw new BrowserAIError(
					400,
					'The assistant reached this request’s scene-operation limit. Continue with another question.'
				);
			let args: unknown;
			try {
				args = JSON.parse(call.arguments);
			} catch {
				args = null;
			}
			const output = await scene.call(call.name, args, signal);
			input.push({
				type: 'function_call_output',
				call_id: call.call_id,
				output: JSON.stringify(output)
			});
		}
	}
	throw new BrowserAIError(
		400,
		'The assistant reached this request’s tool limit. Continue with another question.'
	);
}

export async function browserNarration(text: string, signal: AbortSignal): Promise<Blob> {
	if (!text.trim() || text.length > 4000)
		throw new BrowserAIError(400, 'Choose an explanation of up to 4,000 characters to narrate.');
	const response = await createBrowserOpenAI().audio.speech.create(
		{
			model: 'gpt-4o-mini-tts',
			voice: 'cedar',
			input: text,
			instructions:
				'Speak in a calm, clear British English voice for an engineering demonstration. Read the text exactly, with natural pauses. Do not add commentary or engine sounds.',
			response_format: 'mp3'
		},
		{ signal }
	);
	signal.throwIfAborted();
	return response.blob();
}
