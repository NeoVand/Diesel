<script lang="ts">
	import Icon from './Icon.svelte';
	import {
		FLOW_COLORS,
		playbackAvailability,
		type LabAction,
		type LabState
	} from '$lib/engine/lab-state';
	import { V12_CYLINDERS } from '$lib/engine/v12-kinematics';
	import { v12ProcessCycle } from '$lib/engine/v12-process-cycle';
	import { v12CylinderValveState } from '$lib/engine/v12-valve-events';
	let {
		state,
		phase,
		ready,
		onaction
	}: {
		state: LabState;
		phase: number;
		ready: boolean;
		onaction: (action: LabAction) => void;
	} = $props();
	const processes = [
		{
			id: 'air',
			label: 'Intake air',
			icon: 'air',
			detail: 'Inlet through intake valves into the chamber'
		},
		{
			id: 'fuel',
			label: 'Fuel injection',
			icon: 'fuel',
			detail: 'Native feed shown through hardware for inspection'
		},
		{
			id: 'combustion',
			label: 'Ignition & combustion',
			icon: 'combustion',
			detail: 'Fuel auto-ignites in hot, compressed air'
		},
		{
			id: 'exhaust',
			label: 'Exhaust gas',
			icon: 'exhaust',
			detail: 'Chamber through exhaust valves to the outlet'
		}
	] as const;
	const strokes = ['intake', 'compression', 'expansion', 'exhaust'] as const;
	let enabled = $derived(processes.filter(({ id }) => state.flows.includes(id)).length);
	let availability = $derived(playbackAvailability(state));
	let disabled = $derived(!ready || !availability.available || state.isolated);
	let cylinder = $derived(
		V12_CYLINDERS.find((c) => [c.pistonId, c.rodId, c.linerId].includes(state.selected ?? '')) ??
			V12_CYLINDERS[0]
	);
	let cycle = $derived(v12ProcessCycle(cylinder, phase));
	let valves = $derived(v12CylinderValveState(cylinder.pistonId, phase));
	function toggleAll() {
		const retained = state.flows.filter((id) => !processes.some((process) => process.id === id));
		onaction({
			type: 'flows',
			value:
				enabled === processes.length ? retained : [...retained, ...processes.map(({ id }) => id)]
		});
	}
	function dismissMenu(node: HTMLDetailsElement) {
		function outside(event: PointerEvent) {
			if (event.target instanceof Node && !node.contains(event.target)) node.open = false;
		}
		function escape(event: KeyboardEvent) {
			if (event.key !== 'Escape' || !node.open) return;
			node.open = false;
			node.querySelector('summary')?.focus();
		}
		document.addEventListener('pointerdown', outside, { passive: true });
		document.addEventListener('keydown', escape);
		return () => {
			document.removeEventListener('pointerdown', outside);
			document.removeEventListener('keydown', escape);
		};
	}
</script>

<details class="process-control" {@attach dismissMenu}>
	<summary
		aria-label="Processes"
		title="Intake, direct fuel injection, compression ignition and exhaust"
		class:enabled={enabled > 0}
	>
		<Icon name="combustion" size={16} /><span>Processes</span>{#if enabled}<b>{enabled}</b>{/if}
	</summary>
	<div class="process-menu" role="group" aria-label="Processes">
		<div class="menu-heading">
			<strong>Processes</strong><button onclick={toggleAll} {disabled}
				>{enabled === processes.length ? 'Hide all' : 'Show all'}</button
			>
		</div>
		{#each processes as process (process.id)}
			<label
				class:checked={state.flows.includes(process.id)}
				style:--process-color={FLOW_COLORS[process.id]}
			>
				<Icon name={process.icon} size={18} />
				<span>{process.label}<small>{process.detail}</small></span>
				<input
					type="checkbox"
					aria-label={process.label}
					checked={state.flows.includes(process.id)}
					{disabled}
					onchange={(event) =>
						onaction({ type: 'flow', flow: process.id, value: event.currentTarget.checked })}
				/>
			</label>
		{/each}
		<div class="cycle-readout">
			<div>
				<span>Piston {cylinder.pistonId.slice(4)}</span><strong
					>{cycle.igniting ? 'Auto-ignition' : cycle.stroke}</strong
				>
			</div>
			<div class="stroke-track" aria-label={`Illustrative cylinder cycle: ${cycle.stroke}`}>
				{#each strokes as stroke (stroke)}<span
						class:active={stroke === cycle.stroke}
						title={stroke}
					></span>{/each}
			</div>
			<div class="valve-readout">
				<span>Intake <b>{valves.intake.liftMm.toFixed(2)} mm</b></span><span
					>Exhaust <b>{valves.exhaust.liftMm.toFixed(2)} mm</b></span
				>
			</div>
			<button
				class="focus-cylinder"
				{disabled}
				onclick={(event) => {
					(event.currentTarget.closest('details') as HTMLDetailsElement).open = false;
					onaction({ type: 'display', value: 'mechanism' });
					onaction({ type: 'focus', id: cylinder.pistonId });
				}}><Icon name="target" size={14} />Inspect this cylinder</button
			>
			<p>
				{disabled
					? state.isolated
						? 'Show the full assembly to view cycle overlays.'
						: (availability.reason ?? 'Waiting for engine geometry.')
					: 'Air and exhaust pass through the valves. Fuel enters through its own injector.'}
			</p>
		</div>
		<p class="scope">
			Ports, pipes and fuel galleries follow the source geometry. Head and turbine connections are
			schematic; the upstream tank and pump are not modeled. Colour and motion are illustrative.
		</p>
	</div>
</details>

<style>
	.process-control {
		position: relative;
		flex-shrink: 0;
	}
	summary {
		height: 34px;
		padding: 0 8px;
		display: flex;
		align-items: center;
		gap: 6px;
		list-style: none;
		color: #aebac7;
		font-size: 12px;
		border-radius: 4px;
		cursor: pointer;
		white-space: nowrap;
	}
	summary::-webkit-details-marker {
		display: none;
	}
	summary:hover,
	details[open] > summary {
		background: #ffffff0b;
		color: #e0e8f1;
	}
	summary.enabled {
		color: #b8d4f1;
	}
	summary b {
		font-size: 10px;
		font-weight: 500;
		background: #82b3e824;
		border-radius: 3px;
		min-width: 16px;
		text-align: center;
		padding: 1px 3px;
	}
	.process-menu {
		position: absolute;
		right: 0;
		bottom: calc(100% + 12px);
		width: 300px;
		max-width: calc(100vw - 28px);
		padding: 12px;
		background: #141b23f8;
		border: 1px solid #ffffff20;
		border-radius: 7px;
		box-shadow: 0 12px 35px #0008;
		backdrop-filter: blur(20px);
		z-index: 30;
	}
	.menu-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 9px;
		font-size: 12px;
	}
	.menu-heading strong {
		color: #dce5ef;
		font-weight: 550;
	}
	.menu-heading button {
		color: #a7c9ef;
		background: none;
		padding: 3px 0 3px 8px;
		font-size: 11px;
	}
	button:disabled {
		opacity: 0.45;
		cursor: default;
	}
	label {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 9px 4px;
		cursor: pointer;
		font-size: 12px;
		color: #b3beca;
	}
	label > :global(svg) {
		color: #7d8a98;
		flex-shrink: 0;
	}
	label.checked > :global(svg) {
		color: var(--process-color);
	}
	label span {
		flex: 1;
	}
	label small {
		display: block;
		font-size: 11px;
		color: #8f9bab;
		margin-top: 3px;
	}
	input {
		appearance: auto;
		width: 14px;
		height: 14px;
		margin: 0;
		accent-color: var(--process-color);
		cursor: pointer;
	}
	.cycle-readout {
		margin-top: 8px;
		padding-top: 11px;
		border-top: 1px solid #ffffff15;
	}
	.cycle-readout > div:first-child {
		display: flex;
		align-items: center;
		justify-content: space-between;
		color: #9baaba;
		font-size: 11px;
	}
	.cycle-readout strong {
		color: #d4dce5;
		font-weight: 500;
		text-transform: capitalize;
	}
	.valve-readout {
		display: flex;
		justify-content: space-between;
		gap: 12px;
		margin-top: 9px;
		font-size: 11px;
		color: #95a3b2;
	}
	.valve-readout b {
		font-weight: 500;
		font-variant-numeric: tabular-nums;
		color: #cbd5df;
	}
	.focus-cylinder {
		display: flex;
		align-items: center;
		gap: 6px;
		background: transparent;
		color: #a7c9ef;
		padding: 8px 0 0;
		font-size: 11px;
	}
	.stroke-track {
		display: flex;
		gap: 3px;
		margin-top: 8px;
	}
	.stroke-track span {
		height: 3px;
		flex: 1;
		background: #ffffff16;
		border-radius: 1px;
	}
	.stroke-track .active {
		background: #89b4df;
	}
	p {
		margin: 8px 0 0;
		font-size: 11px;
		line-height: 1.5;
		color: #9aa8b7;
	}
	.scope {
		color: #7e8d9d;
	}
	summary:focus-visible,
	button:focus-visible,
	input:focus-visible {
		outline: 2px solid #8ab3df;
		outline-offset: 2px;
	}
	@media (max-width: 760px) {
		summary > span {
			display: none;
		}
		.process-menu {
			right: -65px;
		}
	}
</style>
