import { accessContext, demoConfiguration } from '$lib/server/access-http';
import { demoAccess } from '$lib/server/demo-access';
import { ApiProblem } from '$lib/server/validation';
import { problemResponse } from '$lib/server/api-runtime';
import type { RequestHandler } from '@sveltejs/kit';

export const GET: RequestHandler = (event) => {
	try {
		if (event.request.headers.get('sec-fetch-site') === 'cross-site')
			throw new ApiProblem(403, 'Demo access must come from this application.');
		return Response.json(demoAccess.status(demoConfiguration(), accessContext(event)), {
			headers: { 'Cache-Control': 'no-store' }
		});
	} catch (error) {
		return problemResponse(error);
	}
};
