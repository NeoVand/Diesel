import { afterEach, describe, expect, it } from 'vitest';
import { engineDefinition, v12Components } from '$lib/engine/definition';
import { applyLabAction, createLabState } from '$lib/engine/lab-state';
import {
	acknowledgeScene,
	beginSceneRun,
	clearSceneSessionsForTests,
	createSceneSession,
	executeSceneAction,
	getSceneSession,
	stateForGuide,
	subscribeScene,
	type SceneCommand
} from './scene-broker';
import { validateComponents, validateSceneContext, validateToolAction } from './scene-contract';
import { sceneTools } from './scene-mcp';
afterEach(clearSceneSessionsForTests);
describe('full V12 live catalog', () => {
	it('rejects false run acknowledgements and explicit starts while mechanically separated', () => {
		for (const change of [
			{ explosion: 0.1 },
			{ removed: ['v12-0003'] },
			{ display: 'layout' as const }
		]) {
			const state = createLabState(change);
			expect(() =>
				validateToolAction({ type: 'running', value: true }, state, v12Components)
			).toThrow();
			expect(() =>
				validateSceneContext({ state: { ...state, running: true } }, v12Components)
			).toThrow('paused');
		}
	});
	it('acknowledges exterior Run without a hidden reveal or camera operation and publishes X-ray', async () => {
		const camera = {
			position: [8, 4, 3] as [number, number, number],
			target: [0, 0, 0] as [number, number, number]
		};
		const initial = createLabState({ camera, reveal: 'complete' });
		const connection = createSceneSession(
			{ state: initial, components: v12Components },
			'http://localhost:5173'
		);
		const session = getSceneSession(connection.sessionId, connection.token);
		let command: SceneCommand | undefined;
		subscribeScene(session, (event) => {
			if (event.type === 'command') command = event;
		});
		const run = beginSceneRun(session, new AbortController().signal);
		const pending = executeSceneAction(session, { type: 'running', value: true }, 0);
		const state = applyLabAction(initial, command!.action, v12Components);
		acknowledgeScene(session, { id: command!.id, runId: run.id, status: 'applied', state });
		expect((await pending).status).toBe('applied');
		expect(stateForGuide(session)).toMatchObject({
			state: { display: 'assembly', reveal: 'complete', camera, running: true },
			presentation: { playback: { available: true, viewIndependent: true } },
			capabilities: {
				viewIndependentPlayback: true,
				geometricAnalysis: ['piston-displacement', 'rod-inclination']
			}
		});
		expect(stateForGuide(session).capabilities.displayModes).toContain('xray');
		expect(stateForGuide(session).presentation.geometricAnalysis).toMatchObject({
			available: true,
			measurement: { pistonId: 'v12-0014', strokeMm: expect.closeTo(100, 8) }
		});
		expect(validateToolAction({ type: 'display', value: 'xray' }, state, v12Components)).toEqual({
			type: 'display',
			value: 'xray'
		});
	});

	it('accepts all 1253 parts beyond both old limits and acknowledges the highest ID', async () => {
		expect(
			new TextEncoder().encode(
				JSON.stringify({ state: createLabState(), components: v12Components })
			).length
		).toBeLessThan(1_048_576);
		const components = validateComponents(v12Components);
		const connection = createSceneSession(
			{ state: createLabState(), components },
			'http://localhost:5173'
		);
		const session = getSceneSession(connection.sessionId, connection.token);
		let command: SceneCommand | undefined;
		subscribeScene(session, (event) => {
			if (event.type === 'command') command = event;
		});
		const run = beginSceneRun(session, new AbortController().signal);
		const pending = executeSceneAction(session, { type: 'select', id: 'v12-1253' }, 0);
		expect(session.context.state.selected).toBeNull();
		const state = applyLabAction(session.context.state, command!.action, components);
		acknowledgeScene(session, { id: command!.id, runId: run.id, status: 'applied', state });
		expect((await pending).status).toBe('applied');
		expect(stateForGuide(session)).toMatchObject({
			state: { selected: 'v12-1253' },
			capabilities: {
				registeredComponents: 1253,
				assetId: engineDefinition.assetId,
				numericPerformance: false,
				referenceRpm: null
			}
		});
	});
	it('rejects invented/legacy identities and does not offer an inherited load model', async () => {
		for (const id of ['v12-1254', 'Frame_Object_001', 'mech:piston:01'])
			expect(() => validateComponents([{ id, name: 'Unregistered' }])).toThrow();
		const connection = createSceneSession(
			{ state: createLabState(), components: v12Components },
			'http://localhost:5173'
		);
		const session = getSceneSession(connection.sessionId, connection.token);
		subscribeScene(session, () => {});
		beginSceneRun(session, new AbortController().signal);
		await expect(executeSceneAction(session, { type: 'load', value: 75 }, 0)).rejects.toThrow(
			'No calibrated performance map'
		);
		expect(sceneTools.some((tool) => tool.name === 'get_operating_point')).toBe(false);
	});
});
