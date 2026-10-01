<script lang="ts">
	import Icon from './Icon.svelte';
	import { V12_CYCLE_STUDY, sampleV12CycleStudy } from '$lib/engine/v12-cycle-study';
	import { V12_ANALYSIS_CYLINDERS } from '$lib/engine/v12-analysis';
	import { v12CylinderValveState } from '$lib/engine/v12-valve-events';
	import type { V12CycleSample } from '$lib/engine/v12-cylinder-cycle';
	let {
		phase,
		selected,
		onselect
	}: {
		phase: number;
		selected: string | null;
		onselect: (id: string) => void;
	} = $props();
	const uid = $props.id();
	const study = V12_CYCLE_STUDY;
	const scenario = study.scenario;
	const pressureMaxBar = Math.ceil(study.summary.peakPressurePa / 1e6) * 10;
	const volumeMaxCm3 =
		Math.ceil(Math.max(...study.samples.map((s) => s.volumeM3 * 1e6)) / 100) * 100;
	const bounds = { left: 37, right: 310, top: 20, bottom: 153 };
	const strokes = [
		{ name: 'Expansion', from: 0, to: 180, color: '#dfa46d' },
		{ name: 'Exhaust', from: 180, to: 360, color: '#bd8774' },
		{ name: 'Intake', from: 360, to: 540, color: '#78b9c5' },
		{ name: 'Compression', from: 540, to: 720, color: '#9caec9' }
	];
	let activeId = $derived(
		V12_ANALYSIS_CYLINDERS.find((c) => [c.id, c.rodId, c.linerId].includes(selected ?? ''))?.id ??
			V12_ANALYSIS_CYLINDERS[0].id
	);
	let valves = $derived(v12CylinderValveState(activeId, phase));
	let sample = $derived(sampleV12CycleStudy(valves.cycleAngleDeg));
	let stroke = $derived(strokes[Math.min(3, Math.floor(valves.cycleAngleDeg / 180))]);
	const angleX = (angle: number) => bounds.left + (angle / 720) * (bounds.right - bounds.left);
	const volumeX = (volume: number) =>
		bounds.left + ((volume * 1e6) / volumeMaxCm3) * (bounds.right - bounds.left);
	const pressureY = (pressure: number) =>
		bounds.bottom - (pressure / 1e5 / pressureMaxBar) * (bounds.bottom - bounds.top);
	function curve(samples: readonly V12CycleSample[], x: (sample: V12CycleSample) => number) {
		return samples
			.map((s, i) => `${i ? 'L' : 'M'}${x(s).toFixed(2)},${pressureY(s.pressurePa).toFixed(2)}`)
			.join(' ');
	}
	const curves = strokes.map((s) => ({
		...s,
		samples: study.samples.filter((p) => p.angleDeg >= s.from && p.angleDeg <= s.to)
	}));
	function download() {
		const fields = [
			'angleDeg',
			'pressurePa',
			'volumeM3',
			'temperatureK',
			'massKg',
			'internalEnergyJ',
			'intakeMassFlowKgS',
			'exhaustMassFlowKgS',
			'heatReleaseJPerDeg',
			'wallHeatIntoGasJPerDeg'
		] as const;
		const csv = [
			fields.join(','),
			...study.samples.map((row) => fields.map((key) => row[key]).join(','))
		].join('\n');
		const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
		const link = document.createElement('a');
		link.href = url;
		link.download = `${scenario.id}.csv`;
		link.click();
		setTimeout(() => URL.revokeObjectURL(url), 1000);
	}
</script>

<section class="cycle-analysis" aria-label="Cylinder cycle analysis">
	<header>
		<div class="case-label">
			<span>Reference case</span><b>{scenario.rpm.toLocaleString()} rpm</b>
		</div>
		<h3>Cylinder cycle</h3>
		<p>
			Single-zone air-standard calculation. Prescribed heat input; no calibrated engine-performance
			claim.
		</p>
	</header>
	<div class="cylinder-picker" role="group" aria-label="Cycle cylinder">
		{#each ['A', 'B'] as bank (bank)}
			<div>
				<span>{bank}</span>{#each V12_ANALYSIS_CYLINDERS.filter((c) => c.bank === bank) as c (c.id)}
					<button
						aria-label={`Cycle ${c.label}`}
						aria-pressed={activeId === c.id}
						class:active={activeId === c.id}
						onclick={() => onselect(c.id)}>{c.id.slice(4)}</button
					>
				{/each}
			</div>
		{/each}
	</div>
	<div class="phase-heading">
		<span style:--stroke={stroke.color}>{stroke.name}</span><b
			>{valves.cycleAngleDeg.toFixed(1)}° <small>after compression TDC</small></b
		>
	</div>
	<div class="metrics">
		<div>
			<span>Pressure</span><strong
				>{(sample.pressurePa / 1e5).toFixed(2)}<small>bar abs</small></strong
			>
		</div>
		<div>
			<span>Gas temperature</span><strong>{Math.round(sample.temperatureK)}<small>K</small></strong>
		</div>
		<div>
			<span>Chamber volume</span><strong
				>{(sample.volumeM3 * 1e6).toFixed(1)}<small>cm³</small></strong
			>
		</div>
		<div>
			<span>Trapped air</span><strong>{(sample.massKg * 1e6).toFixed(1)}<small>mg</small></strong>
		</div>
	</div>
	{#snippet pressureGrid()}
		{#each [0, 0.25, 0.5, 0.75, 1] as t (t)}
			<line
				class="grid"
				x1={bounds.left}
				x2={bounds.right}
				y1={pressureY(t * pressureMaxBar * 1e5)}
				y2={pressureY(t * pressureMaxBar * 1e5)}
			/>
			<text x="29" y={pressureY(t * pressureMaxBar * 1e5) + 3.5} text-anchor="end"
				>{+(t * pressureMaxBar).toFixed(1)}</text
			>
		{/each}
		<text x="37" y="10">bar abs</text>
	{/snippet}
	<figure>
		<figcaption>Pressure / crank angle</figcaption>
		<svg viewBox="0 0 324 180" role="img" aria-labelledby={`${uid}-angle-title`}>
			<title id={`${uid}-angle-title`}
				>Calculated cylinder pressure over 720 crank degrees. Current pressure {(
					sample.pressurePa / 1e5
				).toFixed(2)} bar absolute.</title
			>
			{#each strokes as s (s.name)}<rect
					x={angleX(s.from)}
					y={bounds.top}
					width={angleX(s.to) - angleX(s.from)}
					height={bounds.bottom - bounds.top}
					fill={s.color}
					opacity="0.045"
				/>{/each}
			{@render pressureGrid()}
			{#each [0, 180, 360, 540, 720] as angle (angle)}<text
					x={angleX(angle)}
					y="172"
					text-anchor="middle">{angle}°</text
				>{/each}
			{#each curves as c (c.name)}<path
					d={curve(c.samples, (s) => angleX(s.angleDeg))}
					stroke={c.color}
				/>{/each}
			<line
				class="cursor"
				x1={angleX(valves.cycleAngleDeg)}
				x2={angleX(valves.cycleAngleDeg)}
				y1={bounds.top}
				y2={bounds.bottom}
			/>
			<circle
				cx={angleX(valves.cycleAngleDeg)}
				cy={pressureY(sample.pressurePa)}
				r="3.5"
				fill={stroke.color}
			/>
		</svg>
	</figure>
	<figure>
		<figcaption>
			Pressure / volume <span
				>{(study.summary.indicatedMeanEffectivePressurePa / 1e5).toFixed(2)} bar IMEP</span
			>
		</figcaption>
		<svg viewBox="0 0 324 193" role="img" aria-labelledby={`${uid}-pv-title`}>
			<title id={`${uid}-pv-title`}
				>Pressure–volume loop. Net indicated work {study.summary.indicatedWorkPerCylinderJ.toFixed(
					1
				)} joules per cylinder per cycle.</title
			>
			{@render pressureGrid()}
			{#each [0, 0.25, 0.5, 0.75, 1] as t (t)}<text
					x={volumeX((t * volumeMaxCm3) / 1e6)}
					y="171"
					text-anchor="middle">{t * volumeMaxCm3}</text
				>{/each}
			<text x={bounds.right} y="188" text-anchor="end">cm³</text>
			{#each curves as c (c.name)}<path
					d={curve(c.samples, (s) => volumeX(s.volumeM3))}
					stroke={c.color}
				/>{/each}
			<circle
				cx={volumeX(sample.volumeM3)}
				cy={pressureY(sample.pressurePa)}
				r="3.5"
				fill={stroke.color}
			/>
		</svg>
	</figure>
	<div class="legend">
		{#each strokes as s (s.name)}<span style:--stroke={s.color}>{s.name}</span>{/each}
	</div>
	<dl class="live-flows">
		<div>
			<dt>Intake mass flow</dt>
			<dd>{(sample.intakeMassFlowKgS * 1000).toFixed(2)} <span>g/s</span></dd>
		</div>
		<div>
			<dt>Exhaust mass flow</dt>
			<dd>{(sample.exhaustMassFlowKgS * 1000).toFixed(2)} <span>g/s</span></dd>
		</div>
		<div>
			<dt>Heat input</dt>
			<dd>{sample.heatReleaseJPerDeg.toFixed(2)} <span>J/°</span></dd>
		</div>
	</dl>
	<p class="note">
		Positive flow enters the cylinder. The same declared case is phase-aligned to each cylinder; it
		does not predict cylinder-to-cylinder variation.
	</p>
	<details>
		<summary>Case assumptions</summary>
		<dl>
			<div>
				<dt>Compression ratio</dt>
				<dd>{scenario.compressionRatio}:1 <span>assumed</span></dd>
			</div>
			<div>
				<dt>Intake reservoir</dt>
				<dd>
					{(scenario.intakePressurePa / 1e5).toFixed(2)} bar · {scenario.intakeTemperatureK} K
				</dd>
			</div>
			<div>
				<dt>Exhaust reservoir</dt>
				<dd>
					{(scenario.exhaustPressurePa / 1e5).toFixed(2)} bar · {scenario.exhaustTemperatureK} K
				</dd>
			</div>
			<div>
				<dt>Heat per cycle</dt>
				<dd>{scenario.heatInputPerCycleJ} J/cylinder</dd>
			</div>
			<div>
				<dt>Heat-release window</dt>
				<dd>
					{scenario.burnStartDeg}° to {scenario.burnStartDeg + scenario.burnDurationDeg}° ATDC
				</dd>
			</div>
			<div>
				<dt>Discharge coefficient</dt>
				<dd>{scenario.dischargeCoefficient}</dd>
			</div>
			<div>
				<dt>Wall condition</dt>
				<dd>{scenario.wallTemperatureK} K · {scenario.wallCoefficientWPerM2K} W/m²K</dd>
			</div>
		</dl>
		<p>
			{study.provenance.clearance}. Constant ideal-air properties; no fuel mass, chemistry, friction
			or turbo matching. The passage tracers are separate steady reference fields.
		</p>
	</details>
	<details>
		<summary>Numerical verification</summary>
		<dl>
			<div>
				<dt>Periodic solution</dt>
				<dd>
					{study.periodic.converged ? 'Converged' : 'Unconverged'} · {study.periodic.cycles} cycles
				</dd>
			</div>
			<div>
				<dt>Integration increment</dt>
				<dd>{study.verification.integrationStepDeg}°</dd>
			</div>
			<div>
				<dt>Mass closure error</dt>
				<dd>{Math.abs(study.balance.massResidualKg * 1e6).toExponential(2)} mg/cycle</dd>
			</div>
			<div>
				<dt>Energy closure error</dt>
				<dd>{Math.abs(study.balance.energyResidualJ).toExponential(2)} J/cycle</dd>
			</div>
			<div>
				<dt>Reference pressure error</dt>
				<dd>
					{(study.verification.independentReference.maxRelativePressureError * 100).toPrecision(3)}%
				</dd>
			</div>
		</dl>
		<p>
			Time-step refinement and an independent integration method check this declared case. Numerical
			agreement does not establish measured engine accuracy.
		</p>
	</details>
	<button class="export" onclick={download}
		><Icon name="table" size={15} />Export cycle data <span>CSV · SI units</span></button
	>
</section>

<style>
	.cycle-analysis {
		display: grid;
		gap: 13px;
		color: #e2e9f0;
	}
	header {
		display: grid;
		gap: 7px;
	}
	.case-label,
	.phase-heading {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 8px;
		font-size: 11px;
	}
	.case-label {
		color: #abb9c8;
	}
	.case-label > span {
		font-weight: 600;
		letter-spacing: 0.07em;
		text-transform: uppercase;
	}
	b {
		font-weight: 550;
		font-variant-numeric: tabular-nums;
	}
	h3 {
		margin: 0;
		font-size: 21px;
		font-weight: 550;
		letter-spacing: -0.025em;
	}
	p {
		margin: 0;
		font-size: 11px;
		line-height: 1.6;
		color: #9aa9b8;
	}
	.cylinder-picker {
		display: grid;
		gap: 4px;
	}
	.cylinder-picker > div {
		display: grid;
		grid-template-columns: 15px repeat(6, 1fr);
		align-items: center;
		gap: 3px;
	}
	.cylinder-picker > div > span {
		font-size: 10px;
		color: #8d9cad;
	}
	button {
		font-family: inherit;
		cursor: pointer;
	}
	.cylinder-picker button {
		min-height: 27px;
		padding: 2px;
		border: 1px solid #ffffff12;
		border-radius: 3px;
		background: #ffffff03;
		color: #aab8c8;
		font-size: 11px;
		font-variant-numeric: tabular-nums;
	}
	.cylinder-picker button:hover {
		background: #ffffff0a;
	}
	.cylinder-picker button.active {
		color: #dce7f3;
		border-color: #91afce66;
		background: #a7c7e718;
	}
	.phase-heading {
		padding-top: 4px;
	}
	.phase-heading > span {
		color: var(--stroke);
	}
	small {
		font-size: 10px;
		font-weight: 400;
		color: #96a4b3;
	}
	.metrics {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 12px;
		padding: 10px 0 4px;
	}
	.metrics > div {
		display: grid;
		gap: 4px;
	}
	.metrics > div > span {
		font-size: 11px;
		color: #9eacbb;
	}
	.metrics strong {
		font-size: 23px;
		line-height: 1.1;
		font-weight: 450;
		letter-spacing: -0.025em;
		font-variant-numeric: tabular-nums;
	}
	.metrics small {
		margin-left: 5px;
		letter-spacing: 0;
	}
	figure {
		margin: 0;
	}
	figcaption {
		display: flex;
		justify-content: space-between;
		gap: 8px;
		font-size: 11px;
		font-weight: 550;
		margin-bottom: 8px;
		color: #b7c4d2;
	}
	figcaption span {
		font-weight: 400;
		color: #94a5b7;
	}
	svg {
		display: block;
		width: 100%;
		overflow: visible;
	}
	svg text {
		font-family: inherit;
		font-size: 10px;
		fill: #8f9fb0;
		font-variant-numeric: tabular-nums;
	}
	.grid {
		stroke: #bacde214;
		stroke-width: 1;
	}
	path {
		fill: none;
		stroke-width: 1.6;
		stroke-linejoin: round;
		stroke-linecap: round;
	}
	.cursor {
		stroke: #dce8f280;
		stroke-width: 1;
		stroke-dasharray: 2 3;
	}
	circle {
		stroke: #121a22;
		stroke-width: 1.5;
	}
	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: 6px 12px;
		font-size: 10px;
		margin-top: -5px;
		color: #aebbc9;
	}
	.legend > span::before {
		content: '';
		display: inline-block;
		width: 10px;
		height: 2px;
		margin: 0 5px 3px 0;
		background: var(--stroke);
	}
	dl {
		margin: 0;
		display: grid;
		gap: 8px;
		font-size: 11px;
	}
	dl > div {
		display: flex;
		justify-content: space-between;
		gap: 12px;
	}
	dt {
		color: #9aaaba;
	}
	dd {
		margin: 0;
		color: #d4e0ec;
		text-align: right;
		font-variant-numeric: tabular-nums;
	}
	dd span {
		color: #8fa1b3;
	}
	.live-flows {
		margin-top: 3px;
		padding-top: 12px;
		border-top: 1px solid #d4e2f214;
	}
	.note {
		font-size: 10px;
	}
	details {
		border-top: 1px solid #d4e2f214;
		padding-top: 11px;
	}
	summary {
		cursor: pointer;
		color: #bfcddb;
		font-size: 11px;
		font-weight: 550;
	}
	details dl {
		margin: 13px 0;
	}
	details p {
		font-size: 10px;
	}
	.export {
		display: flex;
		align-items: center;
		gap: 7px;
		width: 100%;
		padding: 8px 0;
		border: 0;
		background: none;
		color: #bad1e7;
		font-size: 11px;
		text-align: left;
	}
	.export span {
		color: #91a1b2;
		margin-left: auto;
		font-size: 10px;
	}
	button:focus-visible,
	summary:focus-visible {
		outline: 2px solid #9dbbdb;
		outline-offset: 3px;
	}
</style>
