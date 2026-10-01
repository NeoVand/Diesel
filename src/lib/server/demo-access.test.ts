import { describe, expect, it } from 'vitest';
import {
	DemoAccessManager,
	DEMO_SESSION_MS,
	localOwnerAvailable,
	type AccessContext,
	type DemoConfiguration
} from './demo-access';

const configuration: DemoConfiguration = {
	development: false,
	key: 'sk-sponsored-offline-test-key-only',
	password: 'offline-invite-password',
	secret: 'offline-test-signing-secret-32-characters'
};
function context(overrides: Partial<AccessContext> = {}): AccessContext {
	const url = new URL('https://diesel.example/api/agent');
	return {
		url,
		request: new Request(url, { method: 'POST', headers: { origin: url.origin } }),
		clientAddress: '192.0.2.1',
		...overrides
	};
}
function unlock(manager: DemoAccessManager, ctx = context()) {
	return { ...ctx, cookie: manager.unlock(configuration, ctx, configuration.password).cookie };
}

describe('password-protected server-key access', () => {
	it('exposes access state only, and refuses keyless inference before unlocking', () => {
		const manager = new DemoAccessManager();
		const status = manager.status(configuration, context());
		expect(status).toMatchObject({ mode: 'invite', authenticated: false, aiAvailable: false });
		expect(JSON.stringify(status)).not.toContain(configuration.key);
		expect(() => manager.credential(configuration, context(), '')).toThrow(/Unlock/);
	});

	it('rejects incorrect passwords, missing Origin, insecure hosting and incomplete secrets', () => {
		const manager = new DemoAccessManager();
		expect(() => manager.unlock(configuration, context(), 'wrong')).toThrow(/not accepted/);
		expect(() =>
			manager.unlock(
				configuration,
				context({ request: new Request(context().url) }),
				configuration.password
			)
		).toThrow(/application/);
		const http = new URL('http://diesel.example/api/agent');
		expect(() =>
			manager.unlock(
				configuration,
				context({ url: http, request: new Request(http, { headers: { origin: http.origin } }) }),
				configuration.password
			)
		).toThrow(/not configured/);
		expect(manager.status({ ...configuration, secret: 'short' }, context()).mode).toBe(
			'unavailable'
		);
		expect(manager.status({ ...configuration, password: 'short' }, context()).aiAvailable).toBe(
			false
		);
	});

	it('validates signed cookies against the live ledger; tampering cannot grant access', () => {
		const manager = new DemoAccessManager();
		const invited = unlock(manager);
		expect(manager.status(configuration, invited).aiAvailable).toBe(true);
		expect(manager.credential(configuration, invited, undefined).key).toBe(configuration.key);
		const [payload, signature] = invited.cookie.split('.');
		const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
		claims.exp += 86_400_000;
		const tampered = `${Buffer.from(JSON.stringify(claims)).toString('base64url')}.${signature}`;
		expect(manager.status(configuration, { ...invited, cookie: tampered }).authenticated).toBe(
			false
		);
		expect(
			manager.status(configuration, {
				...invited,
				cookie: `${payload}.${signature.slice(0, -3)}abc`
			}).authenticated
		).toBe(false);
		expect(new DemoAccessManager().status(configuration, invited).authenticated).toBe(false);
	});

	it('expires a visit and invalidates cookies after signing configuration changes', () => {
		let now = 1_000;
		const manager = new DemoAccessManager(() => now);
		const invited = unlock(manager);
		expect(manager.status(configuration, invited).expiresAt).toBe(now + DEMO_SESSION_MS);
		now += DEMO_SESSION_MS;
		expect(manager.status(configuration, invited).authenticated).toBe(false);
		const second = unlock(manager);
		expect(
			manager.status({ ...configuration, secret: `${configuration.secret}-rotated` }, second)
				.authenticated
		).toBe(false);
	});

	it('revokes replayed cookies and actively cancels sponsored work at logout', () => {
		const manager = new DemoAccessManager();
		const invited = unlock(manager);
		const reservation = manager.reserve(
			manager.credential(configuration, invited, ''),
			invited,
			'agent'
		)!;
		expect(reservation.signal.aborted).toBe(false);
		expect(manager.logout(configuration, invited).authenticated).toBe(false);
		expect(reservation.signal.aborted).toBe(true);
		expect(() => manager.credential(configuration, invited, '')).toThrow(/Unlock/);
		reservation.finish();
	});

	it('retains quota when unlocking an existing visit and permits only one paid request at once', () => {
		const manager = new DemoAccessManager();
		const invited = unlock(manager);
		const credential = manager.credential(configuration, invited, '');
		const reservation = manager.reserve(credential, invited, 'agent')!;
		expect(() => manager.reserve(credential, invited, 'audio')).toThrow(/current AI request/);
		reservation.finish();
		expect(
			manager.unlock(configuration, invited, configuration.password).status.limits.guideRemaining
		).toBe(29);
	});

	it('limits guessing and minute/visit quotas, counting cancelled or failed requests', () => {
		let now = 1_000;
		const manager = new DemoAccessManager(() => now);
		for (let i = 0; i < 5; i++)
			expect(() => manager.unlock(configuration, context(), 'wrong')).toThrow(/not accepted/);
		expect(() => manager.unlock(configuration, context(), configuration.password)).toThrow(
			/Too many password attempts/
		);
		now += 15 * 60_000;
		const invited = unlock(manager);
		const credential = manager.credential(configuration, invited, '');
		for (let i = 0; i < 4; i++) manager.reserve(credential, invited, 'agent')!.finish();
		expect(() => manager.reserve(credential, invited, 'agent')).toThrow(/wait a minute/);
		for (let i = 4; i < 30; i++) {
			now += 60_000;
			manager.reserve(credential, invited, 'agent')!.finish();
		}
		expect(manager.status(configuration, invited).limits.guideRemaining).toBe(0);
		expect(() => manager.reserve(credential, invited, 'agent')).toThrow(/AI allowance/);
	});

	it('preserves the address allowance across logout and new visits', () => {
		let now = 1_000;
		const manager = new DemoAccessManager(() => now);
		for (let visitIndex = 0; visitIndex < 2; visitIndex++) {
			const invited = unlock(manager);
			const credential = manager.credential(configuration, invited, '');
			for (let i = 0; i < 30; i++) {
				manager.reserve(credential, invited, 'agent')!.finish();
				now += 60_000;
			}
			manager.logout(configuration, invited);
		}
		const third = unlock(manager);
		expect(() =>
			manager.reserve(manager.credential(configuration, third, ''), third, 'agent')
		).toThrow(/exhausted for today/);
	});

	it('enforces the process allowance across multiple valid visitors', () => {
		let now = 1_000;
		const manager = new DemoAccessManager(() => now);
		for (let visitIndex = 0; visitIndex < 7; visitIndex++) {
			const invited = unlock(manager, context({ clientAddress: `192.0.2.${visitIndex + 1}` }));
			const credential = manager.credential(configuration, invited, '');
			for (let i = 0; i < (visitIndex < 6 ? 30 : 20); i++) {
				manager.reserve(credential, invited, 'agent')!.finish();
				now += 60_000;
			}
			if (visitIndex === 6)
				expect(() => manager.reserve(credential, invited, 'agent')).toThrow(/exhausted for today/);
		}
	});

	it('keeps optional BYOK independent of invite access and rejects invalid supplied key fallback', () => {
		const manager = new DemoAccessManager();
		expect(
			manager.credential(configuration, context(), 'sk-byok-offline-test-key-only')
		).toMatchObject({ source: 'byok', visit: null });
		expect(manager.credential(configuration, context(), 42).key).toBe(42);
		expect(
			manager.reserve(manager.credential(configuration, context(), 'supplied'), context(), 'agent')
		).toBeNull();
	});

	it('auto-enables direct local owner development access but never trusts spoofed loopback/proxy claims', () => {
		const manager = new DemoAccessManager();
		const local = { ...configuration, development: true, password: undefined, secret: undefined };
		const url = new URL('http://localhost:5173/api/agent');
		const ctx = context({
			url,
			request: new Request(url, { headers: { origin: url.origin } }),
			clientAddress: '127.0.0.1'
		});
		expect(manager.status(local, ctx).mode).toBe('local');
		expect(manager.credential(local, ctx, '').key).toBe(configuration.key);
		expect(localOwnerAvailable({ ...local, development: false }, ctx)).toBe(false);
		expect(localOwnerAvailable(local, { ...ctx, clientAddress: '203.0.113.1' })).toBe(false);
		expect(
			localOwnerAvailable(local, {
				...ctx,
				request: new Request(url, {
					headers: { origin: url.origin, 'x-forwarded-for': '127.0.0.1' }
				})
			})
		).toBe(false);
		expect(localOwnerAvailable({ ...local, localOptIn: 'false' }, ctx)).toBe(false);
		expect(() => manager.credential(local, { ...ctx, request: new Request(url) }, '')).toThrow(
			/application/
		);
	});
});
