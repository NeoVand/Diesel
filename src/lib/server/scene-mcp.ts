import { sources } from '$lib/engine/data';
import { ApiProblem } from './validation';
import { labActionSchema, isObject } from './scene-contract';
import {
	progressScene,
	executeSceneAction,
	restoreSceneCheckpoint,
	saveCheckpoint,
	stateForGuide,
	type SceneSession
} from './scene-broker';
const queryObject = (properties: Record<string, unknown> = {}, required: string[] = []) => ({
	type: 'object',
	additionalProperties: false,
	properties,
	required
});
export const sceneTools = [
	{
		name: 'get_state',
		description:
			'Read actual sampled working-engine state, presentation/display meaning, common-scale Parts-layout spacing qualification, whole-engine clipping plane and global source-rest mechanical phase, discrete revision, lesson/audio state and saved checkpoints. Query before a scene change and again after your last operation before the final answer. Describe this verified display, not the intended request.',
		inputSchema: queryObject(),
		annotations: { readOnlyHint: true }
	},
	{
		name: 'get_components',
		description:
			'Search the registered engine component catalog. Only these exact IDs may be used; source mesh names do not imply authenticated OEM part identities. Optional cadProduct is a recovered vendor CAD label, not verified OEM identity or function. Source appearance and function labels retain audit qualifications.',
		inputSchema: queryObject({
			search: { type: 'string', maxLength: 180 },
			limit: { type: 'integer', minimum: 1, maximum: 40 }
		}),
		annotations: { readOnlyHint: true }
	},
	{
		name: 'get_evidence',
		description:
			'Read a known primary-source citation by ID. This returns the curated citation, not licensed manual text.',
		inputSchema: queryObject({ id: { type: 'string' } }, ['id']),
		annotations: { readOnlyHint: true }
	},
	{
		name: 'execute_action',
		description:
			'Execute one scene command and await actual browser acknowledgement. Views: exterior assembly, whole-engine section, focused source cylinder, rotating mechanism, ghosted X-ray, and common-scale static parts atlas. Run and pause do not change the camera or display; running from the exterior is supported. Named reveal presets preserve registered identities. Section rotation is optional [pitch,yaw] degrees. Atlas and mechanically separated parts pause motion. Seek is global crank rotation from source rest, not calibrated cylinder combustion phase. Use current expectedRevision; never claim success without applied status.',
		inputSchema: queryObject(
			{ expectedRevision: { type: 'integer', minimum: 0 }, action: labActionSchema },
			['expectedRevision', 'action']
		),
		annotations: { readOnlyHint: false, destructiveHint: false }
	},
	{
		name: 'save_checkpoint',
		description: 'Save exact sampled view/cycle state for later restoration.',
		inputSchema: queryObject({ label: { type: 'string', maxLength: 100 } }, ['label']),
		annotations: { readOnlyHint: false, destructiveHint: false }
	},
	{
		name: 'restore_checkpoint',
		description:
			'Restore a saved exact checkpoint, with acknowledged browser execution. Do not invent snapshot coordinates or IDs.',
		inputSchema: queryObject(
			{ id: { type: 'string' }, expectedRevision: { type: 'integer', minimum: 0 } },
			['id', 'expectedRevision']
		),
		annotations: { readOnlyHint: false, destructiveHint: false }
	}
];
export const sceneToolNames = sceneTools.map((tool) => tool.name);
function toolResult(value: unknown, isError = false) {
	return {
		content: [{ type: 'text', text: JSON.stringify(value) }],
		structuredContent: isObject(value) ? value : { result: value },
		isError
	};
}
function safeFailure(error: unknown) {
	return toolResult(
		{
			status: 'failed',
			message:
				error instanceof ApiProblem ? error.message : 'That scene operation could not be completed.'
		},
		true
	);
}
export async function callSceneTool(session: SceneSession, name: unknown, raw: unknown) {
	if (!isObject(raw)) return safeFailure(new ApiProblem(400, 'Tool arguments must be an object.'));
	try {
		progressScene(
			session,
			name === 'execute_action' || name === 'restore_checkpoint'
				? 'Positioning the engine'
				: 'Inspecting the engine'
		);
		switch (name) {
			case 'get_state':
				return toolResult(stateForGuide(session));
			case 'get_components': {
				const search = typeof raw.search === 'string' ? raw.search.slice(0, 180).toLowerCase() : '';
				const limit =
					typeof raw.limit === 'number' && Number.isInteger(raw.limit)
						? Math.min(40, Math.max(1, raw.limit))
						: 20;
				const matching = session.components.filter(
					(component) =>
						!search ||
						`${component.id} ${component.name} ${component.cadProduct ?? ''} ${component.parent ?? ''} ${component.description ?? ''}`
							.toLowerCase()
							.includes(search)
				);
				return toolResult({
					components: matching.slice(0, limit),
					totalMatches: matching.length,
					registeredCount: session.components.length
				});
			}
			case 'get_operating_point':
				throw new ApiProblem(
					400,
					'Numerical performance is unavailable for this V12 concept; no matched calibration was supplied.'
				);
			case 'get_evidence': {
				const source = sources.find((s) => s.id === raw.id);
				if (!source) throw new ApiProblem(400, 'That source ID is not in the curated catalog.');
				return toolResult(source);
			}
			case 'execute_action':
				return toolResult(await executeSceneAction(session, raw.action, raw.expectedRevision));
			case 'save_checkpoint':
				if (typeof raw.label !== 'string' || raw.label.length > 100)
					throw new ApiProblem(400, 'Choose a short checkpoint label.');
				return toolResult(saveCheckpoint(session, raw.label));
			case 'restore_checkpoint':
				return toolResult(await restoreSceneCheckpoint(session, raw.id, raw.expectedRevision));
			default:
				throw new ApiProblem(400, 'That tool is unavailable.');
		}
	} catch (e) {
		return safeFailure(e);
	}
}
export async function handleSceneRpc(session: SceneSession, body: Record<string, unknown>) {
	const id = body.id;
	if (body.jsonrpc !== '2.0' || typeof body.method !== 'string')
		return {
			jsonrpc: '2.0',
			id: id ?? null,
			error: { code: -32600, message: 'Invalid RPC request' }
		};
	if (id === undefined) return null;
	let result: unknown;
	switch (body.method) {
		case 'initialize': {
			const params = isObject(body.params) ? body.params : {};
			result = {
				protocolVersion:
					typeof params.protocolVersion === 'string' ? params.protocolVersion : '2025-03-26',
				capabilities: { tools: {} },
				serverInfo: { name: 'diesel-scene', version: '1.0.0' },
				instructions:
					'Query registered components and state before mutations. Execute serially and wait for acknowledgement, then reread final state. Source phase zero is the supplied pose; local combustion timing is unavailable. Layout is a static common-scale atlas with presentation spacing. Numerical performance is unavailable. Stop cancels the run.'
			};
			break;
		}
		case 'ping':
			result = {};
			break;
		case 'tools/list':
			result = { tools: sceneTools };
			break;
		case 'tools/call': {
			const params = isObject(body.params) ? body.params : {};
			result = await callSceneTool(session, params.name, params.arguments ?? {});
			break;
		}
		default:
			return { jsonrpc: '2.0', id, error: { code: -32601, message: 'Unknown RPC method' } };
	}
	return { jsonrpc: '2.0', id, result };
}
