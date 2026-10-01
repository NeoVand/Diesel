import { describe, expect, it } from 'vitest';
import { isLoopbackAddress, localServerKeyAvailable, resolveRequestKey } from './local-ai';

const localKey = 'sk-local-offline-test-key-only';
const byok = 'sk-visitor-offline-test-key-only';
const configuration = { development: true, optIn: 'true', key: localKey };
const url = new URL('http://localhost:5173/api/agent');
const localRequest = () => new Request(url, { method: 'POST', headers: { origin: url.origin } });

describe('opt-in local development credentials', () => {
	it('requires development, explicit opt-in, a key, local URL and local client', () => {
		expect(localServerKeyAvailable(configuration, url, '127.0.0.1')).toBe(true);
		expect(
			localServerKeyAvailable({ ...configuration, development: false }, url, '127.0.0.1')
		).toBe(false);
		expect(localServerKeyAvailable({ ...configuration, optIn: undefined }, url, '127.0.0.1')).toBe(
			false
		);
		expect(localServerKeyAvailable({ ...configuration, key: undefined }, url, '127.0.0.1')).toBe(
			false
		);
		expect(
			localServerKeyAvailable(
				configuration,
				new URL('https://diesel.example/api/agent'),
				'127.0.0.1'
			)
		).toBe(false);
		expect(localServerKeyAvailable(configuration, url, '192.0.2.1')).toBe(false);
	});

	it('recognizes IPv4, IPv6 and mapped loopback addresses without trusting host headers alone', () => {
		expect(isLoopbackAddress('127.0.0.1')).toBe(true);
		expect(isLoopbackAddress('::1')).toBe(true);
		expect(isLoopbackAddress('::ffff:127.0.0.1')).toBe(true);
		expect(isLoopbackAddress('127.999.0.1')).toBe(false);
		expect(isLoopbackAddress('::ffff:192.0.2.1')).toBe(false);
		expect(
			localServerKeyAvailable(configuration, new URL('http://[::1]:5173/api/agent'), '::1')
		).toBe(true);
		expect(localServerKeyAvailable(configuration, url, '203.0.113.1')).toBe(false);
	});

	it('resolves an empty key only for a matching, present Origin', () => {
		expect(resolveRequestKey(undefined, localRequest(), url, '127.0.0.1', configuration)).toBe(
			localKey
		);
		expect(resolveRequestKey('', localRequest(), url, '127.0.0.1', configuration)).toBe(localKey);
		expect(() =>
			resolveRequestKey(undefined, new Request(url), url, '127.0.0.1', configuration)
		).toThrow();
		expect(() =>
			resolveRequestKey(
				undefined,
				new Request(url, { headers: { origin: 'https://other.example' } }),
				url,
				'127.0.0.1',
				configuration
			)
		).toThrow();
	});

	it('preserves BYOK and never falls back in production or for remote clients', () => {
		expect(resolveRequestKey(byok, new Request(url), url, '192.0.2.1', configuration)).toBe(byok);
		expect(resolveRequestKey(42, localRequest(), url, '127.0.0.1', configuration)).toBe(42);
		expect(
			resolveRequestKey(undefined, localRequest(), url, '127.0.0.1', {
				...configuration,
				development: false
			})
		).toBeUndefined();
		expect(
			resolveRequestKey(undefined, localRequest(), url, '192.0.2.1', configuration)
		).toBeUndefined();
	});
});
