import { accessContext, demoConfiguration, demoCookieOptions } from '$lib/server/access-http';
import { demoAccess, DEMO_COOKIE } from '$lib/server/demo-access';
import { readJsonRequest } from '$lib/server/validation';
import { problemResponse } from '$lib/server/api-runtime';
import type { RequestHandler } from '@sveltejs/kit';

export const POST: RequestHandler = async (event) => {
	try {
		const body = await readJsonRequest(event.request, event.url, 1_024);
		const result = demoAccess.unlock(demoConfiguration(), accessContext(event), body.password);
		event.cookies.set(DEMO_COOKIE, result.cookie, { ...demoCookieOptions, maxAge: result.maxAge });
		return Response.json(result.status, { headers: { 'Cache-Control': 'no-store' } });
	} catch (error) {
		return problemResponse(error);
	}
};
