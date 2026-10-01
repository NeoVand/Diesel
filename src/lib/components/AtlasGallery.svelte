<script lang="ts">
	import Icon from './Icon.svelte';
	import type { AtlasPreviewAsset, AtlasPreviewRenderer } from '$lib/scene/atlas-preview-renderer';
	import { V12_ATLAS_CATEGORIES } from '$lib/engine/v12-taxonomy';
	let {
		previews = {},
		loading = false,
		onopen,
		createPreview
	}: {
		previews?: Record<string, string>;
		loading?: boolean;
		onopen: (id: string) => void;
		createPreview?: (id: string) => AtlasPreviewAsset | null;
	} = $props();
	let search = $state('');
	let filter = $state('all');
	let rotating = $state(false);
	let previewError = $state('');
	let renderer = $state.raw<AtlasPreviewRenderer | null>(null);
	function mountCatalog(host: HTMLElement) {
		let disposed = false;
		let owned: AtlasPreviewRenderer | null = null;
		const motion = matchMedia('(prefers-reduced-motion: reduce)');
		rotating = !motion.matches;
		const changed = () => {
			if (motion.matches) rotating = false;
		};
		motion.addEventListener('change', changed);
		void (async () => {
			try {
				const { AtlasPreviewRenderer } = await import('$lib/scene/atlas-preview-renderer');
				if (disposed || !createPreview) return;
				owned = new AtlasPreviewRenderer(
					host,
					host.querySelector('canvas')!,
					(id) => createPreview?.(id) ?? null,
					(message) => {
						if (!disposed) previewError = message;
					}
				);
				renderer = owned;
			} catch (cause) {
				if (!disposed)
					previewError = cause instanceof Error ? cause.message : 'Live previews are unavailable.';
			}
		})();
		return () => {
			disposed = true;
			motion.removeEventListener('change', changed);
			owned?.dispose();
			if (renderer === owned) renderer = null;
		};
	}
	$effect(() => renderer?.setPlaying(rotating));
	const filters = [
		{ id: 'all', label: 'All families' },
		{ id: 'block', label: 'Rotating & structure' },
		{ id: 'heads', label: 'Head & valve train' },
		{ id: 'accessories', label: 'Timing & hardware' },
		{ id: 'systems', label: 'Air, fuel & cooling' }
	];
	let groups = $derived(
		V12_ATLAS_CATEGORIES.filter(
			(g) =>
				(filter === 'all' ||
					g.parent === filter ||
					(filter === 'systems' && !['block', 'heads', 'accessories'].includes(g.parent))) &&
				`${g.title} ${g.description} ${g.componentIds.join(' ')}`
					.toLowerCase()
					.includes(search.toLowerCase())
		)
	);
</script>

<section class="atlas-gallery" aria-label="Component family gallery" {@attach mountCatalog}>
	<canvas class="atlas-preview-canvas" aria-hidden="true"></canvas>
	<div class="gallery-toolbar">
		<div class="filters" aria-label="Component families">
			{#each filters as item (item.id)}<button
					class:active={filter === item.id}
					aria-pressed={filter === item.id}
					onclick={() => {
						filter = item.id;
					}}>{item.label}</button
				>{/each}
		</div>
		<button
			class="preview-playback"
			aria-label={rotating ? 'Pause preview rotation' : 'Resume preview rotation'}
			aria-pressed={rotating}
			disabled={!renderer || !!previewError}
			onclick={() => (rotating = !rotating)}
			><Icon name={rotating ? 'pause' : 'play'} size={14} /><span
				>{rotating ? 'Pause previews' : 'Rotate previews'}</span
			></button
		>
		<label class="search"
			><Icon name="search" size={15} /><input
				aria-label="Search atlas families"
				bind:value={search}
				placeholder="Filter families…"
			/></label
		>
	</div>
	<div class="gallery-scroll">
		<div class="gallery-heading">
			<span
				>{groups.length} families <b> / </b>
				{groups.reduce((total, group) => total + group.count, 0).toLocaleString()} mechanical bodies</span
			><small>Previews use independent fit scales</small>
		</div>
		{#if previewError}<p class="preview-error" role="status">
				Live preview unavailable. Select a family to inspect its source geometry.
			</p>{/if}
		{#if loading}<p class="loading" role="status">Loading component previews…</p>{/if}
		<div class="cards">
			{#each groups as group, i (group.id)}
				<button
					class="family-card"
					onclick={() => onopen(group.id)}
					aria-label={'Inspect ' + group.title}
				>
					<div class="preview" data-preview-id={group.id}>
						{#if previews[group.id]}<img
								src={previews[group.id]}
								alt=""
								loading="lazy"
							/>{:else}<div class="placeholder">
								<Icon name="cube" size={30} /><span
									>{createPreview && !previewError
										? 'Loading source geometry…'
										: 'Open in 3D'}</span
								>
							</div>{/if}<span class="family-index">{String(i + 1).padStart(2, '0')}</span><span
							class="open-icon"><Icon name="arrow" size={17} /></span
						>
					</div>
					<div class="card-copy">
						<div><strong>{group.title}</strong><span class="count">{group.count} bodies</span></div>
						<p>{group.description}</p>
						<small>Inspect bodies<Icon name="right" size={12} /></small>
					</div>
				</button>
			{/each}
		</div>
		{#if !groups.length}<p class="empty">
				No matching families. Try a component name or source ID.
			</p>{/if}
	</div>
</section>

<style>
	.atlas-gallery {
		position: relative;
		isolation: isolate;
		height: 100%;
		display: flex;
		flex-direction: column;
		background: #171b21;
		border: 1px solid #ffffff17;
		border-radius: 4px;
		box-shadow: 0 10px 30px #0002;
		overflow: hidden;
	}
	.gallery-toolbar {
		position: relative;
		z-index: 2;
		background: #171b21;
		display: flex;
		align-items: center;
		gap: 10px;
		justify-content: space-between;
		border-bottom: 1px solid #ffffff12;
		padding: 8px 12px;
	}
	.filters {
		display: flex;
		gap: 4px;
		overflow-x: auto;
		scrollbar-width: none;
	}
	.filters button {
		white-space: nowrap;
		background: none;
		padding: 5px 9px;
		min-height: 26px;
		border-radius: 3px;
		font-size: 12px;
		color: #a9b5c2;
	}
	.filters button:hover {
		color: #fff;
		background: #ffffff08;
	}
	.filters button.active {
		background: #ffffff0c;
		color: #c5defb;
	}
	.search {
		display: flex;
		gap: 8px;
		align-items: center;
		background: #20262e;
		border: 1px solid #ffffff14;
		border-radius: 3px;
		padding: 4px 7px;
		color: #8b9bad;
		flex-shrink: 0;
	}
	.search input {
		width: 125px;
		min-width: 0;
		background: none;
		border: 0;
		color: #d9e1e8;
		font-size: 12px;
		outline: none;
	}
	.gallery-scroll {
		overflow: auto;
		padding: 12px 14px 16px;
		overscroll-behavior: contain;
	}
	.gallery-heading {
		position: relative;
		z-index: 2;
		display: flex;
		justify-content: space-between;
		gap: 12px;
		align-items: center;
		margin: 0 0 12px;
		color: #8e9ca9;
	}
	.gallery-heading > span {
		font-size: 12px;
	}
	.gallery-heading b {
		font-weight: 400;
		color: #536273;
		margin: 0 9px;
	}
	.gallery-heading small {
		font-size: 12px;
	}
	.cards {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(235px, 1fr));
		gap: 10px;
		align-items: start;
	}
	.family-card {
		display: block;
		min-width: 0;
		text-align: left;
		border: 1px solid #ffffff13;
		border-radius: 4px;
		overflow: hidden;
		background: #1b2027;
		color: #dde5ed;
		transition:
			border-color 0.2s,
			transform 0.2s;
	}
	.family-card:hover {
		border-color: #82b3e870;
		background: #202730;
	}
	.preview {
		height: 154px;
		position: relative;
		background: #1b2027;
		overflow: hidden;
	}
	.preview img {
		width: 100%;
		height: 100%;
		object-fit: contain;
		display: block;
	}
	.family-index {
		z-index: 2;
		position: absolute;
		top: 11px;
		left: 12px;
		font: 12px var(--mono);
		color: #718396;
	}
	.open-icon {
		z-index: 2;
		position: absolute;
		top: 8px;
		right: 8px;
		display: grid;
		place-items: center;
		padding: 5px;
		border-radius: 5px;
		color: #9bacbc;
		background: #090e1544;
		opacity: 0;
	}
	.family-card:hover .open-icon,
	.family-card:focus-visible .open-icon {
		opacity: 1;
	}
	.placeholder {
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-direction: column;
		gap: 10px;
		color: #8191a3;
	}
	.placeholder span {
		font-size: 12px;
	}
	.card-copy {
		position: relative;
		z-index: 2;
		background: inherit;
		padding: 10px 11px;
	}
	.card-copy > div {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}
	.card-copy strong {
		font-size: 12px;
		font-weight: 550;
		line-height: 1.4;
	}
	.count {
		font-size: 12px;
		font-variant-numeric: tabular-nums;
		color: #a8b8c7;
		padding: 0;
		white-space: nowrap;
	}
	.card-copy p {
		font-size: 12px;
		line-height: 1.45;
		margin: 6px 0 9px;
		color: #8d9eae;
		display: -webkit-box;
		line-clamp: 2;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
		min-height: 33px;
	}
	.card-copy small {
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-family: inherit;
		font-size: 12px;
		font-weight: 500;
		letter-spacing: 0;
		color: var(--accent, #82b3e8);
	}
	.loading,
	.empty {
		font-size: 12px;
		line-height: 1.7;
		color: #a4b3c2;
		margin: 0 0 14px;
	}
	@media (max-width: 1000px) {
		.cards {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}
		.gallery-heading small {
			display: none;
		}
		.gallery-toolbar {
			gap: 8px;
			padding: 9px;
		}
		.filters button {
			padding: 5px 8px;
			font-size: 12px;
		}
		.search input {
			width: 100px;
		}
	}
	@media (max-width: 600px) {
		.cards {
			grid-template-columns: repeat(2, minmax(0, 1fr));
			gap: 9px;
		}
		.gallery-toolbar {
			display: grid;
			grid-template-columns: minmax(0, 1fr) auto;
			align-items: stretch;
		}
		.filters {
			grid-column: 1 / -1;
			width: 100%;
		}
		.search {
			grid-column: 1;
			grid-row: 2;
		}
		.preview-playback {
			grid-column: 2;
			grid-row: 2;
		}
		.search input {
			height: 24px;
			width: 100%;
		}
		.gallery-scroll {
			padding: 12px;
		}
		.gallery-heading {
			margin-bottom: 12px;
		}
		.gallery-heading > span {
			font-size: 12px;
		}
		.preview {
			height: 128px;
		}
		.card-copy {
			padding: 10px;
		}
		.card-copy strong {
			font-size: 12px;
		}
		.card-copy p {
			font-size: 12px;
		}
		.card-copy small {
			font-size: 12px;
		}
		.count {
			font-size: 12px;
		}
	}
	.atlas-preview-canvas {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		z-index: 1;
		pointer-events: none;
	}
	.preview:global([data-preview-ready='true']) > img,
	.preview:global([data-preview-ready='true']) > .placeholder {
		visibility: hidden;
	}
	.preview-playback {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		white-space: nowrap;
		min-height: 26px;
		padding: 5px 8px;
		border: 1px solid #ffffff21;
		border-radius: 3px;
		color: #becddb;
		font-size: 12px;
		background: #20262e;
	}
	.preview-playback:hover {
		background: #29323c;
		color: #e7edf4;
	}
	.preview-playback:disabled {
		opacity: 0.5;
	}
	.preview-error {
		position: relative;
		z-index: 2;
		color: #d3b889;
		font-size: 12px;
		line-height: 1.5;
	}
	button:focus-visible,
	.search:focus-within {
		outline: 2px solid var(--accent, #82b3e8);
		outline-offset: 2px;
	}
	@media (max-width: 760px) {
		.preview-playback,
		.filters button {
			min-height: 32px;
		}
		.preview-playback span {
			display: none;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.family-card {
			transition: none;
		}
		.family-card:hover {
			transform: none;
		}
	}
</style>
