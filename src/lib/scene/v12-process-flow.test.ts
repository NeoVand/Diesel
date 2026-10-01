import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { V12ProcessFlow } from './v12-process-flow';
import { V12ChamberDomain, V12_CHAMBER_DATUMS } from './v12-chamber-domain';
import { v12CylinderValveState } from '../engine/v12-valve-events';

const bytes = readFileSync('static/models/v12-chamber-domains.bin');
const data = new Float32Array(
	bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
);
const state = {
	phase: 185,
	driveAngle: 185,
	running: true,
	flows: ['air', 'fuel', 'exhaust', 'combustion'],
	visible: true,
	clipPlane: null
};
function parcels(flow: V12ProcessFlow) {
	const points = flow.group.getObjectByName('Reduced liquid-fuel parcels') as THREE.Points;
	return {
		points,
		count: points.geometry.drawRange.count,
		positions: points.geometry.getAttribute('position')
	};
}

describe('source-contained engine process layer', () => {
	it('does not let loading-time animation race shader warmup visibility restoration', async () => {
		const flow = new V12ProcessFlow(data);
		const renderer = {
			compileAsync: vi.fn(async () => {
				flow.update(state);
			})
		};
		try {
			await flow.warmup(
				renderer as unknown as THREE.WebGLRenderer,
				new THREE.Scene(),
				new THREE.PerspectiveCamera()
			);
			expect(flow.group.visible).toBe(false);
			flow.update(state);
			expect(flow.group.visible).toBe(true);
			expect(flow.getDiagnostics().exhaust.outlet.activeVolumes).toBe(2);
			expect(flow.getDiagnostics().activeVolumes).toBeGreaterThan(0);
		} finally {
			flow.dispose();
		}
	});
	it('joins native paths with directed envelopes and bounds the charge above moving pistons', () => {
		const flow = new V12ProcessFlow(data);
		try {
			flow.update(state);
			expect(flow.getDiagnostics()).toMatchObject({
				cylinders: 12,
				visible: true,
				connections: { air: { routes: 24 }, fuel: { routes: 14 }, exhaust: { routes: 34 } },
				combustionGlow: { fixedLightCount: 2, shadowPasses: 0 }
			});
			expect(flow.getDiagnostics().activeVolumes).toBeGreaterThan(1);
			expect(flow.getDiagnostics().liquidParcels).toBeGreaterThan(0);
			flow.group.traverse((object) => {
				expect(object instanceof THREE.Line).toBe(false);
				if (object instanceof THREE.Mesh)
					expect(['BoxGeometry', 'BufferGeometry']).toContain(object.geometry.type);
			});
		} finally {
			flow.dispose();
		}
	});
	it('gates chamber exchange with actual valve motion for every cylinder throughout the cycle', () => {
		const flow = new V12ProcessFlow(data);
		try {
			for (const channel of ['air', 'exhaust'] as const) {
				let openSamples = 0;
				for (let phase = 0; phase < 720; phase += 8) {
					flow.update({ ...state, phase, driveAngle: phase, flows: [channel] });
					for (const datum of V12_CHAMBER_DATUMS.cylinders) {
						const volume = flow.group.getObjectByName(
							`Bounded spray/combustion volume ${datum.pistonId}`
						) as THREE.Mesh<THREE.BoxGeometry, THREE.ShaderMaterial>;
						const valve = v12CylinderValveState(datum.pistonId, phase)[
							channel === 'air' ? 'intake' : 'exhaust'
						];
						if (volume.visible) {
							expect(valve.open).toBe(true);
							openSamples++;
						}
						const u = volume.material.uniforms;
						expect(u[channel === 'air' ? 'uExhaust' : 'uIntake'].value).toBe(0);
					}
				}
				expect(openSamples).toBeGreaterThan(100);
			}
			flow.update({ ...state, interiorVisible: false });
			expect(flow.getDiagnostics().activeVolumes).toBe(0);
			expect(flow.getDiagnostics().combustionGlow.activeLights).toBe(0);
			expect(flow.getDiagnostics().connections.air.visible).toBe(false);
			flow.update({ ...state, flows: ['fuel'] });
			expect(flow.getDiagnostics().combustionGlow.activeLights).toBe(0);
			for (const datum of V12_CHAMBER_DATUMS.cylinders) {
				const volume = flow.group.getObjectByName(
					`Bounded spray/combustion volume ${datum.pistonId}`
				) as THREE.Mesh<THREE.BoxGeometry, THREE.ShaderMaterial>;
				expect(
					volume.material.uniforms.uIntake.value + volume.material.uniforms.uExhaust.value
				).toBe(0);
			}
		} finally {
			flow.dispose();
		}
	});
	it('every emitted parcel stays inside a registered moving gas domain over a full cycle', () => {
		const flow = new V12ProcessFlow(data),
			domains = V12_CHAMBER_DATUMS.cylinders.map((_, i) => new V12ChamberDomain(i, data));
		const inverses = domains.map((d) => d.toWorld.clone().invert()),
			point = new THREE.Vector3();
		let checked = 0;
		try {
			for (let phase = 0; phase < 720; phase += 12) {
				flow.update({ ...state, phase, driveAngle: phase });
				domains.forEach((d) => d.update(phase));
				const { count, positions } = parcels(flow);
				for (let i = 0; i < count; i++) {
					const contained = domains.some((d, j) => {
						point.fromBufferAttribute(positions, i).applyMatrix4(inverses[j]);
						return d.contains(point.x, point.y, point.z);
					});
					expect(contained, `parcel${i} at${phase}°`).toBe(true);
					checked++;
				}
			}
			expect(checked).toBeGreaterThan(1000);
		} finally {
			flow.dispose();
			domains.forEach((d) => d.dispose());
		}
	});
	it('pause and backwards seek reconstruct identical parcel buffers', () => {
		const flow = new V12ProcessFlow(data);
		const snapshot = () => {
			const p = parcels(flow);
			return [...p.positions.array].slice(0, p.count * 3);
		};
		try {
			flow.update(state);
			const expected = snapshot();
			const glow = flow.illumination.children.map((light) => ({
				position: light.position.toArray(),
				intensity: (light as THREE.PointLight).intensity
			}));
			expect(flow.getDiagnostics().combustionGlow.activeLights).toBeGreaterThan(0);
			flow.update({ ...state, running: false });
			expect(snapshot()).toEqual(expected);
			flow.update({ ...state, phase: 421, driveAngle: 1861 });
			flow.update(state);
			expect(snapshot()).toEqual(expected);
			expect(
				flow.illumination.children.map((light) => ({
					position: light.position.toArray(),
					intensity: (light as THREE.PointLight).intensity
				}))
			).toEqual(glow);
		} finally {
			flow.dispose();
		}
	});
	it('reuses paused buffers and depth, then invalidates depth for camera or scene motion', () => {
		const flow = new V12ProcessFlow(data);
		const camera = new THREE.PerspectiveCamera(35, 1.5, 0.1, 100);
		const scene = new THREE.Scene();
		const renderer = {
			getDrawingBufferSize: (out: THREE.Vector2) => out.set(600, 400),
			getRenderTarget: () => null,
			setRenderTarget: vi.fn(),
			render: vi.fn(),
			shadowMap: { needsUpdate: false }
		};
		try {
			flow.update(state);
			const version = (parcels(flow).positions as THREE.BufferAttribute).version;
			flow.update({ ...state, running: false });
			expect((parcels(flow).positions as THREE.BufferAttribute).version).toBe(version);
			const depth = (changed: boolean) =>
				flow.prepareDepth(renderer as unknown as THREE.WebGLRenderer, scene, camera, [], changed);
			depth(false);
			depth(false);
			expect(renderer.render).toHaveBeenCalledTimes(1);
			camera.position.z = 5;
			depth(false);
			expect(renderer.render).toHaveBeenCalledTimes(2);
			depth(true);
			expect(renderer.render).toHaveBeenCalledTimes(3);
			camera.fov = 45;
			camera.updateProjectionMatrix();
			depth(false);
			expect(renderer.render).toHaveBeenCalledTimes(4);
			// The last section frame may have no active transition. Plane values independently
			// invalidate depth, including in-place mutation of the same THREE.Plane instance.
			const clipPlane = new THREE.Plane(new THREE.Vector3(1, 0, 0), 0.1);
			flow.update({ ...state, clipPlane });
			depth(false);
			expect(renderer.render).toHaveBeenCalledTimes(5);
			clipPlane.constant = 0.2;
			flow.update({ ...state, clipPlane });
			depth(false);
			expect(renderer.render).toHaveBeenCalledTimes(6);
		} finally {
			flow.dispose();
		}
	});
	it('sections use the same world plane and disassembly suppresses every process', () => {
		const flow = new V12ProcessFlow(data),
			plane = new THREE.Plane(new THREE.Vector3(1, 0, 0), 0.3);
		try {
			flow.update({ ...state, clipPlane: plane });
			expect((parcels(flow).points.material as THREE.Material).clippingPlanes?.[0]).toBe(plane);
			const volumes: THREE.Mesh[] = [];
			flow.group.traverse((o) => {
				if (o instanceof THREE.Mesh && o.name.startsWith('Bounded spray')) volumes.push(o);
			});
			expect((volumes[0].material as THREE.ShaderMaterial).uniforms.uPlane.value.toArray()).toEqual(
				[1, 0, 0, 0.3]
			);
			flow.update({ ...state, visible: false });
			expect(flow.group.visible).toBe(false);
			expect(flow.getDiagnostics().combustionGlow.activeLights).toBe(0);
			flow.update({ ...state, flows: [] });
			expect(flow.group.visible).toBe(false);
		} finally {
			flow.dispose();
		}
	});
	it('disposes volume, particle and domain resources exactly once', () => {
		const flow = new V12ProcessFlow(data),
			resources = new Set<THREE.Material | THREE.BufferGeometry | THREE.Texture>();
		flow.group.traverse((o) => {
			if (o instanceof THREE.Mesh || o instanceof THREE.Points) {
				resources.add(o.geometry);
				const m = o.material as THREE.Material;
				resources.add(m);
				if (m instanceof THREE.PointsMaterial && m.map) resources.add(m.map);
				if (m instanceof THREE.ShaderMaterial && m.uniforms.uBounds)
					resources.add(m.uniforms.uBounds.value);
			}
		});
		const spies = [...resources].map((r) => vi.spyOn(r, 'dispose'));
		flow.dispose();
		flow.dispose();
		spies.forEach((s) => expect(s).toHaveBeenCalledTimes(1));
		expect(flow.group.children).toHaveLength(0);
		expect(flow.illumination.children).toHaveLength(0);
	});
});
