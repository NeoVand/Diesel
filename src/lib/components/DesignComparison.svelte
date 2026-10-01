<script lang="ts">
	import { untrack } from 'svelte';
	import Icon from './Icon.svelte';
	import { rodMassProperties, type OperatingScenario } from '$lib/design/operating-cycle';
	import type { StudyExperiment } from '$lib/design/study-storage';
	import type { DesignStudio, DesignCameraPose, DesignCameraView } from '$lib/scene/design-studio';
	import type { StructuralDisplay } from '$lib/scene/design-structural';
	import { DESIGN_CAMERA_FOV } from '$lib/scene/design-camera';

	type SolvedCase = StudyExperiment['results'][number];
	type MatchedCase = {
		key: string;
		reference: SolvedCase;
		candidate: SolvedCase;
		label: string;
	};
	let {
		experiments,
		oninspect
	}: {
		experiments: StudyExperiment[];
		oninspect: (experiment: StudyExperiment, solved: SolvedCase) => void;
	} = $props();
	let selectedKey = $state('');
	let field = $state<'stress' | 'displacement'>('stress');
	let amplification = $state(1);
	let showMesh = $state(false);
	let showBoundaries = $state(false);
	let projection = $state<'orthographic' | 'perspective'>('orthographic');
	let error = $state('');
	let viewers = $state.raw<[DesignStudio, DesignStudio] | null>(null);
	let synchronizing = false;
	let fittedViewers: [DesignStudio, DesignStudio] | null = null;
	let fittedGeometryKey = '';
	let viewportElements: HTMLCanvasElement[] = [];
	const uid = $props.id();
	const fmt = (n: number, digits = 2) =>
		n.toLocaleString('en-US', { maximumFractionDigits: digits });

	function conditionKey(scenario: OperatingScenario, angleDeg: number) {
		// Names are presentation metadata; every numerical operating assumption must match exactly.
		const values = Object.entries(scenario)
			.filter(([key]) => key !== 'label')
			.sort(([a], [b]) => a.localeCompare(b));
		return JSON.stringify([angleDeg, values]);
	}
	let reference = $derived(experiments[0] ?? null);
	let candidate = $derived(experiments[1] ?? null);
	let matches = $derived.by(() => {
		if (!reference || !candidate) return [] as MatchedCase[];
		return reference.results.flatMap((first) => {
			const condition = conditionKey(first.scenario, first.angleDeg);
			const second = candidate.results.find(
				(other) => conditionKey(other.scenario, other.angleDeg) === condition
			);
			return second
				? [
						{
							key: `${first.report.analysisHash}/${second.report.analysisHash}`,
							reference: first,
							candidate: second,
							label: `${first.report.loadCase.forceN[1] <= 0 ? 'Compression' : 'Tension'} · ${fmt(first.scenario.rpm, 0)} rpm · ${fmt(first.angleDeg, 1)}°`
						}
					]
				: [];
		});
	});
	let active = $derived(matches.find((pair) => pair.key === selectedKey) ?? matches[0] ?? null);
	let mass = $derived(
		active && reference && candidate
			? [
					rodMassProperties({ ...reference.params, ...active.reference.report.geometryParams })
						.massKg * 1000,
					rodMassProperties({ ...candidate.params, ...active.candidate.report.geometryParams })
						.massKg * 1000
				]
			: [0, 0]
	);
	let massChange = $derived(mass[0] ? (mass[1] / mass[0] - 1) * 100 : 0);
	let displacementChange = $derived(
		active && active.reference.report.stats.maxDisplacementMm > 0
			? (active.candidate.report.stats.maxDisplacementMm /
					active.reference.report.stats.maxDisplacementMm -
					1) *
					100
			: 0
	);
	let sides = $derived(
		active && reference && candidate
			? [
					{ id: 'reference', experiment: reference, solved: active.reference, mass: mass[0] },
					{ id: 'candidate', experiment: candidate, solved: active.candidate, mass: mass[1] }
				]
			: []
	);

	function displaySettings(): StructuralDisplay {
		return {
			enabled: true,
			field,
			deformationScale: amplification,
			showUndeformed: amplification > 1,
			showMesh,
			showBoundaryConditions: showBoundaries,
			fieldMaximum: field === 'stress' ? 250 : 0.1
		};
	}

	function fitBoth(instances: [DesignStudio, DesignStudio], view: DesignCameraView = 'front') {
		if (!active) return;
		synchronizing = true;
		try {
			// These panels have no floating tools, so fit the native surfaces with 24 px padding.
			// The two cameras use one physical frame, including both designs and displayed deformation.
			for (const instance of instances) instance.setCameraView(view, true);
			const pose = instances[0].getCameraPose();
			const min = [Infinity, Infinity, Infinity],
				max = [-Infinity, -Infinity, -Infinity];
			for (const solved of [active.reference, active.candidate]) {
				const surface = solved.report.surface;
				for (let i = 0; i < surface.positionsMm.length; i += 3) {
					for (let axis = 0; axis < 3; axis++) {
						const original = surface.positionsMm[i + axis];
						const deformed = original + surface.displacementMm[i + axis] * amplification;
						min[axis] = Math.min(min[axis], original, deformed);
						max[axis] = Math.max(max[axis], original, deformed);
					}
				}
			}
			const normalize = (v: number[]) => {
				const length = Math.hypot(...v);
				return v.map((n) => n / length);
			};
			const cross = (a: number[], b: number[]) => [
				a[1] * b[2] - a[2] * b[1],
				a[2] * b[0] - a[0] * b[2],
				a[0] * b[1] - a[1] * b[0]
			];
			const dot = (a: number[], b: number[]) => a.reduce((sum, value, i) => sum + value * b[i], 0);
			const eye = normalize(pose.position.map((v, i) => v - pose.target[i]));
			const horizontal = normalize(cross(pose.up, eye)),
				vertical = normalize(cross(eye, horizontal));
			const center = min.map((v, i) => (v + max[i]) / 2) as [number, number, number];
			const width = Math.min(...viewportElements.map((canvas) => canvas.clientWidth));
			const height = Math.min(...viewportElements.map((canvas) => canvas.clientHeight));
			const availableX = Math.max(0.3, 1 - 48 / width),
				availableY = Math.max(0.3, 1 - 48 / height);
			const tangent = Math.tan((DESIGN_CAMERA_FOV * Math.PI) / 360),
				aspect = width / height;
			let halfSpan = 1,
				distance = 1;
			for (const x of [min[0], max[0]])
				for (const y of [min[1], max[1]])
					for (const z of [min[2], max[2]]) {
						const delta = [x - center[0], y - center[1], z - center[2]];
						const px = Math.abs(dot(delta, horizontal)),
							py = Math.abs(dot(delta, vertical)),
							depth = dot(delta, eye);
						halfSpan = Math.max(halfSpan, py / availableY, px / (aspect * availableX));
						distance = Math.max(
							distance,
							depth + py / (tangent * availableY),
							depth + px / (tangent * aspect * availableX)
						);
					}
			distance *= 1.02;
			const shared: DesignCameraPose = {
				...pose,
				target: center,
				position: center.map((value, i) => value + eye[i] * distance) as [number, number, number],
				verticalSpanMm:
					pose.projection === 'orthographic' ? halfSpan * 2.04 : distance * tangent * 2
			};
			for (const instance of instances) instance.applyCameraPose(shared);
		} finally {
			synchronizing = false;
		}
	}

	function mountViewports(node: HTMLDivElement) {
		let disposed = false;
		let owned: [DesignStudio, DesignStudio] | null = null;
		function synchronize(source: number, pose: DesignCameraPose) {
			if (!owned || synchronizing) return;
			synchronizing = true;
			owned[1 - source].applyCameraPose(pose);
			synchronizing = false;
		}
		void (async () => {
			try {
				const { DesignStudio } = await import('$lib/scene/design-studio');
				if (disposed) return;
				const canvases = node.querySelectorAll('canvas');
				viewportElements = Array.from(canvases);
				if (canvases.length !== 2) throw new Error('The comparison view could not be initialized.');
				const left = new DesignStudio(canvases[0], {
					onCameraChange: (pose) => synchronize(0, pose)
				});
				let right: DesignStudio;
				try {
					right = new DesignStudio(canvases[1], { onCameraChange: (pose) => synchronize(1, pose) });
				} catch (cause) {
					left.dispose();
					throw cause;
				}
				owned = [left, right];
				for (const instance of owned) {
					instance.setView('rod');
					instance.setRunning(false);
					instance.setDimensions(false);
					instance.setBaseline(false);
					instance.setForces(false);
					instance.setRenderPreset('technical');
					instance.setProjection('orthographic');
				}
				viewers = owned;
			} catch (cause) {
				if (!disposed)
					error =
						cause instanceof Error ? cause.message : 'The comparison renderer is unavailable.';
			}
		})();
		return () => {
			disposed = true;
			owned?.forEach((instance) => instance.dispose());
			if (viewers === owned) viewers = null;
			owned = null;
			viewportElements = [];
		};
	}

	$effect(() => {
		if (!viewers || !active || !reference || !candidate) return;
		const inputs = [reference, candidate],
			reports = [active.reference.report, active.candidate.report];
		for (let i = 0; i < 2; i++) {
			viewers[i].setDesign({ ...inputs[i].params, ...reports[i].geometryParams });
			viewers[i].setStructuralResult(reports[i]);
		}
		untrack(() => {
			for (const instance of viewers!) instance.setStructuralDisplay(displaySettings());
			const geometryKey = JSON.stringify(reports.map((report) => report.geometryParams));
			if (fittedViewers !== viewers || geometryKey !== fittedGeometryKey) {
				fitBoth(viewers!);
				fittedViewers = viewers;
				fittedGeometryKey = geometryKey;
			}
		});
	});
	$effect(() => {
		const settings = displaySettings();
		for (const instance of viewers ?? []) instance.setStructuralDisplay(settings);
	});
	function setProjection(next: 'orthographic' | 'perspective') {
		projection = next;
		if (!viewers) return;
		for (const instance of viewers) instance.setProjection(next);
		viewers[1].applyCameraPose(viewers[0].getCameraPose());
	}
	function setAmplification(raw: string) {
		const parsed = Number(raw);
		if (raw.trim() && Number.isFinite(parsed)) amplification = Math.max(1, Math.min(150, parsed));
	}
</script>

<section class="design-comparison" aria-label="Synchronized solid comparison">
	<div class="comparison-heading">
		<h3>Solid comparison</h3>
		<span><Icon name="link" size={14} />Linked cameras · shared contour scale</span>
	</div>
	{#if active}
		<div class="case-switcher" aria-label="Matching comparison load cases">
			{#each matches as pair (pair.key)}<button
					class:active={pair.key === active.key}
					aria-pressed={pair.key === active.key}
					onclick={() => (selectedKey = pair.key)}>{pair.label}</button
				>{/each}
		</div>
		<div class="comparison-controls">
			<div class="segment" aria-label="Comparison result field">
				<button
					class:active={field === 'stress'}
					aria-pressed={field === 'stress'}
					onclick={() => (field = 'stress')}>Stress</button
				><button
					class:active={field === 'displacement'}
					aria-pressed={field === 'displacement'}
					onclick={() => (field = 'displacement')}>Displacement</button
				>
			</div>
			<label class="amplification" for={`${uid}-amplification`}
				>Deformation <input
					id={`${uid}-amplification`}
					aria-label="Comparison deformation amplification"
					type="number"
					min="1"
					max="150"
					step="1"
					value={amplification}
					onchange={(event) => {
						setAmplification(event.currentTarget.value);
						event.currentTarget.value = String(amplification);
					}}
				/><span>×</span></label
			>
			<label class="toggle"><input type="checkbox" bind:checked={showMesh} />Mesh</label>
			<label class="toggle"
				><input type="checkbox" bind:checked={showBoundaries} />Loads & constraints</label
			>
			<div class="view-actions">
				<button
					title="Front view and fit both models"
					aria-label="Front view and fit comparison"
					onclick={() => viewers && fitBoth(viewers)}><Icon name="front" size={15} />Front</button
				><button
					title="Isometric view and fit both models"
					aria-label="Isometric view and fit comparison"
					onclick={() => viewers && fitBoth(viewers, 'isometric')}
					><Icon name="cube" size={15} /></button
				><button
					aria-label="Toggle comparison projection"
					title="Toggle projection"
					onclick={() =>
						setProjection(projection === 'orthographic' ? 'perspective' : 'orthographic')}
					>{projection === 'orthographic' ? 'Orthographic' : 'Perspective'}</button
				>
			</div>
		</div>
		<div class="viewports" {@attach mountViewports}>
			{#each sides as side (side.id)}
				<article class="comparison-side">
					<div class="model-heading">
						<div>
							<span>{side.id === 'reference' ? 'Reference' : 'Candidate'}</span><strong
								>{side.experiment.label}</strong
							>
						</div>
						<button onclick={() => oninspect(side.experiment, side.solved)}
							>Inspect<Icon name="right" size={14} /></button
						>
					</div>
					<div class="canvas-frame">
						<canvas
							aria-label={`${side.id === 'reference' ? 'Reference' : 'Candidate'} solid result`}
							><p>Interactive solid result. Numerical values follow below.</p></canvas
						>{#if !viewers && !error}<span class="loading">Loading result geometry…</span>{/if}
					</div>
					<dl class="result-values">
						<div>
							<dt>Solid mass</dt>
							<dd>{fmt(side.mass)} <span>g</span></dd>
						</div>
						<div>
							<dt>Interior stress · P95</dt>
							<dd>{fmt(side.solved.report.stats.interiorP95VonMisesMpa, 1)} <span>MPa</span></dd>
						</div>
						<div>
							<dt>Max. displacement</dt>
							<dd>{fmt(side.solved.report.stats.maxDisplacementMm * 1000)} <span>µm</span></dd>
						</div>
					</dl>
					<p class="case-detail">
						{fmt(side.solved.scenario.rpm, 0)} rpm · {fmt(side.solved.angleDeg, 1)}° · {fmt(
							-side.solved.report.loadCase.forceN[1] / 1000
						)} kN axial
					</p>
				</article>
			{/each}
		</div>
		{#if error}<p class="error" role="alert">{error}</p>{/if}
		<div class="comparison-footer">
			<div class="contour-scale" aria-label="Shared comparison field scale">
				<span>{field === 'stress' ? 'Von Mises stress / MPa' : 'Displacement / mm'}</span>
				<div class="color-ramp"></div>
				<div class="scale-ticks">
					<span>0</span><span>{field === 'stress' ? '125' : '0.05'}</span><span
						>{field === 'stress' ? '≥250' : '≥0.10'}</span
					>
				</div>
			</div>
			<p>
				<strong>{massChange > 0 ? '+' : ''}{fmt(massChange, 1)}% mass</strong><span>
					/
				</span><strong
					>{displacementChange > 0 ? '+' : ''}{fmt(displacementChange, 1)}% max. displacement</strong
				><br />Candidate relative to reference at this matched load condition.
			</p>
			<p class="scope">
				Identical operating assumptions and crank angle. Mesh fields shown at {amplification}×
				deformation; reported values are unamplified. Contour values above the shared limit use the
				maximum color.
			</p>
		</div>
	{:else}
		<p class="empty">
			{experiments.length < 2
				? 'Complete a reference and candidate solve to compare solid results.'
				: 'No matching solved load cases. Side-by-side comparison requires identical operating assumptions and crank angle for both designs.'}
		</p>
	{/if}
</section>

<style>
	.design-comparison {
		color: #cbd3df;
		border-bottom: 1px solid #ffffff1a;
		padding: 15px 20px;
		font-size: 13px;
	}
	.comparison-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		margin-bottom: 10px;
	}
	h3 {
		margin: 0;
		font-size: 14px;
		color: #e2e8f0;
		font-weight: 600;
	}
	.comparison-heading > span {
		display: flex;
		align-items: center;
		gap: 6px;
		color: #a5b2c1;
		font-size: 12px;
	}
	button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		border: 1px solid #ffffff22;
		border-radius: 3px;
		background: #202833;
		color: #cbd6e3;
		padding: 6px 9px;
		font-size: 12px;
		cursor: pointer;
		line-height: 1.35;
	}
	button:hover {
		background: #2a3543;
		color: #fff;
		border-color: #ffffff40;
	}
	button.active {
		color: #c4e0ff;
		background: #233952;
		border-color: #729cc361;
	}
	button:focus-visible,
	input:focus-visible {
		outline: 2px solid var(--accent, #82b3e8);
		outline-offset: 2px;
	}
	.case-switcher {
		display: flex;
		flex-wrap: wrap;
		gap: 5px;
		margin-bottom: 9px;
	}
	.comparison-controls {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 9px 14px;
		padding: 9px 0 12px;
	}
	.segment {
		display: flex;
		gap: 2px;
	}
	.amplification {
		display: flex;
		align-items: center;
		gap: 6px;
		color: #aab7c6;
		font-size: 12px;
	}
	.amplification input {
		width: 47px;
		background: #202833;
		color: #e1e8ef;
		border: 1px solid #ffffff28;
		border-radius: 3px;
		padding: 5px;
		font-size: 13px;
		font-variant-numeric: tabular-nums;
		text-align: right;
	}
	.toggle {
		display: flex;
		align-items: center;
		gap: 5px;
		font-size: 12px;
		color: #bdc8d5;
		cursor: pointer;
		white-space: nowrap;
	}
	.toggle input {
		accent-color: var(--accent, #82b3e8);
		width: 13px;
		height: 13px;
		margin: 0;
	}
	.view-actions {
		display: flex;
		gap: 4px;
		margin-left: auto;
	}
	.viewports {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		gap: 1px;
		border: 1px solid #ffffff1d;
		background: #ffffff1d;
	}
	.comparison-side {
		min-width: 0;
		background: #141a21;
	}
	.model-heading {
		min-height: 50px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 9px;
		padding: 9px 12px;
		box-sizing: border-box;
	}
	.model-heading > div {
		min-width: 0;
	}
	.model-heading span {
		color: #a5b3c2;
		font-size: 12px;
		display: block;
		margin-bottom: 3px;
	}
	.model-heading strong {
		display: block;
		font-size: 13px;
		font-weight: 500;
		color: #e0e7f0;
		overflow-wrap: anywhere;
	}
	.model-heading button {
		flex-shrink: 0;
	}
	.canvas-frame {
		position: relative;
		height: var(--comparison-canvas-height, 260px);
		min-height: 180px;
	}
	canvas {
		width: 100%;
		height: 100%;
		display: block;
		outline: none;
		touch-action: none;
	}
	.loading {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		color: #aab6c5;
		font-size: 12px;
	}
	.result-values {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		margin: 0;
		gap: 10px;
		padding: 10px 12px 5px;
		border-top: 1px solid #ffffff14;
	}
	dt {
		color: #a9b6c5;
		font-size: 12px;
		line-height: 1.4;
	}
	dd {
		font-size: 14px;
		color: #e2e9f1;
		font-variant-numeric: tabular-nums;
		margin: 5px 0 0;
	}
	dd span {
		font-size: 12px;
		color: #a9b6c5;
	}
	.case-detail {
		margin: 3px 12px 10px;
		color: #9eafc0;
		font-size: 12px;
		line-height: 1.45;
	}
	.comparison-footer {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 13px 24px;
		padding-top: 11px;
	}
	.contour-scale {
		width: 180px;
		flex-shrink: 0;
		color: #b7c4d2;
		font-size: 12px;
	}
	.color-ramp {
		height: 6px;
		background: linear-gradient(to right, #4b9dda, #ecd18d, #f1744f);
		margin-top: 7px;
	}
	.scale-ticks {
		display: flex;
		justify-content: space-between;
		padding-top: 4px;
		font-variant-numeric: tabular-nums;
	}
	.comparison-footer p {
		color: #a9b8c8;
		font-size: 12px;
		line-height: 1.6;
		margin: 0;
	}
	.comparison-footer strong {
		font-weight: 500;
		color: #d3deea;
	}
	.comparison-footer .scope {
		flex: 1 1 250px;
	}
	.empty,
	.error {
		color: #a6b4c5;
		font-size: 13px;
		line-height: 1.6;
		margin: 12px 0;
	}
	.error {
		color: #e5aa98;
	}
	@media (max-width: 800px) {
		.design-comparison {
			padding: 12px 14px;
		}
		.comparison-heading {
			align-items: flex-start;
			flex-direction: column;
			gap: 6px;
		}
		.viewports {
			grid-template-columns: minmax(0, 1fr);
		}
		.view-actions {
			margin-left: 0;
		}
		.canvas-frame {
			height: 280px;
		}
	}
</style>
