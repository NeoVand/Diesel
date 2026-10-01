<script lang="ts">
	import {
		V12_ANALYSIS,
		V12_ANALYSIS_CYLINDERS,
		createV12KinematicCurve,
		v12KinematicMeasurement
	} from '$lib/engine/v12-analysis';

	let {
		phase,
		selected,
		onselect
	}: {
		phase: number;
		selected: string | null;
		onselect?: (id: string) => void;
	} = $props();
	const uid = $props.id();
	let fallbackId = $state(V12_ANALYSIS_CYLINDERS[0].id);
	let activeId = $derived(
		V12_ANALYSIS_CYLINDERS.find((entry) =>
			[entry.id, entry.rodId, entry.linerId].includes(selected ?? '')
		)?.id ?? fallbackId
	);
	let measurement = $derived(v12KinematicMeasurement(activeId, phase));
	let curve = $derived(createV12KinematicCurve(activeId));
	let path = $derived(
		curve
			.map(
				(sample, index) =>
					`${index ? 'L' : 'M'}${(36 + (sample.phaseDeg / 360) * 244).toFixed(2)},${(160 - sample.displacementMm * 1.2).toFixed(2)}`
			)
			.join(' ')
	);
	let pointX = $derived(36 + (measurement.phaseDeg / 360) * 244);
	let pointY = $derived(160 - measurement.displacementMm * 1.2);

	function choose(id: string) {
		fallbackId = id;
		activeId = id;
		onselect?.(id);
	}
</script>

<section class="analysis" aria-label="Measured kinematic analysis">
	<header>
		<span class="eyebrow">Measured geometry</span>
		<h3>Piston kinematics</h3>
		<p>Live measurements from the animated source linkage.</p>
	</header>

	<div class="metrics">
		<div>
			<span>Piston travel</span>
			<strong>{measurement.displacementMm.toFixed(1)}<small>mm</small></strong>
			<span class="detail">from top dead centre</span>
		</div>
		<div>
			<span>Rod inclination</span>
			<strong>{measurement.rodAngleDeg.toFixed(1)}<small>°</small></strong>
			<span class="detail">relative to bore axis</span>
		</div>
	</div>

	<figure>
		<figcaption>
			<span>Displacement / crank angle</span><b>{measurement.phaseDeg.toFixed(0)}°</b>
		</figcaption>
		<svg viewBox="0 0 304 198" role="img" aria-labelledby={`${uid}-plot-title ${uid}-plot-desc`}>
			<title id={`${uid}-plot-title`}>Piston displacement over one crank revolution</title>
			<desc id={`${uid}-plot-desc`}>
				Source {activeId}: {measurement.displacementMm.toFixed(1)} millimetres from top dead centre at
				{measurement.phaseDeg.toFixed(1)} degrees of crank rotation from the source pose. The measured
				stroke is 100 millimetres.
			</desc>
			{#each [0, 25, 50, 75, 100] as value (value)}
				<line class="grid-line" x1="36" x2="280" y1={160 - value * 1.2} y2={160 - value * 1.2} />
				<text class="axis-value" x="27" y={164 - value * 1.2} text-anchor="end">{value}</text>
			{/each}
			{#each [0, 90, 180, 270, 360] as angle (angle)}
				<text class="axis-value" x={36 + (angle / 360) * 244} y="180" text-anchor="middle"
					>{angle}°</text
				>
			{/each}
			<text class="axis-unit" x="36" y="21">mm</text>
			<path class="curve-area" d={`${path} L280,160 L36,160 Z`} />
			<path class="curve-line" d={path} />
			<line class="cursor-line" x1={pointX} x2={pointX} y1="35" y2="160" />
			<circle class="cursor-halo" cx={pointX} cy={pointY} r="7" />
			<circle class="cursor-point" cx={pointX} cy={pointY} r="3.5" />
		</svg>
		<p>0° is the supplied CAD pose. It is not a firing event.</p>
	</figure>

	<div class="cylinder-picker">
		<div class="picker-heading"><span>Track a source piston</span><code>{activeId}</code></div>
		{#each ['A', 'B'] as bank (bank)}
			<div class="bank-row">
				<span class="bank-name">{bank}</span>
				<div class="bank-pistons" role="group" aria-label={`Bank ${bank} source pistons`}>
					{#each V12_ANALYSIS_CYLINDERS.filter((entry) => entry.bank === bank) as cylinder (cylinder.id)}
						<button
							type="button"
							class:active={activeId === cylinder.id}
							aria-pressed={activeId === cylinder.id}
							aria-label={cylinder.label}
							title={cylinder.label}
							onclick={() => choose(cylinder.id)}>{cylinder.id.slice(4)}</button
						>
					{/each}
				</div>
			</div>
		{/each}
		<p>IDs identify source parts; bank labels are spatial references.</p>
	</div>

	<dl>
		<div>
			<dt>Stroke</dt>
			<dd>{measurement.strokeMm.toFixed(0)} <span>mm</span></dd>
		</div>
		<div>
			<dt>Crank throw</dt>
			<dd>{measurement.crankThrowMm.toFixed(0)} <span>mm</span></dd>
		</div>
		<div>
			<dt>Rod centres</dt>
			<dd>{measurement.rodLengthMm.toFixed(0)} <span>mm</span></dd>
		</div>
	</dl>
	<p class="qualification">{V12_ANALYSIS.qualification}</p>
</section>

<style>
	.analysis {
		display: grid;
		gap: 16px;
		width: 100%;
		color: #e8edf0;
	}
	header {
		display: grid;
		gap: 6px;
	}
	.eyebrow {
		font-size: 11px;
		font-weight: 650;
		letter-spacing: 0.11em;
		text-transform: uppercase;
		color: #d4ad68;
	}
	h3 {
		margin: 0;
		font-size: 22px;
		font-weight: 520;
		letter-spacing: -0.035em;
	}
	p {
		margin: 0;
		color: #929ca6;
		font-size: 12px;
		line-height: 1.6;
	}
	.metrics {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 12px;
	}
	.metrics > div {
		display: grid;
		gap: 4px;
	}
	.metrics span {
		font-size: 11px;
		color: #a6afb7;
	}
	.metrics strong {
		font-size: 29px;
		font-weight: 450;
		letter-spacing: -0.04em;
		font-variant-numeric: tabular-nums;
	}
	.metrics small {
		font-size: 13px;
		font-weight: 400;
		color: #a6afb7;
		margin-left: 5px;
		letter-spacing: 0;
	}
	.metrics .detail {
		font-size: 11px;
		color: #7c8994;
	}
	figure {
		margin: 0;
		padding: 14px 10px 11px;
		border: 1px solid #ffffff12;
		border-radius: 10px;
		background: #03060966;
	}
	figcaption {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0 4px;
		gap: 8px;
		font-size: 11px;
		color: #b2bac1;
	}
	figcaption b {
		color: #d4ad68;
		font-variant-numeric: tabular-nums;
		font-weight: 500;
	}
	figure svg {
		display: block;
		width: 100%;
		overflow: visible;
	}
	figure p {
		padding: 0 4px;
		font-size: 11px;
	}
	.grid-line {
		stroke: #ffffff0e;
		stroke-width: 1;
	}
	.axis-value,
	.axis-unit {
		fill: #88959f;
		font-size: 11px;
		font-family: inherit;
	}
	.curve-line {
		fill: none;
		stroke: #d4ad68;
		stroke-width: 1.8;
		stroke-linejoin: round;
	}
	.curve-area {
		fill: #d4ad680b;
	}
	.cursor-line {
		stroke: #a9b6c060;
		stroke-dasharray: 3 4;
	}
	.cursor-halo {
		fill: #d4ad6820;
	}
	.cursor-point {
		fill: #efd4a5;
		stroke: #141b21;
		stroke-width: 1.5;
	}
	.cylinder-picker {
		display: grid;
		gap: 9px;
	}
	.picker-heading {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 3px;
		gap: 10px;
		font-size: 11px;
	}
	code {
		font-size: 11px;
		color: #8b9aa6;
	}
	.bank-row {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.bank-name {
		width: 13px;
		font-size: 11px;
		color: #83919c;
	}
	.bank-pistons {
		display: grid;
		grid-template-columns: repeat(6, minmax(0, 1fr));
		gap: 4px;
		flex: 1;
	}
	.bank-pistons button {
		min-width: 0;
		min-height: 33px;
		padding: 0 3px;
		border: 1px solid #ffffff14;
		border-radius: 5px;
		background: #ffffff03;
		color: #a9b4bd;
		font-family: inherit;
		font-size: 11px;
		font-variant-numeric: tabular-nums;
		cursor: pointer;
		transition:
			color 150ms,
			border-color 150ms,
			background 150ms;
	}
	.bank-pistons button:hover {
		border-color: #a0adb847;
		color: #f3f6f8;
	}
	.bank-pistons button.active {
		color: #e2bd7e;
		background: #d4ad6812;
		border-color: #d4ad6859;
	}
	button:focus-visible {
		outline: 2px solid #e2bd7e;
		outline-offset: 2px;
	}
	.cylinder-picker p {
		font-size: 11px;
	}
	dl {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		margin: 0;
		padding: 15px 0;
		border-top: 1px solid #ffffff12;
		border-bottom: 1px solid #ffffff12;
		gap: 8px;
	}
	dt {
		color: #85929d;
		font-size: 11px;
		margin-bottom: 7px;
	}
	dd {
		margin: 0;
		font-size: 17px;
		font-variant-numeric: tabular-nums;
	}
	dd span {
		font-size: 11px;
		color: #8e9ba6;
	}
	.qualification {
		font-size: 11px;
		color: #84919c;
	}
</style>
