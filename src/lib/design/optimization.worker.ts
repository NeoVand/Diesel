import {
	searchRodDesigns,
	type OptimizationWorkerRequest,
	type OptimizationWorkerResponse
} from './design-core';

let activeRevision = '';
self.onmessage = async (event: MessageEvent<OptimizationWorkerRequest>) => {
	const request = event.data;
	if (request.type !== 'optimize') return;
	activeRevision = request.revision;
	const post = (reply: OptimizationWorkerResponse) => {
		if (activeRevision === request.revision) self.postMessage(reply);
	};
	try {
		const result = await searchRodDesigns(
			request.params,
			(progress) => post({ type: 'progress', revision: request.revision, progress }),
			() => activeRevision !== request.revision
		);
		post({ type: 'complete', revision: request.revision, result });
	} catch (error) {
		post({
			type: 'error',
			revision: request.revision,
			message: error instanceof Error ? error.message : 'Optimization failed.'
		});
	}
};
