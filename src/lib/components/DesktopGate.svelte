<script lang="ts">
	import { onMount, type Snippet } from 'svelte';
	import { asset } from '$app/paths';
	let { children }: { children: Snippet } = $props();
	let ready = $state(false);
	let phone = $state(false);
	let webgpu = $state(false);
	let deviceLost = $state(false);
	onMount(() => {
		const narrow = matchMedia('(max-width: 700px), (max-width: 1100px) and (pointer: coarse)');
		const update = () => {
			phone = narrow.matches;
			webgpu = 'gpu' in navigator;
			ready = true;
		};
		update();
		const lost = () => {
			deviceLost = true;
		};
		window.addEventListener('engine-lab:webgpu-device-lost', lost);
		narrow.addEventListener('change', update);
		return () => {
			narrow.removeEventListener('change', update);
			window.removeEventListener('engine-lab:webgpu-device-lost', lost);
		};
	});
</script>

{#if ready && !phone && webgpu && !deviceLost}
	{@render children()}
{:else if ready}
	<main class="desktop-gate">
		<header><span class="mark">EL</span><span>Engine Lab</span></header>
		<div class="preview">
			<img
				src={asset('/engine-preview.png')}
				alt="Engine Lab desktop workspace showing the complete V12 diesel engine and its inspection tools"
			/>
		</div>
		<section>
			<p class="eyebrow">DESKTOP ENGINEERING WORKSPACE</p>
			<h1>
				{phone
					? 'Explore it on your desktop.'
					: deviceLost
						? 'The graphics device was interrupted.'
						: 'A WebGPU desktop browser is required.'}
			</h1>
			<p>
				Inspect a working V12 diesel mechanism and run parametric design studies and engineering
				calculations in your browser.
			</p>
			<p>
				{phone
					? 'Please visit on a desktop computer to use the full workspace and take advantage of WebGPU.'
					: deviceLost
						? 'Reload to reconnect to WebGPU. If this continues, close other graphics-heavy tabs and check that hardware acceleration is enabled.'
						: 'Open this site in a current desktop browser with WebGPU and hardware acceleration enabled.'}
			</p>
			{#if deviceLost && !phone}
				<button onclick={() => window.location.reload()}>Reload workspace</button>
			{/if}
			<a href="https://github.com/NeoVand/Diesel" target="_blank" rel="noreferrer"
				>Project and setup guide <span aria-hidden="true">↗</span></a
			>
		</section>
	</main>
{:else}
	<div class="boot" role="status">Opening Engine Lab…</div>
{/if}

<style>
	.desktop-gate {
		min-height: 100dvh;
		background: #10151b;
		color: #e6eaf0;
		padding: max(24px, env(safe-area-inset-top)) 22px 42px;
		font-family: Inter, system-ui, sans-serif;
	}
	header {
		display: flex;
		align-items: center;
		gap: 10px;
		font-size: 17px;
		font-weight: 550;
		max-width: 900px;
		margin: 0 auto 32px;
	}
	.mark {
		font-size: 12px;
		letter-spacing: 0.05em;
		color: #adc5e3;
		border: 1px solid #3c4b5d;
		padding: 8px 6px;
		border-radius: 6px;
	}
	.preview {
		max-width: 900px;
		margin: auto;
		border: 1px solid #35404d;
		border-radius: 10px;
		overflow: hidden;
		box-shadow: 0 16px 50px #0004;
	}
	img {
		display: block;
		width: 100%;
		height: auto;
	}
	section {
		max-width: 650px;
		margin: 32px auto 0;
	}
	.eyebrow {
		color: #8ca0b8;
		font-size: 10px;
		letter-spacing: 0.1em;
		margin-bottom: 12px;
	}
	h1 {
		font-size: clamp(25px, 4vw, 36px);
		letter-spacing: -0.025em;
		line-height: 1.2;
		font-weight: 550;
		margin: 0 0 18px;
	}
	p {
		color: #adbacb;
		font-size: 15px;
		line-height: 1.65;
		margin: 0 0 14px;
	}
	a {
		display: inline-block;
		margin-top: 10px;
		color: #b7d4f6;
		font-size: 14px;
		text-decoration: none;
	}
	a:hover {
		text-decoration: underline;
	}
	button {
		display: block;
		padding: 10px 14px;
		border: 1px solid #526881;
		border-radius: 6px;
		background: #27394d;
		color: #e6eaf0;
		font: inherit;
		cursor: pointer;
		margin: 16px 0;
	}
	.boot {
		min-height: 100dvh;
		display: grid;
		place-items: center;
		background: #10151b;
		color: #a7b6c8;
		font:
			14px Inter,
			sans-serif;
	}
</style>
