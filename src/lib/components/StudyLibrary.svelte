<script lang="ts">
	import type { StudySummary } from '$lib/design/study-storage';
	import Icon from './Icon.svelte';
	let {
		entries,
		busy,
		error,
		onsave,
		onload,
		onclose
	}: {
		entries: StudySummary[];
		busy: boolean;
		error: string;
		onsave: (name: string) => void;
		onload: (id: string) => void;
		onclose: () => void;
	} = $props();
	let name = $state('Rod study');
</script>

<aside class="library" aria-label="Saved studies">
	<header>
		<h2>Study library</h2>
		<button aria-label="Close study library" onclick={onclose}
			><Icon name="close" size={18} /></button
		>
	</header>
	<p>Stored in this browser. Export a case for an independent copy.</p>
	<form
		onsubmit={(event) => {
			event.preventDefault();
			onsave(name);
		}}
	>
		<label for="study-name">Save current study as</label>
		<input id="study-name" bind:value={name} maxlength="80" required />
		<button class="save" disabled={busy || !name.trim()}>{busy ? 'Saving…' : 'Save study'}</button>
	</form>
	{#if error}<p role="alert" class="error">{error}</p>{/if}
	<div class="entries">
		{#each entries as entry (entry.id)}
			<button class="entry" disabled={busy} onclick={() => onload(entry.id)}>
				<strong>{entry.name}</strong><span
					>{entry.massGrams.toFixed(1)} g · {entry.cases} solved {entry.cases === 1
						? 'case'
						: 'cases'}</span
				>
				<small>{new Date(entry.savedAt).toLocaleString()}</small>
			</button>
		{:else}<p>No saved studies.</p>{/each}
	</div>
</aside>

<style>
	.library {
		position: absolute;
		inset: 0 auto 0 0;
		z-index: 30;
		width: 330px;
		max-width: 100%;
		background: #141a21;
		border-right: 1px solid #39424d;
		box-shadow: 12px 0 35px #0005;
		display: flex;
		flex-direction: column;
		padding: 18px;
		gap: 16px;
		color: #e3e8ee;
	}
	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	h2 {
		font-size: 16px;
		font-weight: 600;
		margin: 0;
	}
	button {
		color: inherit;
		background: none;
		border: 1px solid transparent;
		border-radius: 3px;
		padding: 7px;
		cursor: pointer;
	}
	button:focus-visible,
	input:focus-visible {
		outline: 2px solid #82b3e8;
		outline-offset: 2px;
	}
	p {
		font-size: 12px;
		color: #aeb7c3;
		line-height: 1.5;
		margin: 0;
	}
	form {
		display: grid;
		gap: 9px;
	}
	label {
		font-size: 13px;
	}
	input {
		width: 100%;
		padding: 9px;
		background: #0d1116;
		border: 1px solid #414a56;
		border-radius: 3px;
		color: #eef2f7;
		font: inherit;
		font-size: 13px;
	}
	.save {
		background: #294461;
		border-color: #46688f;
		font-size: 13px;
	}
	.entries {
		overflow: auto;
		display: grid;
		align-content: start;
		gap: 8px;
		min-height: 0;
	}
	.entry {
		display: grid;
		text-align: left;
		padding: 12px;
		gap: 6px;
		border-color: #35414d;
		background: #1b232d;
	}
	.entry:hover {
		border-color: #82b3e8;
	}
	.entry strong {
		font-size: 13px;
	}
	.entry span,
	.entry small {
		font-size: 12px;
		color: #aebaca;
	}
	.error {
		color: #edb5a3;
	}
	button:disabled {
		opacity: 0.5;
		cursor: default;
	}
</style>
