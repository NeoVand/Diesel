import { createCipheriv, createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPackagedAssetLoader } from './packaged-assets';

const name = 'synthetic-engine.glb';
const base = '/Diesel/engine-runtime';
const testKey = Buffer.alloc(32, 7);
const original = Uint8Array.from({ length: 263 }, (_, index) => (index * 17) % 251);
const hash = (data: Uint8Array) => createHash('sha256').update(data).digest('hex');

function fixture(data: Uint8Array = original, reference: Uint8Array = data, split = false) {
	const iv = Buffer.alloc(12, 5);
	const cipher = createCipheriv('aes-256-gcm', testKey, iv);
	const compressed = gzipSync(data);
	const encrypted = Buffer.concat([cipher.update(compressed), cipher.final(), cipher.getAuthTag()]);
	const parts = split
		? [
				encrypted.subarray(0, Math.floor(encrypted.length / 2)),
				encrypted.subarray(Math.floor(encrypted.length / 2))
			]
		: [encrypted];
	const chunks = parts.map((part) => ({
		path: `${hash(part).slice(0, 24)}.elres`,
		bytes: part.length,
		sha256: hash(part)
	}));
	const expected = { [name]: { bytes: reference.length, sha256: hash(reference) } };
	const manifest = {
		version: 1,
		encoding: 'aes-256-gcm+gzip',
		files: {
			[name]: { ...expected[name], iv: iv.toString('base64'), chunks }
		}
	};
	const bodies = new Map(
		parts.map((part, index) => [`${base}/${chunks[index].path}`, new Uint8Array(part)])
	);
	const fetcher = vi.fn(async (input: RequestInfo | URL) => {
		const url = String(input);
		if (url === `${base}/manifest.json`) return Response.json(manifest);
		const body = bodies.get(url);
		if (!body) return new Response(null, { status: 404 });
		return new Response(new Uint8Array(body));
	});
	const loader = createPackagedAssetLoader({ key: testKey.toString('base64'), expected });
	return { loader, fetcher, expected, manifest, bodies, chunks };
}
afterEach(() => vi.unstubAllGlobals());

describe('packaged engine resources', () => {
	it('reconstructs identical binary bytes across encrypted chunks and respects the application base path', async () => {
		const sample = fixture(original, original, true);
		vi.stubGlobal('fetch', sample.fetcher);
		const response = await sample.loader(name, base);
		expect(new Uint8Array(await response!.arrayBuffer())).toEqual(original);
		expect(response!.headers.get('Content-Length')).toBe(String(original.length));
		expect(sample.fetcher.mock.calls.map(([url]) => url)).toEqual([
			`${base}/manifest.json`,
			...sample.chunks.map((chunk) => `${base}/${chunk.path}`)
		]);
	});

	it('leaves the local-import path available when no package key is configured', async () => {
		const sample = fixture();
		vi.stubGlobal('fetch', sample.fetcher);
		const loader = createPackagedAssetLoader({ key: '', expected: sample.expected });
		expect(await loader(name, base)).toBeUndefined();
		expect(sample.fetcher).not.toHaveBeenCalled();
	});

	it('rejects a pre-aborted request before making any network request', async () => {
		const sample = fixture();
		vi.stubGlobal('fetch', sample.fetcher);
		const controller = new AbortController();
		controller.abort();
		await expect(sample.loader(name, base, controller.signal)).rejects.toMatchObject({
			name: 'AbortError'
		});
		expect(sample.fetcher).not.toHaveBeenCalled();
	});

	it('rejects ciphertext tampering against its chunk digest', async () => {
		const sample = fixture();
		sample.bodies.get(`${base}/${sample.chunks[0].path}`)![3] ^= 0xff;
		vi.stubGlobal('fetch', sample.fetcher);
		await expect(sample.loader(name, base)).rejects.toThrow('integrity check');
	});

	it('still rejects tampering when an attacker rewrites the public chunk hash and path', async () => {
		const sample = fixture();
		const oldPath = `${base}/${sample.chunks[0].path}`;
		const changed = sample.bodies.get(oldPath)!;
		changed[3] ^= 0xff;
		const digest = hash(changed);
		sample.chunks[0].sha256 = digest;
		sample.chunks[0].path = `${digest.slice(0, 24)}.elres`;
		sample.bodies.delete(oldPath);
		sample.bodies.set(`${base}/${sample.chunks[0].path}`, changed);
		vi.stubGlobal('fetch', sample.fetcher);
		await expect(sample.loader(name, base)).rejects.toMatchObject({ name: 'OperationError' });
	});

	it('pins the fetched manifest to the checked-in runtime identity before requesting chunks', async () => {
		const sample = fixture();
		sample.manifest.files[name].sha256 = 'f'.repeat(64);
		vi.stubGlobal('fetch', sample.fetcher);
		await expect(sample.loader(name, base)).rejects.toThrow('does not match the verified file');
		expect(sample.fetcher).toHaveBeenCalledTimes(1);
	});

	it('requires the exact expected file set, excluding added or missing resources', async () => {
		const sample = fixture();
		Object.assign(sample.manifest.files, { 'unexpected.glb': sample.manifest.files[name] });
		vi.stubGlobal('fetch', sample.fetcher);
		await expect(sample.loader(name, base)).rejects.toThrow(
			'does not match this application version'
		);
		expect(sample.fetcher).toHaveBeenCalledTimes(1);
	});

	it('rejects paths outside the content-addressed resource directory', async () => {
		const sample = fixture();
		sample.chunks[0].path = '../private/source.glb';
		vi.stubGlobal('fetch', sample.fetcher);
		await expect(sample.loader(name, base)).rejects.toThrow('Invalid engine resource chunk');
		expect(sample.fetcher).toHaveBeenCalledTimes(1);
	});

	it('rejects authenticated, same-length substituted plaintext against the pinned decoded digest', async () => {
		const changed = new Uint8Array(original);
		changed[10] ^= 0xff;
		const sample = fixture(changed, original);
		vi.stubGlobal('fetch', sample.fetcher);
		await expect(sample.loader(name, base)).rejects.toThrow(
			'decoded engine geometry failed its integrity check'
		);
	});

	it('rejects decompression beyond the pinned output size', async () => {
		const sample = fixture(new Uint8Array(32768).fill(65), new Uint8Array(8).fill(65));
		vi.stubGlobal('fetch', sample.fetcher);
		await expect(sample.loader(name, base)).rejects.toThrow('exceeds its verified size');
	});

	it('stops a chunk response as soon as it exceeds the declared size', async () => {
		const sample = fixture();
		const path = `${base}/${sample.chunks[0].path}`;
		sample.bodies.set(path, new Uint8Array(sample.chunks[0].bytes + 1));
		vi.stubGlobal('fetch', sample.fetcher);
		await expect(sample.loader(name, base)).rejects.toThrow('exceeds its verified size');
	});

	it('bounds the manifest body before parsing it', async () => {
		const sample = fixture();
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response(' '.repeat(65537)))
		);
		await expect(sample.loader(name, base)).rejects.toThrow('exceeds its verified size');
	});

	it('cancels a pending response stream when the caller aborts', async () => {
		const sample = fixture();
		const cancelled = vi.fn();
		const began = Promise.withResolvers<void>();
		vi.stubGlobal(
			'fetch',
			vi.fn(async (url: RequestInfo | URL) => {
				if (String(url).endsWith('/manifest.json')) return Response.json(sample.manifest);
				return new Response(
					new ReadableStream<Uint8Array>({
						start(controller) {
							controller.enqueue(new Uint8Array(2));
							began.resolve();
						},
						cancel: cancelled
					})
				);
			})
		);
		const controller = new AbortController();
		const loading = sample.loader(name, base, controller.signal);
		await began.promise;
		controller.abort();
		await expect(loading).rejects.toMatchObject({ name: 'AbortError' });
		expect(cancelled).toHaveBeenCalledTimes(1);
	});

	it('aborts sibling chunk requests after a failed integrity check', async () => {
		const sample = fixture(original, original, true);
		const cancelled = vi.fn();
		vi.stubGlobal(
			'fetch',
			vi.fn(async (url: RequestInfo | URL) => {
				if (String(url).endsWith('/manifest.json')) return Response.json(sample.manifest);
				if (String(url).endsWith(sample.chunks[0].path))
					return new Response(new Uint8Array(sample.chunks[0].bytes));
				return new Response(new ReadableStream<Uint8Array>({ cancel: cancelled }));
			})
		);
		await expect(sample.loader(name, base)).rejects.toThrow('integrity check');
		expect(cancelled).toHaveBeenCalledTimes(1);
	});
});
