import type * as THREE from 'three';
import { NativeFlowParticles, type NativeFlowPath } from './native-flow-particles';
import field from '../engine/v12-intake-flow-field.json';
import rightOutletField from '../engine/v12-intake-flow-field-1.json';
import leftOutletField from '../engine/v12-intake-flow-field-2.json';
import { V12_CYLINDERS, v12NativeToDisplay } from '../engine/v12-kinematics';
import { v12CylinderValveState } from '../engine/v12-valve-events';

export const V12_INTAKE_FLOW_FIELD = field;
export const V12_INTAKE_FLOW_SCOPE = {
	model: 'Idealized steady potential flow',
	geometry: 'Six native CAD intake passages; verified interior gas solids',
	field: 'Offline linear-tetrahedral Laplace FEM; natural impermeable walls',
	boundary: 'Three solved outlet masks; closed destination valves impose natural no-flux',
	speed: 'Illustrative tracer speed; no engine operating-point calibration',
	limitations:
		'No viscous pressure losses, turbulence, compressibility or transient fluid inertia; quasi-steady outlet masks only'
} as const;

export const V12_INTAKE_PORT_BINDINGS = field.instances.map((instance) => ({
	solidIndex: instance.solidIndex,
	outlets: [1, 3].map((portIndex) => {
		const port = field.ports[portIndex];
		const bank = port.centerMm[0] > 0 ? 'positiveX' : 'negativeX';
		const nativeZ = port.centerMm[2] + instance.translationMm[2];
		const cylinder = V12_CYLINDERS.find(
			(cylinder) =>
				cylinder.bank === bank && Math.abs(cylinder.pistonPinCenterMm[2] - nativeZ) < 1e-4
		);
		if (!cylinder)
			throw new Error(
				`Unmatched native intake outlet: solid${instance.solidIndex}, port${portIndex}`
			);
		return { portIndex, pistonId: cylinder.pistonId, nativeZ, bank };
	})
}));

export function v12IntakeFlowGate(solidIndex: number, crankDeg: number) {
	const ports = V12_INTAKE_PORT_BINDINGS[solidIndex].outlets;
	const states = ports.map((port) => v12CylinderValveState(port.pistonId, crankDeg).intake);
	return {
		mask: (states[0].open ? 1 : 0) | (states[1].open ? 2 : 0),
		curtainFractions: states.map((state) =>
			state.open ? Math.min(1, state.curtainAreaMm2 / (2 * Math.PI * 12.5 ** 2)) : 0
		)
	};
}

export { sampleNativeFlowPath as sampleV12IntakePath } from './native-flow-particles';

function preparePaths(): NativeFlowPath[] {
	const paths: NativeFlowPath[] = [];
	for (const [mask, sourceField] of [
		[1, rightOutletField],
		[2, leftOutletField],
		[3, field]
	] as const) {
		for (const instance of field.instances) {
			for (let index = 0; index < sourceField.paths.length; index++) {
				const source = sourceField.paths[index];
				const positions = new Float32Array(source.positionsMm.length);
				for (let i = 0; i < source.positionsMm.length; i += 3) {
					positions.set(
						v12NativeToDisplay([
							source.positionsMm[i] + instance.translationMm[0],
							source.positionsMm[i + 1] + instance.translationMm[1],
							source.positionsMm[i + 2] + instance.translationMm[2]
						]),
						i
					);
				}
				paths.push({
					positions,
					times: source.timesSeconds,
					duration: source.durationSeconds,
					instanceIndex: instance.solidIndex,
					mask,
					gainIndex: source.outletPort === 1 ? 0 : 1,
					offset: (index * 0.61803398875 + instance.solidIndex * 0.38196601125) % 1
				});
			}
		}
	}
	return paths;
}

/** Field-backed native intake presentation with actual destination valve masks. */
export class V12IntakeFlow extends NativeFlowParticles {
	constructor() {
		super(preparePaths(), { name: 'Native intake potential-flow tracers', color: 0x83dded });
	}
	update(
		timeSeconds: number,
		visible: boolean,
		clipPlane: THREE.Plane | null = null,
		crankDeg = 0
	) {
		const states = visible
			? field.instances.map((instance) => {
					const gate = v12IntakeFlowGate(instance.solidIndex, crankDeg);
					return { mask: gate.mask, gains: gate.curtainFractions };
				})
			: [];
		this.updateParticles(timeSeconds, visible, states, clipPlane);
	}
}
