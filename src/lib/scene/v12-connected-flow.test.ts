import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { V12_EXHAUST_DOWNSTREAM } from '../engine/v12-gas-connections';
import outletDatums from '../engine/v12-exhaust-outlet-datums.json';
import { v12DirectedExhaustRoutes, V12ConnectedFlow } from './v12-connected-flow';
import { directedFlowLengthMm, directedFlowPulse } from './directed-flow-volume';

const distance = (a: readonly number[], b: readonly number[]) =>
	Math.hypot(...a.map((value, axis) => value - b[axis]));

describe('directed exhaust network presentation', () => {
	it('draws each native shared trunk once and joins every turbine/branch with continuous pulse coordinates', () => {
		const routes = v12DirectedExhaustRoutes();
		expect(routes).toHaveLength(34);
		for (const source of V12_EXHAUST_DOWNSTREAM) {
			const turbine = routes.find((r) => r.id === source.turboId)!;
			const pipe = routes.find((r) => r.id === `${source.turboId}-downpipe`)!;
			const trunk = routes.find((r) => r.id === `${source.outletComponentId}-shared-trunk`)!;
			for (const [upstream, downstream] of [
				[turbine, pipe],
				[pipe, trunk]
			]) {
				expect(upstream.pointsMm.length).toBeGreaterThan(1);
				expect(distance(upstream.pointsMm.at(-1)!, downstream.pointsMm[0])).toBeLessThan(0.001);
				const endCoordinate = upstream.distanceOffsetMm! + directedFlowLengthMm(upstream.pointsMm);
				expect(endCoordinate).toBeCloseTo(downstream.distanceOffsetMm!, 5);
				for (const time of [-4, 0, 1, 42])
					expect(directedFlowPulse(endCoordinate, time)).toBeCloseTo(
						directedFlowPulse(downstream.distanceOffsetMm!, time),
						6
					);
			}
			const sourceLength = directedFlowLengthMm(source.pathMm);
			expect(Math.abs(turbine.distanceOffsetMm! + sourceLength)).toBeLessThan(0.001);
			const outlet = outletDatums.outlets.find((o) => o.componentId === source.outletComponentId)!;
			expect(trunk.pointsMm.at(-1)).toEqual(outlet.centerMm);
			expect(trunk.distanceOffsetMm! + directedFlowLengthMm(trunk.pointsMm)).toBeCloseTo(0, 8);
			const vector = trunk.pointsMm[1].map((v, i) => v - trunk.pointsMm[0][i]);
			expect(vector.reduce((sum, v, i) => sum + v * outlet.axis[i], 0)).toBeGreaterThan(0);
		}
		expect(routes.filter((r) => r.id.endsWith('-shared-trunk'))).toHaveLength(2);
	});

	it('preserves the reversed native bend on the negative bank without mistaking it for reverse flow', () => {
		const routes = v12DirectedExhaustRoutes();
		for (const id of ['turbo-3-downpipe', 'turbo-4-downpipe']) {
			const path = routes.find((r) => r.id === id)!.pointsMm;
			expect(path[1][2]).toBeGreaterThan(path[0][2]);
			const trunk = routes.find((r) => r.id === 'v12-0769-shared-trunk')!.pointsMm;
			expect(trunk.at(-1)![2]).toBeLessThan(path.at(-1)![2]);
		}
	});

	it('allocates finite increasing distance attributes and remains one draw per channel', () => {
		const flow = new V12ConnectedFlow();
		flow.update(190, 190, ['air', 'fuel', 'exhaust'], true, null);
		for (const object of flow.group.children) {
			const mesh = object as THREE.Mesh<THREE.BufferGeometry>;
			expect(Array.from(mesh.geometry.getAttribute('aDistance').array).every(Number.isFinite)).toBe(
				true
			);
		}
		expect(flow.getDiagnostics().exhaust).toMatchObject({
			drawCalls: 1,
			routes: 34,
			visible: true
		});
		flow.dispose();
	});
});
