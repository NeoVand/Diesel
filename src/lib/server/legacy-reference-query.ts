/** Archived reference query, retained only for historical calculation verification. */
import { calculateOperatingPoint } from '$lib/engine/simulation';
import type { OperatingPoint } from '$lib/engine/types';
/** Archived reference helper retained for historical tests; never included in active V12 inference. */
export function requestedOperatingPoints(message: string): OperatingPoint[] {
	const loads = new Set<number>();
	const percentages = /(?<![\w.])([+-]?\d{1,3}(?:\.\d+)?)\s*(?:%|percent\b|per\s+cent\b|pct\b)/giu;
	for (const match of message.matchAll(percentages)) {
		const load = Number(match[1]);
		const preceding = message.slice(0, match.index);
		if (/(?:-|−)\s*$/.test(preceding) || !Number.isFinite(load) || load < 10 || load > 100)
			continue;
		loads.add(load);
		if (loads.size === 6) break;
	}
	return [...loads].map(calculateOperatingPoint);
}
