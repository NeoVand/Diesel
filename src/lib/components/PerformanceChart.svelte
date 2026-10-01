<script lang="ts">
	import { performanceMap, calculateOperatingPoint } from '$lib/engine/simulation';
	let { load = 75 }: { load: number } = $props();
	const x = (value: number) => 34 + ((value - 10) / 90) * 252;
	const y = (value: number) => 142 - (value / 420) * 112;
	const line = performanceMap.map((p) => `${x(p.loadPercent)},${y(p.fuelLh)}`).join(' ');
	let current = $derived(calculateOperatingPoint(load));
</script>

<svg
	viewBox="0 0 308 176"
	role="img"
	aria-label="Fuel consumption versus generator load, with the current operating point marked"
>
	<defs
		><linearGradient id="fuel-area" x1="0" x2="0" y1="0" y2="1"
			><stop offset="0%" stop-color="#cca635" stop-opacity=".16" /><stop
				offset="100%"
				stop-color="#cca635"
				stop-opacity="0"
			/></linearGradient
		></defs
	>
	{#each [100, 200, 300, 400] as tick (tick)}<line
			x1="34"
			x2="286"
			y1={y(tick)}
			y2={y(tick)}
			stroke="#e8e9e4"
			stroke-dasharray="3 4"
		/><text x="0" y={y(tick) + 3}>{tick}</text>{/each}
	<polygon points={`34,142 ${line} 286,142`} fill="url(#fuel-area)" />
	<polyline points={line} fill="none" stroke="#bf9620" stroke-width="2" stroke-linejoin="round" />
	{#each performanceMap as point (point.loadPercent)}<circle
			cx={x(point.loadPercent)}
			cy={y(point.fuelLh)}
			r="2.2"
			fill="#cfb46c"
		/>{/each}
	<line
		x1={x(load)}
		x2={x(load)}
		y1="25"
		y2="142"
		stroke="#202321"
		stroke-opacity=".25"
		stroke-dasharray="3 3"
	/>
	<circle cx={x(load)} cy={y(current.fuelLh)} r="5" fill="#222923" stroke="#fff" stroke-width="2" />
	{#each [10, 25, 50, 75, 100] as tick (tick)}<text x={x(tick)} y="160" text-anchor="middle"
			>{tick}%</text
		>{/each}
</svg>

<style>
	svg {
		display: block;
		width: 100%;
		overflow: visible;
	}
	text {
		font: 9px var(--mono);
		fill: #8b918a;
	}
</style>
