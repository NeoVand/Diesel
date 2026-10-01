<script lang="ts">
	import { asset } from '$app/paths';
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import {
		CubeIcon,
		Layers01Icon,
		Search01Icon,
		ArrowExpand01Icon,
		Rotate01Icon,
		ViewIcon
	} from '@hugeicons/core-free-icons';
	import type {
		SourceAssetReview,
		ReviewPart,
		ReviewMode,
		ReviewStats
	} from '$lib/scene/source-asset-review';
	let viewer: SourceAssetReview | undefined;
	let parts = $state.raw<ReviewPart[]>([]);
	let stats = $state.raw<ReviewStats | null>(null);
	let mode = $state<ReviewMode>('assembly');
	let explosion = $state(0);
	let selectedId = $state<string | null>(null);
	let isolated = $state(false);
	let search = $state('');
	let assembly = $state('all');
	let progress = $state<number | null>(null);
	let message = $state('Opening purchased geometry');
	let error = $state('');
	let panel = $state(true);
	let page = $state(0);
	const pageSize = 60;
	let selected = $derived(parts.find((part) => part.id === selectedId));
	let assemblies = $derived([...new Set(parts.map((part) => part.assembly))].sort());
	let matches = $derived(
		parts.filter(
			(part) =>
				(assembly === 'all' || part.assembly === assembly) &&
				`${part.id} ${part.name} ${part.path} ${part.material}`
					.toLowerCase()
					.includes(search.toLowerCase().trim())
		)
	);
	let pages = $derived(Math.max(1, Math.ceil(matches.length / pageSize)));
	let visibleParts = $derived(
		matches.slice(Math.min(page, pages - 1) * pageSize, (Math.min(page, pages - 1) + 1) * pageSize)
	);

	function mountViewer(host: HTMLElement) {
		let disposed = false;
		let instance: SourceAssetReview | undefined;
		void import('$lib/scene/source-asset-review')
			.then(({ SourceAssetReview }) => {
				if (disposed) return;
				instance = new SourceAssetReview(host, {
					onready: (records, counts) => {
						if (!disposed) {
							parts = records;
							stats = counts;
						}
					},
					onprogress: (value, text) => {
						if (!disposed) {
							progress = value;
							message = text;
						}
					},
					onselect: (id, isolate) => {
						if (!disposed) {
							selectedId = id;
							isolated = isolate;
						}
					},
					onerror: (text) => {
						if (!disposed) error = text;
					}
				});
				viewer = instance;
				return instance.load(asset('/models/v12-review.glb'));
			})
			.catch((reason: unknown) => {
				if (!disposed)
					error = reason instanceof Error ? reason.message : 'The model could not be opened.';
			});
		return () => {
			disposed = true;
			instance?.dispose();
			if (viewer === instance) viewer = undefined;
		};
	}
	function chooseMode(value: ReviewMode) {
		mode = value;
		viewer?.setMode(value);
	}
	function reset() {
		mode = 'assembly';
		explosion = 0;
		viewer?.reset();
	}
	function changeExplosion(event: Event) {
		explosion = Number((event.currentTarget as HTMLInputElement).value);
		viewer?.setExplosion(explosion / 100);
	}
	function keydown(event: KeyboardEvent) {
		if (event.key === 'Escape') viewer?.showAll();
	}
</script>

<svelte:window onkeydown={keydown} />
<svelte:head
	><title>V12 Diesel Engine · Source assembly review</title><meta
		name="description"
		content="Inspect the purchased V12 diesel concept and its actual internal components."
	/></svelte:head
>

<main class="review" class:panel-open={panel}>
	<header>
		<div class="identity">
			<HugeiconsIcon icon={CubeIcon} size={25} />
			<div>
				<strong>V12 diesel / Engine explorer</strong><span
					>Purchased concept · source assembly review</span
				>
			</div>
		</div>
		<div class="header-actions">
			<span class="audit-badge">Native solids checked</span><button
				class="icon-button"
				aria-label="Toggle component browser"
				aria-expanded={panel}
				onclick={() => (panel = !panel)}><HugeiconsIcon icon={Layers01Icon} size={20} /></button
			>
		</div>
	</header>
	<section class="stage" aria-label="Engine inspection workspace">
		<div class="viewport" {@attach mountViewer}></div>
		<div class="stage-title">
			<span class="eyebrow">GENERIC QUAD-TURBO DIESEL</span>
			<h1>See what is really inside.</h1>
			<p>60° V12 <span>/</span> 85 × 100 mm <span>/</span> 6.81 L geometric displacement</p>
		</div>
		{#if !stats || error}
			<div class="loading" role="status">
				<strong>{error ? 'Unable to display the assembly' : message}</strong>{#if error}<p>
						{error}
					</p>
					<button onclick={() => window.location.reload()}>Reload review</button>{:else}<progress
						max="1"
						value={progress ?? undefined}
					></progress>
					<p>
						{progress === null
							? 'Loading source components…'
							: `${Math.round(progress * 100)}% transferred`}
					</p>{/if}
			</div>
		{/if}
		{#if isolated}<button class="isolation" onclick={() => viewer?.showAll()}
				>Showing one component <span>Show assembly · Esc</span></button
			>{/if}
		<div class="view-tools" aria-label="View controls">
			<button disabled={!stats} onclick={() => viewer?.fit()} title="Fit visible geometry"
				><HugeiconsIcon icon={ArrowExpand01Icon} size={20} /><span>Fit view</span></button
			>
			<button disabled={!stats} onclick={reset} title="Restore assembled view"
				><HugeiconsIcon icon={Rotate01Icon} size={20} /><span>Reset</span></button
			>
		</div>
		<div class="control-dock">
			<div class="modes" aria-label="Assembly view">
				<button
					class:active={mode === 'assembly'}
					aria-pressed={mode === 'assembly'}
					disabled={!stats}
					onclick={() => chooseMode('assembly')}
					><HugeiconsIcon icon={CubeIcon} size={19} />Assembly</button
				>
				<button
					class:active={mode === 'internal'}
					aria-pressed={mode === 'internal'}
					disabled={!stats}
					onclick={() => chooseMode('internal')}
					><HugeiconsIcon icon={ViewIcon} size={19} />Internal machinery</button
				>
			</div>
			<div class="explode">
				<label for="separation">Separate components <output>{explosion}%</output></label><input
					id="separation"
					aria-label="Component separation"
					type="range"
					min="0"
					max="100"
					step="1"
					value={explosion}
					disabled={!stats}
					oninput={changeExplosion}
				/>
			</div>
		</div>
		<div class="stage-footer">
			<span>Drag to orbit · Scroll to zoom · Double-click to isolate</span><span
				>{stats
					? `${stats.parts.toLocaleString()} source mesh occurrences`
					: 'Source geometry'}</span
			>
		</div>
	</section>
	{#if panel}
		<aside aria-label="Component browser">
			<div class="panel-heading">
				<span class="eyebrow">SOURCE COMPONENTS</span><strong
					>{stats?.parts.toLocaleString() ?? '—'}</strong
				>
			</div>
			<label class="search"
				><HugeiconsIcon icon={Search01Icon} size={18} /><input
					aria-label="Search components"
					placeholder="Find a part, material or ID"
					value={search}
					oninput={(event) => {
						search = event.currentTarget.value;
						page = 0;
					}}
				/></label
			>
			<label class="filter"
				><span>Assembly</span><select
					aria-label="Filter assembly"
					value={assembly}
					onchange={(event) => {
						assembly = event.currentTarget.value;
						page = 0;
					}}
					><option value="all">All assemblies</option>{#each assemblies as name (name)}<option
							value={name}>{name}</option
						>{/each}</select
				></label
			>
			<div class="part-list" aria-label="Source part results">
				{#each visibleParts as part (part.id)}<button
						class:selected={selectedId === part.id}
						onclick={() => viewer?.select(part.id)}
						ondblclick={() => viewer?.select(part.id, true)}
						><span>{part.name}</span><small>{part.assembly} <em>{part.id}</em></small></button
					>{:else}<p class="empty">
						{stats ? 'No matching components.' : 'Components appear after loading.'}
					</p>{/each}
			</div>
			<div class="pagination">
				<span>{matches.length.toLocaleString()} matches</span><button
					aria-label="Previous parts page"
					disabled={page === 0}
					onclick={() => page--}>‹</button
				><span>{Math.min(page + 1, pages)} / {pages}</span><button
					aria-label="Next parts page"
					disabled={page >= pages - 1}
					onclick={() => page++}>›</button
				>
			</div>
			{#if selected}<section class="selection" aria-label="Selected component details">
					<span class="eyebrow">{selected.id}</span>
					<h2>{selected.name}</h2>
					<p>{selected.material}</p>
					<div class="selection-actions">
						<button onclick={() => viewer?.focus(selected.id)}>Focus</button><button
							class="accent"
							onclick={() => viewer?.select(selected.id, true)}>Isolate</button
						>
					</div>
					<details>
						<summary>Source hierarchy</summary>
						<p class="source-path">{selected.path}</p>
					</details>
				</section>{/if}
			<div class="qualification">
				<strong>Geometry first. Evidence attached.</strong>
				<p>
					Native CAD contains 1,110 distinct valid solids. Some exported meshes combine multiple
					pieces. Motion, valve timing and performance are still under review.
				</p>
				<a href={asset('/models/v12-audit.md')} target="_blank" rel="noreferrer"
					>Read the geometry audit ↗</a
				>
			</div>
		</aside>
	{/if}
</main>

<style>
	.review {
		--review-fit-top: 118;
		--review-fit-bottom: 154;
		position: fixed;
		inset: 0;
		display: grid;
		grid-template: 68px minmax(0, 1fr) / minmax(0, 1fr);
		color: #e8edf2;
		background: #0a0d12;
	}
	.review.panel-open {
		grid-template-columns: minmax(0, 1fr) 310px;
	}
	header {
		grid-column: 1 / -1;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0 25px;
		border-bottom: 1px solid #ffffff12;
		background: #080b10ed;
		z-index: 2;
	}
	.identity,
	.header-actions {
		display: flex;
		align-items: center;
		gap: 14px;
	}
	.identity strong {
		display: block;
		font-size: 15px;
		font-weight: 550;
		letter-spacing: -0.03em;
	}
	.identity span {
		display: block;
		font-size: 11px;
		color: #8e9aa6;
		margin-top: 2px;
	}
	.identity :global(svg) {
		color: #d0aa6a;
	}
	.audit-badge {
		color: #b1bdc5;
		border: 1px solid #ffffff19;
		padding: 5px 9px;
		border-radius: 5px;
		font-size: 11px;
	}
	button {
		background: #141a22;
		color: #b8c2cd;
		border: 1px solid #ffffff13;
		border-radius: 6px;
	}
	button:hover {
		background: #232c37;
		color: white;
	}
	.icon-button {
		display: grid;
		place-items: center;
		width: 36px;
		height: 36px;
	}
	.stage {
		position: relative;
		min-width: 0;
		min-height: 0;
		overflow: hidden;
	}
	.viewport {
		position: absolute;
		inset: 0;
	}
	.stage-title {
		position: absolute;
		top: 28px;
		left: 30px;
		pointer-events: none;
	}
	.eyebrow {
		font-size: 10px;
		letter-spacing: 0.13em;
		color: #9babbc;
		font-weight: 550;
	}
	h1 {
		font-size: clamp(21px, 2vw, 30px);
		font-weight: 450;
		letter-spacing: -0.045em;
		line-height: 1.1;
		margin: 8px 0 10px;
	}
	.stage-title p {
		font-size: 12px;
		color: #9aa8b8;
		margin: 0;
	}
	.stage-title p span {
		margin: 0 8px;
		color: #53616f;
	}
	.view-tools {
		position: absolute;
		right: 20px;
		top: 24px;
		display: flex;
		gap: 6px;
	}
	.view-tools button {
		display: flex;
		align-items: center;
		gap: 7px;
		padding: 8px 10px;
		background: #0a0e15c9;
		backdrop-filter: blur(14px);
		font-size: 11px;
	}
	.control-dock {
		position: absolute;
		bottom: 48px;
		left: 50%;
		transform: translateX(-50%);
		display: flex;
		align-items: center;
		gap: 23px;
		padding: 12px 16px;
		background: #080c12e8;
		border: 1px solid #ffffff20;
		border-radius: 10px;
		backdrop-filter: blur(24px);
		box-shadow: 0 8px 40px #0004;
		max-width: calc(100% - 40px);
	}
	.modes {
		display: flex;
		gap: 4px;
	}
	.modes button {
		display: flex;
		align-items: center;
		white-space: nowrap;
		gap: 8px;
		padding: 10px 12px;
		border: none;
		background: transparent;
		font-size: 12px;
	}
	.modes .active {
		color: #edc886;
		background: #c997441c;
	}
	.explode {
		width: 190px;
		flex-shrink: 0;
	}
	.explode label {
		display: flex;
		justify-content: space-between;
		font-size: 11px;
		color: #b7c1ce;
	}
	.explode output {
		color: #e8be7a;
		font-variant-numeric: tabular-nums;
	}
	.explode input {
		width: 100%;
		--accent: #d6ad6d;
		--accent-hover: #e8be7a;
	}
	.stage-footer {
		position: absolute;
		bottom: 15px;
		left: 30px;
		right: 25px;
		display: flex;
		justify-content: space-between;
		font-size: 10px;
		color: #7c8a9a;
		gap: 12px;
		pointer-events: none;
	}
	aside {
		grid-column: 2;
		grid-row: 2;
		display: flex;
		flex-direction: column;
		gap: 13px;
		min-height: 0;
		padding: 23px 18px 18px;
		border-left: 1px solid #ffffff12;
		background: #090d13f2;
	}
	.panel-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.panel-heading strong {
		font-size: 12px;
		font-weight: 450;
		color: #b4c0cd;
	}
	.search {
		display: flex;
		align-items: center;
		gap: 8px;
		background: #111720;
		border: 1px solid #ffffff0f;
		border-radius: 6px;
		padding: 9px;
		color: #8394a5;
	}
	.search input {
		width: 100%;
		background: none;
		border: none;
		color: #e2e8ee;
		font-size: 12px;
		min-width: 0;
		outline-offset: 3px;
	}
	.filter {
		display: flex;
		align-items: center;
		gap: 10px;
		font-size: 11px;
		color: #91a1b2;
	}
	.filter select {
		width: 100%;
		min-width: 0;
		padding: 6px 7px;
		border: 1px solid #ffffff15;
		border-radius: 5px;
		background: #111720;
		color: #c9d2dd;
		font-size: 11px;
	}
	.part-list {
		flex: 1;
		overflow-y: auto;
		min-height: 100px;
	}
	.part-list button {
		display: block;
		text-align: left;
		width: 100%;
		border: 1px solid transparent;
		background: none;
		border-radius: 5px;
		padding: 9px;
		margin-bottom: 2px;
	}
	.part-list button:hover {
		background: #151e29;
	}
	.part-list button.selected {
		background: #a17c3423;
		border-color: #d4ae6b42;
		color: #e9c588;
	}
	.part-list button > span {
		display: block;
		font-size: 12px;
	}
	.part-list small {
		display: flex;
		justify-content: space-between;
		margin-top: 4px;
		color: #7f90a2;
		font-size: 10px;
		gap: 6px;
	}
	.part-list em {
		font: 9px var(--mono);
		white-space: nowrap;
	}
	.pagination {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 10px;
		color: #92a2b3;
	}
	.pagination > span:first-child {
		margin-right: auto;
	}
	.pagination button {
		width: 25px;
		height: 24px;
		font-size: 16px;
	}
	.selection {
		border-top: 1px solid #ffffff13;
		padding-top: 15px;
	}
	h2 {
		margin: 4px 0;
		font-size: 16px;
		font-weight: 500;
	}
	.selection p {
		font-size: 11px;
		color: #99a9ba;
		margin: 5px 0 10px;
	}
	.selection-actions {
		display: flex;
		gap: 6px;
		margin: 10px 0;
	}
	.selection-actions button {
		flex: 1;
		padding: 7px;
		font-size: 11px;
	}
	.selection-actions .accent {
		background: #d6ad6d;
		color: #14100a;
	}
	details {
		font-size: 10px;
		color: #8e9eaf;
	}
	summary {
		cursor: pointer;
	}
	.source-path {
		overflow-wrap: anywhere;
		max-height: 85px;
		overflow: auto;
	}
	.qualification {
		border-top: 1px solid #ffffff12;
		padding-top: 13px;
		font-size: 10px;
		color: #8a9bad;
	}
	.qualification strong {
		font-weight: 500;
		color: #bbc6d2;
	}
	.qualification p {
		margin: 5px 0 7px;
		line-height: 1.6;
	}
	.qualification a {
		text-decoration: none;
		color: #caa56b;
	}
	.empty {
		padding: 15px 8px;
		font-size: 12px;
		color: #91a1b3;
	}
	.loading {
		position: absolute;
		left: 50%;
		top: 50%;
		transform: translate(-50%, -50%);
		padding: 25px;
		width: min(370px, 90%);
		text-align: center;
		background: #0b1018ed;
		border: 1px solid #ffffff1c;
		border-radius: 10px;
	}
	.loading strong {
		font-size: 13px;
		font-weight: 500;
	}
	.loading p {
		font-size: 11px;
		color: #92a2b5;
	}
	.loading progress {
		display: block;
		width: 100%;
		height: 4px;
		margin: 20px 0 12px;
		accent-color: #d6ad6d;
	}
	.loading button {
		padding: 8px 15px;
	}
	.isolation {
		position: absolute;
		bottom: 135px;
		left: 50%;
		transform: translateX(-50%);
		font-size: 11px;
		padding: 9px 14px;
		background: #111923dd;
		white-space: nowrap;
	}
	.isolation span {
		margin-left: 12px;
		color: #e1b976;
	}
	@media (max-width: 1100px) {
		.review.panel-open {
			grid-template-columns: minmax(0, 1fr) 280px;
		}
		.control-dock {
			gap: 10px;
			flex-direction: column;
		}
		.explode {
			width: 100%;
		}
		.view-tools span {
			display: none;
		}
		.stage-title {
			left: 20px;
		}
		.stage-footer span:last-child {
			display: none;
		}
		.isolation {
			bottom: 186px;
		}
	}
	@media (max-width: 700px) {
		header {
			padding: 0 16px;
		}
		.audit-badge {
			display: none;
		}
		.review.panel-open {
			grid-template-columns: minmax(0, 1fr);
		}
		aside {
			position: absolute;
			z-index: 3;
			right: 0;
			top: 68px;
			bottom: 0;
			width: min(310px, 88%);
			box-shadow: -12px 0 40px #0008;
		}
		.stage-title {
			top: 24px;
		}
		h1 {
			font-size: 23px;
		}
		.stage-title p {
			max-width: 230px;
			line-height: 1.7;
		}
		.view-tools {
			top: 124px;
			right: 14px;
		}
		.stage-footer {
			left: 20px;
			font-size: 9px;
		}
	}
</style>
