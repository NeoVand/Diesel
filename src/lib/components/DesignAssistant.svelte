<script lang="ts">
	import { onDestroy } from 'svelte';
	import Icon from './Icon.svelte';
	import type { DesignAssistantEvidence, DesignAssistantReply } from '$lib/design/assistant';
	let {
		getEvidence,
		contextLabel = 'Current design and selected study'
	}: { getEvidence: () => DesignAssistantEvidence; contextLabel?: string } = $props();
	let question = $state('');
	let busy = $state(false);
	let response = $state.raw<DesignAssistantReply | null>(null);
	let snapshot = $state('');
	let snapshotContext = $state('');
	let askedQuestion = $state('');
	let error = $state('');
	let controller: AbortController | null = null;
	let disposed = false;
	async function ask(prompt = question) {
		if (busy || !prompt.trim()) return;
		const evidence = getEvidence();
		question = prompt;
		askedQuestion = prompt;
		snapshotContext = contextLabel;
		busy = true;
		error = '';
		response = null;
		snapshot = `${evidence.params.rodWidthMm} × ${evidence.params.rodDepthMm} mm section · ${evidence.scenario?.rpm ?? evidence.params.rpm} rpm · ${evidence.native?.length ?? 0} solid result summaries`;
		controller = new AbortController();
		try {
			const request = await fetch('/api/design/explain', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ question: prompt, evidence }),
				signal: controller.signal
			});
			const data = await request.json();
			if (!request.ok) throw new Error(data.error ?? 'The design assistant is unavailable.');
			if (!disposed) response = data;
		} catch (e) {
			if (!disposed && e instanceof Error && e.name !== 'AbortError') error = e.message;
		} finally {
			if (!disposed) {
				busy = false;
				controller = null;
			}
		}
	}
	onDestroy(() => {
		disposed = true;
		controller?.abort();
	});
</script>

<div class="design-assistant" aria-label="Design evidence assistant">
	<div class="assistant-heading">
		<h3><Icon name="ai" size={17} />Assistant</h3>
		<span>Study evidence</span>
	</div>
	<p class="active-context">{contextLabel}</p>
	<div class="conversation">
		{#if response}
			<div class="reply">
				<p class="question">{askedQuestion}</p>
				<p>{response.text}</p>
				{#if contextLabel !== snapshotContext}<p class="outdated">
						The active study has changed. This response describes the saved evidence below.
					</p>{/if}
				<details>
					<summary>Response context</summary>
					<p>{snapshotContext}</p>
					<p>{snapshot}</p>
					<p>{response.provider} · {response.model}</p>
				</details>
			</div>
		{:else if busy}
			<div class="thinking" aria-live="polite">
				<strong>Reviewing study evidence…</strong>
				<p>{snapshot}</p>
				<button type="button" onclick={() => controller?.abort()}>Cancel</button>
			</div>
		{:else}
			<div class="welcome">
				<p>Explanations use the current geometry, load assumptions and available solver results.</p>
				<div class="suggestions">
					<button
						type="button"
						onclick={() => ask('What does this comparison prove, and what remains unverified?')}
						>Review comparison</button
					>
					<button
						type="button"
						onclick={() =>
							ask(
								'Explain how gas pressure and inertia determine the rod bearing loads in this scenario.'
							)}>Explain loads</button
					>
					<button
						type="button"
						onclick={() =>
							ask('Which engineering checks should we do next before accepting this design?')}
						>Required checks</button
					>
				</div>
			</div>
		{/if}
		{#if error}<p class="error" role="alert">{error}</p>{/if}
	</div>
	<form
		onsubmit={(event) => {
			event.preventDefault();
			void ask();
		}}
	>
		<label class="sr-only" for="design-question">Ask the design assistant</label>
		<input
			id="design-question"
			bind:value={question}
			maxlength="2000"
			placeholder="Question about the current study"
			disabled={busy}
		/>
		<button aria-label="Ask design assistant" disabled={busy || !question.trim()}
			><Icon name="send" size={17} /></button
		>
	</form>
</div>

<style>
	.design-assistant {
		height: 100%;
		min-height: 218px;
		display: flex;
		flex-direction: column;
		padding: 12px 20px;
		gap: 7px;
		box-sizing: border-box;
		color: #cbd2da;
	}
	.assistant-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}
	h3 {
		display: flex;
		align-items: center;
		gap: 7px;
		font-size: 14px;
		font-weight: 600;
		color: #e0e6ed;
		margin: 0;
	}
	.assistant-heading > span {
		font-size: 12px;
		color: #a2adba;
	}
	.active-context {
		color: #aab5c1;
		font-size: 12px;
		margin: 0;
		line-height: 1.45;
	}
	.conversation {
		flex: 1;
		min-height: 0;
		overflow: auto;
		scrollbar-width: thin;
	}
	.welcome,
	.thinking {
		padding: 4px 0 8px;
	}
	.welcome p,
	.thinking p {
		font-size: 13px;
		line-height: 1.55;
		color: #a7b2bf;
		margin: 0 0 8px;
		max-width: 760px;
	}
	.suggestions {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	button {
		background: #202833;
		border: 1px solid #ffffff25;
		border-radius: 3px;
		color: #d0d9e3;
		padding: 7px 10px;
		font-size: 12px;
		cursor: pointer;
	}
	button:hover {
		border-color: #ffffff45;
		background: #2c3745;
	}
	button:focus-visible,
	summary:focus-visible {
		outline: 2px solid var(--accent, #82b3e8);
		outline-offset: 2px;
	}
	form {
		display: flex;
		flex-shrink: 0;
		border: 1px solid #ffffff2b;
		border-radius: 3px;
		background: #141a21;
		padding: 3px;
	}
	input {
		width: 100%;
		min-width: 0;
		background: none;
		border: 0;
		color: #e0e6ee;
		outline: none;
		font-size: 13px;
		padding: 8px 10px;
	}
	input::placeholder {
		color: #9aa7b6;
	}
	form:focus-within {
		border-color: var(--accent, #82b3e8);
	}
	form button {
		background: var(--accent, #82b3e8);
		color: #121a24;
		border: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 35px;
	}
	button:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.thinking strong {
		display: block;
		font-size: 13px;
		font-weight: 500;
		color: #d0dbe7;
		margin: 5px 0 8px;
	}
	.reply > p {
		font-size: 13px;
		color: #cdd6e1;
		line-height: 1.65;
		white-space: pre-wrap;
		margin: 10px 0;
	}
	.reply > .question {
		color: #e4e9ef;
		font-weight: 600;
	}
	.reply > .outdated {
		color: #dfb578;
		font-size: 12px;
	}
	details {
		margin: 12px 0;
		font-size: 12px;
		color: #a7b3c0;
		border-top: 1px solid #ffffff18;
		padding-top: 8px;
	}
	summary {
		cursor: pointer;
		width: fit-content;
	}
	details p {
		font-size: 12px;
		line-height: 1.5;
		margin: 6px 0;
	}
	.error {
		color: #e3a68e;
		font-size: 13px;
		line-height: 1.5;
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}
	@media (max-width: 640px) {
		.design-assistant {
			padding: 10px 14px;
			min-height: 320px;
		}
		.assistant-heading {
			flex-wrap: wrap;
		}
		input {
			font-size: 16px;
		}
	}
</style>
