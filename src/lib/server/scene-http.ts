import { ApiProblem, readJsonRequest } from './validation';
import { bearerToken, getSceneSession } from './scene-broker';
export function requireBrowserOrigin(request: Request, url: URL) {
	if (
		request.headers.get('origin') !== url.origin ||
		request.headers.get('sec-fetch-site') === 'cross-site'
	)
		throw new ApiProblem(403, 'Scene controls must come from this application.');
}
export async function browserSceneRequest(request: Request, url: URL) {
	requireBrowserOrigin(request, url);
	const body = await readJsonRequest(request, url);
	const session = getSceneSession(body.sessionId, bearerToken(request), url.origin);
	return { body, session };
}
