import type { DesignParams } from './design-core';
import type { OperatingScenario } from './operating-cycle';
import type { OperatingDesignSummary } from './operating-search';
import type { StructuralMeshStats, StructuralResult } from './structural';

export type DesignAssistantMeshSummary = Pick<
	StructuralMeshStats,
	| 'meshSizeMm'
	| 'nodes'
	| 'elements'
	| 'maxDisplacementMm'
	| 'strainEnergyNmm'
	| 'p95VonMisesMpa'
	| 'p99VonMisesMpa'
	| 'interiorP95VonMisesMpa'
	| 'rawMaxElementVonMisesMpa'
	| 'forceBalanceRelative'
	| 'momentBalanceRelative'
	| 'solveResidualRelative'
>;

export type DesignAssistantNativeSummary = Pick<
	StructuralResult,
	'analysisHash' | 'parameterHash' | 'geometryParams' | 'loadCase'
> & {
	/** The condition actually solved; may differ intentionally from the selected cycle. */
	operatingScenario?: OperatingScenario;
	angleDeg?: number;
	stats: DesignAssistantMeshSummary;
	convergence: Pick<
		StructuralResult['convergence'],
		| 'performed'
		| 'displacementRelativeChange'
		| 'strainEnergyRelativeChange'
		| 'interiorP95RelativeChange'
		| 'withinScreeningTolerance'
	> & { meshes: DesignAssistantMeshSummary[] };
};

export interface DesignAssistantEvidence {
	params: DesignParams;
	scenario?: OperatingScenario;
	angleDeg?: number;
	search?: {
		/** All explicit conditions used for the search envelope, not just the selected cycle. */
		scenarios: OperatingScenario[];
		evaluated: number;
		coarsePassCount: number;
		refinedCount: number;
		massReductionPercent: number | null;
		baseline: OperatingDesignSummary;
		best: OperatingDesignSummary | null;
	};
	/** Summaries only, at most six cases. Never send surface or volume meshes. */
	native?: DesignAssistantNativeSummary[];
}

export interface DesignAssistantRequest {
	question: string;
	evidence: DesignAssistantEvidence;
}

export interface DesignAssistantReply {
	text: string;
	provider: 'OpenAI';
	model: string;
}
