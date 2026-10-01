import { chromium } from 'playwright';
const origin = process.argv[2] ?? 'http://127.0.0.1:4191';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
	const page = await browser.newPage();
	const errors = [];
	page.on('console', (m) => {
		if (m.type() === 'error' || m.type() === 'warning') console.error(m.type(), m.text());
		if (m.type() === 'error') errors.push(m.text());
	});
	page.on('pageerror', (e) => errors.push(e.message));
	await page.route('**/process-gpu-harness', (route) =>
		route.fulfill({
			contentType: 'text/html',
			body: '<!DOCTYPE html><title>Process WebGPU verification</title>'
		})
	);
	await page.goto(`${origin}/process-gpu-harness`);
	const result = await page.evaluate(async () => {
		const { verifyProcessWebGPU } = await import('/src/lib/scene/process-webgpu-verification.ts');
		return verifyProcessWebGPU();
	});
	if (errors.length) throw new Error(errors.join('\n'));
	console.log(JSON.stringify(result, null, 2));
} finally {
	await browser.close();
}
