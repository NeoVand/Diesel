<script lang="ts">
	import DesignParameter from './DesignParameter.svelte';
	import Icon from './Icon.svelte';
	import type { OperatingScenario } from '$lib/design/operating-cycle';
	let {
		scenario,
		onchange,
		onpreset,
		ongeometry
	}: {
		scenario: OperatingScenario;
		onchange: (key: keyof OperatingScenario, value: number) => void;
		onpreset: (preset: 'reference' | 'overrun' | 'high-load') => void;
		ongeometry: () => void;
	} = $props();
</script>

<div class="operating-controls">
	<div class="heading">
		<h2>Operating conditions</h2>
		<span>Inputs</span>
	</div>
	<p class="intro">{scenario.label ?? 'Custom condition'}</p>
	<div class="presets" aria-label="Operating presets">
		<button onclick={() => onpreset('reference')}>Reference</button>
		<button onclick={() => onpreset('overrun')}>Overrun</button>
		<button onclick={() => onpreset('high-load')}>High load</button>
	</div>
	<DesignParameter
		label="Cycle speed"
		value={scenario.rpm}
		min={600}
		max={3600}
		step={50}
		unit="rpm"
		onchange={(v) => onchange('rpm', v)}
	/>
	<DesignParameter
		label="Piston + pin mass"
		value={scenario.pistonMassKg}
		min={0.25}
		max={2}
		step={0.05}
		unit="kg"
		onchange={(v) => onchange('pistonMassKg', v)}
	/>
	<DesignParameter
		label="Combustion pressure rise"
		value={scenario.combustionRiseBar}
		min={0}
		max={100}
		step={1}
		unit="bar"
		onchange={(v) => onchange('combustionRiseBar', v)}
		note="Prescribed addition to motored pressure."
	/>
	<DesignParameter
		label="Compression ratio"
		value={scenario.compressionRatio}
		min={12}
		max={22}
		step={0.5}
		unit=":1"
		onchange={(v) => onchange('compressionRatio', v)}
	/>
	<DesignParameter
		label="Pressure pulse centre"
		value={scenario.combustionCentreDeg}
		min={0}
		max={35}
		step={1}
		unit="° ATDC"
		onchange={(v) => onchange('combustionCentreDeg', v)}
	/>
	<details>
		<summary>Pressure model<Icon name="right" size={14} /></summary>
		<div class="advanced">
			<DesignParameter
				label="Intake pressure"
				value={scenario.intakePressureBar}
				min={0.8}
				max={3}
				step={0.1}
				unit="bar abs"
				onchange={(v) => onchange('intakePressureBar', v)}
			/>
			<DesignParameter
				label="Exhaust pressure"
				value={scenario.exhaustPressureBar}
				min={0.8}
				max={3}
				step={0.1}
				unit="bar abs"
				onchange={(v) => onchange('exhaustPressureBar', v)}
			/>
			<DesignParameter
				label="Polytropic exponent"
				value={scenario.polytropicExponent}
				min={1.2}
				max={1.4}
				step={0.01}
				unit=""
				onchange={(v) => onchange('polytropicExponent', v)}
			/>
			<DesignParameter
				label="Pulse width"
				value={scenario.combustionWidthDeg}
				min={8}
				max={40}
				step={1}
				unit="°"
				onchange={(v) => onchange('combustionWidthDeg', v)}
			/>
			<p>
				Crankcase pressure: {scenario.crankcasePressureBar.toFixed(2)} bar absolute. Constant speed, rigid
				links and frictionless joints.
			</p>
		</div>
	</details>
	<div class="scope">
		<Icon name="info" size={16} />
		<p>Prescribed pressure · constant speed. Combustion and fuel consumption are not calculated.</p>
	</div>
	<button class="geometry" onclick={ongeometry}
		><Icon name="settings" size={15} />Edit rod geometry<Icon name="right" size={14} /></button
	>
</div>

<style>
	.heading {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 8px;
		margin-bottom: 4px;
	}
	h2 {
		font-size: 14px;
		font-weight: 600;
		margin: 0;
		color: #e4e8ed;
	}
	.heading span {
		font-size: 12px;
		color: #a0aab5;
	}
	.intro {
		color: #a7b1bd;
		font-size: 12px;
		line-height: 1.5;
		margin: 0 0 10px;
	}
	.presets {
		display: flex;
		gap: 5px;
		margin-bottom: 12px;
	}
	.presets button {
		flex: 1;
		padding: 4px;
		min-height: 26px;
	}
	button {
		color: #cbd2da;
		background: #202833;
		border: 1px solid #ffffff20;
		border-radius: 3px;
		padding: 4px 7px;
		min-height: 26px;
		font-size: 12px;
		cursor: pointer;
	}
	button:hover {
		background: #2a323b;
		color: #fff;
		border-color: #ffffff40;
	}
	button:focus-visible,
	summary:focus-visible {
		outline: 2px solid var(--accent, #82b3e8);
		outline-offset: 2px;
	}
	details {
		border-top: 1px solid #ffffff16;
	}
	summary {
		display: flex;
		align-items: center;
		justify-content: space-between;
		color: #d0d6de;
		font-size: 13px;
		padding: 9px 0;
		cursor: pointer;
		list-style: none;
	}
	summary::-webkit-details-marker {
		display: none;
	}
	details[open] summary :global(svg) {
		transform: rotate(90deg);
	}
	.advanced p {
		color: #a0aab5;
		font-size: 12px;
		line-height: 1.5;
	}
	.scope {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		padding: 9px 0;
		color: #a0aab5;
		border-top: 1px solid #ffffff16;
	}
	.scope :global(svg) {
		flex-shrink: 0;
		margin-top: 2px;
	}
	.scope p {
		margin: 0;
		font-size: 12px;
		color: #a0aab5;
		line-height: 1.5;
	}
	.geometry {
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-top: 3px;
		font-size: 13px;
		padding: 6px 8px;
	}
	@media (max-width: 760px) {
		button,
		.presets button {
			min-height: 32px;
		}
	}
</style>
