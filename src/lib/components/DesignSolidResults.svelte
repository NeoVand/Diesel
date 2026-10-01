<script lang="ts">
	import Icon from './Icon.svelte';
	import type { StructuralResult } from '$lib/design/structural';
	let {
		result,
		busy,
		error,
		loadLabel,
		forceN,
		onsolve,
		oncancel,
		ondeeprefine,
		onexport,
		onshow,
		oncompare,
		comparing,
		comparisonProgress,
		stale = false,
		resultContext = ''
	}: {
		result: StructuralResult | null;
		busy: boolean;
		error: string;
		loadLabel: string;
		forceN: [number, number, number];
		onsolve: (refine: boolean) => void;
		oncancel: () => void;
		ondeeprefine: () => void;
		onexport: () => void;
		onshow: () => void;
		oncompare: () => void;
		comparing: boolean;
		comparisonProgress: string;
		stale?: boolean;
		resultContext?: string;
	} = $props();
	const fmt = (n: number, digits = 1) =>
		n.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits });
	const percent = (n: number | null) => (n === null ? '—' : `${fmt(n * 100, 2)}%`);
	let balanced = $derived(
		result &&
			result.stats.forceBalanceRelative < 1e-5 &&
			result.stats.momentBalanceRelative < 1e-5 &&
			result.stats.solveResidualRelative < 1e-5
	);
</script>

<div class="solid-results" aria-label="Solid analysis results">
	<div class="section-heading">
		<h2>Solid analysis</h2>
		<span>Linear elastic</span>
	</div>
	<section class="load-case" aria-label="Selected load input">
		<h3>Selected input</h3>
		<p class="case-label">{loadLabel}</p>
		<dl class="readings">
			<div>
				<dt>Axial · compression +</dt>
				<dd>{fmt(-forceN[1] / 1000, 2)} <span>kN</span></dd>
			</div>
			<div>
				<dt>Transverse · rod plane</dt>
				<dd>{fmt(forceN[0], 0)} <span>N</span></dd>
			</div>
		</dl>
	</section>
	<div class="solve-actions">
		<button
			class="primary"
			aria-label={busy ? 'Meshing and solving' : 'Solve this load case'}
			disabled={busy || comparing}
			onclick={() => onsolve(false)}
		>
			<Icon name={busy ? 'rotate' : 'play'} size={16} />{busy ? 'Solving…' : 'Solve this load case'}
		</button>
		<button disabled={busy || comparing} onclick={oncompare}>
			<Icon name="layers" size={16} />{comparing
				? 'Comparing designs…'
				: 'Run candidate comparison'}
		</button>
		{#if busy || comparing}<button class="cancel" onclick={oncancel}
				><Icon name="stop" size={14} />Stop analysis</button
			>{/if}
	</div>
	{#if comparisonProgress}<p class="progress" aria-live="polite">{comparisonProgress}</p>{/if}
	{#if error}<p class="error" role="alert">{error}</p>{/if}
	{#if result}
		<section class="saved-result" aria-label="Saved solution">
			<div class="result-heading">
				<h3>Saved result</h3>
				<span class:outdated={stale}>{stale ? 'Outdated' : 'Available'}</span>
			</div>
			<p class="case-label">{result.loadCase.label}</p>
			{#if resultContext}<p class="context">{resultContext}</p>{/if}
			{#if stale}<p class="stale-note">
					Inputs have changed. Values below belong to the saved case.
				</p>{/if}
			<dl class="metrics">
				<div>
					<dt>Interior stress · P95</dt>
					<dd>{fmt(result.stats.interiorP95VonMisesMpa)} <span>MPa</span></dd>
				</div>
				<div>
					<dt>Maximum displacement</dt>
					<dd>{fmt(result.stats.maxDisplacementMm * 1000, 2)} <span>µm</span></dd>
				</div>
			</dl>
			<button onclick={onshow} aria-label="Show field"
				><Icon name="eye" size={15} />{stale
					? 'Restore saved case & show field'
					: 'Show field'}</button
			>
			<div class="check" class:fail={!balanced}>
				<Icon name={balanced ? 'check' : 'info'} size={15} /><span
					>{balanced ? 'Equilibrium residuals < 10⁻⁵' : 'Equilibrium needs review'}</span
				>
			</div>
		</section>
		<details class="refinement" open>
			<summary>Mesh refinement<Icon name="right" size={14} /></summary>
			<p
				class="refinement-status"
				class:needs-refinement={!result.convergence.withinScreeningTolerance}
			>
				{!result.convergence.performed
					? 'Not checked'
					: result.convergence.withinScreeningTolerance
						? 'Integral-response mesh check passed'
						: 'Refinement requires attention'}
			</p>
			<dl>
				<div>
					<dt>Elements / nodes</dt>
					<dd>{result.stats.elements.toLocaleString()} / {result.stats.nodes.toLocaleString()}</dd>
				</div>
				{#if result.convergence.performed}
					<div>
						<dt>Displacement change</dt>
						<dd>{percent(result.convergence.displacementRelativeChange)}</dd>
					</div>
					<div>
						<dt>Energy change</dt>
						<dd>{percent(result.convergence.strainEnergyRelativeChange)}</dd>
					</div>
					<div>
						<dt>Interior P95 change</dt>
						<dd>{percent(result.convergence.interiorP95RelativeChange)}</dd>
					</div>
				{/if}
			</dl>
			<p class="note">
				Criterion: displacement and strain-energy change &lt; 8% between the final two meshes. Local
				stress convergence is not established.
			</p>
			<button disabled={busy || comparing} onclick={() => onsolve(true)}
				><Icon name="grid" size={15} />Solve & refine selected case</button
			>
			{#if result.convergence.meshes.length < 3}<button
					disabled={busy || comparing || stale}
					title={stale ? 'Restore the saved case before refining it.' : undefined}
					onclick={ondeeprefine}
					><Icon name="target" size={15} />Deep refine displayed result</button
				>{/if}
		</details>
		<details>
			<summary>Material & boundary conditions<Icon name="right" size={14} /></summary>
			<dl>
				<div>
					<dt>Elastic modulus</dt>
					<dd>{fmt(result.material.youngsModulusMpa / 1000, 0)} GPa</dd>
				</div>
				<div>
					<dt>Poisson ratio</dt>
					<dd>{fmt(result.material.poissonRatio, 2)}</dd>
				</div>
				<div>
					<dt>Density</dt>
					<dd>{fmt(result.material.densityKgM3, 0)} kg/m³</dd>
				</div>
				<div>
					<dt>Big bore</dt>
					<dd>Fixed XYZ</dd>
				</div>
				<div>
					<dt>Small bore</dt>
					<dd>Distributed traction</dd>
				</div>
				<div>
					<dt>Body inertia</dt>
					<dd>{result.loadCase.inertia ? 'Included' : 'None'}</dd>
				</div>
			</dl>
			<p class="note">{result.material.provenance}</p>
		</details>
		<details>
			<summary>Numerical evidence<Icon name="right" size={14} /></summary>
			<dl>
				<div>
					<dt>Force residual</dt>
					<dd>{result.stats.forceBalanceRelative.toExponential(2)}</dd>
				</div>
				<div>
					<dt>Moment residual</dt>
					<dd>{result.stats.momentBalanceRelative.toExponential(2)}</dd>
				</div>
				<div>
					<dt>Linear solve residual</dt>
					<dd>{result.stats.solveResidualRelative.toExponential(2)}</dd>
				</div>
				<div>
					<dt>Mesh volume error</dt>
					<dd>{fmt(result.stats.volumeRelativeError * 100, 3)}%</dd>
				</div>
				<div>
					<dt>Raw peak · diagnostic</dt>
					<dd>{fmt(result.stats.rawMaxElementVonMisesMpa)} MPa</dd>
				</div>
				<div>
					<dt>Strain energy</dt>
					<dd>{fmt(result.stats.strainEnergyNmm, 2)} N mm</dd>
				</div>
			</dl>
			<p class="note">{result.convergence.note}</p>
			<p class="note">{result.method}</p>
			<p class="identifier">Analysis {result.analysisHash}</p>
			<button onclick={onexport}><Icon name="arrow" size={15} />Export solver evidence</button>
		</details>
		<details>
			<summary>Model scope<Icon name="right" size={14} /></summary>
			{#each result.limitations as limitation (limitation)}<p class="note">{limitation}</p>{/each}
		</details>
	{:else}
		<div class="empty">
			<h3>No solid solution</h3>
			<p>Solve the selected load case to inspect stress and displacement.</p>
		</div>
		<details>
			<summary>Study definition<Icon name="right" size={14} /></summary>
			<p class="note">
				Three-dimensional linear elasticity. Assumed steel, fixed big bore and distributed
				small-bore loading. Cycle inertia is included.
			</p>
			<p class="note">
				Candidate comparison solves baseline and candidate under their critical compression and
				tension cases.
			</p>
		</details>
	{/if}
	<p class="scope">
		Concept study. Bearing contact, fatigue and manufacturing qualification are outside this
		calculation.
	</p>
</div>

<style>
	.solid-results {
		color: #cbd2da;
		font-size: 13px;
	}
	.section-heading,
	.result-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}
	.section-heading {
		margin-bottom: 16px;
	}
	h2 {
		font-size: 14px;
		margin: 0;
		color: #e4e8ed;
		font-weight: 600;
	}
	h3 {
		font-size: 13px;
		font-weight: 600;
		color: #d9dfe6;
		margin: 0;
	}
	.section-heading > span,
	.result-heading > span {
		color: #a6b0bb;
		font-size: 12px;
	}
	.result-heading > span.outdated {
		color: #e2b879;
	}
	.case-label {
		color: #d9e0e7;
		font-size: 13px;
		line-height: 1.5;
		margin: 7px 0 10px;
	}
	dl {
		margin: 8px 0 12px;
	}
	dl > div {
		display: flex;
		justify-content: space-between;
		gap: 12px;
		padding: 5px 0;
		font-size: 12px;
		line-height: 1.4;
	}
	dt {
		color: #a8b2be;
	}
	dd {
		margin: 0;
		flex-shrink: 0;
		color: #e1e6ec;
		text-align: right;
		font-variant-numeric: tabular-nums;
		font-variant-numeric: tabular-nums;
	}
	.readings > div,
	.metrics > div {
		align-items: baseline;
		font-size: 13px;
	}
	dd span {
		color: #a7b1bd;
		font-size: 12px;
	}
	button {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 7px;
		background: #202833;
		border: 1px solid #ffffff25;
		color: #d1d9e1;
		border-radius: 3px;
		padding: 8px 9px;
		font-size: 12px;
		cursor: pointer;
		width: 100%;
		line-height: 1.35;
	}
	button:hover {
		background: #2c343d;
		color: #fff;
		border-color: #ffffff45;
	}
	button:focus-visible,
	summary:focus-visible {
		outline: 2px solid var(--accent, #82b3e8);
		outline-offset: 2px;
	}
	button:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.primary {
		background: var(--accent, #82b3e8);
		color: #111821;
		font-weight: 600;
		border-color: var(--accent, #82b3e8);
		font-size: 13px;
	}
	.primary:hover {
		background: #a2c8ed;
		color: #111821;
	}
	.solve-actions {
		display: grid;
		gap: 6px;
	}
	.saved-result {
		margin-top: 18px;
		border-top: 1px solid #ffffff19;
		padding-top: 14px;
	}
	.context,
	.stale-note,
	.note,
	.scope,
	.progress,
	.empty p {
		color: #a4afbb;
		font-size: 12px;
		line-height: 1.55;
		margin: 9px 0 12px;
	}
	.context {
		margin-top: -4px;
	}
	.stale-note {
		color: #e2b879;
	}
	.check {
		display: flex;
		align-items: center;
		gap: 6px;
		color: #a3c4b7;
		font-size: 12px;
		margin: 11px 0 14px;
	}
	.check.fail {
		color: #dfb576;
	}
	details {
		border-top: 1px solid #ffffff17;
		padding-bottom: 3px;
	}
	summary {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 12px 0;
		color: #d1d8e0;
		font-size: 13px;
		list-style: none;
		cursor: pointer;
	}
	summary::-webkit-details-marker {
		display: none;
	}
	details[open] summary :global(svg) {
		transform: rotate(90deg);
	}
	details button {
		margin-bottom: 7px;
	}
	.refinement-status {
		color: #a3c4b7;
		margin: 0 0 10px;
		font-size: 12px;
		line-height: 1.45;
	}
	.refinement-status.needs-refinement {
		color: #dfb576;
	}
	.identifier {
		color: #a4afbb;
		font: 12px/1.5 var(--mono);
		overflow-wrap: anywhere;
	}
	.empty {
		margin-top: 18px;
		padding: 14px 0 4px;
		border-top: 1px solid #ffffff17;
	}
	.scope {
		border-top: 1px solid #ffffff17;
		padding-top: 12px;
		margin-bottom: 0;
	}
	.error {
		color: #e6aa98;
		font-size: 12px;
		line-height: 1.55;
		margin: 12px 0;
	}
</style>
