<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	let {
		sourceCount,
		teachingCount,
		internals,
		focused,
		groups,
		onfocus
	}: {
		sourceCount: number;
		teachingCount: number;
		internals: boolean;
		focused: string | null;
		groups: { id: string; name: string; count: number }[];
		onfocus: (id: string | null) => void;
	} = $props();
</script>

<div class="eyebrow">PARTS COLLECTION</div>
<h2>The engine, laid out.</h2>
<p class="intro">
	Every component has its own space. Zoom into a system, select a part, or double-click to isolate
	it.
</p>
<div class="collection-count">
	<strong>{sourceCount + (internals ? teachingCount : 0)}</strong><span
		>individual components<br />arranged by system</span
	>
</div>
<div class="provenance">
	<span><Icon name="cube" size={15} />{sourceCount} purchased bodies</span>
	<span class:muted={!internals}
		><Icon name="cylinder" size={15} />{teachingCount} teaching parts{internals
			? ''
			: ' · hidden'}</span
	>
</div>
<div class="system-list" aria-label="Browse parts by system">
	<button class:active={!focused} onclick={() => onfocus(null)}
		><Icon name="grid" size={17} /><span>All systems</span><Icon name="expand" size={15} /></button
	>
	{#each groups.filter((group) => group.count > 0) as group (group.id)}
		<button class:active={focused === group.id} onclick={() => onfocus(group.id)}
			><span>{group.name}</span><small>{group.count}</small><Icon name="right" size={14} /></button
		>
	{/each}
</div>
<p class="scale-note">
	<Icon name="info" size={16} /><span
		>Each part is resized to fit its display cell. Return to Assembly to compare physical
		proportions.</span
	>
</p>

<style>
	.eyebrow {
		font: 10px var(--mono);
		color: var(--subtle);
		letter-spacing: 0.16em;
	}
	h2 {
		color: var(--text);
		font-size: 26px;
		font-weight: 500;
		line-height: 1.22;
		letter-spacing: -0.045em;
		margin: 18px 0;
	}
	.intro {
		color: var(--muted);
		font-size: 14px;
		line-height: 1.8;
	}
	.collection-count {
		display: flex;
		align-items: center;
		gap: 20px;
		margin: 28px 0 18px;
	}
	.collection-count strong {
		font-size: 48px;
		font-weight: 450;
		letter-spacing: -0.065em;
		line-height: 1;
	}
	.collection-count > span {
		color: var(--subtle);
		font-size: 12px;
		line-height: 1.65;
	}
	.provenance {
		display: flex;
		flex-direction: column;
		gap: 10px;
		color: var(--muted);
		font-size: 12px;
		padding-bottom: 25px;
		border-bottom: 1px solid var(--line);
	}
	.provenance > span {
		display: flex;
		align-items: center;
		gap: 9px;
	}
	.provenance .muted {
		color: var(--subtle);
	}
	.system-list {
		display: flex;
		flex-direction: column;
		gap: 3px;
		padding-top: 20px;
	}
	.system-list button {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 11px 10px;
		background: transparent;
		border: 1px solid transparent;
		border-radius: 6px;
		color: var(--muted);
		text-align: left;
	}
	.system-list button > span {
		flex: 1;
		font-size: 12px;
	}
	.system-list small {
		color: var(--subtle);
		font: 11px var(--mono);
	}
	.system-list button:hover {
		background: #ffffff05;
		color: var(--text);
	}
	.system-list button.active {
		border-color: #e5ad3620;
		background: #e5ad3608;
		color: var(--accent);
	}
	.scale-note {
		display: flex;
		gap: 10px;
		color: var(--subtle);
		font-size: 11px;
		line-height: 1.7;
		border-top: 1px solid var(--line);
		padding-top: 20px;
		margin-top: 25px;
	}
	.scale-note :global(svg) {
		flex-shrink: 0;
		margin-top: 3px;
	}
</style>
