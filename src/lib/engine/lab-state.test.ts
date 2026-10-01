import { describe, expect, it } from 'vitest';
import {
	applyLabAction,
	createLabState,
	getTeachingComponent,
	initialLabState,
	playbackAvailability,
	snapshotLabState,
	validateLabState,
	type LabAction,
	type LabCamera
} from './lab-state';

const camera: LabCamera = { position: [8.25, 4.5, -3], target: [0.2, 1.4, -0.1] };

describe('shared engine-lab controller', () => {
	it('reissues a named perspective view while distinguishing ordinary fit intent', () => {
		const start = createLabState({ view: 'perspective', focused: 'v12-0003', camera });
		const view = applyLabAction(start, { type: 'view', value: 'perspective' });
		expect(view.focused).toBeNull();
		expect(view.camera).toBeNull();
		expect(view.focusToken).toBe(start.focusToken + 1);
		expect(view.resetSignal).toBe(start.resetSignal + 1);
		const fitted = applyLabAction(view, { type: 'fit' });
		expect(fitted.focusToken).toBe(view.focusToken);
		expect(fitted.resetSignal).toBe(view.resetSignal + 1);
	});
	it('retains combustion overlay intent through snapshots without starting or seeking playback', () => {
		const start = createLabState({ phase: 310 });
		const shown = applyLabAction(start, { type: 'flow', flow: 'combustion', value: true });
		expect(shown.flows).toEqual(['combustion']);
		expect(shown.running).toBe(false);
		expect(shown.phase).toBe(310);
		expect(snapshotLabState(shown).flows).toEqual(['combustion']);
		expect(applyLabAction(shown, { type: 'display', value: 'layout' }).flows).toEqual([]);
	});
	it('fits the complete visible cutaway without losing its focused cylinder', () => {
		const state = createLabState({
			display: 'cylinder',
			focused: 'mech:piston:02',
			selected: null,
			phase: 360,
			camera
		});
		const fitted = applyLabAction(state, { type: 'fit' });
		expect(fitted.focused).toBeNull();
		expect(fitted.selected).toBe('mech:piston:02');
		expect(fitted.phase).toBe(360);
		expect(fitted.camera).toBeNull();
		expect(fitted.resetSignal).toBe(state.resetSignal + 1);
	});
	it('starts in a clean assembly and gives each visitor detached state', () => {
		const first = createLabState();
		const second = createLabState();
		first.flows.push('air');
		first.hidden.push('Frame_Object_001');
		first.section.offset = 0.2;
		expect(second.flows).toEqual([]);
		expect(second.hidden).toEqual([]);
		expect(second.section).toEqual({ axis: 'x', offset: 0.5, flipped: false, visible: true });
		expect(initialLabState.section.offset).toBe(0.5);
		expect(second.internals).toBe(true);
		expect(initialLabState.flows).toEqual([]);
		expect(second.mode).toBe('inspect');
		expect(second.display).toBe('assembly');
		expect(second.running).toBe(false);
		expect(second.playback).toBe(0.02);
	});

	it('changes discrete intent immutably and does not advance revision for a no-op', () => {
		const start = createLabState();
		const operated = applyLabAction(start, { type: 'display', value: 'section' });
		expect(operated.revision).toBe(1);
		expect(operated.display).toBe('section');
		expect(start.display).toBe('assembly');
		const unchanged = applyLabAction(operated, { type: 'display', value: 'section' });
		expect(unchanged).toBe(operated);
		expect(unchanged.revision).toBe(1);
	});

	it('keeps whole-engine plane controls and internal visibility independent from display and detaches nested values', () => {
		const start = createLabState();
		const plane = { axis: 'z' as const, offset: 0.75, flipped: true, visible: false };
		let current = applyLabAction(start, { type: 'section', value: plane });
		expect(current.display).toBe('assembly');
		expect(current.section).toEqual(plane);
		expect(current.section).not.toBe(plane);
		expect(current.revision).toBe(1);
		plane.offset = 0.1;
		expect(current.section.offset).toBe(0.75);
		current = applyLabAction(current, { type: 'display', value: 'section' });
		current = applyLabAction(current, { type: 'internals', value: false });
		expect(current.display).toBe('section');
		expect(current.section.visible).toBe(false);
		expect(current.internals).toBe(false);
		expect(current.revision).toBe(3);
		expect(applyLabAction(current, { type: 'internals', value: false })).toBe(current);
		expect(start.section.offset).toBe(0.5);
	});

	it.each(['assembly', 'section', 'layout'] as const)(
		'reveals exact selected/focused teaching internals in %s without changing the requested display or visibility lists',
		(display) => {
			const start = createLabState({ display, internals: false, hidden: ['mech:head:02'] });
			const selected = applyLabAction(start, { type: 'select', id: 'mech:piston:02' });
			expect(selected.internals).toBe(true);
			expect(selected.selected).toBe('mech:piston:02');
			expect(selected.hidden).toEqual(start.hidden);
			expect(selected.display).toBe(display);
			expect(selected.revision).toBe(1);
			const hiddenAgain = applyLabAction(selected, { type: 'internals', value: false });
			expect(hiddenAgain.internals).toBe(false);
			expect(hiddenAgain.selected).toBe('mech:piston:02');
			const focused = applyLabAction(hiddenAgain, { type: 'focus', id: 'mech:rod:02' });
			expect(focused.internals).toBe(true);
			expect(focused.focused).toBe('mech:rod:02');
			expect(focused.selected).toBe('mech:piston:02');
			expect(focused.display).toBe(display);
			expect(applyLabAction(start, { type: 'select', id: 'heads' }).internals).toBe(false);
			expect(start.internals).toBe(false);
		}
	);

	it('validates every plane axis and offset endpoints but rejects malformed or partial plane settings', () => {
		for (const axis of ['x', 'y', 'z'] as const)
			for (const offset of [0, 1]) {
				const plane = { axis, offset, flipped: false, visible: true };
				expect(applyLabAction(createLabState(), { type: 'section', value: plane }).section).toEqual(
					plane
				);
			}
		for (const invalid of [
			{ axis: 'w', offset: 0.5, flipped: false, visible: true },
			{ axis: 'x', offset: -0.01, flipped: false, visible: true },
			{ axis: 'x', offset: 1.01, flipped: false, visible: true },
			{ axis: 'x', offset: NaN, flipped: false, visible: true },
			{ axis: 'x', offset: Infinity, flipped: false, visible: true },
			{ axis: 'x', offset: 0.5, flipped: 'yes', visible: true },
			{ axis: 'x', offset: 0.5, flipped: false, visible: 1 },
			{ axis: 'x', offset: 0.5, flipped: false },
			{ axis: 'x', offset: 0.5, flipped: false, visible: true, extra: 1 }
		]) {
			expect(() =>
				applyLabAction(createLabState(), { type: 'section', value: invalid } as LabAction)
			).toThrow();
			expect(() => validateLabState({ ...createLabState(), section: invalid })).toThrow();
		}
		expect(() =>
			applyLabAction(createLabState(), { type: 'internals', value: 'yes' } as unknown as LabAction)
		).toThrow();
	});

	it('enters the static parts layout without losing phase, normalized explosion or component inspection intent', () => {
		const start = createLabState({
			mode: 'operate',
			display: 'mechanism',
			running: true,
			flows: ['fuel', 'oil'],
			phase: 359.5,
			explosion: 1,
			loadPercent: 63,
			selected: 'mech:piston:02',
			focused: 'mech:piston:02',
			hidden: ['mech:liner:02'],
			removed: ['mech:head:02']
		});
		const layout = applyLabAction(start, { type: 'display', value: 'layout' });
		expect(layout).toMatchObject({
			display: 'layout',
			running: false,
			flows: [],
			phase: 359.5,
			explosion: 1,
			loadPercent: 63,
			mode: 'operate',
			selected: start.selected,
			focused: start.focused,
			hidden: start.hidden,
			removed: start.removed,
			revision: 1
		});
		expect(start.running).toBe(false);
		expect(start.flows).toEqual(['fuel', 'oil']);
		for (const action of [
			{ type: 'flows', value: ['air', 'exhaust'] },
			{ type: 'flow', flow: 'fuel', value: true }
		] as LabAction[]) {
			expect(applyLabAction(layout, action)).toBe(layout);
		}
		expect(() => applyLabAction(layout, { type: 'running', value: true })).toThrow(
			'Return to a 3D inspection view'
		);
		const assembly = applyLabAction(layout, { type: 'display', value: 'assembly' });
		expect(assembly.running).toBe(false);
		expect(assembly.flows).toEqual([]);
		expect(assembly.phase).toBe(359.5);
		expect(assembly.explosion).toBe(1);
	});

	it('normalizes layout snapshots safely, restores retained inspection fields and still rejects unbounded explosion', () => {
		const state = createLabState({ display: 'layout', phase: 300, explosion: 0.8, camera });
		const checkpoint = snapshotLabState(state, { phase: 355 });
		const serialized = JSON.parse(JSON.stringify(checkpoint));
		const restored = applyLabAction(createLabState(), { type: 'restore', value: serialized });
		expect(snapshotLabState(restored)).toEqual(checkpoint);
		expect(restored.display).toBe('layout');
		expect(restored.phase).toBe(355);
		expect(restored.explosion).toBe(0.8);
		const stale = { ...state, running: true, flows: ['air'] };
		expect(validateLabState(stale)).toMatchObject({ running: false, flows: [] });
		expect(snapshotLabState(stale as typeof state)).toMatchObject({ running: false, flows: [] });
		expect(applyLabAction(stale as typeof state, { type: 'running', value: false })).toMatchObject({
			running: false,
			flows: []
		});
		expect(stale.running).toBe(true);
		for (const explosion of [-0.01, 1.01, 3, NaN, Infinity]) {
			expect(() => validateLabState({ ...state, explosion })).toThrow();
			expect(() => applyLabAction(state, { type: 'explosion', value: explosion })).toThrow();
		}
		expect(() => validateLabState({ ...state, running: 'true' })).toThrow();
		expect(() => validateLabState({ ...state, flows: ['sparks'] })).toThrow();
	});

	it('uses explicit seek/focus/reset tokens even when the requested value repeats', () => {
		let state = createLabState();
		state = applyLabAction(state, { type: 'seek', value: 360 });
		state = applyLabAction(state, { type: 'seek', value: 360 });
		expect(state.phase).toBe(360);
		expect(state.seekToken).toBe(2);
		state = applyLabAction(state, { type: 'focus', id: 'mech:piston:01' });
		expect(state.focused).toBe('mech:piston:01');
		expect(state.focusToken).toBe(1);
		state = applyLabAction(state, { type: 'view', value: 'perspective' });
		expect(state.resetSignal).toBe(1);
		expect(state.revision).toBe(4);
	});

	it('toggles unique flows without disturbing reference speed or load', () => {
		let state = createLabState();
		state = applyLabAction(state, { type: 'flow', flow: 'air', value: true });
		state = applyLabAction(state, { type: 'flow', flow: 'air', value: true });
		state = applyLabAction(state, { type: 'flow', flow: 'fuel', value: true });
		expect(state.flows).toEqual(['air', 'fuel']);
		expect(state.revision).toBe(2);
		state = applyLabAction(state, { type: 'flow', flow: 'air', value: false });
		expect(state.flows).toEqual(['fuel']);
		expect(state.loadPercent).toBe(75);
	});

	it('supports exact native IDs, family teaching selectors, visibility and separate removal', () => {
		const registry = [{ id: 'Frame_Object_001' }];
		let state = createLabState();
		state = applyLabAction(state, { type: 'select', id: 'Frame_Object_001' }, registry);
		state = applyLabAction(state, { type: 'isolate', value: true }, registry);
		expect(state.isolated).toBe(true);
		state = applyLabAction(
			state,
			{ type: 'remove', id: 'Frame_Object_001', value: true },
			registry
		);
		expect(state.removed).toEqual(['Frame_Object_001']);
		expect(state.hidden).toEqual([]);
		state = applyLabAction(state, { type: 'hide', id: 'Frame_Object_001', value: true }, registry);
		expect(state.selected).toBeNull();
		expect(state.isolated).toBe(false);
		expect(state.hidden).toEqual(['Frame_Object_001']);
		expect(() =>
			applyLabAction(state, { type: 'select', id: 'Frame_Object_999' }, registry)
		).toThrow(RangeError);
		expect(applyLabAction(state, { type: 'select', id: 'heads' }, registry).selected).toBe('heads');
		expect(getTeachingComponent('mech:piston:12')?.kind).toBe('educational');
		expect(getTeachingComponent('mech:piston:13')).toBeUndefined();
		expect(getTeachingComponent('mech:camshaft:A')?.name).toContain('Bank A');
	});

	it('cannot isolate a hidden teaching instance through its family selector', () => {
		let state = createLabState();
		state = applyLabAction(state, { type: 'select', id: 'mech:piston:01' });
		state = applyLabAction(state, { type: 'focus', id: 'mech:piston:01' });
		state = applyLabAction(state, { type: 'isolate', value: true });
		state = applyLabAction(state, { type: 'hide', id: 'mech:piston', value: true });
		expect(state.selected).toBeNull();
		expect(state.focused).toBeNull();
		expect(state.isolated).toBe(false);
		expect(() => applyLabAction(state, { type: 'isolate', value: true })).toThrow(RangeError);
	});

	it('restores the actual sampled phase, exact camera and scene without rewinding revision', () => {
		const start = createLabState({
			display: 'section',
			section: { axis: 'y', offset: 0.35, flipped: true, visible: false },
			internals: false,
			selected: 'mech:piston:01',
			flows: ['air'],
			explosion: 0.3
		});
		const checkpoint = snapshotLabState(start, { phase: 358.75, camera });
		let current = applyLabAction(start, { type: 'explosion', value: 0 });
		current = applyLabAction(current, { type: 'running', value: true });
		current = applyLabAction(current, { type: 'flows', value: ['fuel', 'exhaust'] });
		current = applyLabAction(current, { type: 'seek', value: 590 });
		current = applyLabAction(current, { type: 'hide', id: 'mech:piston:01', value: true });
		const restored = applyLabAction(current, { type: 'restore', value: checkpoint });
		expect(snapshotLabState(restored)).toEqual(checkpoint);
		expect(restored.phase).toBe(358.75);
		expect(restored.camera).toEqual(camera);
		expect(restored.camera).not.toBe(camera);
		expect(restored.section).toEqual(start.section);
		expect(restored.section).not.toBe(checkpoint.section);
		expect(restored.internals).toBe(false);
		checkpoint.section.offset = 0.9;
		expect(restored.section.offset).toBe(0.35);
		expect(restored.revision).toBe(current.revision + 1);
		expect(restored.seekToken).toBe(current.seekToken + 1);
		expect(restored.resetSignal).toBe(current.resetSignal + 1);
		if (checkpoint.camera) checkpoint.camera.position[0] = 200;
		expect(restored.camera?.position[0]).toBe(8.25);
	});

	it('preserves mechanical revolutions in checkpoints and explicitly rebases a seek', () => {
		const state = createLabState();
		const checkpoint = snapshotLabState(state, { phase: 12.5, driveAngle: 2172.5 });
		const restored = applyLabAction(state, { type: 'restore', value: checkpoint });
		expect(restored.driveAngle).toBe(2172.5);
		expect(snapshotLabState(restored)).toEqual(checkpoint);
		expect(applyLabAction(restored, { type: 'seek', value: 60 }).driveAngle).toBeNull();
		expect(snapshotLabState(restored, { phase: 30 }).driveAngle).toBeNull();
		expect(() => createLabState({ phase: 30, driveAngle: 720 })).toThrow('match');
	});

	it.each(['assembly', 'section', 'cylinder', 'mechanism', 'xray'] as const)(
		'runs and pauses in %s without changing inspection or camera intent',
		(display) => {
			const state = createLabState({
				display,
				reveal: 'complete',
				selected: 'v12-0014',
				focused: 'v12-0014',
				hidden: ['v12-0786'],
				phase: 123,
				camera
			});
			const running = applyLabAction(state, { type: 'running', value: true });
			expect(running).toEqual({ ...state, running: true, revision: state.revision + 1 });
			expect(applyLabAction(running, { type: 'running', value: false })).toEqual({
				...state,
				revision: state.revision + 2
			});
		}
	);

	it('preserves live playback across explicit 3D inspection changes, and pauses only for separation', () => {
		let state = createLabState({ running: true, phase: 317, camera });
		for (const display of ['mechanism', 'xray', 'section', 'assembly'] as const) {
			state = applyLabAction(state, { type: 'display', value: display });
			expect(state).toMatchObject({ running: true, phase: 317, camera, reveal: 'complete' });
		}
		for (const action of [
			{ type: 'explosion', value: 0.001 },
			{ type: 'remove', id: 'v12-0014', value: true },
			{ type: 'display', value: 'layout' }
		] as const) {
			const separated = applyLabAction(state, action);
			expect(separated.running).toBe(false);
			expect(separated.phase).toBe(317);
			expect(playbackAvailability(separated).available).toBe(false);
			expect(() => applyLabAction(separated, { type: 'running', value: true })).toThrow(
				playbackAvailability(separated).reason!
			);
		}
		expect(playbackAvailability(state)).toEqual({ available: true, reason: null });
	});

	it('resets scene state with fresh camera/seek signals while retaining revision history', () => {
		const current = createLabState({
			mode: 'operate',
			display: 'mechanism',
			section: { axis: 'z', offset: 0.1, flipped: true, visible: false },
			internals: false,
			running: true,
			flows: ['oil'],
			hidden: ['mech:liner'],
			removed: ['mech:piston:02'],
			camera
		});
		const reset = applyLabAction(current, { type: 'reset' });
		expect(snapshotLabState(reset)).toEqual(snapshotLabState(createLabState()));
		expect(reset.revision).toBe(1);
		expect(reset.seekToken).toBe(1);
		expect(reset.resetSignal).toBe(1);
	});

	it('rejects unsupported values, unknown fields and malformed checkpoints without mutation', () => {
		const state = createLabState();
		const before = JSON.stringify(state);
		const invalid: unknown[] = [
			{ type: 'load', value: 9 },
			{ type: 'load', value: Infinity },
			{ type: 'seek', value: 721 },
			{ type: 'seek', value: NaN },
			{ type: 'explosion', value: -0.1 },
			{ type: 'playback', value: 0 },
			{ type: 'display', value: 'fake-cutaway' },
			{ type: 'running', value: 'yes' },
			{ type: 'flows', value: ['air', 'air'] },
			{ type: 'flow', flow: 'sparks', value: true },
			{ type: 'select', id: '../../secret' },
			{ type: 'seek', value: 30, command: 'extra' },
			{ type: 'restore', value: { phase: 0 } },
			{ type: 'launch' }
		];
		for (const action of invalid)
			expect(() => applyLabAction(state, action as LabAction)).toThrow();
		expect(JSON.stringify(state)).toBe(before);
		expect(() => validateLabState({ ...state, revision: 0.2 })).toThrow();
		expect(() => validateLabState({ ...state, injected: true })).toThrow();
		expect(() =>
			validateLabState({ ...state, camera: { position: [0, 0, 0], target: [0, 0, 0] } })
		).toThrow();
	});
});
