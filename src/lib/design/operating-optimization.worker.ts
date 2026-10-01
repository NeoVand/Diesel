import type { OperatingSearchRequest, OperatingSearchResponse } from './operating-search';
import { searchOperatingDesignsBrowser } from './gpu-operating-search';

let activeRevision = '';
let queue = Promise.resolve();
/** Termination cancels immediately; a revision change also prevents stale GPU completions. */
self.onmessage = (
	event: MessageEvent<OperatingSearchRequest | { type: 'cancel'; revision: string }>
) => {
	const request = event.data;
	if (request.type === 'cancel') {
		if (activeRevision === request.revision) activeRevision = '';
		return;
	}
	if (request.type !== 'search') return;
	activeRevision = request.revision;
	const post = (response: OperatingSearchResponse) => {
		if (activeRevision === request.revision) self.postMessage(response);
	};
	queue = queue.then(async () => {
		if (activeRevision !== request.revision) return;
		try {
			const result = await searchOperatingDesignsBrowser(
				request.params,
				request.scenarios,
				(progress) => {
					if (
						progress.stage === 'refine' ||
						progress.completed % 5 === 0 ||
						progress.completed === progress.total
					)
						post({ type: 'progress', revision: request.revision, progress });
				},
				() => activeRevision !== request.revision,
				request.compute ?? 'auto'
			);
			post({ type: 'result', revision: request.revision, result });
		} catch (error) {
			post({
				type: 'error',
				revision: request.revision,
				message: error instanceof Error ? error.message : 'Operating design search failed.'
			});
		}
	});
};
