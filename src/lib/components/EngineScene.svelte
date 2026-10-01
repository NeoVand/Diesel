<script lang="ts">
	import { requestEngineAssets } from '$lib/engine/local-assets';
	import { dev } from '$app/environment';
	import { EngineStudio, type SceneStats, type SceneSnapshot } from '$lib/scene/engine-studio';
	import type { ComponentRecord, LabCamera, LabState } from '$lib/engine/lab-state';

	interface Props {
		state: LabState;
		atlasLabelsVisible?: boolean;
		autoOrbit?: boolean;
		onselect: (id: string | null) => void;
		onisolate?: (id: string) => void;
		onready?: (stats: SceneStats) => void;
		onphase?: (phase: number) => void;
		oncomponents?: (registry: ComponentRecord[]) => void;
		oninteraction?: () => void;
	}
	let {
		state: labState,
		atlasLabelsVisible = false,
		autoOrbit = false,
		onselect,
		onready,
		onphase,
		oncomponents,
		oninteraction,
		onisolate
	}: Props = $props();
	let studio: EngineStudio | null = null;
	let progress = $state(0);
	let loading = $state(true);
	let error = $state('');

	export async function settle(signal?: AbortSignal): Promise<void> {
		if (!studio || loading) throw new Error('The engine studio is still loading.');
		await studio.settle(signal);
	}
	export function getSnapshot(): SceneSnapshot | null {
		return studio?.getSnapshot() ?? null;
	}
	export function restoreCamera(camera: LabCamera): void {
		studio?.restoreCamera(camera);
	}

	export function getSectionCoordinates(section: LabState['section']) {
		return studio?.getSectionCoordinates(section) ?? null;
	}

	export function createAtlasPreviewAsset(id: string) {
		return studio?.createAtlasPreviewAsset(id) ?? null;
	}

	export async function getAtlasPreviews(): Promise<Record<string, string>> {
		return studio?.getAtlasPreviews() ?? {};
	}
	export function focusAtlasCategory(id: string): boolean {
		return studio?.focusAtlasCategory(id) ?? false;
	}
	export function setAtlasLabelsVisible(visible: boolean): void {
		studio?.setAtlasLabelsVisible(visible);
	}

	function mountStudio(host: HTMLDivElement) {
		let active = true;
		try {
			const scene = new EngineStudio(
				host,
				(id) => onselect(id),
				(phase) => onphase?.(phase),
				() => oninteraction?.(),
				(id) => onisolate?.(id)
			);
			studio = scene;
			if (dev)
				Object.defineProperty(window, '__engineDiagnostics', {
					configurable: true,
					value: () => scene.getDiagnostics()
				});
			scene
				.load(
					(value) => {
						if (active) progress = value;
					},
					(registry) => {
						if (active) oncomponents?.(registry);
					}
				)
				.then((stats) => {
					if (!active) return;
					scene.update(labState);
					scene.setAtlasLabelsVisible(atlasLabelsVisible);
					scene.setAutoOrbit(autoOrbit);
					loading = false;
					onready?.(stats);
				})
				.catch((cause: unknown) => {
					if (!active) return;
					console.error('Engine studio load failed', cause);
					error =
						cause instanceof Error
							? cause.message
							: 'The engine could not be loaded. Refresh to try again.';
				});
		} catch (cause) {
			console.error('Engine studio initialization failed', cause);
			error =
				cause instanceof Error
					? cause.message
					: 'This browser could not start the WebGPU studio. Enable hardware acceleration and refresh.';
		}
		return () => {
			active = false;
			studio?.dispose();
			studio = null;
			if (dev) Reflect.deleteProperty(window, '__engineDiagnostics');
		};
	}
	function synchronizeStudio() {
		studio?.update(labState);
		studio?.setAtlasLabelsVisible(atlasLabelsVisible);
		studio?.setAutoOrbit(autoOrbit);
	}
</script>

<div class="engine-canvas" {@attach mountStudio} {@attach synchronizeStudio}></div>
{#if loading && !error}
	<div class="scene-loading" role="status" aria-live="polite">
		<span class="loading-mark"></span>
		<span class="loading-caption">Preparing the engineering studio</span>
		<div class="loading-track"><span style:width="{progress}%"></span></div>
		<span class="loading-progress">{progress}% · Actual V12 source geometry</span>
	</div>
{/if}
{#if error}
	<div class="scene-error" role="alert">
		<strong>3D studio unavailable</strong><button onclick={requestEngineAssets}
			>Open local engine files</button
		>
		<p>{error}</p>
	</div>
{/if}

<style>
	.engine-canvas {
		position: absolute;
		inset: var(--engine-canvas-top, 0px) var(--engine-canvas-right, 0px) 0 0;
		overflow: hidden;
		background: #0b0e12;
	}
	.engine-canvas :global(canvas) {
		display: block;
		width: 100%;
		height: 100%;
		cursor: grab;
	}
	.engine-canvas :global(canvas:active) {
		cursor: grabbing;
	}
	.scene-loading,
	.scene-error {
		position: absolute;
		z-index: 2;
		inset: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		background: #0b0e12;
		color: #bcc4cf;
	}
	.loading-mark {
		width: 34px;
		height: 34px;
		margin-bottom: 26px;
		border: 1px solid #26303d;
		border-top-color: #dbb16c;
		border-radius: 50%;
		animation: spin 1.3s linear infinite;
	}
	.loading-caption {
		font-size: 13px;
		letter-spacing: 0.01em;
	}
	.loading-track {
		width: 220px;
		height: 2px;
		background: #27303b;
		margin: 19px 0 11px;
		overflow: hidden;
	}
	.loading-track span {
		display: block;
		height: 100%;
		background: #dbb16c;
		transition: width 0.15s;
	}
	.loading-progress {
		font-size: 11px;
		color: #788392;
		letter-spacing: 0.02em;
	}
	.scene-error {
		padding: 30px;
		text-align: center;
	}
	.scene-error strong {
		font-size: 15px;
	}
	.scene-error p {
		max-width: 320px;
		color: #788392;
		font-size: 13px;
		line-height: 1.6;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.loading-mark {
			animation: none;
		}
		.loading-track span {
			transition: none;
		}
	}
</style>
