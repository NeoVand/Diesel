import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { V12Valvetrain, v12SpringRise } from './v12-valvetrain';
import { V12_VALVES, v12ValvePose } from '../engine/v12-valve-events';
import { v12NativeToDisplay, V12_MOTION_DATUMS } from '../engine/v12-kinematics';
const scale = V12_MOTION_DATUMS.displayScale / 1000;

describe('corrected valve rig geometry and ownership', () => {
	it('updates spring buffers only when their exact height changes, including seeks and rest blending', () => {
		const rig = new V12Valvetrain(),
			dummy = new THREE.BufferGeometry();
		const springs = V12_VALVES.flatMap((valve) =>
			valve.spring.parts.map((part) => ({
				valve,
				geometry: rig.prepareGeometry(part.id, dummy)!,
				height: v12ValvePose(valve, 0).springHeightMm
			}))
		);
		let avoided = 0,
			changed = 0;
		for (const [phase, blend] of [
			[1, 1],
			[100, 1],
			[101, 1],
			[300, 1],
			[300.5, 1],
			[719, 1],
			[720, 1],
			[721, 1],
			[-30, 1],
			[-29, 1],
			[400, 0.3],
			[400, 0],
			[560, 0]
		]) {
			const versions = springs.map(({ geometry }) => [
				(geometry.getAttribute('position') as THREE.BufferAttribute).version,
				(geometry.getAttribute('normal') as THREE.BufferAttribute).version
			]);
			rig.updateGeometry(phase, blend);
			springs.forEach((spring, index) => {
				const height = THREE.MathUtils.lerp(
					v12ValvePose(spring.valve, 0).springHeightMm,
					v12ValvePose(spring.valve, phase).springHeightMm,
					blend
				);
				const increment = height === spring.height ? 0 : 1;
				avoided += 1 - increment;
				changed += increment;
				expect((spring.geometry.getAttribute('position') as THREE.BufferAttribute).version).toBe(
					versions[index][0] + increment
				);
				expect((spring.geometry.getAttribute('normal') as THREE.BufferAttribute).version).toBe(
					versions[index][1] + increment
				);
				spring.height = height;
			});
		}
		expect(avoided).toBeGreaterThan(changed);
		// Arbitrary history and reverse seeks return exactly the same full geometry and normals.
		const fresh = new V12Valvetrain();
		for (const phase of [-35.25, 195.5, 1440.125]) {
			rig.updateGeometry(phase, 0.7);
			fresh.updateGeometry(phase, 0.7);
			for (const valve of [V12_VALVES[0], V12_VALVES[12], V12_VALVES[24], V12_VALVES[36]]) {
				for (const part of valve.spring.parts) {
					const actual = rig.prepareGeometry(part.id, dummy)!,
						expected = fresh.prepareGeometry(part.id, dummy)!;
					expect(actual.getAttribute('position').array).toEqual(
						expected.getAttribute('position').array
					);
					expect(actual.getAttribute('normal').array).toEqual(
						expected.getAttribute('normal').array
					);
					expect(actual.boundingBox).toEqual(expected.boundingBox);
					expect(actual.boundingSphere).toEqual(expected.boundingSphere);
				}
			}
		}
		fresh.dispose();
		dummy.dispose();
		rig.dispose();
	});
	it('keeps all96 body matrices rigid and respects pause/seek/cycle continuity', () => {
		const rig = new V12Valvetrain();
		const snapshot = (phase: number) =>
			[...rig.matricesForPhase(phase)].map(([id, m]) => [id, [...m.elements]]);
		const first = snapshot(145.5);
		expect(snapshot(145.5)).toEqual(first);
		snapshot(645);
		expect(snapshot(145.5)).toEqual(first);
		for (const m of rig.matricesForPhase(865.5).values())
			expect(m.determinant()).toBeCloseTo(1, 12);
		const later = snapshot(865.5);
		later.forEach((entry, i) => expect(entry).toEqual(first[i]));
		expect(rig.getDiagnostics().rigidBodies).toBe(96);
		rig.dispose();
	});
	it('deforms constant-wire springs with fixed ground ends and continuous segment seams', () => {
		const rig = new V12Valvetrain(),
			v = V12_VALVES[0],
			dummy = new THREE.BufferGeometry();
		const segments = v.spring.parts.map((p) => rig.prepareGeometry(p.id, dummy)!);
		rig.updateGeometry(0);
		const base = Array.from(
			(segments[0].getAttribute('position') as THREE.BufferAttribute).array.slice(0, 24)
		);
		for (const phase of [0, 150, 300, 500, 719.5]) {
			rig.updateGeometry(phase);
			const p0 = segments[0].getAttribute('position') as THREE.BufferAttribute;
			expect(Array.from(p0.array.slice(0, 24))).toEqual(base);
			for (let i = 0; i < 7; i++) {
				const p = segments[i].getAttribute('position');
				for (let j = 0; j <= 18; j++) {
					const a = new THREE.Vector3().fromBufferAttribute(p, j * 8),
						b = new THREE.Vector3().fromBufferAttribute(p, j * 8 + 4);
					expect(a.distanceTo(b) / scale).toBeCloseTo(3.2, 3);
				}
				if (i < 6) {
					const next = segments[i + 1].getAttribute('position');
					for (let k = 0; k < 8; k++)
						expect(
							new THREE.Vector3()
								.fromBufferAttribute(p, 18 * 8 + k)
								.distanceTo(new THREE.Vector3().fromBufferAttribute(next, k))
						).toBeLessThan(1e-6);
				}
			}
			const last = segments[6].getAttribute('position'),
				a = new THREE.Vector3().fromBufferAttribute(last, 18 * 8),
				b = new THREE.Vector3().fromBufferAttribute(last, 18 * 8 + 4),
				end = a.add(b).multiplyScalar(0.5);
			const height = v12ValvePose(v, phase).springHeightMm;
			const native = v.correctedPadCenterMm.map(
				(x, i) => x + v.axis[i] * (v.spring.baseFromPadMm + height - v.spring.wireRadiusMm)
			);
			const expected = new THREE.Vector3(...v12NativeToDisplay(native));
			expect(end.distanceTo(expected) / scale).toBeCloseTo(v.spring.coilRadiusMm, 3);
		}
		rig.updateGeometry(500, 0);
		expect(
			Array.from((segments[0].getAttribute('position') as THREE.BufferAttribute).array.slice(0, 24))
		).toEqual(base);
		dummy.dispose();
		rig.dispose();
	});
	it('has adequate same-azimuth coil separation at every valve maximum lift', () => {
		for (const v of V12_VALVES) {
			const rise = v.spring.minHeightMm - 2 * v.spring.wireRadiusMm;
			let gap = Infinity;
			for (let t = 0; t <= 1 - 1 / v.spring.turns; t += 0.001) {
				const separation =
					rise * (v12SpringRise(t + 1 / v.spring.turns).value - v12SpringRise(t).value);
				gap = Math.min(gap, separation - 2 * v.spring.wireRadiusMm);
			}
			expect(gap).toBeGreaterThan(0.5);
		}
	});
	it('retains source geometry and assigns derived retainers distinct identities', () => {
		const rig = new V12Valvetrain(),
			v = V12_VALVES[0],
			source = new THREE.BufferGeometry(),
			axis = v.axis,
			p = v.correctedPadCenterMm;
		const points = [
			v.sourceValveBottomFromPadMm,
			v.stemStretchStartFromPadMm,
			v.sourceValveTopFromPadMm
		].flatMap((a) => v12NativeToDisplay(p.map((x, i) => x + axis[i] * a)));
		source.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
		source.setIndex([0, 1, 2]);
		const before = [...source.getAttribute('position').array];
		const result = rig.prepareGeometry(v.valveId, source)!;
		expect([...source.getAttribute('position').array]).toEqual(before);
		expect(result).not.toBe(source);
		expect(rig.prepareGeometry(v.valveId, source)).toBe(result);
		const a = new THREE.Vector3().fromBufferAttribute(source.getAttribute('position'), 2),
			b = new THREE.Vector3().fromBufferAttribute(result.getAttribute('position'), 2);
		expect(a.distanceTo(b) / scale).toBeCloseTo(v.stemExtensionMm, 3);
		expect(rig.getAttachments()).toHaveLength(48);
		expect(new Set(rig.getAttachments().map((a) => a.id)).size).toBe(48);
		expect(rig.getAttachments().every((a) => a.id.startsWith('derived-retainer-'))).toBe(true);
		const sourceDispose = vi.spyOn(source, 'dispose'),
			replacementDispose = vi.spyOn(result, 'dispose');
		const attachmentDispose = rig.getAttachments().map((a) => vi.spyOn(a.geometry, 'dispose'));
		rig.dispose();
		rig.dispose();
		expect(sourceDispose).not.toHaveBeenCalled();
		expect(replacementDispose).toHaveBeenCalledTimes(1);
		attachmentDispose.forEach((spy) => expect(spy).toHaveBeenCalledTimes(1));
		source.dispose();
		expect(() => rig.updateGeometry(0)).toThrow();
	});
	it('loads all four refined native cams once and disposes their resources exactly once', async () => {
		const rig = new V12Valvetrain();
		const scene = new THREE.Group();
		const resources = ['v12-0285', 'v12-0286', 'v12-0287', 'v12-0288'].map((id) => {
			const geometry = new THREE.CylinderGeometry(0.1, 0.1, 1, 16),
				material = new THREE.MeshStandardMaterial();
			const mesh = new THREE.Mesh(geometry, material);
			mesh.name = id;
			scene.add(mesh);
			return {
				id,
				geometry,
				geometryDispose: vi.spyOn(geometry, 'dispose'),
				materialDispose: vi.spyOn(material, 'dispose')
			};
		});
		const load = vi
			.spyOn(GLTFLoader.prototype, 'loadAsync')
			.mockResolvedValue({ scene } as unknown as GLTF);
		await Promise.all([rig.loadRefinedCams(), rig.loadRefinedCams()]);
		expect(load).toHaveBeenCalledTimes(1);
		expect(rig.getDiagnostics().refinedCamsLoaded).toBe(true);
		for (const resource of resources) {
			expect(rig.prepareGeometry(resource.id, new THREE.BufferGeometry())).toBe(resource.geometry);
			expect(resource.materialDispose).toHaveBeenCalledTimes(1);
		}
		rig.dispose();
		rig.dispose();
		resources.forEach((resource) => expect(resource.geometryDispose).toHaveBeenCalledTimes(1));
		load.mockRestore();
	});
});
