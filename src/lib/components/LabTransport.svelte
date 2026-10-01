<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import ProcessControls from './ProcessControls.svelte';
	import { playbackAvailability, type LabState, type LabAction } from '$lib/engine/lab-state';
	let {
		state,
		phase,
		ready = true,
		onaction,
		onrun,
		onstop
	}: {
		state: LabState;
		phase: number;
		ready?: boolean;
		onaction: (action: LabAction) => void;
		onrun: () => void;
		onstop: () => void;
	} = $props();
	const rates = [0.01, 0.02, 0.05, 0.1, 1];
	let availability = $derived(playbackAvailability(state));
	let disabled = $derived(!ready || !availability.available);
	let speedMenu: HTMLDetailsElement;
</script>

<div class="transport" aria-label="Engine playback controls">
	<button
		class="run"
		class:playing={state.running}
		disabled={disabled && !state.running}
		onclick={onrun}
		aria-label={state.running ? 'Pause engine' : 'Run engine'}
		title={availability.reason ?? 'Run independently of the current view'}
	>
		<Icon name={state.running ? 'pause' : 'play'} size={17} /><span
			>{state.running ? 'Pause' : 'Run'}</span
		>
	</button>
	<div class="cycle">
		<div class="cycle-label">
			<span>Crank rotation <small>Geometric playback</small></span><output
				>{Math.floor(phase).toString().padStart(3, '0')}° <b>/ 720°</b></output
			>
		</div>
		<input
			aria-label="Crank angle"
			type="range"
			min="0"
			max="719"
			step="1"
			value={phase}
			{disabled}
			oninput={(e) => onaction({ type: 'seek', value: Number(e.currentTarget.value) })}
		/>
	</div>
	<button
		class="step"
		title="Advance crank by 30 degrees"
		aria-label="Advance crank by 30 degrees"
		{disabled}
		onclick={() => onaction({ type: 'seek', value: (Math.floor(phase) + 30) % 720 })}
		><Icon name="right" size={17} /><span>Step</span></button
	>
	<ProcessControls {state} {phase} {ready} {onaction} />
	<details
		class="speed-menu"
		{@attach (node) => {
			speedMenu = node;
		}}
	>
		<summary aria-label="Playback speed"
			><span>{Math.round(state.playback * 1800)}°/s</span><Icon name="right" size={12} /></summary
		>
		<div class="speed-options" aria-label="Playback rates">
			<span>PLAYBACK RATE</span>
			{#each rates as rate (rate)}<button
					class:active={state.playback === rate}
					aria-pressed={state.playback === rate}
					onclick={() => {
						onaction({ type: 'playback', value: rate });
						speedMenu.open = false;
					}}
					>{rate * 1800}°/s
					<small>{rate <= 0.02 ? 'Slow motion' : rate <= 0.1 ? 'Inspection' : 'Fast'}</small
					></button
				>{/each}
		</div>
	</details>
	<button
		class="stop"
		aria-label="Stop engine and guide"
		title="Stop engine and guide"
		onclick={onstop}><Icon name="stop" size={17} /></button
	>
</div>

<style>
	.transport {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 6px 12px;
		min-height: 54px;
		width: 100%;
		pointer-events: auto;
	}
	button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		background: none;
		color: #b7c0ca;
		border-radius: 6px;
		flex-shrink: 0;
		height: 36px;
		padding: 0 9px;
		font-size: 12px;
	}
	button:hover {
		color: #fff;
		background: #ffffff0c;
	}
	.run {
		background: #82b3e8;
		color: #101b28;
		font-weight: 650;
		min-width: 86px;
		height: 38px;
	}
	.run:hover {
		background: #a2c7ef;
		color: #101b28;
	}
	.run.playing {
		background: #82b3e819;
		color: #b7d7fb;
		border: 1px solid #82b3e840;
	}
	.run:disabled {
		background: #ffffff0a;
		color: #9ba2aa;
		opacity: 0.6;
	}
	.cycle {
		flex: 1;
		min-width: 80px;
	}
	.cycle-label {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		color: #c3cbd3;
		font-size: 12px;
	}
	.cycle-label small {
		font-size: 12px;
		color: #929ca8;
		margin-left: 10px;
	}
	output {
		font: 12px var(--mono);
		white-space: nowrap;
		color: #e0e7f0;
	}
	output b {
		font-weight: 400;
		color: #87909b;
	}
	input {
		width: 100%;
		display: block;
		height: 24px;
	}
	input:disabled {
		opacity: 0.3;
		cursor: not-allowed;
	}
	.speed-menu {
		position: relative;
		flex-shrink: 0;
	}
	summary {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 14px;
		list-style: none;
		font: 12px var(--mono);
		cursor: pointer;
		padding: 10px;
		border-left: 1px solid #ffffff15;
		color: #cbd3dc;
	}
	summary::-webkit-details-marker {
		display: none;
	}
	summary :global(svg) {
		transform: rotate(-90deg);
	}
	.speed-options {
		position: absolute;
		bottom: 49px;
		right: 0;
		background: #11161cf5;
		border: 1px solid #ffffff20;
		border-radius: 10px;
		padding: 9px;
		min-width: 190px;
		box-shadow: 0 12px 40px #0008;
		z-index: 8;
		backdrop-filter: blur(24px);
	}
	.speed-options > span {
		font: 12px var(--mono);
		letter-spacing: 0.08em;
		color: #8f9aa6;
		display: block;
		padding: 8px;
	}
	.speed-options button {
		width: 100%;
		justify-content: space-between;
		text-align: left;
		height: 35px;
		font: 12px var(--mono);
	}
	.speed-options small {
		font:
			12px 'Inter Variable',
			sans-serif;
		color: #8e9ba8;
	}
	.speed-options .active {
		background: #82b3e819;
		color: #b7d7fb;
	}
	.stop {
		padding: 0;
		width: 30px;
	}
	@media (max-width: 760px) {
		.transport {
			gap: 8px;
			padding: 8px 10px;
			min-height: 54px;
		}
		.run {
			min-width: 67px;
			font-size: 12px;
			gap: 6px;
		}
		.cycle-label small,
		.step span {
			display: none;
		}
		.step {
			padding: 0;
			width: 22px;
		}
		.stop {
			display: none;
		}
		summary {
			padding: 8px 4px 8px 8px;
			gap: 4px;
			font-size: 12px;
		}
		.cycle-label {
			font-size: 12px;
			gap: 4px;
		}
		output {
			font-size: 12px;
		}
	}
</style>
