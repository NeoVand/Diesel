import { base } from '$app/paths';
import type { StructuralRequest, StructuralResult } from '../design/structural';
import type { CadExport, KernelRequest, KernelResponse, RodCadParams } from './contracts';

export interface BrowserCadOptions {
	signal?: AbortSignal;
	onProgress?: (message: string) => void;
}
let worker: Worker | undefined,
	sequence = 0;
let active: { id: number; reject: (error: Error) => void; cleanup: () => void } | undefined;

export function disposeBrowserCad(): void {
	worker?.terminate();
	worker = undefined;
	if (active) {
		const previous = active;
		active = undefined;
		previous.cleanup();
		previous.reject(new DOMException('Browser calculation cancelled.', 'AbortError'));
	}
}

function request<T extends CadExport | StructuralResult>(
	payload: { kind: 'cad'; params: RodCadParams } | { kind: 'analysis'; request: StructuralRequest },
	options: BrowserCadOptions = {}
): Promise<T> {
	if (options.signal?.aborted)
		return Promise.reject(new DOMException('Calculation cancelled.', 'AbortError'));
	if (active) return Promise.reject(new Error('A browser CAD calculation is already running.'));
	if (typeof Worker === 'undefined')
		return Promise.reject(new Error('This calculation requires browser Web Workers.'));
	worker ??= new Worker(new URL('./worker.ts', import.meta.url), {
		type: 'module',
		name: 'engine-cad-solid-analysis'
	});
	const instance = worker,
		id = ++sequence;
	return new Promise<T>((resolve, reject) => {
		const abort = () => disposeBrowserCad();
		const cleanup = () => {
			options.signal?.removeEventListener('abort', abort);
			instance.removeEventListener('message', message);
			instance.removeEventListener('error', failed);
		};
		const finish = () => {
			cleanup();
			active = undefined;
		};
		const message = (event: MessageEvent<KernelResponse>) => {
			const result = event.data;
			if (result.id !== id) return;
			if (result.kind === 'progress') {
				options.onProgress?.(result.message);
				return;
			}
			finish();
			if (result.kind === 'error') reject(new Error(result.message));
			else resolve(result.value as T);
		};
		const failed = (event: ErrorEvent) => {
			finish();
			instance.terminate();
			worker = undefined;
			reject(new Error(event.message || 'The browser CAD worker stopped.'));
		};
		active = { id, reject, cleanup };
		options.signal?.addEventListener('abort', abort, { once: true });
		instance.addEventListener('message', message);
		instance.addEventListener('error', failed);
		instance.postMessage({
			...payload,
			id,
			kernelUrl: new URL(`${base}/vendor/gmsh/gmsh.mjs`, location.href).href
		} satisfies KernelRequest);
	});
}

export const exportRodCad = (params: RodCadParams, options?: BrowserCadOptions) =>
	request<CadExport>({ kind: 'cad', params }, options);
export const runStructuralAnalysis = (analysis: StructuralRequest, options?: BrowserCadOptions) =>
	request<StructuralResult>({ kind: 'analysis', request: analysis }, options);
