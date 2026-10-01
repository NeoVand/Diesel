import { beforeEach, describe, expect, it, vi } from 'vitest';

const sdk = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('openai', () => ({
	default: class {
		chat = { completions: { create: sdk.create } };
	}
}));
import { synthesizeNarration } from './audio';
import { pcmWavFixture } from './wav-fixtures';

beforeEach(() => {
	vi.clearAllMocks();
});

describe('GPT Audio 1.5 narration', () => {
	it('requests AI narration with the exact selected model and validates WAV output', async () => {
		const wav = pcmWavFixture().wav;
		sdk.create.mockResolvedValue({
			choices: [{ message: { audio: { data: wav.toString('base64') } } }]
		});
		const signal = new AbortController().signal;
		expect(
			await synthesizeNarration(
				'sk-test-key-for-offline-validation',
				'A turbine drives a compressor.',
				signal
			)
		).toEqual(wav);
		expect(sdk.create.mock.calls[0][0]).toMatchObject({
			model: 'gpt-audio-1.5',
			modalities: ['text', 'audio'],
			audio: { voice: 'alloy', format: 'wav' },
			store: false
		});
		expect(sdk.create.mock.calls[0][1]).toEqual({ signal });
	});

	it('normalizes streaming WAV sizes from the model before returning audio', async () => {
		const fixture = pcmWavFixture(true, true);
		sdk.create.mockResolvedValue({
			choices: [
				{ finish_reason: 'stop', message: { audio: { data: fixture.wav.toString('base64') } } }
			]
		});
		const audio = await synthesizeNarration(
			'sk-test-key-for-offline-validation',
			'The turbine drives a compressor.',
			new AbortController().signal
		);
		expect(audio.readUInt32LE(4)).toBe(audio.length - 8);
		expect(audio.readUInt32LE(fixture.dataSizeOffset)).toBe(fixture.samples.length);
	});

	it('rejects a truncated narration rather than playing an incomplete explanation', async () => {
		sdk.create.mockResolvedValue({
			choices: [{ finish_reason: 'length', message: { audio: { data: 'partial' } } }]
		});
		await expect(
			synthesizeNarration(
				'sk-test-key-for-offline-validation',
				'Explain the turbine.',
				new AbortController().signal
			)
		).rejects.toMatchObject({
			status: 502,
			message: 'The narration was cut short. Try a shorter explanation.'
		});
	});

	it('rejects missing or non-audio output', async () => {
		sdk.create.mockResolvedValue({ choices: [{ message: { content: 'text only' } }] });
		await expect(
			synthesizeNarration(
				'sk-test-key-for-offline-validation',
				'Explain the turbine.',
				new AbortController().signal
			)
		).rejects.toMatchObject({ status: 502 });
	});
});
