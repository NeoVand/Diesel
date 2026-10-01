import { defineConfig } from '@playwright/test';

export default defineConfig({
	use: { baseURL: 'http://127.0.0.1:4183', headless: true, channel: 'chrome' },
	webServer: {
		command: 'pnpm build && pnpm preview --host 127.0.0.1 --port 4183',
		url: 'http://127.0.0.1:4183',
		reuseExistingServer: !process.env.CI,
		timeout: 600_000
	},
	testMatch: '**/*.e2e.{ts,js}',
	workers: 1
});
