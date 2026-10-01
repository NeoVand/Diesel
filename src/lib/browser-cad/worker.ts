/// <reference lib="webworker" />
import { runBrowserAnalysis } from './analysis';
import type { KernelRequest, KernelResponse } from './contracts';
import { exportVerifiedCad, loadKernel, type CadKernel } from './kernel';

let kernel: Promise<CadKernel> | undefined;
let active = false;
const send = (message: KernelResponse) => self.postMessage(message);
self.onmessage = async (event: MessageEvent<KernelRequest>) => {
	const job = event.data;
	if (active) {
		send({ id: job.id, kind: 'error', message: 'A browser CAD job is already running.' });
		return;
	}
	active = true;
	try {
		if (!self.crossOriginIsolated)
			throw new Error(
				'Browser CAD requires cross-origin isolation. Reload after the local isolation service worker activates.'
			);
		send({
			id: job.id,
			kind: 'progress',
			message: kernel ? 'Preparing browser CAD…' : 'Loading the CAD/meshing WebAssembly module…'
		});
		kernel ??= loadKernel(job.kernelUrl).catch((error) => {
			// A failed download/initialization must not poison every later retry.
			kernel = undefined;
			throw error;
		});
		const instance = await kernel;
		if (job.kind === 'cad')
			send({ id: job.id, kind: 'cad', value: await exportVerifiedCad(instance, job.params) });
		else
			send({
				id: job.id,
				kind: 'analysis',
				value: await runBrowserAnalysis(instance, job.request, (message) =>
					send({ id: job.id, kind: 'progress', message })
				)
			});
	} catch (error) {
		send({
			id: job.id,
			kind: 'error',
			message: error instanceof Error ? error.message : 'The browser CAD calculation failed.'
		});
	} finally {
		active = false;
	}
};
