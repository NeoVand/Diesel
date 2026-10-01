import { beforeEach, describe, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({ solve: vi.fn() }));
vi.mock('$env/dynamic/private', () => ({ env: {} }));
vi.mock('./design-structural', async (original) => ({
	...(await original<typeof import('./design-structural')>()),
	runStructuralAnalysis: fixture.solve
}));

import { POST } from '../../routes/api/design/rod-analysis/+server';
import { DEFAULT_DESIGN_PARAMS } from '$lib/design/design-core';
import { ApiProblem } from './validation';

function event(body: unknown, origin = 'https://diesel.example') {
	const url = new URL('https://diesel.example/api/design/rod-analysis');
	return {
		url,
		request: new Request(url, {
			method: 'POST',
			headers: { origin, 'content-type': 'application/json' },
			body: JSON.stringify(body)
		})
	} as never;
}

beforeEach(() => {
	fixture.solve.mockReset().mockResolvedValue({
		schemaVersion: 'rod-solid-fea-v1',
		analysisHash: 'fixture-result',
		stats: { elements: 100 }
	});
});

describe('native full-solid HTTP boundary', () => {
	it('passes validated force and body inertia to the solver and returns the actual result unchanged', async () => {
		const response = await POST(event({ params: DEFAULT_DESIGN_PARAMS, refine: true }));
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({ analysisHash: 'fixture-result' });
		expect(fixture.solve.mock.calls[0][0]).toMatchObject({
			refine: true,
			loadCase: { forceN: [0, -25000, 1000] }
		});
	});

	it('blocks cross-origin, oversized and invalid requests before native work', async () => {
		expect(
			(await POST(event({ params: DEFAULT_DESIGN_PARAMS }, 'https://other.example'))).status
		).toBe(403);
		expect(
			(await POST(event({ params: DEFAULT_DESIGN_PARAMS, padding: 'x'.repeat(9000) }))).status
		).toBe(413);
		expect(
			(await POST(event({ params: DEFAULT_DESIGN_PARAMS, loadCase: { forceN: [0, -1e9, 0] } })))
				.status
		).toBe(400);
		expect(fixture.solve).not.toHaveBeenCalled();
	});

	it('reports a busy or unavailable solver without disclosing native diagnostics', async () => {
		fixture.solve.mockRejectedValueOnce(
			new ApiProblem(429, 'A solid analysis is already running.')
		);
		expect((await POST(event({ params: DEFAULT_DESIGN_PARAMS }))).status).toBe(429);
		fixture.solve.mockRejectedValueOnce(new Error('private process stderr'));
		const response = await POST(event({ params: DEFAULT_DESIGN_PARAMS }));
		expect(response.status).toBe(503);
		expect(await response.text()).not.toContain('private process');
	});
});
