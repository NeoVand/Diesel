import { engineDefinition, v12Components } from '$lib/engine/definition';
import { parts } from '$lib/engine/data';
import { V12_CYCLE_STUDY, sampleV12CycleStudy } from '$lib/engine/v12-cycle-study';
import { v12CylinderValveState } from '$lib/engine/v12-valve-events';
import {
	applyLabAction,
	LAB_DISPLAYS,
	FLOW_IDS,
	playbackAvailability,
	validateLabState,
	type LabAction,
	type LabState,
	type LabDisplay
} from '$lib/engine/lab-state';
import { ApiProblem } from './validation';
import {
	V12_ANALYSIS,
	V12_ANALYSIS_CYLINDERS,
	v12KinematicMeasurement
} from '$lib/engine/v12-analysis';

export type SceneComponent = {
	id: string;
	name: string;
	cadProduct?: string;
	parent?: string | null;
	kind?: string;
	description?: string;
	material?: string;
	triangleCount?: number;
	confidence?: string;
};
export type SceneContext = {
	state: LabState;
	sampledAt: number;
	actualPhase: number;
	lesson: { id: string | null; step: number; status: 'idle' | 'playing' | 'paused' };
	narration: 'idle' | 'loading' | 'playing' | 'paused';
};
/** Meanings match the renderer; these are display capabilities, not production CAD claims. */
export const displayDescriptions = {
	assembly:
		'Purchased V12 source assembly. Named reveal presets remove specific exterior assemblies while retaining exact source identities.',
	section:
		'Movable, rotatable whole-engine plane through the complete purchased engine. It is separate from a focused cylinder view; real bores and cavities remain open.',
	cylinder:
		'Focused study of the actual source piston and its connected machinery. Global phase is crank rotation from the supplied pose, not calibrated combustion timing.',
	mechanism:
		'The purchased V12 machinery with documented derived geometry and contact corrections, including added spring retainers. Original source files remain preserved.',
	xray: 'The purchased exterior remains as a transparent spatial reference around the actual source internals. X-ray is a visual inspection aid, not an imaging simulation.',
	layout:
		'Static parts atlas arranged by system at one common physical scale. Grid spacing is a presentation choice. Motion and flow playback are paused.'
} satisfies Record<LabDisplay, string>;
export function scenePresentation(state: LabState, actualPhase = state.phase) {
	const trackedLinkage =
		V12_ANALYSIS_CYLINDERS.find((cylinder) =>
			[cylinder.id, cylinder.rodId, cylinder.linerId].includes(state.selected ?? '')
		) ?? V12_ANALYSIS_CYLINDERS[0];
	return {
		assetId: engineDefinition.assetId,
		assetVersion: engineDefinition.version,
		display: state.display,
		description: displayDescriptions[state.display],
		reveal: state.reveal,
		playback: {
			...playbackAvailability(state),
			viewIndependent: true,
			description:
				'Run or pause only changes mechanical playback. Exterior, section, mechanism and X-ray views retain their camera and visibility.'
		},
		flowPresentation:
			'Intake and exhaust tracers follow separate offline steady potential-flow fields inside recovered CAD passages, gated by actual cam-driven valves. Tracer speed is illustrative. Fuel parcels use declared nozzle/drag/evaporation assumptions and retire at wall contact. Chamber volume emission is an illustrative mixing/heat envelope, not a temperature field or reacting CFD. The air-standard cycle is an independent declared calculation; it is not coupled to passage tracer pressure or speed. Oil/coolant retain hardware highlighting. Disassembly and isolation suppress these process displays.',
		referenceCycleStudy:
			state.display === 'layout'
				? {
						available: false,
						reason: 'Return to connected machinery for a phase-aligned cylinder study.'
					}
				: {
						available: true,
						trackedPistonId: trackedLinkage.id,
						case: V12_CYCLE_STUDY.scenario,
						current: sampleV12CycleStudy(
							v12CylinderValveState(trackedLinkage.id, actualPhase).cycleAngleDeg
						),
						summary: V12_CYCLE_STUDY.summary,
						provenance: V12_CYCLE_STUDY.provenance,
						qualification:
							'Same declared case phase-aligned to each cylinder; no predicted cylinder-to-cylinder variation or authenticated engine rating.'
					},
		internals: state.internals,
		internalsEffective: state.internals,
		internalsScope:
			'Actual source internals. Named reveal presets and hidden/isolation controls determine visibility; the complete catalog stays registered.',
		clippingPlane:
			state.display === 'section'
				? {
						...state.section,
						scope: 'Whole purchased V12 engine',
						coordinates: 'Scene axes, normalized offset, optional [pitch,yaw] rotation in degrees',
						guideOnlyVisibility: true,
						capQuality:
							'Rendered cap quality depends on the actual derivative topology; native solid checks alone do not certify every browser cut.'
					}
				: null,
		inspectionAtlas:
			state.display === 'layout'
				? {
						uniformScaleWithinEachPart: true,
						relativePartSizesPreserved: true,
						physicalSpacing: false,
						storedPhaseRendered: false,
						explosionOffsetsApplied: false,
						removedOffsetsApplied: false,
						visibility:
							'Hidden and isolated parts remain explicit; all registered identities are searchable.'
					}
				: null,
		globalMechanicalPhase: state.display === 'layout' ? null : actualPhase,
		geometricAnalysis:
			state.display === 'layout'
				? { available: false, reason: 'The parts atlas shows a static arrangement at source rest.' }
				: {
						available: true,
						...V12_ANALYSIS,
						measurement: v12KinematicMeasurement(trackedLinkage.id, actualPhase)
					},
		sectionCylinder: null,
		cylinderPhase: null,
		cylinderStroke: null,
		phaseOffsetDegrees: null,
		trackedCylinder: null,
		phaseBasis:
			state.display === 'layout'
				? 'Static arrangement at source rest pose. The stored phase is not rendered.'
				: engineDefinition.capabilities.phaseBasis,
		visibilityQualification:
			'Reveal presets, isolation, hidden components and the retained side of a cut can limit visibility. Registered geometry is not proof that it is unobstructed.'
	};
}
export const knownComponentIds = new Set([
	...parts.map((part) => part.id),
	...v12Components.map((part) => part.id)
]);
export function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function boundedText(value: unknown, maximum: number): value is string {
	return typeof value === 'string' && value.length <= maximum;
}
export function validateComponents(value: unknown): SceneComponent[] {
	if (
		!Array.isArray(value) ||
		value.length < 1 ||
		value.length > engineDefinition.sourceCount + parts.length
	)
		throw new ApiProblem(400, 'The component catalog could not be read. Reload the engine.');
	const seen = new Set<string>();
	return value.map((entry) => {
		if (
			!isObject(entry) ||
			!boundedText(entry.id, 100) ||
			!knownComponentIds.has(entry.id) ||
			seen.has(entry.id) ||
			!boundedText(entry.name, 180) ||
			!entry.name.trim()
		)
			throw new ApiProblem(400, 'The component catalog contains an unavailable identity.');
		if (
			entry.parent !== undefined &&
			entry.parent !== null &&
			(!boundedText(entry.parent, 100) || !knownComponentIds.has(entry.parent))
		)
			throw new ApiProblem(400, 'The component parent could not be read.');
		for (const field of ['kind', 'material', 'confidence', 'cadProduct'])
			if (
				entry[field] !== undefined &&
				!boundedText(entry[field], field === 'material' ? 320 : 180)
			)
				throw new ApiProblem(400, 'The component metadata is too long.');
		if (entry.description !== undefined && !boundedText(entry.description, 800))
			throw new ApiProblem(400, 'The component description is too long.');
		if (
			entry.triangleCount !== undefined &&
			(typeof entry.triangleCount !== 'number' ||
				!Number.isSafeInteger(entry.triangleCount) ||
				entry.triangleCount < 0 ||
				entry.triangleCount > 100_000_000)
		)
			throw new ApiProblem(400, 'The component geometry count could not be read.');
		seen.add(entry.id);
		return {
			id: entry.id,
			name: entry.name,
			cadProduct: entry.cadProduct as string | undefined,
			parent: entry.parent as string | null | undefined,
			kind: entry.kind as string | undefined,
			description: entry.description as string | undefined,
			material: entry.material as string | undefined,
			confidence: entry.confidence as string | undefined,
			triangleCount: entry.triangleCount as number | undefined
		};
	});
}
export function validateSceneContext(
	value: unknown,
	components: readonly SceneComponent[]
): SceneContext {
	if (!isObject(value)) throw new ApiProblem(400, 'The live scene could not be read.');
	let state: LabState;
	// Acknowledgements must describe the browser, not rely on normalization to hide contradictory intent.
	if (
		isObject(value.state) &&
		value.state.display === 'layout' &&
		(value.state.running !== false || !Array.isArray(value.state.flows) || value.state.flows.length)
	)
		throw new ApiProblem(400, 'The parts layout must be paused with no active flows.');
	if (
		isObject(value.state) &&
		value.state.running === true &&
		(Number(value.state.explosion) > 0 ||
			(Array.isArray(value.state.removed) && value.state.removed.length > 0))
	)
		throw new ApiProblem(400, 'A separated engine must be paused before acknowledgement.');
	try {
		state = validateLabState(value.state, components);
	} catch {
		throw new ApiProblem(400, 'The working-engine state is invalid. Reset the view and try again.');
	}
	const sampledAt = value.sampledAt ?? Date.now();
	const actualPhase = value.actualPhase ?? state.phase;
	if (
		typeof sampledAt !== 'number' ||
		!Number.isFinite(sampledAt) ||
		sampledAt < 0 ||
		sampledAt > 1e14 ||
		typeof actualPhase !== 'number' ||
		!Number.isFinite(actualPhase) ||
		actualPhase < 0 ||
		actualPhase > 720
	)
		throw new ApiProblem(400, 'The live scene timing could not be read.');
	const lesson = value.lesson ?? { id: null, step: 0, status: 'idle' };
	if (
		!isObject(lesson) ||
		(lesson.id !== null && !boundedText(lesson.id, 100)) ||
		!Number.isSafeInteger(lesson.step) ||
		Number(lesson.step) < 0 ||
		Number(lesson.step) > 100 ||
		!['idle', 'playing', 'paused'].includes(String(lesson.status))
	)
		throw new ApiProblem(400, 'The lesson state could not be read.');
	const narration = value.narration ?? 'idle';
	if (!['idle', 'loading', 'playing', 'paused'].includes(String(narration)))
		throw new ApiProblem(400, 'The narration state could not be read.');
	return {
		state,
		sampledAt,
		actualPhase,
		lesson: lesson as SceneContext['lesson'],
		narration: narration as SceneContext['narration']
	};
}
export function validateToolAction(
	value: unknown,
	state: LabState,
	components: readonly SceneComponent[]
): LabAction {
	if (
		isObject(value) &&
		value.type === 'running' &&
		value.value === true &&
		!playbackAvailability(state).available
	)
		throw new ApiProblem(400, playbackAvailability(state).reason!);
	if (isObject(value) && value.type === 'load')
		throw new ApiProblem(400, 'No calibrated performance map is available for this V12.');
	if (!isObject(value) || value.type === 'restore')
		throw new ApiProblem(400, 'Use a saved checkpoint to restore the engine.');
	try {
		applyLabAction(state, value as unknown as LabAction, components);
	} catch {
		throw new ApiProblem(
			400,
			'That engine operation or component is unavailable. Query the current capabilities.'
		);
	}
	return value as unknown as LabAction;
}
const actionObject = (
	type: string,
	properties: Record<string, unknown> = {},
	required: string[] = []
) => ({
	type: 'object',
	additionalProperties: false,
	required: ['type', ...required],
	properties: { type: { type: 'string', const: type }, ...properties }
});
export const labActionSchema = {
	anyOf: [
		actionObject(
			'reveal',
			{ value: { type: 'string', enum: ['complete', 'covers', 'rotating', 'valvetrain'] } },
			['value']
		),
		actionObject('mode', { value: { type: 'string', enum: ['inspect', 'operate', 'learn'] } }, [
			'value'
		]),
		actionObject(
			'display',
			{
				value: {
					type: 'string',
					enum: [...LAB_DISPLAYS],
					description: Object.entries(displayDescriptions)
						.map(([mode, description]) => `${mode}: ${description}`)
						.join(' ')
				}
			},
			['value']
		),
		actionObject(
			'section',
			{
				value: {
					type: 'object',
					additionalProperties: false,
					required: ['axis', 'offset', 'flipped', 'visible'],
					properties: {
						rotation: {
							type: 'array',
							minItems: 2,
							maxItems: 2,
							items: { type: 'number', minimum: -180, maximum: 180 },
							description: 'Pitch then yaw degrees relative to the selected plane axis.'
						},
						axis: {
							type: 'string',
							enum: ['x', 'y', 'z'],
							description: 'Whole-engine scene axis normal to the clipping plane.'
						},
						offset: {
							type: 'number',
							minimum: 0,
							maximum: 1,
							description: 'Normalized cut position across full-engine bounds.'
						},
						flipped: {
							type: 'boolean',
							description: 'Reverse which side of the plane is clipped.'
						},
						visible: {
							type: 'boolean',
							description: 'Show the plane guide only; clipping remains active in section display.'
						}
					}
				}
			},
			['value']
		),
		...['running', 'isolate', 'internals'].map((type) =>
			actionObject(
				type,
				{
					value: {
						type: 'boolean',
						...(type === 'running'
							? {
									description:
										'Run or pause the measured mechanical motion without changing the display, reveal, selection or camera. Exterior running is supported. Atlas, explosion and lifted parts must be reassembled explicitly first.'
								}
							: {}),
						...(type === 'internals'
							? {
									description:
										'Compatibility visibility setting for source internals; use named reveal presets for deliberate anatomy views.'
								}
							: {})
					}
				},
				['value']
			)
		),
		...[
			['seek', 0, 720],
			['playback', 0.002, 1],
			['explosion', 0, 1]
		].map(([type, min, max]) =>
			actionObject(
				String(type),
				{
					value: {
						type: 'number',
						minimum: min,
						maximum: max,
						...(type === 'explosion'
							? {
									description:
										'Normalized inspection separation, 0 assembled to 1 full separation. Not a physical distance; retained but not applied to layout cards.'
								}
							: {})
					}
				},
				['value']
			)
		),
		actionObject(
			'flows',
			{
				value: {
					type: 'array',
					items: { type: 'string', enum: FLOW_IDS },
					maxItems: FLOW_IDS.length
				}
			},
			['value']
		),
		actionObject(
			'flow',
			{
				flow: { type: 'string', enum: FLOW_IDS },
				value: { type: 'boolean' }
			},
			['flow', 'value']
		),
		...['select', 'focus'].map((type) =>
			actionObject(type, { id: { anyOf: [{ type: 'string' }, { type: 'null' }] } }, ['id'])
		),
		...['hide', 'remove'].map((type) =>
			actionObject(type, { id: { type: 'string' }, value: { type: 'boolean' } }, ['id', 'value'])
		),
		actionObject(
			'view',
			{ value: { type: 'string', enum: ['perspective', 'front', 'side', 'top'] } },
			['value']
		),
		actionObject('fit'),
		actionObject('reset')
	]
};
