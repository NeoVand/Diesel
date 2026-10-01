<script lang="ts">
	import Icon from './Icon.svelte';
	import {
		FLOW_COLORS,
		playbackAvailability,
		type FlowId,
		type LabAction,
		type LabState
	} from '$lib/engine/lab-state';

	let {
		state,
		ready,
		onaction
	}: {
		state: LabState;
		ready: boolean;
		onaction: (action: LabAction) => void;
	} = $props();

	const routes = [
		{
			id: 'air',
			label: 'Air in',
			icon: 'air',
			steps: ['Air inlet', 'Intake passages & valves', 'Chamber above the piston']
		},
		{
			id: 'fuel',
			label: 'Fuel in',
			icon: 'fuel',
			steps: ['Fuel rail inlet', 'Rail gallery & direct injectors', 'Chamber above the piston']
		},
		{
			id: 'exhaust',
			label: 'Exhaust out',
			icon: 'exhaust',
			steps: ['Chamber above the piston', 'Exhaust valves & collectors', 'Turbine & outlet']
		}
	] as const;
	const processIds: FlowId[] = ['air', 'fuel', 'combustion', 'exhaust'];
	let visible = $derived(
		ready &&
			playbackAvailability(state).available &&
			!state.isolated &&
			state.flows.some((id) => processIds.includes(id))
	);

	function traceOnly(id: FlowId) {
		onaction({
			type: 'flows',
			value: [...state.flows.filter((flow) => !processIds.includes(flow)), id]
		});
	}
</script>

{#if visible}
	<details class="flow-key">
		<summary aria-label="Flow path legend">
			<span class="flow-colors">
				{#each routes as route (route.id)}
					{#if state.flows.includes(route.id)}
						<span style:--flow-color={FLOW_COLORS[route.id]}>
							<Icon name={route.icon} size={14} />{route.label}
						</span>
					{/if}
				{/each}
				{#if state.flows.includes('combustion')}
					<span style:--flow-color={FLOW_COLORS.combustion}>
						<Icon name="combustion" size={14} />Compression ignition
					</span>
				{/if}
			</span>
			<span class="legend-toggle">Flow paths<Icon name="right" size={13} /></span>
		</summary>
		<div class="path-explanation">
			<div class="routes">
				{#each routes as route (route.id)}
					<section
						class:active={state.flows.includes(route.id)}
						style:--flow-color={FLOW_COLORS[route.id]}
					>
						<div class="route-heading">
							<strong><Icon name={route.icon} size={14} />{route.label}</strong>
							<button
								aria-label={`Trace ${route.label.toLowerCase()} only`}
								onclick={() => traceOnly(route.id)}>Trace only</button
							>
						</div>
						<ol>
							{#each route.steps as step (step)}<li>{step}</li>{/each}
						</ol>
					</section>
				{/each}
			</div>
			<p class="diesel-note">
				Fuel enters separately from air. Compression heats the air; injected fuel then auto-ignites
				above the piston.
			</p>
			<p class="scope">
				Native ports, pipes and fuel galleries · Schematic head and turbine connections · Tank and
				pump not modeled · Illustrative flow speed
			</p>
		</div>
	</details>
{/if}

<style>
	.flow-key {
		border-bottom: 1px solid #ffffff12;
	}
	summary {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		min-height: 33px;
		padding: 5px 12px;
		list-style: none;
		cursor: pointer;
		font-size: 12px;
		color: #a6b3c0;
	}
	summary::-webkit-details-marker {
		display: none;
	}
	summary:hover,
	details[open] > summary {
		background: #ffffff04;
	}
	.flow-colors {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 6px 18px;
	}
	.flow-colors > span,
	.legend-toggle,
	.route-heading strong {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}
	.flow-colors :global(svg),
	.route-heading :global(svg) {
		color: var(--flow-color);
	}
	.legend-toggle {
		white-space: nowrap;
		color: #b8c5d2;
	}
	.legend-toggle :global(svg) {
		transform: rotate(-90deg);
		transition: transform 140ms;
	}
	details[open] .legend-toggle :global(svg) {
		transform: rotate(90deg);
	}
	.path-explanation {
		padding: 7px 12px 11px;
	}
	.routes {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 18px;
	}
	section {
		min-width: 0;
		color: #a7b5c2;
	}
	.route-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}
	.route-heading strong {
		font-size: 12px;
		font-weight: 550;
	}
	.active strong {
		color: var(--flow-color);
	}
	button {
		background: transparent;
		color: #9eafbf;
		font-size: 11px;
		padding: 3px 0 3px 5px;
		white-space: nowrap;
	}
	button:hover {
		color: #e4edf5;
	}
	ol {
		margin: 6px 0 0;
		padding-left: 20px;
		list-style: decimal;
		font-size: 12px;
		line-height: 1.8;
	}
	li::marker {
		color: #718393;
		font-variant-numeric: tabular-nums;
	}
	p {
		font-size: 11px;
		line-height: 1.45;
		margin: 8px 0 0;
	}
	.diesel-note {
		color: #b3c0cc;
		border-top: 1px solid #ffffff0d;
		padding-top: 8px;
	}
	.scope {
		color: #8c9dac;
		margin-top: 4px;
	}
	summary:focus-visible,
	button:focus-visible {
		outline: 2px solid #8ab3df;
		outline-offset: 2px;
	}
	@media (max-width: 760px) {
		.flow-colors {
			gap: 6px 12px;
		}
		.routes {
			grid-template-columns: 1fr;
			gap: 10px;
		}
		ol {
			display: flex;
			flex-wrap: wrap;
			column-gap: 28px;
		}
	}
</style>
