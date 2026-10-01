import { ApiProblem } from './validation';

export type LocalAIConfiguration = {
	development: boolean;
	optIn: string | undefined;
	key: string | undefined;
};

function ipv4Loopback(address: string): boolean {
	const parts = address.split('.');
	return (
		parts.length === 4 &&
		parts[0] === '127' &&
		parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255)
	);
}

export function isLoopbackAddress(address: string): boolean {
	const normalized = address.toLowerCase();
	return (
		normalized === '::1' ||
		normalized === '0:0:0:0:0:0:0:1' ||
		ipv4Loopback(normalized) ||
		(normalized.startsWith('::ffff:') && ipv4Loopback(normalized.slice(7)))
	);
}

export function localServerKeyAvailable(
	configuration: LocalAIConfiguration,
	url: URL,
	clientAddress: string
): boolean {
	const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
	return (
		configuration.development &&
		configuration.optIn === 'true' &&
		Boolean(configuration.key?.trim()) &&
		['http:', 'https:'].includes(url.protocol) &&
		(hostname === 'localhost' || isLoopbackAddress(hostname)) &&
		isLoopbackAddress(clientAddress)
	);
}

/** Resolves only a keyless, same-origin local development request; BYOK remains unchanged. */
export function resolveRequestKey(
	suppliedKey: unknown,
	request: Request,
	url: URL,
	clientAddress: string,
	configuration: LocalAIConfiguration
): unknown {
	if (suppliedKey !== undefined && suppliedKey !== null && suppliedKey !== '') return suppliedKey;
	if (!localServerKeyAvailable(configuration, url, clientAddress)) return suppliedKey;
	if (request.headers.get('origin') !== url.origin) {
		throw new ApiProblem(403, 'Local development AI requires a request from this application.');
	}
	return configuration.key!.trim();
}
