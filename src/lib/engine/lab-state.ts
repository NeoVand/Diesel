import { engineDefinition, v12Components } from './definition';
import type { PartId } from './types';

export type LabMode = 'inspect' | 'operate' | 'learn';
export const LAB_DISPLAYS = [
	'assembly',
	'section',
	'cylinder',
	'mechanism',
	'xray',
	'layout'
] as const;
export type LabDisplay = (typeof LAB_DISPLAYS)[number];
export type RevealPreset = 'complete' | 'covers' | 'rotating' | 'valvetrain';
export type SectionAxis = 'x' | 'y' | 'z';
export interface LabSection {
	/** Additional pitch then yaw rotation in degrees, relative to the selected axis. */
	rotation?: [number, number];
	axis: SectionAxis;
	/** Normalized cut location within whole-engine scene bounds. */
	offset: number;
	flipped: boolean;
	/** Plane guide visibility; section display clips even when this is false. */
	visible: boolean;
}
export type LabView = 'perspective' | 'front' | 'side' | 'top';
export type FlowId = 'air' | 'exhaust' | 'fuel' | 'combustion' | 'coolant' | 'oil';
export interface LabCamera {
	/** Orthographic view magnification; omitted for perspective or older snapshots. */
	zoom?: number;
	position: [number, number, number];
	target: [number, number, number];
}

export interface LabState {
	assetId: string;
	assetVersion: string;
	reveal: RevealPreset;
	mode: LabMode;
	display: LabDisplay;
	section: LabSection;
	internals: boolean;
	running: boolean;
	/** Requested seek angle; actual animation phase is sampled separately. */
	phase: number;
	/** Continuous mechanical drive position retained by checkpoints; null means an explicit seek. */
	driveAngle: number | null;
	seekToken: number;
	playback: number;
	flows: FlowId[];
	selected: string | null;
	explosion: number;
	isolated: boolean;
	hidden: string[];
	removed: string[];
	focused: string | null;
	focusToken: number;
	view: LabView;
	loadPercent: number;
	/** Only discrete accepted intents advance revision, never render frames. */
	revision: number;
	resetSignal: number;
	camera: LabCamera | null;
}

/** Mechanical playback is independent of the camera and of how the assembled engine is viewed. */
export function playbackAvailability(state: Pick<LabState, 'display' | 'explosion' | 'removed'>): {
	available: boolean;
	reason: string | null;
} {
	if (state.display === 'layout')
		return { available: false, reason: 'Return to a 3D inspection view to run the mechanism.' };
	if (state.explosion > 0)
		return { available: false, reason: 'Reassemble the engine before running the mechanism.' };
	if (state.removed.length > 0)
		return { available: false, reason: 'Return lifted parts before running the mechanism.' };
	return { available: true, reason: null };
}

export interface ComponentRecord {
	id: string;
	name: string;
	parent: PartId;
	sourceGroup?: string;
	/** Recovered vendor STEP label; geometry provenance, not verified OEM identity. */
	cadProduct?: string;
	kind: 'source' | 'educational';
	description: string;
	material: string;
	triangleCount: number;
	confidence: 'visual' | 'illustrative';
}

export type ComponentRegistry = readonly Pick<ComponentRecord, 'id'>[];
export type LabSnapshot = Omit<LabState, 'revision' | 'seekToken' | 'resetSignal' | 'focusToken'>;
export type LabAction =
	| { type: 'reveal'; value: RevealPreset }
	| { type: 'mode'; value: LabMode }
	| { type: 'display'; value: LabDisplay }
	| { type: 'section'; value: LabSection }
	| { type: 'internals'; value: boolean }
	| { type: 'running'; value: boolean }
	| { type: 'seek'; value: number }
	| { type: 'playback'; value: number }
	| { type: 'flows'; value: FlowId[] }
	| { type: 'flow'; flow: FlowId; value: boolean }
	| { type: 'select'; id: string | null }
	| { type: 'explosion'; value: number }
	| { type: 'isolate'; value: boolean }
	| { type: 'hide' | 'remove'; id: string; value: boolean }
	| { type: 'focus'; id: string | null }
	| { type: 'view'; value: LabView }
	| { type: 'load'; value: number }
	| { type: 'fit' }
	| { type: 'restore'; value: LabSnapshot }
	| { type: 'reset' };

export const FLOW_COLORS: Record<FlowId, string> = {
	air: '#83dded',
	exhaust: '#eeb084',
	fuel: '#f4cc68',
	combustion: '#ffa86b',
	coolant: '#4f95e5',
	oil: '#c2a977'
};
export const flowLabels: Record<FlowId, string> = {
	air: 'Intake air',
	exhaust: 'Exhaust',
	fuel: 'Fuel',
	combustion: 'Ignition & combustion',
	coolant: 'Jacket coolant',
	oil: 'Lubrication oil'
};
export const FLOW_IDS: readonly FlowId[] = [
	'air',
	'exhaust',
	'fuel',
	'combustion',
	'coolant',
	'oil'
];

const educationalFinish = 'Authored teaching finish; production alloy and dimensions unverified';
export const teachingComponents: readonly ComponentRecord[] = [
	{
		id: 'mech:piston',
		name: 'Teaching pistons',
		parent: 'block',
		kind: 'educational',
		description:
			'Nominal bore and stroke, simplified crown. The actual piston bowl and pin dimensions are not supplied.',
		material: educationalFinish,
		triangleCount: 0,
		confidence: 'illustrative'
	},
	{
		id: 'mech:rod',
		name: 'Connecting rods',
		parent: 'block',
		kind: 'educational',
		description:
			'Constrained pin-to-pin mechanism with an explicitly assumed 350 mm rod length; not an OEM rod model.',
		material: educationalFinish,
		triangleCount: 0,
		confidence: 'illustrative'
	},
	{
		id: 'mech:crankshaft',
		name: 'Teaching crankshaft',
		parent: 'block',
		kind: 'educational',
		description:
			'95 mm nominal crank radius. Representative bank/crank arrangement and cylinder phasing are educational, not Cat firing order.',
		material: educationalFinish,
		triangleCount: 0,
		confidence: 'illustrative'
	},
	{
		id: 'mech:intake-valve',
		name: 'Intake valve groups',
		parent: 'heads',
		kind: 'educational',
		description:
			'Simplified intake actuation with an idealized cycle window. Count, lift, overlap and timing require matching documents.',
		material: educationalFinish,
		triangleCount: 0,
		confidence: 'illustrative'
	},
	{
		id: 'mech:exhaust-valve',
		name: 'Exhaust valve groups',
		parent: 'heads',
		kind: 'educational',
		description:
			'Simplified exhaust actuation with an idealized cycle window. This is not a verified production valvetrain.',
		material: educationalFinish,
		triangleCount: 0,
		confidence: 'illustrative'
	},
	{
		id: 'mech:injector',
		name: 'Unit-injector representations',
		parent: 'fuel',
		kind: 'educational',
		description:
			'EUI teaching representation with an illustrative injection indication near compression TDC, not a nozzle or rate calibration.',
		material: educationalFinish,
		triangleCount: 0,
		confidence: 'illustrative'
	},
	{
		id: 'mech:liner',
		name: 'Cylinder liners',
		parent: 'block',
		kind: 'educational',
		description:
			'A simplified nominal 170 mm cylinder bore. Cooling passages and detailed liner construction are unknown.',
		material: educationalFinish,
		triangleCount: 0,
		confidence: 'illustrative'
	},
	{
		id: 'mech:head',
		name: 'Teaching cylinder heads',
		parent: 'heads',
		kind: 'educational',
		description:
			'An authored section surface around the valve/injector teaching mechanism; not a verified head, chamber or coolant jacket.',
		material: educationalFinish,
		triangleCount: 0,
		confidence: 'illustrative'
	},
	{
		id: 'mech:camshaft',
		name: 'Teaching camshaft',
		parent: 'heads',
		kind: 'educational',
		description:
			'Illustrative half-crank-speed actuation. The real cam count, location, profile and timing require matched documentation.',
		material: educationalFinish,
		triangleCount: 0,
		confidence: 'illustrative'
	},
	{
		id: 'mech:block',
		name: 'Teaching engine structure',
		parent: 'block',
		kind: 'educational',
		description:
			'An authored frame for viewing the instructional mechanism, distinct from the purchased exterior and actual internal block geometry.',
		material: educationalFinish,
		triangleCount: 0,
		confidence: 'illustrative'
	}
];

const semanticIds: readonly PartId[] = [
	'block',
	'heads',
	'turbo',
	'air',
	'cooling',
	'fuel',
	'exhaust',
	'flywheel',
	'accessories'
];
const teachingIds = new Set<string>(
	teachingComponents.flatMap((component) => {
		if (component.id === 'mech:crankshaft' || component.id === 'mech:block') return [component.id];
		if (component.id === 'mech:camshaft')
			return [component.id, 'mech:camshaft:A', 'mech:camshaft:B'];
		return [
			component.id,
			...Array.from({ length: 12 }, (_, i) => `${component.id}:${String(i + 1).padStart(2, '0')}`)
		];
	})
);

export function getTeachingComponent(id: string): ComponentRecord | undefined {
	if (!teachingIds.has(id)) return undefined;
	const component = teachingComponents.find(
		(entry) => id === entry.id || id.startsWith(`${entry.id}:`)
	);
	if (!component) return undefined;
	const suffix = id.slice(component.id.length + 1);
	return {
		...component,
		id,
		name: suffix
			? `${component.name} · ${component.id === 'mech:camshaft' ? 'Bank' : 'Cylinder'} ${suffix}`
			: component.name
	};
}

export const initialLabState: LabState = {
	assetId: engineDefinition.assetId,
	assetVersion: engineDefinition.version,
	reveal: 'complete',
	mode: 'inspect',
	display: 'assembly',
	section: { axis: 'x', offset: 0.5, flipped: false, visible: true },
	internals: true,
	running: false,
	phase: 0,
	driveAngle: null,
	seekToken: 0,
	playback: 0.02,
	flows: [],
	selected: null,
	explosion: 0,
	isolated: false,
	hidden: [],
	removed: [],
	focused: null,
	focusToken: 0,
	view: 'perspective',
	loadPercent: 75,
	revision: 0,
	resetSignal: 0,
	camera: null
};

const stateKeys = Object.keys(initialLabState);
const counterKeys = ['revision', 'seekToken', 'resetSignal', 'focusToken'] as const;
const snapshotKeys = stateKeys.filter(
	(key) => !counterKeys.includes(key as (typeof counterKeys)[number])
);

function record(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function fields(
	value: Record<string, unknown>,
	allowed: readonly string[],
	required = allowed
): void {
	if (
		Object.keys(value).some((key) => !allowed.includes(key)) ||
		required.some((key) => !(key in value))
	)
		throw new TypeError('The lab value has missing or unknown fields.');
}
function bounded(value: unknown, min: number, max: number, label: string): number {
	if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max)
		throw new RangeError(`${label} must be finite and between ${min} and ${max}.`);
	return value;
}
function enumeration<T extends string>(value: unknown, choices: readonly T[], label: string): T {
	if (typeof value !== 'string' || !choices.includes(value as T))
		throw new TypeError(`Invalid ${label}.`);
	return value as T;
}
function boolean(value: unknown, label: string): boolean {
	if (typeof value !== 'boolean') throw new TypeError(`${label} must be boolean.`);
	return value;
}
function componentId(
	value: unknown,
	components?: ComponentRegistry,
	nullable = false
): string | null {
	if (value === null && nullable) return null;
	if (typeof value !== 'string' || value.length > 160 || !/^[A-Za-z0-9_:.-]+$/.test(value))
		throw new TypeError('Invalid component identifier.');
	const accepted = components
		? components.some((entry) => entry.id === value) ||
			teachingIds.has(value) ||
			semanticIds.includes(value as PartId)
		: teachingIds.has(value) ||
			semanticIds.includes(value as PartId) ||
			/^Frame_[A-Za-z0-9_.-]+$/.test(value) ||
			v12Components.some((component) => component.id === value);
	if (!accepted) throw new RangeError('The component is not registered.');
	return value;
}
function componentList(value: unknown, components?: ComponentRegistry): string[] {
	if (!Array.isArray(value) || value.length > 1500 || new Set(value).size !== value.length)
		throw new TypeError('Component lists must be bounded and contain unique IDs.');
	return value.map((id) => componentId(id, components) as string);
}
function flowList(value: unknown): FlowId[] {
	if (
		!Array.isArray(value) ||
		value.length > FLOW_IDS.length ||
		new Set(value).size !== value.length
	)
		throw new TypeError('Flow lists must contain unique supported systems.');
	return value.map((id) => enumeration(id, FLOW_IDS, 'flow system'));
}
function sectionValue(value: unknown): LabSection {
	if (!record(value)) throw new TypeError('Invalid section plane.');
	fields(
		value,
		['axis', 'offset', 'flipped', 'visible', 'rotation'],
		['axis', 'offset', 'flipped', 'visible']
	);
	let rotation: [number, number] | undefined;
	if (value.rotation !== undefined) {
		if (!Array.isArray(value.rotation) || value.rotation.length !== 2)
			throw new TypeError('Plane rotation requires pitch and yaw.');
		rotation = value.rotation.map((angle) => bounded(angle, -180, 180, 'Plane rotation')) as [
			number,
			number
		];
	}
	return {
		...(rotation ? { rotation } : {}),
		axis: enumeration(value.axis, ['x', 'y', 'z'], 'section axis'),
		offset: bounded(value.offset, 0, 1, 'Section offset'),
		flipped: boolean(value.flipped, 'Section direction'),
		visible: boolean(value.visible, 'Section guide visibility')
	};
}
function cameraValue(value: unknown): LabCamera | null {
	if (value === null) return null;
	if (!record(value)) throw new TypeError('Invalid camera snapshot.');
	fields(value, ['position', 'target', 'zoom'], ['position', 'target']);
	function vector(input: unknown): [number, number, number] {
		if (!Array.isArray(input) || input.length !== 3)
			throw new TypeError('Camera vectors require three coordinates.');
		return input.map((number) => bounded(number, -1_000_000, 1_000_000, 'Camera coordinate')) as [
			number,
			number,
			number
		];
	}
	const position = vector(value.position);
	const target = vector(value.target);
	if (Math.hypot(...position.map((coordinate, index) => coordinate - target[index])) < 1e-9)
		throw new RangeError('Camera position and target must be distinct.');
	return {
		position,
		target,
		...(value.zoom !== undefined ? { zoom: bounded(value.zoom, 0.01, 200, 'Camera zoom') } : {})
	};
}

function hiddenBy(id: string | null, hidden: readonly string[]): boolean {
	return id !== null && hidden.some((entry) => id === entry || id.startsWith(`${entry}:`));
}

/** Strict bounded validation and detached copying; layout always normalizes to paused with no flows. */
export function validateLabState(value: unknown, components?: ComponentRegistry): LabState {
	if (!record(value)) throw new TypeError('The lab state must be an object.');
	fields(
		value,
		stateKeys,
		stateKeys.filter((key) => key !== 'driveAngle')
	);
	const counters = Object.fromEntries(
		counterKeys.map((key) => {
			const count = bounded(value[key], 0, Number.MAX_SAFE_INTEGER - 2, key);
			if (!Number.isSafeInteger(count)) throw new RangeError(`${key} must be an integer.`);
			return [key, count];
		})
	) as Pick<LabState, (typeof counterKeys)[number]>;
	const display = enumeration(value.display, LAB_DISPLAYS, 'display');
	const running = boolean(value.running, 'Running state');
	const flows = flowList(value.flows);
	const explosion = bounded(value.explosion, 0, 1, 'Explosion');
	const removed = componentList(value.removed, components);
	const assembled = playbackAvailability({ display, explosion, removed }).available;
	const selected = componentId(value.selected, components, true);
	const hidden = componentList(value.hidden, components);
	const isolated = boolean(value.isolated, 'Isolation');
	if (isolated && (!selected || hiddenBy(selected, hidden)))
		throw new RangeError('Isolation requires a visible selected component.');
	const phase = bounded(value.phase, 0, 720, 'Seek angle');
	const driveAngle =
		value.driveAngle == null ? null : bounded(value.driveAngle, 0, 1e12, 'Continuous drive angle');
	if (driveAngle !== null) {
		const phaseError = Math.abs(((((driveAngle - phase + 360) % 720) + 720) % 720) - 360);
		if (phaseError > 1e-4)
			throw new RangeError('Continuous drive angle must match the displayed cycle phase.');
	}
	return {
		assetId: enumeration(value.assetId, [engineDefinition.assetId], 'asset'),
		assetVersion: enumeration(value.assetVersion, [engineDefinition.version], 'asset version'),
		reveal: enumeration(
			value.reveal,
			['complete', 'covers', 'rotating', 'valvetrain'],
			'reveal preset'
		),
		mode: enumeration(value.mode, ['inspect', 'operate', 'learn'], 'mode'),
		display,
		section: sectionValue(value.section),
		internals: boolean(value.internals, 'Internal geometry visibility'),
		// The inspection atlas has no cycle or flow playback; retained phase is restored on exit.
		running: assembled ? running : false,
		phase,
		driveAngle,
		playback: bounded(value.playback, 0.002, 1, 'Playback scale'),
		flows: display === 'layout' ? [] : flows,
		selected,
		explosion,
		isolated,
		hidden,
		removed,
		focused: componentId(value.focused, components, true),
		view: enumeration(value.view, ['perspective', 'front', 'side', 'top'], 'view'),
		loadPercent: bounded(value.loadPercent, 10, 100, 'Reference load'),
		camera: cameraValue(value.camera),
		...counters
	};
}

export function createLabState(overrides: Partial<LabSnapshot> = {}): LabState {
	if (!record(overrides)) throw new TypeError('Initial overrides must be an object.');
	fields(overrides, snapshotKeys, []);
	return validateLabState({ ...initialLabState, ...overrides });
}
export const initLabState = createLabState;

export function snapshotLabState(
	state: LabState,
	live: { phase?: number; driveAngle?: number | null; camera?: LabCamera | null } = {}
): LabSnapshot {
	const copy = validateLabState({
		...state,
		...live,
		driveAngle:
			live.phase !== undefined ? (live.driveAngle ?? null) : (live.driveAngle ?? state.driveAngle)
	});
	const snapshot = Object.fromEntries(
		snapshotKeys.map((key) => [key, copy[key as keyof LabState]])
	);
	return snapshot as LabSnapshot;
}

function sameSnapshot(left: LabState, right: LabState): boolean {
	return JSON.stringify(left) === JSON.stringify(right);
}

/** Shared UI/agent pure reducer. Invalid commands throw and never modify the input. */
export function applyLabAction(
	state: LabState,
	action: LabAction,
	components?: ComponentRegistry
): LabState {
	const base = validateLabState(state, components);
	if (!record(action) || typeof action.type !== 'string')
		throw new TypeError('Invalid lab action.');
	let next = { ...base };
	switch (action.type) {
		case 'reveal':
			fields(action, ['type', 'value']);
			next.reveal = enumeration(
				action.value,
				['complete', 'covers', 'rotating', 'valvetrain'],
				'reveal preset'
			);
			break;
		case 'mode':
			fields(action, ['type', 'value']);
			next.mode = enumeration(action.value, ['inspect', 'operate', 'learn'], 'mode');
			break;
		case 'display':
			fields(action, ['type', 'value']);
			next.display = enumeration(action.value, LAB_DISPLAYS, 'display');
			break;
		case 'section':
			fields(action, ['type', 'value']);
			next.section = sectionValue(action.value);
			break;
		case 'internals':
			fields(action, ['type', 'value']);
			next.internals = boolean(action.value, 'Internal geometry visibility');
			break;
		case 'running':
			fields(action, ['type', 'value']);
			next.running = boolean(action.value, 'Running state');
			if (next.running && !playbackAvailability(base).available)
				throw new RangeError(playbackAvailability(base).reason!);
			break;
		case 'seek':
			fields(action, ['type', 'value']);
			next.phase = bounded(action.value, 0, 720, 'Seek angle');
			next.driveAngle = null;
			next.seekToken++;
			break;
		case 'playback':
			fields(action, ['type', 'value']);
			next.playback = bounded(action.value, 0.002, 1, 'Playback scale');
			break;
		case 'flows':
			fields(action, ['type', 'value']);
			next.flows = flowList(action.value);
			break;
		case 'flow': {
			fields(action, ['type', 'flow', 'value']);
			const flow = enumeration(action.flow, FLOW_IDS, 'flow system');
			const enabled = boolean(action.value, 'Flow visibility');
			next.flows = enabled
				? [...new Set([...base.flows, flow])]
				: base.flows.filter((id) => id !== flow);
			break;
		}
		case 'select': {
			fields(action, ['type', 'id']);
			next.selected = componentId(action.id, components, true);
			if (next.selected?.startsWith('mech:')) next.internals = true;
			next.isolated = false;
			break;
		}
		case 'explosion':
			fields(action, ['type', 'value']);
			next.explosion = bounded(action.value, 0, 1, 'Explosion');
			break;
		case 'isolate':
			fields(action, ['type', 'value']);
			next.isolated = boolean(action.value, 'Isolation');
			break;
		case 'hide':
		case 'remove': {
			fields(action, ['type', 'id', 'value']);
			const id = componentId(action.id, components) as string;
			const active = boolean(action.value, 'Component visibility');
			const key = action.type === 'hide' ? 'hidden' : 'removed';
			next[key] = active
				? [...new Set([...base[key], id])]
				: base[key].filter((entry) => entry !== id);
			if (action.type === 'hide' && active && hiddenBy(base.selected, [id])) {
				next.selected = null;
				next.isolated = false;
			}
			if (action.type === 'hide' && active && hiddenBy(base.focused, [id])) next.focused = null;
			break;
		}
		case 'focus':
			fields(action, ['type', 'id']);
			next.focused = componentId(action.id, components, true);
			if (next.focused?.startsWith('mech:')) next.internals = true;
			next.focusToken++;
			next.camera = null;
			break;
		case 'view':
			fields(action, ['type', 'value']);
			next.view = enumeration(action.value, ['perspective', 'front', 'side', 'top'], 'view');
			// A named orientation is an explicit command even if the active label is unchanged.
			// Unlike Fit, it restores the canonical direction of the entire engine.
			next.focused = null;
			next.focusToken++;
			next.camera = null;
			next.resetSignal++;
			break;
		case 'load':
			fields(action, ['type', 'value']);
			next.loadPercent = bounded(action.value, 10, 100, 'Reference load');
			break;
		case 'fit':
			fields(action, ['type']);
			// Frame the visible scene while retaining the current focused cylinder.
			if (next.focused) next.selected = next.focused;
			next.focused = null;
			next.resetSignal++;
			next.camera = null;
			break;
		case 'restore': {
			fields(action, ['type', 'value']);
			if (!record(action.value)) throw new TypeError('Invalid lab checkpoint.');
			fields(
				action.value,
				snapshotKeys,
				snapshotKeys.filter((key) => key !== 'driveAngle')
			);
			next = validateLabState(
				{
					...action.value,
					revision: base.revision,
					seekToken: base.seekToken + 1,
					resetSignal: base.resetSignal + 1,
					focusToken: base.focusToken + 1
				},
				components
			);
			break;
		}
		case 'reset':
			fields(action, ['type']);
			next = {
				...createLabState(),
				revision: base.revision,
				seekToken: base.seekToken + 1,
				resetSignal: base.resetSignal + 1,
				focusToken: base.focusToken + 1
			};
			break;
		default:
			throw new TypeError('Unsupported lab action.');
	}
	const validated = validateLabState(next, components);
	if (sameSnapshot(base, validated)) return sameSnapshot(state, base) ? state : base;
	return { ...validated, revision: base.revision + 1 };
}
