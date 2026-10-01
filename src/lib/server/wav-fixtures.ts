/** Small valid PCM fixture for offline audio-contract tests; never used by the app. */
export function pcmWavFixture(streaming = false, metadata = false) {
	const format = Buffer.alloc(16);
	format.writeUInt16LE(1, 0);
	format.writeUInt16LE(1, 2);
	format.writeUInt32LE(24_000, 4);
	format.writeUInt32LE(48_000, 8);
	format.writeUInt16LE(2, 12);
	format.writeUInt16LE(16, 14);
	const samples = Buffer.from([0, 0, 100, 0, 0, 0, 156, 255]);
	const chunk = (name: string, data: Buffer) => {
		const header = Buffer.alloc(8);
		header.write(name, 0, 'ascii');
		header.writeUInt32LE(data.length, 4);
		return Buffer.concat([header, data, ...(data.length % 2 ? [Buffer.alloc(1)] : [])]);
	};
	const metadataChunk = metadata ? chunk('JUNK', Buffer.from('metadata!')) : Buffer.alloc(0);
	const formatChunk = chunk('fmt ', format);
	const dataChunk = chunk('data', samples);
	const header = Buffer.alloc(12);
	header.write('RIFF', 0, 'ascii');
	header.write('WAVE', 8, 'ascii');
	const wav = Buffer.concat([header, metadataChunk, formatChunk, dataChunk]);
	const formatOffset = 12 + metadataChunk.length + 8;
	const dataSizeOffset = 12 + metadataChunk.length + formatChunk.length + 4;
	wav.writeUInt32LE(streaming ? 0xffffffff : wav.length - 8, 4);
	if (streaming) wav.writeUInt32LE(0xffffffff, dataSizeOffset);
	return { wav, samples, formatOffset, dataSizeOffset };
}
