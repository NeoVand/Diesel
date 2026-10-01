import { ApiProblem } from './validation';

const placeholderSize = 0xffffffff;

function malformed(): never {
	throw new ApiProblem(
		502,
		'The voice model returned malformed or incomplete audio. Try a shorter explanation.'
	);
}

/** Converts OpenAI's streaming RIFF/data sizes to finite sizes without changing PCM samples. */
export function normalizeWav(input: Buffer): Buffer {
	if (
		input.length < 44 ||
		input.length > 21_000_000 ||
		input.subarray(0, 4).toString('ascii') !== 'RIFF' ||
		input.subarray(8, 12).toString('ascii') !== 'WAVE'
	)
		malformed();
	const riffSize = input.readUInt32LE(4);
	if (riffSize !== placeholderSize && riffSize !== input.length - 8) malformed();
	const output = Buffer.from(input);
	let position = 12;
	let blockAlignment: number | undefined;
	let foundData = false;
	while (position < input.length) {
		if (input.length - position < 8) malformed();
		const name = input.subarray(position, position + 4).toString('ascii');
		const declaredSize = input.readUInt32LE(position + 4);
		const payloadStart = position + 8;
		if (declaredSize === placeholderSize && name !== 'data') malformed();
		// A streaming data chunk extends to EOF; finite chunks retain their declared boundaries and padding.
		const payloadSize =
			declaredSize === placeholderSize ? input.length - payloadStart : declaredSize;
		if (payloadSize > input.length - payloadStart) malformed();
		if (name === 'fmt ') {
			if (blockAlignment !== undefined || payloadSize < 16) malformed();
			const format = input.readUInt16LE(payloadStart);
			const channels = input.readUInt16LE(payloadStart + 2);
			const sampleRate = input.readUInt32LE(payloadStart + 4);
			const byteRate = input.readUInt32LE(payloadStart + 8);
			const alignment = input.readUInt16LE(payloadStart + 12);
			const bitsPerSample = input.readUInt16LE(payloadStart + 14);
			if (
				format !== 1 ||
				channels < 1 ||
				channels > 8 ||
				sampleRate === 0 ||
				sampleRate > 384_000 ||
				![8, 16, 24, 32].includes(bitsPerSample) ||
				alignment !== channels * (bitsPerSample / 8) ||
				byteRate !== sampleRate * alignment
			)
				malformed();
			blockAlignment = alignment;
		} else if (name === 'data') {
			if (
				foundData ||
				blockAlignment === undefined ||
				payloadSize === 0 ||
				payloadSize % blockAlignment !== 0
			)
				malformed();
			foundData = true;
			if (declaredSize === placeholderSize) output.writeUInt32LE(payloadSize, position + 4);
		}
		position = payloadStart + payloadSize + (payloadSize % 2);
		if (position > input.length) malformed();
	}
	if (blockAlignment === undefined || !foundData) malformed();
	output.writeUInt32LE(input.length - 8, 4);
	return output;
}
