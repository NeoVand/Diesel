import { isLoopbackAddress } from './local-ai';
import { ApiProblem } from './validation';

/** The override comes only from private server configuration, never body/Host/forwarded headers. */
export function mcpCallbackUrl(browserOrigin: string, configuredOrigin?: string): string {
	let origin: URL;
	try {
		origin = new URL(configuredOrigin || browserOrigin);
	} catch {
		throw new ApiProblem(500, 'The server scene callback origin is misconfigured.');
	}
	const hostname = origin.hostname.replace(/^\[|\]$/g, '').toLowerCase();
	if (
		!['http:', 'https:'].includes(origin.protocol) ||
		origin.username ||
		origin.password ||
		origin.pathname !== '/' ||
		origin.search ||
		origin.hash ||
		(configuredOrigin &&
			origin.protocol === 'http:' &&
			hostname !== 'localhost' &&
			!isLoopbackAddress(hostname))
	)
		throw new ApiProblem(500, 'The server scene callback origin is misconfigured.');
	return `${origin.origin}/api/scene/mcp`;
}
