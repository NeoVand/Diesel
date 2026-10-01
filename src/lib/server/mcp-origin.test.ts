import { describe, expect, it } from 'vitest';
import { mcpCallbackUrl } from './mcp-origin';

describe('trusted native MCP self-routing', () => {
	it('uses the browser origin by default and accepts an explicit private loopback override', () => {
		expect(mcpCallbackUrl('https://diesel.example')).toBe('https://diesel.example/api/scene/mcp');
		expect(mcpCallbackUrl('https://diesel.example', 'http://127.0.0.1:3000')).toBe(
			'http://127.0.0.1:3000/api/scene/mcp'
		);
		expect(mcpCallbackUrl('https://diesel.example', 'http://[::1]:3000/')).toBe(
			'http://[::1]:3000/api/scene/mcp'
		);
		expect(mcpCallbackUrl('https://diesel.example', 'https://worker.internal')).toBe(
			'https://worker.internal/api/scene/mcp'
		);
	});

	it('rejects credential-bearing URLs, paths, insecure remote endpoints and non-HTTP schemes', () => {
		for (const value of [
			'https://user:secret@host.example',
			'https://host.example/prefix',
			'https://host.example/?key=secret',
			'https://host.example/#fragment',
			'http://worker.internal',
			'file:///tmp/example',
			'not-a-url'
		])
			expect(() => mcpCallbackUrl('https://diesel.example', value)).toThrow(/misconfigured/);
	});
});
