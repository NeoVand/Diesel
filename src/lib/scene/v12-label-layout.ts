export type LabelCandidate = {
	id: number;
	x: number;
	y: number;
	width: number;
	height: number;
	priority: number;
};
/** Screen-space label LOD: keep readable type sizes and suppress collisions instead of shrinking text. */
export function visibleAtlasLabels(
	candidates: readonly LabelCandidate[],
	viewport: { width: number; height: number; top: number; bottom: number }
): Set<number> {
	const accepted: LabelCandidate[] = [];
	for (const candidate of [...candidates].sort((a, b) => b.priority - a.priority || a.id - b.id)) {
		if (
			candidate.x < 8 ||
			candidate.x + candidate.width > viewport.width - 8 ||
			candidate.y < viewport.top ||
			candidate.y + candidate.height > viewport.height - viewport.bottom
		)
			continue;
		if (
			accepted.some(
				(other) =>
					candidate.x < other.x + other.width + 8 &&
					candidate.x + candidate.width + 8 > other.x &&
					candidate.y < other.y + other.height + 8 &&
					candidate.y + candidate.height + 8 > other.y
			)
		)
			continue;
		accepted.push(candidate);
	}
	return new Set(accepted.map((candidate) => candidate.id));
}
