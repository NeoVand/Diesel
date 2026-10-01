import { describe, expect, it } from 'vitest';
import manifest from '../../../static/models/v12-review.manifest.json';
import attachments from './v12-motion-attachments.json';
import timing from './v12-timing-datums.json';
import valves from './v12-valvetrain-datums.json';
import mounts from './v12-timing-mounts.json';
import {
	V12_MOTION_BY_COMPONENT,
	V12_MOTION_INVENTORY,
	V12_MOTION_INVENTORY_SUMMARY,
	buildV12MotionInventory
} from './v12-motion-inventory';

describe('complete purchased-body motion inventory', () => {
	it('accounts for all1229 mechanical bodies exactly once and excludes only24 source lettering bodies', () => {
		expect(manifest.parts).toHaveLength(1253);
		expect(V12_MOTION_INVENTORY).toHaveLength(1229);
		expect(V12_MOTION_BY_COMPONENT.size).toBe(1229);
		const omitted = manifest.parts.filter((part) => !V12_MOTION_BY_COMPONENT.has(part.id));
		expect(omitted.map((part) => part.id)).toEqual(
			Array.from({ length: 24 }, (_, i) => `v12-${String(i + 261).padStart(4, '0')}`)
		);
		for (const part of V12_MOTION_INVENTORY) {
			expect(part.sourcePath).toBe(
				manifest.parts.find((source) => source.id === part.componentId)!.sourcePath
			);
			expect(part.evidence.length).toBeGreaterThan(20);
		}
		expect(V12_MOTION_INVENTORY_SUMMARY).toMatchObject({
			rigid: 466,
			deforming: 336,
			fixed: 427,
			unresolved: []
		});
	});

	it('maps all source coil fragments to48 deforming springs, without labeling them336 rigid springs', () => {
		const coils = V12_MOTION_INVENTORY.filter((part) => part.motion === 'deforming');
		expect(coils).toHaveLength(336);
		expect(new Set(coils.map((part) => part.ownerId)).size).toBe(48);
		for (const valve of valves.valves) {
			expect(
				coils
					.filter((coil) => coil.ownerId === `spring:${valve.valveId}`)
					.map((coil) => coil.componentId)
					.sort()
			).toEqual(valve.spring.parts.map((part) => part.id).sort());
			expect(valve.spring.parts).toHaveLength(7);
			for (const id of [valve.valveId, valve.tappetId]) {
				expect(V12_MOTION_BY_COMPONENT.get(id)).toMatchObject({
					motion: 'rigid',
					rig: 'valvetrain',
					ownerId: `valve:${valve.valveId}`
				});
			}
		}
	});

	it('assigns covers to native cam axes using bolt circles, retaining the measured0659 rest correction', () => {
		for (const cover of attachments.camCovers) {
			const binding = V12_MOTION_BY_COMPONENT.get(cover.componentId)!;
			const shaft = timing.shafts.find((shaft) => shaft.id === cover.ownerId)!;
			expect(binding.ownerId).toBe(shaft.id);
			expect(binding.motion).toBe('rigid');
			const corrected = cover.boltCircleCenterMm.map(
				(value, i) => value + cover.nativeCorrectionMm[i]
			);
			expect(
				Math.hypot(corrected[0] - shaft.pivotMm[0], corrected[1] - shaft.pivotMm[1])
			).toBeLessThan(1e-6);
			expect(cover.validation.outerShellToBoltCircleEccentricityMm).toBeGreaterThan(0.3);
		}
		expect(
			attachments.camCovers
				.filter((cover) => cover.nativeCorrectionMm.some((v) => v !== 0))
				.map((cover) => cover.componentId)
		).toEqual(['v12-0659']);
	});

	it('resolves both unnamed pipes through actual compressor flange interfaces and keeps all244 mount fasteners fixed', () => {
		for (const collector of attachments.chargeAirCollectors) {
			expect(V12_MOTION_BY_COMPONENT.get(collector.componentId)).toMatchObject({
				motion: 'fixed',
				memberRole: collector.derivedLabel
			});
			expect(collector.interfaces).toHaveLength(2);
			for (const port of collector.interfaces)
				expect(port.flangeAlignmentResidualMm).toBeLessThan(2e-5);
		}
		const fasteners = V12_MOTION_INVENTORY.filter((part) => part.sourceRole === 'fasteners');
		expect(fasteners).toHaveLength(244);
		expect(fasteners.every((part) => part.motion === 'fixed' && part.ownerId === null)).toBe(true);
		expect(V12_MOTION_INVENTORY.filter((part) => part.rig === 'turbo')).toHaveLength(8);
	});

	it('reports unrecognized moving source bodies and rejects duplicates instead of hiding them', () => {
		const future = { id: 'v12-9999', role: 'piston', sourcePath: 'future/piston' };
		expect(buildV12MotionInventory([future])[0]).toMatchObject({
			componentId: future.id,
			motion: 'unresolved',
			confidence: 'unresolved',
			ownerId: null
		});
		expect(() => buildV12MotionInventory([future, future])).toThrow('Duplicate source body');
	});

	it('declares native clearance repairs and guide-screw relocations without changing motion ownership', () => {
		const pistonIds = Array.from(
			{ length: 12 },
			(_, index) => `v12-${String(index + 3).padStart(4, '0')}`
		);
		for (const id of [...pistonIds, 'v12-0665', 'v12-0666', 'v12-0715', 'v12-0317']) {
			const binding = V12_MOTION_BY_COMPONENT.get(id)!;
			expect(binding.geometry).toBe('source-with-derived-correction');
			expect(binding.evidence).toContain('docs/V12_');
			expect(binding.motion).toBe(pistonIds.includes(id) ? 'rigid' : 'fixed');
		}
		const screwIds = mounts.guides.flatMap((guide) =>
			guide.mounts.map((mount) => mount.fastenerId)
		);
		expect(new Set(screwIds).size).toBe(22);
		for (const guide of mounts.guides) {
			for (const mount of guide.mounts) {
				expect(V12_MOTION_BY_COMPONENT.get(mount.fastenerId)).toMatchObject({
					motion: 'fixed',
					geometry: 'source-with-derived-correction',
					nativeCorrectionMm: guide.nativeCorrectionMm
				});
			}
		}
	});
});
