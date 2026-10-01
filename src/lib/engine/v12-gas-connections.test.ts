import { describe, expect, it } from 'vitest';
import intakeField from './v12-intake-flow-field.json';
import exhaustField from './v12-exhaust-flow-field.json';
import outletDatums from './v12-exhaust-outlet-datums.json';
import { V12_CYLINDERS } from './v12-kinematics';
import { V12_VALVES } from './v12-valve-events';
import {
	V12_GAS_CONNECTIONS,
	V12_EXHAUST_DOWNSTREAM,
	v12GasConnection
} from './v12-gas-connections';

const distance = (a: readonly number[], b: readonly number[]) =>
	Math.hypot(...a.map((v, i) => v - b[i]));

describe('connected gas interfaces', () => {
	it('pairs all twelve cylinder stations with both manifold ports and all 48 measured valve seats', () => {
		expect(V12_GAS_CONNECTIONS).toHaveLength(12);
		const assignedValves: string[] = [];
		for (const connection of V12_GAS_CONNECTIONS) {
			const cylinder = V12_CYLINDERS.find((c) => c.pistonId === connection.pistonId)!;
			for (const role of ['intake', 'exhaust'] as const) {
				const port = connection[role];
				expect(port.paths).toHaveLength(2);
				expect(Math.abs(port.portCenterMm[2] - cylinder.pistonPinCenterMm[2])).toBeLessThan(0.002);
				expect(Math.sign(port.portCenterMm[0])).toBe(Math.sign(cylinder.bankAxis[0]));
				for (const path of port.paths) {
					const source = V12_VALVES.find((v) => v.valveId === path.valveId)!;
					expect(source.cylinderPistonId).toBe(connection.pistonId);
					expect(source.role).toBe(role);
					expect(path.seatCenterMm).toEqual(source.sourceSeatBore.axisPointMm);
					assignedValves.push(path.valveId);
				}
			}
		}
		expect(new Set(assignedValves).size).toBe(48);
	});

	it('starts air at the measured intake port and ends exhaust at the measured collector port', () => {
		for (const connection of V12_GAS_CONNECTIONS) {
			const intake = connection.intake;
			const native = intakeField.ports[intake.portIndex];
			const translation = intakeField.instances[intake.instanceIndex].translationMm;
			expect(intake.portCenterMm).toEqual(native.centerMm.map((v, i) => v + translation[i]));
			for (const path of intake.paths) {
				expect(path.pathMm[0]).toEqual(intake.portCenterMm);
				expect(path.pathMm.at(-1)).toEqual(path.seatCenterMm);
			}
			const exhaust = connection.exhaust;
			expect(exhaust.portCenterMm).toEqual(
				exhaustField.instances[exhaust.instanceIndex].ports[exhaust.portIndex].centerMm
			);
			for (const path of exhaust.paths) {
				expect(path.pathMm[0]).toEqual(path.seatCenterMm);
				expect(path.pathMm.at(-1)).toEqual(exhaust.portCenterMm);
			}
		}
	});

	it('keeps head curves local to the matched cylinder instead of crossing into an adjacent one', () => {
		for (const connection of V12_GAS_CONNECTIONS)
			for (const role of ['intake', 'exhaust'] as const)
				for (const path of connection[role].paths)
					for (const p of path.pathMm) {
						expect(p.every(Number.isFinite)).toBe(true);
						expect(Math.abs(p[2] - connection[role].portCenterMm[2])).toBeLessThan(18.002);
						expect(Math.sign(p[0])).toBe(Math.sign(connection.bankAxis[0]));
					}
	});

	it('joins every collector to its turbine, native downpipe and the correct measured outlet without a coordinate gap', () => {
		expect(V12_EXHAUST_DOWNSTREAM).toHaveLength(4);
		for (const route of V12_EXHAUST_DOWNSTREAM) {
			const outlet = outletDatums.outlets.find((o) => o.componentId === route.outletComponentId)!;
			expect(route.pathMm[0]).toEqual(
				exhaustField.instances[route.collectorIndex].ports[0].centerMm
			);
			expect(route.turbinePathMm.at(-1)).toEqual(route.pipePathMm[0]);
			expect(distance(route.pathMm.at(-1)!, outlet.centerMm)).toBeLessThan(1e-9);
			expect(route.intersections).toEqual([]);
			expect(route.nativeEmptySamples).toBe(route.pipePathMm.length);
			for (let i = 1; i < route.pathMm.length; i++)
				expect(distance(route.pathMm[i], route.pathMm[i - 1])).toBeLessThan(6);
		}
	});

	it('preserves the native negative-bank asymmetry and the outward direction at both exit mouths', () => {
		const [positive, , negative] = V12_EXHAUST_DOWNSTREAM;
		expect(negative.pipeInletMm[2]).toBeCloseTo(239.734637, 5);
		expect(positive.pipeInletMm[2]).toBeCloseTo(367.163784, 5);
		for (const route of V12_EXHAUST_DOWNSTREAM) {
			const outlet = outletDatums.outlets.find((o) => o.componentId === route.outletComponentId)!;
			const path = route.pathMm,
				a = path.at(-2)!,
				b = path.at(-1)!;
			const progress = b.reduce((sum, v, i) => sum + (v - a[i]) * outlet.axis[i], 0);
			expect(progress).toBeGreaterThan(0);
		}
	});

	it('rejects an unmatched cylinder instead of silently attaching it to another bank', () => {
		expect(v12GasConnection('v12-0014').pistonId).toBe('v12-0014');
		expect(() => v12GasConnection('invalid')).toThrow(RangeError);
	});
});
