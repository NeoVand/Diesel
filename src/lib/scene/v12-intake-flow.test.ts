import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ProcessParticles } from './process-particles';
import { ClippingGroup } from 'three/webgpu';
import both from '../engine/v12-intake-flow-field.json';
import right from '../engine/v12-intake-flow-field-1.json';
import left from '../engine/v12-intake-flow-field-2.json';
import { v12CylinderValveState } from '../engine/v12-valve-events';
import {
	V12IntakeFlow,
	V12_INTAKE_PORT_BINDINGS,
	sampleV12IntakePath,
	v12IntakeFlowGate
} from './v12-intake-flow';

describe('native intake potential-flow tracers', () => {
	it('keeps field residual, volume approximation and outlet flux balance within declared limits', () => {
		for (const [mask, field] of [
			[1, right],
			[2, left],
			[3, both]
		] as const) {
			expect(field.validation.freeResidualRelative).toBeLessThan(1e-9);
			expect(field.validation.relativeBoundaryFluxImbalance).toBeLessThan(1e-9);
			expect(field.validation.relativeVolumeError).toBeLessThan(0.01);
			expect(field.validation.potentialRange[0]).toBeGreaterThanOrEqual(-0.005);
			expect(field.validation.potentialRange[1]).toBeLessThanOrEqual(1.005);
			for (const [bit, port] of [
				[1, 1],
				[2, 3]
			]) {
				if (!(mask & bit))
					expect(Math.abs(field.validation.portFluxesNormalizedMm[port])).toBeLessThan(1e-9);
			}
			const allowed = mask === 1 ? [1] : mask === 2 ? [3] : [1, 3];
			expect(field.paths.every((path) => allowed.includes(path.outletPort))).toBe(true);
			expect(field.validation.nativePointContainmentChecks).toBeGreaterThan(20_000);
		}
	});

	it('uses measured bank and axial station to bind all 12 destination cylinders exactly once', () => {
		expect(
			V12_INTAKE_PORT_BINDINGS.map((pair) => pair.outlets.map((outlet) => outlet.pistonId))
		).toEqual([
			['v12-0008', 'v12-0009'],
			['v12-0007', 'v12-0010'],
			['v12-0006', 'v12-0011'],
			['v12-0005', 'v12-0012'],
			['v12-0004', 'v12-0013'],
			['v12-0003', 'v12-0014']
		]);
		expect(
			new Set(
				V12_INTAKE_PORT_BINDINGS.flatMap((pair) => pair.outlets.map((outlet) => outlet.pistonId))
			).size
		).toBe(12);
	});

	it('never selects a field with a flowing outlet to a closed actual destination valve over 720 degrees', () => {
		const observed = new Set<number>();
		for (let phase = 0; phase < 720; phase += 2) {
			for (const pair of V12_INTAKE_PORT_BINDINGS) {
				const gate = v12IntakeFlowGate(pair.solidIndex, phase);
				observed.add(gate.mask);
				for (let i = 0; i < 2; i++) {
					const state = v12CylinderValveState(pair.outlets[i].pistonId, phase).intake;
					expect(Boolean(gate.mask & (1 << i))).toBe(state.open);
					if (!state.open) expect(gate.curtainFractions[i]).toBe(0);
				}
			}
		}
		expect(observed.has(0)).toBe(true);
		expect(observed.size).toBeGreaterThanOrEqual(3);
	});

	it('contains finite monotonic-time integration points and samples them without curve interpolation', () => {
		const output = new THREE.Vector3();
		for (const field of [right, left, both]) {
			for (const path of field.paths) {
				expect(path.positionsMm.length).toBe(path.timesSeconds.length * 3);
				expect(path.positionsMm.every(Number.isFinite)).toBe(true);
				for (let i = 1; i < path.timesSeconds.length; i++)
					expect(path.timesSeconds[i]).toBeGreaterThan(path.timesSeconds[i - 1]);
				const i = Math.floor(path.timesSeconds.length / 2);
				const time = (path.timesSeconds[i] + path.timesSeconds[i + 1]) / 2;
				sampleV12IntakePath(path.positionsMm, path.timesSeconds, time, output);
				for (let axis = 0; axis < 3; axis++)
					expect(output.getComponent(axis)).toBeCloseTo(
						(path.positionsMm[i * 3 + axis] + path.positionsMm[(i + 1) * 3 + axis]) / 2,
						9
					);
			}
		}
	});

	it('reuses one draw object/buffer and gives identical pause/seek frames with normal depth clipping', () => {
		const flow = new V12IntakeFlow();
		expect(flow.group.children).toHaveLength(1);
		const points = flow.group.getObjectByName('Soft native-passage advection') as ProcessParticles;
		const geometry = points.sourceGeometry;
		const attribute = geometry.getAttribute('position');
		flow.update(0.2, true, null, 123);
		const snapshot = Array.from(attribute.array);
		const colors = Array.from(geometry.getAttribute('color').array);
		flow.update(7, true, null, 377);
		flow.update(0.2, true, new THREE.Plane(new THREE.Vector3(1, 0, 0), 2), 123);
		expect(Array.from(attribute.array)).toEqual(snapshot);
		expect(Array.from(geometry.getAttribute('color').array)).toEqual(colors);
		expect(points.sourceGeometry).toBe(geometry);
		expect(points.material.depthTest).toBe(true);
		expect(points.material.depthWrite).toBe(false);
		expect((points.parent as ClippingGroup).clippingPlanes).toHaveLength(1);
		flow.update(0.2, true, null, 123);
		expect((points.parent as ClippingGroup).enabled).toBe(false);
		flow.update(0.2, false);
		expect(flow.group.visible).toBe(false);
		flow.dispose();
		flow.dispose();
		expect(flow.group.children).toHaveLength(0);
	});
});
