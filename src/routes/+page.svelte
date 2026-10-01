<script lang="ts">
	import { onDestroy, tick } from 'svelte';
	import { base } from '$app/paths';
	import AtlasGallery from '$lib/components/AtlasGallery.svelte';
	import WorkbenchHeader from '$lib/components/WorkbenchHeader.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import EngineScene from '$lib/components/EngineScene.svelte';
	import DemoWelcome from '$lib/components/DemoWelcome.svelte';
	import { browserAI, connectBrowserAI, disconnectBrowserAI } from '$lib/ai/session';
	import { aiErrorMessage } from '$lib/ai/errors';
	import { runBrowserGuide, browserNarration } from '$lib/ai/client';
	import { createBrowserSceneTools } from '$lib/ai/scene';
	import type { SceneContext } from '$lib/ai/scene-contract';
	import InspectionControls from '$lib/components/InspectionControls.svelte';
	import KinematicAnalysis from '$lib/components/KinematicAnalysis.svelte';
	import CylinderCycleAnalysis from '$lib/components/CylinderCycleAnalysis.svelte';
	import { V12_ATLAS_CATEGORIES, v12TaxonomyByComponent } from '$lib/engine/v12-taxonomy';
	import { decorativeComponentIds, engineDefinition } from '$lib/engine/definition';
	import { V12_MOTION_BY_COMPONENT } from '$lib/engine/v12-motion-inventory';
	import { parts, sources } from '$lib/engine/data';
	import {
		createLabState,
		playbackAvailability,
		applyLabAction,
		snapshotLabState,
		type LabState,
		type LabAction,
		type ComponentRecord,
		type LabSnapshot
	} from '$lib/engine/lab-state';
	import { engineLessons } from '$lib/engine/lessons';
	let lab: LabState = $state.raw(createLabState());
	let actualPhase = $state(0);
	let components = $state.raw<ComponentRecord[]>([]);
	let ready = $state(false);
	let autoOrbit = $state(false);
	let atlasGalleryOpen = $state(false);
	let atlasFamily = $state('');

	let treeOpen = $state(false);
	let explosionControlsOpen = $state(false);
	let search = $state('');
	let expandedGroup = $state('');
	let panel = $state<'details' | 'guide' | 'performance' | 'analysis'>('details');
	let panelOpen = $state(false);
	let analysisKind = $state<'kinematics' | 'cycle'>('kinematics');
	let lessonId = $state<string | null>(null);
	let lessonIndex = $state(0);
	let lessonAuto = $state(false);
	let narrativeEnabled = $state(false);
	let checkpoint: LabSnapshot | null = null;
	let lessonTimer: ReturnType<typeof setTimeout> | null = null;
	let scene!: EngineScene;
	let keyDialog: HTMLDialogElement;
	let sourcesDialog: HTMLDialogElement;
	let welcome: DemoWelcome;
	let endTour: (() => void) | null = null;
	let touring = $state(false);
	let preparingTour = false;
	let accessError = $state('');
	let questionInput = $state<HTMLInputElement>();
	let messageBottom = $state<HTMLDivElement>();
	let draftKey = $state('');
	let model = $state('gpt-6-sol');
	let aiAvailable = $derived(Boolean($browserAI.key));
	let question = $state('');
	let busy = $state(false);
	let agentError = $state('');
	let commandNotice = $state('');
	let audioState = $state<'idle' | 'loading' | 'playing'>('idle');
	let audioNotice = $state('');
	let audioText = $state('');
	type Message = {
		id: number;
		role: 'user' | 'assistant';
		content: string;
		sources?: string[];
		guided?: boolean;
	};
	let messages = $state.raw<Message[]>([]);
	let messageId = 0;
	let agentAbort: AbortController | null = null;
	let audioAbort: AbortController | null = null;
	let audioPlayer: HTMLAudioElement | null = null;
	let audioUrl: string | null = null;
	let commandAbort: AbortController | null = null;
	let agentGeneration = 0;
	let lessonGeneration = 0;
	let disposed = false;
	const guideScene = createBrowserSceneTools({
		context: sceneContext,
		components: () => components,
		execute: executeCommand,
		progress: (message) => {
			commandNotice = message;
		}
	});

	const viewModes = [
		{ id: 'assembly', label: 'Exterior', icon: 'cube' },
		{ id: 'section', label: 'Section', icon: 'section' },
		{ id: 'xray', label: 'X-ray', icon: 'eye' },
		{ id: 'mechanism', label: 'Mechanism', icon: 'engine' },
		{ id: 'layout', label: 'Arrange parts', icon: 'layers' }
	] as const;
	let viewMenu: HTMLDetailsElement;
	let canRun = $derived(playbackAvailability(lab));
	function transportAction(action: LabAction) {
		manualInteraction();
		dispatch(action);
	}
	function userAction(action: LabAction) {
		manualInteraction();
		dispatch(action);
	}
	let selectedComponent = $derived(components.find((c) => c.id === lab.selected));
	let selectedMotion = $derived(
		lab.selected ? V12_MOTION_BY_COMPONENT.get(lab.selected) : undefined
	);
	let selectedPart = $derived(
		parts.find((p) => p.id === (selectedComponent?.parent || lab.selected))
	);
	let mechanicalComponents = $derived(
		components.filter((component) => !decorativeComponentIds.has(component.id))
	);
	let visibleComponents = $derived.by(() => {
		const terms = search.toLowerCase().trim().split(/\s+/).filter(Boolean);
		return mechanicalComponents.filter((component) => {
			const family = v12TaxonomyByComponent.get(component.id);
			const text =
				`${component.name} ${component.id} ${component.cadProduct ?? ''} ${component.sourceGroup ?? ''} ${family?.title ?? ''}`.toLowerCase();
			return terms.every((term) => text.includes(term));
		});
	});
	let sectionCoordinates = $derived(
		ready ? (scene?.getSectionCoordinates(lab.section) ?? null) : null
	);
	let lesson = $derived(engineLessons.find((l) => l.id === lessonId));
	let cue = $derived(lesson?.steps[lessonIndex]);
	let focusedDescription = $derived(selectedComponent?.description || selectedPart?.description);
	function reveal(value: LabState['reveal']) {
		manualInteraction();
		dispatch({ type: 'reveal', value });
	}

	function dispatch(action: LabAction) {
		if (action.type === 'seek') {
			stopAudio();
			lab = applyLabAction(lab, { type: 'running', value: false });
			actualPhase = action.value;
		}
		lab = applyLabAction(lab, action, components.length ? components : undefined);
	}
	function batch(actions: LabAction[]) {
		for (const action of actions)
			lab = applyLabAction(lab, action, components.length ? components : undefined);
	}
	function snapshot() {
		const current = scene?.getSnapshot();
		return snapshotLabState(lab, {
			phase: current?.phase ?? actualPhase,
			driveAngle: current?.driveAngle ?? null,
			camera: current?.camera ?? lab.camera
		});
	}
	function liveState() {
		return { ...lab, camera: scene?.getSnapshot()?.camera ?? lab.camera };
	}
	function sceneContext(): SceneContext {
		return {
			state: liveState(),
			sampledAt: Date.now(),
			actualPhase: scene?.getSnapshot()?.phase ?? actualPhase,
			lesson: {
				id: lessonId,
				step: lessonIndex,
				status: lessonId ? (lessonAuto ? 'playing' : 'paused') : 'idle'
			},
			narration: audioState
		};
	}
	function saveCheckpoint() {
		checkpoint = snapshot();
	}
	function restore() {
		atlasGalleryOpen = false;
		stopAll();
		explosionControlsOpen = Boolean(checkpoint?.explosion);
		if (checkpoint) {
			lab = applyLabAction(lab, { type: 'restore', value: checkpoint });
			actualPhase = checkpoint.phase;
			checkpoint = null;
		} else {
			lab = applyLabAction(lab, { type: 'reset' });
			actualPhase = 0;
		}
		lessonId = null;
	}
	function select(id: string | null) {
		manualInteraction();
		if (id && lab.display === 'layout') {
			atlasGalleryOpen = false;
			atlasFamily = 'Selected components';
		}
		if (id) treeOpen = false;
		dispatch({ type: 'select', id });
		if (id) {
			panel = 'details';
			panelOpen = true;
		}
	}
	function isolateComponent(id: string) {
		manualInteraction();
		batch([
			{ type: 'select', id },
			{ type: 'hide', id, value: false },
			{ type: 'isolate', value: true },
			{ type: 'focus', id }
		]);
		panel = 'details';
		panelOpen = true;
	}
	function toggleIsolation() {
		manualInteraction();
		if (lab.isolated) {
			batch([{ type: 'isolate', value: false }, { type: 'focus', id: null }, { type: 'fit' }]);
		} else dispatch({ type: 'isolate', value: true });
	}
	function backToOverview() {
		manualInteraction();
		batch([
			{ type: 'isolate', value: false },
			{ type: 'focus', id: null },
			{ type: 'select', id: null },
			{ type: 'fit' }
		]);
		panel = 'details';
		panelOpen = true;
	}
	function updateSection(value: Partial<LabState['section']>) {
		manualInteraction();
		dispatch({ type: 'section', value: { ...lab.section, ...value } });
	}
	function openCylinder() {
		setDisplay('mechanism');
		const piston = components.find((c) => c.name.toLowerCase().includes('piston'));
		if (piston)
			batch([
				{ type: 'select', id: piston.id },
				{ type: 'focus', id: piston.id }
			]);
		panelOpen = true;
	}
	function run() {
		const shouldRun = !lab.running;
		manualInteraction();
		if (shouldRun && !canRun.available) return;
		dispatch({ type: 'running', value: shouldRun });
	}
	function setDisplay(value: LabState['display']) {
		manualInteraction();
		const keepStudy = panelOpen && panel === 'analysis';
		atlasGalleryOpen = false;
		atlasFamily = '';
		if (value === 'layout') {
			openPartsLayout();
			return;
		}
		stopLesson();
		explosionControlsOpen = false;
		batch([
			{ type: 'display', value },
			{ type: 'select', id: keepStudy ? lab.selected : null },
			{ type: 'isolate', value: false },
			{ type: 'explosion', value: 0 },
			{ type: 'reveal', value: value === 'mechanism' ? 'rotating' : 'complete' },
			{ type: 'mode', value: value === 'assembly' ? 'inspect' : 'operate' }
		]);
		if (!keepStudy) {
			panel = 'details';
			panelOpen = false;
		}
	}
	function openPartsLayout() {
		atlasGalleryOpen = false;
		atlasFamily = '';
		const retainedMotion = scene?.getSnapshot();
		const retainedPhase = retainedMotion?.phase ?? actualPhase;
		if (lab.display !== 'layout') saveCheckpoint();
		stopAll();
		lessonId = null;
		actualPhase = retainedPhase;
		explosionControlsOpen = false;
		treeOpen = false;
		lab = applyLabAction(
			lab,
			{
				type: 'restore',
				value: {
					...snapshotLabState(lab),
					display: 'layout',
					reveal: 'complete',
					phase: retainedPhase,
					driveAngle: retainedMotion?.driveAngle ?? null,
					mode: 'inspect',
					running: false,
					flows: [],
					selected: null,
					focused: null,
					isolated: false,
					hidden: [],
					removed: [],
					internals: true,
					camera: null,
					view: 'perspective'
				}
			},
			components.length ? components : undefined
		);
		panel = 'details';
		panelOpen = false;
		if (matchMedia('(max-width: 850px)').matches) window.scrollTo({ top: 0, behavior: 'smooth' });
	}
	function inspectAtlasFamily(id: string) {
		manualInteraction();
		atlasFamily = V12_ATLAS_CATEGORIES.find((group) => group.id === id)?.title ?? '';
		atlasGalleryOpen = false;
		scene.focusAtlasCategory(id);
	}
	function showAtlasGallery() {
		manualInteraction();
		if (lab.display !== 'layout') openPartsLayout();
		atlasGalleryOpen = true;
		atlasFamily = '';
		treeOpen = false;
		panelOpen = false;
	}
	function showPartsArrangement() {
		manualInteraction();
		openPartsLayout();
	}
	function returnFromAtlas() {
		if (checkpoint) restore();
		else setDisplay('assembly');
	}
	function toggleExplosion() {
		manualInteraction();
		if (explosionControlsOpen) return;
		setDisplay('assembly');
		explosionControlsOpen = true;
		dispatch({ type: 'explosion', value: 1 });
	}
	function setSeparation(value: number) {
		manualInteraction();
		explosionControlsOpen = true;
		dispatch({ type: 'explosion', value });
	}
	function manualInteraction() {
		if (preparingTour) return;
		if (touring) {
			endTour?.();
			endTour = null;
			touring = false;
		}
		stopAudio();
		if (lessonId) {
			lessonGeneration++;
			lessonAuto = false;
			clearLessonTimer();
		}
		if (busy) stopAll();
	}
	function clearLessonTimer() {
		if (lessonTimer) clearTimeout(lessonTimer);
		lessonTimer = null;
	}
	function stopLesson() {
		lessonGeneration++;
		clearLessonTimer();
		lessonAuto = false;
		stopAudio();
	}
	function stopAll() {
		if (touring && !preparingTour) {
			endTour?.();
			endTour = null;
			touring = false;
		}
		stopLesson();
		agentGeneration++;
		agentAbort?.abort();
		commandAbort?.abort();
		agentAbort = null;
		busy = false;
		commandNotice = '';
		lab = applyLabAction(lab, { type: 'running', value: false });
	}
	function startLesson(id: string) {
		manualInteraction();
		saveCheckpoint();
		stopLesson();
		lessonId = id;
		lessonIndex = 0;
		atlasGalleryOpen = false;
		explosionControlsOpen = false;
		batch([
			...lab.removed.map((id) => ({ type: 'remove' as const, id, value: false })),
			...lab.hidden.map((id) => ({ type: 'hide' as const, id, value: false })),
			{ type: 'mode', value: 'learn' },
			{ type: 'explosion', value: 0 },
			{ type: 'isolate', value: false }
		]);
		panel = 'details';
		panelOpen = true;
		void applyCue(0);
	}
	async function applyCue(index: number) {
		const active = engineLessons.find((l) => l.id === lessonId);
		if (!active || index < 0 || index >= active.steps.length) return;
		const generation = ++lessonGeneration;
		clearLessonTimer();
		stopAudio();
		lessonIndex = index;
		try {
			batch([{ type: 'focus', id: null }, ...active.steps[index].actions]);
			atlasGalleryOpen = false;
			atlasFamily = '';
			actualPhase = lab.phase;
			await tick();
			await scene?.settle();
		} catch (error) {
			if (generation !== lessonGeneration) return;
			lessonAuto = false;
			agentError =
				error instanceof Error ? error.message : 'This lesson view could not be prepared.';
			openGuide();
			return;
		}
		if (generation !== lessonGeneration || lessonId !== active.id || lessonIndex !== index) return;
		if (narrativeEnabled && aiAvailable) await narrate(active.steps[index].body, false, true);
		if (generation !== lessonGeneration || lessonId !== active.id || lessonIndex !== index) return;
		if (lessonAuto)
			lessonTimer = setTimeout(
				() => {
					if (index + 1 < active.steps.length) void applyCue(index + 1);
					else {
						lessonAuto = false;
						clearLessonTimer();
					}
				},
				(narrativeEnabled && aiAvailable ? 1.2 : active.steps[index].seconds) * 1000
			);
	}
	function toggleLesson() {
		lessonAuto = !lessonAuto;
		if (lessonAuto) void applyCue(lessonIndex);
		else {
			lessonGeneration++;
			clearLessonTimer();
			stopAudio();
			dispatch({ type: 'running', value: false });
		}
	}
	function openGuide() {
		panel = 'guide';
		panelOpen = true;
		void tick().then(() => questionInput?.focus());
	}
	function openSettings() {
		draftKey = '';
		model = $browserAI.model;
		accessError = '';
		keyDialog.showModal();
	}
	function connectKey() {
		try {
			connectBrowserAI(draftKey, model);
			draftKey = '';
			keyDialog.close();
			agentError = '';
			openGuide();
		} catch (error) {
			accessError = aiErrorMessage(error);
		}
	}
	function disconnectKey() {
		stopAll();
		disconnectBrowserAI();
		draftKey = '';
		keyDialog.close();
	}
	async function prepareTourStep(index: number) {
		preparingTour = true;
		try {
			stopAll();
			lessonId = null;
			atlasGalleryOpen = false;
			atlasFamily = '';
			treeOpen = false;
			panelOpen = false;
			panel = 'details';
			lab = applyLabAction(lab, { type: 'reset' });
			actualPhase = 0;
			explosionControlsOpen = index === 1;
			if (index === 1) dispatch({ type: 'explosion', value: 0.65 });
			if (index === 2) setDisplay('section');
			if (index === 3) {
				setDisplay('mechanism');
				batch([
					{ type: 'playback', value: 0.02 },
					{ type: 'running', value: true }
				]);
			}
			if (index === 4) {
				openCylinder();
				dispatch({ type: 'seek', value: 80 });
			}
			if (index === 5) showAtlasGallery();
			if (index === 6) {
				panel = 'performance';
				panelOpen = true;
			}
			if (index === 7) {
				panel = 'guide';
				panelOpen = true;
				question = 'Show me a connecting rod, isolate it, and explain how it transmits force.';
			}
			await tick();
			await scene?.settle();
		} finally {
			preparingTour = false;
		}
	}
	async function startTour() {
		if (!ready || touring) return;
		touring = true;
		saveCheckpoint();
		lab = applyLabAction(lab, { type: 'reset' });
		actualPhase = 0;
		try {
			const { beginDemoTour } = await import('$lib/engine/demo-tour');
			if (disposed) return;
			endTour = await beginDemoTour({
				prepare: prepareTourStep,
				finish: () => {
					touring = false;
					endTour = null;
					dispatch({ type: 'running', value: false });
				},
				error: (message) => {
					agentError = message;
					openGuide();
				}
			});
		} catch (error) {
			touring = false;
			agentError = error instanceof Error ? error.message : 'The tour could not start.';
			openGuide();
		}
	}

	function keyboard(event: KeyboardEvent) {
		if (touring || document.querySelector('.welcome[open]')) return;
		const target = event.target as HTMLElement;
		if (
			['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) ||
			target.isContentEditable ||
			keyDialog?.open ||
			sourcesDialog?.open
		)
			return;
		if (event.code === 'Space') {
			event.preventDefault();
			run();
		}
		if (event.key.toLowerCase() === 'e') toggleExplosion();
		if (event.key.toLowerCase() === 'g') openPartsLayout();
		if (event.key.toLowerCase() === 'c')
			setDisplay(lab.display === 'assembly' ? 'section' : 'assembly');
		if (event.key.toLowerCase() === 'f') dispatch({ type: 'fit' });
		if (event.key === 'Escape') {
			stopAll();
			treeOpen = false;
		}
	}
	async function executeCommand(action: LabAction, expectedRevision: number, signal: AbortSignal) {
		signal.throwIfAborted();
		if (!busy || expectedRevision !== lab.revision)
			throw new Error('The scene changed. Read the state and retry.');
		const controller = new AbortController();
		commandAbort = controller;
		const executionSignal = AbortSignal.any([signal, controller.signal]);
		try {
			if (action.type === 'display' && action.value === 'layout' && lab.display !== 'layout')
				saveCheckpoint();
			lab = applyLabAction(lab, action, components);
			if (lab.display !== 'layout') {
				atlasGalleryOpen = false;
				atlasFamily = '';
			} else if (['select', 'focus', 'isolate'].includes(action.type)) {
				atlasGalleryOpen = false;
				atlasFamily = 'Selected components';
			}
			if (action.type === 'explosion') explosionControlsOpen = true;
			else if (['display', 'restore', 'reset'].includes(action.type))
				explosionControlsOpen = lab.explosion > 0;
			if (['seek', 'restore', 'reset'].includes(action.type)) actualPhase = lab.phase;
			await tick();
			await scene?.settle(executionSignal);
			executionSignal.throwIfAborted();
		} finally {
			if (commandAbort === controller) commandAbort = null;
		}
	}
	async function ask(text = question) {
		if (!text.trim() || busy || !ready) return;
		if (!aiAvailable) {
			question = text;
			openSettings();
			return;
		}
		stopLesson();
		openGuide();
		question = '';
		agentError = '';
		busy = true;
		const generation = ++agentGeneration;
		const history = messages.slice(-12).map((m) => ({ role: m.role, content: m.content }));
		messages = [...messages, { id: ++messageId, role: 'user', content: text.trim() }];
		try {
			agentAbort = new AbortController();
			const result = await runBrowserGuide({
				question: text.trim(),
				history,
				scene: guideScene,
				signal: AbortSignal.any([agentAbort.signal, AbortSignal.timeout(180_000)])
			});
			if (disposed || generation !== agentGeneration) return;
			messages = [
				...messages,
				{ id: ++messageId, role: 'assistant', content: result.answer, sources: result.sources }
			];
		} catch (error) {
			if (generation === agentGeneration && error instanceof Error && error.name !== 'AbortError')
				agentError = aiErrorMessage(error);
		} finally {
			if (generation === agentGeneration) {
				busy = false;
				agentAbort = null;
				commandNotice = '';
			}
			await tick();
			messageBottom?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
		}
	}
	function stopAudio() {
		audioAbort?.abort();
		audioAbort = null;
		audioPlayer?.pause();
		audioPlayer = null;
		if (audioUrl) URL.revokeObjectURL(audioUrl);
		audioUrl = null;
		audioState = 'idle';
		audioText = '';
	}
	async function narrate(text: string, toggle = true, waitForEnd = false) {
		if (toggle && audioState !== 'idle' && audioText === text) {
			stopAudio();
			return;
		}
		if (!text) return;
		if (!aiAvailable) {
			openSettings();
			return;
		}
		stopAudio();
		audioState = 'loading';
		audioText = text;
		audioNotice = '';
		const controller = new AbortController();
		audioAbort = controller;
		try {
			const recording = await browserNarration(text, controller.signal);
			if (audioAbort !== controller || controller.signal.aborted) return;
			audioUrl = URL.createObjectURL(recording);
			const player = new Audio(audioUrl);
			audioPlayer = player;
			const ended = new Promise<void>((resolve) => {
				player.onended = () => {
					if (audioAbort === controller) stopAudio();
					resolve();
				};
				player.onerror = () => {
					audioNotice = 'This recording could not be played. Try narration again.';
					if (audioAbort === controller) stopAudio();
					resolve();
				};
				controller.signal.addEventListener('abort', () => resolve(), { once: true });
			});
			await player.play();
			if (audioAbort !== controller) {
				player.pause();
				return;
			}
			audioState = 'playing';
			if (waitForEnd) await ended;
		} catch (error) {
			if (audioAbort !== controller) return;
			if (error instanceof Error && error.name !== 'AbortError')
				audioNotice = aiErrorMessage(error);
			stopAudio();
		}
	}
	onDestroy(() => {
		disposed = true;
		endTour?.();
		agentGeneration++;
		lessonGeneration++;
		clearLessonTimer();
		stopAudio();
		agentAbort?.abort();
		commandAbort?.abort();
	});
</script>

<svelte:head>
	<title>V12 Diesel Engine — Engine Lab</title>
	<meta
		name="description"
		content="Explore a V12 diesel engine concept through source assembly inspection, sectioning, component identification and measured mechanical playback."
	/>
	<meta name="theme-color" content="#090c10" />
</svelte:head>
<svelte:window onkeydown={keyboard} />
<DemoWelcome
	bind:this={welcome}
	{ready}
	{aiAvailable}
	ontour={() => void startTour()}
	onconnect={openSettings}
/>

<div class="app-shell">
	<WorkbenchHeader active="explore" context="V12 diesel concept · Source assembly">
		{#snippet actions()}
			<button
				class="quiet reference-link"
				aria-label="Sources"
				onclick={() => sourcesDialog.showModal()}
				><Icon name="book" size={16} /><span>Sources</span></button
			>
			<button
				class="quiet tour-button"
				aria-label="Demo tour"
				title="Workspace help"
				onclick={() => welcome.show()}><Icon name="info" size={17} /><span>Help</span></button
			>
			<button
				class="connection"
				aria-label="Ask the engine"
				title="Open assistant"
				onclick={openGuide}><Icon name="ai" size={17} /><span>Assistant</span></button
			>
			<button
				class="icon-button"
				title="AI connection settings"
				aria-label="AI connection settings"
				onclick={openSettings}><Icon name="settings" size={18} /></button
			>
			<a
				class="icon-button github-link"
				href="https://github.com/NeoVand/Diesel"
				target="_blank"
				rel="noopener noreferrer"
				title="Source repository on GitHub"
				aria-label="Source repository on GitHub"><Icon name="github" size={18} /></a
			>
		{/snippet}
	</WorkbenchHeader>
	<div class="explorer-workspace">
		<div class="workspace-rail hero-actions" aria-label="Explorer tools">
			<nav class="view-switch" aria-label="Engine view">
				<div class="tool-group">
					{#each viewModes.filter((view) => view.id !== 'layout') as view (view.id)}
						<button
							class:active={!atlasGalleryOpen &&
								!explosionControlsOpen &&
								(lab.display === view.id ||
									(view.id === 'mechanism' && lab.display === 'cylinder'))}
							aria-pressed={!atlasGalleryOpen && !explosionControlsOpen && lab.display === view.id}
							disabled={!ready}
							onclick={() => setDisplay(view.id)}
							aria-label={view.label}
							title={view.label}
							><Icon name={view.icon} size={18} /><span>{view.label}</span></button
						>
					{/each}
				</div>
				<div class="tool-group">
					<button
						class:active={explosionControlsOpen}
						aria-pressed={explosionControlsOpen}
						disabled={!ready}
						onclick={toggleExplosion}
						aria-label="Explode assembly"
						title="Explode assembly"><Icon name="explode" size={18} /><span>Exploded</span></button
					>
					<button
						class:active={!atlasGalleryOpen && !explosionControlsOpen && lab.display === 'layout'}
						aria-pressed={!atlasGalleryOpen && !explosionControlsOpen && lab.display === 'layout'}
						disabled={!ready}
						onclick={() => setDisplay('layout')}
						aria-label="Arrange parts"
						title="Arrange parts"><Icon name="layers" size={18} /><span>Arrange parts</span></button
					>
					<button
						class:active={atlasGalleryOpen}
						aria-pressed={atlasGalleryOpen}
						disabled={!ready}
						onclick={showAtlasGallery}
						aria-label="Component atlas"
						title="Component atlas"
						><Icon name="grid" size={18} /><span>Component atlas</span></button
					>
				</div>
			</nav>
			<div class="workspace-actions" role="group" aria-label="Inspection tools">
				<button
					class:active={treeOpen}
					aria-label="Search components"
					title="Find a component"
					aria-expanded={treeOpen}
					onclick={() => {
						treeOpen = !treeOpen;
					}}><Icon name="search" size={18} /><span>Find part</span></button
				>
				<button
					class:active={panelOpen && panel === 'analysis'}
					aria-label="Engine analysis"
					disabled={lab.display === 'layout'}
					title={lab.display === 'layout'
						? 'Return to the engine for live kinematics'
						: 'Measured piston displacement and rod angle'}
					onclick={() => {
						panelOpen = !panelOpen || panel !== 'analysis';
						panel = 'analysis';
					}}><Icon name="chart" size={18} /><span>Analysis</span></button
				>
				<button
					class:active={panelOpen && panel === 'details'}
					aria-label="Assembly properties"
					title="Assembly properties"
					onclick={() => {
						panelOpen = !panelOpen || panel !== 'details';
						panel = 'details';
					}}><Icon name="info" size={18} /><span>Properties</span></button
				>
			</div>
		</div>
		<main class:inspector-open={panelOpen}>
			<section
				class="stage"
				class:parts-layout={lab.display === 'layout'}
				class:catalog-open={atlasGalleryOpen}
				aria-label="Interactive engine studio"
			>
				<EngineScene
					bind:this={scene}
					state={lab}
					autoOrbit={autoOrbit && !atlasGalleryOpen}
					atlasLabelsVisible={lab.display === 'layout' && !atlasGalleryOpen && !atlasFamily}
					onselect={select}
					onisolate={isolateComponent}
					onready={() => {
						ready = true;
					}}
					onphase={(phase) => {
						actualPhase = phase;
					}}
					oncomponents={(items) => {
						components = items;
					}}
					oninteraction={manualInteraction}
				/>
				<div class="stage-heading">
					<h1>
						{lab.display === 'layout'
							? atlasGalleryOpen
								? 'Component atlas'
								: 'Parts arrangement'
							: explosionControlsOpen
								? 'Exploded engine'
								: lab.display === 'section'
									? 'Section inspection'
									: lab.display === 'xray'
										? 'X-ray inspection'
										: lab.display === 'mechanism' || lab.display === 'cylinder'
											? 'Internal mechanism'
											: 'V12 diesel engine'}
					</h1>
					<p class="stage-subtitle">
						{lab.display === 'layout'
							? `${V12_ATLAS_CATEGORIES.length} component families · ${engineDefinition.mechanicalDisplayCount.toLocaleString()} mechanical bodies`
							: lab.display === 'mechanism'
								? 'Cranktrain · Timing drive · Valve train'
								: lab.running
									? 'Running · Geometric playback'
									: `${engineDefinition.geometry.cylinders} cylinders · 6.81 L · Source geometry`}
					</p>
				</div>
				{#if !atlasGalleryOpen}<div class="stage-tools" aria-label="Scene tools">
						<details
							class="view-menu"
							{@attach (node) => {
								viewMenu = node;
							}}
						>
							<summary class:orbit-active={autoOrbit}
								><Icon name={autoOrbit ? 'orbit' : 'perspective'} size={16} />View<Icon
									name="right"
									size={12}
								/></summary
							>
							<div class="view-options glass">
								<span>Camera orientation</span>
								{#each [{ id: 'perspective', name: 'Perspective', label: 'Perspective view' }, { id: 'front', name: 'Front', label: 'Front view' }, { id: 'side', name: 'Side', label: 'Side view' }, { id: 'top', name: 'Top', label: 'Top view' }] as view (view.id)}<button
										class:active={lab.view === view.id}
										aria-label={view.label}
										onclick={() => {
											userAction({ type: 'view', value: view.id as LabState['view'] });
											viewMenu.open = false;
										}}
										>{view.name}{#if lab.view === view.id}<Icon
												name="check"
												size={14}
											/>{/if}</button
									>{/each}
								<label class="orbit-option">
									<Icon name="orbit" size={16} />
									<span>Auto orbit</span>
									<input type="checkbox" bind:checked={autoOrbit} onchange={manualInteraction} />
								</label>
							</div>
						</details>
						<button
							title="Fit engine · F"
							aria-label="Fit engine"
							onclick={() => userAction({ type: 'fit' })}
							><Icon name="expand" size={16} /><span>Fit</span></button
						>
						{#if lab.selected}<button
								title="Fit selected component"
								aria-label="Fit selected component"
								onclick={() => userAction({ type: 'focus', id: lab.selected })}
								><Icon name="target" size={16} /><span>Selected</span></button
							>{/if}
						<button title="Restore engine" aria-label="Restore engine" onclick={restore}
							><Icon name="reset" size={16} /><span>Reset</span></button
						>
					</div>{/if}
				{#if treeOpen}
					<div class="component-search glass">
						<div class="search-heading">
							<strong>Find a component</strong><button
								class="icon-button"
								aria-label="Close component search"
								onclick={() => {
									treeOpen = false;
								}}><Icon name="close" size={18} /></button
							>
						</div>
						<label class="search-field"
							><Icon name="search" size={18} /><input
								aria-label="Search parts"
								placeholder="Piston, turbo, source ID…"
								bind:value={search}
							/></label
						>
						<div class="search-results">
							{#each V12_ATLAS_CATEGORIES as group (group.id)}{@const members =
									visibleComponents.filter((c) =>
										group.componentIds.includes(c.id)
									)}{#if members.length}<button
										class="search-group"
										onclick={() => {
											expandedGroup = expandedGroup === group.id ? '' : group.id;
										}}
										aria-expanded={expandedGroup === group.id}
										><span>{group.title}</span><small>{members.length}</small><Icon
											name="right"
											size={14}
										/></button
									>{#if expandedGroup === group.id || search}{#each members as component (component.id)}<button
												class="search-result"
												class:active={lab.selected === component.id}
												onclick={() => {
													select(component.id);
													dispatch({ type: 'focus', id: component.id });
												}}
												><span
													>{component.name}<small class="source-name">{component.cadProduct}</small
													></span
												><small>{component.id}</small></button
											>{/each}{/if}{/if}{/each}
							{#if !visibleComponents.length}<p class="muted">No matching components.</p>{/if}
						</div>
						<p class="search-foot">
							{mechanicalComponents.length.toLocaleString()} mechanical bodies · {decorativeComponentIds.size}
							lettering bodies excluded
						</p>
					</div>
				{/if}
				{#if lab.selected && !panelOpen}<button
						class="selection-pill glass"
						onclick={() => {
							panel = 'details';
							panelOpen = true;
						}}
						><Icon name="target" size={16} />{selectedComponent?.name ??
							selectedPart?.name ??
							lab.selected}<Icon name="right" size={15} /></button
					>{/if}
				{#if lab.isolated}<button class="isolation-exit glass" onclick={toggleIsolation}
						><Icon name="left" size={16} />Show full engine</button
					>{/if}
				{#if lab.display === 'layout' && atlasGalleryOpen}<div class="atlas-overlay">
						<AtlasGallery
							createPreview={(id) => scene?.createAtlasPreviewAsset(id) ?? null}
							onopen={inspectAtlasFamily}
						/>
					</div>{/if}
				{#if lab.display === 'layout' && !atlasGalleryOpen && atlasFamily}<button
						class="atlas-back glass"
						onclick={showAtlasGallery}
						><Icon name="left" size={15} />All families<span>{atlasFamily}</span></button
					>{/if}

				<div class="stage-bottom">
					<InspectionControls
						state={lab}
						phase={actualPhase}
						{ready}
						exploded={explosionControlsOpen}
						catalogOpen={atlasGalleryOpen}
						{sectionCoordinates}
						onaction={transportAction}
						onrun={run}
						onstop={stopAll}
						onsection={updateSection}
						onseparation={setSeparation}
						onreveal={reveal}
						onatlasreturn={returnFromAtlas}
						onarrange={showPartsArrangement}
						oncatalogue={() => {
							treeOpen = true;
						}}
					/>
				</div>
				<div class="stage-footer">
					<button onclick={() => sourcesDialog.showModal()}
						><Icon name="info" size={14} />Source geometry · Measured dimensions</button
					><span
						>{#if atlasGalleryOpen}Select a family to inspect <b>·</b> Scroll to browse{:else}Drag
							to orbit <b>·</b> Scroll to zoom <b>·</b> Double-click to isolate{/if}</span
					>
				</div>
			</section>
			{#if panelOpen}<aside class="inspector glass" aria-label="Engine inspector">
					<div class="panel-tabs">
						<button
							class:active={panel === 'analysis'}
							disabled={lab.display === 'layout'}
							title={lab.display === 'layout'
								? 'Return to the engine for live kinematics'
								: 'Kinematics and cylinder cycle'}
							onclick={() => {
								panel = 'analysis';
							}}><Icon name="chart" size={16} />Analysis</button
						>
						<button
							class:active={panel === 'details'}
							onclick={() => {
								panel = 'details';
							}}><Icon name="info" size={16} />Properties</button
						><button
							class:active={panel === 'performance'}
							onclick={() => {
								panel = 'performance';
							}}><Icon name="chart" size={16} />Evidence</button
						><button
							class:active={panel === 'guide'}
							onclick={() => {
								panel = 'guide';
							}}><Icon name="ai" size={16} />Assistant</button
						><button
							class="icon-button"
							aria-label="Close inspector"
							onclick={() => {
								panelOpen = false;
							}}><Icon name="close" size={17} /></button
						>
					</div>
					<div class="panel-body" class:guide-body={panel === 'guide'}>
						{#if panel === 'analysis' && lab.display === 'layout'}
							<p class="muted">
								Return to the engine for live kinematic measurements. Separated parts are shown in
								their corrected inspection pose.
							</p>
						{:else if panel === 'analysis'}
							<div class="analysis-kinds" role="group" aria-label="Analysis study">
								<button
									class:active={analysisKind === 'kinematics'}
									aria-pressed={analysisKind === 'kinematics'}
									onclick={() => (analysisKind = 'kinematics')}
									><Icon name="ruler" size={14} />Kinematics</button
								>
								<button
									class:active={analysisKind === 'cycle'}
									aria-pressed={analysisKind === 'cycle'}
									onclick={() => (analysisKind = 'cycle')}
									><Icon name="cylinder" size={14} />Cylinder cycle</button
								>
							</div>
							{#if analysisKind === 'kinematics'}
								<KinematicAnalysis
									phase={actualPhase}
									selected={lab.selected}
									onselect={(id) => userAction({ type: 'select', id })}
								/>
							{:else}
								<CylinderCycleAnalysis
									phase={actualPhase}
									selected={lab.selected}
									onselect={(id) => userAction({ type: 'select', id })}
								/>
							{/if}
						{:else if panel === 'guide'}
							<div class="guide-heading">
								<span class="guide-emblem"><Icon name="ai" size={23} /></span>
								<h2>Assembly assistant</h2>
								<p>
									Inspect components, change the view, and review the available source evidence.
								</p>
							</div>
							{#if !messages.length}<div class="suggestions">
									{#each ['Show me the connecting rods', 'Cut through the engine, then run it slowly', 'Arrange the parts and explain the timing drive'] as suggestion (suggestion)}<button
											disabled={!ready}
											onclick={() => void ask(suggestion)}
											><span>{suggestion}</span><Icon name="arrow" size={15} /></button
										>{/each}
								</div>{/if}
							<div class="messages" aria-live="polite">
								{#each messages as message (message.id)}<article
										class:user={message.role === 'user'}
									>
										<div class="message-label">
											{message.role === 'user' ? 'YOU' : 'ASSISTANT'}
										</div>
										<p>{message.content}</p>
										{#if message.sources?.length}<div class="message-sources">
												{#each message.sources as id (id)}{@const source = sources.find(
														(item) => item.id === id
													)}{#if source}<!-- eslint-disable-next-line svelte/no-navigation-without-resolve --><a
															href={source.url.startsWith('/')
																? `${base}${source.url}`
																: source.url}
															target="_blank"
															rel="noreferrer">{source.title}<Icon name="arrow" size={12} /></a
														>{/if}{/each}
											</div>{/if}{#if message.role === 'assistant'}<button
												class="listen quiet"
												onclick={() => void narrate(message.content)}
												><Icon name="volume" size={15} />{audioText === message.content &&
												audioState === 'loading'
													? 'Preparing audio · Cancel'
													: audioText === message.content && audioState === 'playing'
														? 'Stop listening'
														: 'Listen'}</button
											>{/if}
									</article>{/each}{#if busy}<div class="agent-working">
										<span class="activity"></span>{commandNotice || 'Inspecting the engine…'}<button
											class="quiet"
											onclick={stopAll}>Stop</button
										>
									</div>{/if}
								<div
									{@attach (node) => {
										messageBottom = node;
									}}
								></div>
							</div>
							{#if agentError}<p class="error" role="alert">{agentError}</p>{/if}
							<form
								class="question-form"
								onsubmit={(e) => {
									e.preventDefault();
									void ask();
								}}
							>
								<input
									{@attach (node) => {
										questionInput = node;
									}}
									aria-label="Ask the engine"
									placeholder="Ask a question or direct the scene…"
									bind:value={question}
								/><button
									class="icon-button"
									aria-label="Send question"
									disabled={busy || !ready || !question.trim()}
									><Icon name="send" size={19} /></button
								>
							</form>
							<button class="ai-access quiet" onclick={openSettings}
								><Icon name={aiAvailable ? 'check' : 'key'} size={14} />{aiAvailable
									? 'AI connected for this tab'
									: 'Connect assistant'}</button
							>
						{:else if panel === 'performance'}
							<div class="eyebrow">SOURCE ASSEMBLY</div>
							<h2>Geometry and evidence</h2>
							<p class="body-copy">
								Measured from the supplied CAD. The running configuration includes documented
								geometry corrections.
							</p>
							<div class="metrics">
								<div><span>Bore</span><strong>85<small>mm</small></strong></div>
								<div><span>Stroke</span><strong>100<small>mm</small></strong></div>
								<div><span>Bank angle</span><strong>60<small>°</small></strong></div>
								<div><span>Displacement</span><strong>6.81<small>L</small></strong></div>
							</div>
							<dl class="facts">
								<div>
									<dt>Connecting rod centers</dt>
									<dd>125 mm</dd>
								</div>
								<div>
									<dt>Crank throw</dt>
									<dd>50 mm</dd>
								</div>
								<div>
									<dt>Mechanical bodies</dt>
									<dd>{engineDefinition.mechanicalDisplayCount.toLocaleString()}</dd>
								</div>
								<div>
									<dt>Configuration</dt>
									<dd>V12 diesel · four turbochargers</dd>
								</div>
							</dl>
							<div class="evidence-note">
								<Icon name="info" size={19} />
								<p>
									Motion follows measured joints and a documented derived timing rig. Chain
									placement, cam indexing and piston clearances required corrections to the
									purchased concept. The original files are preserved. Gas fields and spray
									assumptions are listed in the source notes; performance remains uncalibrated.
								</p>
							</div>
							<button class="text-link" onclick={() => sourcesDialog.showModal()}
								>Open source notes<Icon name="arrow" size={16} /></button
							>
						{:else if lesson && cue}
							<button
								class="quiet back"
								onclick={() => {
									stopLesson();
									lessonId = null;
								}}><Icon name="left" size={16} />All lessons</button
							>
							<div class="eyebrow">{cue.phase}</div>
							<h2>{cue.title}</h2>
							<div class="lesson-progress">
								{#each lesson.steps as item, index (item.title)}<button
										class:active={index === lessonIndex}
										aria-label={item.title}
										onclick={() => void applyCue(index)}
									></button>{/each}
							</div>
							<p class="body-copy">{cue.body}</p>
							<div class="lesson-buttons">
								<button class="primary" onclick={toggleLesson}
									><Icon name={lessonAuto ? 'pause' : 'play'} size={16} />{lessonAuto
										? 'Pause lesson'
										: 'Play lesson'}</button
								><button
									class="icon-button"
									aria-label="Listen to lesson"
									disabled={!aiAvailable}
									onclick={() => void narrate(cue.body)}><Icon name="volume" size={18} /></button
								><label class="narration-toggle"
									><input type="checkbox" bind:checked={narrativeEnabled} />Narration</label
								>
							</div>
							<div class="lesson-navigation">
								<button
									class="quiet"
									disabled={lessonIndex === 0}
									onclick={() => void applyCue(lessonIndex - 1)}
									><Icon name="left" size={16} />Back</button
								><span>{lessonIndex + 1} / {lesson.steps.length}</span><button
									class="quiet"
									disabled={lessonIndex === lesson.steps.length - 1}
									onclick={() => void applyCue(lessonIndex + 1)}
									>Next<Icon name="right" size={16} /></button
								>
							</div>
						{:else if selectedComponent || selectedPart}
							<button class="quiet back" onclick={backToOverview}
								><Icon name="left" size={16} />Engine overview</button
							>
							<div class="eyebrow">{selectedComponent?.id ?? 'ENGINE SYSTEM'}</div>
							<h2>{selectedComponent?.name ?? selectedPart?.name}</h2>
							<p class="body-copy">{focusedDescription}</p>
							<div class="part-actions">
								<button class="secondary" onclick={toggleIsolation}
									><Icon name="isolate" size={17} />{lab.isolated ? 'Show all' : 'Isolate'}</button
								><button
									class="secondary"
									onclick={() => userAction({ type: 'focus', id: lab.selected })}
									><Icon name="target" size={17} />Focus</button
								><button
									class="secondary"
									onclick={() => userAction({ type: 'hide', id: lab.selected!, value: true })}
									><Icon name="eye-off" size={17} />Hide</button
								><button
									class="secondary"
									onclick={() =>
										dispatch({
											type: 'remove',
											id: lab.selected!,
											value: !lab.removed.includes(lab.selected!)
										})}
									><Icon name="explode" size={17} />{lab.removed.includes(lab.selected!)
										? 'Return'
										: 'Lift out'}</button
								>
							</div>
							<dl class="facts">
								<div>
									<dt>Display finish</dt>
									<dd>{selectedComponent?.material ?? selectedPart?.material}</dd>
								</div>
								{#if selectedComponent}<div>
										<dt>Source component</dt>
										<dd>{selectedComponent.cadProduct}</dd>
									</div>
									<div>
										<dt>Source triangles</dt>
										<dd>{selectedComponent.triangleCount.toLocaleString()}</dd>
									</div>{/if}
							</dl>
							{#if selectedMotion}
								<details class="component-provenance">
									<summary
										>{selectedMotion.geometry === 'source'
											? 'Source geometry'
											: 'Derived geometry correction'}<Icon name="info" size={14} /></summary
									>
									<p class="body-copy">{selectedMotion.evidence}</p>
								</details>
							{/if}
							<p class="body-copy">{selectedPart?.principle}</p>
							<button
								class="text-link"
								onclick={() =>
									void ask(
										'Explain ' +
											(selectedComponent?.name ?? selectedPart?.name) +
											' in the current view.'
									)}
								><Icon name="ai" size={17} />Ask about this part<Icon
									name="right"
									size={15}
								/></button
							>
						{:else}
							<div class="eyebrow">V12 DIESEL CONCEPT</div>
							<h2>Assembly properties</h2>
							<p class="body-copy">
								Select a body in the viewport or component browser to inspect its identity and
								source data.
							</p>
							<h3 class="section-title">Inspection sequences</h3>
							<div class="lesson-cards">
								{#each engineLessons as item, index (item.id)}<button
										onclick={() => startLesson(item.id)}
										><span class="lesson-number">0{index + 1}</span><span
											><strong>{item.title}</strong><small>{item.steps.length} steps</small></span
										><Icon name="right" size={17} /></button
									>{/each}
							</div>
							<button
								class="text-link"
								onclick={() => {
									panel = 'performance';
								}}>Open geometry and evidence<Icon name="right" size={16} /></button
							>
						{/if}
						{#if panel === 'details' && !lesson && !selectedComponent && !selectedPart}
							<div class="anatomy-controls">
								<div class="eyebrow">SYSTEM ANATOMY</div>
								<div class="anatomy-buttons">
									{#each [{ id: 'air', name: 'Intake', icon: 'rotate' }, { id: 'exhaust', name: 'Exhaust', icon: 'layers' }, { id: 'fuel', name: 'Fuel hardware', icon: 'fuel' }] as system (system.id)}<button
											class:active={lab.flows.includes(system.id as 'air' | 'exhaust' | 'fuel')}
											onclick={() =>
												userAction({
													type: 'flow',
													flow: system.id as 'air' | 'exhaust' | 'fuel',
													value: !lab.flows.includes(system.id as 'air' | 'exhaust' | 'fuel')
												})}><Icon name={system.icon as 'rotate'} size={16} />{system.name}</button
										>{/each}
								</div>
								<p>
									Highlight related source components. Internal flow passages and operating rates
									are not reconstructed.
								</p>
							</div>
						{/if}
						{#if audioNotice}<p class="audio-notice" role="status">{audioNotice}</p>{/if}
					</div>
					{#if panel !== 'guide' && panel !== 'analysis'}<button
							class="panel-guide"
							onclick={openGuide}
							><Icon name="ai" size={19} />Open assembly assistant<Icon
								name="arrow"
								size={16}
							/></button
						>{/if}
				</aside>{/if}
		</main>
	</div>
</div>

<dialog
	{@attach (node) => {
		keyDialog = node;
	}}
	aria-label="AI connection settings"
>
	<div class="dialog-head">
		<div>
			<span class="eyebrow">ASSISTANT SETTINGS</span>
			<h2>AI connection</h2>
		</div>
		<button class="icon-button" aria-label="Close settings" onclick={() => keyDialog.close()}
			><Icon name="close" size={19} /></button
		>
	</div>
	<p>
		AI requests go directly from this browser to OpenAI using your own key. Your key stays in this
		tab’s memory and is cleared on reload. Engine controls and analysis do not need AI.
	</p>
	{#if aiAvailable}<div class="access-ready">
			<Icon name="check" size={24} />
			<div>
				<strong>Key connected for this tab</strong>
				<p>{$browserAI.model} · direct OpenAI connection</p>
			</div>
		</div>{/if}
	<form
		onsubmit={(event) => {
			event.preventDefault();
			connectKey();
		}}
	>
		<label for="api-key">OpenAI API key</label>
		<input
			id="api-key"
			type="password"
			bind:value={draftKey}
			placeholder="sk-…"
			autocomplete="off"
		/>
		<label for="model">Model</label><input id="model" bind:value={model} />
		<p class="dialog-note">
			Only your questions, selected scene context, study summaries and narration text are sent.
			Purchased model meshes are not uploaded. Narration uses an AI-generated voice. API usage is
			billed to your OpenAI project.
		</p>
		{#if accessError}<p class="error" role="alert">{accessError}</p>{/if}
		<button class="primary" disabled={!draftKey.trim()}
			>Connect key<Icon name="right" size={15} /></button
		>
	</form>
	{#if aiAvailable}<button class="text-link" onclick={disconnectKey}
			>Disconnect for this session</button
		>{/if}
</dialog>
<dialog
	{@attach (node) => {
		sourcesDialog = node;
	}}
	class="sources-dialog"
	aria-label="Engine references"
>
	<div class="dialog-head">
		<div>
			<span class="eyebrow">ENGINEERING BASIS</span>
			<h2>Sources and limitations</h2>
		</div>
		<button class="icon-button" aria-label="Close references" onclick={() => sourcesDialog.close()}
			><Icon name="close" size={19} /></button
		>
	</div>
	<p>
		A purchased, generic V12 diesel concept design. Internal components come from the same source
		assembly as the exterior.
	</p>
	<div class="evidence-types">
		<div>
			<Icon name="cube" size={23} /><strong>Source geometry</strong>
			<p>
				{engineDefinition.sourceCount.toLocaleString()} imported body occurrences: {engineDefinition.mechanicalDisplayCount.toLocaleString()}
				mechanical bodies and {decorativeComponentIds.size} decorative lettering bodies. Lettering is
				excluded from the viewport and component browser.
			</p>
		</div>
		<div>
			<Icon name="target" size={23} /><strong>Measured relationships</strong>
			<p>
				85 mm bore, 100 mm stroke, 125 mm connecting rods and 60° banks, measured from the supplied
				native CAD.
			</p>
		</div>
		<div>
			<Icon name="book" size={23} /><strong>Teaching & interpretation</strong>
			<p>
				Materials are display finishes. Timing, flow, power, fuel use and operating limits require
				further evidence. This is a geometric demonstration.
			</p>
		</div>
	</div>
	<div class="source-links">
		{#each sources as source (source.id)}<!-- eslint-disable-next-line svelte/no-navigation-without-resolve --><a
				href={source.url.startsWith('/') ? `${base}${source.url}` : source.url}
				target="_blank"
				rel="noreferrer"
				><span>{source.id}</span><strong>{source.title}</strong><Icon name="arrow" size={15} /></a
			>{/each}
	</div>
</dialog>

<style>
	.component-provenance {
		margin: 12px 0;
		border-block: 1px solid var(--line);
	}
	.component-provenance summary {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 10px 0;
		font-size: 12px;
		cursor: pointer;
		color: var(--muted);
	}
	.component-provenance .body-copy {
		font-size: 12px;
		line-height: 1.55;
	}

	.anatomy-controls {
		border-top: 1px solid var(--line);
		padding-top: 22px;
		margin-top: 15px;
	}
	.anatomy-buttons {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.anatomy-buttons button {
		font-size: 12px;
		padding: 8px 10px;
		border: 1px solid var(--line);
		border-radius: 6px;
	}
	.anatomy-buttons button.active {
		color: var(--accent);
		background: #e5ad3610;
		border-color: #e5ad3640;
	}
	.anatomy-controls p {
		font-size: 12px;
		color: var(--subtle);
		line-height: 1.7;
	}

	.app-shell {
		height: 100dvh;
		min-height: 0;
		overflow: hidden;
		background: #080b0f;
	}
	button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		color: var(--text);
		background: transparent;
	}
	.quiet {
		color: var(--muted);
		font-size: 12px;
		padding: 7px;
	}
	.quiet:hover {
		color: var(--text);
	}
	.icon-button {
		width: 34px;
		height: 34px;
		flex-shrink: 0;
		border-radius: 6px;
		color: var(--muted);
	}
	.icon-button:hover {
		background: #ffffff0c;
		color: var(--text);
	}
	.connection {
		border: 1px solid #ffffff1c;
		background: #ffffff04;
		color: #c8d2df;
		border-radius: 6px;
		font-size: 12px;
		font-weight: 550;
		padding: 8px 12px;
	}
	.github-link {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		text-decoration: none;
	}
	.explorer-workspace {
		position: relative;
		height: calc(100% - 50px);
		min-height: 0;
	}
	.workspace-rail {
		position: absolute;
		left: 12px;
		top: 80px;
		z-index: 9;
		display: flex;
		flex-direction: column;
		gap: 8px;
		width: 44px;
	}
	.view-switch {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.tool-group,
	.workspace-actions {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 4px;
		border: 1px solid #ffffff15;
		border-radius: 7px;
		background: #111820d9;
		backdrop-filter: blur(18px);
		box-shadow: 0 3px 12px #0002;
	}
	.workspace-rail button {
		position: relative;
		flex-shrink: 0;
		width: 34px;
		height: 34px;
		padding: 0;
		border: 1px solid transparent;
		border-radius: 4px;
		color: #a6b3c1;
	}
	.workspace-rail button:hover {
		color: #edf3fa;
		background: #ffffff09;
	}
	.workspace-rail button.active {
		background: #82b3e819;
		border-color: #82b3e82a;
		color: #bedaff;
	}
	.workspace-rail button > span {
		position: absolute;
		left: calc(100% + 12px);
		top: 50%;
		transform: translate(0, -50%);
		z-index: 12;
		padding: 6px 9px;
		border: 1px solid #ffffff19;
		border-radius: 4px;
		background: #141b24f5;
		box-shadow: 0 3px 10px #0004;
		color: #e0e8f2;
		font-size: 12px;
		line-height: 1.3;
		font-weight: 400;
		white-space: nowrap;
		pointer-events: none;
		visibility: hidden;
	}
	.workspace-rail button:hover > span,
	.workspace-rail button:focus-visible > span {
		visibility: visible;
	}
	main {
		position: relative;
		height: 100%;
		min-width: 0;
		min-height: 0;
		display: grid;
		grid-template-columns: minmax(0, 1fr);
	}
	main.inspector-open {
		grid-template-columns: minmax(0, 1fr) 360px;
	}
	.stage {
		--engine-fit-left: 76px;
		--engine-fit-top: 60px;
		--engine-fit-bottom: 157px;
		position: relative;
		min-width: 0;
		min-height: 0;
		overflow: hidden;
	}
	.stage-heading {
		position: absolute;
		left: 16px;
		top: 16px;
		pointer-events: none;
		z-index: 1;
		max-width: calc(100% - 260px);
	}
	h1 {
		font-size: 18px;
		font-weight: 550;
		line-height: 1.2;
		letter-spacing: -0.035em;
		margin: 0;
		color: #e8edf3;
	}
	.stage-subtitle {
		margin: 7px 0 0;
		font-size: 12px;
		color: #a1aeba;
	}
	.eyebrow {
		color: #9baab8;
		font: 12px var(--mono);
		letter-spacing: 0.12em;
		margin: 0 0 12px;
	}
	.glass {
		background: #141a21f5;
		border: 1px solid #ffffff18;
		backdrop-filter: blur(24px);
		box-shadow: 0 8px 24px #0003;
	}
	.stage-tools {
		position: absolute;
		top: 12px;
		right: 16px;
		display: flex;
		align-items: center;
		gap: 5px;
		z-index: 4;
		background: #0c1118c9;
		border: 1px solid #ffffff16;
		backdrop-filter: blur(20px);
		padding: 4px;
		border-radius: 8px;
	}
	.stage-tools > button,
	.view-menu > summary {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 7px;
		font-size: 12px;
		color: #bec8d2;
		height: 32px;
		border-radius: 5px;
		padding: 0 10px;
		cursor: pointer;
		list-style: none;
	}
	.stage-tools > button:hover,
	.view-menu > summary:hover {
		background: #ffffff09;
		color: #fff;
	}
	.view-menu {
		position: relative;
	}
	.view-menu > summary::-webkit-details-marker {
		display: none;
	}
	.view-menu > summary :global(svg:last-child) {
		transform: rotate(90deg);
	}
	.view-options {
		position: absolute;
		top: 42px;
		right: 0;
		width: 178px;
		border-radius: 9px;
		padding: 9px;
	}
	.view-options > span {
		display: block;
		font-size: 12px;
		font-weight: 500;
		color: #8594a3;
		padding: 7px 7px 11px;
	}
	.view-options button {
		display: flex;
		justify-content: space-between;
		width: 100%;
		font-size: 12px;
		padding: 9px;
		border-radius: 5px;
		color: #b7c3cf;
	}
	.view-options button:hover,
	.view-options button.active {
		background: #ffffff0b;
		color: #aacdf3;
	}
	.orbit-option {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 11px 8px 5px;
		margin-top: 5px;
		border-top: 1px solid #ffffff13;
		color: #c0ccda;
		font-size: 12px;
		cursor: pointer;
	}
	.orbit-option input {
		margin-left: auto;
		width: 15px;
		height: 15px;
		accent-color: #82b3e8;
		cursor: pointer;
	}
	.view-menu > summary.orbit-active {
		color: #b3d3f7;
	}
	.stage-bottom {
		position: absolute;
		bottom: 30px;
		left: 50%;
		transform: translateX(-50%);
		width: min(960px, calc(100% - 32px));
		z-index: 5;
		pointer-events: none;
		transition:
			width 0.25s ease,
			left 0.25s ease;
	}
	.stage-footer {
		position: absolute;
		left: 16px;
		right: 16px;
		bottom: 10px;
		display: flex;
		justify-content: space-between;
		gap: 20px;
		font-size: 12px;
		color: #8493a2;
		pointer-events: none;
	}
	.stage-footer button {
		font-size: 12px;
		color: #94a2b0;
		pointer-events: auto;
	}
	.stage-footer b {
		margin: 0 7px;
		font-weight: 400;
		color: #5c6977;
	}
	.primary {
		background: var(--accent);
		color: #18130b;
		border-radius: 6px;
		padding: 10px 15px;
		font-size: 12px;
		font-weight: 650;
	}
	.primary:hover {
		background: var(--accent-hover);
	}
	.secondary {
		border: 1px solid var(--line);
		border-radius: 6px;
		padding: 9px 12px;
		font-size: 12px;
		color: #d9dfe5;
		background: #ffffff04;
	}
	.secondary:hover {
		background: #ffffff0d;
	}
	.selection-pill,
	.isolation-exit {
		position: absolute;
		left: 28px;
		top: 93px;
		padding: 8px 12px;
		border-radius: 6px;
		font-size: 12px;
		z-index: 3;
	}
	.isolation-exit {
		top: 134px;
	}
	.component-search {
		margin-left: 60px;
		position: absolute;
		top: 83px;
		left: 28px;
		width: 330px;
		max-height: calc(100% - 275px);
		border-radius: 12px;
		padding: 15px;
		display: flex;
		flex-direction: column;
		z-index: 6;
	}
	.search-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 10px;
	}
	.search-heading strong {
		font-size: 13px;
		font-weight: 550;
	}
	.search-field {
		display: flex;
		align-items: center;
		gap: 9px;
		padding: 8px 10px;
		border: 1px solid var(--line);
		border-radius: 7px;
		color: var(--subtle);
	}
	.search-field input {
		border: 0;
		background: none;
		width: 100%;
		font-size: 12px;
		min-width: 0;
		outline: none;
		color: var(--text);
	}
	.search-results {
		overflow: auto;
		margin-top: 12px;
	}
	.search-group {
		width: 100%;
		justify-content: flex-start;
		padding: 10px 2px;
		font-size: 12px;
	}
	.search-group small {
		margin-left: auto;
		font: 12px var(--mono);
		color: var(--subtle);
	}
	.search-result {
		width: 100%;
		justify-content: space-between;
		padding: 8px 9px;
		border-radius: 5px;
		text-align: left;
		gap: 12px;
		font-size: 12px;
		color: #bdc5ce;
	}
	.search-result span {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.search-result small {
		font: 12px var(--mono);
		color: #86919c;
	}
	.search-result .source-name {
		display: block;
		font:
			12px 'Inter Variable',
			sans-serif;
		color: #95a4b5;
		margin-top: 3px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.search-result:hover,
	.search-result.active {
		background: #ffffff09;
		color: var(--accent);
	}
	.search-foot {
		font-size: 12px;
		color: var(--subtle);
		margin: 12px 0 0;
	}
	.inspector {
		position: relative;
		width: 360px;
		min-height: 0;
		border: 0;
		border-left: 1px solid #ffffff18;
		border-radius: 0;
		display: flex;
		flex-direction: column;
		z-index: 4;
		overflow: hidden;
		box-shadow: none;
	}
	.panel-tabs {
		display: flex;
		gap: 4px;
		align-items: center;
		padding: 11px 12px;
		border-bottom: 1px solid var(--line);
	}
	.panel-tabs > button:not(.icon-button) {
		font-size: 12px;
		color: #9ca6b0;
		border-radius: 6px;
		padding: 8px;
	}
	.panel-tabs > button.active {
		background: #ffffff09;
		color: #aacdf3;
	}
	.panel-tabs .icon-button {
		margin-left: auto;
		width: 25px;
	}
	.panel-body {
		/* Study controls stay inside their inspector, separate from viewport navigation. */
		padding: 20px;
		overflow: auto;
		flex: 1;
	}
	.analysis-kinds {
		display: flex;
		gap: 4px;
		margin-bottom: 17px;
		padding-bottom: 12px;
		border-bottom: 1px solid #ffffff12;
	}
	.analysis-kinds button {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 7px 10px;
		border: 1px solid transparent;
		border-radius: 4px;
		background: none;
		color: #9dabbc;
		font-size: 11px;
	}
	.analysis-kinds button.active {
		background: #bdd5ef0e;
		border-color: #bdd5ef24;
		color: #dce8f5;
	}
	h2 {
		font-size: 21px;
		line-height: 1.18;
		letter-spacing: -0.035em;
		font-weight: 450;
		margin: 8px 0 18px;
	}
	.body-copy,
	.guide-heading p {
		font-size: 13px;
		color: #aeb8c2;
		line-height: 1.8;
	}
	.panel-guide {
		border-top: 1px solid var(--line);
		padding: 15px 16px;
		font-size: 12px;
		color: #d1d7de;
		justify-content: flex-start;
		background: #ffffff02;
	}
	.panel-guide > :global(svg:first-child) {
		color: #e8bf73;
	}
	.panel-guide > :global(svg:last-child) {
		margin-left: auto;
	}
	.back {
		padding: 0 0 23px;
		font-size: 12px;
	}
	.part-actions {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 7px;
		margin: 22px 0;
	}
	.facts {
		margin: 20px 0;
		font-size: 12px;
	}
	.facts div {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 16px;
		border-bottom: 1px solid #ffffff0b;
		padding: 12px 0;
	}
	.facts dt {
		color: #939faa;
	}
	.facts dd {
		margin: 0;
		color: #dce1e7;
		text-align: right;
		max-width: 155px;
	}
	.metrics {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1px;
		background: var(--line);
		border: 1px solid var(--line);
		border-radius: 9px;
		overflow: hidden;
		margin-top: 24px;
	}
	.metrics > div {
		background: #0d1219;
		padding: 18px 16px;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.metrics span {
		font-size: 12px;
		color: #a4afbb;
	}
	.metrics strong {
		font-size: 21px;
		letter-spacing: -0.04em;
		font-weight: 450;
	}
	.metrics small {
		font-size: 12px;
		margin-left: 4px;
		color: #8897a7;
	}
	.evidence-note {
		display: flex;
		gap: 10px;
		padding: 13px;
		background: #e5ad3606;
		border: 1px solid #e5ad361c;
		border-radius: 8px;
	}
	.evidence-note > :global(svg) {
		flex-shrink: 0;
		color: #cfaf72;
		margin-top: 2px;
	}
	.evidence-note p {
		margin: 0;
		color: #aab4bf;
		font-size: 12px;
		line-height: 1.8;
	}
	.text-link {
		font-size: 12px;
		padding: 15px 0;
		color: #e5c58b;
		justify-content: flex-start;
		text-align: left;
	}
	.text-link > :global(svg:last-child) {
		margin-left: auto;
	}
	.lesson-cards {
		display: flex;
		flex-direction: column;
		margin: 25px 0;
	}
	.lesson-cards button {
		text-align: left;
		justify-content: flex-start;
		gap: 15px;
		padding: 18px 0;
		border-bottom: 1px solid var(--line);
	}
	.lesson-number {
		font: 12px var(--mono);
		color: #dcbf87;
		align-self: flex-start;
		padding-top: 3px;
	}
	.lesson-cards strong {
		font-size: 13px;
		font-weight: 500;
		display: block;
	}
	.lesson-cards small {
		display: block;
		font-size: 12px;
		color: var(--subtle);
		margin-top: 5px;
	}
	.lesson-cards button > :global(svg) {
		margin-left: auto;
		color: #7c8997;
	}
	.lesson-progress {
		display: flex;
		gap: 6px;
		margin: 25px 0;
	}
	.lesson-progress button {
		height: 3px;
		padding: 0;
		flex: 1;
		background: #ffffff16;
	}
	.lesson-progress button.active {
		background: var(--accent);
	}
	.lesson-buttons {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
		margin: 26px 0;
	}
	.narration-toggle {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 12px;
		color: var(--muted);
	}
	.narration-toggle input {
		accent-color: var(--accent);
	}
	.lesson-navigation {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-top: 30px;
		padding-top: 18px;
		border-top: 1px solid var(--line);
	}
	.lesson-navigation span {
		font: 12px var(--mono);
		color: var(--subtle);
	}
	.guide-body {
		display: flex;
		flex-direction: column;
		padding: 24px 20px 16px;
	}
	.guide-emblem {
		width: 42px;
		height: 42px;
		display: grid;
		place-items: center;
		border: 1px solid #e5ad3630;
		background: #e5ad3608;
		color: #e9c282;
		border-radius: 12px;
		margin-bottom: 20px;
	}
	.guide-heading h2 {
		font-size: 26px;
		margin-bottom: 10px;
	}
	.guide-heading p {
		font-size: 12px;
		margin: 0 0 24px;
	}
	.suggestions {
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin-bottom: 25px;
	}
	.suggestions button {
		font-size: 12px;
		line-height: 1.5;
		text-align: left;
		justify-content: space-between;
		padding: 12px;
		border: 1px solid var(--line);
		border-radius: 8px;
		color: #bec7d1;
	}
	.suggestions button:hover {
		border-color: #e5ad3640;
		color: #f0cc87;
	}
	.suggestions :global(svg) {
		flex-shrink: 0;
	}
	.messages {
		flex: 1;
	}
	.messages article {
		padding: 18px 0;
		border-top: 1px solid var(--line);
	}
	.message-label {
		font: 12px var(--mono);
		letter-spacing: 0.12em;
		color: #cead71;
	}
	.user .message-label {
		color: #8d9aaa;
	}
	.messages article p {
		font-size: 12px;
		line-height: 1.85;
		color: #c4cdd7;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.message-sources {
		display: flex;
		flex-direction: column;
		gap: 5px;
		font-size: 12px;
	}
	.message-sources a {
		color: #d4bd95;
		display: flex;
		align-items: center;
		gap: 5px;
	}
	.listen {
		padding: 3px 0;
		font-size: 12px;
	}
	.agent-working {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
		font-size: 12px;
		padding: 15px 0;
		color: #b8c6d4;
	}
	.activity {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--accent);
		animation: breathe 1.5s infinite;
	}
	.question-form {
		display: flex;
		align-items: center;
		padding: 6px 5px 6px 12px;
		background: #ffffff05;
		border: 1px solid #ffffff20;
		border-radius: 8px;
		margin-top: 18px;
	}
	.question-form input {
		width: 100%;
		min-width: 0;
		background: none;
		color: var(--text);
		border: 0;
		font-size: 12px;
		outline: none;
	}
	.question-form .icon-button {
		color: var(--accent);
	}
	.ai-access {
		font-size: 12px;
		margin: 7px auto 0;
	}
	.error {
		font-size: 12px;
		line-height: 1.6;
		color: #edb0a0;
		background: #be594515;
		padding: 10px;
		border-radius: 6px;
	}
	.audio-notice {
		color: #c9b589;
		font-size: 12px;
		line-height: 1.6;
	}
	dialog {
		width: min(560px, calc(100vw - 32px));
		max-height: calc(100dvh - 60px);
		margin: auto;
		padding: 30px;
		border: 1px solid #ffffff25;
		border-radius: 16px;
		color: var(--text);
		background: #0b1017ed;
		backdrop-filter: blur(25px);
		box-shadow: 0 30px 100px #0009;
	}
	dialog::backdrop {
		background: #0008;
		backdrop-filter: blur(5px);
	}
	.dialog-head {
		display: flex;
		justify-content: space-between;
		gap: 20px;
		align-items: flex-start;
	}
	.dialog-head h2 {
		font-size: 26px;
		margin-top: 10px;
	}
	dialog p {
		font-size: 12px;
		line-height: 1.8;
		color: #adb7c3;
	}
	dialog form {
		display: flex;
		flex-direction: column;
		gap: 9px;
	}
	dialog form label {
		font-size: 12px;
		color: #c1c9d3;
		margin-top: 12px;
	}
	dialog form input {
		border: 1px solid var(--line);
		background: #ffffff05;
		color: var(--text);
		padding: 11px;
		border-radius: 7px;
	}
	dialog form .primary {
		align-self: flex-start;
		margin-top: 10px;
	}
	.access-ready {
		display: flex;
		align-items: flex-start;
		gap: 14px;
		margin: 18px 0 23px;
	}
	.access-ready > :global(svg) {
		color: #d8bc80;
		flex-shrink: 0;
	}
	.access-ready strong {
		font-size: 14px;
		font-weight: 500;
	}
	.access-ready p {
		margin: 8px 0;
	}

	.dialog-note {
		font-size: 12px;
	}
	.sources-dialog {
		width: min(710px, calc(100vw - 32px));
	}
	.evidence-types {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 18px;
		margin: 25px 0;
		padding: 25px 0;
		border-block: 1px solid var(--line);
	}
	.evidence-types > div > :global(svg) {
		color: #d8bb81;
		margin-bottom: 14px;
	}
	.evidence-types strong {
		display: block;
		font-size: 12px;
		font-weight: 550;
	}
	.evidence-types p {
		font-size: 12px;
	}
	.source-links a {
		display: flex;
		align-items: center;
		gap: 15px;
		border-bottom: 1px solid var(--line);
		padding: 15px 0;
		text-decoration: none;
	}
	.source-links span {
		font: 12px var(--mono);
		color: #8d9bab;
	}
	.source-links strong {
		font-size: 12px;
		font-weight: 450;
	}
	.source-links :global(svg) {
		margin-left: auto;
		color: #bea67b;
	}
	@keyframes breathe {
		50% {
			opacity: 0.25;
		}
	}
	.atlas-overlay {
		margin-left: 60px;
		position: absolute;
		inset: 72px 16px 112px;
		z-index: 4;
	}
	.catalog-open .atlas-overlay {
		bottom: 80px;
	}
	.atlas-back {
		position: absolute;
		top: 76px;
		left: 16px;
		z-index: 4;
		padding: 8px 11px;
		border-radius: 7px;
		font-size: 12px;
	}
	.atlas-back span {
		border-left: 1px solid #ffffff20;
		padding-left: 12px;
		margin-left: 6px;
		color: #e0c48c;
	}
	.panel-tabs {
		gap: 1px;
		padding: 8px;
	}
	.panel-tabs > button:not(.icon-button) {
		padding: 7px 4px;
		font-size: 11px;
		gap: 4px;
		min-width: 0;
		flex-shrink: 0;
	}
	.panel-tabs .icon-button {
		width: 27px;
		min-width: 27px;
		margin-left: auto;
	}
	@media (max-width: 760px) {
		.atlas-overlay {
			inset: 90px 10px 124px;
		}
		.catalog-open .atlas-overlay {
			bottom: 96px;
		}
		.atlas-back {
			left: 16px;
			top: 94px;
		}
	}

	@media (max-width: 1150px) {
		.stage-footer > span {
			display: none;
		}
	}
	@media (max-width: 760px) {
		.connection {
			padding: 7px;
		}
		.stage {
			--engine-fit-top: 132px;
		}
		.stage-heading {
			top: 20px;
			left: 16px;
			max-width: calc(100% - 32px);
		}
		h1 {
			font-size: 18px;
		}
		.stage-subtitle {
			font-size: 12px;
			line-height: 1.5;
			max-width: 220px;
		}
		.stage-tools {
			top: 80px;
			right: 12px;
			gap: 0;
			padding: 3px;
		}
		.stage-tools > button,
		.view-menu > summary {
			padding: 0 7px;
			font-size: 12px;
			gap: 5px;
		}
		.stage-tools > button span {
			display: none;
		}
		.stage-tools :global(svg) {
			width: 14px;
			height: 14px;
		}
		.stage-bottom {
			width: calc(100% - 20px);
			bottom: 32px;
		}
		.stage-footer {
			left: 13px;
			right: 13px;
			bottom: 10px;
		}
		.stage-footer button {
			font-size: 12px;
		}
		main.inspector-open {
			grid-template-columns: minmax(0, 1fr);
		}
		.inspector {
			z-index: 12;
			position: absolute;
			left: 12px;
			right: 12px;
			width: auto;
			top: 80px;
			bottom: 192px;
			border-radius: 10px;
		}
		.panel-body {
			padding: 18px;
		}
		.panel-tabs {
			padding: 7px;
			gap: 2px;
		}
		.panel-tabs > button:not(.icon-button) {
			padding: 8px 6px;
			font-size: 12px;
		}
		.panel-tabs > button:not(.icon-button) :global(svg) {
			display: none;
		}
		.component-search {
			top: 80px;
			left: 12px;
			right: 12px;
			width: auto;
			max-height: calc(100% - 275px);
		}
		.selection-pill {
			left: 15px;
			top: 99px;
			max-width: calc(100% - 30px);
		}
		.isolation-exit {
			left: 15px;
			top: 140px;
		}
		.evidence-types {
			grid-template-columns: 1fr;
			gap: 12px;
		}
		.evidence-types > div {
			display: grid;
			grid-template-columns: 25px 1fr;
			gap: 2px 12px;
		}
		.evidence-types p {
			grid-column: 2;
			margin-top: 3px;
		}
	}
	.section-title {
		font-size: 13px;
		font-weight: 550;
		color: #c6d0dc;
		margin: 22px 0 10px;
	}
	@media (max-width: 1050px) {
		.reference-link span,
		.tour-button span {
			display: none;
		}
	}
	@media (max-width: 760px) {
		.connection span {
			display: none;
		}
		.quiet {
			padding: 7px;
		}
		.reference-link {
			display: none;
		}
	}

	@media (max-height: 700px) {
		.workspace-rail {
			top: 70px;
			width: 40px;
			gap: 6px;
		}
		.view-switch {
			gap: 6px;
		}
		.workspace-rail button {
			width: 30px;
			height: 30px;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.activity {
			animation: none;
		}
		button,
		.stage-bottom {
			transition: none;
		}
	}
</style>
