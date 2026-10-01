import {
	searchOperatingDesigns,
	type OperatingSearchRequest,
	type OperatingSearchResponse
} from './operating-search';

/** Terminate this worker to cancel; main-thread revision guards must discard stale messages. */
self.onmessage = (event: MessageEvent<OperatingSearchRequest>) => {
	const request = event.data;
	if (request.type !== 'search') return;
	const post = (response: OperatingSearchResponse) => self.postMessage(response);
	try {
		const result = searchOperatingDesigns(request.params, request.scenarios, (progress) => {
			if (
				progress.stage === 'refine' ||
				progress.completed % 5 === 0 ||
				progress.completed === progress.total
			)
				post({ type: 'progress', revision: request.revision, progress });
		});
		post({ type: 'result', revision: request.revision, result });
	} catch (error) {
		post({
			type: 'error',
			revision: request.revision,
			message: error instanceof Error ? error.message : 'Operating design search failed.'
		});
	}
};
