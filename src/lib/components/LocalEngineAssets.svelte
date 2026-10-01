<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import {
		ENGINE_ASSET_FILES,
		importEngineAssets,
		onEngineAssetsNeeded
	} from '$lib/engine/local-assets';
	let open = $state(false);
	let busy = $state(false);
	let error = $state('');
	onMount(() =>
		onEngineAssetsNeeded(() => {
			open = true;
		})
	);
	function showDialog(node: HTMLDialogElement) {
		node.showModal();
		return () => node.close();
	}
	async function load(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const files = Array.from(input.files ?? []);
		if (!files.length) return;
		busy = true;
		error = '';
		try {
			await importEngineAssets(files);
			location.reload();
		} catch (cause) {
			error = cause instanceof Error ? cause.message : 'Could not save the local model.';
		} finally {
			busy = false;
			input.value = '';
		}
	}
</script>

{#if open}
	<dialog {@attach showDialog} onclose={() => (open = false)} aria-labelledby="asset-title">
		<div class="asset-heading">
			<span>LOCAL MODEL</span><button
				onclick={() => (open = false)}
				aria-label="Close model files dialog">×</button
			>
		</div>
		<h2 id="asset-title">Open your engine files</h2>
		<p>
			The purchased engine stays on your computer. Select its prepared runtime files to use Explore
			on this static site. Design and analysis work without them.
		</p>
		<ul>
			{#each ENGINE_ASSET_FILES as file (file)}<li>{file}</li>{/each}
		</ul>
		<label class="file-button"
			>{busy ? 'Checking and storing files…' : 'Choose runtime files'}<input
				type="file"
				multiple
				accept=".glb,.json,.bin"
				onchange={load}
				disabled={busy}
			/></label
		>
		<p class="privacy">Files are stored in this browser only. Nothing is uploaded.</p>
		{#if error}<p role="alert" class="asset-error">{error}</p>{/if}
		<a href={resolve('/design')} onclick={() => (open = false)}>Continue to parametric design</a>
	</dialog>
{/if}

<style>
	dialog::backdrop {
		background: #080c12d9;
		backdrop-filter: blur(8px);
	}
	dialog {
		margin: auto;
		max-height: calc(100dvh - 48px);
		overflow: auto;
		width: min(540px, 100%);
		border: 1px solid #354253;
		border-radius: 10px;
		background: #151c25;
		color: #dce5ef;
		padding: 28px;
		box-shadow: 0 24px 80px #0008;
	}
	.asset-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		font-size: 11px;
		letter-spacing: 0.08em;
		color: #91a5bc;
	}
	h2 {
		font-size: 22px;
		margin: 12px 0;
		font-weight: 550;
	}
	p {
		font-size: 14px;
		line-height: 1.55;
		color: #aab9cb;
	}
	ul {
		padding: 14px 18px 14px 32px;
		background: #0e141c;
		border-radius: 6px;
		font-family: monospace;
		font-size: 12px;
		line-height: 1.8;
		margin: 18px 0;
	}
	button {
		border: 0;
		background: transparent;
		color: #aab9cb;
		font-size: 24px;
		cursor: pointer;
	}
	.file-button {
		display: inline-block;
		padding: 11px 16px;
		border-radius: 5px;
		background: #87b0e4;
		color: #101820;
		font-size: 14px;
		font-weight: 550;
		cursor: pointer;
	}
	input {
		position: absolute;
		width: 1px;
		height: 1px;
		opacity: 0;
	}
	.file-button:focus-within {
		outline: 2px solid white;
		outline-offset: 3px;
	}
	.privacy {
		font-size: 12px;
	}
	.asset-error {
		color: #f3aaa0;
	}
	a {
		display: inline-block;
		color: #a9c9ed;
		font-size: 13px;
		margin-top: 14px;
	}
</style>
