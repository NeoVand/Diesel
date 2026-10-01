import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { chromium, type FullConfig, type LaunchOptions } from '@playwright/test';

/** Run before the suite too, so a broken environment cannot become skipped coverage. */
export default async function verifyCIWebGPU(config: FullConfig) {
	if (!process.env.CI || process.platform !== 'linux') return;
	const use = config.projects[0].use;
	await probeWebGPU(
		{ ...use.launchOptions, channel: use.channel, headless: use.headless },
		use.baseURL!,
		resolve(config.projects[0].outputDir, 'webgpu-preflight')
	);
}

/** Requires correct GPU buffer values AND a visible compositor image. */
async function probeWebGPU(launch: LaunchOptions, origin: string, directory: string) {
	await mkdir(directory, { recursive: true });
	const browser = await chromium.launch({ ...launch, timeout: 15_000 });
	const page = await browser.newPage({ viewport: { width: 128, height: 128 } });
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	page.on('console', (message) => {
		if (message.type() === 'error') errors.push(message.text());
	});
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		await page.route('**/webgpu-ci-probe', (route) =>
			route.fulfill({
				contentType: 'text/html',
				body: '<!doctype html><link rel="icon" href="data:,"><body style="margin:0;background:black"><canvas width="64" height="64"></canvas></body>'
			})
		);
		await page.goto(`${origin}/webgpu-ci-probe`);
		const proof = await Promise.race([
			page.evaluate(async () => {
				const adapter = await navigator.gpu.requestAdapter();
				if (!adapter) throw new Error('CI WebGPU adapter unavailable');
				const device = await adapter.requestDevice();
				const validationErrors: string[] = [];
				const deviceLosses: string[] = [];
				(globalThis as unknown as { ciGPUHealth: unknown }).ciGPUHealth = {
					validationErrors,
					deviceLosses
				};
				device.addEventListener('uncapturederror', (event) =>
					validationErrors.push((event as GPUUncapturedErrorEvent).error.message)
				);
				const lost = device.lost.then((info): never => {
					const message = `CI WebGPU device lost: ${info.reason}: ${info.message}`;
					deviceLosses.push(message);
					throw new Error(message);
				});
				const work = async () => {
					const canvas = document.querySelector('canvas')!;
					const context = canvas.getContext('webgpu') as unknown as GPUCanvasContext;
					const { GPUBufferUsage, GPUMapMode } = globalThis as unknown as {
						GPUBufferUsage: {
							STORAGE: number;
							COPY_SRC: number;
							COPY_DST: number;
							MAP_READ: number;
						};
						GPUMapMode: { READ: number };
					};
					const format = navigator.gpu.getPreferredCanvasFormat();
					context.configure({ device, format, alphaMode: 'opaque' });
					const values = device.createBuffer({
						size: 64,
						usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
					});
					const readback = device.createBuffer({
						size: 64,
						usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
					});
					const module = device.createShaderModule({
						code: `
@group(0) @binding(0) var<storage, read_write> values: array<u32>;
@compute @workgroup_size(16) fn main(@builtin(global_invocation_id) id: vec3u) {
  values[id.x] = id.x * 3u + 7u;
}`
					});
					const pipeline = await device.createComputePipelineAsync({
						layout: 'auto',
						compute: { module, entryPoint: 'main' }
					});
					const encoder = device.createCommandEncoder();
					const compute = encoder.beginComputePass();
					compute.setPipeline(pipeline);
					compute.setBindGroup(
						0,
						device.createBindGroup({
							layout: pipeline.getBindGroupLayout(0),
							entries: [{ binding: 0, resource: { buffer: values } }]
						})
					);
					compute.dispatchWorkgroups(1);
					compute.end();
					encoder.copyBufferToBuffer(values, 0, readback, 0, 64);
					const render = encoder.beginRenderPass({
						colorAttachments: [
							{
								view: context.getCurrentTexture().createView(),
								loadOp: 'clear',
								storeOp: 'store',
								clearValue: { r: 0.08, g: 0.3, b: 0.7, a: 1 }
							}
						]
					});
					render.end();
					device.queue.submit([encoder.finish()]);
					await readback.mapAsync(GPUMapMode.READ);
					const results = Array.from(new Uint32Array(readback.getMappedRange()));
					if (results.some((value, index) => value !== index * 3 + 7))
						throw new Error('CI WebGPU compute returned incorrect values');
					await device.queue.onSubmittedWorkDone();
					await new Promise<void>((resolve) =>
						requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
					);
					if (validationErrors.length) throw new Error(validationErrors.join('\n'));
					readback.unmap();
					values.destroy();
					readback.destroy();
					return {
						adapter: { vendor: adapter.info.vendor, architecture: adapter.info.architecture },
						format,
						compute: results,
						validationErrors
					};
				};
				return Promise.race([work(), lost]);
			}),
			new Promise<never>((_, reject) => {
				timer = setTimeout(
					() => reject(new Error('CI WebGPU presentation/compute preflight exceeded 30 seconds')),
					30_000
				);
			})
		]);
		// Read the actual compositor image. Reading the source canvas after presentation
		// can observe a discarded drawing buffer instead of the frame the user sees.
		const screenshot = await page.screenshot({
			path: resolve(directory, 'presented-canvas.png'),
			timeout: 10_000
		});
		const pixel = await page.evaluate(async (base64) => {
			const image = new Image();
			image.src = `data:image/png;base64,${base64}`;
			await image.decode();
			const canvas = document.createElement('canvas');
			canvas.width = image.width;
			canvas.height = image.height;
			const context = canvas.getContext('2d')!;
			context.drawImage(image, 0, 0);
			const health = (
				globalThis as unknown as {
					ciGPUHealth: { validationErrors: string[]; deviceLosses: string[] };
				}
			).ciGPUHealth;
			if (health.validationErrors.length || health.deviceLosses.length)
				throw new Error([...health.validationErrors, ...health.deviceLosses].join('\n'));
			return Array.from(context.getImageData(32, 32, 1, 1).data);
		}, screenshot.toString('base64'));
		if (!(pixel[2] > pixel[1] && pixel[1] > pixel[0] && pixel[0] > 10 && pixel[3] === 255))
			throw new Error(`CI WebGPU canvas presentation failed: ${pixel}`);
		if (errors.length) throw new Error(errors.join('\n'));
		const evidence = { ...proof, pixel, launchOptions: launch };
		await writeFile(resolve(directory, 'adapter.json'), JSON.stringify(evidence, null, 2));
		console.log('CI software WebGPU preflight:', JSON.stringify(evidence));
		return evidence;
	} catch (error) {
		await writeFile(
			resolve(directory, 'failure.json'),
			JSON.stringify({ message: String(error), errors }, null, 2)
		);
		throw error;
	} finally {
		clearTimeout(timer);
		await browser.close();
	}
}

/**
 * A CI driver selection, never an application fallback. Chromium's stable and
 * bundled revisions can differ in Linux shared-image / SwiftShader interop.
 * Every accepted configuration still uses WebGPU for both compute and drawing.
 * SwANGLE: chromium/src/docs/gpu/swiftshader.md; VulkanFromANGLE: Kitware's
 * documented Linux WebGPU launch configuration. Headed cases require Xvfb.
 */
async function selectCIWebGPU() {
	if (!process.env.CI || process.platform !== 'linux')
		throw new Error('The software GPU selector is only for Linux CI');
	const directory = resolve('test-results/ci-webgpu');
	await mkdir(directory, { recursive: true });
	const swangle = [
		'--enable-unsafe-webgpu',
		'--use-webgpu-adapter=swiftshader',
		'--use-gl=angle',
		'--use-angle=swiftshader',
		'--enable-unsafe-swiftshader'
	];
	const vulkan = [...swangle, '--enable-features=Vulkan,VulkanFromANGLE'];
	const candidates: { name: string; launch: LaunchOptions }[] = [
		{ name: 'bundled-headless-shell-swangle', launch: { headless: true, args: swangle } },
		{
			name: 'bundled-chromium-swangle',
			launch: { channel: 'chromium', headless: true, args: swangle }
		},
		{ name: 'bundled-headless-shell-vulkan', launch: { headless: true, args: vulkan } },
		{
			name: 'bundled-chromium-vulkan',
			launch: { channel: 'chromium', headless: true, args: vulkan }
		},
		...(process.env.DISPLAY
			? [
					{
						name: 'bundled-chromium-headed-swangle',
						launch: { channel: 'chromium', headless: false, args: swangle }
					},
					{
						name: 'chrome-headed-swangle',
						launch: { channel: 'chrome', headless: false, args: swangle }
					}
				]
			: [])
	];
	// Independent of building or starting the application. This is a secure local
	// origin and a 64px canvas, so a failed driver is found before expensive checks.
	const server = createServer((_request, response) => {
		response.writeHead(200, { 'Content-Type': 'text/html' });
		response.end('<!doctype html><link rel="icon" href="data:,">');
	});
	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
	const address = server.address();
	if (!address || typeof address === 'string') throw new Error('Probe server address unavailable');
	const origin = `http://127.0.0.1:${address.port}`;
	const attempts: { name: string; launch: LaunchOptions; success: boolean; error?: string }[] = [];
	try {
		for (const candidate of candidates) {
			console.log(`Testing CI WebGPU driver: ${candidate.name}`);
			try {
				const proof = await probeWebGPU(
					candidate.launch,
					origin,
					resolve(directory, candidate.name)
				);
				attempts.push({ ...candidate, success: true });
				await writeFile(
					resolve(directory, 'selected.json'),
					JSON.stringify({ ...candidate, proof }, null, 2)
				);
				await writeFile(resolve(directory, 'attempts.json'), JSON.stringify(attempts, null, 2));
				console.log(`Selected CI software WebGPU driver: ${candidate.name}`);
				return;
			} catch (error) {
				attempts.push({ ...candidate, success: false, error: String(error) });
				console.error(`${candidate.name}: ${String(error)}`);
				await writeFile(resolve(directory, 'attempts.json'), JSON.stringify(attempts, null, 2));
			}
		}
		throw new Error(
			'No CI WebGPU configuration passed compute and canvas presentation; see test-results/ci-webgpu/attempts.json'
		);
	} finally {
		await new Promise<void>((resolve, reject) =>
			server.close((error) => (error ? reject(error) : resolve()))
		);
	}
}

if (process.argv.includes('--select')) await selectCIWebGPU();
