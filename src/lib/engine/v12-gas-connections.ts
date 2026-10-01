import intakeField from './v12-intake-flow-field.json';
import exhaustField from './v12-exhaust-flow-field.json';
import downstreamDatums from './v12-exhaust-downstream-datums.json';
import chamberDatums from './v12-chamber-datums.json';
import { V12_CYLINDERS, type Point3 } from './v12-kinematics';
import { V12_VALVES, type V12ValveRole } from './v12-valve-events';

export interface V12GasValveConnection {
	valveId: string;
	seatCenterMm: Point3;
	seatAxis: Point3;
	seatBoreRadiusMm: number;
	/** Intake: manifold → seat. Exhaust: seat → manifold. Native millimetres. */
	pathMm: readonly Point3[];
}

export interface V12GasPortConnection {
	componentId: string;
	instanceIndex: number;
	portIndex: number;
	portCenterMm: Point3;
	portAxis: Point3;
	portRadiusMm: number;
	paths: readonly V12GasValveConnection[];
}

export interface V12GasConnection {
	pistonId: string;
	bank: string;
	bankAxis: Point3;
	nozzleMm: Point3;
	intake: V12GasPortConnection;
	exhaust: V12GasPortConnection;
}

export const V12_GAS_CONNECTION_SCOPE = {
	endpoints: 'Native manifold boundary caps and native cylinder-head valve-seat bore axes',
	pairing: 'Bank, axial cylinder station and the existing measured valve-to-cylinder association',
	paths: 'Illustrative head passage centerlines joining measured interfaces; not solved head flow',
	boundary:
		'Seat endpoints are fixed. Flow across the moving valve curtain must use current valve lift.',
	chamber: 'Air and fuel enter the combustion chamber above the piston crown, not the piston metal',
	turbine:
		'Inferred scroll-to-axial discharge presentation between native collector and pipe interfaces',
	downpipe: downstreamDatums.scope
} as const;

const point = (p: readonly number[]): Point3 => [p[0], p[1], p[2]];
const add = (a: readonly number[], b: readonly number[], scale = 1): Point3 => [
	a[0] + b[0] * scale,
	a[1] + b[1] * scale,
	a[2] + b[2] * scale
];
const subtract = (a: readonly number[], b: readonly number[]): Point3 => add(a, b, -1);
const dot = (a: readonly number[], b: readonly number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** A geometric presentation curve. It is deliberately not called a streamline. */
function cubic(a: Point3, b: Point3, c: Point3, d: Point3, steps = 32): Point3[] {
	return Array.from({ length: steps + 1 }, (_, i) => {
		const t = i / steps,
			u = 1 - t;
		return [0, 1, 2].map(
			(j) => u ** 3 * a[j] + 3 * u ** 2 * t * b[j] + 3 * u * t ** 2 * c[j] + t ** 3 * d[j]
		) as [number, number, number];
	});
}

function valvePaths(
	pistonId: string,
	role: V12ValveRole,
	port: readonly number[],
	portAxis: readonly number[]
): V12GasValveConnection[] {
	return V12_VALVES.filter((v) => v.cylinderPistonId === pistonId && v.role === role).map((v) => {
		const seat = point(v.sourceSeatBore.axisPointMm);
		const inwardSign = dot(subtract(seat, port), portAxis) >= 0 ? 1 : -1;
		const toSeat = cubic(
			point(port),
			add(port, portAxis, inwardSign * 15),
			add(seat, v.axis, 10),
			seat
		);
		return {
			valveId: v.valveId,
			seatCenterMm: seat,
			seatAxis: point(v.axis),
			seatBoreRadiusMm: v.sourceSeatBore.boreRadiusMm,
			pathMm: role === 'intake' ? toSeat : toSeat.reverse()
		};
	});
}

export const V12_GAS_CONNECTIONS: readonly V12GasConnection[] = V12_CYLINDERS.map((cylinder) => {
	const nativeZ = cylinder.pistonPinCenterMm[2];
	const bank = cylinder.bank;
	const matches = (port: readonly number[]) =>
		(port[0] > 0 ? 'positiveX' : 'negativeX') === bank && Math.abs(port[2] - nativeZ) < 0.002;
	const intake = intakeField.instances
		.flatMap((instance) =>
			[1, 3].map((portIndex) => {
				const p = intakeField.ports[portIndex];
				return {
					componentId: instance.componentId,
					instanceIndex: instance.solidIndex,
					portIndex,
					portCenterMm: add(p.centerMm, instance.translationMm),
					portAxis: point(p.axis),
					portRadiusMm: p.radiusMm
				};
			})
		)
		.find((p) => matches(p.portCenterMm));
	const exhaust = exhaustField.instances
		.flatMap((instance) =>
			instance.ports.slice(1).map((p, index) => ({
				componentId: instance.componentId,
				instanceIndex: instance.instanceIndex,
				portIndex: index + 1,
				portCenterMm: point(p.centerMm),
				portAxis: point(p.axis),
				portRadiusMm: p.radiusMm
			}))
		)
		.find((p) => matches(p.portCenterMm));
	const chamber = chamberDatums.cylinders.find((c) => c.pistonId === cylinder.pistonId);
	if (!intake || !exhaust || !chamber)
		throw new Error(`Incomplete gas connections for ${cylinder.pistonId}`);
	return {
		pistonId: cylinder.pistonId,
		bank,
		bankAxis: point(cylinder.bankAxis),
		nozzleMm: point(chamber.nozzleMm),
		intake: {
			...intake,
			paths: valvePaths(cylinder.pistonId, 'intake', intake.portCenterMm, intake.portAxis)
		},
		exhaust: {
			...exhaust,
			paths: valvePaths(cylinder.pistonId, 'exhaust', exhaust.portCenterMm, exhaust.portAxis)
		}
	};
});

/** All routes go from collector to the pipe mouth. Pipe arcs preserve their native handedness. */
export const V12_EXHAUST_DOWNSTREAM = downstreamDatums.routes.map((route) => {
	const start = point(route.collectorOutletMm);
	const end = point(route.pipeInletMm);
	// Preserve the downward collector tangent and axial turbine discharge tangent. The
	// scroll interior has no solved gas domain, so this short cubic is explicitly inferred.
	// Native wheel radius25mm and hub/land16mm inform an illustrative off-axis waypoint.
	// Use a narrow visual core here; neither scroll nor blade-channel flow is solved.
	const wheel = point(route.turbineWheelCenterMm);
	const annulus = add(wheel, [Math.sign(wheel[0]), 0, 0], 21);
	const turbinePathMm = [
		...cubic(start, add(start, [0, -1, 0], 52), add(annulus, route.turbineAxis, 12), annulus, 32),
		...cubic(
			annulus,
			add(annulus, route.turbineAxis, -12),
			add(end, route.turbineAxis, 12),
			end,
			24
		).slice(1)
	];
	return {
		...route,
		collectorOutletMm: start,
		turbineOutletMm: point(route.turbineOutletMm),
		pipeInletMm: end,
		pipePathMm: route.pipePathMm.map(point),
		turbinePathMm,
		pathMm: [...turbinePathMm, ...route.pipePathMm.slice(1).map(point)],
		scope: V12_GAS_CONNECTION_SCOPE
	};
});

export function v12GasConnection(pistonId: string): V12GasConnection {
	const connection = V12_GAS_CONNECTIONS.find((c) => c.pistonId === pistonId);
	if (!connection) throw new RangeError(`Unknown gas-path cylinder: ${pistonId}`);
	return connection;
}
