import { bearerToken, sceneForRunToken } from '$lib/server/scene-broker';
import { handleSceneRpc } from '$lib/server/scene-mcp';
import { readJsonRequest } from '$lib/server/validation';
import { problemResponse } from '$lib/server/api-runtime';
import type { RequestHandler } from './$types';
export const POST: RequestHandler = async ({ request, url }) => {
	try {
		const session = sceneForRunToken(bearerToken(request));
		const body = await readJsonRequest(request, url);
		const result = await handleSceneRpc(session, body);
		return result === null
			? new Response(null, { status: 202 })
			: Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
	} catch (e) {
		return problemResponse(e);
	}
};
