import type * as THREE from 'three';
import field from '../engine/v12-exhaust-flow-field.json';
import { V12_EXHAUST_DOWNSTREAM } from '../engine/v12-gas-connections';
import { directedFlowLengthMm } from './directed-flow-volume';
import { V12_CYLINDERS, v12NativeToDisplay } from '../engine/v12-kinematics';
import { v12CylinderValveState } from '../engine/v12-valve-events';
import { NativeFlowParticles, type NativeFlowPath } from './native-flow-particles';
import { V12ExhaustOutlet } from './v12-exhaust-outlet';

export const V12_EXHAUST_FLOW_FIELD = field;
export const V12_EXHAUST_FLOW_SCOPE = {
	model: 'Idealized quasi-steady exhaust potential flow',
	geometry: 'Four verified native collector gas solids',
	boundary: 'Seven solved head-port masks; closed source valves impose natural no-flux',
	speed: 'Illustrative tracer speed and valve-curtain intensity; no calibrated mass flow',
	outlet:
		'Two measured external exhaust mouths with short illustrative soft exit plumes; no solved turbo/downpipe network',
	limitations:
		'No pressure losses, temperature, turbulence, compressibility or transient fluid inertia'
} as const;

export const V12_EXHAUST_PORT_BINDINGS = field.instances.map((instance) => ({
	instanceIndex: instance.instanceIndex,
	inlets: instance.ports.slice(1).map((port, index) => {
		const bank = port.centerMm[0] > 0 ? 'positiveX' : 'negativeX';
		const nativeZ = port.centerMm[2];
		const cylinder = V12_CYLINDERS.find(
			(cylinder) =>
				cylinder.bank === bank && Math.abs(cylinder.pistonPinCenterMm[2] - nativeZ) < 0.002
		);
		if (!cylinder)
			throw new Error(
				`Unmatched native exhaust port: instance ${instance.instanceIndex}, port ${index + 1}`
			);
		return { portIndex: index + 1, pistonId: cylinder.pistonId, nativeZ, bank };
	})
}));

export function v12ExhaustFlowGate(instanceIndex: number, crankDeg: number) {
	const states = V12_EXHAUST_PORT_BINDINGS[instanceIndex].inlets.map(
		(port) => v12CylinderValveState(port.pistonId, crankDeg).exhaust
	);
	return {
		mask: states.reduce((mask, state, index) => mask | (state.open ? 1 << index : 0), 0),
		curtainFractions: states.map((state) =>
			state.open ? Math.min(1, state.curtainAreaMm2 / (2 * Math.PI * 12.5 ** 2)) : 0
		)
	};
}

function preparePaths(): NativeFlowPath[] {
	const paths: NativeFlowPath[] = [];
	for (const variant of field.variants) {
		for (const instance of field.instances) {
			for (let index = 0; index < variant.paths.length; index++) {
				const source = variant.paths[index];
				const positions = new Float32Array(source.positionsMm.length);
				for (let i = 0; i < source.positionsMm.length; i += 3) {
					positions.set(
						v12NativeToDisplay([
							source.positionsMm[i] * instance.scale[0] + instance.translationMm[0],
							source.positionsMm[i + 1] * instance.scale[1] + instance.translationMm[1],
							source.positionsMm[i + 2] * instance.scale[2] + instance.translationMm[2]
						]),
						i
					);
				}
				const nativePoints = Array.from({ length: source.positionsMm.length / 3 }, (_, i) =>
					source.positionsMm.slice(i * 3, i * 3 + 3)
				);
				const downstream = V12_EXHAUST_DOWNSTREAM.find(
					(route) => route.collectorIndex === instance.instanceIndex
				)!;
				paths.push({
					// Negative upstream network coordinate; the measured mouth is zero.
					distanceOffsetMm:
						-directedFlowLengthMm(downstream.pathMm) - directedFlowLengthMm(nativePoints),
					positions,
					times: source.timesSeconds,
					duration: source.durationSeconds,
					instanceIndex: instance.instanceIndex,
					mask: variant.mask,
					gainIndex: source.inletPort - 1,
					offset: (index * 0.61803398875 + instance.instanceIndex * 0.38196601125) % 1
				});
			}
		}
	}
	return paths;
}

/** Actual source collector interiors, with independent boundary solves for all valve masks. */
export class V12ExhaustFlow extends NativeFlowParticles {
	private readonly outlet = new V12ExhaustOutlet();
	private readonly bankGains = [0, 0];
	constructor() {
		super(preparePaths(), {
			name: 'Native exhaust potential-flow tracers',
			color: 0xeeb084,
			size: 0.26,
			opacity: 0.34
		});
		this.group.add(this.outlet.group);
	}
	update(
		timeSeconds: number,
		visible: boolean,
		clipPlane: THREE.Plane | null = null,
		crankDeg = 0
	) {
		const states = visible
			? field.instances.map((instance) => {
					const gate = v12ExhaustFlowGate(instance.instanceIndex, crankDeg);
					return { mask: gate.mask, gains: gate.curtainFractions };
				})
			: [];
		this.updateParticles(timeSeconds, visible, states, clipPlane);
		for (let bank = 0; bank < 2; bank++) {
			const a = states[bank * 2],
				b = states[bank * 2 + 1];
			this.bankGains[bank] = Math.min(
				1,
				((a?.gains.reduce((sum, value) => sum + value, 0) ?? 0) +
					(b?.gains.reduce((sum, value) => sum + value, 0) ?? 0)) /
					1.5
			);
		}
		this.outlet.update(timeSeconds, visible, clipPlane, this.bankGains);
	}
	get needsDepth() {
		return this.outlet.needsDepth;
	}
	setDepth(texture: THREE.DepthTexture, width: number, height: number) {
		this.outlet.setDepth(texture, width, height);
	}
	warmupVisibility(): () => void {
		const visible = this.group.visible;
		const restoreOutlet = this.outlet.warmupVisibility();
		this.group.visible = true;
		return () => {
			this.group.visible = visible;
			restoreOutlet();
		};
	}
	getDiagnostics() {
		return { ...super.getDiagnostics(), outlet: this.outlet.getDiagnostics() };
	}
	dispose() {
		this.outlet.dispose();
		super.dispose();
	}
}
