import { describe, expect, it } from 'vitest';
import { initialLabState } from '../engine/lab-state';
import { processContextOpacity } from './v12-process-context';

describe('mechanism process context', () => {
	const state = {
		...initialLabState,
		display: 'mechanism' as const,
		flows: ['air', 'exhaust'] as ('air' | 'exhaust')[]
	};
	it('retains actual passages only for the enabled process', () => {
		expect(processContextOpacity('intake', state)).toBeGreaterThan(0);
		expect(processContextOpacity('exhaust', state)).toBeLessThan(1);
		expect(processContextOpacity('block', state)).toBeNull();
		expect(processContextOpacity('intake', { ...state, flows: ['exhaust'] })).toBeNull();
	});
	it('never overrides isolation, hidden parts, disassembly or exterior material choices', () => {
		for (const change of [
			{ isolated: true },
			{ hidden: ['air'] },
			{ removed: ['v12-0777'] },
			{ explosion: 0.2 },
			{ display: 'assembly' as const }
		])
			expect(processContextOpacity('intake', { ...state, ...change })).toBeNull();
	});
});
