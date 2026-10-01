import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const port = Number(process.env.STATIC_TEST_PORT ?? 4198);
const origin = `http://127.0.0.1:${port}`;

/** Exercises the shipped files against a server that cannot execute application APIs. */
export default defineConfig({
	testDir: '.',
	testMatch: 'browser-static.e2e.ts',
	outputDir: '../test-results/browser-static',
	workers: 1,
	timeout: 90_000,
	expect: { timeout: 15_000 },
	retries: 0,
	use: {
		baseURL: origin,
		channel: 'chrome',
		// CI has no physical GPU. Exercise the actual WebGPU API with Chromium's
		// software adapter only in this test runner; application capability checks stay strict.
		launchOptions:
			process.env.CI && process.platform === 'linux'
				? {
						args: [
							'--enable-unsafe-webgpu',
							'--enable-features=Vulkan',
							'--use-angle=vulkan',
							'--use-vulkan=swiftshader',
							'--use-webgpu-adapter=swiftshader',
							'--disable-vulkan-surface'
						]
					}
				: {},
		headless: true,
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
