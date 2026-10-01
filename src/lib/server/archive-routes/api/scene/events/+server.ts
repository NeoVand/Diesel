import { bearerToken, getSceneSession, subscribeScene } from '$lib/server/scene-broker';
import { ApiProblem } from '$lib/server/validation';
import { problemResponse } from '$lib/server/api-runtime';
import type { RequestHandler } from '@sveltejs/kit';
export const GET: RequestHandler = ({ request, url }) => {
	try {
		if (request.headers.get('sec-fetch-site') === 'cross-site')
			throw new ApiProblem(403, 'Scene controls must come from this application.');
		const session = getSceneSession(
			url.searchParams.get('sessionId'),
			bearerToken(request),
			url.origin
		);
		const encoder = new TextEncoder();
		let unsubscribe: (() => void) | undefined;
		let heartbeat: ReturnType<typeof setInterval> | undefined;
		const cleanup = () => {
			if (heartbeat) clearInterval(heartbeat);
			unsubscribe?.();
			unsubscribe = undefined;
			request.signal.removeEventListener('abort', cleanup);
		};
		const stream = new ReadableStream<Uint8Array>({
			start(controller) {
				unsubscribe = subscribeScene(session, (event) => {
					try {
						controller.enqueue(encoder.encode(`event: scene\ndata: ${JSON.stringify(event)}\n\n`));
					} catch {
						cleanup();
					}
				});
				heartbeat = setInterval(() => {
					session.touched = Date.now();
					try {
						controller.enqueue(encoder.encode(': keep-alive\n\n'));
					} catch {
						cleanup();
					}
				}, 15_000);
				request.signal.addEventListener('abort', cleanup, { once: true });
			},
			cancel: cleanup
		});
		return new Response(stream, {
			headers: {
				'Content-Type': 'text/event-stream',
				'Cache-Control': 'no-store',
				Connection: 'keep-alive',
				'X-Accel-Buffering': 'no'
			}
		});
	} catch (e) {
		return problemResponse(e);
	}
};
