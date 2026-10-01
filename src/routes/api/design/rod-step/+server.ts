import { exportRodCad, validateRodCadRequest } from '$lib/server/design-cad';
import { ApiProblem, readJsonRequest } from '$lib/server/validation';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, url }) => {
	try {
		const origin = request.headers.get('origin');
		if (
			(origin !== null && origin !== url.origin) ||
			request.headers.get('sec-fetch-site') === 'cross-site'
		)
			throw new ApiProblem(403, 'CAD requests must come from this application.');
		const { params, format } = validateRodCadRequest(await readJsonRequest(request, url, 4096));
		const { step, report } = await exportRodCad(params);
		if (format === 'json')
			return Response.json(report, { headers: { 'Cache-Control': 'no-store' } });
		return new Response(step as BodyInit, {
			headers: {
				'Content-Type': 'application/step',
				'Content-Disposition': `attachment; filename="concept-rod-${report.parameterHash.slice(0, 12)}.step"`,
				'Cache-Control': 'no-store',
				'X-Design-Parameter-Hash': report.parameterHash,
				'X-Design-Volume-MM3': String(report.volumeMm3)
			}
		});
	} catch (error) {
		return Response.json(
			{
				error:
					error instanceof ApiProblem
						? error.message
						: 'The CAD service could not complete this request.'
			},
			{
				status: error instanceof ApiProblem ? error.status : 503,
				headers: { 'Cache-Control': 'no-store' }
			}
		);
	}
};
