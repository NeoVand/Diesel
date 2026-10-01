import * as THREE from 'three';
import { V12_GAS_CONNECTIONS, V12_EXHAUST_DOWNSTREAM } from '../engine/v12-gas-connections';
import { V12_FUEL_RAILS, V12_FUEL_CONNECTIONS } from '../engine/v12-fuel-connections';
import { V12_CYLINDERS, v12NativeToDisplay } from '../engine/v12-kinematics';
import { v12ProcessCycle } from '../engine/v12-process-cycle';
import { v12CylinderValveState } from '../engine/v12-valve-events';
import intakeField from '../engine/v12-intake-flow-field.json';
import outletDatums from '../engine/v12-exhaust-outlet-datums.json';
import {
	DirectedFlowVolume,
	directedFlowLengthMm,
	type DirectedFlowRoute
} from './directed-flow-volume';
import type { FlowBoundaryLabel } from './v12-flow-labels';

const intakeRoutes: DirectedFlowRoute[] = V12_GAS_CONNECTIONS.flatMap((connection, gate) =>
	connection.intake.paths.map((path) => ({
		id: path.valveId,
		pointsMm: path.pathMm,
		radiusMm: 8,
		gate
	}))
);
/** The native pipes share one terminal trunk per bank. Drawing both complete turbine
 * routes stacks nearly coplanar surfaces and unrelated pulse phases on that same trunk. */
export function v12DirectedExhaustRoutes(): DirectedFlowRoute[] {
	const routes: DirectedFlowRoute[] = V12_GAS_CONNECTIONS.flatMap((connection, gate) =>
		connection.exhaust.paths.map((path) => ({
			id: path.valveId,
			pointsMm: path.pathMm,
			radiusMm: 8,
			gate
		}))
	);
	for (const [bank, outlet] of outletDatums.outlets.entries()) {
		const branches = V12_EXHAUST_DOWNSTREAM.flatMap((path, index) =>
			path.outletComponentId === outlet.componentId ? [{ path, index }] : []
		);
		const along = (point: readonly number[]) =>
			point.reduce((sum, v, axis) => sum + (v - outlet.centerMm[axis]) * outlet.axis[axis], 0);
		const terminal = branches.map(({ path }) => {
			let start = path.pipePathMm.length - 1;
			while (start > 0) {
				const p = path.pipePathMm[start - 1];
				const distance = along(p);
				const error = Math.hypot(
					...p.map((v, axis) => v - outlet.centerMm[axis] - distance * outlet.axis[axis])
				);
				if (error > 0.001) break;
				start--;
			}
			return { point: path.pipePathMm[start], distance: along(path.pipePathMm[start]) };
		});
		// The nearer branch joins last; downstream of it there is precisely one native trunk.
		const shared = terminal.reduce((a, b) => (a.distance > b.distance ? a : b));
		const sharedLength = -shared.distance;
		routes.push({
			id: `${outlet.componentId}-shared-trunk`,
			pointsMm: [shared.point, outlet.centerMm],
			radiusMm: 10,
			gate: 16 + bank,
			distanceOffsetMm: -sharedLength
		});
		for (const { path, index } of branches) {
			const pipe: (readonly number[])[] = [path.pipePathMm[0]];
			// The negative-bank elbow initially travels away from the mouth before
			// turning back. Find the actual 3D junction, never cut against a Z plane.
			for (let i = 1; i < path.pipePathMm.length; i++) {
				const a = path.pipePathMm[i - 1],
					b = path.pipePathMm[i];
				const delta = b.map((value, axis) => value - a[axis]);
				const t =
					shared.point.reduce((sum, value, axis) => sum + (value - a[axis]) * delta[axis], 0) /
					delta.reduce((sum, value) => sum + value * value, 0);
				const error = Math.hypot(
					...shared.point.map((value, axis) => value - a[axis] - t * delta[axis])
				);
				if (t >= -0.0001 && t <= 1.0001 && error < 0.001) {
					if (t > 0.0001) pipe.push(shared.point);
					break;
				}
				pipe.push(b);
			}
			const pipeLength = directedFlowLengthMm(pipe);
			const turbineLength = directedFlowLengthMm(path.turbinePathMm);
			routes.push(
				{
					id: path.turboId,
					pointsMm: path.turbinePathMm,
					radiusMm: 3,
					gate: 12 + index,
					distanceOffsetMm: -sharedLength - pipeLength - turbineLength
				},
				{
					id: `${path.turboId}-downpipe`,
					pointsMm: pipe,
					radiusMm: 10,
					gate: 12 + index,
					distanceOffsetMm: -sharedLength - pipeLength
				}
			);
		}
	}
	return routes;
}
const exhaustRoutes = v12DirectedExhaustRoutes();
const fuelRoutes: DirectedFlowRoute[] = [
	...V12_FUEL_RAILS.map((rail) => ({
		id: rail.id,
		pointsMm: rail.pointsMm,
		radiusMm: 3,
		gate: 12
	})),
	...V12_FUEL_CONNECTIONS.map((connection) => ({
		distanceOffsetMm: directedFlowLengthMm(
			V12_FUEL_RAILS.find((rail) => rail.id === connection.railId)!.pointsMm.slice(
				0,
				V12_FUEL_RAILS.find((rail) => rail.id === connection.railId)!.pointsMm.findIndex((p) =>
					p.every((v, axis) => Math.abs(v - connection.railJunctionMm[axis]) < 0.001)
				) + 1
			)
		),
		id: connection.id,
		pointsMm: connection.pointsMm,
		radiusMm: 2.5,
		gate: V12_CYLINDERS.findIndex((c) => c.pistonId === connection.pistonId)
	}))
];

/** The missing links around native solved manifolds. Geometry and flow-solution provenance stay distinct. */
export class V12ConnectedFlow {
	readonly group = new THREE.Group();
	private readonly air = new DirectedFlowVolume(
		intakeRoutes,
		0x83dded,
		'Head intake connections · inferred passages'
	);
	private readonly exhaust = new DirectedFlowVolume(
		exhaustRoutes,
		0xeeb084,
		'Head and turbine connections · native downpipes'
	);
	private readonly fuel = new DirectedFlowVolume(
		fuelRoutes,
		0xf4cc68,
		'Native rail galleries and direct injector feed',
		{ baseOpacity: 0.62, throughSolids: true }
	);
	private readonly airGains = new Array<number>(12).fill(0);
	private readonly exhaustGains = new Array<number>(18).fill(0);
	private readonly fuelGains = new Array<number>(13).fill(0);
	readonly labels: FlowBoundaryLabel[] = [
		{
			id: 'air',
			text: 'Air inlet',
			color: '#83dded',
			visible: false,
			anchors: intakeField.instances.flatMap((instance) =>
				[0, 2].map(
					(i) =>
						new THREE.Vector3(
							...v12NativeToDisplay(
								intakeField.ports[i].centerMm.map((value, j) => value + instance.translationMm[j])
							)
						)
				)
			)
		},
		{
			id: 'fuel',
			text: 'Fuel supply · rail inlet',
			color: '#f4cc68',
			visible: false,
			anchors: V12_FUEL_RAILS.map((rail) => new THREE.Vector3(...v12NativeToDisplay(rail.supplyMm)))
		},
		{
			id: 'exhaust',
			text: 'Exhaust outlet',
			color: '#eeb084',
			visible: false,
			anchors: outletDatums.outlets.map(
				(outlet) => new THREE.Vector3(...v12NativeToDisplay(outlet.centerMm))
			)
		}
	];
	constructor() {
		this.group.name = 'Connected engine process paths';
		this.group.add(this.air.mesh, this.exhaust.mesh, this.fuel.mesh);
	}
	update(
		phase: number,
		driveAngle: number,
		flows: readonly string[],
		interior: boolean,
		plane: THREE.Plane | null,
		timeSeconds = driveAngle / 90
	) {
		for (let i = 0; i < V12_CYLINDERS.length; i++) {
			const cylinder = V12_CYLINDERS[i];
			const valves = v12CylinderValveState(cylinder.pistonId, phase);
			const cycle = v12ProcessCycle(cylinder, phase);
			this.airGains[i] = valves.intake.open ? Math.sqrt(cycle.intake) : 0;
			this.exhaustGains[i] = valves.exhaust.open ? Math.sqrt(cycle.exhaust) : 0;
			this.fuelGains[i] = cycle.injection;
		}
		this.fuelGains[12] = 0.8;
		for (const [i, route] of V12_EXHAUST_DOWNSTREAM.entries()) {
			const gates = V12_GAS_CONNECTIONS.flatMap((c, n) =>
				c.exhaust.instanceIndex === route.collectorIndex ? [this.exhaustGains[n]] : []
			);
			this.exhaustGains[12 + i] = Math.min(
				1,
				gates.reduce((a, b) => a + b, 0)
			);
		}
		for (const [bank, outlet] of outletDatums.outlets.entries())
			this.exhaustGains[16 + bank] = Math.min(
				1,
				V12_EXHAUST_DOWNSTREAM.reduce(
					(sum, path, i) =>
						sum + (path.outletComponentId === outlet.componentId ? this.exhaustGains[12 + i] : 0),
					0
				)
			);
		const seconds = timeSeconds;
		this.air.update(seconds, interior && flows.includes('air'), this.airGains, plane);
		this.exhaust.update(seconds, interior && flows.includes('exhaust'), this.exhaustGains, plane);
		this.fuel.update(seconds, interior && flows.includes('fuel'), this.fuelGains, plane);
		for (const label of this.labels) label.visible = flows.includes(label.id);
	}
	get needsDepth() {
		return this.fuel.mesh.visible;
	}
	setDepth(texture: THREE.DepthTexture, width: number, height: number) {
		this.fuel.setDepth(texture, width, height);
	}
	getDiagnostics() {
		return {
			air: this.air.getDiagnostics(),
			fuel: this.fuel.getDiagnostics(),
			exhaust: this.exhaust.getDiagnostics(),
			valveGates: {
				air: [...this.airGains],
				exhaust: this.exhaustGains.slice(0, 12),
				fuel: this.fuelGains.slice(0, 12)
			},
			scope:
				'Native fuel galleries and downpipes; inferred head and turbine centerlines. Width and speed are illustrative.'
		};
	}
	dispose() {
		this.air.dispose();
		this.exhaust.dispose();
		this.fuel.dispose();
		this.group.clear();
	}
}
