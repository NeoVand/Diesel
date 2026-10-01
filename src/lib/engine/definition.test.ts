import { describe, expect, it } from 'vitest';
import {
	engineDefinition,
	v12Components,
	v12PartMetadata,
	decorativeComponentIds
} from './definition';
import { applyLabAction, createLabState, snapshotLabState, validateLabState } from './lab-state';
import { engineLessons } from './lessons';
import { engineSpecs, knowledgePack } from './data';

describe('active V12 source definition', () => {
	it('retains all unique source occurrences and distinguishes presentation decorations', () => {
		expect(v12Components).toHaveLength(1253);
		expect(new Set(v12Components.map((part) => part.id)).size).toBe(1253);
		expect(v12Components.at(-1)?.id).toBe('v12-1253');
		expect(v12PartMetadata.size).toBe(1253);
		expect(decorativeComponentIds.size).toBe(24);
		for (const id of decorativeComponentIds) expect(v12PartMetadata.get(id)?.role).toBe('covers');
		expect(v12Components.every((part) => part.kind === 'source')).toBe(true);
	});
	it('derives displacement from audited dimensions without inheriting rated performance', () => {
		expect(engineSpecs.displacementL).toBeCloseTo(6.8094, 4);
		expect(engineDefinition.geometry).toMatchObject({
			boreMm: 85,
			strokeMm: 100,
			rodLengthMm: 125,
			bankAngleDegrees: 60
		});
		expect(engineSpecs).not.toHaveProperty('rpm');
		expect(engineSpecs).not.toHaveProperty('compressionRatio');
		expect(engineDefinition.capabilities.numericPerformance).toBe(false);
		expect(knowledgePack).not.toMatch(/Caterpillar|EM1898|51\.8 L/);
		expect(knowledgePack).toContain('It assumes 1800 rpm');
		expect(knowledgePack).toContain('These case outputs are not engine ratings');
	});
	it('uses valid actual source identities in every migrated lesson cue', () => {
		for (const lesson of engineLessons)
			for (const cue of lesson.steps) {
				let state = createLabState();
				for (const action of cue.actions) state = applyLabAction(state, action, v12Components);
				expect(state.assetId).toBe(engineDefinition.assetId);
				expect(JSON.stringify(cue)).not.toMatch(/mech:|Frame_|170 millimet|190 millimet|14\.7/);
			}
	});
});

describe('V12 state and view identity', () => {
	it('preserves orthographic atlas magnification in snapshots without accepting invalid zoom', () => {
		const camera = {
			position: [5, 8, 5] as [number, number, number],
			target: [0, 0, 0] as [number, number, number],
			zoom: 2.5
		};
		const state = createLabState({ display: 'layout', camera });
		const restored = applyLabAction(createLabState(), {
			type: 'restore',
			value: snapshotLabState(state)
		});
		expect(restored.camera).toEqual(camera);
		for (const zoom of [0, -1, Infinity, 201])
			expect(() => createLabState({ camera: { ...camera, zoom } })).toThrow();
	});

	it('pauses the shared clock whenever the assembly is separated or a part is lifted out', () => {
		const running = createLabState({ running: true, display: 'mechanism' });
		expect(applyLabAction(running, { type: 'explosion', value: 0.01 }).running).toBe(false);
		expect(applyLabAction(running, { type: 'remove', id: 'v12-0003', value: true }).running).toBe(
			false
		);
		expect(applyLabAction(running, { type: 'display', value: 'layout' }).running).toBe(false);
		expect(applyLabAction(running, { type: 'hide', id: 'v12-0003', value: true }).running).toBe(
			true
		);
	});

	it('retains named reveals and oblique section settings in detached snapshots', () => {
		let state = applyLabAction(createLabState(), { type: 'reveal', value: 'valvetrain' });
		state = applyLabAction(state, {
			type: 'section',
			value: { axis: 'x', offset: 0.25, flipped: true, visible: false, rotation: [25, -40] }
		});
		const snapshot = snapshotLabState(state);
		expect(snapshot).toMatchObject({ reveal: 'valvetrain', section: { rotation: [25, -40] } });
		snapshot.section.rotation![0] = 80;
		expect(state.section.rotation).toEqual([25, -40]);
		for (const rotation of [[181, 0], [0, Infinity], [0], [0, 0, 0]]) {
			expect(() =>
				applyLabAction(state, { type: 'section', value: { ...state.section, rotation } } as never)
			).toThrow();
		}
	});
	it('rejects incompatible asset versions and restores the source state exactly', () => {
		const original = createLabState({ selected: 'v12-1253', reveal: 'covers', phase: 137 });
		const snapshot = snapshotLabState(original);
		const changed = applyLabAction(original, { type: 'reveal', value: 'rotating' });
		const restored = applyLabAction(changed, { type: 'restore', value: snapshot });
		expect(restored).toMatchObject({ selected: 'v12-1253', reveal: 'covers', phase: 137 });
		expect(() => validateLabState({ ...original, assetId: 'legacy-cat' })).toThrow();
		expect(() =>
			applyLabAction(changed, { type: 'restore', value: { ...snapshot, assetVersion: 'wrong' } })
		).toThrow();
	});
});
