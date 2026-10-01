<script lang="ts">
	export interface PlotPoint {
		id: string;
		x: number;
		y: number;
		label?: string;
		feasible?: boolean;
		pareto?: boolean;
	}
	export interface PlotLine {
		id: string;
		points: { x: number; y: number }[];
		color: string;
		dashed?: boolean;
	}
	let {
		points = [],
		lines = [],
		xLabel,
		yLabel,
		selectedId = '',
		onselect,
		empty = 'No design samples. Run a search to populate this chart.',
		xDomain,
		yDomain,
		cursorX
	}: {
		points?: PlotPoint[];
		lines?: PlotLine[];
		xLabel: string;
		yLabel: string;
		selectedId?: string;
		onselect?: (id: string) => void;
		empty?: string;
		xDomain?: [number, number];
		yDomain?: [number, number];
		cursorX?: number;
	} = $props();
	let hovered = $state<PlotPoint | null>(null);
	let width = $state(640);
	const height = 188,
		left = 63,
		right = 18,
		top = 25,
		bottom = 43;
	let values = $derived([...points, ...lines.flatMap((line) => line.points)]);
	function sizePlot(node: HTMLDivElement) {
		const resize = () => {
			width = Math.max(250, node.clientWidth);
		};
		const observer = new ResizeObserver(resize);
		observer.observe(node);
		resize();
		return () => observer.disconnect();
	}
	function domain(axis: 'x' | 'y', explicit?: [number, number]): [number, number] {
		if (explicit) return explicit;
		const data = values.map((p) => p[axis]).filter(Number.isFinite);
		if (!data.length) return [0, 1];
		const min = Math.min(...data),
			max = Math.max(...data),
			pad = (max - min || Math.max(Math.abs(max), 1)) * 0.09;
		return [min - pad, max + pad];
	}
	let xd = $derived(domain('x', xDomain)),
		yd = $derived(domain('y', yDomain));
	const sx = (v: number) => left + ((v - xd[0]) / (xd[1] - xd[0])) * (width - left - right);
	const sy = (v: number) =>
		height - bottom - ((v - yd[0]) / (yd[1] - yd[0])) * (height - top - bottom);
	const fmt = (v: number) =>
		v.toLocaleString('en-US', { maximumFractionDigits: Math.abs(v) >= 100 ? 1 : 2 });
	const uid = $props.id();
	let inspected = $derived(hovered ?? points.find((point) => point.id === selectedId) ?? null);
	function ticksFor(bounds: [number, number], count = 5) {
		const rough = (bounds[1] - bounds[0]) / (count - 1);
		const order = 10 ** Math.floor(Math.log10(rough));
		const step = [1, 2, 2.5, 5, 10].find((factor) => factor * order >= rough)! * order;
		const first = Math.ceil(bounds[0] / step) * step;
		return Array.from(
			{ length: Math.max(0, Math.floor((bounds[1] - first) / step + 1e-8) + 1) },
			(_, i) => Number((first + i * step).toPrecision(12))
		);
	}
	let xTicks = $derived(
		xDomain
			? Array.from(
					{ length: width < 350 ? 3 : 5 },
					(_, i) => xd[0] + ((xd[1] - xd[0]) * i) / (width < 350 ? 2 : 4)
				)
			: ticksFor(xd, width < 350 ? 4 : 6)
	);
	let yTicks = $derived(ticksFor(yd));
</script>

<div class="plot" {@attach sizePlot}>
	<svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${yLabel} versus ${xLabel}`}>
		<defs
			><clipPath id={uid}
				><rect
					x={left}
					y={top}
					width={width - left - right}
					height={height - top - bottom}
				/></clipPath
			></defs
		>
		{#each yTicks as tick (tick)}
			<line x1={left} y1={sy(tick)} x2={width - right} y2={sy(tick)} stroke="#ffffff12" />
			<text x={left - 10} y={sy(tick) + 4} text-anchor="end">{fmt(tick)}</text>
		{/each}
		{#each xTicks as tick (tick)}
			<line x1={sx(tick)} y1={top} x2={sx(tick)} y2={height - bottom} stroke="#ffffff08" />
			<text x={sx(tick)} y={height - bottom + 20} text-anchor="middle">{fmt(tick)}</text>
		{/each}
		<text class="axis-title" x={left} y={12}>{yLabel}</text>
		<text class="axis-title" x={width - right} y={height - 4} text-anchor="end">{xLabel}</text>
		<g clip-path={`url(#${uid})`}>
			{#each lines as line (line.id)}
				<path
					d={line.points.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x)},${sy(p.y)}`).join(' ')}
					fill="none"
					stroke={line.color}
					stroke-width="2"
					stroke-dasharray={line.dashed ? '5 5' : undefined}
				/>
			{/each}
			{#if cursorX !== undefined && cursorX >= xd[0] && cursorX <= xd[1]}<line
					x1={sx(cursorX)}
					x2={sx(cursorX)}
					y1={top}
					y2={height - bottom}
					stroke="#e0b578"
					stroke-dasharray="3 4"
				/>{/if}
			{#each points as point (point.id)}
				<circle
					cx={sx(point.x)}
					cy={sy(point.y)}
					r={point.id === selectedId ? 7 : point.pareto ? 4 : 2.5}
					fill={point.id === selectedId
						? '#a5c9ed'
						: point.pareto
							? '#73d2c7'
							: point.feasible
								? '#87a3b0'
								: '#816563'}
					fill-opacity={point.id === selectedId ? 1 : point.pareto ? 0.95 : 0.48}
					stroke={point.id === selectedId ? '#d7e7f7' : 'none'}
					stroke-width="2"
				/>
				<circle
					role="button"
					tabindex={point.pareto || point.id === selectedId ? 0 : -1}
					aria-label={`${point.label ?? `Design ${point.id}`}; ${xLabel}: ${fmt(point.x)}; ${yLabel}: ${fmt(point.y)}`}
					cx={sx(point.x)}
					cy={sy(point.y)}
					r="10"
					fill="transparent"
					onclick={() => onselect?.(point.id)}
					onkeydown={(e) => {
						if (e.key === 'Enter' || e.key === ' ') {
							e.preventDefault();
							onselect?.(point.id);
						}
					}}
					onpointerenter={() => (hovered = point)}
					onpointerleave={() => (hovered = null)}
					onfocus={() => (hovered = point)}
					onblur={() => (hovered = null)}
				/>
			{/each}
		</g>
		{#if !values.length}<text x={width / 2} y={height / 2} text-anchor="middle" class="empty"
				>{empty}</text
			>{/if}
	</svg>
	{#if points.length}
		<div class="point-inspector" aria-label="Chart point values">
			{#if inspected}
				<span class="point-label">{inspected.label ?? `Design ${inspected.id}`}</span>
				<dl>
					<div>
						<dt>{xLabel}</dt>
						<dd>{fmt(inspected.x)}</dd>
					</div>
					<div>
						<dt>{yLabel}</dt>
						<dd>{fmt(inspected.y)}</dd>
					</div>
				</dl>
			{:else}<span class="point-hint">Select or point to a design to inspect its values.</span>{/if}
		</div>
	{/if}
</div>

<style>
	.plot {
		width: 100%;
		min-width: 0;
	}
	svg {
		display: block;
		width: 100%;
		height: 188px;
		overflow: visible;
	}
	text {
		fill: #a2adba;
		font-size: 12px;
		font-variant-numeric: tabular-nums;
	}
	.axis-title {
		fill: #c5ced8;
		font-size: 12px;
	}
	.empty {
		fill: #82939e;
		font-family: inherit;
		font-size: 13px;
	}
	circle[role='button'] {
		cursor: pointer;
	}
	circle[role='button']:focus-visible {
		outline: none;
		stroke: #a5c9ed;
		stroke-width: 2px;
	}
	.point-inspector {
		min-height: 54px;
		border-top: 1px solid #ffffff17;
		margin: 4px 18px 0 12px;
		padding: 7px 0 0;
		font-size: 12px;
	}
	.point-label {
		color: #d3dce6;
		display: block;
		margin-bottom: 5px;
	}
	.point-hint {
		color: #9eabba;
	}
	dl {
		display: flex;
		flex-wrap: wrap;
		gap: 8px 24px;
		margin: 0;
	}
	dl > div {
		display: flex;
		gap: 8px;
		align-items: baseline;
	}
	dt {
		color: #a4b0bd;
	}
	dd {
		color: #e0e7ef;
		font-size: 13px;
		font-variant-numeric: tabular-nums;
		margin: 0;
	}
</style>
