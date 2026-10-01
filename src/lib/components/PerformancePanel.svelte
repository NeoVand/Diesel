<script lang="ts">
	import { calculateOperatingPoint, performanceMap } from '$lib/engine/simulation';
	let { load, onchange }: { load: number; onchange: (value: number) => void } = $props();
	let point = $derived(calculateOperatingPoint(load));
	const fmt = (n: number, d = 0) =>
		n.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });
	const x = (n: number) => 26 + ((n - 10) / 90) * 260;
	const y = (n: number) => 136 - (n / 420) * 110;
	const line = performanceMap.map((p) => `${x(p.loadPercent)},${y(p.fuelLh)}`).join(' ');
</script>

<section class="performance">
	<div class="eyebrow">EM1898-00 · 1800 RPM</div>
	<h2>Performance reference</h2>
	<p class="intro">Explore published output and fuel demand across the generator load range.</p>
	<div class="load-label">
		<label for="generator-load">Generator load</label><strong>{load}<small>%</small></strong>
	</div>
	<input
		id="generator-load"
		aria-label="Generator load"
		type="range"
		min="10"
		max="100"
		step="1"
		value={load}
		oninput={(e) => onchange(Number(e.currentTarget.value))}
	/>
	<div class="range-labels"><span>10%</span><span>50%</span><span>100%</span></div>
	<div class="presets">
		{#each [25, 50, 75, 100] as value (value)}<button
				class:active={load === value}
				onclick={() => onchange(value)}>{value}%</button
			>{/each}
	</div>
	<div class="metrics">
		<div>
			<span>Electrical output</span><strong>{fmt(point.electricalKW)}<small>kW</small></strong>
		</div>
		<div>
			<span>Fuel consumption</span><strong>{fmt(point.fuelLh, 1)}<small>L/h</small></strong>
		</div>
	</div>
	<div class="chart-label"><span>FUEL / LOAD</span><span>L/h</span></div>
	<svg viewBox="0 0 306 162" role="img" aria-label="Published fuel consumption by generator load">
		{#each [100, 200, 300, 400] as value (value)}<line
				x1="26"
				x2="286"
				y1={y(value)}
				y2={y(value)}
				stroke="#ffffff0c"
			/><text x="0" y={y(value) + 3}>{value}</text>{/each}
		<polyline
			points={line}
			fill="none"
			stroke="#f3c95a"
			stroke-width="1.8"
			stroke-linejoin="round"
		/>
		{#each performanceMap as p (p.loadPercent)}<circle
				cx={x(p.loadPercent)}
				cy={y(p.fuelLh)}
				r="2.3"
				fill="#927d46"
			/>{/each}
		<line x1={x(load)} x2={x(load)} y1="20" y2="136" stroke="#f3c95a66" stroke-dasharray="3 4" />
		<circle
			cx={x(load)}
			cy={y(point.fuelLh)}
			r="5"
			fill="#f3c95a"
			stroke="#171d25"
			stroke-width="2"
		/>
		{#each [10, 50, 100] as value (value)}<text x={x(value)} y="156" text-anchor="middle"
				>{value}%</text
			>{/each}
	</svg>
	<dl>
		<div>
			<dt>Average shaft torque</dt>
			<dd>{fmt(point.torqueNm)} <span>N·m</span></dd>
		</div>
		<div>
			<dt>Electrical efficiency · LHV</dt>
			<dd>{fmt(point.efficiencyPercent, 1)} <span>%</span></dd>
		</div>
		<div>
			<dt>Exhaust manifold</dt>
			<dd>{fmt(point.exhaustManifoldC, 1)} <span>°C</span></dd>
		</div>
		<div>
			<dt>Jacket-water heat</dt>
			<dd>{fmt(point.jacketHeatKW, 1)} <span>kW</span></dd>
		</div>
	</dl>
	<div class="evidence">
		<i></i>{point.evidence === 'reported'
			? 'Published operating point'
			: 'Interpolated operating point'}
	</div>
	<p class="note">
		Steady-state reference at 1800 rpm. Animation playback does not change this operating speed.
		Heat channels retain their published boundaries.
	</p>
</section>

<style>
	.eyebrow,
	.chart-label {
		font: 11px var(--mono);
		letter-spacing: 0.1em;
		color: var(--subtle);
	}
	h2 {
		font-size: 22px;
		font-weight: 500;
		letter-spacing: -0.04em;
		margin: 14px 0 12px;
	}
	.intro,
	.note {
		font-size: 14px;
		line-height: 1.8;
		color: var(--muted);
		margin: 0;
	}
	.load-label {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-top: 28px;
	}
	.load-label label {
		font-size: 12px;
		color: var(--muted);
	}
	.load-label strong {
		font-size: 34px;
		letter-spacing: -0.05em;
		font-weight: 450;
	}
	.load-label small {
		font-size: 15px;
		margin-left: 3px;
		color: var(--muted);
	}
	input {
		width: 100%;
		height: 4px;
		margin: 20px 0 13px;
		accent-color: var(--accent);
		cursor: pointer;
	}
	.range-labels {
		display: flex;
		justify-content: space-between;
		font: 11px var(--mono);
		color: var(--subtle);
	}
	.presets {
		display: flex;
		gap: 6px;
		margin: 19px 0 28px;
	}
	.presets button {
		flex: 1;
		padding: 8px;
		color: var(--muted);
		background: #ffffff05;
		border: 1px solid var(--line);
		border-radius: 5px;
		font-size: 12px;
	}
	.presets button.active {
		color: var(--accent);
		border-color: #f3c95a55;
		background: #f3c95a09;
	}
	.metrics {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 18px;
		border-block: 1px solid var(--line);
		padding: 22px 0;
	}
	.metrics > div {
		display: flex;
		flex-direction: column;
		gap: 9px;
	}
	.metrics span {
		font-size: 12px;
		color: var(--muted);
	}
	.metrics strong {
		font-size: 28px;
		letter-spacing: -0.05em;
		font-weight: 450;
	}
	.metrics small {
		font: 11px var(--mono);
		letter-spacing: 0;
		color: var(--subtle);
		margin-left: 6px;
	}
	.chart-label {
		display: flex;
		justify-content: space-between;
		margin: 26px 0 9px;
	}
	svg {
		width: 100%;
		display: block;
	}
	svg text {
		fill: var(--subtle);
		font: 11px var(--mono);
	}
	dl {
		margin: 16px 0 22px;
	}
	dl > div {
		display: flex;
		justify-content: space-between;
		gap: 8px;
		font-size: 12px;
		padding: 10px 0;
		border-bottom: 1px solid var(--line);
	}
	dt {
		color: var(--muted);
	}
	dd {
		margin: 0;
		font-family: var(--mono);
		font-size: 12px;
	}
	dd span {
		color: var(--subtle);
	}
	.evidence {
		display: flex;
		align-items: center;
		gap: 7px;
		font-size: 12px;
		color: #b4c7b7;
		margin-bottom: 10px;
	}
	.evidence i {
		width: 4px;
		height: 4px;
		background: #93b69b;
		border-radius: 50%;
	}
	.note {
		font-size: 12px;
		line-height: 1.8;
		color: var(--muted);
	}
</style>
