import type { LabState } from '../engine/lab-state';

/** Keep the actual source passage visible behind its tracer when inspecting the bare mechanism. */
export function processContextOpacity(
	role: string,
	state: LabState,
	componentId?: string
): number | null {
	if (
		state.display !== 'mechanism' ||
		state.isolated ||
		state.explosion > 0 ||
		state.hidden.length > 0 ||
		state.removed.length > 0
	)
		return null;
	if (role === 'intake' && state.flows.includes('air')) return 0.24;
	if (role === 'exhaust' && state.flows.includes('exhaust')) return 0.28;
	if (
		role === 'fuel' &&
		state.flows.includes('fuel') &&
		(componentId === 'v12-0775' || componentId === 'v12-0776')
	)
		return 0.2;
	if (role === 'turbo' && (state.flows.includes('air') || state.flows.includes('exhaust')))
		return 0.16;
	return null;
}
