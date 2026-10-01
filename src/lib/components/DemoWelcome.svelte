<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	let {
		ready,
		aiAvailable,
		ontour,
		onconnect
	}: {
		ready: boolean;
		aiAvailable: boolean;
		ontour: () => void;
		onconnect: () => void;
	} = $props();
	let dialog: HTMLDialogElement;
	const seenKey = 'diesel.welcome.v12.1';
	function remember() {
		try {
			localStorage.setItem(seenKey, 'seen');
		} catch {
			/* Storage may be unavailable. */
		}
	}
	function close() {
		remember();
		dialog.close();
	}
	export function show() {
		dialog?.showModal();
	}
	function mount(node: HTMLDialogElement) {
		dialog = node;
		let seen = false;
		try {
			seen = localStorage.getItem(seenKey) === 'seen';
		} catch {
			/* Keep the welcome available. */
		}
		if (!seen) {
			node.showModal();
			node.querySelector<HTMLElement>('#welcome-title')?.focus();
		}
	}
</script>

<dialog class="welcome" aria-labelledby="welcome-title" {@attach mount} oncancel={remember}>
	<div class="dialog-heading">
		<div>
			<p class="eyebrow">Engine Lab</p>
			<h2 id="welcome-title" tabindex="-1">Workspace orientation</h2>
		</div>
		<button class="close" aria-label="Explore without tour" onclick={close}
			><Icon name="close" size={20} /></button
		>
	</div>
	<dl class="workspaces">
		<div>
			<dt><Icon name="cube" size={18} />Explore</dt>
			<dd>
				Inspect the purchased V12 diesel assembly, identify bodies, create sections and play the
				measured linkage.
			</dd>
		</div>
		<div>
			<dt><Icon name="settings" size={18} />Design</dt>
			<dd>Edit a separate parametric cranktrain and connecting-rod geometry.</dd>
		</div>
		<div>
			<dt><Icon name="chart" size={18} />Analyze</dt>
			<dd>Define loading assumptions, solve structural cases and compare candidate designs.</dd>
		</div>
	</dl>
	<div class="basis">
		<strong>Model scope</strong>
		<p>
			The source engine is a purchased V12 diesel concept. Its dimensions were measured from native
			CAD. Valve timing, combustion and performance are not calibrated. Analysis assumptions and
			source evidence are available in each workspace.
		</p>
	</div>
	<div class="ai-status">
		<Icon name={aiAvailable ? 'check' : 'key'} size={18} />
		<div>
			<strong>{aiAvailable ? 'Assistant connected' : 'Assistant access'}</strong>
			<p>
				{aiAvailable
					? 'The assistant can inspect parts and change the view. Requests go directly to OpenAI with your key held in this tab’s memory.'
					: 'Geometry controls and analysis run in your browser. Add your own OpenAI key in connection settings to use the assistant and AI-generated narration.'}
			</p>
			{#if !aiAvailable}<button
					class="text-button"
					onclick={() => {
						close();
						onconnect();
					}}>Connection settings<Icon name="right" size={15} /></button
				>{/if}
		</div>
	</div>
	<div class="actions">
		<button
			class="secondary"
			disabled={!ready}
			onclick={() => {
				close();
				ontour();
			}}
			><Icon name="info" size={16} />{ready ? 'Start workspace tour' : 'Loading assembly…'}</button
		>
		<button class="primary" onclick={close}>Open workspace</button>
	</div>
	<p class="hint">The tour is available from Help. No AI requests are sent during the tour.</p>
</dialog>

<style>
	.welcome {
		color: var(--text);
		width: min(560px, calc(100vw - 32px));
		max-height: calc(100dvh - 32px);
		overflow: auto;
		margin: auto;
		padding: 25px;
		border: 1px solid #ffffff26;
		border-radius: 7px;
		background: #141a21;
		box-shadow: 0 24px 80px #0008;
	}
	.welcome::backdrop {
		background: #0008;
	}
	.dialog-heading {
		display: flex;
		justify-content: space-between;
		gap: 18px;
		align-items: flex-start;
		margin-bottom: 22px;
	}
	.eyebrow {
		color: #a4b3c4;
		font-size: 12px;
		margin: 0 0 7px;
	}
	h2 {
		font-size: 22px;
		line-height: 1.25;
		font-weight: 550;
		margin: 0;
		outline: none;
	}
	.close {
		display: grid;
		place-items: center;
		width: 30px;
		height: 30px;
		flex-shrink: 0;
		border-radius: 4px;
		background: none;
		color: #bdc8d4;
	}
	.close:hover {
		background: #ffffff0c;
	}
	.workspaces {
		margin: 0;
		border-block: 1px solid #ffffff17;
	}
	.workspaces > div {
		display: grid;
		grid-template-columns: 95px 1fr;
		gap: 15px;
		padding: 15px 0;
	}
	.workspaces > div + div {
		border-top: 1px solid #ffffff0b;
	}
	dt {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		font-size: 13px;
		color: #dce5f0;
	}
	dt :global(svg) {
		flex-shrink: 0;
		color: #a7c8ef;
	}
	dd {
		margin: 0;
		color: #b3bfcd;
		font-size: 13px;
		line-height: 1.5;
	}
	strong {
		font-size: 13px;
		font-weight: 550;
		color: #dde6f0;
	}
	.basis {
		margin: 19px 0;
	}
	p {
		font-size: 13px;
		line-height: 1.55;
		color: #aebbc9;
		margin: 6px 0 0;
	}
	.ai-status {
		display: flex;
		gap: 11px;
		padding: 14px;
		border: 1px solid #ffffff17;
		border-radius: 4px;
		background: #0d1116;
	}
	.ai-status > :global(svg) {
		color: #a1bbd9;
		flex-shrink: 0;
		margin-top: 2px;
	}
	.ai-status p {
		font-size: 12px;
	}
	.text-button {
		color: #a8cef8;
		display: flex;
		align-items: center;
		gap: 6px;
		background: none;
		font-size: 12px;
		padding: 10px 0 0;
	}
	.actions {
		display: flex;
		justify-content: flex-end;
		gap: 9px;
		margin-top: 22px;
	}
	.actions button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 7px;
		min-height: 36px;
		padding: 8px 13px;
		font-size: 13px;
		font-weight: 500;
		border-radius: 4px;
	}
	.primary {
		background: #82b3e8;
		color: #101b28;
	}
	.primary:hover {
		background: #a2c7ef;
	}
	.secondary {
		border: 1px solid #ffffff26;
		color: #d0dbe7;
		background: #ffffff04;
	}
	.secondary:hover {
		background: #ffffff0a;
	}
	.hint {
		margin-top: 13px;
		font-size: 12px;
		color: #91a0b1;
	}
	@media (max-width: 480px) {
		.welcome {
			padding: 20px;
		}
		.workspaces > div {
			grid-template-columns: 1fr;
			gap: 7px;
			padding: 12px 0;
		}
		.actions {
			flex-wrap: wrap;
		}
		.actions button {
			flex: 1;
			white-space: nowrap;
		}
	}
</style>
