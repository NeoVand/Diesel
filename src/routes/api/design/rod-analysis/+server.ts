import { runStructuralAnalysis, validateStructuralRequest } from '$lib/server/design-structural';
import { ApiProblem, readJsonRequest } from '$lib/server/validation';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, url }) => {
	try {
		const origin = request.headers.get('origin');
		if (
			(origin !== null && origin !== url.origin) ||
			request.headers.get('sec-fetch-site') === 'cross-site'
		)
			throw new ApiProblem(403, 'Solid analyses must come from this application.');
		const input = validateStructuralRequest(await readJsonRequest(request, url, 8192));
		return Response.json(await runStructuralAnalysis(input), {
			headers: { 'Cache-Control': 'no-store' }
		});
	} catch (error) {
		return Response.json(
			{
				error:
					error instanceof ApiProblem
						? error.message
						: 'The native solid solver could not complete this request.'
			},
			{
				status: error instanceof ApiProblem ? error.status : 503,
				headers: { 'Cache-Control': 'no-store' }
			}
		);
	}
};
