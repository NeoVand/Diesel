import { base } from '$app/paths';
import expectedAssets from './runtime-assets.json';
import { packagedEngineAsset } from './packaged-assets';

export const ENGINE_ASSET_FILES = [
	'v12-review.glb',
	'v12-cams-refined.glb',
	'v12-clearance-refined.json',
	'v12-clearance-refined.bin',
	'v12-chamber-domains.bin'
] as const;
const databaseName = 'engine-lab-licensed-assets-v1';
const requestEvent = 'engine-lab:missing-assets';

/** Absolute application paths remain correct on project Pages and nested routes. */
export function engineAssetUrl(path: string): string {
	if (base && (path === base || path.startsWith(`${base}/`))) return path;
	return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}
function database(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		let blocked = false;
		const request = indexedDB.open(databaseName, 1);
		request.onupgradeneeded = () => request.result.createObjectStore('files');
		request.onsuccess = () => {
			if (blocked) {
				request.result.close();
				return;
			}
			request.result.onversionchange = () => request.result.close();
			resolve(request.result);
		};
		request.onerror = () => reject(request.error);
		request.onblocked = () => {
			blocked = true;
			reject(new Error('Close other Engine Lab tabs and retry. The local model store is locked.'));
		};
	});
}
async function localFile(name: string): Promise<Blob | undefined> {
	if (typeof indexedDB === 'undefined') return undefined;
	const db = await database();
	try {
		return await new Promise((resolve, reject) => {
			const request = db.transaction('files').objectStore('files').get(name);
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
	} finally {
		db.close();
	}
}

/** The licensed bundle never leaves this browser; all writes commit atomically. */
export async function importEngineAssets(files: File[]): Promise<void> {
	const byName = new Map(files.map((file) => [file.name, file]));
	const missing = ENGINE_ASSET_FILES.filter((name) => !byName.has(name));
	if (missing.length) throw new Error(`Missing files: ${missing.join(', ')}`);
	for (const name of ENGINE_ASSET_FILES) {
		const file = byName.get(name)!;
		if (!file.size || file.size > 256 * 1024 * 1024) throw new Error(`Invalid file size: ${name}`);
		const expected = expectedAssets[name];
		if (file.size !== expected.bytes)
			throw new Error(
				`${name} belongs to a different runtime bundle. Use the files prepared for this application version.`
			);
		const checksum = Array.from(
			new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer())),
			(value) => value.toString(16).padStart(2, '0')
		).join('');
		if (checksum !== expected.sha256)
			throw new Error(
				`${name} failed its integrity check. The existing local model has not been replaced.`
			);
		if (name.endsWith('.glb')) {
			const magic = new Uint8Array(await file.slice(0, 4).arrayBuffer());
			if (magic.join() !== '103,108,84,70') throw new Error(`${name} is not a GLB file.`);
		}
	}
	const correction = JSON.parse(await byName.get('v12-clearance-refined.json')!.text());
	const bytes = await byName.get('v12-clearance-refined.bin')!.arrayBuffer();
	const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (value) =>
		value.toString(16).padStart(2, '0')
	).join('');
	if (correction.byteLength !== bytes.byteLength || correction.binarySha256 !== digest)
		throw new Error(
			'The clearance manifest and binary do not match. Select one complete runtime bundle.'
		);
	const db = await database();
	try {
		await new Promise<void>((resolve, reject) => {
			const transaction = db.transaction('files', 'readwrite');
			for (const name of ENGINE_ASSET_FILES)
				transaction.objectStore('files').put(byName.get(name), name);
			transaction.oncomplete = () => resolve();
			transaction.onerror = () => reject(transaction.error);
			transaction.onabort = () =>
				reject(transaction.error ?? new Error('File storage was cancelled.'));
		});
	} finally {
		db.close();
	}
}
export function requestEngineAssets(): void {
	if (typeof window !== 'undefined') window.dispatchEvent(new Event(requestEvent));
}
export function onEngineAssetsNeeded(callback: () => void): () => void {
	window.addEventListener(requestEvent, callback);
	return () => window.removeEventListener(requestEvent, callback);
}
export async function fetchEngineAsset(path: string, options?: RequestInit): Promise<Response> {
	options?.signal?.throwIfAborted();
	const name = path.split('/').at(-1)!;
	if ((ENGINE_ASSET_FILES as readonly string[]).includes(name)) {
		try {
			const blob = await localFile(name);
			options?.signal?.throwIfAborted();
			if (blob) return new Response(blob, { headers: { 'Content-Length': String(blob.size) } });
		} catch (error) {
			if (options?.signal?.aborted) throw error;
			// Private browsing may deny IndexedDB; hosted assets remain usable.
		}
	}
	let response: Response;
	try {
		if ((ENGINE_ASSET_FILES as readonly string[]).includes(name)) {
			const packaged = await packagedEngineAsset(
				name,
				engineAssetUrl('/engine-runtime'),
				options?.signal
			);
			if (packaged) return packaged;
		}
		response = await fetch(engineAssetUrl(path), options);
	} catch (error) {
		if (!options?.signal?.aborted && (ENGINE_ASSET_FILES as readonly string[]).includes(name))
			requestEngineAssets();
		throw error;
	}
	if (!response.ok && (ENGINE_ASSET_FILES as readonly string[]).includes(name))
		requestEngineAssets();
	return response;
}
