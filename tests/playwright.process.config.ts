import { defineConfig } from '@playwright/test';

// Assertions inspect development-only renderer diagnostics; production coverage lives in *.e2e.ts.
export default defineConfig({
	testDir: '.',
	testMatch: 'engine-process.browser.ts',
	workers: 1,
	use: {
		baseURL: 'http://127.0.0.1:5173',
		headless: true,
		channel: 'chrome',
		viewport: { width: 1440, height: 960 }
	},
	outputDir: '../test-results/process',
	reporter: 'list'
});
