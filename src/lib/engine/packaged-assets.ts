/** The package key is a resource-decoding key, NOT a secret or an API credential.
 * Incorporation/encryption discourages casual extraction; it is not browser DRM.
 */
import expectedAssets from './runtime-assets.json';

declare const __ENGINE_ASSET_PACKAGE_KEY__: string;

type ExpectedAssets = Record<string, { bytes: number; sha256: string }>;
interface ResourceFile {
	iv: string;
	bytes: number;
	sha256: string;
	chunks: { path: string; bytes: number; sha256: string }[];
}
interface ResourceManifest {
	version: number;
	encoding: string;
	files: Record<string, ResourceFile>;
}
const maximumChunkBytes = 8 * 1024 * 1024;
const maximumManifestBytes = 64 * 1024;
const hashPattern = /^[a-f0-9]{64}$/;
const bytesFromBase64 = (value: string) =>
	Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
async function sha256(bytes: ArrayBuffer): Promise<string> {
	return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (value) =>
		value.toString(16).padStart(2, '0')
	).join('');
}
function record(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Bound both fetched bodies and decompressed output before allocating a combined buffer. */
async function readBounded(
	stream: ReadableStream<Uint8Array> | null,
	maximumBytes: number,
	signal: AbortSignal
): Promise<ArrayBuffer> {
	if (signal.aborted) {
		await stream?.cancel(signal.reason).catch(() => {});
		signal.throwIfAborted();
	}
	if (!stream) throw new Error('The engine resource body is missing.');
	const reader = stream.getReader();
	const abort = () => {
		void reader.cancel(signal.reason).catch(() => {});
	};
	signal.addEventListener('abort', abort, { once: true });
	const chunks: Uint8Array[] = [];
	let length = 0;
	try {
		while (true) {
			signal.throwIfAborted();
			const { done, value } = await reader.read();
			signal.throwIfAborted();
			if (done) break;
			length += value.byteLength;
			if (length > maximumBytes) throw new Error('An engine resource exceeds its verified size.');
			chunks.push(value);
		}
		const bytes = new Uint8Array(length);
		let offset = 0;
		for (const chunk of chunks) {
			bytes.set(chunk, offset);
			offset += chunk.byteLength;
		}
		return bytes.buffer;
	} catch (error) {
		await reader.cancel(error).catch(() => {});
		throw error;
	} finally {
		signal.removeEventListener('abort', abort);
		reader.releaseLock();
	}
}

function verifiedManifest(value: unknown, expected: ExpectedAssets): ResourceManifest {
	if (
		!record(value) ||
		value.version !== 1 ||
		value.encoding !== 'aes-256-gcm+gzip' ||
		!record(value.files)
	)
		throw new Error('Unsupported engine resource package.');
	const names = Object.keys(value.files);
	if (
		names.length !== Object.keys(expected).length ||
		names.some((name) => !Object.hasOwn(expected, name))
	)
		throw new Error('The engine resource package does not match this application version.');
	for (const [name, reference] of Object.entries(expected)) {
		const resource = value.files[name];
		if (
			!record(resource) ||
			resource.bytes !== reference.bytes ||
			resource.sha256 !== reference.sha256 ||
			typeof resource.iv !== 'string' ||
			!Array.isArray(resource.chunks) ||
			resource.chunks.length === 0
		)
			throw new Error(`The engine resource package does not match the verified file: ${name}`);
		try {
			if (bytesFromBase64(resource.iv).byteLength !== 12) throw new Error();
		} catch {
			throw new Error('Invalid engine resource initialization vector.');
		}
		// Gzip's worst-case overhead is small; this bound permits tiny fixtures and
		// incompressible inputs while rejecting unbounded manifest fan-out/downloads.
		const maximumEncodedBytes = Math.max(1024, reference.bytes * 2);
		if (resource.chunks.length > Math.ceil(maximumEncodedBytes / maximumChunkBytes) + 1)
			throw new Error('The engine resource package has too many chunks.');
		let encodedBytes = 0;
		for (const chunk of resource.chunks) {
			if (
				!record(chunk) ||
				typeof chunk.path !== 'string' ||
				typeof chunk.sha256 !== 'string' ||
				!hashPattern.test(chunk.sha256) ||
				chunk.path !== `${chunk.sha256.slice(0, 24)}.elres` ||
				typeof chunk.bytes !== 'number' ||
				!Number.isSafeInteger(chunk.bytes) ||
				chunk.bytes <= 0 ||
				chunk.bytes > maximumChunkBytes
			)
				throw new Error('Invalid engine resource chunk.');
			encodedBytes += chunk.bytes;
		}
		if (encodedBytes < 16 || encodedBytes > maximumEncodedBytes)
			throw new Error('Invalid engine resource encoded size.');
	}
	return value as unknown as ResourceManifest;
}

/** Explicit configuration keeps tests independent of the real model and resource key. */
export function createPackagedAssetLoader(config: { key: string; expected: ExpectedAssets }) {
	return async (
		name: string,
		resourceBase: string,
		signal?: AbortSignal | null
	): Promise<Response | undefined> => {
		signal?.throwIfAborted();
		if (!config.key) return;
		if (!Object.hasOwn(config.expected, name)) throw new Error('Unknown engine resource.');
		const cancellation = new AbortController();
		const forwardAbort = () => cancellation.abort(signal?.reason);
		signal?.addEventListener('abort', forwardAbort, { once: true });
		const active = cancellation.signal;
		try {
			let rawKey: Uint8Array<ArrayBuffer>;
			try {
				rawKey = bytesFromBase64(config.key);
				if (rawKey.byteLength !== 32) throw new Error();
			} catch {
				throw new Error('The engine resource decoding key is invalid.');
			}
			const response = await fetch(`${resourceBase}/manifest.json`, { signal: active });
			if (!response.ok) throw new Error('The engine resource manifest could not be loaded.');
			const rawManifest = await readBounded(response.body, maximumManifestBytes, active);
			const manifest = verifiedManifest(
				JSON.parse(new TextDecoder().decode(rawManifest)),
				config.expected
			);
			const resource = manifest.files[name];
			const chunks = await Promise.all(
				resource.chunks.map(async (chunk) => {
					active.throwIfAborted();
					const part = await fetch(`${resourceBase}/${chunk.path}`, { signal: active });
					if (!part.ok) throw new Error('An engine resource could not be loaded. Reload to retry.');
					const bytes = await readBounded(part.body, chunk.bytes, active);
					if (bytes.byteLength !== chunk.bytes || (await sha256(bytes)) !== chunk.sha256)
						throw new Error('An engine resource failed its integrity check.');
					active.throwIfAborted();
					return new Uint8Array(bytes);
				})
			);
			active.throwIfAborted();
			const encrypted = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
			let offset = 0;
			for (const chunk of chunks) {
				encrypted.set(chunk, offset);
				offset += chunk.length;
			}
			const key = await crypto.subtle.importKey('raw', rawKey, 'AES-GCM', false, ['decrypt']);
			active.throwIfAborted();
			const compressed = await crypto.subtle.decrypt(
				{ name: 'AES-GCM', iv: bytesFromBase64(resource.iv) },
				key,
				encrypted
			);
			active.throwIfAborted();
			const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'));
			const decoded = await readBounded(stream, resource.bytes, active);
			if (decoded.byteLength !== resource.bytes || (await sha256(decoded)) !== resource.sha256)
				throw new Error('The decoded engine geometry failed its integrity check.');
			active.throwIfAborted();
			return new Response(decoded, { headers: { 'Content-Length': String(decoded.byteLength) } });
		} catch (error) {
			// Stop parallel siblings when one chunk is invalid or the caller cancels.
			cancellation.abort(error);
			throw error;
		} finally {
			signal?.removeEventListener('abort', forwardAbort);
		}
	};
}

export const packagedEngineAsset = createPackagedAssetLoader({
	key: typeof __ENGINE_ASSET_PACKAGE_KEY__ === 'undefined' ? '' : __ENGINE_ASSET_PACKAGE_KEY__,
	expected: expectedAssets
});
