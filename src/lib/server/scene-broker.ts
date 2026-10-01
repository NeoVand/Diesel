import { engineDefinition } from '$lib/engine/definition';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import {
	applyLabAction,
	LAB_DISPLAYS,
	snapshotLabState,
	type LabAction,
	type LabSnapshot
} from '$lib/engine/lab-state';
import { ApiProblem } from './validation';
import {
	validateComponents,
	validateSceneContext,
	validateToolAction,
	displayDescriptions,
	scenePresentation,
	type SceneComponent,
	type SceneContext
} from './scene-contract';

export type SceneCommand = {
	type: 'command';
	id: string;
	runId: string;
	requestId: string | null;
	expectedRevision: number;
	action: LabAction;
};
export type SceneEvent =
	| SceneCommand
	| { type: 'ready' }
	| { type: 'cancel'; runId: string; requestId: string | null; reason: string }
	| { type: 'progress'; runId: string; requestId: string | null; message: string };
export type SceneResult = {
	status: 'applied' | 'unsupported' | 'failed';
	state: SceneContext;
	message?: string;
};
type Pending = {
	command: SceneCommand;
	expectedState: SceneContext['state'];
	resolve: (value: SceneResult) => void;
	timer: ReturnType<typeof setTimeout>;
};
export type SceneRun = {
	id: string;
	requestId: string | null;
	token: string;
	controller: AbortController;
	commandCount: number;
	unsubscribe: () => void;
	results: SceneResult[];
};
export type SceneSession = {
	id: string;
	token: string;
	origin: string;
	components: SceneComponent[];
	context: SceneContext;
	listeners: Set<(event: SceneEvent) => void>;
	pending: Map<string, Pending>;
	checkpoints: Map<string, { label: string; value: LabSnapshot }>;
	run: SceneRun | null;
	touched: number;
};
const sessions = new Map<string, SceneSession>();
const runTokens = new Map<string, SceneSession>();
const SESSION_TTL = 20 * 60_000;
function sameToken(actual: string, expected: string) {
	const a = Buffer.from(actual),
		b = Buffer.from(expected);
	return a.length === b.length && timingSafeEqual(a, b);
}
function prune() {
	for (const session of sessions.values())
		if (Date.now() - session.touched > SESSION_TTL) {
			cancelRun(session, 'The engine session expired.');
			sessions.delete(session.id);
		}
}
export function bearerToken(request: Request): string {
	const header = request.headers.get('authorization');
	if (!header?.startsWith('Bearer '))
		throw new ApiProblem(401, 'The engine session is unavailable. Reconnect the guide.');
	return header.slice(7);
}
export function createSceneSession(
	payload: unknown,
	origin: string
): { sessionId: string; token: string } {
	prune();
	if (sessions.size >= 24)
		throw new ApiProblem(429, 'Too many engine sessions are open. Close an unused session.');
	if (typeof payload !== 'object' || payload === null)
		throw new ApiProblem(400, 'The engine session could not be created.');
	const body = payload as Record<string, unknown>;
	const components = validateComponents(body.components);
	const context = validateSceneContext(body, components);
	const session: SceneSession = {
		id: randomUUID(),
		token: randomBytes(32).toString('hex'),
		origin,
		components,
		context,
		listeners: new Set(),
		pending: new Map(),
		checkpoints: new Map(),
		run: null,
		touched: Date.now()
	};
	sessions.set(session.id, session);
	return { sessionId: session.id, token: session.token };
}
export function getSceneSession(id: unknown, token: string, origin?: string): SceneSession {
	prune();
	const session = typeof id === 'string' ? sessions.get(id) : undefined;
	if (!session || !sameToken(token, session.token) || (origin && origin !== session.origin))
		throw new ApiProblem(401, 'The engine session is unavailable. Reconnect the guide.');
	session.touched = Date.now();
	return session;
}
export function updateSceneState(session: SceneSession, payload: unknown): SceneContext {
	const context = validateSceneContext(payload, session.components);
	if (context.state.revision < session.context.state.revision)
		throw new ApiProblem(409, 'This engine state is older than the current view.');
	// Animation/camera samples share a revision and may arrive out of order over HTTP.
	if (
		context.state.revision === session.context.state.revision &&
		context.sampledAt < session.context.sampledAt
	)
		return session.context;
	session.context = context;
	session.touched = Date.now();
	return context;
}
export function subscribeScene(
	session: SceneSession,
	listener: (event: SceneEvent) => void
): () => void {
	session.listeners.add(listener);
	listener({ type: 'ready' });
	return () => {
		session.listeners.delete(listener);
		if (session.listeners.size === 0) cancelRun(session, 'The browser disconnected.');
	};
}
function emit(session: SceneSession, event: SceneEvent) {
	for (const listener of session.listeners) listener(event);
}
export function beginSceneRun(
	session: SceneSession,
	signal: AbortSignal,
	requestId: string | null = null
): SceneRun {
	if (!session.listeners.size)
		throw new ApiProblem(409, 'Connect the live engine view before asking the guide.');
	if (session.run)
		throw new ApiProblem(
			409,
			'The guide is already controlling this engine view. Stop that request first.'
		);
	const run: SceneRun = {
		id: randomUUID(),
		requestId,
		token: randomBytes(32).toString('hex'),
		controller: new AbortController(),
		commandCount: 0,
		unsubscribe: () => {},
		results: []
	};
	session.run = run;
	runTokens.set(run.token, session);
	const abort = () => cancelRun(session, 'The guide request was stopped.');
	signal.addEventListener('abort', abort, { once: true });
	run.unsubscribe = () => signal.removeEventListener('abort', abort);
	if (signal.aborted) abort();
	else saveCheckpoint(session, 'Before agent exploration');
	return run;
}
export function finishSceneRun(session: SceneSession, run: SceneRun) {
	if (session.run === run) {
		if (session.pending.size) {
			cancelRun(session, 'The guide ended before scene execution completed.');
			return;
		}
		run.unsubscribe();
		runTokens.delete(run.token);
		session.run = null;
	}
}
export function cancelRun(session: SceneSession, reason = 'Stopped by the visitor.') {
	const run = session.run;
	if (!run) return;
	run.controller.abort();
	run.unsubscribe();
	runTokens.delete(run.token);
	session.run = null;
	for (const pending of session.pending.values()) {
		clearTimeout(pending.timer);
		pending.resolve({ status: 'failed', state: session.context, message: reason });
	}
	session.pending.clear();
	emit(session, { type: 'cancel', runId: run.id, requestId: run.requestId, reason });
}
export function sceneForRunToken(token: string): SceneSession {
	const session = runTokens.get(token);
	if (!session?.run || session.run.controller.signal.aborted)
		throw new ApiProblem(401, 'This guide run is no longer active.');
	return session;
}
export function progressScene(session: SceneSession, message: string) {
	if (session.run)
		emit(session, {
			type: 'progress',
			runId: session.run.id,
			requestId: session.run.requestId,
			message
		});
}
export function saveCheckpoint(session: SceneSession, label: string) {
	const id = randomUUID();
	if (session.checkpoints.size >= 12)
		session.checkpoints.delete(session.checkpoints.keys().next().value!);
	const value = snapshotLabState(session.context.state, {
		phase: session.context.actualPhase,
		camera: session.context.state.camera
	});
	session.checkpoints.set(id, { label: label.slice(0, 100), value });
	return { id, label };
}
export async function executeSceneAction(
	session: SceneSession,
	value: unknown,
	expectedRevision: unknown,
	timeoutMs = 12_000
): Promise<SceneResult> {
	const action = validateToolAction(value, session.context.state, session.components);
	return dispatchSceneAction(session, action, expectedRevision, timeoutMs);
}
export async function restoreSceneCheckpoint(
	session: SceneSession,
	id: unknown,
	expectedRevision: unknown
): Promise<SceneResult> {
	const checkpoint = typeof id === 'string' ? session.checkpoints.get(id) : undefined;
	if (!checkpoint)
		throw new ApiProblem(400, 'That checkpoint is unavailable. Query saved checkpoints.');
	return dispatchSceneAction(
		session,
		{ type: 'restore', value: checkpoint.value },
		expectedRevision,
		12_000
	);
}
function dispatchSceneAction(
	session: SceneSession,
	action: LabAction,
	expectedRevision: unknown,
	timeoutMs: number
): Promise<SceneResult> {
	const run = session.run;
	if (!run || run.controller.signal.aborted)
		throw new ApiProblem(409, 'This guide run has stopped.');
	if (
		!Number.isSafeInteger(expectedRevision) ||
		expectedRevision !== session.context.state.revision
	)
		return Promise.resolve({
			status: 'failed',
			state: session.context,
			message: 'The view changed. Query the state and use its current revision.'
		});
	if (session.pending.size)
		return Promise.resolve({
			status: 'failed',
			state: session.context,
			message: 'Wait for the current scene operation before issuing another.'
		});
	if (++run.commandCount > 24)
		throw new ApiProblem(
			429,
			'The guide reached the scene-operation limit. Ask for a shorter sequence.'
		);
	const expectedState = applyLabAction(session.context.state, action, session.components);
	const command: SceneCommand = {
		type: 'command',
		id: randomUUID(),
		runId: run.id,
		requestId: run.requestId,
		expectedRevision: Number(expectedRevision),
		action
	};
	return new Promise((resolve) => {
		const timer = setTimeout(() => {
			session.pending.delete(command.id);
			resolve({
				status: 'failed',
				state: session.context,
				message: 'The browser did not finish this scene operation in time.'
			});
			cancelRun(session, 'The scene operation timed out.');
		}, timeoutMs);
		session.pending.set(command.id, { command, expectedState, resolve, timer });
		emit(session, command);
	});
}
function intentMatches(actual: SceneContext['state'], expected: SceneContext['state']) {
	for (const key of Object.keys(expected) as (keyof SceneContext['state'])[]) {
		if (key === 'camera') continue;
		if (JSON.stringify(actual[key]) !== JSON.stringify(expected[key])) return false;
	}
	return true;
}
export function acknowledgeScene(
	session: SceneSession,
	payload: Record<string, unknown>
): SceneResult {
	const pending = typeof payload.id === 'string' ? session.pending.get(payload.id) : undefined;
	if (
		!pending ||
		!session.run ||
		payload.runId !== session.run.id ||
		pending.command.runId !== session.run.id
	)
		throw new ApiProblem(409, 'This scene command is no longer active.');
	if (!['applied', 'unsupported', 'failed'].includes(String(payload.status)))
		throw new ApiProblem(400, 'The scene acknowledgement could not be read.');
	const context = validateSceneContext(payload, session.components);
	if (context.state.revision < session.context.state.revision)
		throw new ApiProblem(409, 'The acknowledgement describes an older engine state.');
	if (payload.status === 'applied' && !intentMatches(context.state, pending.expectedState))
		throw new ApiProblem(409, 'The engine view did not apply the requested operation.');
	const result: SceneResult = {
		status: payload.status as SceneResult['status'],
		state: context,
		...(typeof payload.message === 'string' ? { message: payload.message.slice(0, 400) } : {})
	};
	session.context = context;
	session.run.results.push(result);
	clearTimeout(pending.timer);
	session.pending.delete(pending.command.id);
	pending.resolve(result);
	return result;
}
export function stateForGuide(session: SceneSession) {
	return {
		...session.context,
		presentation: scenePresentation(session.context.state, session.context.actualPhase),
		pendingTransitions: [...session.pending.values()].map((p) => ({
			id: p.command.id,
			runId: p.command.runId,
			action: p.command.action.type
		})),
		checkpoints: [...session.checkpoints].map(([id, c]) => ({ id, label: c.label })),
		capabilities: {
			toolLoop: true,
			registeredComponents: session.components.length,
			displayModes: [...LAB_DISPLAYS],
			sectionPlane: {
				axes: ['x', 'y', 'z'],
				offsetRange: [0, 1],
				guideVisibilityOnly: true,
				sourceCapsVerified: false,
				rotation: { order: ['pitch', 'yaw'], degreesRange: [-180, 180] }
			},
			internalsVisibility: true,
			internalsVisibilityDisplays: [
				'assembly',
				'section',
				'cylinder',
				'mechanism',
				'xray',
				'layout'
			],
			viewIndependentPlayback: true,
			geometricAnalysis: ['piston-displacement', 'rod-inclination'],
			partsLayout: {
				static: true,
				perPartUniformScale: true,
				physicalRelativeSizes: true,
				physicalSpacing: false
			},
			explosionRange: [0, 1],
			standaloneTeachingRigAlwaysEnabled: false,
			revealPresets: ['complete', 'covers', 'rotating', 'valvetrain'],
			displayDescriptions,
			assetId: engineDefinition.assetId,
			assetVersion: engineDefinition.version,
			numericPerformance: false,
			declaredAirStandardCycle: true,
			referenceRpm: null,
			referenceLoadRange: null,
			educationalInternals: session.components.some((component) =>
				component.id.startsWith('mech:')
			),
			calibratedTransient: false
		}
	};
}
export function clearSceneSessionsForTests() {
	for (const s of sessions.values()) cancelRun(s);
	sessions.clear();
	runTokens.clear();
}
