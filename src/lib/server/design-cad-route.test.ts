import { beforeEach, describe, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({ export: vi.fn() }));
vi.mock('$env/dynamic/private', () => ({ env: {} }));
vi.mock('./design-cad', async (original) => ({
	...(await original<typeof import('./design-cad')>()),
	exportRodCad: fixture.export
}));

import { POST } from '../../routes/api/design/rod-step/+server';
import { DEFAULT_DESIGN_PARAMS } from '$lib/design/design-core';
import { ApiProblem } from './validation';

function event(body: unknown, origin = 'https://diesel.example') {
	const url = new URL('https://diesel.example/api/design/rod-step');
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
	fixture.export.mockReset().mockResolvedValue({
		step: new TextEncoder().encode('ISO-10303-21;\nEND-ISO-10303-21;'),
		report: {
			parameterHash: '0123456789abcdef',
			volumeMm3: 39984.2696810487,
			valid: true,
			solidCount: 1
		}
	});
});

describe('exact CAD export HTTP boundary', () => {
	it('returns a downloadable STEP and a separate JSON verification report', async () => {
		const step = await POST(event({ params: DEFAULT_DESIGN_PARAMS, format: 'step' }));
		expect(step.status).toBe(200);
		expect(step.headers.get('content-type')).toBe('application/step');
		expect(step.headers.get('content-disposition')).toContain('concept-rod-0123456789ab.step');
		expect(await step.text()).toContain('ISO-10303-21;');
		const report = await POST(event({ params: DEFAULT_DESIGN_PARAMS, format: 'json' }));
		expect(await report.json()).toMatchObject({
			valid: true,
			solidCount: 1,
			parameterHash: '0123456789abcdef'
		});
	});

	it('rejects cross-origin, oversized and invalid requests without running a native process', async () => {
		expect(
			(await POST(event({ params: DEFAULT_DESIGN_PARAMS }, 'https://elsewhere.example'))).status
		).toBe(403);
		expect(
			(await POST(event({ params: DEFAULT_DESIGN_PARAMS, padding: 'x'.repeat(5000) }))).status
		).toBe(413);
		expect((await POST(event({ params: { ...DEFAULT_DESIGN_PARAMS, webMm: '4' } }))).status).toBe(
			400
		);
		expect(fixture.export).not.toHaveBeenCalled();
	});

	it('reports an unavailable CAD runtime without returning process details', async () => {
		fixture.export.mockRejectedValueOnce(
			new ApiProblem(503, 'Exact CAD export is unavailable on this server.')
		);
		const response = await POST(event({ params: DEFAULT_DESIGN_PARAMS }));
		expect(response.status).toBe(503);
		expect(await response.json()).toEqual({
			error: 'Exact CAD export is unavailable on this server.'
		});
		fixture.export.mockRejectedValueOnce(new Error('private native process stderr'));
		expect(await (await POST(event({ params: DEFAULT_DESIGN_PARAMS }))).text()).not.toContain(
			'private native'
		);
	});
});
