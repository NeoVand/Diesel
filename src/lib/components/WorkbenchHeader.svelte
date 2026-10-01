<script lang="ts">
	import type { Snippet } from 'svelte';
	import { resolve } from '$app/paths';
	import Icon from './Icon.svelte';
	type Workspace = 'explore' | 'design' | 'analyze';
	let {
		active,
		onworkspace,
		context,
		actions
	}: {
		active: Workspace;
		onworkspace?: (workspace: Workspace) => void;
		context?: string;
		actions?: Snippet;
	} = $props();
	const workspaces = [
		{ id: 'explore', label: 'Explore', path: '/' },
		{ id: 'design', label: 'Design', path: '/design' },
		{ id: 'analyze', label: 'Analyze', path: '/design?workspace=analyze' }
	] as const;
	function navigate(event: MouseEvent, workspace: Workspace) {
		if (
			!onworkspace ||
			event.button !== 0 ||
			event.metaKey ||
			event.ctrlKey ||
			event.shiftKey ||
			event.altKey
		)
			return;
		event.preventDefault();
		onworkspace(workspace);
	}
</script>

<header class="workbench-header">
	<a class="brand" href={resolve('/')} aria-label="Engine Lab home">
		<Icon name="engine" size={21} /><span>Engine Lab</span>
	</a>
	<nav aria-label="Workspaces">
		{#each workspaces as workspace (workspace.id)}
			<a
				href={resolve(workspace.path)}
				aria-current={active === workspace.id ? 'page' : undefined}
				onclick={(event) => navigate(event, workspace.id)}>{workspace.label}</a
			>
		{/each}
	</nav>
	{#if context}<span class="context" title={context}>{context}</span>{/if}
	{#if actions}<div class="actions">{@render actions()}</div>{/if}
</header>

<style>
	.workbench-header {
		height: 50px;
		min-height: 50px;
		display: flex;
		align-items: center;
		gap: 24px;
		padding: 0 18px;
		border-bottom: 1px solid #ffffff16;
		background: #14171c;
		color: #dce1e7;
		position: relative;
		z-index: 15;
		font-size: 13px;
	}
	.brand {
		display: inline-flex;
		align-items: center;
		gap: 9px;
		font-size: 14px;
		font-weight: 600;
		text-decoration: none;
		white-space: nowrap;
		color: #edf0f4;
	}
	.brand :global(svg) {
		color: #aeb9c7;
	}
	nav {
		display: flex;
		align-self: stretch;
		gap: 4px;
	}
	nav a {
		display: flex;
		align-items: center;
		padding: 0 14px;
		border-bottom: 2px solid transparent;
		color: #aeb8c4;
		text-decoration: none;
		font-weight: 500;
	}
	nav a:hover {
		background: #ffffff05;
		color: #f0f2f5;
	}
	nav a[aria-current='page'] {
		color: #f0f2f5;
		border-bottom-color: #86ade0;
		background: #ffffff04;
	}
	.context {
		color: #9ba7b5;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: 12px;
	}
	.actions {
		margin-left: auto;
		display: flex;
		align-items: center;
		gap: 5px;
		flex-shrink: 0;
	}
	.actions :global(button),
	.actions :global(a),
	.actions :global(summary) {
		font-size: 12px;
	}
	a:focus-visible {
		outline: 2px solid #86ade0;
		outline-offset: -3px;
	}
	@media (max-width: 1050px) {
		.context {
			display: none;
		}
		.workbench-header {
			gap: 18px;
		}
	}
	@media (max-width: 760px) {
		.workbench-header {
			padding: 0 10px;
			gap: 9px;
		}
		.brand {
			gap: 0;
		}
		.brand span {
			display: none;
		}
		nav {
			gap: 0;
		}
		nav a {
			padding: 0 10px;
			font-size: 12px;
		}
		.actions {
			gap: 1px;
		}
	}
</style>
