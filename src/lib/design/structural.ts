import type { DesignParams } from './design-core';

export type RodGeometryParams = Pick<
	DesignParams,
	'rodLengthMm' | 'rodWidthMm' | 'rodDepthMm' | 'webMm' | 'flangeMm'
>;
export type Vector3Tuple = [number, number, number];
export interface StructuralInertia {
	/** At the big-eye centre; vectors resolved in the instantaneous rod-local frame. */
	originAccelerationMps2: Vector3Tuple;
	angularVelocityRadS: Vector3Tuple;
	angularAccelerationRadS2: Vector3Tuple;
}

export interface StructuralRequest {
	params: DesignParams;
	/** Rod-local coordinates: Y big eye→small eye, Z along the bearing axes. */
	loadCase?: { forceN: Vector3Tuple; label?: string; inertia?: StructuralInertia };
	/** Solve a second finer mesh and return its field plus comparison statistics. */
	refine?: boolean;
	/** Number of successively finer meshes; overrides refine when supplied. */
	refinementLevel?: 1 | 2 | 3;
}

export interface StructuralMeshStats {
	meshSizeMm: number;
	nodes: number;
	elements: number;
	dofs: number;
	volumeMm3: number;
	volumeRelativeError: number;
	maxDisplacementMm: number;
	loadedMeanDisplacementMm: Vector3Tuple;
	strainEnergyNmm: number;
	/** Volume-weighted element stresses; deliberately separate from recovered display fields. */
	p95VonMisesMpa: number;
	p99VonMisesMpa: number;
	interiorP95VonMisesMpa: number;
	interiorP99VonMisesMpa: number;
	/** Diagnostic only: sharp fixture/shoulder corners may be singular. */
	rawMaxElementVonMisesMpa: number;
	interiorElementCount: number;
	interiorExclusionMm: number;
	appliedN: Vector3Tuple;
	reactionN: Vector3Tuple;
	appliedMomentNmm?: Vector3Tuple;
	reactionMomentNmm?: Vector3Tuple;
	bodyForceN?: Vector3Tuple;
	forceBalanceRelative: number;
	momentBalanceRelative: number;
	solveResidualRelative: number;
	solveIterations: number;
	durationSeconds: number;
}

export interface StructuralResult {
	schemaVersion: 'rod-solid-fea-v1';
	analysisHash: string;
	parameterHash: string;
	geometryParams: RodGeometryParams;
	loadCase: {
		forceN: Vector3Tuple;
		label: string;
		fixture: 'fixed-big-bore-distributed-small-bore';
		inertia?: StructuralInertia;
	};
	material: {
		youngsModulusMpa: number;
		poissonRatio: number;
		densityKgM3: number;
		provenance: string;
	};
	method: string;
	surface: {
		/** Flat XYZ, millimetres; triangles reference this surface-only vertex list. */
		positionsMm: number[];
		triangles: number[];
		displacementMm: number[];
		/** Volume-weighted adjacent-element tensor recovery, then von Mises. Display only. */
		vonMisesMpa: number[];
		fixtureNodes: number[];
		loadedNodes: number[];
	};
	stats: StructuralMeshStats;
	convergence: {
		performed: boolean;
		meshes: StructuralMeshStats[];
		displacementRelativeChange: number | null;
		strainEnergyRelativeChange: number | null;
		interiorP95RelativeChange: number | null;
		/** A screening tolerance on integral responses, not proof of stress convergence. */
		withinScreeningTolerance: boolean | null;
		note: string;
	};
	assumptions: string[];
	limitations: string[];
	runtime: { solver: string; mesher: string; durationSeconds: number };
}
