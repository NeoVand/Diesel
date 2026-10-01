import { createSceneSession } from '$lib/server/scene-broker';
import { requireBrowserOrigin } from '$lib/server/scene-http';
import { readJsonRequest } from '$lib/server/validation';
import { problemResponse } from '$lib/server/api-runtime';
import type { RequestHandler } from '@sveltejs/kit';
export const POST: RequestHandler = async ({ request, url }) => {
	try {
		requireBrowserOrigin(request, url);
		const body = await readJsonRequest(request, url, 1_048_576);
		return Response.json(createSceneSession(body, url.origin), {
			headers: { 'Cache-Control': 'no-store' }
		});
	} catch (e) {
		return problemResponse(e);
	}
};
