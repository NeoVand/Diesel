import datums from './v12-fuel-connection-datums.json';
import type { Point3 } from './v12-kinematics';

export type V12FuelBank = 'negativeX' | 'positiveX';
export interface V12FuelRail {
	id: string;
	bank: V12FuelBank;
	sourceComponentId: string;
	/** Ordered from the measured open fitting into the rail. Pump/tank are outside this model. */
	pointsMm: readonly Point3[];
	supplyMm: Point3;
	galleryRadiusMm: number;
	inletRadiusMm: number;
	pistonIds: readonly string[];
	evidence: 'native-corridor';
}
export interface V12FuelConnection {
	id: string;
	bank: V12FuelBank;
	pistonId: string;
	railId: string;
	sourceInjectorId: string;
	/** Rail branch → native curved feed tube → injector bore → recovered nozzle tip. */
	pointsMm: readonly Point3[];
	railJunctionMm: Point3;
	injectorInletMm: Point3;
	nozzleMm: Point3;
	sourceFaces: { feedSweep: number; upperBore: number; nozzleBore: number };
	verifiedEmptySamples: number;
	evidence: 'native-corridor';
}

const point = (p: readonly number[]): Point3 => [p[0], p[1], p[2]];
export const V12_FUEL_CONNECTION_DATUMS = datums;
export const V12_FUEL_SUPPLY_SCOPE = Object.freeze({
	label: 'Fuel supply at rail fitting',
	geometry:
		'Native rail galleries, curved feed bores and injector bores connect to all 12 nozzle tips.',
	boundary: 'Tank, filter, pump and pressure regulation are outside the supplied model.',
	motion:
		'Tracer direction illustrates supply to injection; speed and pulse timing are not a fuel-pressure simulation.',
	upstreamEquipmentModeled: false,
	pressureSolved: false
});

/** One shared trunk per bank avoids stacking six copies of the rail animation. */
export const V12_FUEL_RAILS: readonly V12FuelRail[] = datums.rails.map((rail) => {
	const branches = datums.connections
		.filter((c) => c.bank === rail.bank)
		.sort((a, b) => (a.railJunctionMm[2] - b.railJunctionMm[2]) * rail.supplyDirection[2]);
	return {
		id: `fuel-rail-${rail.bank}`,
		bank: rail.bank as V12FuelBank,
		sourceComponentId: rail.componentId,
		pointsMm: [
			point(rail.inletMm),
			point(rail.galleryStartMm),
			...branches.map((c) => point(c.railJunctionMm))
		],
		supplyMm: point(rail.inletMm),
		galleryRadiusMm: rail.galleryRadiusMm,
		inletRadiusMm: rail.inletRadiusMm,
		pistonIds: branches.map((c) => c.pistonId),
		evidence: 'native-corridor'
	};
});

export const V12_FUEL_CONNECTIONS: readonly V12FuelConnection[] = datums.connections.map(
	(connection) => ({
		id: `fuel-feed-${connection.pistonId}`,
		bank: connection.bank as V12FuelBank,
		pistonId: connection.pistonId,
		railId: `fuel-rail-${connection.bank}`,
		sourceInjectorId: connection.sourceInjectorId,
		// The extracted complete route begins inlet, gallery start, branch junction.
		// The first two belong to the shared rail and are not duplicated here.
		pointsMm: connection.pointsMm.slice(2).map(point),
		railJunctionMm: point(connection.railJunctionMm),
		injectorInletMm: point(connection.injectorInletMm),
		nozzleMm: point(connection.nozzleMm),
		sourceFaces: {
			feedSweep: connection.feedSweepFace,
			upperBore: connection.upperBoreFace,
			nozzleBore: connection.nozzleFace
		},
		verifiedEmptySamples: connection.verifiedEmptySamples,
		evidence: 'native-corridor'
	})
);
