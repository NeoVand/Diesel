<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { goto, replaceState } from '$app/navigation';
	import { resolve } from '$app/paths';
	import WorkbenchHeader from '$lib/components/WorkbenchHeader.svelte';
	import StudyLibrary from '$lib/components/StudyLibrary.svelte';
	import {
		listStudies,
		saveStudy,
		loadStudy,
		type StudySnapshot,
		type StudySummary,
		type StudyExperiment
	} from '$lib/design/study-storage';
	import Icon from '$lib/components/Icon.svelte';
	import DesignParameter from '$lib/components/DesignParameter.svelte';
	import DesignPlot from '$lib/components/DesignPlot.svelte';
	import DesignOperatingControls from '$lib/components/DesignOperatingControls.svelte';
	import DesignSolidResults from '$lib/components/DesignSolidResults.svelte';
	import DesignComparison from '$lib/components/DesignComparison.svelte';
	import DesignAssistant from '$lib/components/DesignAssistant.svelte';
	import type { DesignAssistantEvidence, DesignAssistantMeshSummary } from '$lib/design/assistant';
	import {
		DEFAULT_OPERATING_SCENARIO,
		createOperatingCycle,
		structuralLoadCase,
		operatingScenarioPresets,
		evaluateOperatingEnvelope,
		rodMassProperties,
		type OperatingScenario
	} from '$lib/design/operating-cycle';
	import type { StructuralResult, StructuralRequest } from '$lib/design/structural';
	import { exportRodCad, runStructuralAnalysis, disposeBrowserCad } from '$lib/browser-cad/client';
	import type {
		OperatingSearchResult,
		OperatingSearchResponse
	} from '$lib/design/operating-search';
	import { assessOperatingComparison } from '$lib/design/operating-acceptance';
	import {
		DEFAULT_DESIGN_PARAMS,
		DESIGN_BOUNDS,
		DESIGN_MATERIAL,
		DESIGN_LIMITS,
		evaluateDesign,
		createKinematicCurve,
		sliderCrankSample,
		verifyDesign,
		type DesignParams,
		type OptimizationResult,
		type OptimizationProgress,
		type OptimizationWorkerResponse,
		type VerificationResult
	} from '$lib/design/design-core';
	import type { DesignStudio } from '$lib/scene/design-studio';
	import { deriveDesignLayout } from '$lib/design/design-layout';

	type Study = 'rod' | 'engine';
	type Overlay = 'material' | 'stress' | 'displacement';
	type Tab = 'space' | 'operating' | 'motion' | 'measurements' | 'evidence';
	type CycleChart = 'loads' | 'comparison' | 'space' | 'assistant';
	type Experiment = StudyExperiment;
	type CadReport = {
		parameterHash: string;
		valid: boolean;
		solidCount: number;
		volumeMm3: number;
		massKg: number;
		relativeVolumeError: number;
		stepRoundTripValid: boolean;
		boundsMm: unknown;
	};
	let params = $state.raw<DesignParams>({ ...DEFAULT_DESIGN_PARAMS });
	let baseline = $state.raw<DesignParams>({ ...DEFAULT_DESIGN_PARAMS });
	let study = $state<Study>('rod');
	let overlay = $state<Overlay>('material');
	let tab = $state<Tab>('space');
	let studio = $state.raw<DesignStudio | null>(null);
	let sceneReady = $state(false);
	let sceneError = $state('');
	let phase = $state(35);
	let running = $state(false);
	let dimensions = $state(true);
	let compare = $state(false);
	let forces = $state(false);
	let volumeLocked = $state(true);
	let lockedVolume = $state(evaluateDesign(DEFAULT_DESIGN_PARAMS).kinematics.displacementLiters);
	let result = $state.raw<OptimizationResult | null>(null);
	let progress = $state.raw<OptimizationProgress | null>(null);
	let optimizing = $state(false);
	let selectedId = $state('current');
	let verification = $state.raw<VerificationResult | null>(null);
	let cad = $state.raw<CadReport | null>(null);
	let cadBusy = $state(false);
	let notice = $state('');
	let error = $state('');
	let revision = $state(0);
	let jobId = '';
	let worker: Worker | null = null;
	let cadAbort: AbortController | null = null;
	let disposed = false;
	let detailsOpen = $state(false);
	let scenarioInputs = $state.raw<OperatingScenario>({ ...DEFAULT_OPERATING_SCENARIO });
	let structural = $state.raw<StructuralResult | null>(null);
	let structuralContext = $state.raw<{ scenario: OperatingScenario; angleDeg: number } | null>(
		null
	);
	let layoutMode = $state<'model' | 'split' | 'results'>('split');
	let analysisExpanded = $derived(layoutMode === 'results');
	let parametersVisible = $state(true);
	let inspectorVisible = $state(true);
	let libraryOpen = $state(false);
	let savedStudies = $state.raw<StudySummary[]>([]);
	let libraryBusy = $state(false);
	let libraryError = $state('');
	let studyName = $state('Rod study');
	let undoStack = $state.raw<StudySnapshot[]>([]);
	let redoStack = $state.raw<StudySnapshot[]>([]);
	let previousAnalysis = $state.raw<StudySnapshot | null>(null);
	let lastEdit = { key: '', at: 0 };
	let probeEnabled = $state(false);
	let probe = $state.raw<import('$lib/scene/design-structural').StructuralProbe | null>(null);
	let renderPreset = $state<'technical' | 'presentation'>('technical');
	let projection = $state<'perspective' | 'orthographic'>('perspective');
	let splitComparison = $state(false);
	let analysisHeight = $state(290);

	let structuralBusy = $state(false);
	let structuralError = $state('');
	let structuralVisible = $state(false);
	let structuralField = $state<'material' | 'stress' | 'displacement'>('stress');
	let deformationScale = $state(1);
	let showMesh = $state(false);
	let showUndeformed = $state(true);
	let showBoundaryConditions = $state(true);
	let comparing = $state(false);
	let comparisonProgress = $state('');
	let experiments = $state.raw<Experiment[]>([]);
	let operatingSearch = $state.raw<OperatingSearchResult | null>(null);
	let operatingWorker: Worker | null = null;
	let cycleChart = $state<CycleChart>('loads');
	let comparisonAssessment = $derived.by(() => {
		const reference = experiments.find((e) => e.id === 'reference'),
			candidate = experiments.find((e) => e.id === 'candidate');
		return reference && candidate
			? assessOperatingComparison({
					reference: {
						massKg: evaluateDesign(reference.params).rod.massKg,
						expectedCaseCount: reference.expectedCaseCount,
						cases: reference.results.map((r) => r.report)
					},
					candidate: {
						massKg: evaluateDesign(candidate.params).rod.massKg,
						expectedCaseCount: candidate.expectedCaseCount,
						cases: candidate.results.map((r) => r.report)
					}
				})
			: null;
	});
	let operatingPoints = $derived(
		operatingSearch?.candidates.map((c) => ({
			id: c.id,
			x: c.massKg * 1000,
			y: c.peakNominalStressMpa,
			feasible: c.passesNominalScreen,
			pareto: operatingSearch?.finalists.some((f) => f.id === c.id),
			label: `${c.id} mm: ${(c.massKg * 1000).toFixed(1)} g, ${c.peakNominalStressMpa.toFixed(1)} MPa nominal`
		})) ?? []
	);
	let structuralAbort: AbortController | null = null;
	let analysisGeneration = 0;
	let scenario = $derived({ ...scenarioInputs, rpm: params.rpm });
	let operatingCycle = $derived(createOperatingCycle(params, scenario));
	let cycleAngle = $derived(phase);
	let cycleSample = $derived(
		operatingCycle.samples[Math.min(720, Math.max(0, Math.round(cycleAngle)))]
	);
	let compressionSample = $derived(
		operatingCycle.samples.reduce((a, b) =>
			a.smallEndForceLocalN[1] < b.smallEndForceLocalN[1] ? a : b
		)
	);
	let tensionSample = $derived(
		operatingCycle.samples.reduce((a, b) =>
			a.smallEndForceLocalN[1] > b.smallEndForceLocalN[1] ? a : b
		)
	);
	let structuralActive = $derived(
		tab === 'operating' && study === 'rod' && structuralVisible && !!structural
	);
	let cycleLoadLabel = $derived(
		`${Math.round(cycleAngle)}° crank · ${params.rpm.toLocaleString()} rpm`
	);
	let pressureLines = $derived([
		{
			id: 'pressure',
			color: '#ddb775',
			points: operatingCycle.samples
				.filter((_, i) => i % 3 === 0)
				.map((s) => ({ x: s.angleDeg, y: s.pressureBar }))
		}
	]);
	let bearingLines = $derived([
		{
			id: 'gas',
			color: '#65798b',
			dashed: true,
			points: operatingCycle.samples
				.filter((_, i) => i % 3 === 0)
				.map((s) => ({ x: s.angleDeg, y: s.gasForceN / 1000 }))
		},
		{
			id: 'rod',
			color: '#78cec4',
			points: operatingCycle.samples
				.filter((_, i) => i % 3 === 0)
				.map((s) => ({ x: s.angleDeg, y: -s.smallEndForceLocalN[1] / 1000 }))
		}
	]);
	const rodKeys = ['rodWidthMm', 'rodDepthMm', 'webMm', 'flangeMm'] as const;
	const parameterLabels: Record<keyof DesignParams, string> = {
		boreMm: 'Cylinder bore',
		strokeMm: 'Stroke',
		rodLengthMm: 'Rod centre distance',
		rpm: 'Scenario speed',
		rodWidthMm: 'Flange width',
		rodDepthMm: 'Section depth',
		webMm: 'Web thickness',
		flangeMm: 'Flange thickness',
		loadKn: 'Axial compression',
		lateralLoadN: 'Transverse centre load'
	};
	let evaluation = $derived(evaluateDesign(params));
	let reference = $derived(evaluateDesign(baseline));
	let rod = $derived(evaluation.rod);
	let kine = $derived(evaluation.kinematics);
	let layout = $derived(deriveDesignLayout(params));
	let baselineLayout = $derived(deriveDesignLayout(baseline));
	let measurements = $derived(
		study === 'rod'
			? [
					{
						name: 'Solid volume',
						base: reference.rod.volumeMm3,
						now: rod.volumeMm3,
						unit: 'mm³',
						digits: 1
					},
					{
						name: 'Rod mass · assumed steel',
						base: reference.rod.massKg * 1000,
						now: rod.massKg * 1000,
						unit: 'g',
						digits: 2
					},
					{
						name: 'Shank area',
						base: reference.rod.areaMm2,
						now: rod.areaMm2,
						unit: 'mm²',
						digits: 2
					},
					{
						name: 'Minimum second moment',
						base: Math.min(reference.rod.iStrongMm4, reference.rod.iWeakMm4),
						now: Math.min(rod.iStrongMm4, rod.iWeakMm4),
						unit: 'mm⁴',
						digits: 1
					},
					{
						name: 'Unloaded shank mode',
						base: reference.rod.firstModeHz,
						now: rod.firstModeHz,
						unit: 'Hz',
						digits: 0
					}
				]
			: [
					{
						name: 'Displacement',
						base: reference.kinematics.displacementLiters,
						now: kine.displacementLiters,
						unit: 'L',
						digits: 3
					},
					{
						name: 'Piston pin to crown centre',
						base: baselineLayout.compressionHeightMm,
						now: layout.compressionHeightMm,
						unit: 'mm',
						digits: 2
					},
					{
						name: 'Adaptive deck height',
						base: baselineLayout.deckHeightMm,
						now: layout.deckHeightMm,
						unit: 'mm',
						digits: 2
					},
					{
						name: 'Cylinder station pitch',
						base: baselineLayout.borePitchMm,
						now: layout.borePitchMm,
						unit: 'mm',
						digits: 2
					},
					{
						name: 'Adjacent liner envelope gap',
						base: baselineLayout.minimumAdjacentLinerGapMm,
						now: layout.minimumAdjacentLinerGapMm,
						unit: 'mm',
						digits: 2
					}
				]
	);
	let massChange = $derived((rod.massKg / reference.rod.massKg - 1) * 100);
	let activeConstraint = $derived(
		[...rod.constraints].sort((a, b) => b.utilization - a.utilization)[0]
	);
	let currentMotion = $derived(sliderCrankSample(params, phase));
	let curve = $derived(createKinematicCurve(params));
	let baselineCurve = $derived(createKinematicCurve(baseline));
	let localSweep = $derived(
		Array.from({ length: 15 }, (_, i) => {
			const p = { ...params, rodWidthMm: 14 + i };
			return { id: `sweep-${i}`, params: p, rod: evaluateDesign(p).rod };
		})
	);
	let cloud = $derived.by(() => {
		if (!result) return [...localSweep, { id: 'current', params, rod }];
		const ids = new Set(result.pareto.map((c) => c.id));
		const stride = Math.max(1, Math.ceil(result.candidates.length / 330));
		const sampled = result.candidates.filter(
			(c, i) => i % stride === 0 || ids.has(c.id) || c.id === selectedId
		);
		return selectedId === 'current' ? [...sampled, { id: 'current', params, rod }] : sampled;
	});
	let points = $derived(
		cloud.map((c) => ({
			id: c.id,
			x: c.rod.massKg * 1000,
			y: c.rod.complianceMmPerN * 1e6,
			feasible: c.rod.feasible,
			pareto: result ? result.pareto.some((p) => p.id === c.id) : c.rod.feasible,
			label: `${c.id}: ${(c.rod.massKg * 1000).toFixed(1)} grams, compliance ${(c.rod.complianceMmPerN * 1e6).toFixed(2)} micrometres per kilonewton`
		}))
	);
	let frontier = $derived(
		result?.pareto.map((c) => ({ x: c.rod.massKg * 1000, y: c.rod.complianceMmPerN * 1e6 })) ?? []
	);
	let featured = $derived.by(() => {
		if (!result?.pareto.length) return [];
		const p = result.pareto,
			indices = [0, Math.floor((p.length - 1) / 2), p.length - 1];
		return [...new Set(indices)].map((i, index) => ({
			candidate: p[i],
			label: index === 0 ? 'Lightest feasible' : index === 1 ? 'Tradeoff' : 'Stiffest sampled'
		}));
	});
	let motionLines = $derived([
		{
			id: 'baseline',
			points: baselineCurve.map((s) => ({ x: s.angleDeg, y: s.displacementMm })),
			color: '#677782',
			dashed: true
		},
		{
			id: 'current',
			points: curve.map((s) => ({ x: s.angleDeg, y: s.displacementMm })),
			color: '#78cec4'
		}
	]);
	let boreBounds = $derived(
		volumeLocked
			? {
					min: Math.max(
						DESIGN_BOUNDS.boreMm.min,
						Math.sqrt((lockedVolume * 1e6 * 4) / (12 * Math.PI * DESIGN_BOUNDS.strokeMm.max))
					),
					max: Math.min(
						DESIGN_BOUNDS.boreMm.max,
						Math.sqrt((lockedVolume * 1e6 * 4) / (12 * Math.PI * DESIGN_BOUNDS.strokeMm.min))
					),
					step: 0.5
				}
			: DESIGN_BOUNDS.boreMm
	);
	let sensitivities = $derived(
		rodKeys.map((key) => {
			const h = 0.005,
				a = { ...params, [key]: params[key] - h },
				b = { ...params, [key]: params[key] + h };
			const lo = Math.max(DESIGN_BOUNDS[key].min, a[key]),
				hi = Math.min(DESIGN_BOUNDS[key].max, b[key]);
			a[key] = lo;
			b[key] = hi;
			const ea = evaluateDesign(a).rod,
				eb = evaluateDesign(b).rod;
			return {
				key,
				label: parameterLabels[key],
				mass: ((eb.massKg - ea.massKg) / (hi - lo)) * 1000,
				compliance: ((eb.complianceMmPerN - ea.complianceMmPerN) / (hi - lo)) * 1e6
			};
		})
	);
	const fmt = (v: number, digits = 2) =>
		v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
	const geometryKey = (
		p: Pick<DesignParams, 'rodLengthMm' | 'rodWidthMm' | 'rodDepthMm' | 'webMm' | 'flangeMm'>
	) => JSON.stringify([p.rodLengthMm, p.rodWidthMm, p.rodDepthMm, p.webMm, p.flangeMm]);
	const contextKey = (p: DesignParams) => JSON.stringify([p.rodLengthMm, p.loadKn, p.lateralLoadN]);

	onMount(() => {
		if (window.innerHeight < 850) analysisHeight = 240;
		if (new URLSearchParams(window.location.search).get('workspace') === 'analyze')
			openOperating(false);
		// Each visit starts with both geometry and results visible. Layout choices
		// apply to this workspace session, so a past Results view cannot hide the model.
		void refreshStudies();
	});
	function snapshot(): StudySnapshot {
		return {
			version: 1,
			params: { ...params },
			baseline: { ...baseline },
			scenario: { ...scenario },
			phase,
			study,
			tab,
			volumeLocked,
			lockedVolume,
			structural,
			structuralContext,
			experiments,
			operatingSearch,
			search: result
		};
	}
	function remember(key = 'action') {
		const now = performance.now();
		if (key !== lastEdit.key || now - lastEdit.at > 450)
			undoStack = [...undoStack, snapshot()].slice(-30);
		lastEdit = { key, at: now };
		redoStack = [];
	}
	function restoreSnapshot(saved: StudySnapshot) {
		cancelSearch();
		invalidateStructural(false);
		running = false;
		params = { ...saved.params };
		baseline = { ...saved.baseline };
		scenarioInputs = { ...saved.scenario };
		phase = saved.phase;
		study = saved.study;
		tab = saved.tab;
		replaceState(resolve(saved.tab === 'operating' ? '/design?workspace=analyze' : '/design'), {});
		volumeLocked = saved.volumeLocked;
		lockedVolume = saved.lockedVolume;
		structural = saved.structural;
		structuralContext = saved.structuralContext;
		experiments = saved.experiments;
		operatingSearch = saved.operatingSearch;
		result = saved.search;
		structuralVisible =
			!!structural &&
			structuralContext?.angleDeg === phase &&
			geometryKey(structural.geometryParams) === geometryKey(params);
		studio?.setPhase(phase);
		previousAnalysis = null;
		cad = null;
		verification = null;
		revision++;
		if (structuralVisible) dimensions = false;
		error = '';
		lastEdit = { key: '', at: 0 };
	}
	function undo() {
		const last = undoStack.at(-1);
		if (!last) return;
		redoStack = [...redoStack, snapshot()];
		undoStack = undoStack.slice(0, -1);
		restoreSnapshot(last);
		notice = 'Previous study state restored.';
	}
	function redo() {
		const next = redoStack.at(-1);
		if (!next) return;
		undoStack = [...undoStack, snapshot()];
		redoStack = redoStack.slice(0, -1);
		restoreSnapshot(next);
		notice = 'Study change reapplied.';
	}
	async function refreshStudies() {
		try {
			savedStudies = await listStudies();
		} catch (e) {
			libraryError = e instanceof Error ? e.message : 'Study storage is unavailable.';
		}
	}
	async function saveCurrentStudy(name: string) {
		libraryBusy = true;
		libraryError = '';
		try {
			await saveStudy(name, snapshot());
			studyName = name.trim();
			await refreshStudies();
			notice = 'Study saved in this browser.';
		} catch (e) {
			libraryError = e instanceof Error ? e.message : 'The study could not be saved.';
		} finally {
			libraryBusy = false;
		}
	}
	async function openSavedStudy(id: string) {
		libraryBusy = true;
		libraryError = '';
		try {
			const entry = await loadStudy(id);
			remember('load-study');
			restoreSnapshot(entry.snapshot);
			studyName = entry.name;
			libraryOpen = false;
			notice = 'Saved study restored with its original inputs and results.';
		} catch (e) {
			libraryError = e instanceof Error ? e.message : 'The study could not be opened.';
		} finally {
			libraryBusy = false;
		}
	}
	function restorePreviousAnalysis() {
		if (!previousAnalysis) return;
		const saved = previousAnalysis;
		remember('previous-result');
		restoreSnapshot(saved);
		notice = 'Previous result and its original setup restored.';
	}
	function setLayout(next: 'model' | 'split' | 'results') {
		layoutMode = next;
	}
	function changeWorkspace(next: 'explore' | 'design' | 'analyze') {
		if (next === 'explore') {
			void goto(resolve('/'));
			return;
		}
		const current = tab === 'operating' ? 'analyze' : 'design';
		if (next === current) return;
		setLayout('split');
		if (next === 'analyze') openOperating();
		else selectAnalysisTab(study === 'engine' ? 'motion' : 'space');
	}
	function selectCycleChart(next: CycleChart) {
		cycleChart = next;
		if (next === 'comparison') setLayout('results');
		else if (layoutMode === 'model') setLayout('split');
	}
	function resizeAnalysis(event: PointerEvent) {
		const start = event.clientY,
			before = analysisHeight;
		const target = event.currentTarget as HTMLElement;
		target.setPointerCapture(event.pointerId);
		const move = (e: PointerEvent) => {
			analysisHeight = Math.max(
				220,
				Math.min(window.innerHeight - 390, before + start - e.clientY)
			);
		};
		const end = () => {
			target.removeEventListener('pointermove', move);
			target.removeEventListener('pointerup', end);
			target.removeEventListener('pointercancel', end);
		};
		target.addEventListener('pointermove', move);
		target.addEventListener('pointerup', end);
		target.addEventListener('pointercancel', end);
	}

	function mountScene(canvas: HTMLCanvasElement) {
		let cancelled = false;
		let instance: DesignStudio | null = null;
		void import('$lib/scene/design-studio')
			.then(async ({ DesignStudio }) => {
				if (cancelled) return;
				instance = new DesignStudio(canvas, {
					onPhase: (value: number) => {
						phase = value;
					},
					onProbe: (value) => {
						probe = value;
					}
				});
				await instance.ready;
				if (cancelled) return;
				instance.setDesign(params);
				instance.setView(study);
				instance.setPhase(phase);
				studio = instance;
				sceneReady = true;
			})
			.catch((e) => {
				if (!cancelled)
					sceneError = e instanceof Error ? e.message : 'The 3D workspace could not start.';
			});
		return () => {
			cancelled = true;
			instance?.dispose();
		};
	}
	$effect(() => {
		studio?.setRenderPreset(renderPreset);
	});
	$effect(() => {
		studio?.setProjection(projection);
	});
	$effect(() => {
		studio?.setProbeEnabled(probeEnabled && structuralActive);
	});
	$effect(() => {
		studio?.setDesign(params);
	});
	$effect(() => {
		studio?.setView(study);
	});
	$effect(() => {
		studio?.setOverlay(tab === 'operating' ? 'material' : overlay);
	});
	$effect(() => {
		studio?.setRunning(running);
	});
	$effect(() => {
		studio?.setDimensions(dimensions);
	});
	$effect(() => {
		studio?.setBaseline(compare);
	});
	$effect(() => {
		studio?.setForces(tab !== 'operating' && forces);
	});
	$effect(() => {
		studio?.setOperatingCycle(tab === 'operating' ? operatingCycle : null);
	});
	$effect(() => {
		studio?.setStructuralResult(structural);
	});
	$effect(() => {
		studio?.setStructuralDisplay({
			enabled: structuralActive,
			field: structuralField,
			deformationScale,
			showMesh,
			showUndeformed,
			showBoundaryConditions,
			fieldMaximum:
				structuralField === 'stress' ? 250 : structuralField === 'displacement' ? 0.1 : undefined
		});
	});

	function invalidateStructural(preserve = true) {
		if (preserve && (structural || experiments.length)) previousAnalysis = snapshot();
		probe = null;
		probeEnabled = false;
		analysisGeneration++;
		structuralAbort?.abort();
		operatingWorker?.terminate();
		operatingWorker = null;
		structuralAbort = null;
		structural = null;
		structuralContext = null;
		structuralVisible = false;
		structuralBusy = false;
		structuralError = '';
		comparing = false;
		comparisonProgress = '';
		operatingSearch = null;
		experiments = [];
	}
	function openOperating(syncUrl = true) {
		if (syncUrl) replaceState(resolve('/design?workspace=analyze'), {});
		tab = 'operating';
		running = false;
		cycleChart = 'loads';
		if (layoutMode === 'model') setLayout('split');
	}
	function cancelOperatingWork() {
		analysisGeneration++;
		structuralAbort?.abort();
		structuralAbort = null;
		operatingWorker?.terminate();
		operatingWorker = null;
		structuralBusy = false;
		comparing = false;
		comparisonProgress = 'Stopped. Completed cases are preserved.';
	}
	function changeScenario(key: keyof OperatingScenario, value: number) {
		if (key === 'rpm') {
			change('rpm', value);
			return;
		}
		remember(`scenario-${key}`);
		invalidateStructural();
		scenarioInputs = { ...scenarioInputs, [key]: value };
		revision++;
	}
	function operatingPreset(preset: 'reference' | 'overrun' | 'high-load') {
		const next = { ...DEFAULT_OPERATING_SCENARIO };
		if (preset === 'overrun') {
			next.rpm = 3200;
			next.combustionRiseBar = 0;
		}
		if (preset === 'high-load') {
			next.rpm = 1800;
			next.combustionRiseBar = 90;
			next.intakePressureBar = 1.5;
		}
		remember('preset');
		invalidateStructural();
		params = { ...params, rpm: next.rpm };
		scenarioInputs = next;
		revision++;
	}
	function seekCycle(angle: number) {
		if (structuralBusy) cancelOperatingWork();
		structuralVisible = false;
		overlay = 'material';
		seek(angle);
	}
	async function fetchStructural(
		request: StructuralRequest,
		signal: AbortSignal
	): Promise<StructuralResult> {
		return runStructuralAnalysis(request, {
			signal,
			onProgress: (message) => {
				if (!signal.aborted) comparisonProgress = message;
			}
		});
	}
	async function solveStructural(refine: boolean, existing?: StructuralResult) {
		if (structuralBusy || comparing) return;
		const generation = ++analysisGeneration;
		const selectedParams = { ...params };
		const selectedContext = existing
			? structuralContext
			: { scenario: { ...scenario }, angleDeg: cycleSample.angleDeg };
		const loadCase = existing
			? existing.loadCase
			: { ...structuralLoadCase(cycleSample), label: cycleLoadLabel };
		structuralAbort = new AbortController();
		structuralBusy = true;
		structuralError = '';
		running = false;
		try {
			const response = await fetchStructural(
				{
					params: selectedParams,
					loadCase,
					refine,
					...(existing ? { refinementLevel: 3 as const } : {})
				},
				structuralAbort.signal
			);
			if (disposed || generation !== analysisGeneration) return;
			structural = response;
			previousAnalysis = null;
			setLayout('split');
			structuralContext = selectedContext;
			if (existing)
				experiments = experiments.map((e) => ({
					...e,
					results: e.results.map((s) =>
						s.report.analysisHash === existing.analysisHash ? { ...s, report: response } : s
					)
				}));
			structuralVisible = true;
			study = 'rod';
			dimensions = false;
			structuralField = 'stress';
			deformationScale = 1;
			notice = 'Browser solid solution ready. The field uses the solved mesh.';
			comparisonProgress = '';
		} catch (e) {
			if (
				!disposed &&
				generation === analysisGeneration &&
				e instanceof Error &&
				e.name !== 'AbortError'
			)
				structuralError = e.message;
		} finally {
			if (!disposed && generation === analysisGeneration) {
				structuralBusy = false;
				comparisonProgress = '';
				structuralAbort = null;
			}
		}
	}
	function selectAnalysisTab(next: Tab) {
		if (next === 'operating') {
			openOperating();
			return;
		}
		replaceState(resolve('/design'), {});
		tab = next;
		if (phase >= 360) seek(phase % 360);
	}
	function searchOperating(
		selected: DesignParams,
		scenarios: OperatingScenario[],
		signal: AbortSignal
	): Promise<OperatingSearchResult> {
		return new Promise((resolve, reject) => {
			const active = new Worker(
				new URL('../../lib/design/operating-optimization.worker.ts', import.meta.url),
				{ type: 'module' }
			);
			operatingWorker = active;
			const id = `operating-${analysisGeneration}`;
			const cleanup = () => {
				active.terminate();
				signal.removeEventListener('abort', abort);
				if (operatingWorker === active) operatingWorker = null;
			};
			const abort = () => {
				cleanup();
				reject(new DOMException('Cancelled', 'AbortError'));
			};
			signal.addEventListener('abort', abort, { once: true });
			active.onmessage = (event: MessageEvent<OperatingSearchResponse>) => {
				const message = event.data;
				if (message.revision !== id || signal.aborted) return;
				if (message.type === 'progress')
					comparisonProgress =
						message.progress.stage === 'coarse'
							? `Operating screen · ${message.progress.completed} / ${message.progress.total} shapes · three conditions`
							: `Rechecking finalists at 1° resolution…`;
				else if (message.type === 'result') {
					cleanup();
					resolve(message.result);
				} else {
					cleanup();
					reject(new Error(message.message));
				}
			};
			active.onerror = () => {
				cleanup();
				reject(new Error('The operating design search could not complete.'));
			};
			active.postMessage({ type: 'search', revision: id, params: selected, scenarios });
		});
	}
	async function compareOperatingCandidates() {
		if (comparing || structuralBusy) return;
		const generation = ++analysisGeneration;
		const selectedParams = { ...params },
			selectedScenario = { ...scenario };
		const controller = new AbortController();
		structuralAbort = controller;
		comparing = true;
		structuralError = '';
		cycleChart = 'comparison';
		setLayout('results');
		experiments = [];
		operatingSearch = null;
		comparisonProgress = 'Screening the geometry family…';
		try {
			const referenceParams = {
				...selectedParams,
				...Object.fromEntries(rodKeys.map((k) => [k, DEFAULT_DESIGN_PARAMS[k]]))
			};
			const conditions = operatingScenarioPresets(selectedScenario);
			const search = await searchOperating(referenceParams, conditions, controller.signal);
			if (controller.signal.aborted || generation !== analysisGeneration) return;
			operatingSearch = search;
			if (!search.best) {
				comparisonProgress =
					'No sampled shape passes the operating stress screen. No candidate has been accepted.';
				return;
			}
			const designs = [
				{ id: 'reference', label: 'Reference rod', params: referenceParams },
				{ id: 'candidate', label: 'Operating candidate', params: search.best.params }
			];
			experiments = designs.map((d) => ({
				...d,
				scenario: selectedScenario,
				results: [],
				expectedCaseCount: 3
			}));
			for (const design of designs) {
				const envelope = evaluateOperatingEnvelope(design.params, conditions, 721);
				const compression = envelope.cycles.reduce((a, b) =>
					a.envelope.maxCompressionN > b.envelope.maxCompressionN ? a : b
				);
				const tension = envelope.cycles.reduce((a, b) =>
					a.envelope.maxTensionN > b.envelope.maxTensionN ? a : b
				);
				const critical = envelope.cycles[envelope.criticalScenarioIndex];
				const cases = [
					{
						label: 'Peak compression',
						cycle: compression,
						sample: compression.samples[compression.envelope.compressionSampleIndex]
					},
					{
						label: 'Peak tension',
						cycle: tension,
						sample: tension.samples[tension.envelope.tensionSampleIndex]
					},
					{
						label: 'Peak nominal stress',
						cycle: critical,
						sample: critical.samples[critical.envelope.stressSampleIndex]
					}
				];
				const uniqueCases = cases.filter(
					(c, i) =>
						cases.findIndex(
							(other) =>
								other.cycle.scenario.label === c.cycle.scenario.label &&
								other.sample.angleDeg === c.sample.angleDeg
						) === i
				);
				experiments = experiments.map((e) =>
					e.id === design.id ? { ...e, expectedCaseCount: uniqueCases.length } : e
				);
				for (const { label, cycle, sample } of uniqueCases) {
					if (controller.signal.aborted || generation !== analysisGeneration) return;
					comparisonProgress = `${design.label} · ${label.toLowerCase()} · two meshes`;
					let report = await fetchStructural(
						{
							params: design.params,
							loadCase: {
								...structuralLoadCase(sample),
								label: `${design.label} · ${label} at ${sample.angleDeg}° / ${cycle.scenario.rpm} rpm`
							},
							refine: true
						},
						controller.signal
					);
					if (
						!report.convergence.withinScreeningTolerance &&
						!controller.signal.aborted &&
						generation === analysisGeneration
					) {
						comparisonProgress = `${design.label} · ${label.toLowerCase()} · additional refinement required`;
						report = await fetchStructural(
							{ params: design.params, loadCase: report.loadCase, refinementLevel: 3 },
							controller.signal
						);
					}
					if (controller.signal.aborted || generation !== analysisGeneration) return;
					experiments = experiments.map((e) =>
						e.id === design.id
							? {
									...e,
									results: [
										...e.results,
										{ report, scenario: cycle.scenario, angleDeg: sample.angleDeg }
									]
								}
							: e
					);
				}
			}
			comparisonProgress = `${experiments.reduce((n, e) => n + e.results.length, 0)} critical load cases solved across three conditions. Review the evidence before accepting a candidate.`;
			notice = 'Comparison complete. Both geometries were independently meshed and solved.';
		} catch (e) {
			if (
				!disposed &&
				generation === analysisGeneration &&
				e instanceof Error &&
				e.name !== 'AbortError'
			) {
				structuralError = e.message;
				comparisonProgress = 'Comparison incomplete. Completed cases are preserved.';
			}
		} finally {
			if (!disposed && generation === analysisGeneration) {
				comparing = false;
				structuralAbort = null;
			}
		}
	}
	function inspectExperiment(experiment: Experiment, solved: Experiment['results'][number]) {
		if (comparing || structuralBusy) return;
		remember('inspect-result');
		setLayout('split');
		previousAnalysis = null;
		cancelSearch();
		params = { ...experiment.params, rpm: solved.scenario.rpm };
		scenarioInputs = { ...solved.scenario };
		phase = solved.angleDeg;
		studio?.setPhase(phase);
		structural = solved.report;
		structuralContext = { scenario: solved.scenario, angleDeg: solved.angleDeg };
		structuralVisible = true;
		study = 'rod';
		running = false;
		dimensions = false;
		cad = null;
		verification = null;
		revision++;
		selectedId = 'current';
		notice = `${experiment.label} · browser solution displayed`;
	}
	function exportStructural() {
		const report = structural ?? previousAnalysis?.structural;
		if (!report) return;
		download(
			new Blob([JSON.stringify(report)], { type: 'application/json' }),
			'engine-lab-solid-analysis.json'
		);
	}
	function selectOperatingCandidate(id: string) {
		if (!operatingSearch || comparing || structuralBusy) return;
		const selected = operatingSearch.candidates.find((c) => c.id === id);
		if (!selected) return;
		remember('candidate');
		if (structural || experiments.length) previousAnalysis = snapshot();
		cancelSearch();
		params = { ...selected.params };
		scenarioInputs = { ...operatingSearch.scenarios[1] };
		structural = null;
		structuralVisible = false;
		cad = null;
		verification = null;
		revision++;
		study = 'rod';
		running = false;
		overlay = 'material';
		notice = 'Sampled geometry selected. Its nominal screen is not a solid verification.';
	}

	function getAssistantEvidence(): DesignAssistantEvidence {
		const summarize = (s: StructuralResult['stats']): DesignAssistantMeshSummary => ({
			meshSizeMm: s.meshSizeMm,
			nodes: s.nodes,
			elements: s.elements,
			maxDisplacementMm: s.maxDisplacementMm,
			strainEnergyNmm: s.strainEnergyNmm,
			p95VonMisesMpa: s.p95VonMisesMpa,
			p99VonMisesMpa: s.p99VonMisesMpa,
			interiorP95VonMisesMpa: s.interiorP95VonMisesMpa,
			rawMaxElementVonMisesMpa: s.rawMaxElementVonMisesMpa,
			forceBalanceRelative: s.forceBalanceRelative,
			momentBalanceRelative: s.momentBalanceRelative,
			solveResidualRelative: s.solveResidualRelative
		});
		const reports = [
			...(structural ? [structural] : []),
			...experiments.flatMap((e) => e.results.map((s) => s.report))
		];
		const unique = reports
			.filter((r, i) => reports.findIndex((v) => v.analysisHash === r.analysisHash) === i)
			.slice(0, 6);
		return {
			params: { ...params },
			scenario: { ...scenario },
			angleDeg: cycleAngle,
			...(operatingSearch
				? {
						search: {
							scenarios: operatingSearch.scenarios,
							evaluated: operatingSearch.evaluated,
							coarsePassCount: operatingSearch.coarsePassCount,
							refinedCount: operatingSearch.refinedCount,
							massReductionPercent: operatingSearch.massReductionPercent,
							baseline: operatingSearch.baseline,
							best: operatingSearch.best
						}
					}
				: {}),
			native: unique.map((r) => {
				const saved = experiments
					.flatMap((e) => e.results)
					.find((s) => s.report.analysisHash === r.analysisHash);
				const context = saved ?? (r === structural ? structuralContext : null);
				return {
					...(context ? { operatingScenario: context.scenario, angleDeg: context.angleDeg } : {}),
					analysisHash: r.analysisHash,
					parameterHash: r.parameterHash,
					geometryParams: r.geometryParams,
					loadCase: r.loadCase,
					stats: summarize(r.stats),
					convergence: {
						performed: r.convergence.performed,
						displacementRelativeChange: r.convergence.displacementRelativeChange,
						strainEnergyRelativeChange: r.convergence.strainEnergyRelativeChange,
						interiorP95RelativeChange: r.convergence.interiorP95RelativeChange,
						withinScreeningTolerance: r.convergence.withinScreeningTolerance,
						meshes: r.convergence.meshes.map(summarize)
					}
				};
			})
		};
	}

	function cancelSearch() {
		worker?.terminate();
		worker = null;
		jobId = '';
		optimizing = false;
	}
	function change(key: keyof DesignParams, value: number) {
		const next = { ...params, [key]: value };
		if (key === 'boreMm' && volumeLocked)
			next.strokeMm = Math.max(
				DESIGN_BOUNDS.strokeMm.min,
				Math.min(
					DESIGN_BOUNDS.strokeMm.max,
					(lockedVolume * 1e6 * 4) / (12 * Math.PI * value * value)
				)
			);
		if (key === 'strokeMm' && volumeLocked) return;
		try {
			evaluateDesign(next);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Invalid design.';
			return;
		}
		remember(`parameter-${key}`);
		cancelSearch();
		invalidateStructural();
		if (contextKey(next) !== contextKey(params)) {
			result = null;
			progress = null;
		}
		params = next;
		revision++;
		selectedId = 'current';
		verification = null;
		cad = null;
		error = '';
		notice = '';
	}
	function setStudy(next: Study) {
		study = next;
		running = false;
		overlay = 'material';
		if (next === 'engine' && tab !== 'operating') tab = 'motion';
		else if (tab === 'motion') tab = 'space';
	}
	function seek(value: number) {
		running = false;
		phase = value;
		studio?.setPhase(value);
	}
	function selectCandidate(id: string) {
		const candidate = (result?.candidates ?? localSweep).find((c) => c.id === id);
		if (!candidate) return;
		remember('candidate');
		cancelSearch();
		invalidateStructural();
		params = { ...params, ...Object.fromEntries(rodKeys.map((k) => [k, candidate.params[k]])) };
		revision++;
		selectedId = id;
		verification = null;
		cad = null;
		notice = '';
		error = '';
	}
	function applyBest() {
		if (result?.best) selectCandidate(result.best.id);
	}
	function reset() {
		remember('reset');
		cancelSearch();
		invalidateStructural();
		scenarioInputs = { ...DEFAULT_OPERATING_SCENARIO };
		experiments = [];
		params = { ...DEFAULT_DESIGN_PARAMS };
		baseline = { ...DEFAULT_DESIGN_PARAMS };
		lockedVolume = evaluateDesign(params).kinematics.displacementLiters;
		volumeLocked = true;
		result = null;
		progress = null;
		verification = null;
		cad = null;
		revision++;
		selectedId = 'current';
		notice = 'Baseline dimensions restored.';
		error = '';
	}
	function optimize() {
		cancelSearch();
		error = '';
		notice = '';
		result = null;
		progress = { evaluated: 0, total: 1681, feasible: 0 };
		study = 'rod';
		tab = 'space';
		running = false;
		optimizing = true;
		const id = `design-${++revision}`;
		jobId = id;
		try {
			worker = new Worker(new URL('../../lib/design/optimization.worker.ts', import.meta.url), {
				type: 'module'
			});
			worker.onmessage = (event: MessageEvent<OptimizationWorkerResponse>) => {
				const message = event.data;
				if (disposed || message.revision !== jobId) return;
				if (message.type === 'progress') progress = message.progress;
				else if (message.type === 'complete') {
					result = message.result;
					progress = {
						evaluated: result.evaluated,
						total: result.evaluated,
						feasible: result.feasibleCount
					};
					cancelSearch();
					selectedId = 'baseline';
					notice = result.best
						? 'Search complete. Select a candidate to inspect its geometry.'
						: 'No sampled design meets every limit. Review the specified loads.';
				} else {
					error = message.message;
					cancelSearch();
				}
			};
			worker.onerror = () => {
				error = 'The design search could not complete. Your geometry is preserved.';
				cancelSearch();
			};
			worker.postMessage({ type: 'optimize', revision: id, params: { ...params } });
		} catch (e) {
			error = e instanceof Error ? e.message : 'Worker unavailable.';
			cancelSearch();
		}
	}
	function verifyBeam() {
		verification = verifyDesign(params);
		tab = 'evidence';
		notice = verification.passed
			? 'Independent beam calculation agrees across four meshes.'
			: 'The numerical check needs review.';
	}
	function download(blob: Blob, name: string) {
		const url = URL.createObjectURL(blob),
			a = document.createElement('a');
		a.href = url;
		a.download = name;
		a.click();
		setTimeout(() => URL.revokeObjectURL(url), 1000);
	}
	function exportCase() {
		const payload = {
			schemaVersion: 1,
			title: 'Engine Lab parametric design study',
			createdAt: new Date().toISOString(),
			params,
			baseline,
			material: DESIGN_MATERIAL,
			limits: DESIGN_LIMITS,
			evaluation,
			layout,
			operating: { scenario, cycle: operatingCycle, selectedAngleDeg: cycleAngle },
			structuralAnalysis: structural,
			structuralContext,
			operatingExperiments: experiments,
			operatingSearch,
			beamVerification: verification,
			solidVerification: cad,
			search: result
				? {
						scope: result.scope,
						evaluated: result.evaluated,
						feasible: result.feasibleCount,
						pareto: result.pareto
					}
				: null,
			scope:
				'Authored design family. Ideal solid mass; Timoshenko beam screening and separately scoped operating/solid elastic fixture analyses when present. No combustion, bearing contact, fatigue, fuel-efficiency or manufacturing validation.'
		};
		download(
			new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }),
			'engine-lab-design-case.json'
		);
		notice = 'Case exported with parameters, assumptions and results.';
	}
	function exportMeasurements() {
		const rows = [
			['crank_angle_deg', 'displacement_mm', 'velocity_m_s', 'acceleration_m_s2', 'rod_angle_deg'],
			...curve.map((s) =>
				[s.angleDeg, s.displacementMm, s.velocityMps, s.accelerationMps2, s.rodAngleDeg].map((v) =>
					v.toPrecision(12)
				)
			)
		];
		download(
			new Blob([rows.map((r) => r.join(',')).join('\n')], { type: 'text/csv' }),
			'engine-lab-kinematics.csv'
		);
	}
	async function requestCad(format: 'step' | 'json') {
		if (cadBusy) return;
		cadBusy = true;
		error = '';
		cadAbort = new AbortController();
		const selected = { ...params },
			key = geometryKey(selected);
		try {
			const response = await exportRodCad(selected, { signal: cadAbort.signal });
			if (disposed || cadAbort.signal.aborted) return;
			if (format === 'step') {
				download(
					new Blob([new Uint8Array(response.step)], { type: 'application/step' }),
					'engine-lab-parametric-rod.step'
				);
				notice = 'Exact solid exported in this browser.';
			} else if (key === geometryKey(params)) {
				cad = response.report;
				tab = 'evidence';
				notice = 'Solid regenerated, measured and reimported in this browser.';
			}
		} catch (e) {
			if (!disposed && e instanceof Error && e.name !== 'AbortError') error = e.message;
		} finally {
			if (!disposed) {
				cadBusy = false;
				cadAbort = null;
			}
		}
	}
	function keyboard(event: KeyboardEvent) {
		if (
			(event.metaKey || event.ctrlKey) &&
			event.key.toLowerCase() === 'z' &&
			!(event.target instanceof HTMLElement && event.target.closest('input,textarea'))
		) {
			event.preventDefault();
			if (event.shiftKey) redo();
			else undo();
			return;
		}
		if (
			event.target instanceof HTMLElement &&
			event.target.closest('input,button,a,select,textarea,[role="button"]')
		)
			return;
		if (event.code === 'Space') {
			event.preventDefault();
			if (study === 'engine') running = !running;
		}
		if (event.key === 'Escape') {
			running = false;
			cancelSearch();
			if (structuralBusy || comparing) cancelOperatingWork();
		}
		if (event.key.toLowerCase() === 'f') studio?.resetView();
	}
	onDestroy(() => {
		disposed = true;
		disposeBrowserCad();
		cancelSearch();
		cadAbort?.abort();
		structuralAbort?.abort();
		operatingWorker?.terminate();
		operatingWorker = null;
	});
</script>

<svelte:head
	><title>{tab === 'operating' ? 'Analyze' : 'Design'} — V12 Diesel Engine Lab</title><meta
		name="description"
		content="Parametric cranktrain and connecting-rod studies for a V12 diesel concept. Measure geometry, explore mechanical tradeoffs and verify candidate designs."
	/></svelte:head
>
<svelte:window onkeydown={keyboard} />

<div class="design-app">
	<WorkbenchHeader
		active={tab === 'operating' ? 'analyze' : 'design'}
		onworkspace={changeWorkspace}
		context={`${studyName} · ${study === 'rod' ? 'Connecting rod' : 'V12 cranktrain'}`}
	>
		{#snippet actions()}
			<div class="header-actions">
				<button
					title="Undo · ⌘Z"
					aria-label="Undo study change"
					disabled={!undoStack.length}
					onclick={undo}><Icon name="undo" size={16} /></button
				>
				<button
					title="Redo · ⇧⌘Z"
					aria-label="Redo study change"
					disabled={!redoStack.length}
					onclick={redo}><Icon name="redo" size={16} /></button
				>
				<button class="quiet" onclick={() => (libraryOpen = !libraryOpen)}
					><Icon name="layers" size={16} />Studies{#if savedStudies.length}<span
							>{savedStudies.length}</span
						>{/if}</button
				>
				<button class="quiet" aria-label="Reset" onclick={reset}
					><Icon name="reset" size={16} /><span>Reset</span></button
				>
				<button class="export" aria-label="Export case" onclick={exportCase}
					><Icon name="arrow" size={16} /><span>Export case</span></button
				>
			</div>
		{/snippet}
	</WorkbenchHeader>
	<div class="workbench-tabs">
		<nav aria-label="Analysis panels">
			{#each [{ id: 'space', label: 'Design space', icon: 'grid' }, { id: 'operating', label: 'Operating loads', icon: 'fuel' }, { id: 'motion', label: 'Kinematics', icon: 'chart' }, { id: 'measurements', label: 'Measurements', icon: 'ruler' }, { id: 'evidence', label: 'Verification', icon: 'check' }] as item (item.id)}
				<button
					class:active={tab === item.id}
					aria-pressed={tab === item.id}
					aria-label={item.label}
					title={item.label}
					onclick={() => selectAnalysisTab(item.id as Tab)}
					><Icon name={item.icon as 'grid' | 'fuel' | 'chart' | 'ruler' | 'check'} size={16} /><span
						>{item.label}</span
					></button
				>
			{/each}
		</nav>
		<div class="layout-tools" aria-label="Workspace layout">
			<button
				aria-label="Toggle properties"
				aria-pressed={parametersVisible}
				title="Properties"
				onclick={() => (parametersVisible = !parametersVisible)}
				><Icon name="properties" size={17} /></button
			>
			{#each [{ id: 'model', label: 'Model', icon: 'cube' }, { id: 'split', label: 'Split', icon: 'split' }, { id: 'results', label: 'Results', icon: 'table' }] as item (item.id)}<button
					class:active={layoutMode === item.id}
					aria-label={`${item.label} layout`}
					aria-pressed={layoutMode === item.id}
					title={`${item.label} layout`}
					onclick={() => setLayout(item.id as typeof layoutMode)}
					><Icon name={item.icon as 'cube' | 'split' | 'table'} size={15} /><span>{item.label}</span
					></button
				>{/each}
			<button
				aria-label="Toggle result inspector"
				aria-pressed={inspectorVisible}
				title="Result inspector"
				onclick={() => (inspectorVisible = !inspectorVisible)}
				><Icon name="inspector" size={17} /></button
			>
		</div>
	</div>
	{#if previousAnalysis}<div class="outdated-notice" role="status">
			<Icon name="info" size={16} /><span
				>Previous results are out of date. The setup has changed.</span
			><button onclick={restorePreviousAnalysis}>Restore solved setup</button>
		</div>{/if}
	<main
		class="workspace"
		class:analysis-expanded={analysisExpanded}
		class:layout-model={layoutMode === 'model'}
		class:layout-results={layoutMode === 'results'}
		class:properties-hidden={!parametersVisible}
		class:inspector-hidden={!inspectorVisible}
		class:has-outdated={!!previousAnalysis}
		style:--analysis-height={`${analysisHeight}px`}
	>
		{#if libraryOpen}<StudyLibrary
				entries={savedStudies}
				busy={libraryBusy}
				error={libraryError}
				onsave={saveCurrentStudy}
				onload={openSavedStudy}
				onclose={() => (libraryOpen = false)}
			/>{/if}
		<aside class="parameters" aria-label="Design parameters">
			<div class="panel-intro">
				<h1>{tab === 'operating' ? 'Study setup' : 'Geometry'}</h1>
				<span class="property-scope"
					>{tab === 'operating' ? 'Connecting-rod structural study' : 'Generated mechanism'}</span
				>
			</div>
			<div class="study-switch" aria-label="Design study">
				<button
					class:active={study === 'rod'}
					aria-pressed={study === 'rod'}
					onclick={() => setStudy('rod')}><Icon name="settings" size={17} />Rod</button
				><button
					class:active={study === 'engine'}
					aria-pressed={study === 'engine'}
					onclick={() => setStudy('engine')}><Icon name="engine" size={17} />Cranktrain</button
				>
			</div>
			<div class="parameter-scroll">
				<details class="model-scope">
					<summary><Icon name="info" size={14} />Model scope</summary>
					<p>
						Bore, stroke and rod dimensions update the generated pistons, liners, cylinder spacing
						and crank geometry. The imported engine block, heads, valve train, manifolds and
						accessories do not adapt.
					</p>
					<p>
						Structural analysis applies to the connecting rod. Whole-engine performance is not being
						solved.
					</p>
				</details>
				{#if tab === 'operating'}
					<DesignOperatingControls
						{scenario}
						onchange={changeScenario}
						onpreset={operatingPreset}
						ongeometry={() => {
							tab = 'space';
							setStudy('rod');
						}}
					/>
				{:else if study === 'rod'}
					<div class="section-heading">
						<h2>I-section geometry</h2>
						<span>4 variables</span>
					</div>
					{#each rodKeys as key (key)}<DesignParameter
							label={parameterLabels[key]}
							value={params[key]}
							{...DESIGN_BOUNDS[key]}
							onchange={(v) => change(key, v)}
						/>{/each}
					<div class="interface-note">
						<Icon name="link" size={15} />
						<div>
							<strong>Bearing interfaces fixed</strong><span
								>Ø50 / Ø18 mm · {fmt(params.rodLengthMm, 0)} mm centres</span
							>
						</div>
					</div>
					<div class="section-heading divided">
						<h2>Applied load case</h2>
						<span>Assumed</span>
					</div>
					<DesignParameter
						label="Axial compression"
						value={params.loadKn}
						{...DESIGN_BOUNDS.loadKn}
						unit="kN"
						onchange={(v) => change('loadKn', v)}
					/>
					<DesignParameter
						label="Transverse centre load"
						value={params.lateralLoadN}
						{...DESIGN_BOUNDS.lateralLoadN}
						unit="N"
						onchange={(v) => change('lateralLoadN', v)}
					/>
					<p class="model-note">
						Uniform shank, pinned ends. First-order elastic screening with assumed steel properties.
					</p>
				{:else}
					<div class="section-heading">
						<h2>Engine architecture</h2>
						<span>60° V12</span>
					</div>
					<label class="check-row"
						><input
							type="checkbox"
							checked={volumeLocked}
							onchange={(e) => {
								volumeLocked = e.currentTarget.checked;
								lockedVolume = kine.displacementLiters;
							}}
						/><span
							>Hold displacement<span
								>{fmt(volumeLocked ? lockedVolume : kine.displacementLiters, 3)} litres</span
							></span
						><Icon name="link" size={16} /></label
					>
					<DesignParameter
						label="Cylinder bore"
						value={params.boreMm}
						{...boreBounds}
						onchange={(v) => change('boreMm', v)}
					/>
					<DesignParameter
						label="Stroke"
						value={params.strokeMm}
						{...DESIGN_BOUNDS.strokeMm}
						disabled={volumeLocked}
						note={volumeLocked ? 'Derived from bore to preserve displacement.' : ''}
						onchange={(v) => change('strokeMm', v)}
					/>
					<DesignParameter
						label="Rod centre distance"
						value={params.rodLengthMm}
						{...DESIGN_BOUNDS.rodLengthMm}
						onchange={(v) => change('rodLengthMm', v)}
					/>
					<div class="section-heading divided">
						<h2>Operating scenario</h2>
						<span>Assumed</span>
					</div>
					<DesignParameter
						label="Scenario speed"
						value={params.rpm}
						{...DESIGN_BOUNDS.rpm}
						unit="rpm"
						note="Used for velocity and acceleration. Playback is slowed independently."
						onchange={(v) => change('rpm', v)}
					/>
					<div class="interface-note">
						<Icon name="cylinder" size={16} />
						<div>
							<strong>Adaptive deck height</strong><span
								>{fmt(layout.deckHeightMm, 1)} mm · piston crown and liners follow the design envelope.</span
							>
						</div>
					</div>
					<p class="model-note">
						Generated architecture based on measured bore, stroke and rod length. No combustion or
						rated-power prediction.
					</p>
				{/if}
			</div>
			<button class="evidence-link" onclick={() => (tab = 'evidence')}
				><Icon name="info" size={16} /><span>Model & assumptions</span><Icon
					name="right"
					size={14}
				/></button
			>
		</aside>

		<section class="viewport" aria-label="Parametric design viewport" data-scene-ready={sceneReady}>
			<canvas aria-label="Interactive parametric 3D design" {@attach mountScene}></canvas>
			<div class="viewport-heading">
				<span class="eyebrow">{study === 'rod' ? 'Component / Rod' : 'Assembly / V12'}</span>
				<h2>{study === 'rod' ? 'Connecting rod' : 'V12 cranktrain'}</h2>
				<p>
					{structuralActive
						? `Browser solid analysis · ${structural?.analysisHash.slice(0, 8)}`
						: study === 'rod'
							? 'Generated solid · fixed bearing interfaces'
							: 'Parametric design derivative · 12 cylinders'}
				</p>
			</div>
			<div class="viewport-corner">
				<span class="live-indicator"></span>{sceneReady ? 'Geometry ready' : 'Loading geometry'}
			</div>
			{#if sceneError}<div class="scene-error" role="alert">{sceneError}</div>{/if}
			{#if structuralActive && structuralField !== 'material'}
				<div class="field-legend" aria-label="Solid field color scale">
					<strong
						>{structuralField === 'stress'
							? 'Recovered von Mises stress'
							: 'Displacement magnitude'}</strong
					>
					<div class="field-scale structural-scale"></div>
					<div class="field-ticks">
						<span>0</span><span>{structuralField === 'stress' ? '≥ 250 MPa' : '≥ 100 µm'}</span>
					</div>
					<small>Fixed scale · {deformationScale}× deformation</small>
				</div>
			{:else if study === 'rod' && overlay !== 'material' && tab !== 'operating'}
				<div class="field-legend" aria-label="Field color scale">
					<strong
						>{overlay === 'stress'
							? 'Longitudinal stress magnitude'
							: 'Transverse displacement'}</strong
					>
					<div class="field-scale"></div>
					<div class="field-ticks">
						<span>0</span><span
							>{overlay === 'stress'
								? `${fmt(rod.stressMpa, 1)} MPa`
								: `${fmt(rod.deflectionMm * 1000, 2)} µm`}</span
						>
					</div>
					<small>Shank only · ends unassessed</small>
				</div>
			{/if}
			<div class="camera-tools" aria-label="View orientation">
				{#each [{ id: 'front', label: 'Front', icon: 'front' }, { id: 'right', label: 'Right', icon: 'side' }, { id: 'top', label: 'Top', icon: 'top' }, { id: 'isometric', label: 'Iso', icon: 'cube' }] as view (view.id)}<button
						onclick={() =>
							studio?.setCameraView(view.id as 'front' | 'right' | 'top' | 'isometric')}
						aria-label={view.label}
						title={`${view.label} view`}
						><Icon name={view.icon as 'front' | 'side' | 'top' | 'cube'} size={14} /><span
							class="view-label">{view.label}</span
						></button
					>{/each}
				<span></span><button
					title={projection === 'perspective'
						? 'Switch to orthographic projection'
						: 'Switch to perspective projection'}
					aria-label="Toggle orthographic projection"
					aria-pressed={projection === 'orthographic'}
					onclick={() =>
						(projection = projection === 'perspective' ? 'orthographic' : 'perspective')}
					><Icon name="perspective" size={16} /><span class="view-label"
						>{projection === 'perspective' ? 'Perspective' : 'Orthographic'}</span
					></button
				>
				<button
					title={renderPreset === 'technical'
						? 'Switch to presentation lighting'
						: 'Switch to technical lighting'}
					aria-label="Toggle presentation lighting"
					aria-pressed={renderPreset === 'presentation'}
					onclick={() =>
						(renderPreset = renderPreset === 'technical' ? 'presentation' : 'technical')}
					><Icon name="lighting" size={16} /><span class="view-label"
						>{renderPreset === 'technical' ? 'Technical' : 'Presentation'}</span
					></button
				>
			</div>
			{#if structuralActive}<div class="probe-tools">
					<button
						class:active={probeEnabled}
						aria-pressed={probeEnabled}
						onclick={() => {
							probeEnabled = !probeEnabled;
							if (!probeEnabled) {
								probe = null;
								studio?.clearProbe();
							}
						}}><Icon name="target" size={16} />Probe surface</button
					>
				</div>{/if}
			{#if structuralActive && probeEnabled}<div class="probe-readout" aria-label="Surface probe">
					<header>
						<strong>Surface probe</strong><button
							aria-label="Clear surface probe"
							onclick={() => {
								probe = null;
								studio?.clearProbe();
							}}><Icon name="close" size={14} /></button
						>
					</header>
					{#if probe}
						<dl>
							<div>
								<dt>Recovered stress</dt>
								<dd>{fmt(probe.stressMpa, 2)} MPa</dd>
							</div>
							<div>
								<dt>Displacement</dt>
								<dd>{fmt(probe.displacementMagnitudeMm * 1000, 2)} µm</dd>
							</div>
							<div>
								<dt>X / Y / Z</dt>
								<dd>{probe.positionMm.map((v) => fmt(v, 2)).join(' / ')} mm</dd>
							</div>
						</dl>
						<small>Undeformed rod coordinates · recovered surface values</small>
						<button
							class="probe-export"
							onclick={() =>
								download(
									new Blob([JSON.stringify(probe, null, 2)], { type: 'application/json' }),
									'engine-lab-surface-probe.json'
								)}>Export probe<Icon name="arrow" size={14} /></button
						>
					{:else}<p>Click the solved surface to inspect its value.</p>{/if}
				</div>{/if}
			<div class="view-tools" aria-label="View controls">
				{#if study === 'rod'}
					<button
						class:active={dimensions}
						title="Dimensions"
						aria-label="Show dimensions"
						aria-pressed={dimensions}
						onclick={() => (dimensions = !dimensions)}><Icon name="side" size={18} /></button
					><button
						class:active={compare}
						title="Source baseline outline"
						aria-label="Show baseline outline"
						aria-pressed={compare}
						onclick={() => (compare = !compare)}><Icon name="layers" size={18} /></button
					>{#if tab !== 'operating'}<button
							class:active={forces}
							title="Load directions"
							aria-label="Show load directions"
							aria-pressed={forces}
							onclick={() => (forces = !forces)}><Icon name="arrow" size={18} /></button
						>{/if}{#if structuralActive}<button
							class:active={showBoundaryConditions}
							aria-label="Show solid boundary conditions"
							aria-pressed={showBoundaryConditions}
							title="Bearing load, fixture reaction and inertia resultant"
							onclick={() => (showBoundaryConditions = !showBoundaryConditions)}
							><Icon name="target" size={18} /></button
						>{/if}<span></span>
				{/if}
				<button title="Fit view · F" aria-label="Fit design" onclick={() => studio?.resetView()}
					><Icon name="expand" size={18} /></button
				>
			</div>
			{#if study === 'rod' && forces && !structuralActive && tab !== 'operating'}
				<div class="load-caption" aria-label="Applied shank loads">
					<span>{fmt(params.loadKn, 0)} kN axial</span>
					<span>{fmt(params.lateralLoadN, 0)} N transverse</span>
				</div>
			{/if}
			<div class="viewport-bottom">
				{#if structuralActive}
					<div class="structural-tools">
						<div class="render-options" aria-label="Solid field display">
							{#each [{ id: 'material', label: 'Material' }, { id: 'stress', label: 'Solid stress' }, { id: 'displacement', label: 'Displacement' }] as option (option.id)}
								<button
									class:active={structuralField === option.id}
									aria-pressed={structuralField === option.id}
									onclick={() => (structuralField = option.id as typeof structuralField)}
									>{option.label}</button
								>
							{/each}
							<button
								class:active={showMesh}
								aria-label="Show finite element mesh"
								aria-pressed={showMesh}
								onclick={() => (showMesh = !showMesh)}><Icon name="grid" size={16} /></button
							>
						</div>
						<div class="deformation-control">
							<label for="deformation-scale">Deformation</label><input
								id="deformation-scale"
								aria-label="Deformation amplification"
								type="range"
								min="1"
								max="150"
								step="1"
								bind:value={deformationScale}
							/><span>{deformationScale}×</span><button
								class:active={showUndeformed}
								aria-pressed={showUndeformed}
								aria-label="Show undeformed reference"
								title="Undeformed reference"
								onclick={() => (showUndeformed = !showUndeformed)}
								><Icon name="layers" size={15} /></button
							>
						</div>
					</div>
				{:else if study === 'rod' && tab === 'operating'}<div class="playback">
						<button onclick={() => setStudy('engine')}
							><Icon name="engine" size={16} />Cranktrain view</button
						>
						<label for="rod-load-phase">Load phase</label><input
							id="rod-load-phase"
							type="range"
							min="0"
							max="720"
							step="1"
							aria-label="Design crank angle"
							value={phase}
							oninput={(e) => seekCycle(+e.currentTarget.value)}
						/><span>{Math.round(phase)}°</span>
					</div>
				{:else if study === 'rod'}<div class="render-options" aria-label="Result display">
						{#each [{ id: 'material', label: 'Material' }, { id: 'stress', label: 'Shank stress' }, { id: 'displacement', label: 'Deflection' }] as option (option.id)}<button
								class:active={overlay === option.id}
								aria-pressed={overlay === option.id}
								onclick={() => (overlay = option.id as Overlay)}>{option.label}</button
							>{/each}
					</div>{:else}<div class="playback">
						<button
							class:playing={running}
							aria-label={running ? 'Pause design mechanism' : 'Run design mechanism'}
							onclick={() => (running = !running)}
							><Icon name={running ? 'pause' : 'play'} size={17} />{running
								? 'Pause'
								: 'Run'}</button
						><input
							aria-label="Design crank angle"
							type="range"
							min="0"
							max={tab === 'operating' ? 720 : 360}
							step="1"
							value={tab === 'operating' ? cycleAngle : phase}
							oninput={(e) =>
								tab === 'operating'
									? seekCycle(Number(e.currentTarget.value))
									: seek(Number(e.currentTarget.value))}
						/><span>{fmt(tab === 'operating' ? cycleAngle : phase, 0)}°</span><small
							>slow motion</small
						>
					</div>{/if}
				<div class="view-hint">
					<span>Drag to orbit · Scroll to zoom</span><span
						>{structuralActive
							? 'Solved solid mesh · amplified deformation is visual only'
							: tab === 'operating'
								? 'Forces on Bank A / station 1 · prescribed pressure'
								: study === 'rod'
									? overlay === 'material'
										? 'Millimetres · steel scenario'
										: overlay === 'stress'
											? 'Longitudinal stress · shank only'
											: 'Displacement field · shank only'
									: 'Geometric phase · no firing order asserted'}</span
					>
				</div>
			</div>
		</section>

		<aside class="results" aria-label="Design measurements and optimization">
			{#if tab === 'operating'}
				<DesignSolidResults
					result={structural ?? previousAnalysis?.structural ?? null}
					stale={!structural && !!previousAnalysis?.structural}
					resultContext={structuralContext
						? `${structuralContext.angleDeg}° · ${structuralContext.scenario.rpm.toLocaleString()} rpm · ${structural?.analysisHash.slice(0, 8) ?? ''}`
						: previousAnalysis
							? 'Previous setup · restore to inspect'
							: ''}
					busy={structuralBusy}
					error={structuralError}
					loadLabel={cycleLoadLabel}
					forceN={cycleSample.smallEndForceLocalN}
					onsolve={solveStructural}
					ondeeprefine={() => {
						if (structural) void solveStructural(true, structural);
					}}
					oncancel={cancelOperatingWork}
					onexport={exportStructural}
					onshow={() => {
						if (!structural && previousAnalysis) {
							restorePreviousAnalysis();
							return;
						}
						structuralVisible = true;
						study = 'rod';
						running = false;
					}}
					oncompare={compareOperatingCandidates}
					{comparing}
					{comparisonProgress}
				/>
			{:else}
				<div class="section-heading">
					<h2>Live measurements</h2>
					<span class="revision">REV {String(revision + 1).padStart(2, '0')}</span>
				</div>
				{#if study === 'rod'}
					<div class="primary-metric">
						<span>Generated rod mass</span>
						<div>{fmt(rod.massKg * 1000, 1)}<small>g</small></div>
						<p class:improved={massChange < -0.01}>
							{Math.abs(massChange) < 0.01
								? 'Baseline design'
								: `${massChange > 0 ? '+' : ''}${fmt(massChange, 1)}% versus baseline`}
						</p>
					</div>
					<div class="metric-pair">
						<div>
							<span>Nominal stress</span><strong>{fmt(rod.stressMpa, 1)}<small>MPa</small></strong>
						</div>
						<div>
							<span>Beam deflection</span><strong
								>{fmt(rod.deflectionMm * 1000, 2)}<small>µm</small></strong
							>
						</div>
					</div>
					<div class="constraint-heading">
						<h3>Beam screening limits</h3>
						<span class:failed={!rod.feasible}
							>{rod.feasible ? 'Beam screen passes' : 'OUTSIDE LIMITS'}</span
						>
					</div>
					<div class="constraints">
						{#each rod.constraints as constraint (constraint.id)}<div class="constraint">
								<div>
									<span>{constraint.label}</span><strong class:failed={!constraint.passed}
										>{fmt(constraint.utilization * 100, 0)}%</strong
									>
								</div>
								<div class="track">
									<span
										class:failed={!constraint.passed}
										style:width={`${Math.min(constraint.utilization * 100, 100)}%`}
									></span>
								</div>
								<small
									>{constraint.sense === 'max' ? '≤' : '≥'}
									{fmt(constraint.limit, constraint.id === 'deflection' ? 3 : 0)}
									{constraint.unit}</small
								>
							</div>{/each}
					</div>
					<div class="optimizer">
						<div class="optimizer-title">
							<Icon name="target" size={18} />
							<h3>Geometry search</h3>
						</div>
						<button
							class="primary"
							aria-label={optimizing ? 'Stop search' : 'Explore design space'}
							disabled={!sceneReady}
							onclick={optimizing ? cancelSearch : optimize}
							><Icon name={optimizing ? 'stop' : 'play'} size={17} />{optimizing
								? 'Stop search'
								: 'Explore design space'}<span
								>{optimizing && progress
									? `${Math.round((progress.evaluated / progress.total) * 100)}%`
									: '→'}</span
							></button
						>{#if progress}<div class="search-progress">
								<span>{progress.evaluated.toLocaleString()} evaluated</span><strong
									>{progress.feasible.toLocaleString()} feasible</strong
								>
							</div>{/if}{#if result?.best}<button class="apply-best" onclick={applyBest}
								>Inspect lightest feasible<Icon name="right" size={15} /></button
							>{/if}
						<button class="apply-best" onclick={() => openOperating()}
							>Evaluate operating loads<Icon name="right" size={15} /></button
						>
					</div>
				{:else}
					<div class="primary-metric">
						<span>Total swept volume</span>
						<div>{fmt(kine.displacementLiters, 3)}<small>L</small></div>
						<p>
							{volumeLocked ? 'Displacement constraint locked' : '12 × measured cylinder volume'}
						</p>
					</div>
					<div class="metric-pair">
						<div>
							<span>Mean piston speed</span><strong
								>{fmt(kine.meanPistonSpeedMps, 2)}<small>m/s</small></strong
							>
						</div>
						<div>
							<span>Rod / crank ratio</span><strong>{fmt(kine.rodRatio, 2)}<small>×</small></strong>
						</div>
					</div>
					<div class="motion-readout">
						<h3>At {fmt(phase, 0)}° crank angle</h3>
						<p class="motion-reference">Bank A · station 1 · 0° at top dead centre</p>
						<dl>
							<div>
								<dt>Piston travel from TDC</dt>
								<dd>{fmt(currentMotion.displacementMm, 2)} mm</dd>
							</div>
							<div>
								<dt>Piston velocity</dt>
								<dd>{fmt(currentMotion.velocityMps, 2)} m/s</dd>
							</div>
							<div>
								<dt>Piston acceleration</dt>
								<dd>{fmt(currentMotion.accelerationMps2, 0)} m/s²</dd>
							</div>
							<div>
								<dt>Rod angularity</dt>
								<dd>{fmt(currentMotion.rodAngleDeg, 2)}°</dd>
							</div>
						</dl>
					</div>
					<div class="optimizer">
						<div class="optimizer-title">
							<Icon name="link" size={18} />
							<h3>Displacement constraint</h3>
						</div>
						<p>
							Move the bore slider with displacement locked. Stroke and crank throw adapt together.
						</p>
						<button class="primary" onclick={() => setStudy('rod')}
							><Icon name="settings" size={17} />Optimize the rod<span>→</span></button
						>
					</div>
				{/if}
			{/if}
		</aside>

		<section class="analysis" aria-label="Design analysis">
			<div
				class="panel-resizer"
				role="slider"
				aria-label="Resize analysis panel"
				aria-orientation="vertical"
				aria-valuemin="220"
				aria-valuemax="600"
				aria-valuenow={analysisHeight}
				tabindex="0"
				onpointerdown={resizeAnalysis}
				onkeydown={(e) => {
					if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
						e.preventDefault();
						analysisHeight = Math.max(
							220,
							Math.min(600, analysisHeight + (e.key === 'ArrowUp' ? 25 : -25))
						);
					}
				}}
			></div>
			<div class="analysis-header">
				<h2>
					{tab === 'operating'
						? 'Operating analysis'
						: tab === 'space'
							? 'Design space'
							: tab === 'motion'
								? 'Kinematic results'
								: tab === 'measurements'
									? 'Measurements'
									: 'Verification'}
				</h2>
				{#if analysisExpanded && (comparing || structuralBusy)}
					<span class="analysis-progress" role="status"
						>{comparisonProgress || 'Meshing and solving…'}</span
					>
					<button class="stop-analysis" onclick={cancelOperatingWork}
						><Icon name="stop" size={13} />Stop analysis</button
					>
				{/if}
				<button
					class="expand-analysis"
					aria-label={analysisExpanded ? 'Restore analysis panel' : 'Expand analysis panel'}
					title={analysisExpanded ? 'Restore analysis panel' : 'Expand analysis panel'}
					onclick={() => setLayout(analysisExpanded ? 'split' : 'results')}
					><Icon name="expand" size={16} /></button
				>
			</div>
			{#if analysisExpanded && structuralError}
				<div class="analysis-error" role="alert">
					<Icon name="info" size={16} /><span>{structuralError}</span><button
						onclick={() => setLayout('split')}>Analysis controls</button
					>
				</div>
			{/if}
			<div
				class="analysis-content"
				class:operating-content={tab === 'operating'}
				class:comparison-content={tab === 'operating' && cycleChart === 'comparison'}
			>
				{#if tab === 'operating'}
					<div class="operating-dashboard">
						<div class="cycle-toolbar">
							<div class="cycle-tabs">
								<button
									class:active={cycleChart === 'loads'}
									onclick={() => selectCycleChart('loads')}
									><Icon name="chart" size={14} />Cycle loads</button
								><button
									class:active={cycleChart === 'comparison'}
									onclick={() => selectCycleChart('comparison')}
									><Icon name="table" size={14} />Candidate comparison{#if experiments.length}<span
											>{experiments.length}</span
										>{/if}</button
								>
								{#if operatingSearch}<button
										class:active={cycleChart === 'space'}
										onclick={() => selectCycleChart('space')}
										><Icon name="grid" size={14} />Design map</button
									>{/if}
								<button
									class:active={cycleChart === 'assistant'}
									onclick={() => selectCycleChart('assistant')}
									><Icon name="ai" size={13} />Assistant</button
								>
							</div>
							<div class="cycle-peaks">
								<button
									onclick={() => {
										seekCycle(compressionSample.angleDeg);
										cycleChart = 'loads';
									}}>Peak compression <span>{compressionSample.angleDeg}°</span></button
								><button
									onclick={() => {
										seekCycle(tensionSample.angleDeg);
										cycleChart = 'loads';
									}}>Peak tension <span>{tensionSample.angleDeg}°</span></button
								>
							</div>
						</div>
						{#if cycleChart === 'loads'}
							<div class="cycle-plots">
								<div>
									<DesignPlot
										lines={pressureLines}
										xLabel="Crank angle / ° · firing TDC at 0 / 720"
										yLabel="Cylinder pressure / bar abs"
										xDomain={[0, 720]}
										cursorX={cycleAngle}
									/>
									<div class="plot-legend">
										<span><i style="background:#ddb775"></i>Prescribed pressure</span><span
											>Four-stroke cycle · scenario</span
										>
									</div>
								</div>
								<div>
									<DesignPlot
										lines={bearingLines}
										xLabel="Crank angle / °"
										yLabel="Force / kN · positive compression"
										xDomain={[0, 720]}
										cursorX={cycleAngle}
									/>
									<div class="plot-legend">
										<span><i style="background:#78cec4"></i>Rod small-end axial</span><span
											><i style="background:#65798b"></i>Gas force</span
										>
									</div>
								</div>
							</div>
						{:else if cycleChart === 'space' && operatingSearch}
							<div class="operating-map">
								<div class="operating-map-plot">
									<DesignPlot
										points={operatingPoints}
										lines={[
											{
												id: 'limit',
												color: '#d0ac79',
												dashed: true,
												points: [
													{ x: Math.min(...operatingPoints.map((p) => p.x)), y: 250 },
													{ x: Math.max(...operatingPoints.map((p) => p.x)), y: 250 }
												]
											}
										]}
										selectedId={[
											params.rodWidthMm,
											params.rodDepthMm,
											params.webMm,
											params.flangeMm
										].join('/')}
										onselect={selectOperatingCandidate}
										xLabel="Generated solid mass / g"
										yLabel="Peak nominal stress / MPa"
									/>
									<div class="plot-legend">
										<span><i class="feasible"></i>Nominal screen passes</span><span
											><i class="rejected"></i>Outside nominal limit</span
										>
									</div>
								</div>
								<div class="map-note">
									<span class="eyebrow">{operatingSearch.evaluated} SHAPES · 3 CONDITIONS</span>
									<h3>Operating design search</h3>
									{#if operatingSearch.computation}
										{@const compute = operatingSearch.computation}
										<p
											aria-label="Operating search computation"
											class="compute-provenance"
											title={compute.fallbackReason ?? compute.note}
										>
											<strong
												>{compute.backend === 'webgpu' ? 'WebGPU · JAX-JS' : 'Browser CPU'}</strong
											>
											· {fmt(compute.totalMs, 0)} ms · {compute.precision}
										</p>
									{/if}
									<p>
										Each shape carries its own mass and inertia. Finalists are checked through 720°
										at 1° intervals.
									</p>
									<p>
										The dashed line is the assumed 250 MPa nominal limit. Select a shape to inspect
										it; local solid stresses require a separate solve.
									</p>
								</div>
							</div>
						{:else if cycleChart === 'comparison'}
							<div class="experiment-table">
								{#if experiments.length}
									{#if comparisonAssessment}<div
											class="comparison-assessment"
											class:pending={comparisonAssessment.status !== 'comparison-only'}
											aria-label="Comparison assessment"
										>
											<div>
												<strong
													>{structuralError
														? 'Comparison incomplete'
														: comparisonAssessment.status === 'comparison-only'
															? 'Numerical comparison complete'
															: comparisonAssessment.status === 'needs-refinement'
																? 'Further refinement required'
																: 'Comparison in progress'}</strong
												>
												<p>{comparisonAssessment.caption}</p>
											</div>
											<div class="comparison-numbers">
												<span
													><b>{fmt(comparisonAssessment.massReductionPercent ?? 0, 1)}%</b>lower
													mass</span
												><span
													><b
														>{(comparisonAssessment.maxDisplacementIncreasePercent ?? 0) >= 0
															? '+'
															: ''}{fmt(
															comparisonAssessment.maxDisplacementIncreasePercent ?? 0,
															1
														)}%</b
													>peak deflection</span
												>
											</div>
										</div>{/if}
									<div class="comparison-view-switch" aria-label="Comparison display">
										<button
											class:active={!splitComparison}
											aria-pressed={!splitComparison}
											onclick={() => (splitComparison = false)}
											><Icon name="grid" size={15} />Results table</button
										>
										<button
											class:active={splitComparison}
											aria-pressed={splitComparison}
											disabled={experiments.filter((entry) => entry.results.length).length < 2}
											onclick={() => (splitComparison = true)}
											><Icon name="layers" size={15} />Compare fields</button
										>
									</div>
									{#if splitComparison}
										<DesignComparison {experiments} oninspect={inspectExperiment} />
									{:else}
										<table>
											<thead
												><tr
													><th>Design / load case</th><th>Rod mass</th><th>Interior P95</th><th
														>Max displacement</th
													><th>Refinement</th><th></th></tr
												></thead
											><tbody>
												{#each experiments as experiment (experiment.id)}
													{#each experiment.results as solved (solved.report.analysisHash)}
														{@const report = solved.report}<tr
															><td
																><strong>{experiment.label}</strong><span
																	>{report.loadCase.label.split(' · ').slice(1).join(' · ')}</span
																></td
															><td
																>{fmt(rodMassProperties(experiment.params).massKg * 1000, 1)} g</td
															><td>{fmt(report.stats.interiorP95VonMisesMpa, 1)} MPa</td><td
																>{fmt(report.stats.maxDisplacementMm * 1000, 1)} µm</td
															><td class:needs-review={!report.convergence.withinScreeningTolerance}
																>{report.convergence.withinScreeningTolerance
																	? 'Mesh check passed'
																	: 'Review needed'}</td
															><td
																><button
																	disabled={comparing || structuralBusy}
																	onclick={() => inspectExperiment(experiment, solved)}
																	>Inspect<Icon name="right" size={13} /></button
																></td
															></tr
														>{/each}
													{#if !experiment.results.length}<tr
															><td>{experiment.label}</td><td
																>{fmt(rodMassProperties(experiment.params).massKg * 1000, 1)} g</td
															><td colspan="4"
																>{comparing ? 'Waiting for solver…' : 'No completed solve'}</td
															></tr
														>{/if}
												{/each}
											</tbody>
										</table>
										<p>
											Mesh check: displacement and strain-energy change &lt;8% between the final two
											meshes. Percentile stress describes the interior distribution; it is not a
											maximum-stress or fatigue acceptance criterion.
										</p>
									{/if}
								{:else}<div class="comparison-empty">
										<Icon name="layers" size={25} />
										<div>
											<h3>Compare rod designs</h3>
											<p>
												Screen a candidate, then compare both designs at the cycle’s compression and
												tension extremes. The solver may challenge the original screening result.
											</p>
										</div>
										<button
											disabled={comparing || structuralBusy}
											onclick={compareOperatingCandidates}
											>Run candidate comparison<Icon name="right" size={16} /></button
										>
									</div>{/if}
							</div>
						{/if}
						<div class="assistant-holder" hidden={cycleChart !== 'assistant'}>
							<DesignAssistant
								getEvidence={getAssistantEvidence}
								contextLabel={structural
									? structural.loadCase.label
									: `${studyName} · ${cycleLoadLabel}`}
							/>
						</div>
					</div>
				{:else if tab === 'space'}
					<div class="chart-area">
						<DesignPlot
							{points}
							lines={frontier.length
								? [{ id: 'frontier', points: frontier, color: '#6fc5bd' }]
								: []}
							xLabel="Generated mass / g"
							yLabel="Compliance / µm per kN"
							{selectedId}
							onselect={selectCandidate}
						/>
						<div class="plot-legend">
							<span><i class="feasible"></i>Feasible {result ? 'frontier' : 'width variants'}</span
							><span><i class="sampled"></i>Sampled</span><span
								><i class="rejected"></i>Outside limits</span
							>
						</div>
					</div>
					<div class="plot-context">
						<span class="eyebrow">{result ? 'THE TRADEOFF' : 'PARAMETER SWEEP'}</span>
						<h3>{result ? 'Less mass. More choice.' : 'Flange-width sensitivity'}</h3>
						<p>
							{result
								? 'Select a design. Lower and left means lighter and stiffer.'
								: 'This sweep varies flange width while holding the other dimensions fixed. Select a point to try it.'}
						</p>
						{#if featured.length}<div class="candidate-list">
								{#each featured as item (item.candidate.id)}<button
										class:active={selectedId === item.candidate.id}
										onclick={() => selectCandidate(item.candidate.id)}
										><span>{item.label}</span><strong
											>{fmt(item.candidate.rod.massKg * 1000, 1)} g</strong
										><Icon name="right" size={14} /></button
									>{/each}
							</div>{:else}<div class="formula">
								min mass(p)<br /><span>subject to stress and deflection<br />constraints</span>
							</div>{/if}
					</div>
				{:else if tab === 'motion'}
					<div class="chart-area">
						<DesignPlot
							lines={motionLines}
							xDomain={[0, 360]}
							xLabel="Crank angle / degrees"
							yLabel="Travel from TDC / mm"
							cursorX={phase}
						/>
						<div class="plot-legend">
							<span><i class="feasible"></i>Current geometry</span><span
								><i class="sampled"></i>Baseline</span
							>
						</div>
					</div>
					<div class="plot-context">
						<span class="eyebrow">KINEMATIC CLOSURE</span>
						<h3>One shared mechanism.</h3>
						<p>
							Position, velocity and acceleration come from the same slider–crank dimensions that
							drive the geometry.
						</p>
						<div class="formula">
							V = 12 × πB²S / 4<br /><span
								>B {fmt(params.boreMm, 2)} mm · S {fmt(params.strokeMm, 2)} mm</span
							>
						</div>
						<button class="text-action" onclick={exportMeasurements}
							>Export cycle measurements<Icon name="arrow" size={14} /></button
						>
					</div>
				{:else if tab === 'measurements'}
					<div class="measurement-table">
						<table>
							<thead><tr><th>Measurement</th><th>Baseline</th><th>Current</th></tr></thead><tbody
								>{#each measurements as row (row.name)}<tr
										><td>{row.name}</td><td>{fmt(row.base, row.digits)}</td><td
											>{fmt(row.now, row.digits)} <small>{row.unit}</small></td
										></tr
									>{/each}</tbody
							>
						</table>
					</div>
					<div class="plot-context">
						<span class="eyebrow">LOCAL SENSITIVITY</span>
						<h3>Which dimension matters?</h3>
						<p>Mass change per millimetre, evaluated at the current design.</p>
						<div class="sensitivity-list">
							{#each sensitivities as sensitivity (sensitivity.key)}<div>
									<span>{sensitivity.label}</span><strong>+{fmt(sensitivity.mass, 2)} g/mm</strong>
								</div>{/each}
						</div>
					</div>
				{:else}
					<div class="verification-panel">
						<div class="verify-actions">
							<button class="secondary" onclick={verifyBeam}
								><Icon name="check" size={16} />Verify beam solution</button
							><button class="secondary" disabled={cadBusy} onclick={() => void requestCad('json')}
								><Icon name="cube" size={16} />{cadBusy
									? 'Generating solid…'
									: 'Verify exact solid'}</button
							><button
								class="text-action"
								disabled={cadBusy}
								onclick={() => void requestCad('step')}
								>Download STEP<Icon name="arrow" size={14} /></button
							>
						</div>
						{#if verification}<div class="verify-result">
								<Icon name={verification.passed ? 'check' : 'info'} size={17} />
								<div>
									<strong
										>{verification.passed
											? 'Beam solution independently checked'
											: 'Beam check requires review'}</strong
									><span
										>4 / 8 / 16 / 32 elements · maximum relative error {verification.maxRelativeError.toExponential(
											2
										)}</span
									>
								</div>
							</div>{/if}{#if cad}<div class="verify-result">
								<Icon name={cad.valid && cad.stepRoundTripValid ? 'check' : 'info'} size={17} />
								<div>
									<strong
										>{cad.solidCount} valid solid · STEP round trip {cad.stepRoundTripValid
											? 'passed'
											: 'failed'}</strong
									><span
										>{fmt(cad.volumeMm3, 2)} mm³ · analytic volume error {cad.relativeVolumeError.toExponential(
											2
										)}</span
									>
								</div>
							</div>{/if}{#if !verification && !cad}<p class="verification-empty">
								Regenerate the solid and independently solve the beam. Checks are attached to the
								current design and cleared when it changes.
							</p>{/if}
					</div>
					<div class="plot-context scope">
						<span class="eyebrow">MODEL BOUNDARY</span>
						<h3>Know what is calculated.</h3>
						<p>
							Exact authored-family volume. Uniform-shank elastic beam response. Steel: E = 210 GPa,
							ρ = 7,850 kg/m³.
						</p>
						<button
							class="text-action"
							aria-expanded={detailsOpen}
							onclick={() => (detailsOpen = !detailsOpen)}
							>{detailsOpen ? 'Hide' : 'Read'} assumptions<Icon name="right" size={14} /></button
						>
					</div>
				{/if}
			</div>
		</section>
	</main>
	<footer class="statusbar">
		<div>
			<span class:failed={!rod.feasible} class="status-dot"></span><span
				>{error ||
					notice ||
					(study === 'rod'
						? `${activeConstraint.label} is the governing screen.`
						: 'Live geometry and measurements share one parameter set.')}</span
			>
		</div>
		<span class="status-scope"
			>DESIGN STUDY · {structuralActive
				? '3D LINEAR ELASTICITY'
				: tab === 'operating'
					? '720° OPERATING SCENARIO'
					: study === 'rod'
						? '1D SHANK MODEL'
						: 'ANALYTIC KINEMATICS'}</span
		>
	</footer>
	{#if error}<div class="error-toast" role="alert">
			<Icon name="info" size={18} />{error}<button
				aria-label="Dismiss error"
				onclick={() => (error = '')}><Icon name="close" size={16} /></button
			>
		</div>{/if}
	{#if detailsOpen}
		<dialog
			class="assumptions"
			aria-labelledby="assumptions-title"
			{@attach (node) => {
				node.showModal();
				return () => node.close();
			}}
			onclose={() => (detailsOpen = false)}
		>
			<button class="close" aria-label="Close assumptions" onclick={() => (detailsOpen = false)}
				><Icon name="close" size={20} /></button
			><span class="eyebrow">ENGINEERING SCOPE</span>
			<h2 id="assumptions-title">A reproducible design study.</h2>
			<p>
				This is a generated design family based on the source engine’s measured 85 mm bore, 100 mm
				stroke and 125 mm rod centres. Its end-eye outlines and I-section are authored study
				geometry.
			</p>
			<dl>
				<div>
					<dt>Geometry & mass</dt>
					<dd>
						Analytic union of two bearing eyes and a layered I-section. Exact-solid export uses the
						same dimensions. Density is an assumed steel property.
					</dd>
				</div>
				<div>
					<dt>Beam screening</dt>
					<dd>
						Simply supported, uniform shank with a central transverse force and axial compression.
						Nominal first-order stress and shear-inclusive Timoshenko deflection. Ideal Euler
						buckling exceeds the elastic material range here and is excluded from the feasibility
						screen. End-eye, bearing, shoulder stress concentrations, nonlinear effects and fatigue
						are outside this model.
					</dd>
				</div>
				<div>
					<dt>Operating loads & solid analysis</dt>
					<dd>
						The operating study uses an explicit pressure curve and assumed piston mass over 720°.
						Rigid-body dynamics supplies bearing forces and distributed rod inertia. Browser
						tetrahedral elasticity uses fixed big-bore restraints and prescribed small-bore
						traction. Refinement checks displacement and energy; sharp shoulders, contact pressure,
						local strength and fatigue require further investigation. The 500-shape operating search
						has a separate nominal stress criterion.
					</dd>
				</div>
				<div>
					<dt>Optimization</dt>
					<dd>
						A bounded four-variable grid. The frontier contains non-dominated sampled candidates; it
						is not a proof of a continuous global optimum. Stress and deflection limits are study
						assumptions.
					</dd>
				</div>
				<div>
					<dt>Numerical verification</dt>
					<dd>
						Independent finite-element beam stiffness assembly compared with the closed-form
						response. This validates the implementation of the stated beam model; it does not
						establish physical validity for a production rod.
					</dd>
				</div>
				<div>
					<dt>Engine architecture</dt>
					<dd>
						Geometric crank phases are an authored arrangement. No firing order, combustion, fuel
						consumption or rated-speed claim is made. Piston carrier height and cylinder pitch adapt
						to the design envelope; the deck is not fixed. Geometric envelope checks do not
						establish manufacturing or running clearances.
					</dd>
				</div>
			</dl>
			<button class="primary" onclick={() => (detailsOpen = false)}
				>Return to the study<Icon name="right" size={17} /></button
			>
		</dialog>
	{/if}
</div>

<style>
	.design-app {
		--gold: #d8ad68;
		--teal: #78cfc4;
		--border: #ffffff10;
		--ink: #e5ebef;
		--muted: #93a0aa;
		background: #090e12;
		color: var(--ink);
		min-height: 100svh;
		font-size: 13px;
	}
	.header-actions {
		margin-left: auto;
		display: flex;
		align-items: center;
		gap: 17px;
	}
	button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		color: inherit;
		background: none;
	}
	.quiet {
		color: #9eabb5;
		padding: 7px 0;
		font-size: 12px;
	}
	.export {
		border: 1px solid #ffffff20;
		padding: 7px 12px;
		border-radius: 5px;
		font-size: 12px;
		background: #ffffff04;
	}
	.workspace {
		display: grid;
		grid-template-columns: 252px minmax(340px, 1fr) 282px;
		grid-template-rows: minmax(450px, 1fr) 291px;
		height: calc(100svh - 91px);
		min-height: 741px;
		max-width: 2200px;
		margin: 0 auto;
	}
	.parameters {
		grid-row: 1/3;
		display: flex;
		flex-direction: column;
		background: #0b1116;
		border-right: 1px solid var(--border);
		min-height: 0;
	}
	.panel-intro {
		padding: 24px 22px 18px;
	}
	.eyebrow {
		font: 9px var(--mono);
		font-weight: 500;
		letter-spacing: 0.14em;
		color: #93a4b0;
	}
	.panel-intro h1 {
		font-size: 22px;
		letter-spacing: -0.8px;
		font-weight: 480;
		line-height: 1.25;
		margin: 12px 0 10px;
	}
	.study-switch {
		display: flex;
		margin: 0 20px 21px;
		background: #070c10;
		padding: 4px;
		border: 1px solid var(--border);
		border-radius: 6px;
		gap: 3px;
	}
	.study-switch button {
		flex: 1;
		min-width: 0;
		height: 32px;
		font-size: 12px;
		color: #94a3ad;
		border-radius: 3px;
	}
	.study-switch button.active {
		background: #243039;
		color: #edf2f3;
		box-shadow: 0 1px 3px #0005;
	}
	.parameter-scroll {
		padding: 0 22px 15px;
		flex: 1;
		overflow: auto;
	}
	.section-heading {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 5px;
		margin-bottom: 21px;
	}
	.section-heading h2 {
		font-size: 12px;
		font-weight: 550;
		margin: 0;
	}
	.section-heading > span {
		font-size: 10px;
		color: #788995;
		font-family: var(--mono);
	}
	.section-heading.divided {
		border-top: 1px solid var(--border);
		padding-top: 24px;
		margin-top: 23px;
	}
	.interface-note {
		border: 1px solid #ffffff0d;
		border-radius: 5px;
		display: flex;
		gap: 10px;
		padding: 11px 10px;
		color: #9cb1bd;
		background: #ffffff02;
	}
	.interface-note > :global(svg) {
		flex-shrink: 0;
		margin-top: 2px;
	}
	.interface-note strong {
		display: block;
		font-size: 11px;
		font-weight: 500;
		color: #c3ced4;
	}
	.interface-note span {
		font-size: 10px;
		display: block;
		margin-top: 4px;
		line-height: 1.6;
		color: #91a1ad;
	}
	.model-note {
		font-size: 11px;
		line-height: 1.65;
		color: #8d9ba6;
		margin: 18px 0 0;
	}
	.check-row {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 11px 10px;
		margin-bottom: 24px;
		border: 1px solid #ad8a4740;
		border-radius: 5px;
		background: #c2943709;
		color: #ccc6b6;
		font-size: 11px;
	}
	.check-row input {
		accent-color: #d8ad68;
	}
	.check-row > span {
		flex: 1;
	}
	.check-row span span {
		display: block;
		font: 10px var(--mono);
		color: #a89d85;
		margin-top: 3px;
	}
	.evidence-link {
		width: 100%;
		font-size: 11px;
		color: #a1adb5;
		padding: 15px 20px;
		border-top: 1px solid var(--border);
		justify-content: flex-start;
	}
	.evidence-link span {
		flex: 1;
	}
	.viewport {
		position: relative;
		min-height: 450px;
		overflow: hidden;
		background: radial-gradient(ellipse at 50% 45%, #18232c, #090f15 72%);
	}
	.viewport canvas {
		display: block;
		width: 100%;
		height: 100%;
		position: absolute;
		inset: 0;
		outline: none;
	}
	.viewport-heading {
		position: absolute;
		top: 27px;
		left: 29px;
		pointer-events: none;
	}
	.viewport-heading h2 {
		font-size: 27px;
		font-weight: 470;
		letter-spacing: -0.9px;
		margin: 10px 0 5px;
	}
	.viewport-heading p {
		font-size: 11px;
		color: #91a2af;
		margin: 0;
	}
	.viewport-heading .eyebrow {
		color: #b09569;
		font-size: 9px;
	}
	.viewport-corner {
		position: absolute;
		top: 28px;
		right: 24px;
		display: flex;
		align-items: center;
		gap: 7px;
		font: 8px var(--mono);
		color: #8595a1;
		letter-spacing: 0.12em;
	}
	.live-indicator {
		width: 4px;
		height: 4px;
		background: #73b6aa;
		border-radius: 50%;
	}
	.view-tools {
		position: absolute;
		left: 21px;
		top: 50%;
		transform: translateY(-30%);
		display: flex;
		flex-direction: column;
		border: 1px solid #ffffff16;
		background: #0c131bce;
		backdrop-filter: blur(16px);
		padding: 4px;
		border-radius: 7px;
	}
	.view-tools button {
		width: 33px;
		height: 33px;
		color: #8d9ca7;
		border-radius: 4px;
	}
	.view-tools button:hover,
	.view-tools button.active {
		color: #e0bb7c;
		background: #bc95551c;
	}
	.view-tools > span {
		border-top: 1px solid #ffffff13;
		margin: 4px;
	}
	.viewport-bottom {
		position: absolute;
		bottom: 18px;
		left: 23px;
		right: 23px;
		display: flex;
		flex-direction: column;
		gap: 16px;
		align-items: center;
	}
	.field-legend {
		position: absolute;
		right: 23px;
		bottom: 108px;
		width: 174px;
		padding: 11px 13px;
		border: 1px solid #ffffff12;
		border-radius: 6px;
		background: #0b131bd9;
		backdrop-filter: blur(16px);
		pointer-events: none;
	}
	.load-caption {
		position: absolute;
		top: 126px;
		left: 29px;
		display: flex;
		gap: 12px;
		font: 10px var(--mono);
		color: #efbf78;
		pointer-events: none;
	}
	.load-caption span:last-child {
		color: #78bfc8;
	}
	.field-legend strong {
		font-size: 10px;
		font-weight: 500;
		color: #c0cbd2;
	}
	.field-scale {
		height: 5px;
		margin: 10px 0 5px;
		border-radius: 2px;
		background: linear-gradient(90deg, #4b9dda, #ecd18d 55%, #f1744f);
	}
	.field-ticks {
		display: flex;
		justify-content: space-between;
		font: 10px var(--mono);
		color: #e0e6ea;
	}
	.field-legend small {
		display: block;
		margin-top: 7px;
		font-size: 9px;
		color: #91a0ac;
	}
	.render-options {
		display: flex;
		border: 1px solid #ffffff19;
		border-radius: 7px;
		background: #0b131bd9;
		backdrop-filter: blur(16px);
		padding: 4px;
	}
	.render-options button {
		padding: 7px 13px;
		border-radius: 4px;
		color: #91a0aa;
		font-size: 11px;
	}
	.render-options button.active {
		background: #29343dcf;
		color: #e8edf0;
	}
	.view-hint {
		display: flex;
		justify-content: space-between;
		gap: 10px;
		width: 100%;
		font-size: 9px;
		color: #7e919e;
	}
	.playback {
		display: flex;
		align-items: center;
		gap: 12px;
		background: #0b131bea;
		border: 1px solid #ffffff18;
		border-radius: 6px;
		padding: 7px 12px;
	}
	.playback button {
		font-size: 11px;
		color: #dbbd87;
	}
	.playback input {
		width: 120px;
		height: 3px;
		accent-color: #cba060;
	}
	.playback > span {
		font: 11px var(--mono);
		min-width: 32px;
	}
	.playback small {
		font-size: 10px;
		color: #8799a6;
	}
	.scene-error {
		position: absolute;
		top: 45%;
		left: 20%;
		right: 20%;
		padding: 18px;
		background: #1b1110;
		border: 1px solid #9b5449;
		color: #e0ada2;
		border-radius: 6px;
	}
	.results {
		min-height: 0;
		overflow-y: auto;
		padding: 25px 23px 22px;
		background: #0d141a;
		border-left: 1px solid var(--border);
	}
	.results .section-heading {
		margin-bottom: 14px;
	}
	.revision {
		font: 9px var(--mono) !important;
		border: 1px solid #ffffff10;
		border-radius: 3px;
		padding: 3px 5px;
		color: #a4b4c0 !important;
	}
	.primary-metric > span {
		font-size: 11px;
		color: #93a4b0;
	}
	.primary-metric > div {
		font-size: 48px;
		letter-spacing: -2.2px;
		font-weight: 420;
		line-height: 1.2;
		margin: 6px 0 5px;
		font-variant-numeric: tabular-nums;
	}
	.primary-metric small {
		font-size: 19px;
		letter-spacing: 0;
		color: #91a2ad;
		margin-left: 9px;
		font-weight: 400;
	}
	.primary-metric p {
		font-size: 11px;
		color: #8497a2;
		margin: 0;
	}
	.primary-metric p.improved {
		color: #76c9b6;
	}
	.metric-pair {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 12px;
		padding: 16px 0 17px;
		margin-bottom: 14px;
		border-bottom: 1px solid var(--border);
	}
	.metric-pair span {
		font-size: 10px;
		color: #91a1ad;
		display: block;
	}
	.metric-pair strong {
		display: block;
		font-size: 20px;
		font-weight: 460;
		letter-spacing: -0.4px;
		margin-top: 6px;
		font-variant-numeric: tabular-nums;
	}
	.metric-pair small {
		font-size: 10px;
		color: #879ba9;
		margin-left: 5px;
		font-weight: 400;
	}
	.constraint-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		margin-bottom: 12px;
	}
	.constraint-heading h3 {
		font-size: 11px;
		font-weight: 500;
		margin: 0;
	}
	.constraint-heading > span {
		font: 8px var(--mono);
		letter-spacing: 0.03em;
		color: #79bfb2;
	}
	.constraint {
		margin-bottom: 12px;
	}
	.constraint > div:first-child {
		display: flex;
		justify-content: space-between;
		font-size: 10px;
		color: #9aaab5;
		margin-bottom: 7px;
	}
	.constraint strong {
		font: 10px var(--mono);
		font-weight: 400;
		color: #b4c9d2;
	}
	.track {
		height: 3px;
		width: 100%;
		border-radius: 9px;
		background: #25303a;
		overflow: hidden;
	}
	.track span {
		height: 100%;
		display: block;
		background: #68a99e;
		border-radius: 9px;
		transition: width 0.22s;
	}
	.constraint small {
		font: 9px var(--mono);
		color: #718692;
		display: block;
		text-align: right;
		margin-top: 4px;
	}
	.failed {
		color: #dc9886 !important;
	}
	.track span.failed {
		background: #cf8c76;
	}
	.optimizer {
		padding-top: 17px;
		border-top: 1px solid var(--border);
		margin-top: 18px;
	}
	.optimizer > .primary {
		margin-top: 14px;
	}
	.optimizer-title {
		display: flex;
		align-items: center;
		gap: 9px;
		color: #c5af86;
	}
	.optimizer-title h3 {
		margin: 0;
		font-size: 12px;
		font-weight: 500;
		color: #ddd7ca;
	}
	.optimizer p {
		font-size: 11px;
		line-height: 1.6;
		color: #859aa8;
		margin: 9px 0 15px;
	}
	.primary {
		width: 100%;
		background: #d5ad6d;
		color: #182028;
		font-size: 12px;
		font-weight: 600;
		padding: 10px 13px;
		border-radius: 5px;
		justify-content: flex-start;
		min-height: 38px;
	}
	.primary:hover {
		background: #e5bd7c;
	}
	.primary > span {
		margin-left: auto;
	}
	.search-progress {
		display: flex;
		justify-content: space-between;
		gap: 5px;
		font: 9px var(--mono);
		color: #8499a8;
		margin-top: 11px;
	}
	.search-progress strong {
		font-weight: 400;
		color: #95b4a9;
	}
	.apply-best {
		margin-top: 12px;
		color: #cfb788;
		font-size: 11px;
		width: 100%;
		justify-content: space-between;
	}
	.motion-readout h3 {
		font-size: 12px;
		font-weight: 450;
		color: #b6c8d3;
		margin: 4px 0 7px;
	}
	.motion-reference {
		font-size: 10px;
		line-height: 1.5;
		color: #8095a4;
		margin: 0 0 17px;
	}
	.motion-readout dl {
		margin: 0;
	}
	.motion-readout dl div {
		display: flex;
		justify-content: space-between;
		gap: 8px;
		margin-bottom: 14px;
	}
	.motion-readout dt {
		color: #8fa3b0;
		font-size: 10px;
	}
	.motion-readout dd {
		font: 11px var(--mono);
		margin: 0;
		color: #d6e2e8;
	}
	.analysis {
		grid-column: 2/4;
		border-top: 1px solid var(--border);
		background: #0b1218;
		min-width: 0;
	}
	.analysis-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0 24px;
		border-bottom: 1px solid #ffffff09;
		height: 47px;
		gap: 16px;
	}
	.analysis-header button {
		font-size: 11px;
		color: #869ca9;
		border-bottom: 2px solid transparent;
		border-radius: 0;
		padding: 0;
	}
	.analysis-content {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 275px;
		min-height: 235px;
	}
	.chart-area {
		padding: 18px 26px 0 18px;
		min-width: 0;
	}
	.plot-context {
		padding: 22px 22px 15px;
		border-left: 1px solid var(--border);
	}
	.plot-context .eyebrow {
		font-size: 8px;
	}
	.plot-context h3 {
		font-size: 15px;
		font-weight: 480;
		letter-spacing: -0.3px;
		margin: 9px 0 9px;
	}
	.plot-context p {
		font-size: 11px;
		line-height: 1.65;
		color: #8fa3b0;
		margin: 0 0 13px;
	}
	.plot-legend {
		display: flex;
		align-items: center;
		gap: 19px;
		font-size: 9px;
		color: #94a7b2;
		padding-left: 52px;
		margin-top: 2px;
	}
	.plot-legend > span {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.plot-legend i {
		width: 5px;
		height: 5px;
		border-radius: 50%;
		background: #8099a6;
	}
	.plot-legend .feasible {
		background: #75cbbf;
	}
	.plot-legend .rejected {
		background: #96766f;
	}
	.formula {
		font: 12px var(--mono);
		line-height: 1.6;
		color: #cbb58f;
		margin-top: 17px;
	}
	.formula span {
		font-size: 10px;
		color: #8b9faa;
	}
	.candidate-list {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.candidate-list button {
		padding: 7px 8px;
		justify-content: flex-start;
		gap: 8px;
		background: #ffffff03;
		border-radius: 4px;
		font-size: 10px;
		color: #9db1bc;
		border: 1px solid transparent;
	}
	.candidate-list strong {
		font: 10px var(--mono);
		margin-left: auto;
		color: #c9d9df;
	}
	.candidate-list button.active {
		border-color: #caa96a4d;
		background: #a88a4112;
		color: #ddc494;
	}
	.text-action {
		color: #c5ae82;
		font-size: 11px;
		justify-content: flex-start;
		padding: 4px 0;
	}
	.measurement-table {
		padding: 12px 23px;
		overflow: auto;
	}
	table {
		border-collapse: collapse;
		width: 100%;
		font-size: 11px;
		text-align: left;
	}
	th {
		font-size: 9px;
		color: #8399a8;
		font-weight: 450;
		padding: 7px 0 11px;
		border-bottom: 1px solid var(--border);
	}
	td {
		padding: 9px 0;
		border-bottom: 1px solid #ffffff07;
		color: #bccbd4;
	}
	td:nth-child(2) {
		font: 11px var(--mono);
		color: #7f96a5;
	}
	td:last-child {
		font: 11px var(--mono);
		color: #dce6ea;
	}
	td small {
		font-size: 9px;
		color: #8297a5;
		margin-left: 3px;
	}
	.sensitivity-list > div {
		display: flex;
		justify-content: space-between;
		gap: 10px;
		font-size: 10px;
		margin-top: 9px;
		color: #9fb1bc;
	}
	.sensitivity-list strong {
		font: 10px var(--mono);
		color: #d0b98b;
	}
	.verification-panel {
		padding: 23px;
		min-width: 0;
	}
	.verify-actions {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 9px;
	}
	.secondary {
		padding: 8px 10px;
		border-radius: 5px;
		border: 1px solid #ffffff1b;
		background: #ffffff04;
		color: #baccd7;
		font-size: 11px;
	}
	.verify-actions > .text-action {
		margin-left: 4px;
	}
	.verify-result {
		display: flex;
		align-items: flex-start;
		gap: 10px;
		color: #80c9b6;
		margin-top: 18px;
	}
	.verify-result strong {
		display: block;
		color: #c2d4db;
		font-size: 11px;
		font-weight: 500;
	}
	.verify-result span {
		display: block;
		margin-top: 5px;
		color: #8cabb7;
		font: 9px var(--mono);
		line-height: 1.7;
		overflow-wrap: anywhere;
	}
	.verification-empty {
		font-size: 12px;
		line-height: 1.8;
		color: #8da2af;
		max-width: 440px;
		margin-top: 25px;
	}
	.statusbar {
		height: 34px;
		border-top: 1px solid #ffffff10;
		background: #090f14;
		padding: 0 22px;
		display: flex;
		justify-content: space-between;
		align-items: center;
		color: #8da1ae;
		gap: 18px;
	}
	.statusbar > div {
		display: flex;
		align-items: center;
		gap: 8px;
		min-width: 0;
		font-size: 10px;
	}
	.statusbar > div > span:last-child {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.status-dot {
		width: 4px;
		height: 4px;
		flex-shrink: 0;
		background: #6dbaaa;
		border-radius: 50%;
	}
	.status-dot.failed {
		background: #c9967d;
	}
	.status-scope {
		font: 8px var(--mono);
		letter-spacing: 0.07em;
		white-space: nowrap;
		color: #6d8493;
	}
	.error-toast {
		position: fixed;
		left: 50%;
		bottom: 45px;
		transform: translateX(-50%);
		z-index: 20;
		max-width: 600px;
		background: #271a16ef;
		border: 1px solid #b271574d;
		color: #e1b5a2;
		border-radius: 7px;
		padding: 13px 15px;
		display: flex;
		align-items: center;
		gap: 12px;
		font-size: 12px;
	}
	.error-toast button {
		margin-left: 20px;
	}
	.assumptions::backdrop {
		background: #0009;
		backdrop-filter: blur(8px);
	}
	.assumptions {
		position: relative;
		width: min(620px, 100%);
		max-height: 90svh;
		overflow: auto;
		background: #101920;
		border: 1px solid #3c4b56;
		border-radius: 12px;
		padding: 34px;
		box-shadow: 0 20px 90px #0009;
	}
	.assumptions h2 {
		font-size: 27px;
		font-weight: 450;
		letter-spacing: -0.8px;
	}
	.assumptions p {
		color: #b5c5ce;
		font-size: 13px;
		line-height: 1.8;
	}
	.assumptions dl {
		margin: 26px 0;
	}
	.assumptions dl > div {
		border-top: 1px solid #ffffff13;
		padding-top: 14px;
		margin-top: 14px;
	}
	.assumptions dt {
		font-size: 12px;
		font-weight: 550;
		color: #dbc190;
	}
	.assumptions dd {
		margin: 7px 0 0;
		font-size: 12px;
		line-height: 1.7;
		color: #a3b7c4;
	}
	.assumptions .close {
		position: absolute;
		right: 20px;
		top: 20px;
		color: #90a5b3;
	}
	.assumptions .primary {
		justify-content: space-between;
	}
	.analysis-content.operating-content {
		display: block;
		padding: 0;
	}
	.assistant-holder {
		height: calc(100% - 38px);
		min-height: 214px;
	}
	.analysis-header .expand-analysis {
		width: 29px;
		min-width: 29px;
		height: 29px;
		padding: 0;
		margin-left: 10px;
		border: 1px solid var(--border);
		border-radius: 4px;
		color: #92a8b8;
	}
	.analysis-header .expand-analysis:hover {
		color: #dfc692;
		background: #ffffff08;
	}
	@media (min-width: 951px) {
		.workspace.analysis-expanded {
			grid-template-rows: minmax(330px, 1fr) 410px;
		}
	}
	@media (max-width: 950px) {
		.analysis-header .expand-analysis {
			display: none;
		}
	}
	.assistant-holder[hidden] {
		display: none;
	}
	.operating-map {
		display: grid;
		grid-template-columns: minmax(320px, 1fr) 260px;
		gap: 0;
	}
	.operating-map-plot {
		padding: 0 15px;
		min-width: 0;
	}
	.operating-map .plot-legend {
		margin: 0 0 10px 42px;
	}
	.map-note {
		padding: 20px 22px;
		border-left: 1px solid var(--border);
	}
	.map-note h3 {
		font-size: 16px;
		font-weight: 500;
		color: #d5e1e7;
		margin: 10px 0;
	}
	.map-note p {
		font-size: 11px;
		line-height: 1.7;
		color: #91a8b7;
		margin: 8px 0;
	}
	.comparison-assessment {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 20px;
		background: #7bafac0b;
		border: 1px solid #7bafac2b;
		border-radius: 5px;
		padding: 10px 13px;
		margin: 1px 0 12px;
	}
	.comparison-assessment.pending {
		background: #b8945b0b;
		border-color: #b8945b2b;
	}
	.comparison-assessment strong {
		font-size: 12px;
		color: #ccdfe1;
		font-weight: 500;
	}
	.comparison-assessment p {
		font-size: 10px;
		line-height: 1.6;
		color: #91a7b5;
		margin: 4px 0 0;
		max-width: 650px;
	}
	.comparison-numbers {
		display: flex;
		flex-shrink: 0;
		gap: 24px;
	}
	.comparison-numbers span {
		font-size: 9px;
		color: #91a7b5;
		white-space: nowrap;
	}
	.comparison-numbers b {
		display: block;
		color: #d5c4a0;
		font-size: 21px;
		font-weight: 500;
		letter-spacing: -0.3px;
		font-variant-numeric: tabular-nums;
		margin-bottom: 3px;
	}
	.operating-dashboard {
		width: 100%;
		min-width: 0;
		height: 100%;
		overflow: auto;
	}
	.cycle-toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 9px 21px 1px;
		gap: 12px;
	}
	.cycle-tabs,
	.cycle-peaks {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.cycle-tabs button {
		font-size: 11px;
		color: #91a4b3;
		padding: 4px 0;
		border-bottom: 1px solid transparent;
	}
	.cycle-tabs button.active {
		color: #ddd3bb;
		border-color: #d4ac6c;
	}
	.cycle-tabs span {
		font: 9px var(--mono);
		padding: 2px 4px;
		background: #ffffff0a;
		border-radius: 3px;
	}
	.cycle-peaks button {
		font-size: 10px;
		color: #a8bac7;
		gap: 5px;
	}
	.cycle-peaks span {
		font-family: var(--mono);
		color: #d2b780;
		font-size: 9px;
	}
	.cycle-plots {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0;
	}
	.cycle-plots > div {
		min-width: 0;
		padding: 0 15px;
	}
	.cycle-plots > div + div {
		border-left: 1px solid var(--border);
	}
	.cycle-plots .plot-legend {
		margin: 0 0 10px 42px;
		gap: 14px;
		font-size: 9px;
	}
	.experiment-table {
		overflow: auto;
		padding: 9px 23px;
	}
	.experiment-table table {
		width: 100%;
		border-collapse: collapse;
		font-size: 11px;
		text-align: left;
	}
	.experiment-table th {
		font-weight: 500;
		color: #91a6b5;
		padding: 7px 12px;
		white-space: nowrap;
		font-size: 10px;
	}
	.experiment-table td {
		padding: 8px 12px;
		border-top: 1px solid var(--border);
		color: #bfd1da;
		white-space: nowrap;
		font-variant-numeric: tabular-nums;
	}
	.experiment-table td:first-child {
		padding-left: 0;
	}
	.experiment-table th:first-child {
		padding-left: 0;
	}
	.experiment-table strong {
		display: block;
		font-size: 11px;
		font-weight: 500;
		color: #d2dfe6;
	}
	.experiment-table td span {
		display: block;
		font-size: 9px;
		color: #8b9fae;
		margin-top: 4px;
	}
	.experiment-table td button {
		font-size: 10px;
		color: #d4b989;
	}
	.experiment-table td.needs-review {
		color: #deb382;
	}
	.experiment-table > p {
		font-size: 10px;
		color: #8ca1b2;
		line-height: 1.6;
		margin: 9px 0 0;
	}
	.comparison-empty {
		display: flex;
		align-items: center;
		gap: 22px;
		padding: 25px 12px;
		color: #b69c76;
	}
	.comparison-empty > div {
		max-width: 440px;
	}
	.comparison-empty h3 {
		color: #d5e1e7;
		font-size: 16px;
		font-weight: 500;
		margin: 0 0 10px;
	}
	.comparison-empty p {
		color: #92a7b7;
		font-size: 12px;
		line-height: 1.7;
		margin: 0;
	}
	.comparison-empty button {
		margin-left: auto;
		font-size: 11px;
		color: #dec490;
		background: #a9895020;
		border: 1px solid #cda96430;
		border-radius: 5px;
		padding: 10px 12px;
		white-space: nowrap;
	}
	.structural-scale {
		background: linear-gradient(to right, #4b9dda, #ecd18d, #f1744f);
	}
	.structural-tools {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
		justify-content: center;
	}
	.deformation-control {
		display: flex;
		align-items: center;
		gap: 9px;
		background: #0a1118e8;
		border: 1px solid #ffffff14;
		border-radius: 6px;
		padding: 9px 11px;
	}
	.deformation-control label {
		font-size: 10px;
		color: #9fb2c1;
	}
	.deformation-control input {
		width: 75px;
		accent-color: #d7ae70;
		height: 12px;
	}
	.deformation-control span {
		font: 10px var(--mono);
		color: #dbc394;
		min-width: 25px;
	}
	.deformation-control button {
		padding: 0;
		color: #8093a2;
	}
	.deformation-control button.active {
		color: #c2d9e0;
	}
	@media (max-width: 950px) {
		.operating-map {
			grid-template-columns: 1fr;
		}
		.map-note {
			padding: 16px;
			border-top: 1px solid var(--border);
			border-left: 0;
		}
		.comparison-assessment {
			min-width: 480px;
		}
		.assistant-holder {
			min-height: 290px;
		}
		.cycle-toolbar {
			flex-wrap: wrap;
			padding: 12px 17px;
		}
		.cycle-plots {
			grid-template-columns: 1fr;
		}
		.cycle-plots > div + div {
			border-left: 0;
			border-top: 1px solid var(--border);
		}
		.cycle-plots .plot-legend {
			margin-bottom: 15px;
		}
		.comparison-empty {
			flex-wrap: wrap;
			padding: 20px 0;
			gap: 14px;
		}
		.comparison-empty button {
			margin: 0;
		}
	}
	@media (max-width: 640px) {
		.cycle-tabs {
			gap: 16px;
		}
		.cycle-peaks {
			width: 100%;
			justify-content: space-between;
		}
		.structural-tools {
			max-width: 100%;
			gap: 5px;
		}
		.structural-tools .render-options {
			padding: 3px;
		}
		.structural-tools .render-options button {
			font-size: 10px;
			padding: 6px 8px;
		}
		.deformation-control {
			padding: 6px 9px;
		}
		.experiment-table {
			padding: 12px 17px;
		}
	}
	@media (min-width: 1650px) {
		.workspace {
			grid-template-columns: 280px minmax(400px, 1fr) 310px;
			grid-template-rows: minmax(450px, 1fr) 305px;
		}
		.panel-intro {
			padding-top: 30px;
		}
		.analysis-content {
			grid-template-columns: minmax(0, 1fr) 310px;
		}
		.viewport-heading h2 {
			font-size: 32px;
		}
		.parameter-scroll {
			padding-left: 25px;
			padding-right: 25px;
		}
		.results {
			padding: 30px 27px;
		}
		.primary-metric > div {
			font-size: 55px;
		}
	}
	@media (max-width: 1180px) {
		.workspace {
			grid-template-columns: 230px minmax(300px, 1fr) 240px;
			grid-template-rows: minmax(485px, 1fr) auto;
		}
		.results {
			padding: 24px 17px;
		}
		.analysis-header {
			padding: 0 18px;
		}
		.analysis-content {
			grid-template-columns: minmax(0, 1fr) 235px;
		}
		.plot-context {
			padding: 20px 16px;
		}
		.view-hint span:last-child {
			display: none;
		}
		.viewport-corner {
			display: none;
		}
		.primary-metric > div {
			font-size: 42px;
		}
		.panel-intro h1 {
			font-size: 20px;
		}
		.constraint-heading > span {
			font-size: 7px;
		}
		.plot-legend {
			padding-left: 36px;
			gap: 10px;
		}
	}
	@media (max-width: 950px) {
		.workspace {
			height: auto;
			grid-template-columns: 220px minmax(0, 1fr);
			grid-template-rows: 490px auto auto;
		}
		.parameters {
			grid-row: 1/3;
		}
		.viewport {
			grid-column: 2;
		}
		.results {
			grid-column: 2;
			grid-row: 2;
			display: grid;
			grid-template-columns: 1fr 1fr;
			gap: 15px 22px;
			border-top: 1px solid var(--border);
			border-left: 0;
		}
		.results > .section-heading {
			grid-column: 1/3;
			margin: 0;
		}
		.primary-metric {
			grid-column: 1;
		}
		.metric-pair {
			grid-column: 2;
			border: 0;
			margin: 0;
			padding: 4px 0;
		}
		.constraint-heading {
			grid-column: 1;
			margin: 0;
		}
		.constraints {
			grid-column: 1;
		}
		.optimizer {
			grid-column: 2;
			grid-row: 3/5;
			margin: 0;
			padding-top: 0;
			border: 0;
		}
		.motion-readout {
			grid-column: 1;
		}
		.analysis {
			grid-column: 1/3;
			grid-row: 3;
		}
		.analysis-content {
			grid-template-columns: minmax(0, 1fr) 250px;
		}
		.view-hint {
			font-size: 8px;
		}
	}
	@media (max-width: 640px) {
		.header-actions {
			gap: 10px;
		}
		.header-actions button {
			padding: 5px;
		}
		.header-actions button span {
			display: none;
		}
		.workspace {
			display: flex;
			flex-direction: column;
		}
		.viewport {
			order: 0;
			min-height: 430px;
		}
		.viewport-heading {
			left: 22px;
			right: 22px;
			top: 24px;
		}
		.viewport:has(.field-legend) {
			min-height: 560px;
		}
		.viewport:has(.field-legend) .viewport-bottom {
			bottom: 76px;
		}
		.viewport:has(.field-legend) .view-hint {
			display: none;
		}
		.field-legend {
			left: 15px;
			right: 15px;
			bottom: 16px;
			width: auto;
			display: grid;
			grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
			gap: 4px 12px;
			padding: 10px;
		}
		.field-legend .field-scale {
			margin: 5px 0 0;
		}
		.field-legend .field-ticks {
			grid-column: 2;
			grid-row: 2;
		}
		.field-legend small {
			grid-column: 1;
			grid-row: 2;
			margin: 0;
		}
		.viewport-heading h2 {
			font-size: 26px;
		}
		.view-tools {
			left: 14px;
		}
		.viewport-bottom {
			left: 15px;
			right: 15px;
		}
		.view-hint {
			font-size: 9px;
		}
		.parameters {
			order: 2;
			border-top: 1px solid var(--border);
			border-right: 0;
		}
		.panel-intro {
			padding: 21px 22px 12px;
		}
		.panel-intro h1 {
			font-size: 22px;
		}
		.study-switch {
			position: absolute;
			top: 186px;
			left: 0;
			z-index: 2;
			background: #111b25cc;
			backdrop-filter: blur(12px);
			width: 210px;
			margin: 0 20px;
		}
		.parameter-scroll {
			display: grid;
			grid-template-columns: 1fr 1fr;
			gap: 0 24px;
			padding-top: 8px;
		}
		.parameter-scroll > .section-heading,
		.interface-note,
		.model-note,
		.check-row {
			grid-column: 1/3;
		}
		.results {
			order: 1;
			display: grid;
			padding: 22px;
			grid-template-columns: 1fr 1fr;
			gap: 17px 20px;
		}
		.results > .section-heading {
			grid-column: 1/3;
		}
		.primary-metric > div {
			font-size: 38px;
		}
		.metric-pair {
			gap: 9px;
			align-items: center;
		}
		.metric-pair strong {
			font-size: 18px;
		}
		.constraint-heading {
			grid-column: 1;
		}
		.constraints {
			grid-column: 1;
		}
		.optimizer {
			grid-column: 2;
			grid-row: 3/5;
		}
		.optimizer-title h3 {
			font-size: 11px;
		}
		.optimizer p {
			font-size: 10px;
		}
		.primary {
			font-size: 11px;
			padding: 10px;
		}
		.search-progress {
			font-size: 8px;
			flex-wrap: wrap;
		}
		.constraint-heading > span {
			font-size: 7px;
		}
		.constraint-heading h3 {
			font-size: 10px;
		}
		.analysis {
			order: 3;
		}
		.analysis-header {
			padding: 0 15px;
			overflow: auto;
			height: 50px;
		}
		.analysis-header button {
			font-size: 10px;
			white-space: nowrap;
		}
		.analysis-header button :global(svg) {
			display: none;
		}
		.analysis-content {
			display: flex;
			flex-direction: column;
		}
		.chart-area {
			padding: 21px 10px 10px;
		}
		.plot-context {
			border-left: 0;
			border-top: 1px solid var(--border);
			padding: 20px 24px;
		}
		.plot-context h3 {
			font-size: 18px;
		}
		.plot-context p {
			font-size: 12px;
		}
		.candidate-list {
			flex-direction: column;
		}
		.candidate-list button {
			padding: 10px;
			font-size: 12px;
		}
		.statusbar {
			position: sticky;
			bottom: 0;
			z-index: 10;
			padding: 0 14px;
		}
		.status-scope {
			display: none;
		}
		.statusbar > div {
			font-size: 9px;
		}
		.verification-panel {
			padding: 22px 18px;
		}
		.verification-empty {
			font-size: 12px;
		}
		.assumptions {
			padding: 27px 22px;
		}
		.assumptions h2 {
			font-size: 23px;
		}
		.error-toast {
			width: calc(100% - 28px);
			font-size: 11px;
		}
		.measurement-table {
			padding: 16px;
		}
		td,
		td:nth-child(2),
		td:last-child {
			font-size: 10px;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		* {
			transition: none !important;
		}
	}
	/* Workbench layout: controls retain their positions as the study changes. */
	.design-app {
		--accent: #82b3e8;
		--gold: #82b3e8;
		--border: #ffffff16;
		background: #0d1116;
		color: #dce3ec;
	}
	.header-actions {
		gap: 5px;
		margin: 0;
	}
	.header-actions button {
		font-size: 13px;
		min-height: 30px;
		padding: 6px 9px;
		border: 1px solid #ffffff19;
		border-radius: 3px;
	}
	.header-actions button:disabled {
		opacity: 0.35;
		cursor: default;
	}
	.revision {
		font: 11px var(--mono);
		color: #a7b4c3;
	}
	.layout-tools {
		flex-shrink: 0;
		border-left: 1px solid var(--border);
		padding-left: 10px;
		display: flex;
		align-items: center;
		gap: 3px;
	}
	.layout-tools button {
		padding: 5px 10px;
		min-height: 29px;
		font-size: 12px;
		border: 1px solid transparent;
		border-radius: 3px;
	}
	.layout-tools button.active {
		background: #273b51;
		color: #dcecff;
		border-color: #567899;
	}
	.workbench-tabs {
		height: 44px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		background: #151b23;
		border-bottom: 1px solid var(--border);
		padding: 0 10px;
		gap: 12px;
	}
	.workbench-tabs nav {
		min-width: 0;
		overflow-x: auto;
		scrollbar-width: none;
		display: flex;
		height: 100%;
		gap: 4px;
	}
	.workbench-tabs nav button {
		padding: 0 10px;
		font-size: 13px;
		border-bottom: 2px solid transparent;
		color: #aebbc9;
		white-space: nowrap;
	}
	.workbench-tabs nav button.active {
		border-bottom-color: #82b3e8;
		color: #e9f1fa;
		background: #ffffff05;
	}
	.outdated-notice {
		height: 38px;
		display: flex;
		gap: 10px;
		align-items: center;
		background: #332b1d;
		border-bottom: 1px solid #7a6131;
		color: #e6c994;
		padding: 0 18px;
		font-size: 12px;
	}
	.outdated-notice button {
		margin-left: auto;
		text-decoration: underline;
		font-size: 12px;
	}
	.workspace {
		position: relative;
		height: calc(100svh - 124px);
		min-height: 0;
		max-width: none;
		grid-template-columns: 280px minmax(340px, 1fr) 302px;
		grid-template-rows: minmax(250px, 1fr) var(--analysis-height, 290px);
	}
	.workspace.has-outdated {
		height: calc(100svh - 162px);
	}
	.parameters {
		background: #141a21;
	}
	.panel-intro {
		padding: 12px 14px 9px;
	}
	.panel-intro h1 {
		font-size: 15px;
		font-weight: 600;
		letter-spacing: 0;
		margin: 0 0 6px;
	}
	.model-scope {
		border-bottom: 1px solid var(--border);
		padding: 0 0 10px;
		margin-bottom: 12px;
		font-size: 12px;
		color: #a9b5c3;
	}
	.model-scope summary {
		cursor: pointer;
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.model-scope summary::after {
		content: '+';
		margin-left: auto;
		color: #8093a8;
	}
	.model-scope[open] summary::after {
		content: '−';
	}
	.model-scope p {
		margin: 9px 0 0;
		line-height: 1.55;
	}
	.model-scope summary:focus-visible {
		outline: 2px solid #86ade0;
		outline-offset: 3px;
	}
	.property-scope {
		font-size: 12px;
		color: #a4afbc;
	}
	.study-switch {
		margin: 0 14px 10px;
		border-radius: 3px;
		padding: 2px;
	}
	.study-switch button {
		border-radius: 2px;
		font-size: 13px;
	}
	.study-switch button.active {
		background: #293746;
		color: #e3edf7;
	}
	.parameter-scroll {
		padding: 0 14px 14px;
	}
	.section-heading h2 {
		font-size: 13px;
		font-weight: 600;
	}
	.section-heading span {
		font-size: 11px;
		color: #a7b1bf;
	}
	.interface-note {
		border-radius: 3px;
		padding: 10px;
		margin: 8px 0 18px;
	}
	.interface-note strong,
	.interface-note span,
	.model-note {
		font-size: 12px;
	}
	.section-heading.divided {
		margin-top: 14px;
		padding-top: 14px;
	}
	.evidence-link {
		padding: 11px 18px;
		font-size: 12px;
	}
	.viewport {
		min-height: 0;
		background: #10161e;
	}
	.viewport-heading {
		top: 15px;
		left: 20px;
		right: 222px;
	}
	.viewport-heading h2 {
		font-size: 20px;
		letter-spacing: -0.4px;
		margin: 4px 0 6px;
	}
	.viewport-heading .eyebrow {
		font-size: 11px;
		letter-spacing: 0;
		color: #a0aebe;
	}
	.viewport-heading p {
		font-size: 12px;
		max-width: 100%;
		color: #b3bfce;
	}
	.viewport-corner {
		display: none;
	}
	.camera-tools {
		position: absolute;
		top: 12px;
		right: 12px;
		left: auto;
		display: flex;
		gap: 2px;
		z-index: 3;
		background: #111820df;
		border: 1px solid #ffffff1a;
		border-radius: 6px;
		padding: 3px;
		backdrop-filter: blur(16px);
	}
	.camera-tools button {
		width: 28px;
		height: 28px;
		padding: 0;
		color: #bac7d7;
		border-radius: 3px;
	}
	.camera-tools button:hover,
	.camera-tools button[aria-pressed='true'] {
		background: #82b3e817;
		color: #bedaff;
	}
	.camera-tools .view-label {
		display: none;
	}
	.camera-tools > span {
		width: 1px;
		background: #ffffff1a;
		margin: 4px 3px;
	}
	.view-tools {
		top: auto;
		bottom: 88px;
		left: 20px;
		transform: none;
		padding: 3px;
		border-radius: 3px;
		background: #141c25ed;
	}
	.viewport-bottom {
		bottom: 16px;
		left: 20px;
		right: 20px;
		gap: 9px;
	}
	.render-options,
	.playback,
	.deformation-control {
		border-radius: 3px;
		background: #141c25ee;
		border-color: #3b4653;
	}
	.render-options button,
	.playback button,
	.playback label,
	.playback span,
	.deformation-control label,
	.deformation-control span {
		font-size: 12px;
	}
	.render-options button.active {
		background: #2c4056;
		color: #e6f1ff;
	}
	.view-hint {
		font-size: 11px;
		color: #a4b1bf;
	}
	.field-legend {
		border-radius: 3px;
		background: #141c25ed;
		right: 120px;
		bottom: 99px;
	}
	.field-legend strong,
	.field-ticks,
	.field-legend small {
		font-size: 11px;
	}
	.probe-tools {
		position: absolute;
		top: 135px;
		left: 20px;
		z-index: 3;
	}
	.probe-tools button {
		padding: 7px 10px;
		border: 1px solid #485567;
		border-radius: 3px;
		background: #17212c;
		font-size: 12px;
	}
	.probe-tools button.active {
		background: #294763;
		border-color: #82b3e8;
		color: #dfedfc;
	}
	.probe-readout {
		position: absolute;
		left: 20px;
		top: 177px;
		max-width: 310px;
		z-index: 4;
		background: #111922f5;
		border: 1px solid #526375;
		padding: 12px;
		border-radius: 3px;
	}
	.probe-readout header {
		display: flex;
		justify-content: space-between;
		gap: 22px;
		align-items: center;
		font-size: 13px;
	}
	.probe-readout dl {
		margin: 10px 0;
	}
	.probe-readout dl div {
		display: flex;
		justify-content: space-between;
		gap: 12px;
		font-size: 12px;
		margin: 6px 0;
	}
	.probe-readout dt {
		color: #aebdcc;
	}
	.probe-readout dd {
		margin: 0;
		font-variant-numeric: tabular-nums;
	}
	.probe-readout p,
	.probe-readout small {
		font-size: 12px;
		line-height: 1.45;
		color: #acbac9;
	}
	.probe-export {
		margin-top: 10px;
		font-size: 12px;
		color: #a4cbf5;
	}
	.results {
		padding: 17px 18px;
		background: #141a21;
	}
	.primary-metric > div {
		font-size: 29px;
		font-weight: 500;
	}
	.primary-metric > span,
	.primary-metric p,
	.metric-pair span,
	.metric-pair small {
		font-size: 12px;
	}
	.metric-pair strong {
		font-size: 19px;
	}
	.primary-metric {
		margin-bottom: 18px;
	}
	.constraint-heading h3 {
		font-size: 13px;
	}
	.constraint-heading > span {
		font: 11px var(--sans);
		text-transform: none;
		color: #9fd0c8;
	}
	.constraints {
		font-size: 12px;
	}
	.constraint > div {
		font-size: 12px;
	}
	.optimizer {
		margin-top: 20px;
		padding-top: 16px;
	}
	.optimizer h3 {
		font-size: 13px;
	}
	.primary {
		border-radius: 3px;
		background: #294963;
		color: #eef6ff;
		border: 1px solid #537794;
	}
	.apply-best {
		font-size: 12px;
		color: #a9c6e8;
	}
	.analysis {
		position: relative;
		min-height: 0;
		border-top: 1px solid #465362;
		display: flex;
		flex-direction: column;
		background: #111820;
	}
	.panel-resizer {
		position: absolute;
		top: -5px;
		left: 0;
		right: 0;
		height: 8px;
		cursor: ns-resize;
		z-index: 5;
		touch-action: none;
	}
	.panel-resizer:hover,
	.panel-resizer:focus-visible {
		background: #82b3e870;
	}
	.analysis-header {
		min-height: 35px;
		height: 35px;
		padding: 0 17px;
		border-bottom: 1px solid var(--border);
		flex-shrink: 0;
	}
	.analysis-header h2 {
		margin: 0;
		font-size: 13px;
		font-weight: 550;
		color: #c7d2df;
	}
	.analysis-content {
		flex: 1;
		min-height: 0;
		height: auto;
		padding: 14px 18px;
		overflow: auto;
	}
	.operating-content {
		padding: 0;
	}
	.operating-dashboard {
		min-height: 0;
		height: 100%;
	}
	/* Keep the toolbar fixed while the complete result, including its field scale, scrolls. */
	.analysis-content.comparison-content {
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}
	.comparison-content .operating-dashboard {
		display: flex;
		flex-direction: column;
		flex: 1;
		height: auto;
		overflow: hidden;
	}
	.comparison-content .experiment-table {
		min-height: 0;
		overscroll-behavior-y: contain;
		scrollbar-gutter: stable;
	}
	.cycle-toolbar {
		min-height: 43px;
		flex-shrink: 0;
		padding: 0 18px;
		border-bottom: 1px solid var(--border);
	}
	.cycle-tabs button,
	.cycle-peaks button {
		font-size: 12px;
	}
	.cycle-tabs button.active {
		border-bottom-color: #82b3e8;
		color: #e1eeff;
	}
	.cycle-plots {
		padding: 10px 18px 14px;
	}
	.plot-legend {
		font-size: 11px;
	}
	.experiment-table {
		padding: 15px 18px;
		overflow: auto;
		flex: 1;
	}
	.experiment-table table {
		width: 100%;
		min-width: 690px;
		font-size: 13px;
		border-collapse: collapse;
	}
	.experiment-table th {
		font-size: 12px;
		padding: 10px 8px;
		background: #19232e;
		color: #b7c5d5;
	}
	.experiment-table td {
		font-size: 13px;
		padding: 11px 8px;
	}
	.experiment-table strong {
		font-size: 13px;
	}
	.experiment-table td span {
		font-size: 12px;
		margin-top: 5px;
	}
	.experiment-table td button {
		font-size: 12px;
		padding: 6px 8px;
		border: 1px solid #415266;
		border-radius: 3px;
		color: #b5d4f5;
	}
	.experiment-table > p {
		font-size: 12px;
		line-height: 1.5;
	}
	.comparison-assessment {
		border-radius: 3px;
		padding: 12px 14px;
		margin-bottom: 12px;
		background: #18232e;
	}
	.comparison-assessment strong,
	.comparison-assessment p {
		font-size: 12px;
	}
	.comparison-numbers b {
		font-size: 20px;
		color: #d4e2f2;
	}
	.comparison-numbers span {
		font-size: 12px;
	}
	.comparison-empty h3,
	.map-note h3 {
		font-size: 14px;
	}
	.comparison-empty p,
	.map-note p {
		font-size: 13px;
	}
	.statusbar {
		height: 30px;
		font-size: 11px;
		background: #111820;
	}
	.statusbar > span:last-child {
		font-size: 10px;
		letter-spacing: 0;
	}
	.workspace.layout-model {
		grid-template-rows: minmax(0, 1fr);
	}
	.workspace.layout-model .analysis {
		display: none;
	}
	.workspace.layout-model .parameters {
		grid-row: 1;
	}
	.workspace.layout-results {
		grid-template-columns: 280px minmax(0, 1fr);
		grid-template-rows: minmax(0, 1fr);
	}
	.workspace.layout-results .parameters {
		grid-row: 1;
	}
	.workspace.layout-results .viewport,
	.workspace.layout-results .results {
		display: none;
	}
	.workspace.layout-results .analysis {
		grid-column: 2;
		grid-row: 1;
	}
	.workspace.properties-hidden {
		grid-template-columns: 0 minmax(340px, 1fr) 302px;
	}
	.workspace.properties-hidden .parameters {
		display: none;
	}
	.workspace.inspector-hidden:not(.layout-results) {
		grid-template-columns: 280px minmax(340px, 1fr) 0;
	}
	.workspace.inspector-hidden .results {
		display: none;
	}
	.workspace.properties-hidden.inspector-hidden:not(.layout-results) {
		grid-template-columns: 0 minmax(0, 1fr) 0;
	}
	.workspace.layout-results.properties-hidden {
		grid-template-columns: 0 minmax(0, 1fr);
	}
	@media (min-width: 951px) and (max-width: 1350px) {
		.camera-tools .view-label {
			display: none;
		}
		.camera-tools button {
			min-width: 28px;
			min-height: 26px;
		}
	}
	@media (max-width: 1180px) and (min-width: 951px) {
		.workspace {
			grid-template-columns: 246px minmax(300px, 1fr) 272px;
		}
		.workspace.layout-results {
			grid-template-columns: 246px minmax(0, 1fr);
		}
		.header-actions button {
			padding: 5px 7px;
		}
	}
	@media (max-width: 1180px) {
		.layout-tools button span {
			display: none;
		}
		.layout-tools button {
			min-width: 30px;
			padding: 5px;
		}
	}
	@media (max-width: 950px) and (min-width: 641px) {
		.workspace {
			height: auto;
			min-height: calc(100svh - 124px);
			grid-template-columns: 240px minmax(0, 1fr);
			grid-template-rows: 480px auto auto;
		}
		.workspace .results {
			display: block;
		}
		.workspace.layout-results {
			grid-template-columns: 240px minmax(0, 1fr);
			grid-template-rows: minmax(500px, 1fr);
		}
		.workspace.layout-results .results {
			display: none;
		}
		.workbench-tabs nav {
			overflow-x: auto;
		}
		.workspace.properties-hidden {
			grid-template-columns: 0 minmax(0, 1fr);
		}
		.workspace.inspector-hidden:not(.layout-results) {
			grid-template-columns: 240px minmax(0, 1fr);
		}
		.layout-tools button {
			padding: 5px 7px;
		}

		.viewport-heading p {
			max-width: 100%;
		}
	}
	@media (max-width: 640px) {
		.layout-tools {
			margin-left: auto;
		}
		.workbench-tabs {
			gap: 5px;
			padding: 0 6px;
			overflow-x: auto;
		}
		.workbench-tabs nav button span {
			display: none;
		}
		.workbench-tabs nav button {
			flex-shrink: 0;
			font-size: 12px;
			padding: 0 10px;
		}
		.workspace,
		.workspace.has-outdated {
			height: auto;
			min-height: 0;
			display: flex;
			flex-direction: column;
		}
		.workspace .viewport {
			min-height: 610px;
			order: 0;
		}
		.workspace .parameters {
			order: 2;
		}
		.workspace .results {
			order: 1;
			display: block;
		}
		.workspace .analysis {
			order: 3;
			min-height: 370px;
		}
		.workspace.layout-results .analysis {
			order: 0;
			min-height: calc(100svh - 200px);
		}
		.workspace.layout-results .viewport,
		.workspace.layout-results .results {
			display: none;
		}
		.workspace.layout-results .parameters {
			order: 1;
		}
		.study-switch {
			position: static;
			width: auto;
			margin: 0 18px 14px;
			background: transparent;
		}

		.viewport-heading {
			top: 18px;
			left: 16px;
			right: 220px;
		}
		.viewport-heading p {
			max-width: 100%;
		}
		.viewport-heading h2 {
			font-size: 20px;
		}
		.viewport:has(.field-legend) {
			min-height: 650px;
		}
		.view-tools {
			bottom: 160px;
			left: 14px;
		}
		.viewport-bottom {
			bottom: 24px;
			left: 14px;
			right: 14px;
		}
		.viewport:has(.field-legend) .viewport-bottom {
			bottom: 86px;
			right: 120px;
		}
		.viewport:has(.field-legend) .render-options button {
			padding: 5px 8px;
			line-height: 1.3;
		}
		.field-legend {
			left: 14px;
			right: 120px;
			bottom: 10px;
			grid-template-columns: minmax(0, 1fr) 92px;
			gap: 4px 8px;
			padding: 8px;
			line-height: 1.3;
		}
		.field-legend strong {
			grid-column: 1 / -1;
		}
		.field-legend .field-scale {
			grid-column: 1;
			grid-row: 2;
			align-self: center;
			margin: 0;
		}
		.field-legend .field-ticks {
			grid-column: 2;
			grid-row: 2;
		}
		.field-legend small {
			grid-column: 1 / -1;
			grid-row: 3;
			margin: 0;
		}
		.probe-tools {
			top: 183px;
			left: 14px;
		}
		.probe-readout {
			top: 225px;
			left: 14px;
			max-width: calc(100% - 28px);
		}
		.parameter-scroll {
			display: block;
		}
		.cycle-toolbar {
			padding: 8px 12px;
			flex-wrap: wrap;
			gap: 8px;
		}
		.cycle-tabs {
			gap: 6px;
			flex-wrap: wrap;
		}
		.cycle-peaks {
			gap: 10px;
		}
		.cycle-plots {
			padding: 12px;
		}
		.analysis-content {
			padding: 12px;
		}
		.operating-content {
			padding: 0;
		}
		.outdated-notice {
			height: auto;
			min-height: 44px;
			padding: 8px 12px;
			flex-wrap: wrap;
		}
		.header-actions .quiet span,
		.header-actions .export span {
			display: none;
		}
		.panel-resizer {
			display: none;
		}
		.workspace.layout-model .analysis {
			display: none;
		}
		.statusbar {
			font-size: 10px;
		}
		.statusbar > span:last-child {
			display: none;
		}
	}

	.comparison-view-switch {
		display: flex;
		gap: 4px;
		padding: 10px 18px;
		border-bottom: 1px solid #ffffff18;
	}
	.comparison-view-switch button {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 6px 10px;
		font-size: 12px;
		border-radius: 3px;
		background: #202833;
		color: #bcc8d6;
		border: 1px solid #ffffff18;
	}
	.comparison-view-switch button.active {
		color: #c6e0fd;
		background: #233952;
		border-color: #729cc361;
	}
	.view-tools button.active {
		color: #b5d8fc;
		border-color: #729cc350;
		background: #233952;
	}

	.playback button {
		color: #b8d8f8;
	}
	.plot-legend,
	.cycle-plots .plot-legend {
		font-size: 12px;
	}
	.statusbar .status-scope {
		font-size: 11px;
		letter-spacing: 0;
	}

	.analysis-progress {
		margin-left: auto;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: #acbdd0;
		font-size: 12px;
	}
	.analysis-header .stop-analysis {
		display: flex;
		align-items: center;
		gap: 5px;
		padding: 4px 8px;
		border: 1px solid #ffffff25;
		border-radius: 3px;
		color: #d4dfe9;
		background: #202833;
		font-size: 12px;
		flex-shrink: 0;
	}

	.analysis-error {
		display: flex;
		align-items: center;
		gap: 9px;
		padding: 10px 18px;
		background: #352927;
		color: #efc4b5;
		font-size: 13px;
		border-bottom: 1px solid #b8816d50;
	}
	.analysis-error button {
		margin-left: auto;
		background: #49352e;
		color: #efd4c8;
		padding: 5px 8px;
		border-radius: 3px;
		white-space: nowrap;
	}
	@media (max-width: 640px) {
		.design-app :global(.workbench-header) {
			height: auto;
			flex-wrap: wrap;
			padding-top: 0;
			gap: 0 12px;
		}
		.design-app :global(.workbench-header nav) {
			height: 48px;
			flex: 1;
		}
		.design-app :global(.workbench-header .actions) {
			width: 100%;
			margin: 0;
			border-top: 1px solid #ffffff14;
		}
		.header-actions {
			width: 100%;
			padding: 5px 0;
			gap: 6px;
			justify-content: flex-end;
		}
		.header-actions button {
			min-height: 34px;
			min-width: 34px;
			padding: 6px 9px;
		}
		.header-actions {
			min-width: 0;
			overflow-x: auto;
			justify-content: flex-start;
		}
		.header-actions button {
			font-size: 12px;
			white-space: nowrap;
			flex-shrink: 0;
			gap: 5px;
			padding: 6px 8px;
			min-height: 36px;
		}
		.header-actions .quiet span,
		.header-actions .export span {
			display: inline;
		}
		.analysis-error {
			align-items: flex-start;
			flex-wrap: wrap;
		}
	}

	@media (min-width: 641px) and (max-height: 850px) {
		.view-tools {
			flex-direction: row;
			bottom: 94px;
		}
		.view-tools > span {
			width: 1px;
			height: 20px;
		}
	}
</style>
