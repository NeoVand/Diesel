<script lang="ts">
	let {
		label,
		value,
		min,
		max,
		step = 1,
		unit = 'mm',
		note = '',
		disabled = false,
		onchange
	}: {
		label: string;
		value: number;
		min: number;
		max: number;
		step?: number;
		unit?: string;
		note?: string;
		disabled?: boolean;
		onchange: (value: number) => void;
	} = $props();
	const id = $props.id();
	let percent = $derived(Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100)));
	function commit(raw: string) {
		const parsed = Number(raw);
		if (!raw.trim() || !Number.isFinite(parsed)) return value;
		const next = Math.max(min, Math.min(max, parsed));
		onchange(next);
		return next;
	}
</script>

<div class="parameter" class:disabled>
	<div class="parameter-heading">
		<label for={`${id}-number`}>{label}</label>
		<div class="numeric">
			<input
				id={`${id}-number`}
				aria-label={`${label} value`}
				aria-describedby={note ? `${id}-note` : undefined}
				type="number"
				{min}
				{max}
				{step}
				{disabled}
				value={Number(value.toFixed(3))}
				onchange={(e) => {
					const accepted = commit(e.currentTarget.value);
					e.currentTarget.value = String(Number(accepted.toFixed(3)));
				}}
			/><span>{unit}</span>
		</div>
	</div>
	<input
		id={`${id}-range`}
		aria-label={label}
		type="range"
		{min}
		{max}
		{step}
		{disabled}
		{value}
		style:--fill={`${percent}%`}
		oninput={(e) => commit(e.currentTarget.value)}
	/>
	{#if note}<p id={`${id}-note`}>{note}</p>{/if}
</div>

<style>
	.parameter {
		margin: 0 0 8px;
	}
	.parameter-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		margin-bottom: 1px;
	}
	label {
		color: #cbd1d8;
		font-size: 13px;
		line-height: 1.35;
	}
	.numeric {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		color: #a7b0bc;
		gap: 6px;
		font-variant-numeric: tabular-nums;
		font-size: 12px;
		flex-shrink: 0;
	}
	.numeric span {
		min-width: 19px;
	}
	input[type='number'] {
		width: 66px;
		height: 26px;
		box-sizing: border-box;
		padding: 3px 6px;
		text-align: right;
		color: #edf1f5;
		border: 1px solid #ffffff23;
		border-radius: 3px;
		background: #202833;
		font-variant-numeric: tabular-nums;
		font-size: 13px;
		appearance: textfield;
	}
	input[type='number']:hover {
		border-color: #ffffff45;
	}
	input:focus-visible {
		outline: 2px solid var(--accent, #82b3e8);
		outline-offset: 2px;
	}
	input::-webkit-outer-spin-button,
	input::-webkit-inner-spin-button {
		-webkit-appearance: none;
		margin: 0;
	}
	input[type='range'] {
		display: block;
		width: 100%;
		height: 12px;
		margin: 0;
		padding: 0;
		appearance: none;
		background: transparent;
		cursor: ew-resize;
	}
	input[type='range']::-webkit-slider-runnable-track {
		height: 2px;
		border-radius: 0;
		background: linear-gradient(to right, #8e9da9 0 var(--fill), #ffffff1b var(--fill) 100%);
	}
	input[type='range']::-webkit-slider-thumb {
		appearance: none;
		width: 9px;
		height: 9px;
		margin-top: -3.5px;
		background: #bec8d1;
		border: 1px solid #20262d;
		border-radius: 1px;
	}
	input[type='range']::-moz-range-track {
		height: 2px;
		background: #ffffff1b;
	}
	input[type='range']::-moz-range-progress {
		height: 2px;
		background: #8e9da9;
	}
	input[type='range']::-moz-range-thumb {
		width: 8px;
		height: 8px;
		background: #bec8d1;
		border: 1px solid #20262d;
		border-radius: 1px;
	}
	p {
		margin: 3px 0 0;
		font-size: 12px;
		line-height: 1.45;
		color: #a0aab5;
	}
	.disabled {
		opacity: 0.5;
	}
	@media (max-width: 760px) {
		input[type='number'] {
			height: 32px;
			font-size: 16px;
		}
		input[type='range'] {
			height: 18px;
		}
	}
</style>
