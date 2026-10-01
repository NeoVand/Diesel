import type { Page } from '@playwright/test';

/** Compare downsampled compositor images so one anti-aliased edge cannot dominate a transition. */
export async function renderedDifference(page: Page, first: Buffer, second: Buffer) {
	return page.evaluate(
		async ([first, second]) => {
			async function pixels(base64: string) {
				const image = new Image();
				image.src = `data:image/png;base64,${base64}`;
				await image.decode();
				const buffer = document.createElement('canvas');
				buffer.width = 320;
				buffer.height = Math.max(1, Math.round((320 * image.height) / image.width));
				const context = buffer.getContext('2d')!;
				context.drawImage(image, 0, 0, buffer.width, buffer.height);
				return context.getImageData(0, 0, buffer.width, buffer.height).data;
			}
			const [a, b] = await Promise.all([pixels(first), pixels(second)]);
			let changed = 0,
				sum = 0;
			for (let index = 0; index < a.length; index += 4) {
				const delta =
					Math.abs(a[index] - b[index]) +
					Math.abs(a[index + 1] - b[index + 1]) +
					Math.abs(a[index + 2] - b[index + 2]);
				sum += delta;
				if (delta > 24) changed++;
			}
			return { changedFraction: changed / (a.length / 4), mean: sum / ((a.length / 4) * 3) };
		},
		[first.toString('base64'), second.toString('base64')]
	);
}
