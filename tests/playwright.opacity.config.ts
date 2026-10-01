import { defineConfig } from '@playwright/test';

// Opacity diagnostics are intentionally development-only. Run alongside the local dev server.
export default defineConfig({
	testDir: '.',
	testMatch: 'engine-opacity.browser.ts',
	workers: 1,
	use: { baseURL: 'http://127.0.0.1:5173', headless: true, channel: 'chrome' },
	outputDir: '../test-results/opacity',
	reporter: 'list'
});
