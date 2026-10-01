import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import source from '../engine/v12-timing-datums.json';
import attachments from '../engine/v12-motion-attachments.json';
import mounts from '../engine/v12-timing-mounts.json';
import { V12Timing, V12_TIMING_CORRECTIONS } from './v12-timing';
import { V12_MOTION_DATUMS, v12NativeToDisplay } from '../engine/v12-kinematics';
const scale = V12_MOTION_DATUMS.displayScale / 1000;

describe('corrected full timing drive', () => {
	it('registers all 22 rigid guide screws to corrected guide and housing bore axes at every phase', () => {
		const rig = new V12Timing();
		const ids = mounts.guides.flatMap((guide) => guide.mounts.map((mount) => mount.fastenerId));
		expect(new Set(ids).size).toBe(22);
		for (const phase of [0, 91.25, 720, 2232, -18.7]) {
			const matrices = rig.matricesForPhase(phase);
			for (const guide of mounts.guides) {
				const guideMatrix = matrices.get(guide.guideId)!;
				for (const mount of guide.mounts) {
					const matrix = matrices.get(mount.fastenerId)!;
					expect(matrix.equals(guideMatrix)).toBe(true);
					expect(matrix.determinant()).toBe(1);
					const derivedAxis = new THREE.Vector3(...v12NativeToDisplay(mount.nativeDerivedAxisMm));
					const sourceAxis = new THREE.Vector3(...v12NativeToDisplay(mount.nativeAxisMm));
					expect(sourceAxis.applyMatrix4(matrix).distanceTo(derivedAxis) / scale).toBeLessThan(
						1e-9
					);
					expect(mount.nativeAxisToSourceMeshCenterResidualMm).toBeLessThan(0.001);
				}
			}
		}
		expect(rig.getDiagnostics().movingSourceBodies).toBe(336);
		expect(rig.getDiagnostics().correctedStationaryGuides).toBe(6);
		expect(rig.getDiagnostics().correctedStationaryFasteners).toBe(22);
	});
	it('closes all320 rigid source links through full circulation with engaged tooth centers', () => {
		const rig = new V12Timing();
		let gap = 0,
			contact = 0,
			iterations = 0;
		const phases = [
			...Array.from({ length: 1441 }, (_, i) => i * 1.55),
			-0.00001,
			719.99999,
			720,
			720.00001,
			864,
			2232
		];
		for (const phase of phases) {
			rig.matricesForPhase(phase);
			const d = rig.getDiagnostics();
			gap = Math.max(gap, d.maximumHingeGapMm);
			contact = Math.max(contact, d.maximumEngagedToothCenterErrorMm);
			iterations = Math.max(iterations, d.maximumProjectionIterations);
		}
		expect(gap).toBeLessThan(1e-7);
		expect(contact).toBeLessThan(1e-9);
		expect(iterations).toBeLessThan(8);
	});
	it('transforms actual authored pin endpoints onto the same corrected hinge without scaling', () => {
		const rig = new V12Timing();
		for (const phase of [0, 1.31, 12, 36.73, 361, 719.8, 720.1, 863.999, 2232.333, -14]) {
			const matrices = rig.matricesForPhase(phase);
			for (const loop of source.chainLoops) {
				const pins = rig.getPinPositionsMm(loop.id)!;
				for (let i = 0; i < loop.links.length; i++) {
					const link = loop.links[i],
						next = loop.links[(i + 1) % loop.links.length];
					const matrix = matrices.get(link.componentId)!;
					const a = new THREE.Vector3(...v12NativeToDisplay(link.pinCentersMm[1])).applyMatrix4(
						matrix
					);
					const b = new THREE.Vector3(...v12NativeToDisplay(next.pinCentersMm[0])).applyMatrix4(
						matrices.get(next.componentId)!
					);
					expect(a.distanceTo(b) / scale).toBeLessThan(1e-7);
					const nativePin = new THREE.Vector3(
						...v12NativeToDisplay([pins[2 * i], pins[2 * i + 1], link.centerMm[2]])
					);
					const transformed = new THREE.Vector3(
						...v12NativeToDisplay(link.pinCentersMm[0])
					).applyMatrix4(matrix);
					expect(nativePin.distanceTo(transformed) / scale).toBeLessThan(1e-7);
					expect(matrix.determinant()).toBeCloseTo(1, 11);
				}
			}
		}
	});
	it('keeps source shaft axes fixed, cams at halfspeed, and link identities continuous at cyclewrap', () => {
		const rig = new V12Timing();
		for (const phase of [0, 36.333, 360, 720]) {
			const matrices = rig.matricesForPhase(phase);
			for (const shaft of source.shafts) {
				const matrix = matrices.get(shaft.componentIds[0])!;
				const pivot = new THREE.Vector3(...v12NativeToDisplay(shaft.pivotMm));
				expect(pivot.clone().applyMatrix4(matrix).distanceTo(pivot)).toBeLessThan(1e-12);
				const radial = new THREE.Vector3(0, 1, 0).transformDirection(matrix);
				expect(
					radial.distanceTo(
						new THREE.Vector3(0, 1, 0).applyAxisAngle(
							new THREE.Vector3(1, 0, 0),
							(-phase * shaft.crankRatio * Math.PI) / 180
						)
					)
				).toBeLessThan(1e-12);
			}
		}
		for (const loop of source.chainLoops) {
			const id = loop.links[0].componentId,
				p = new THREE.Vector3(...v12NativeToDisplay(loop.links[0].pinCentersMm[0]));
			const before = p.clone().applyMatrix4(rig.matricesForPhase(719.99999).get(id)!);
			const after = p.clone().applyMatrix4(rig.matricesForPhase(720.00001).get(id)!);
			expect(before.distanceTo(after) / scale).toBeLessThan(0.0001);
			const rest = rig.matricesForPhase(0).get(id)!.clone();
			const period = (360 * loop.links.length) / loop.driverTeeth;
			expect(rig.matricesForPhase(period).get(id)!.equals(rest)).toBe(true);
		}
	});
	it('is deterministic under seek reversal and retains corrected rest instead of snapping to broken source', () => {
		const rig = new V12Timing();
		const first = new Map([...rig.matricesForPhase(47.23)].map(([id, m]) => [id, m.clone()]));
		rig.matricesForPhase(3200);
		rig.matricesForPhase(-18);
		rig.matricesForPhase(0);
		for (const [id, matrix] of rig.matricesForPhase(47.23))
			expect(matrix.equals(first.get(id)!)).toBe(true);
		expect(
			rig
				.matricesForPhase(0)
				.get(source.chainLoops[0].links[0].componentId)!
				.equals(new THREE.Matrix4())
		).toBe(false);
		expect(() => rig.matricesForPhase(Infinity)).toThrow();
	});
	it('corrects source tooth rings to compatible pitch while keeping wheel hubs fixed and source immutable', () => {
		const rig = new V12Timing();
		for (const wheel of V12_TIMING_CORRECTIONS.wheelCorrections) {
			const pivot = new THREE.Vector3(...v12NativeToDisplay(wheel.pivotMm));
			const points = new Float32Array([
				...pivot.toArray(),
				pivot.x,
				pivot.y + wheel.sourcePitchRadiusMm * scale,
				pivot.z
			]);
			const sourceGeometry = new THREE.BufferGeometry().setAttribute(
				'position',
				new THREE.BufferAttribute(points, 3)
			);
			const before = Array.from(points),
				result = rig.createGeometryReplacement(wheel.id, sourceGeometry)!;
			const p = result.getAttribute('position');
			expect(Array.from(points)).toEqual(before);
			expect(
				new THREE.Vector3(p.getX(0), p.getY(0), p.getZ(0)).distanceTo(
					new THREE.Vector3(...before.slice(0, 3))
				)
			).toBeLessThan(1e-12);
			expect(Math.hypot(p.getY(1) - pivot.y, p.getZ(1) - pivot.z) / scale).toBeCloseTo(
				wheel.derivedPitchRadiusMm,
				4
			);
			expect(Math.atan2(p.getZ(1) - pivot.z, p.getY(1) - pivot.y)).toBeCloseTo(
				wheel.toothRingPhaseCorrectionRad,
				5
			);
			result.dispose();
			sourceGeometry.dispose();
		}
		expect(rig.createGeometryReplacement('unknown', new THREE.BufferGeometry())).toBe(null);
	});
	it('keeps conservative guide clearance across every fractional chain handoff without hiding or scaling guides', () => {
		const rig = new V12Timing();
		let minimum = Infinity;
		for (let i = 0; i <= 720; i++) {
			const matrices = rig.matricesForPhase(i / 20);
			for (const guide of rig.getDiagnostics().guideClearances)
				minimum = Math.min(minimum, guide.minimumEnvelopeClearanceMm);
			for (const guide of V12_TIMING_CORRECTIONS.guideCorrections)
				expect(matrices.get(guide.id)!.determinant()).toBe(1);
		}
		expect(minimum).toBeGreaterThan(0.1);
	});
	it('indexes the four cams independently while preserving closed-chain wheel and cover registration', () => {
		const offsets = { 'v12-0288': 29, 'v12-0287': 81, 'v12-0285': 423, 'v12-0286': 396 };
		const rig = new V12Timing({ camCrankOffsetsDeg: offsets }),
			baseline = new V12Timing();
		for (const phase of [0, 90, 360, 720]) {
			const actual = rig.matricesForPhase(phase),
				expected = baseline.matricesForPhase(phase);
			for (const wheel of source.wheels)
				expect(actual.get(wheel.id)!.equals(expected.get(wheel.id)!)).toBe(true);
			for (const cover of attachments.camCovers)
				expect(actual.get(cover.componentId)!.equals(expected.get(cover.componentId)!)).toBe(true);
			for (const [id, offset] of Object.entries(offsets)) {
				const direction = new THREE.Vector3(0, 1, 0).transformDirection(actual.get(id)!);
				expect(
					direction.distanceTo(
						new THREE.Vector3(0, 1, 0).applyAxisAngle(
							new THREE.Vector3(1, 0, 0),
							(-(phase + offset) * Math.PI) / 360
						)
					)
				).toBeLessThan(1e-12);
			}
		}
	});
	it('keeps each planar chain simple and continuous across contact handoffs and lookup boundaries', () => {
		const rig = new V12Timing();
		const cross = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) =>
			(bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
		for (let phase = 0; phase <= 36; phase += 0.75) {
			rig.matricesForPhase(phase);
			for (const loop of source.chainLoops) {
				const p = rig.getPinPositionsMm(loop.id)!,
					n = loop.links.length;
				for (let i = 0; i < n; i++)
					for (let j = i + 2; j < n; j++) {
						if (i === 0 && j === n - 1) continue;
						const i1 = (i + 1) % n,
							j1 = (j + 1) % n;
						const a = cross(
							p[2 * i],
							p[2 * i + 1],
							p[2 * i1],
							p[2 * i1 + 1],
							p[2 * j],
							p[2 * j + 1]
						);
						const b = cross(
							p[2 * i],
							p[2 * i + 1],
							p[2 * i1],
							p[2 * i1 + 1],
							p[2 * j1],
							p[2 * j1 + 1]
						);
						if (a * b >= 0) continue;
						const c = cross(
							p[2 * j],
							p[2 * j + 1],
							p[2 * j1],
							p[2 * j1 + 1],
							p[2 * i],
							p[2 * i + 1]
						);
						const d = cross(
							p[2 * j],
							p[2 * j + 1],
							p[2 * j1],
							p[2 * j1 + 1],
							p[2 * i1],
							p[2 * i1 + 1]
						);
						expect(c * d).toBeGreaterThanOrEqual(0);
					}
			}
		}
		for (const loop of V12_TIMING_CORRECTIONS.loops) {
			const datum = source.chainLoops.find((v) => v.id === loop.id)!;
			const phasePerLink = 360 / datum.driverTeeth;
			const boundaries = [
				...loop.contacts.flatMap((c) => [c.start % 1, c.end % 1]),
				...Array.from({ length: 65 }, (_, i) => i / 64)
			];
			for (const fraction of boundaries) {
				rig.matricesForPhase(fraction * phasePerLink - 1e-5);
				const before = Float64Array.from(rig.getPinPositionsMm(loop.id)!);
				rig.matricesForPhase(fraction * phasePerLink + 1e-5);
				const after = rig.getPinPositionsMm(loop.id)!;
				for (let i = 0; i < before.length; i += 2)
					expect(Math.hypot(after[i] - before[i], after[i + 1] - before[i + 1])).toBeLessThan(
						0.001
					);
			}
		}
	});
});
