import { accessContext, demoConfiguration, demoCookieOptions } from '$lib/server/access-http';
import { demoAccess, DEMO_COOKIE } from '$lib/server/demo-access';
import { problemResponse } from '$lib/server/api-runtime';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = (event) => {
	try {
		const status = demoAccess.logout(demoConfiguration(), accessContext(event));
		event.cookies.delete(DEMO_COOKIE, demoCookieOptions);
		return Response.json(status, { headers: { 'Cache-Control': 'no-store' } });
	} catch (error) {
		return problemResponse(error);
	}
};
