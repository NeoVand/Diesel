import { requestedOperatingPoints } from './legacy-reference-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { access } from 'node:fs/promises';

const sdk = vi.hoisted(() => ({ constructor: vi.fn(), startThread: vi.fn(), run: vi.fn() }));
vi.mock('@openai/codex-sdk', () => ({
	Codex: class {
		constructor(options: unknown) {
			sdk.constructor(options);
		}
		startThread(options: unknown) {
			sdk.startThread(options);
			return { run: sdk.run };
		}
	}
}));

import { harnessOptions, runEngineAgent } from './engine-agent';
import { createLabState } from '$lib/engine/lab-state';
import { clearSceneSessionsForTests, createSceneSession, getSceneSession } from './scene-broker';

afterEach(() => {
	vi.unstubAllEnvs();
	vi.clearAllMocks();
	clearSceneSessionsForTests();
});

describe('Codex harness integration', () => {
	it('does not inherit desktop secrets or signed-in Codex state', () => {
		vi.stubEnv('DIESEL_TEST_SECRET', 'must-not-be-inherited');
		const options = harnessOptions(
			'sk-test-key-for-offline-validation',
			'/tmp/diesel-private-state'
		);
		expect(options.env).not.toHaveProperty('DIESEL_TEST_SECRET');
		expect(options.env?.CODEX_HOME).toBe('/tmp/diesel-private-state');
		expect(options.apiKey).toBe('sk-test-key-for-offline-validation');
		expect(options.config?.features).toMatchObject({
			shell_tool: false,
			apps: false,
			multi_agent: false,
			hooks: false
		});
	});

	it('instructs live tools to use cylinder for cylinder cutaways and reread the verified final display', () => {
		const connection = createSceneSession(
			{
				state: createLabState(),
				components: [{ id: 'v12-0003', name: 'Educational piston 01' }]
			},
			'http://localhost:5173'
		);
		const session = getSceneSession(connection.sessionId, connection.token);
		const options = harnessOptions(
			'sk-test-key-for-offline-validation',
			'/tmp/diesel-private-state',
			{ url: 'http://localhost:5173/api/scene/mcp', token: 'offline-run-token', session }
		);
		const developerInstructions = String(options.config?.developer_instructions);
		expect(developerInstructions).toContain('After your last operation, call get_state again');
		expect(developerInstructions).toContain('global crank rotation relative to source rest');
		expect(developerInstructions).toContain('Use display layout for requests to arrange all parts');
		expect(developerInstructions).toContain('preserves common physical scale');
		expect(developerInstructions).toContain(
			'Only applied browser acknowledgements establish success'
		);
		expect(developerInstructions).toContain('reveal complete/covers/rotating/valvetrain');
		expect(developerInstructions).toContain('For a request to run or pause, change only running');
		expect(developerInstructions).toContain('assembly/section/cylinder/mechanism/xray/layout');
		expect(developerInstructions).not.toContain('Caterpillar');
		expect(developerInstructions).not.toContain('EM1898');
		expect(developerInstructions).not.toContain('170 mm');
	});

	it('runs the actual SDK contract in a temporary read-only workspace and cleans runtime state', async () => {
		sdk.run.mockResolvedValue({
			finalResponse: JSON.stringify({
				answer: 'Exhaust energy drives the compressor.',
				actions: [{ type: 'select', part: 'turbo' }],
				sources: ['V12_GEOMETRY']
			})
		});
		const signal = new AbortController().signal;
		const result = await runEngineAgent(
			{
				key: 'sk-test-key-for-offline-validation',
				model: 'gpt-6-sol',
				message: 'Show the turbo and compare 63% load.',
				history: [],
				scene: { selected: null, exploded: false, load: 75 }
			},
			signal
		);
		expect(result.actions).toEqual([{ type: 'select', part: 'turbo' }]);
		const threadOptions = sdk.startThread.mock.calls[0][0];
		expect(threadOptions).toMatchObject({
			sandboxMode: 'read-only',
			approvalPolicy: 'never',
			networkAccessEnabled: false,
			webSearchMode: 'disabled'
		});
		const prompt = JSON.parse(sdk.run.mock.calls[0][0]);
		expect(prompt.performance.available).toBe(false);
		expect(prompt.engine.geometry.boreMm).toBe(85);
		expect(prompt.engine.geometry.strokeMm).toBe(100);
		expect(prompt).not.toHaveProperty('currentReferenceOperatingPoint');
		expect(prompt).not.toHaveProperty('requestedReferenceOperatingPoints');
		expect(prompt).not.toHaveProperty('referencePerformanceMap');

		expect(sdk.run.mock.calls[0][1]).toMatchObject({ signal });
		await expect(access(threadOptions.workingDirectory)).rejects.toThrow();
	});
});

describe('requested load references', () => {
	it('uses the neighboring report nodes for decimal and non-anchor percentages', () => {
		const points = requestedOperatingPoints('Compare 37.5% load with 63 percent and 75 pct.');
		expect(points.map((point) => point.loadPercent)).toEqual([37.5, 63, 75]);
		expect(points[0].fuelLh).toBeCloseTo(171.15);
		expect(points[1].fuelLh).toBeCloseTo(264.25);
		expect(points[1].electricalKW).toBe(945);
		expect(points[0].evidence).toBe('interpolated');
		expect(points[2].evidence).toBe('reported');
	});

	it('rejects extrapolation, negative and embedded numbers and deduplicates loads', () => {
		const points = requestedOperatingPoints(
			'Ignore -10%, −75%, 5%, 150%, 1000%, v63%. Compare 25%, 25 percent and 100%.'
		);
		expect(points.map((point) => point.loadPercent)).toEqual([25, 100]);
		expect(requestedOperatingPoints('No explicit load percentage here.')).toEqual([]);
	});
});
