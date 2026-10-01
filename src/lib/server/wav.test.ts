import { describe, expect, it } from 'vitest';
import { normalizeWav } from './wav';
import { pcmWavFixture } from './wav-fixtures';

describe('finite PCM WAV delivery', () => {
	it('replaces streaming placeholder sizes and preserves every sample without assuming a 44-byte header', () => {
		const fixture = pcmWavFixture(true, true);
		const normalized = normalizeWav(fixture.wav);
		expect(normalized.readUInt32LE(4)).toBe(normalized.length - 8);
		expect(normalized.readUInt32LE(fixture.dataSizeOffset)).toBe(fixture.samples.length);
		expect(normalized.subarray(fixture.dataSizeOffset + 4)).toEqual(fixture.samples);
		expect(fixture.wav.readUInt32LE(4)).toBe(0xffffffff);
		expect(fixture.dataSizeOffset).not.toBe(40);
		const duration =
			normalized.readUInt32LE(fixture.dataSizeOffset) /
			normalized.readUInt32LE(fixture.formatOffset + 8);
		expect(duration).toBeCloseTo(4 / 24_000);
	});

	it('preserves a normal finite WAV exactly', () => {
		const { wav } = pcmWavFixture(false, true);
		expect(normalizeWav(wav)).toEqual(wav);
	});

	it('rejects malformed RIFF headers, truncated chunks and incomplete PCM frames', () => {
		const badHeader = pcmWavFixture().wav;
		badHeader.write('NOPE', 0, 'ascii');
		expect(() => normalizeWav(badHeader)).toThrow();
		const oversizedChunk = pcmWavFixture();
		oversizedChunk.wav.writeUInt32LE(1000, oversizedChunk.dataSizeOffset);
		expect(() => normalizeWav(oversizedChunk.wav)).toThrow();
		const incompleteFrame = pcmWavFixture(true).wav.subarray(0, -1);
		expect(() => normalizeWav(incompleteFrame)).toThrow();
	});

	it('validates PCM format, sample alignment and byte-rate metadata', () => {
		const nonPcm = pcmWavFixture();
		nonPcm.wav.writeUInt16LE(3, nonPcm.formatOffset);
		expect(() => normalizeWav(nonPcm.wav)).toThrow();
		const wrongRate = pcmWavFixture();
		wrongRate.wav.writeUInt32LE(48_001, wrongRate.formatOffset + 8);
		expect(() => normalizeWav(wrongRate.wav)).toThrow();
	});
});
