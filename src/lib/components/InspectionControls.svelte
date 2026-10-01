<script lang="ts">
	import Icon from './Icon.svelte';
	import LabTransport from './LabTransport.svelte';
	import ProcessRouteLegend from './ProcessRouteLegend.svelte';
	import { sectionOffsetFromMm, type SectionCoordinates } from '$lib/scene/v12-section-coordinates';
	import { playbackAvailability, type LabState, type LabAction } from '$lib/engine/lab-state';
	let {
		state,
		phase,
		ready,
		exploded,
		catalogOpen = false,
		sectionCoordinates = null,
		onaction,
		onrun,
		onstop,
		onsection,
		onseparation,
		onreveal,
		onatlasreturn,
		onarrange,
		oncatalogue
	}: {
		state: LabState;
		phase: number;
		ready: boolean;
		exploded: boolean;
		catalogOpen?: boolean;
		sectionCoordinates?: SectionCoordinates | null;
		onaction: (action: LabAction) => void;
		onrun: () => void;
		onstop: () => void;
		onsection: (value: Partial<LabState['section']>) => void;
		onseparation: (value: number) => void;
		onreveal: (value: LabState['reveal']) => void;
		onatlasreturn: () => void;
		onarrange: () => void;
		oncatalogue: () => void;
	} = $props();
	let availability = $derived(playbackAvailability(state));
	const layers = [
		{ id: 'rotating', label: 'Rotating assembly' },
		{ id: 'valvetrain', label: 'Valve train' },
		{ id: 'covers', label: 'Covers removed' }
	] as const;
</script>

<section class="control-deck" aria-label="Inspection controls">
	<div class="context-row" class:atlas-row={state.display === 'layout'}>
		{#if state.display === 'layout'}
			<div class="context-title">
				<Icon name={catalogOpen ? 'grid' : 'layers'} size={18} /><span
					>{catalogOpen ? 'Component atlas' : '3D arrangement'}{#if !catalogOpen}<small
							>22 families<span class="atlas-source"> · Original source geometry</span></small
						>{/if}</span
				>
			</div>
			<div class="context-actions">
				{#if catalogOpen}<button onclick={onarrange}
						><Icon name="layers" size={15} />View 3D arrangement</button
					>{:else}<button onclick={oncatalogue}><Icon name="search" size={15} />Find a part</button
					>{/if}<button class="accent" onclick={onatlasreturn}
					><Icon name="left" size={15} />Return to engine</button
				>
			</div>
		{:else if exploded}
			<div class="explosion-control">
				<label for="separation"><Icon name="explode" size={18} />Separation</label><input
					id="separation"
					aria-label="Assembly separation"
					type="range"
					min="0"
					max="1"
					step="0.01"
					value={state.explosion}
					oninput={(e) => onseparation(Number(e.currentTarget.value))}
				/><output>{Math.round(state.explosion * 100)}%</output><button
					onclick={() => onseparation(0)}><Icon name="reset" size={15} />Reassemble</button
				>
			</div>
		{:else if state.display === 'section'}
			<div class="cutaway-controls" role="group" aria-label="Cutaway plane controls">
				<span class="row-label"><Icon name="section" size={18} /><span>Section plane</span></span>
				<div class="segmented" aria-label="Section axis">
					{#each ['x', 'y', 'z'] as axis (axis)}<button
							class:active={state.section.axis === axis}
							aria-label={'Cut on ' + axis.toUpperCase() + ' axis'}
							aria-pressed={state.section.axis === axis}
							onclick={() => onsection({ axis: axis as LabState['section']['axis'] })}
							>{axis.toUpperCase()}</button
						>{/each}
				</div>
				<input
					aria-label="Cutaway position"
					type="range"
					min="0"
					max="1"
					step="0.005"
					value={state.section.offset}
					oninput={(e) => onsection({ offset: Number(e.currentTarget.value) })}
				/>
				{#if sectionCoordinates}
					<label
						class="offset-input"
						title="Signed distance along the section normal from the mechanical assembly bounds centre"
					>
						<input
							aria-label="Section offset in millimetres"
							type="number"
							min={Math.floor(sectionCoordinates.minMm * 10) / 10}
							max={Math.ceil(sectionCoordinates.maxMm * 10) / 10}
							step="any"
							value={Number(sectionCoordinates.offsetMm.toFixed(1))}
							onchange={(event) => {
								const value = event.currentTarget.valueAsNumber;
								if (Number.isFinite(value) && sectionCoordinates)
									onsection({ offset: sectionOffsetFromMm(sectionCoordinates, value) });
							}}
						/><span>mm</span>
					</label>
				{:else}<output>{Math.round(state.section.offset * 100)}%</output>{/if}
				<button
					aria-label="Flip section"
					aria-pressed={state.section.flipped}
					title="Reverse retained side"
					onclick={() => onsection({ flipped: !state.section.flipped })}
					><Icon name="flip" size={17} /><span>Flip</span></button
				>
				<details class="plane-angle">
					<summary aria-label="Section options"><Icon name="settings" size={17} /></summary>
					<div>
						<strong>Section plane</strong>
						<p class="datum-note">
							Offset datum: centre of the mechanical assembly bounds. X, Y and Z use the displayed
							model axes.
						</p>
						{#if sectionCoordinates}<p class="normal-readout">
								Offset direction [{sectionCoordinates.normal
									.map((value) => value.toFixed(3))
									.join(', ')}]
							</p>{/if}
						<label
							>Pitch <input
								aria-label="Section pitch"
								type="range"
								min="-90"
								max="90"
								step="1"
								value={state.section.rotation?.[0] ?? 0}
								oninput={(e) =>
									onsection({
										rotation: [Number(e.currentTarget.value), state.section.rotation?.[1] ?? 0]
									})}
							/><output>{state.section.rotation?.[0] ?? 0}°</output></label
						>
						<label
							>Yaw <input
								aria-label="Section yaw"
								type="range"
								min="-90"
								max="90"
								step="1"
								value={state.section.rotation?.[1] ?? 0}
								oninput={(e) =>
									onsection({
										rotation: [state.section.rotation?.[0] ?? 0, Number(e.currentTarget.value)]
									})}
							/><output>{state.section.rotation?.[1] ?? 0}°</output></label
						>
						<button
							aria-label="Show section guide"
							aria-pressed={state.section.visible}
							onclick={() => onsection({ visible: !state.section.visible })}
							><Icon name={state.section.visible ? 'eye' : 'eye-off'} size={16} />Plane guide {state
								.section.visible
								? 'on'
								: 'off'}</button
						><button onclick={() => onsection({ rotation: [0, 0] })}>Reset orientation</button>
					</div>
				</details>
			</div>
		{:else if state.display === 'mechanism' || state.display === 'cylinder'}
			<span class="row-label"><Icon name="layers" size={18} /><span>Visible layers</span></span>
			<div class="layer-options">
				{#each layers as layer (layer.id)}<button
						class:active={state.reveal === layer.id}
						aria-pressed={state.reveal === layer.id}
						onclick={() => onreveal(layer.id)}>{layer.label}</button
					>{/each}
			</div>
		{:else if state.display === 'xray'}
			<div class="context-title">
				<Icon name="eye" size={18} /><span
					>X-ray inspection<small>Translucent exterior · Opaque internal machinery</small></span
				>
			</div>
			<span class="context-hint">Exterior opacity reduced</span>
		{:else}
			<div class="context-title">
				<Icon name="cube" size={18} /><span
					>V12 assembly<small>60° V12 · 85 × 100 mm · 6.81 L</small></span
				>
			</div>
			<span class="context-hint">Source linkage · Uncalibrated operating speed</span>
		{/if}
	</div>
	{#if state.display !== 'layout'}<ProcessRouteLegend {state} {ready} {onaction} /><LabTransport
			{state}
			{phase}
			{ready}
			{onaction}
			{onrun}
			{onstop}
		/>{/if}
	{#if !availability.available && !catalogOpen}<p class="playback-reason">
			<Icon name="info" size={13} />{state.display === 'layout'
				? 'Return to the assembled engine for mechanical playback.'
				: availability.reason}
		</p>{/if}
</section>

<style>
	.control-deck {
		position: relative;
		width: 100%;
		border: 1px solid #ffffff19;
		border-radius: 5px;
		background: #141a21f5;
		backdrop-filter: blur(26px);
		box-shadow: 0 8px 24px #0003;
		pointer-events: auto;
	}
	.context-row {
		min-height: 44px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		padding: 6px 12px;
		border-bottom: 1px solid #ffffff12;
	}
	.context-title {
		display: flex;
		align-items: center;
		gap: 12px;
		flex-shrink: 0;
		color: #d6dde5;
		font-size: 12px;
		font-weight: 550;
	}
	.context-title > :global(svg),
	.row-label > :global(svg) {
		color: #a6b6c8;
	}
	.context-title small {
		display: block;
		font-size: 12px;
		font-weight: 400;
		color: #909da9;
		margin-top: 3px;
	}
	.context-hint {
		font-size: 12px;
		line-height: 1.5;
		text-align: right;
		color: #929eaa;
		max-width: 290px;
	}
	.context-actions,
	.layer-options {
		display: flex;
		gap: 7px;
		align-items: center;
	}
	button,
	summary {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 7px;
		min-height: 32px;
		padding: 6px 10px;
		border-radius: 5px;
		font-size: 12px;
		color: #bec8d3;
		background: transparent;
		cursor: pointer;
		white-space: nowrap;
	}
	button:hover,
	summary:hover {
		background: #ffffff0b;
		color: #fff;
	}
	.accent,
	.active {
		background: #82b3e819;
		color: #aacdf3;
	}
	.context-actions .accent {
		color: var(--accent, #82b3e8);
	}
	.layer-options button {
		border: 1px solid #ffffff12;
	}
	.explosion-control,
	.cutaway-controls {
		display: flex;
		align-items: center;
		gap: 13px;
		width: 100%;
	}
	.explosion-control label,
	.row-label {
		display: flex;
		align-items: center;
		gap: 9px;
		font-size: 12px;
		color: #cbd3dd;
		white-space: nowrap;
	}
	.explosion-control input,
	.cutaway-controls > input {
		flex: 1;
		min-width: 50px;
		width: 80px;
	}
	output {
		font: 12px var(--mono);
		color: #d7e0ea;
		min-width: 34px;
		text-align: right;
	}
	.segmented {
		display: flex;
		background: #ffffff06;
		padding: 2px;
		border-radius: 5px;
	}
	.segmented button {
		width: 29px;
		padding: 4px;
		min-height: 27px;
		font: 12px var(--mono);
	}
	.plane-angle {
		position: relative;
	}
	summary {
		list-style: none;
		padding: 6px;
	}
	summary::-webkit-details-marker {
		display: none;
	}
	.plane-angle > div {
		position: absolute;
		bottom: 46px;
		right: 0;
		width: 285px;
		background: #10161ef5;
		border: 1px solid #ffffff20;
		box-shadow: 0 12px 40px #0007;
		padding: 16px;
		border-radius: 10px;
		backdrop-filter: blur(24px);
		z-index: 8;
	}
	.plane-angle strong {
		font-size: 12px;
		font-weight: 550;
		display: block;
		margin-bottom: 13px;
	}
	.plane-angle label {
		display: flex;
		align-items: center;
		gap: 14px;
		font-size: 12px;
		color: #b4bfcb;
		margin: 8px 0;
	}
	.plane-angle label input {
		flex: 1;
		min-width: 40px;
	}
	.playback-reason {
		display: flex;
		gap: 8px;
		align-items: center;
		margin: 0;
		padding: 0 12px 8px;
		color: #a9a294;
		font-size: 12px;
	}
	.offset-input {
		display: flex;
		align-items: center;
		gap: 5px;
		padding: 4px 7px;
		border: 1px solid #ffffff26;
		background: #0d1116;
		border-radius: 3px;
		font: 12px var(--mono);
		flex-shrink: 0;
	}
	.offset-input input {
		width: 65px;
		min-width: 0;
		height: 24px;
		background: none;
		color: #e0e7f0;
		border: 0;
		font: inherit;
	}
	.offset-input span {
		color: #9eacbb;
	}
	.datum-note {
		font-size: 12px;
		line-height: 1.5;
		color: #aab7c6;
		margin: 8px 0 12px;
		max-width: 280px;
	}
	.normal-readout {
		font: 12px var(--mono);
		color: #cad5e2;
	}
	@media (max-width: 480px) {
		.offset-input input {
			width: 48px;
		}
		.offset-input {
			padding-inline: 4px;
			gap: 3px;
		}
		.cutaway-controls {
			display: grid;
			grid-template-columns: 20px 98px minmax(0, 1fr) 34px 34px;
			gap: 7px;
		}
		.cutaway-controls .row-label {
			grid-column: 1;
			grid-row: 1;
		}
		.cutaway-controls .segmented {
			grid-column: 2;
			grid-row: 1;
		}
		.cutaway-controls > button {
			grid-column: 4;
			grid-row: 1;
			padding-inline: 0;
		}
		.cutaway-controls .plane-angle {
			grid-column: 5;
			grid-row: 1;
		}
		.cutaway-controls > input {
			grid-column: 1 / 4;
			grid-row: 2;
			min-width: 70px;
			width: 100%;
		}
		.cutaway-controls .offset-input {
			grid-column: 4 / 6;
			grid-row: 2;
		}
		.cutaway-controls > output {
			grid-column: 4 / 6;
			grid-row: 2;
		}
	}

	@media (max-width: 760px) {
		.plane-angle {
			position: static;
		}
		.plane-angle > div {
			right: 10px;
			bottom: calc(100% + 8px);
			width: min(300px, calc(100% - 20px));
		}

		.context-row {
			padding: 8px 10px;
			gap: 8px;
			min-height: 52px;
		}
		.context-hint {
			display: none;
		}
		.context-title {
			font-size: 12px;
			gap: 8px;
		}
		.context-title small {
			font-size: 12px;
		}
		.layer-options {
			gap: 4px;
			flex: 1;
		}
		.layer-options button {
			font-size: 12px;
			white-space: normal;
			padding: 5px 7px;
			flex: 1;
		}
		.row-label > span {
			display: none;
		}
		.cutaway-controls,
		.explosion-control {
			gap: 7px;
		}
		.explosion-control label {
			font-size: 12px;
			gap: 6px;
		}
		.cutaway-controls button > span {
			display: none;
		}
		.atlas-row .context-title {
			flex: 1;
			min-width: 0;
		}
		.atlas-row .context-actions {
			flex-shrink: 0;
		}
		.atlas-source {
			display: none;
		}
		.context-actions button {
			font-size: 12px;
			padding: 6px;
		}
		.context-actions button:first-child {
			display: none;
		}
		.playback-reason {
			font-size: 12px;
			padding: 0 11px 10px;
		}
	}
</style>
