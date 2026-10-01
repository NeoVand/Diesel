import { sources } from '$lib/engine/data';
import {
	LAB_DISPLAYS,
	snapshotLabState,
	type LabAction,
	type LabSnapshot
} from '$lib/engine/lab-state';
import {
	isObject,
	scenePresentation,
	validateToolAction,
	type SceneContext,
	type SceneComponent
} from './scene-contract';
import { BrowserAIError } from './errors';

export interface BrowserSceneAdapter {
	context(): SceneContext;
	components(): readonly SceneComponent[];
	/** Resolve only after the scene has finished its transition. */
	execute(action: LabAction, expectedRevision: number, signal: AbortSignal): Promise<void>;
	progress(message: string): void;
}

/** Same revision/acknowledgement contract as the previous bridge, entirely in the browser. */
export function createBrowserSceneTools(adapter: BrowserSceneAdapter) {
	const checkpoints = new Map<string, { label: string; value: LabSnapshot }>();
	function state() {
		const context = adapter.context();
		return {
			...context,
			presentation: scenePresentation(context.state, context.actualPhase),
			checkpoints: [...checkpoints].map(([id, checkpoint]) => ({ id, label: checkpoint.label })),
			capabilities: {
				toolLoop: true,
				registeredComponents: adapter.components().length,
				displayModes: LAB_DISPLAYS,
				viewIndependentPlayback: true,
				numericPerformance: false,
				declaredAirStandardCycle: true,
				calibratedTransient: false,
				sectionPlane: { axes: ['x', 'y', 'z'], offsetRange: [0, 1], sourceCapsVerified: false },
				partsLayout: { static: true, physicalRelativeSizes: true, physicalSpacing: false }
			}
		};
	}
	function checkpoint(label: string) {
		if (checkpoints.size >= 12) checkpoints.delete(checkpoints.keys().next().value!);
		const id = crypto.randomUUID();
		const current = adapter.context();
		checkpoints.set(id, {
			label,
			value: snapshotLabState(current.state, {
				phase: current.actualPhase,
				camera: current.state.camera
			})
		});
		return { id, label };
	}
	async function execute(action: LabAction, revision: unknown, signal: AbortSignal) {
		if (!Number.isSafeInteger(revision) || revision !== adapter.context().state.revision)
			throw new BrowserAIError(409, 'Scene changed. Read the current state before retrying.');
		signal.throwIfAborted();
		await adapter.execute(action, revision as number, signal);
		signal.throwIfAborted();
		return { status: 'applied', ...state() };
	}
	return {
		state,
		checkpoint,
		async call(name: string, raw: unknown, signal: AbortSignal): Promise<unknown> {
			signal.throwIfAborted();
			try {
				if (!isObject(raw)) throw new BrowserAIError(400, 'Tool arguments must be an object.');
				adapter.progress(
					['execute_action', 'restore_checkpoint'].includes(name)
						? 'Positioning the engine…'
						: 'Inspecting the engine…'
				);
				switch (name) {
					case 'get_state':
						return state();
					case 'get_components': {
						const search =
							typeof raw.search === 'string' ? raw.search.slice(0, 180).toLowerCase() : '';
						const limit =
							typeof raw.limit === 'number' && Number.isInteger(raw.limit)
								? Math.min(40, Math.max(1, raw.limit))
								: 20;
						const components = adapter.components();
						const matches = components.filter(
							(component) =>
								!search ||
								`${component.id} ${component.name} ${component.cadProduct ?? ''} ${component.parent ?? ''} ${component.description ?? ''}`
									.toLowerCase()
									.includes(search)
						);
						return {
							components: matches.slice(0, limit),
							totalMatches: matches.length,
							registeredCount: components.length
						};
					}
					case 'get_evidence': {
						const evidence = sources.find((source) => source.id === raw.id);
						if (!evidence)
							throw new BrowserAIError(400, 'That source ID is not in the curated catalog.');
						return evidence;
					}
					case 'execute_action': {
						const action = validateToolAction(
							raw.action,
							adapter.context().state,
							adapter.components()
						);
						if (
							'id' in action &&
							action.id !== null &&
							!adapter.components().some((part) => part.id === action.id)
						)
							throw new BrowserAIError(400, 'Use an exact registered component ID.');
						return await execute(action, raw.expectedRevision, signal);
					}
					case 'save_checkpoint': {
						if (typeof raw.label !== 'string' || !raw.label.trim() || raw.label.length > 100)
							throw new BrowserAIError(400, 'Choose a short checkpoint label.');
						return checkpoint(raw.label.trim());
					}
					case 'restore_checkpoint': {
						const saved = typeof raw.id === 'string' ? checkpoints.get(raw.id) : null;
						if (!saved) throw new BrowserAIError(400, 'That checkpoint is unavailable.');
						return await execute(
							{ type: 'restore', value: saved.value },
							raw.expectedRevision,
							signal
						);
					}
					default:
						throw new BrowserAIError(400, 'That tool is unavailable.');
				}
			} catch (error) {
				signal.throwIfAborted();
				return {
					status: 'failed',
					message:
						error instanceof BrowserAIError
							? error.message
							: 'That scene operation could not be completed.'
				};
			}
		}
	};
}
