import { expect, type Page } from '@playwright/test';
export const welcomeKey = 'diesel.welcome.v12.1';
export const placeholderKey = 'sk-test-local-placeholder-only';
export async function ready(page: Page) {
	await page.addInitScript((key) => localStorage.setItem(key, 'seen'), welcomeKey);
	await page.goto('/');
	await expect(page.getByRole('button', { name: 'Exterior', exact: true })).toBeEnabled({
		timeout: 90_000
	});
	await expect(page.locator('.scene-loading')).toHaveCount(0);
	await expect(page.locator('.engine-canvas canvas')).toBeVisible();
}
export async function connectPlaceholder(page: Page) {
	await page.getByRole('button', { name: 'AI connection settings', exact: true }).click();
	await page.getByText('Use my own API key', { exact: true }).click();
	await page.getByLabel('API key', { exact: true }).fill(placeholderKey);
	await page.getByRole('button', { name: 'Connect key', exact: true }).click();
}
export async function findPart(page: Page, id: string) {
	const search = page.getByRole('textbox', { name: 'Search parts', exact: true });
	if (!(await search.isVisible()))
		await page.getByRole('button', { name: 'Search components', exact: true }).click();
	await search.fill(id);
	await page.locator('.search-result').filter({ hasText: id }).click();
	await expect(page.locator('.component-search')).toHaveCount(0);
}
export function silentWav(seconds = 4): Buffer {
	const samples = 8000 * seconds,
		wav = Buffer.alloc(44 + samples * 2);
	wav.write('RIFF', 0);
	wav.writeUInt32LE(wav.length - 8, 4);
	wav.write('WAVEfmt ', 8);
	wav.writeUInt32LE(16, 16);
	wav.writeUInt16LE(1, 20);
	wav.writeUInt16LE(1, 22);
	wav.writeUInt32LE(8000, 24);
	wav.writeUInt32LE(16000, 28);
	wav.writeUInt16LE(2, 32);
	wav.writeUInt16LE(16, 34);
	wav.write('data', 36);
	wav.writeUInt32LE(samples * 2, 40);
	return wav;
}
