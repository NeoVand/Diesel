import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ProcessParticles } from './process-particles';
import { ClippingGroup } from 'three/webgpu';
import { v12CylinderValveState } from '../engine/v12-valve-events';
import {
	V12ExhaustFlow,
	V12_EXHAUST_FLOW_FIELD,
	V12_EXHAUST_PORT_BINDINGS,
	v12ExhaustFlowGate
} from './v12-exhaust-flow';

describe('native exhaust potential-flow tracers', () => {
	it('provides all seven open-port combinations with no flux at each closed inlet', () => {
		expect(V12_EXHAUST_FLOW_FIELD.variants.map((variant) => variant.mask)).toEqual([
			1, 2, 3, 4, 5, 6, 7
		]);
		for (const variant of V12_EXHAUST_FLOW_FIELD.variants) {
			const audit = variant.validation;
			expect(audit.relativeVolumeError).toBeLessThan(0.01);
			expect(audit.freeResidualRelative).toBeLessThan(1e-9);
			expect(audit.relativeBoundaryFluxImbalance).toBeLessThan(1e-9);
			expect(audit.portFluxesNormalizedMm[0]).toBeLessThan(0);
			for (let inlet = 1; inlet <= 3; inlet++) {
				if (variant.mask & (1 << (inlet - 1)))
					expect(audit.portFluxesNormalizedMm[inlet]).toBeGreaterThan(0);
				else expect(Math.abs(audit.portFluxesNormalizedMm[inlet])).toBeLessThan(1e-9);
			}
			for (const path of variant.paths) {
				expect(Boolean(variant.mask & (1 << (path.inletPort - 1)))).toBe(true);
				expect(path.outletPort).toBe(0);
				expect(path.positionsMm.length).toBe(path.timesSeconds.length * 3);
				expect(path.positionsMm.every(Number.isFinite)).toBe(true);
				for (let i = 1; i < path.timesSeconds.length; i++)
					expect(path.timesSeconds[i]).toBeGreaterThan(path.timesSeconds[i - 1]);
				const first = new THREE.Vector3().fromArray(path.positionsMm);
				const last = new THREE.Vector3().fromArray(path.positionsMm, path.positionsMm.length - 3);
				const inlet = V12_EXHAUST_FLOW_FIELD.ports[path.inletPort];
				const outlet = V12_EXHAUST_FLOW_FIELD.ports[0];
				const inletDelta = first.sub(new THREE.Vector3(...inlet.centerMm));
				const outletDelta = last.sub(new THREE.Vector3(...outlet.centerMm));
				expect(Math.abs(inletDelta.dot(new THREE.Vector3(...inlet.axis)))).toBeCloseTo(1, 3);
				expect(Math.abs(outletDelta.dot(new THREE.Vector3(...outlet.axis)))).toBeLessThan(2.1);
				for (let i = 3; i < path.positionsMm.length; i += 3) {
					const distance = new THREE.Vector3()
						.fromArray(path.positionsMm, i)
						.distanceTo(new THREE.Vector3().fromArray(path.positionsMm, i - 3));
					expect(distance).toBeLessThan(2);
				}
			}
			expect(audit.nativePointContainmentChecks).toBeGreaterThan(5000);
		}
	});

	it('binds all 12 native head ports to the correct bank and axial cylinder station', () => {
		expect(
			V12_EXHAUST_PORT_BINDINGS.map((group) => group.inlets.map((inlet) => inlet.pistonId))
		).toEqual([
			['v12-0006', 'v12-0008', 'v12-0007'],
			['v12-0003', 'v12-0005', 'v12-0004'],
			['v12-0012', 'v12-0014', 'v12-0013'],
			['v12-0009', 'v12-0011', 'v12-0010']
		]);
		expect(
			new Set(
				V12_EXHAUST_PORT_BINDINGS.flatMap((group) => group.inlets.map((inlet) => inlet.pistonId))
			).size
		).toBe(12);
		for (const instance of V12_EXHAUST_FLOW_FIELD.instances) {
			expect(instance.scale.reduce((determinant, component) => determinant * component, 1)).toBe(1);
			for (let port = 0; port < 4; port++) {
				const expected = V12_EXHAUST_FLOW_FIELD.ports[port].centerMm.map(
					(value, axis) => value * instance.scale[axis] + instance.translationMm[axis]
				);
				expect(
					new THREE.Vector3(...expected).distanceTo(
						new THREE.Vector3(...instance.ports[port].centerMm)
					)
				).toBeLessThan(0.001);
			}
		}
	});

	it('gates every source inlet by its actual exhaust valve state through a full cycle', () => {
		const observed = new Set<number>();
		for (let phase = 0; phase < 720; phase += 2) {
			for (const group of V12_EXHAUST_PORT_BINDINGS) {
				const gate = v12ExhaustFlowGate(group.instanceIndex, phase);
				observed.add(gate.mask);
				group.inlets.forEach((inlet, i) => {
					const state = v12CylinderValveState(inlet.pistonId, phase).exhaust;
					expect(Boolean(gate.mask & (1 << i))).toBe(state.open);
					if (!state.open) expect(gate.curtainFractions[i]).toBe(0);
				});
			}
		}
		expect(observed.has(0)).toBe(true);
		expect(observed.size).toBeGreaterThan(3);
	});

	it('replays deterministic source-registered frames and releases shared drawing resources', () => {
		const flow = new V12ExhaustFlow();
		flow.update(1.4, true, null, 380);
		const points = flow.group.getObjectByName('Soft native-passage advection') as ProcessParticles;
		const positions = points.sourceGeometry.getAttribute('position');
		const snapshot = Array.from(positions.array);
		const colorSnapshot = Array.from(points.sourceGeometry.getAttribute('color').array);
		flow.update(8, true, null, 100);
		flow.update(1.4, true, new THREE.Plane(new THREE.Vector3(0, 1, 0), 1), 380);
		expect(Array.from(positions.array)).toEqual(snapshot);
		expect(Array.from(points.sourceGeometry.getAttribute('color').array)).toEqual(colorSnapshot);
		expect(flow.getDiagnostics().drawObjects).toBe(2);
		expect(flow.getDiagnostics().outlet.activeVolumes).toBeGreaterThan(0);
		expect(flow.getDiagnostics().activeParticles).toBeGreaterThan(0);
		expect((points.parent as ClippingGroup).clippingPlanes).toHaveLength(1);
		flow.dispose();
		expect(flow.getDiagnostics()).toMatchObject({ activeParticles: 0, drawObjects: 0 });
	});
});
