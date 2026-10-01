import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import type { Cookies } from '@sveltejs/kit';
import { DEMO_COOKIE, type AccessContext, type DemoConfiguration } from './demo-access';

export function demoConfiguration(): DemoConfiguration {
	return {
		development: dev,
		localOptIn: env.DIESEL_USE_LOCAL_SERVER_KEY,
		key: env.OPENAI_API_KEY,
		password: env.DIESEL_DEMO_PASSWORD,
		secret: env.DIESEL_SESSION_SECRET
	};
}

export function accessContext(event: {
	request: Request;
	url: URL;
	getClientAddress: () => string;
	cookies: Pick<Cookies, 'get'>;
}): AccessContext {
	return {
		request: event.request,
		url: event.url,
		clientAddress: event.getClientAddress(),
		cookie: event.cookies.get(DEMO_COOKIE)
	};
}

export const demoCookieOptions = {
	path: '/',
	httpOnly: true,
	secure: true,
	sameSite: 'strict'
} as const;
