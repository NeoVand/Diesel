import { acknowledgeScene } from '$lib/server/scene-broker';
import { browserSceneRequest } from '$lib/server/scene-http';
import { problemResponse } from '$lib/server/api-runtime';
import type { RequestHandler } from './$types';
export const POST: RequestHandler = async ({ request, url }) => {
	try {
		const { body, session } = await browserSceneRequest(request, url);
		acknowledgeScene(session, body);
		return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
	} catch (e) {
		return problemResponse(e);
	}
};
