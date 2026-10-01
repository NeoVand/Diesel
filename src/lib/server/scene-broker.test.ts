import { afterEach, describe, expect, it } from 'vitest';
import { applyLabAction, createLabState } from '$lib/engine/lab-state';
import {
	acknowledgeScene,
	beginSceneRun,
	cancelRun,
	clearSceneSessionsForTests,
	createSceneSession,
	executeSceneAction,
	progressScene,
	getSceneSession,
	sceneForRunToken,
	subscribeScene,
	stateForGuide,
	saveCheckpoint,
	restoreSceneCheckpoint,
	updateSceneState,
	type SceneCommand,
	type SceneEvent
} from './scene-broker';
import { handleSceneRpc, sceneTools } from './scene-mcp';
import { labActionSchema } from './scene-contract';
const origin = 'http://localhost:5173';
const components = [
	{
		id: 'v12-0001',
		name: 'Source component001',
		cadProduct: 'vendor-housing-label',
		parent: 'block',
		kind: 'source'
	},
	{ id: 'v12-0003', name: 'Source piston01', parent: 'block', kind: 'source' },
	{ id: 'v12-0004', name: 'Source piston02', parent: 'block', kind: 'source' }
];
function fixture() {
	const connection = createSceneSession({ state: createLabState(), components }, origin);
	return { connection, session: getSceneSession(connection.sessionId, connection.token, origin) };
}
afterEach(clearSceneSessionsForTests);

describe('acknowledged browser scene broker', () => {
	it('gives the assistant the displayed declared cylinder case without presenting it as an engine rating', () => {
		const { session } = fixture();
		updateSceneState(session, {
			state: createLabState({ selected: 'v12-0003' }),
			actualPhase: 190
		});
		const state = stateForGuide(session);
		expect(state.capabilities.numericPerformance).toBe(false);
		expect(state.capabilities.declaredAirStandardCycle).toBe(true);
		const study = state.presentation.referenceCycleStudy;
		expect(study).toMatchObject({
			available: true,
			trackedPistonId: 'v12-0003',
			case: { rpm: 1800, compressionRatio: 16, heatInputPerCycleJ: 950 }
		});
		if (!study.available || !study.current) throw new Error('Expected phase-aligned study');
		expect(study.current.pressurePa).toBeGreaterThan(970000);
		expect(study.current.pressurePa).toBeLessThan(973000);
		expect(study.provenance!.clearance).toContain('assumed clearance volume');
		expect(study.qualification).toContain('no predicted cylinder-to-cylinder variation');
	});
	it('isolates sessions and rejects invented source identities', () => {
		const { connection } = fixture();
		const other = fixture();
		expect(() => getSceneSession(connection.sessionId, other.connection.token, origin)).toThrow();
		expect(() =>
			getSceneSession(connection.sessionId, connection.token, 'http://elsewhere.test')
		).toThrow();
		expect(() =>
			createSceneSession(
				{ state: createLabState(), components: [{ id: 'Frame_invented', name: 'Fake piston' }] },
				origin
			)
		).toThrow();
	});
	it('echoes browser request identities on every run event and keeps canceled runs separate', async () => {
		const { session } = fixture();
		const events: SceneEvent[] = [];
		subscribeScene(session, (event) => events.push(event));
		const requestId = 'e1c267fd-8d90-46ab-83e6-38284192a1e1';
		const first = beginSceneRun(session, new AbortController().signal, requestId);
		progressScene(session, 'Inspecting');
		const pending = executeSceneAction(session, { type: 'seek', value: 300 }, 0);
		cancelRun(session);
		await pending;
		expect(events[0]).toEqual({ type: 'ready' });
		for (const event of events.slice(1))
			expect(event).toMatchObject({ runId: first.id, requestId });
		expect(events.slice(1).map((event) => event.type)).toEqual(['progress', 'command', 'cancel']);
		const nextRequestId = 'c5c0c1a1-2294-4d60-b023-1316f5070d7a';
		const next = beginSceneRun(session, new AbortController().signal, nextRequestId);
		progressScene(session, 'Inspecting again');
		expect(events.at(-1)).toMatchObject({
			type: 'progress',
			runId: next.id,
			requestId: nextRequestId
		});
		expect(next.id).not.toBe(first.id);
	});

	it('resolves mutations only after the browser reports the applied exact intent', async () => {
		const { session } = fixture();
		let command: SceneCommand | undefined;
		subscribeScene(session, (event) => {
			if (event.type === 'command') command = event;
		});
		const run = beginSceneRun(session, new AbortController().signal);
		let settled = false;
		const pending = executeSceneAction(session, { type: 'seek', value: 350 }, 0).then((result) => {
			settled = true;
			return result;
		});
		await Promise.resolve();
		expect(settled).toBe(false);
		expect(command?.action).toEqual({ type: 'seek', value: 350 });
		expect(() =>
			acknowledgeScene(session, {
				id: command!.id,
				runId: run.id,
				status: 'applied',
				state: createLabState(),
				actualPhase: 0
			})
		).toThrow('did not apply');
		const state = applyLabAction(session.context.state, command!.action, components);
		acknowledgeScene(session, {
			id: command!.id,
			runId: run.id,
			status: 'applied',
			state,
			actualPhase: 350,
			sampledAt: Date.now()
		});
		const result = await pending;
		expect(result.status).toBe('applied');
		expect(result.state.actualPhase).toBe(350);
		expect(result.state.state.revision).toBe(1);
	});
	it('permits sampled phase updates without changing the discrete revision', async () => {
		const { session } = fixture();
		subscribeScene(session, () => {});
		beginSceneRun(session, new AbortController().signal);
		updateSceneState(session, {
			state: session.context.state,
			actualPhase: 180,
			sampledAt: Date.now()
		});
		expect(session.context.state.revision).toBe(0);
		const pending = executeSceneAction(session, { type: 'running', value: true }, 0);
		expect(session.pending.size).toBe(1);
		cancelRun(session);
		await pending;
	});
	it('keeps the newest sampled phase and camera when equal-revision HTTP updates arrive out of order', () => {
		const { session } = fixture();
		const sampledAt = Date.now() + 100;
		const camera = {
			position: [4, 5, 6] as [number, number, number],
			target: [0, 1, 0] as [number, number, number]
		};
		updateSceneState(session, {
			state: { ...session.context.state, camera },
			actualPhase: 220,
			sampledAt
		});
		const result = updateSceneState(session, {
			state: { ...session.context.state, camera: null },
			actualPhase: 180,
			sampledAt: sampledAt - 50
		});
		expect(result.actualPhase).toBe(220);
		expect(result.state.camera).toEqual(camera);
		expect(session.context.sampledAt).toBe(sampledAt);
		expect(session.context.state.revision).toBe(0);
	});

	it('rejects stale revisions without enqueueing or mutating the scene', async () => {
		const { session } = fixture();
		subscribeScene(session, () => {});
		beginSceneRun(session, new AbortController().signal);
		const state = applyLabAction(
			session.context.state,
			{ type: 'display', value: 'section' },
			components
		);
		updateSceneState(session, { state });
		const result = await executeSceneAction(session, { type: 'seek', value: 360 }, 0);
		expect(result.status).toBe('failed');
		expect(result.message).toContain('view changed');
		expect(session.pending.size).toBe(0);
		expect(session.context.state.phase).toBe(0);
	});
	it('cancels active work, revokes native credentials and rejects late acknowledgements', async () => {
		const { session } = fixture();
		let command: SceneCommand | undefined;
		subscribeScene(session, (event) => {
			if (event.type === 'command') command = event;
		});
		const run = beginSceneRun(session, new AbortController().signal);
		const pending = executeSceneAction(session, { type: 'focus', id: 'v12-0003' }, 0);
		cancelRun(session);
		expect((await pending).status).toBe('failed');
		expect(run.controller.signal.aborted).toBe(true);
		expect(() => sceneForRunToken(run.token)).toThrow('no longer active');
		expect(() =>
			acknowledgeScene(session, {
				id: command!.id,
				runId: run.id,
				status: 'applied',
				state: session.context.state
			})
		).toThrow('no longer active');
	});
	it('returns operation failure after a missed browser acknowledgement and stops the run', async () => {
		const { session } = fixture();
		subscribeScene(session, () => {});
		const run = beginSceneRun(session, new AbortController().signal);
		const result = await executeSceneAction(session, { type: 'display', value: 'section' }, 0, 5);
		expect(result.status).toBe('failed');
		expect(result.message).toContain('did not finish');
		expect(run.controller.signal.aborted).toBe(true);
		expect(session.pending.size).toBe(0);
	});
	it('does not accept a model-supplied restore snapshot or unknown mesh', async () => {
		const { session } = fixture();
		subscribeScene(session, () => {});
		beginSceneRun(session, new AbortController().signal);
		await expect(executeSceneAction(session, { type: 'restore', value: {} }, 0)).rejects.toThrow(
			'saved checkpoint'
		);
		await expect(
			executeSceneAction(session, { type: 'select', id: 'Frame_unregistered' }, 0)
		).rejects.toThrow('unavailable');
	});
});

describe('verified display meanings', () => {
	it('exposes an inspection atlas only after an exact paused browser acknowledgement, and restores it through MCP checkpoints', async () => {
		const { session } = fixture();
		const operating = createLabState({
			display: 'mechanism',
			running: true,
			flows: ['fuel'],
			phase: 300,
			selected: 'v12-0003',
			explosion: 1
		});
		updateSceneState(session, { state: operating, actualPhase: 355, sampledAt: Date.now() + 1 });
		let command: SceneCommand | undefined;
		subscribeScene(session, (event) => {
			if (event.type === 'command') command = event;
		});
		const run = beginSceneRun(session, new AbortController().signal);
		const pending = executeSceneAction(session, { type: 'display', value: 'layout' }, 0);
		expect(stateForGuide(session).presentation.display).toBe('mechanism');
		const applied = applyLabAction(operating, command!.action, components);
		for (const contradictory of [
			{ ...applied, running: true },
			{ ...applied, flows: ['air'] }
		]) {
			expect(() =>
				acknowledgeScene(session, {
					id: command!.id,
					runId: run.id,
					status: 'applied',
					state: contradictory
				})
			).toThrow('must be paused');
		}
		expect(session.pending.size).toBe(1);
		acknowledgeScene(session, {
			id: command!.id,
			runId: run.id,
			status: 'applied',
			state: applied,
			actualPhase: 355
		});
		expect((await pending).status).toBe('applied');
		const queried = await handleSceneRpc(session, {
			jsonrpc: '2.0',
			id: 20,
			method: 'tools/call',
			params: { name: 'get_state', arguments: {} }
		});
		expect(queried?.result).toMatchObject({
			structuredContent: {
				state: { display: 'layout', running: false, flows: [], phase: 300, explosion: 1 },
				actualPhase: 355,
				presentation: {
					display: 'layout',
					cylinderPhase: null,
					trackedCylinder: null,
					clippingPlane: null,
					inspectionAtlas: {
						uniformScaleWithinEachPart: true,
						relativePartSizesPreserved: true,
						physicalSpacing: false,
						storedPhaseRendered: false,
						explosionOffsetsApplied: false,
						removedOffsetsApplied: false
					}
				},
				capabilities: {
					displayModes: ['assembly', 'section', 'cylinder', 'mechanism', 'xray', 'layout'],
					explosionRange: [0, 1]
				}
			}
		});
		const checkpoint = saveCheckpoint(session, 'Parts inspection');
		const assembly = applyLabAction(applied, { type: 'display', value: 'assembly' }, components);
		updateSceneState(session, { state: assembly, actualPhase: 355 });
		const restoring = restoreSceneCheckpoint(session, checkpoint.id, assembly.revision);
		const restored = applyLabAction(assembly, command!.action, components);
		acknowledgeScene(session, {
			id: command!.id,
			runId: run.id,
			status: 'applied',
			state: restored,
			actualPhase: 355
		});
		expect((await restoring).status).toBe('applied');
		expect(restored).toMatchObject({
			display: 'layout',
			running: false,
			flows: [],
			phase: 355,
			explosion: 1
		});
	});

	it('distinguishes a one-cylinder cutaway from the full V12 until the display is acknowledged', async () => {
		const { session } = fixture();
		let command: SceneCommand | undefined;
		subscribeScene(session, (event) => {
			if (event.type === 'command') command = event;
		});
		const run = beginSceneRun(session, new AbortController().signal);
		expect(stateForGuide(session).presentation.display).toBe('assembly');
		const pending = executeSceneAction(session, { type: 'display', value: 'cylinder' }, 0);
		expect(stateForGuide(session).presentation.display).toBe('assembly');
		const state = applyLabAction(session.context.state, command!.action, components);
		acknowledgeScene(session, { id: command!.id, runId: run.id, status: 'applied', state });
		await pending;
		expect(stateForGuide(session).presentation).toMatchObject({
			display: 'cylinder',
			sectionCylinder: null,
			description: expect.stringContaining('actual source piston')
		});
		updateSceneState(session, {
			state: applyLabAction(state, { type: 'focus', id: 'v12-0004' }, components)
		});
		expect(stateForGuide(session).presentation.sectionCylinder).toBeNull();
		updateSceneState(session, {
			state: applyLabAction(
				session.context.state,
				{ type: 'display', value: 'mechanism' },
				components
			)
		});
		const queried = await handleSceneRpc(session, {
			jsonrpc: '2.0',
			id: 11,
			method: 'tools/call',
			params: { name: 'get_state', arguments: {} }
		});
		expect(queried?.result).toMatchObject({
			structuredContent: {
				presentation: {
					display: 'mechanism',
					sectionCylinder: null,
					description: expect.stringContaining('purchased V12')
				}
			}
		});
	});
	it.each([0, 90, 210, 360, 720])(
		'reports source-rest crank angle %i without inventing combustion phase',
		(global) => {
			const { session } = fixture();
			updateSceneState(session, {
				state: createLabState({ display: 'cylinder', focused: 'v12-0003' }),
				actualPhase: global
			});
			expect(stateForGuide(session).presentation).toMatchObject({
				globalMechanicalPhase: global,
				cylinderPhase: null,
				cylinderStroke: null,
				phaseOffsetDegrees: null
			});
			expect(stateForGuide(session).presentation.phaseBasis).toContain('supplied source pose');
		}
	);

	it('exposes whole-engine clipping scope and exact acknowledged plane settings without calling it one cylinder', async () => {
		const { session } = fixture();
		let command: SceneCommand | undefined;
		subscribeScene(session, (event) => {
			if (event.type === 'command') command = event;
		});
		const run = beginSceneRun(session, new AbortController().signal);
		const display = executeSceneAction(session, { type: 'display', value: 'section' }, 0);
		acknowledgeScene(session, {
			id: command!.id,
			runId: run.id,
			status: 'applied',
			state: applyLabAction(session.context.state, command!.action, components)
		});
		await display;
		const plane = { axis: 'z', offset: 0.25, flipped: true, visible: false };
		const changed = executeSceneAction(session, { type: 'section', value: plane }, 1);
		expect(stateForGuide(session).presentation.clippingPlane?.offset).toBe(0.5);
		acknowledgeScene(session, {
			id: command!.id,
			runId: run.id,
			status: 'applied',
			state: applyLabAction(session.context.state, command!.action, components)
		});
		await changed;
		updateSceneState(session, {
			state: applyLabAction(session.context.state, { type: 'focus', id: 'v12-0004' }, components),
			actualPhase: 210
		});
		const presentation = stateForGuide(session).presentation;
		expect(presentation.clippingPlane).toMatchObject({
			...plane,
			guideOnlyVisibility: true,
			scope: expect.stringContaining('Whole purchased V12 engine')
		});
		expect(presentation.sectionCylinder).toBeNull();
		expect(presentation.cylinderPhase).toBeNull();
		expect(presentation.trackedCylinder).toBeNull();
		expect(presentation.globalMechanicalPhase).toBe(210);
		expect(presentation.description).toContain('whole-engine');
	});
	it('advertises the complete bounded plane object, cylinder display and internal visibility in the MCP schema', () => {
		const display = labActionSchema.anyOf.find(
			(option) => option.properties.type.const === 'display'
		);
		expect(display?.properties).toMatchObject({
			value: { enum: ['assembly', 'section', 'cylinder', 'mechanism', 'xray', 'layout'] }
		});
		expect(
			labActionSchema.anyOf.find((option) => option.properties.type.const === 'explosion')
				?.properties
		).toMatchObject({ value: { minimum: 0, maximum: 1 } });
		const plane = labActionSchema.anyOf.find(
			(option) => option.properties.type.const === 'section'
		);
		expect(plane?.properties).toMatchObject({
			value: {
				additionalProperties: false,
				required: ['axis', 'offset', 'flipped', 'visible'],
				properties: {
					axis: { enum: ['x', 'y', 'z'] },
					offset: { minimum: 0, maximum: 1 },
					visible: { type: 'boolean' }
				}
			}
		});
		expect(
			labActionSchema.anyOf.find((option) => option.properties.type.const === 'internals')
				?.properties
		).toMatchObject({ value: { type: 'boolean' } });
		expect(sceneTools.find((tool) => tool.name === 'execute_action')?.description).toContain(
			'global crank rotation from source rest'
		);
	});

	it('preserves searchable vendor CAD labels without changing source mesh identities', async () => {
		const { session } = fixture();
		const result = await handleSceneRpc(session, {
			jsonrpc: '2.0',
			id: 12,
			method: 'tools/call',
			params: { name: 'get_components', arguments: { search: 'vendor-housing' } }
		});
		expect(result?.result).toMatchObject({
			structuredContent: {
				components: [
					{
						id: 'v12-0001',
						cadProduct: 'vendor-housing-label'
					}
				]
			}
		});
	});
});

describe('native MCP scene protocol', () => {
	it('advertises source tools, declines unsupported performance, and waits for browser acknowledgements', async () => {
		const { session } = fixture();
		let command: SceneCommand | undefined;
		subscribeScene(session, (event) => {
			if (event.type === 'command') command = event;
		});
		const run = beginSceneRun(session, new AbortController().signal);
		const init = await handleSceneRpc(session, {
			jsonrpc: '2.0',
			id: 1,
			method: 'initialize',
			params: { protocolVersion: '2025-03-26' }
		});
		expect(init?.result).toMatchObject({ serverInfo: { name: 'diesel-scene' } });
		const catalog = await handleSceneRpc(session, {
			jsonrpc: '2.0',
			id: 2,
			method: 'tools/call',
			params: { name: 'get_components', arguments: { search: 'piston' } }
		});
		expect(JSON.stringify(catalog)).toContain('v12-0003');
		const point = await handleSceneRpc(session, {
			jsonrpc: '2.0',
			id: 3,
			method: 'tools/call',
			params: { name: 'get_operating_point', arguments: { load: 63 } }
		});
		expect(JSON.stringify(point)).toContain('Numerical performance is unavailable');
		expect(sceneTools.some((tool) => tool.name === 'get_operating_point')).toBe(false);
		const result = handleSceneRpc(session, {
			jsonrpc: '2.0',
			id: 4,
			method: 'tools/call',
			params: {
				name: 'execute_action',
				arguments: { expectedRevision: 0, action: { type: 'display', value: 'section' } }
			}
		});
		await Promise.resolve();
		expect(command).toBeDefined();
		const state = applyLabAction(session.context.state, command!.action, components);
		acknowledgeScene(session, { id: command!.id, runId: run.id, status: 'applied', state });
		expect(JSON.stringify(await result)).toContain('applied');
	});
});
