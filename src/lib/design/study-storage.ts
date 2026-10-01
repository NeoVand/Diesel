import {
	DESIGN_BOUNDS,
	evaluateDesign,
	paretoFront,
	verifyDesign,
	type DesignParams,
	type OptimizationResult
} from './design-core';
import {
	OPERATING_BOUNDS,
	cylinderPressureBar,
	solveRodDynamics,
	structuralLoadCase,
	validateOperatingScenario,
	type OperatingScenario
} from './operating-cycle';
import type { StructuralResult } from './structural';
import type { OperatingSearchResult } from './operating-search';
import type { GpuComputationReport } from './gpu-types';

export type StudyExperiment = {
	id: string;
	label: string;
	params: DesignParams;
	scenario: OperatingScenario;
	expectedCaseCount: number;
	results: { report: StructuralResult; scenario: OperatingScenario; angleDeg: number }[];
	error?: string;
};

/** A local study owns its inputs and immutable solver evidence, never credentials. */
export type StudySnapshot = {
	version: 1;
	params: DesignParams;
	baseline: DesignParams;
	scenario: OperatingScenario;
	phase: number;
	study: 'rod' | 'engine';
	tab: 'space' | 'operating' | 'motion' | 'measurements' | 'evidence';
	volumeLocked: boolean;
	lockedVolume: number;
	structural: StructuralResult | null;
	structuralContext: { scenario: OperatingScenario; angleDeg: number } | null;
	experiments: StudyExperiment[];
	operatingSearch: OperatingSearchResult | null;
	search: OptimizationResult | null;
};
export type SavedStudy = {
	id: string;
	name: string;
	savedAt: string;
	snapshot: StudySnapshot;
	digest: string;
};
export type StudySummary = Omit<SavedStudy, 'snapshot' | 'digest'> & {
	cases: number;
	massGrams: number;
};

const geometryKeys = ['rodLengthMm', 'rodWidthMm', 'rodDepthMm', 'webMm', 'flangeMm'] as const;
const inputKeys = Object.keys(DESIGN_BOUNDS) as (keyof DesignParams)[];
const scenarioKeys = Object.keys(OPERATING_BOUNDS) as (keyof typeof OPERATING_BOUNDS)[];
const hashPattern = /^[a-f0-9]{64}$/;
function fail(message: string): never {
	throw new Error(`The saved study is invalid: ${message}.`);
}
function object(value: unknown, name: string): asserts value is Record<string, unknown> {
	if (
		!value ||
		typeof value !== 'object' ||
		Array.isArray(value) ||
		![Object.prototype, null].includes(Object.getPrototypeOf(value))
	)
		fail(name);
}
function fields(value: object, allowed: readonly string[], name: string) {
	if (Object.keys(value).some((key) => !allowed.includes(key))) fail(`${name} fields`);
}
function number(
	value: unknown,
	name: string,
	min = 0,
	max = Number.MAX_VALUE
): asserts value is number {
	if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max)
		fail(name);
}
function integer(value: unknown, name: string, min = 0, max = 1_000_000) {
	number(value, name, min, max);
	if (!Number.isInteger(value)) fail(name);
}
function text(value: unknown, name: string, max = 2000): asserts value is string {
	if (typeof value !== 'string' || !value.trim() || value.length > max) fail(name);
}
function strings(value: unknown, name: string) {
	if (!Array.isArray(value) || value.length > 100) fail(name);
	for (const item of value) text(item, name);
}
function vector(value: unknown, name: string) {
	if (!Array.isArray(value) || value.length !== 3) fail(name);
	for (const item of value) number(item, name, -1e12, 1e12);
}
function same(a: unknown, b: unknown): boolean {
	if (typeof a === 'number' && typeof b === 'number')
		return Number.isFinite(a) && Math.abs(a - b) <= 1e-10 + Math.abs(b) * 1e-9;
	if (a === b) return true;
	if (
		!a ||
		!b ||
		typeof a !== 'object' ||
		typeof b !== 'object' ||
		Array.isArray(a) !== Array.isArray(b)
	)
		return false;
	const keys = Object.keys(b);
	return (
		keys.length === Object.keys(a).length &&
		keys.every(
			(key) =>
				Object.hasOwn(a, key) &&
				same((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])
		)
	);
}
function selectedEqual(
	a: Record<string, unknown>,
	b: Record<string, unknown>,
	keys: readonly string[]
) {
	return keys.every((key) => same(a[key], b[key]));
}
function params(value: unknown): asserts value is DesignParams {
	object(value, 'design parameters');
	if (Object.keys(value).length !== inputKeys.length) fail('design parameter fields');
	evaluateDesign(value as unknown as DesignParams);
}
function scenario(value: unknown): asserts value is OperatingScenario {
	object(value, 'operating conditions');
	if (
		Object.keys(value).some((key) => key !== 'label' && !Object.hasOwn(OPERATING_BOUNDS, key)) ||
		validateOperatingScenario(value as unknown as OperatingScenario).length
	)
		fail('operating conditions');
	if (value.label !== undefined) text(value.label, 'scenario label', 160);
}
function stats(value: unknown): asserts value is StructuralResult['stats'] {
	object(value, 'mesh statistics');
	for (const key of ['meshSizeMm', 'volumeMm3']) number(value[key], key, Number.MIN_VALUE);
	for (const key of [
		'volumeRelativeError',
		'maxDisplacementMm',
		'strainEnergyNmm',
		'p95VonMisesMpa',
		'p99VonMisesMpa',
		'interiorP95VonMisesMpa',
		'interiorP99VonMisesMpa',
		'rawMaxElementVonMisesMpa',
		'interiorExclusionMm',
		'forceBalanceRelative',
		'momentBalanceRelative',
		'solveResidualRelative',
		'durationSeconds'
	])
		number(value[key], key);
	integer(value.nodes, 'mesh nodes', 4, 45_000);
	integer(value.elements, 'mesh elements', 1, 160_000);
	integer(value.dofs, 'mesh degrees of freedom', 12, 135_000);
	if (value.dofs !== (value.nodes as number) * 3)
		fail('mesh degrees of freedom do not match nodes');
	integer(value.interiorElementCount, 'interior elements', 1, value.elements as number);
	integer(value.solveIterations, 'solver iterations');
	for (const key of ['loadedMeanDisplacementMm', 'appliedN', 'reactionN']) vector(value[key], key);
	for (const key of ['appliedMomentNmm', 'reactionMomentNmm', 'bodyForceN'])
		if (value[key] !== undefined) vector(value[key], key);
	for (const [a, b] of [
		['p95VonMisesMpa', 'p99VonMisesMpa'],
		['p99VonMisesMpa', 'rawMaxElementVonMisesMpa'],
		['interiorP95VonMisesMpa', 'interiorP99VonMisesMpa'],
		['interiorP99VonMisesMpa', 'rawMaxElementVonMisesMpa']
	])
		if ((value[a] as number) > (value[b] as number) + 1e-8) fail('stress percentile ordering');
}
function native(
	value: unknown,
	design: DesignParams,
	budget: { values: number }
): asserts value is StructuralResult {
	object(value, 'native analysis');
	const result = value as unknown as StructuralResult;
	fields(
		result,
		[
			'schemaVersion',
			'analysisHash',
			'parameterHash',
			'geometryParams',
			'loadCase',
			'material',
			'method',
			'surface',
			'stats',
			'convergence',
			'assumptions',
			'limitations',
			'runtime'
		],
		'native analysis'
	);
	if (
		result.schemaVersion !== 'rod-solid-fea-v1' ||
		!hashPattern.test(result.analysisHash) ||
		!hashPattern.test(result.parameterHash)
	)
		fail('native result identity');
	object(result.geometryParams, 'native geometry');
	if (
		Object.keys(result.geometryParams).length !== geometryKeys.length ||
		!selectedEqual(
			result.geometryParams,
			design as unknown as Record<string, unknown>,
			geometryKeys
		)
	)
		fail('native result belongs to another geometry');
	object(result.loadCase, 'load case');
	fields(result.loadCase, ['forceN', 'label', 'fixture', 'inertia'], 'load case');
	if (result.loadCase.fixture !== 'fixed-big-bore-distributed-small-bore') fail('native fixture');
	text(result.loadCase.label, 'load case label', 160);
	vector(result.loadCase.forceN, 'bearing force');
	if (result.loadCase.inertia !== undefined) {
		object(result.loadCase.inertia, 'inertia field');
		fields(
			result.loadCase.inertia,
			['originAccelerationMps2', 'angularVelocityRadS', 'angularAccelerationRadS2'],
			'inertia'
		);
		for (const key of [
			'originAccelerationMps2',
			'angularVelocityRadS',
			'angularAccelerationRadS2'
		] as const)
			vector(result.loadCase.inertia[key], key);
	}
	object(result.material, 'material');
	fields(
		result.material,
		['youngsModulusMpa', 'poissonRatio', 'densityKgM3', 'provenance'],
		'material'
	);
	if (
		result.material.youngsModulusMpa !== 210000 ||
		result.material.poissonRatio !== 0.3 ||
		result.material.densityKgM3 !== 7850
	)
		fail('unsupported solver material');
	text(result.material.provenance, 'material provenance');
	text(result.method, 'solver method');
	strings(result.assumptions, 'analysis assumptions');
	strings(result.limitations, 'analysis limitations');
	object(result.runtime, 'solver runtime');
	fields(result.runtime, ['solver', 'mesher', 'durationSeconds'], 'runtime');
	text(result.runtime.solver, 'solver runtime');
	text(result.runtime.mesher, 'mesher runtime');
	number(result.runtime.durationSeconds, 'runtime duration');
	stats(result.stats);
	object(result.surface, 'native surface');
	const surface = result.surface;
	fields(
		surface,
		['positionsMm', 'triangles', 'displacementMm', 'vonMisesMpa', 'fixtureNodes', 'loadedNodes'],
		'surface'
	);
	for (const key of [
		'positionsMm',
		'displacementMm',
		'vonMisesMpa',
		'triangles',
		'fixtureNodes',
		'loadedNodes'
	] as const) {
		if (!Array.isArray(surface[key])) fail(`surface ${key}`);
		budget.values += surface[key].length;
		if (budget.values > 8_000_000) fail('study exceeds the supported field size');
	}
	const count = surface.positionsMm.length / 3;
	if (
		!Number.isInteger(count) ||
		count < 4 ||
		count > result.stats.nodes ||
		surface.displacementMm.length !== count * 3 ||
		surface.vonMisesMpa.length !== count ||
		!surface.triangles.length ||
		surface.triangles.length % 3 ||
		surface.triangles.length > result.stats.elements * 12
	)
		fail('native field dimensions');
	const low = [Infinity, Infinity, Infinity],
		high = [-Infinity, -Infinity, -Infinity];
	for (let i = 0; i < count; i++) {
		let displacementSquared = 0;
		for (let axis = 0; axis < 3; axis++) {
			const coordinate = surface.positionsMm[3 * i + axis],
				displacement = surface.displacementMm[3 * i + axis];
			number(coordinate, 'surface coordinate', -1000, 1000);
			number(displacement, 'surface displacement', -1e6, 1e6);
			low[axis] = Math.min(low[axis], coordinate);
			high[axis] = Math.max(high[axis], coordinate);
			displacementSquared += displacement * displacement;
		}
		number(surface.vonMisesMpa[i], 'recovered surface stress');
		if (
			Math.sqrt(displacementSquared) > result.stats.maxDisplacementMm * (1 + 1e-8) + 1e-10 ||
			surface.vonMisesMpa[i] > result.stats.rawMaxElementVonMisesMpa * (1 + 1e-8) + 1e-8
		)
			fail('surface field exceeds native extrema');
	}
	const expectedLow = [-32, -32, -design.rodDepthMm / 2],
		expectedHigh = [32, design.rodLengthMm + 15, design.rodDepthMm / 2];
	if (
		low.some((v, i) => Math.abs(v - expectedLow[i]) > 0.25) ||
		high.some((v, i) => Math.abs(v - expectedHigh[i]) > 0.25)
	)
		fail('surface bounds do not match native geometry');
	for (const key of ['triangles', 'fixtureNodes', 'loadedNodes'] as const) {
		if (!surface[key].length) fail(`missing ${key}`);
		for (const node of surface[key]) integer(node, 'surface node reference', 0, count - 1);
	}
	for (let i = 0; i < surface.triangles.length; i += 3)
		if (new Set(surface.triangles.slice(i, i + 3)).size !== 3) fail('collapsed surface triangle');
	object(result.convergence, 'mesh refinement');
	const refinement = result.convergence;
	fields(
		refinement,
		[
			'performed',
			'meshes',
			'displacementRelativeChange',
			'strainEnergyRelativeChange',
			'interiorP95RelativeChange',
			'withinScreeningTolerance',
			'note'
		],
		'refinement'
	);
	if (
		!Array.isArray(refinement.meshes) ||
		![1, 2, 3].includes(refinement.meshes.length) ||
		refinement.performed !== refinement.meshes.length > 1
	)
		fail('mesh refinement history');
	refinement.meshes.forEach(stats);
	if (!same(result.stats, refinement.meshes.at(-1)))
		fail('surface and refinement statistics refer to different meshes');
	const changes = [
		['maxDisplacementMm', 'displacementRelativeChange'],
		['strainEnergyNmm', 'strainEnergyRelativeChange'],
		['interiorP95VonMisesMpa', 'interiorP95RelativeChange']
	] as const;
	for (const [metric, field] of changes) {
		const previous = refinement.meshes.at(-2);
		const expected = previous
			? Math.abs(result.stats[metric] - previous[metric]) /
				Math.max(Math.abs(result.stats[metric]), 1e-12)
			: null;
		if (!same(refinement[field], expected)) fail('mesh refinement change');
	}
	const passed = refinement.performed
		? refinement.displacementRelativeChange! < 0.08 && refinement.strainEnergyRelativeChange! < 0.08
		: null;
	if (refinement.withinScreeningTolerance !== passed) fail('mesh refinement status');
	text(refinement.note, 'refinement note');
}
function caseContext(report: StructuralResult, design: DesignParams, context: unknown) {
	object(context, 'result operating context');
	scenario(context.scenario);
	number(context.angleDeg, 'load case angle', 0, 720);
	const s = context.scenario,
		angle = context.angleDeg;
	const expected = structuralLoadCase(
		solveRodDynamics(
			design,
			angle,
			s.rpm,
			s.pistonMassKg,
			cylinderPressureBar(design, s, angle),
			s.crankcasePressureBar
		)
	);
	if (
		!same(report.loadCase.forceN, expected.forceN) ||
		!same(report.loadCase.inertia, expected.inertia)
	)
		fail('native load does not match the stored operating condition and phase');
}
function beamSearch(value: unknown, current: DesignParams) {
	object(value, 'beam search');
	const result = value as unknown as OptimizationResult;
	if (
		!Array.isArray(result.candidates) ||
		result.candidates.length > 2000 ||
		!result.candidates.length ||
		!Array.isArray(result.pareto)
	)
		fail('beam search candidates');
	for (const candidate of result.candidates) {
		object(candidate, 'beam candidate');
		text(candidate.id, 'candidate id', 160);
		params(candidate.params);
		if (
			!selectedEqual(
				candidate.params as unknown as Record<string, unknown>,
				current as unknown as Record<string, unknown>,
				['rodLengthMm', 'loadKn', 'lateralLoadN']
			) ||
			!same(candidate.rod, evaluateDesign(candidate.params).rod)
		)
			fail('stale or inconsistent beam candidate');
	}
	if (
		!same(result.baseline, result.candidates[0]) ||
		!same(result.pareto, paretoFront(result.candidates)) ||
		!same(result.best, result.pareto[0] ?? null) ||
		result.evaluated !== result.candidates.length ||
		result.feasibleCount !== result.candidates.filter((c) => c.rod.feasible).length
	)
		fail('beam search summary');
	if (!same(result.verification, result.best ? verifyDesign(result.best.params) : null))
		fail('beam verification');
	number(result.durationMs, 'search duration');
	text(result.scope, 'beam search scope');
}
function operatingSearch(value: unknown, current: DesignParams) {
	object(value, 'operating search');
	const result = value as unknown as OperatingSearchResult;
	fields(
		result,
		[
			'schemaVersion',
			'baseline',
			'scenarios',
			'candidates',
			'finalists',
			'best',
			'evaluated',
			'coarsePassCount',
			'refinedCount',
			'cancelled',
			'massReductionPercent',
			'method',
			'limitations',
			'computation'
		],
		'operating search'
	);
	if (
		result.schemaVersion !== 'operating-design-search-v1' ||
		!Array.isArray(result.scenarios) ||
		!result.scenarios.length ||
		result.scenarios.length > 12 ||
		!Array.isArray(result.candidates) ||
		result.candidates.length > 501 ||
		!Array.isArray(result.finalists) ||
		result.finalists.length > 3 ||
		typeof result.cancelled !== 'boolean'
	)
		fail('operating search format');
	result.scenarios.forEach(scenario);
	const summaries = [
		result.baseline,
		...result.candidates,
		...result.finalists,
		...(result.best ? [result.best] : [])
	];
	for (const candidate of summaries) {
		object(candidate, 'operating candidate');
		params(candidate.params);
		text(candidate.id, 'operating candidate id', 160);
		if (
			!selectedEqual(
				candidate.params as unknown as Record<string, unknown>,
				current as unknown as Record<string, unknown>,
				['boreMm', 'strokeMm', 'rodLengthMm']
			)
		)
			fail('operating candidate uses another mechanism');
		for (const key of [
			'massKg',
			'peakNominalStressMpa',
			'utilization',
			'maxCompressionN',
			'maxTensionN'
		] as const)
			number(candidate[key], `operating ${key}`);
		if (
			!same(candidate.massKg, evaluateDesign(candidate.params).rod.massKg) ||
			!same(candidate.utilization, candidate.peakNominalStressMpa / 250) ||
			candidate.passesNominalScreen !== candidate.peakNominalStressMpa <= 250
		)
			fail('operating candidate summary');
		integer(candidate.criticalScenarioIndex, 'critical scenario', 0, result.scenarios.length - 1);
		number(candidate.criticalAngleDeg, 'critical angle', 0, 720);
		number(candidate.criticalSectionMm, 'critical section', 0, candidate.params.rodLengthMm);
		integer(candidate.angularSamples, 'angular samples', 73, 2881);
	}
	if (
		result.evaluated !== result.candidates.length ||
		result.coarsePassCount !== result.candidates.filter((c) => c.passesNominalScreen).length ||
		!same(result.best, result.cancelled ? null : (result.finalists[0] ?? null)) ||
		!same(
			result.massReductionPercent,
			result.best ? (1 - result.best.massKg / result.baseline.massKg) * 100 : null
		)
	)
		fail('operating search summary');
	integer(result.refinedCount, 'refined count', result.finalists.length, result.candidates.length);
	for (const finalist of result.finalists)
		if (
			!result.candidates.some((c) => c.id === finalist.id && same(c.params, finalist.params)) ||
			!finalist.passesNominalScreen
		)
			fail('untraceable operating finalist');
	text(result.method, 'operating method');
	strings(result.limitations, 'operating limitations');
	if (result.computation !== undefined) computation(result.computation, result);
}

/** Runtime provenance is validated and retained, including a recorded fallback reason. */
function computation(
	value: unknown,
	result: OperatingSearchResult
): asserts value is GpuComputationReport {
	object(value, 'compute provenance');
	fields(
		value,
		[
			'backend',
			'library',
			'precision',
			'device',
			'requested',
			'totalMs',
			'batchMs',
			'geometryPreparationMs',
			'verificationMs',
			'validatedDesigns',
			'maxRelativeError',
			'relativeTolerance',
			'guardedThresholdDesigns',
			'coarseDesigns',
			'coarsePhasesPerCondition',
			'sectionEvaluations',
			'fallbackReason',
			'note'
		],
		'compute provenance'
	);
	if (!['auto', 'webgpu', 'cpu'].includes(value.requested as string))
		fail('requested compute backend');
	text(value.device, 'compute device', 512);
	text(value.note, 'compute note');
	if (value.fallbackReason !== undefined) text(value.fallbackReason, 'compute fallback reason');
	for (const key of ['totalMs', 'batchMs', 'geometryPreparationMs', 'verificationMs'])
		number(value[key], key, 0, 86_400_000);
	for (const key of ['validatedDesigns', 'guardedThresholdDesigns', 'coarseDesigns'])
		integer(value[key], key, 0, result.evaluated);
	if (
		value.coarseDesigns !== result.evaluated ||
		value.coarsePhasesPerCondition !== 121 ||
		value.sectionEvaluations !== result.evaluated * result.scenarios.length * 121 * 17
	)
		fail('compute workload');
	number(value.maxRelativeError, 'compute relative error');
	number(value.relativeTolerance, 'compute error tolerance');
	if (value.backend === 'webgpu') {
		if (
			value.library !== 'JAX-JS' ||
			value.precision !== 'float32 + Float64 verification' ||
			value.requested === 'cpu' ||
			value.relativeTolerance !== 3e-4 ||
			(value.maxRelativeError as number) > 3e-4 ||
			(value.validatedDesigns as number) < Math.min(5, result.evaluated) ||
			(value.guardedThresholdDesigns as number) > (value.validatedDesigns as number) ||
			value.fallbackReason !== undefined
		)
			fail('WebGPU provenance');
	} else if (value.backend === 'cpu') {
		if (
			value.library !== 'JavaScript' ||
			value.precision !== 'Float64' ||
			value.relativeTolerance !== 0 ||
			value.maxRelativeError !== 0 ||
			value.validatedDesigns !== result.evaluated ||
			value.guardedThresholdDesigns !== 0
		)
			fail('CPU provenance');
	} else fail('compute backend');
}

/** Validate stored data as untrusted input; all native arrays remain intact and unmodified. */
export function validateSnapshot(value: unknown): asserts value is StudySnapshot {
	object(value, 'snapshot');
	const keys = [
		'version',
		'params',
		'baseline',
		'scenario',
		'phase',
		'study',
		'tab',
		'volumeLocked',
		'lockedVolume',
		'structural',
		'structuralContext',
		'experiments',
		'operatingSearch',
		'search'
	];
	if (Object.keys(value).length !== keys.length || keys.some((key) => !Object.hasOwn(value, key)))
		fail('snapshot fields');
	const data = value as unknown as StudySnapshot;
	if (
		data.version !== 1 ||
		!['rod', 'engine'].includes(data.study) ||
		!['space', 'operating', 'motion', 'measurements', 'evidence'].includes(data.tab) ||
		typeof data.volumeLocked !== 'boolean'
	)
		fail('unsupported study format');
	params(data.params);
	params(data.baseline);
	scenario(data.scenario);
	number(data.phase, 'phase', 0, 720);
	number(data.lockedVolume, 'locked volume', Number.MIN_VALUE, 1000);
	if (data.scenario.rpm !== data.params.rpm)
		fail('active speed does not match the operating conditions');
	if (!Array.isArray(data.experiments) || data.experiments.length > 12) fail('experiments');
	const budget = { values: 0 };
	if (data.structural !== null) {
		native(data.structural, data.params, budget);
		caseContext(data.structural, data.params, data.structuralContext);
		if (
			!selectedEqual(
				data.structuralContext!.scenario as unknown as Record<string, unknown>,
				data.scenario as unknown as Record<string, unknown>,
				scenarioKeys
			)
		)
			fail('native result belongs to an outdated operating condition');
	} else if (data.structuralContext !== null) fail('orphaned native result context');
	const ids = new Set<string>();
	for (const experiment of data.experiments) {
		object(experiment, 'experiment');
		text(experiment.id, 'experiment id', 160);
		text(experiment.label, 'experiment label', 160);
		params(experiment.params);
		scenario(experiment.scenario);
		integer(experiment.expectedCaseCount, 'expected cases', 1, 12);
		if (ids.has(experiment.id)) fail('duplicate experiment identity');
		ids.add(experiment.id);
		if (
			!Array.isArray(experiment.results) ||
			experiment.results.length > experiment.expectedCaseCount
		)
			fail('experiment result count');
		if (experiment.error !== undefined) text(experiment.error, 'experiment error');
		for (const solved of experiment.results) {
			object(solved, 'experiment result');
			native(solved.report, experiment.params, budget);
			caseContext(solved.report, experiment.params, solved);
		}
	}
	if (data.operatingSearch !== null) operatingSearch(data.operatingSearch, data.params);
	if (data.search !== null) beamSearch(data.search, data.params);
}

async function digest(value: unknown): Promise<string> {
	const bytes = new TextEncoder().encode(JSON.stringify(value));
	return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
		.map((v) => v.toString(16).padStart(2, '0'))
		.join('');
}

/** Result identifiers encode solver inputs, not proof of the physical validity of a result. */
async function validateResultIdentities(snapshot: StudySnapshot) {
	const reports = [
		...(snapshot.structural ? [snapshot.structural] : []),
		...snapshot.experiments.flatMap((e) => e.results.map((s) => s.report))
	];
	await Promise.all(
		reports.map(async (report) => {
			const geometry = Object.fromEntries(
				geometryKeys.map((key) => [key, report.geometryParams[key]])
			);
			const parameterHash = await digest({ schema: 'rod-solid-v1', ...geometry });
			const analysisHash = await digest({
				schema: 'rod-solid-fea-v1',
				geometry: parameterHash,
				forceN: report.loadCase.forceN,
				inertia: report.loadCase.inertia ?? null,
				refinementLevel: report.convergence.meshes.length
			});
			if (report.parameterHash !== parameterHash || report.analysisHash !== analysisHash)
				fail('native result identity does not match its inputs');
		})
	);
}

/** Clone before the first await so subsequent edits cannot change the record being saved. */
export async function createSavedStudy(name: string, snapshot: StudySnapshot): Promise<SavedStudy> {
	const copy = structuredClone(snapshot);
	validateSnapshot(copy);
	await validateResultIdentities(copy);
	const trimmed = name.trim().slice(0, 80);
	if (!trimmed) throw new Error('Enter a study name.');
	return {
		id: crypto.randomUUID(),
		name: trimmed,
		savedAt: new Date().toISOString(),
		snapshot: copy,
		digest: await digest(copy)
	};
}

export async function validateSavedStudy(value: unknown): Promise<void> {
	object(value, 'study record');
	fields(value, ['id', 'name', 'savedAt', 'snapshot', 'digest'], 'study record');
	text(value.id, 'study id', 80);
	text(value.name, 'study name', 80);
	text(value.savedAt, 'save timestamp', 40);
	if (
		!Number.isFinite(Date.parse(value.savedAt)) ||
		new Date(value.savedAt).toISOString() !== value.savedAt ||
		!hashPattern.test(value.digest as string)
	)
		fail('saved record metadata');
	validateSnapshot(value.snapshot);
	await validateResultIdentities(value.snapshot);
	if (value.digest !== (await digest(value.snapshot)))
		fail('stored content checksum does not match');
}

function database(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open('engine-lab-studies', 1);
		request.onupgradeneeded = () => request.result.createObjectStore('studies', { keyPath: 'id' });
		request.onsuccess = () => resolve(request.result);
		request.onerror = () =>
			reject(new Error('Local study storage is unavailable. Export a case to keep a copy.'));
	});
}

async function transact<T>(
	mode: IDBTransactionMode,
	action: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
	const db = await database();
	return new Promise((resolve, reject) => {
		const transaction = db.transaction('studies', mode);
		let request: IDBRequest<T>;
		try {
			request = action(transaction.objectStore('studies'));
		} catch {
			db.close();
			reject(new Error('Local study storage is unavailable. Export a case to keep a copy.'));
			return;
		}
		transaction.oncomplete = () => {
			db.close();
			resolve(request.result);
		};
		transaction.onabort = transaction.onerror = () => {
			db.close();
			reject(new Error('The study could not be stored. Export a case to keep a copy.'));
		};
	});
}

export async function listStudies(): Promise<StudySummary[]> {
	const studies = await transact<SavedStudy[]>('readonly', (store) => store.getAll());
	const summaries = await Promise.all(
		studies.map(async (entry) => {
			try {
				await validateSavedStudy(entry);
				return {
					id: entry.id,
					name: entry.name,
					savedAt: entry.savedAt,
					cases:
						entry.snapshot.experiments.reduce((n, e) => n + e.results.length, 0) ||
						Number(!!entry.snapshot.structural),
					massGrams: evaluateDesign(entry.snapshot.params).rod.massKg * 1000
				};
			} catch {
				return null;
			}
		})
	);
	return summaries
		.filter((entry): entry is StudySummary => entry !== null)
		.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

export async function saveStudy(name: string, snapshot: StudySnapshot): Promise<string> {
	const record = await createSavedStudy(name, snapshot);
	await transact('readwrite', (store) => store.put(record));
	return record.id;
}

export async function loadStudy(id: string): Promise<SavedStudy> {
	const study = await transact<SavedStudy | undefined>('readonly', (store) => store.get(id));
	if (!study) throw new Error('This saved study could not be found.');
	await validateSavedStudy(study);
	if (study.id !== id) fail('stored study identity');
	return study;
}
