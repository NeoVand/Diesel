import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { BASELINE_DESIGN, evaluateDesign, searchRodDesigns } from './design-core';
import {
	DEFAULT_OPERATING_SCENARIO,
	cylinderPressureBar,
	solveRodDynamics,
	structuralLoadCase,
	type OperatingScenario
} from './operating-cycle';
import {
	createSavedStudy,
	validateSavedStudy,
	validateSnapshot,
	type StudySnapshot
} from './study-storage';
import type { StructuralResult } from './structural';

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const base = () => ({ ...BASELINE_DESIGN });
function snapshot(): StudySnapshot {
	return {
		version: 1,
		params: base(),
		baseline: base(),
		scenario: { ...DEFAULT_OPERATING_SCENARIO },
		phase: 35,
		study: 'rod',
		tab: 'operating',
		volumeLocked: false,
		lockedVolume: evaluateDesign(base()).kinematics.displacementLiters,
		structural: null,
		structuralContext: null,
		experiments: [],
		operatingSearch: null,
		search: null
	};
}
/** Small synthetic field container for persistence checks; it is not a solved rod mesh. */
function report(
	p = base(),
	s: OperatingScenario = { ...DEFAULT_OPERATING_SCENARIO },
	angle = 4
): StructuralResult {
	const geometryParams = {
		rodLengthMm: p.rodLengthMm,
		rodWidthMm: p.rodWidthMm,
		rodDepthMm: p.rodDepthMm,
		webMm: p.webMm,
		flangeMm: p.flangeMm
	};
	const loadCase = {
		...structuralLoadCase(
			solveRodDynamics(
				p,
				angle,
				s.rpm,
				s.pistonMassKg,
				cylinderPressureBar(p, s, angle),
				s.crankcasePressureBar
			)
		),
		fixture: 'fixed-big-bore-distributed-small-bore' as const,
		label: 'Synthetic operating load'
	};
	const parameterHash = hash({ schema: 'rod-solid-v1', ...geometryParams });
	const stats = {
		meshSizeMm: 3,
		nodes: 8,
		elements: 6,
		dofs: 24,
		volumeMm3: 40000,
		volumeRelativeError: 0.001,
		maxDisplacementMm: 0.01,
		loadedMeanDisplacementMm: [0, -0.001, 0] as [number, number, number],
		strainEnergyNmm: 5,
		p95VonMisesMpa: 200,
		p99VonMisesMpa: 220,
		interiorP95VonMisesMpa: 190,
		interiorP99VonMisesMpa: 210,
		rawMaxElementVonMisesMpa: 300,
		interiorElementCount: 4,
		interiorExclusionMm: 5,
		appliedN: loadCase.forceN,
		reactionN: loadCase.forceN.map((v) => -v) as [number, number, number],
		forceBalanceRelative: 1e-10,
		momentBalanceRelative: 1e-10,
		solveResidualRelative: 1e-12,
		solveIterations: 1,
		durationSeconds: 0.1
	};
	return {
		schemaVersion: 'rod-solid-fea-v1',
		analysisHash: hash({
			schema: 'rod-solid-fea-v1',
			geometry: parameterHash,
			forceN: loadCase.forceN,
			inertia: loadCase.inertia,
			refinementLevel: 1
		}),
		parameterHash,
		geometryParams,
		loadCase,
		material: {
			youngsModulusMpa: 210000,
			poissonRatio: 0.3,
			densityKgM3: 7850,
			provenance: 'Assumed steel'
		},
		method: 'Synthetic test field',
		surface: {
			positionsMm: [
				-32,
				-32,
				-p.rodDepthMm / 2,
				32,
				-32,
				-p.rodDepthMm / 2,
				32,
				p.rodLengthMm + 15,
				-p.rodDepthMm / 2,
				-32,
				p.rodLengthMm + 15,
				-p.rodDepthMm / 2,
				-32,
				-32,
				p.rodDepthMm / 2,
				32,
				-32,
				p.rodDepthMm / 2,
				32,
				p.rodLengthMm + 15,
				p.rodDepthMm / 2,
				-32,
				p.rodLengthMm + 15,
				p.rodDepthMm / 2
			],
			triangles: [0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6],
			displacementMm: Array.from({ length: 24 }, (_, i) => (i % 3 === 1 ? -0.001 : 0)),
			vonMisesMpa: [0, 100, 200, 200, 0, 100, 200, 200],
			fixtureNodes: [0, 1, 4, 5],
			loadedNodes: [2, 3, 6, 7]
		},
		stats,
		convergence: {
			performed: false,
			meshes: [stats],
			displacementRelativeChange: null,
			strainEnergyRelativeChange: null,
			interiorP95RelativeChange: null,
			withinScreeningTolerance: null,
			note: 'Single mesh'
		},
		assumptions: ['Synthetic fixture'],
		limitations: ['Not an engineering solution'],
		runtime: { solver: 'test', mesher: 'test', durationSeconds: 0.1 }
	};
}
function solvedSnapshot() {
	const s = snapshot();
	s.structural = report();
	s.structuralContext = { scenario: { ...s.scenario }, angleDeg: 4 };
	return s;
}

describe('saved engineering study validation', () => {
	it('accepts a clean study and preserves a solved case even when the input phase has moved', () => {
		expect(() => validateSnapshot(snapshot())).not.toThrow();
		const s = solvedSnapshot();
		s.phase = 720;
		expect(() => validateSnapshot(s)).not.toThrow();
	});
	it('validates independent experimental geometries and conditions instead of requiring the current input', () => {
		const s = solvedSnapshot(),
			p = { ...base(), rodWidthMm: 14 },
			condition = { ...DEFAULT_OPERATING_SCENARIO, rpm: 3000 };
		s.experiments = [
			{
				id: 'candidate',
				label: 'Candidate',
				params: p,
				scenario: { ...DEFAULT_OPERATING_SCENARIO },
				expectedCaseCount: 2,
				results: [{ report: report(p, condition, 361), scenario: condition, angleDeg: 361 }]
			}
		];
		expect(() => validateSnapshot(s)).not.toThrow();
	});
	it.each([
		['unknown version', (s: StudySnapshot) => (s.version = 2 as 1)],
		['invalid phase', (s: StudySnapshot) => (s.phase = NaN)],
		['invalid geometry', (s: StudySnapshot) => (s.params.rodWidthMm = 100)],
		['invalid scenario', (s: StudySnapshot) => (s.scenario.pistonMassKg = -1)],
		['stale speed', (s: StudySnapshot) => (s.params.rpm = 2500)],
		['unexpected fields', (s: StudySnapshot) => Object.assign(s, { apiKey: 'not-persistable' })]
	])('rejects %s', (_, mutate) => {
		const s = snapshot();
		mutate(s);
		expect(() => validateSnapshot(s)).toThrow();
	});
	it.each([
		['another geometry', (s: StudySnapshot) => (s.structural!.geometryParams.rodWidthMm = 24)],
		['stale conditions', (s: StudySnapshot) => (s.scenario.combustionRiseBar = 70)],
		['wrong case phase', (s: StudySnapshot) => (s.structuralContext!.angleDeg = 180)],
		['wrong case speed', (s: StudySnapshot) => (s.structuralContext!.scenario.rpm = 3000)],
		['missing inertia', (s: StudySnapshot) => delete s.structural!.loadCase.inertia],
		['wrong bearing load', (s: StudySnapshot) => (s.structural!.loadCase.forceN[1] += 100)],
		['truncated displacement', (s: StudySnapshot) => s.structural!.surface.displacementMm.pop()],
		['corrupt coordinate', (s: StudySnapshot) => (s.structural!.surface.positionsMm[0] = NaN)],
		['invalid triangle', (s: StudySnapshot) => (s.structural!.surface.triangles[1] = 1000)],
		['invalid fixture node', (s: StudySnapshot) => (s.structural!.surface.fixtureNodes[0] = -1)],
		['negative stress', (s: StudySnapshot) => (s.structural!.surface.vonMisesMpa[0] = -1)],
		[
			'false refinement success',
			(s: StudySnapshot) => (s.structural!.convergence.withinScreeningTolerance = true)
		]
	])('rejects native evidence with %s', (_, mutate) => {
		const s = solvedSnapshot();
		mutate(s);
		expect(() => validateSnapshot(s)).toThrow();
	});
	it('rejects malformed and incomplete nested experiments', () => {
		const s = snapshot();
		s.experiments = [
			{
				id: 'candidate',
				label: 'Candidate',
				params: base(),
				scenario: { ...DEFAULT_OPERATING_SCENARIO },
				expectedCaseCount: 1,
				results: [{ report: report(), scenario: { ...DEFAULT_OPERATING_SCENARIO }, angleDeg: 4 }]
			}
		];
		s.experiments[0].params.rodDepthMm = 18;
		expect(() => validateSnapshot(s)).toThrow(/another geometry/);
		s.experiments[0].params = base();
		s.experiments[0].scenario.combustionWidthDeg = NaN;
		expect(() => validateSnapshot(s)).toThrow(/operating conditions/);
	});
	it('keeps complete native arrays and detaches the saved record before an asynchronous write', async () => {
		const s = solvedSnapshot(),
			expected = structuredClone(s);
		const pending = createSavedStudy('  Reference case  ', s);
		s.structural!.surface.vonMisesMpa[1] = 123;
		s.params.rodWidthMm = 24;
		const saved = await pending;
		expect(saved.snapshot).toEqual(expected);
		expect(saved.name).toBe('Reference case');
		expect(saved.snapshot.structural!.surface).toEqual(expected.structural!.surface);
		expect(saved.digest).toMatch(/^[a-f0-9]{64}$/);
		await expect(validateSavedStudy(saved)).resolves.toBeUndefined();
	});
	it('checks native input hashes and detects finite field corruption in stored data', async () => {
		const invalid = solvedSnapshot();
		invalid.structural!.analysisHash = '0'.repeat(64);
		await expect(createSavedStudy('Wrong hash', invalid)).rejects.toThrow(/identity/);
		const saved = await createSavedStudy('Reference', solvedSnapshot());
		saved.snapshot.structural!.surface.vonMisesMpa[1] = 101;
		await expect(validateSavedStudy(saved)).rejects.toThrow(/checksum/);
	});
	it('rejects malformed saved metadata and does not accept a missing checksum', async () => {
		const saved = await createSavedStudy('Reference', snapshot());
		await expect(validateSavedStudy({ ...saved, digest: undefined })).rejects.toThrow();
		await expect(validateSavedStudy({ ...saved, savedAt: 'bad-date' })).rejects.toThrow();
	});
	it('recomputes cheap beam evidence instead of trusting stored search numbers', async () => {
		const s = snapshot();
		s.search = await searchRodDesigns(base());
		expect(() => validateSnapshot(s)).not.toThrow();
		s.search.candidates[2].rod.massKg *= 0.9;
		expect(() => validateSnapshot(s)).toThrow(/beam candidate/);
	});
});
