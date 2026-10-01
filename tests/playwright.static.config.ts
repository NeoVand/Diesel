import { defineConfig, type LaunchOptions } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const port = Number(process.env.STATIC_TEST_PORT ?? 4198);
const origin = `http://127.0.0.1:${port}`;
// Selected by the standalone compute+compositor probe before CI builds the app.
// Local runs continue using the user's normal hardware Chrome adapter.
const selected: LaunchOptions | undefined =
	process.env.CI && process.platform === 'linux'
		? (
				JSON.parse(
					readFileSync(new URL('../test-results/ci-webgpu/selected.json', import.meta.url), 'utf8')
				) as { launch: LaunchOptions }
			).launch
		: undefined;

/** Exercises the shipped files against a server that cannot execute application APIs. */
export default defineConfig({
	testDir: '.',
	testMatch: 'browser-static.e2e.ts',
	outputDir: '../test-results/browser-static',
	globalSetup: './webgpu-ci-setup.ts',
	workers: 1,
	timeout: 90_000,
	expect: { timeout: 15_000 },
	retries: 0,
	use: {
		baseURL: origin,
		channel: selected ? selected.channel : 'chrome',
		launchOptions: selected ?? {},
		headless: selected?.headless ?? true,
		viewport: { width: 1440, height: 1000 },
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure'
	},
	webServer: {
		command: `pnpm build && node scripts/serve-static.mjs --port ${port}`,
		cwd: fileURLToPath(new URL('..', import.meta.url)),
		url: `${origin}/design/`,
		reuseExistingServer: !process.env.CI,
		timeout: 180_000
	}
});
