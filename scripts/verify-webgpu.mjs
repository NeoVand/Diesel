/** Reproducible browser-only numerical check. Starts its own Vite harness unless --origin is given. */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const origin = option('--origin') ?? 'http://127.0.0.1:4195';
const output = option('--output');
let server, browser;

try {
	if (!option('--origin')) {
		server = spawn(
			'pnpm',
			['exec', 'vite', '--host', '127.0.0.1', '--port', '4195', '--strictPort'],
			{ cwd: root, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] }
		);
		let log = '';
		server.stdout.on('data', (data) => {
			log += data;
		});
		server.stderr.on('data', (data) => {
			log += data;
		});
		const deadline = Date.now() + 60_000;
		while (true) {
			if (server.exitCode !== null) throw new Error(`Verification server exited: ${log}`);
			try {
				await fetch(origin);
				break;
			} catch {
				/* startup */
			}
			if (Date.now() > deadline) throw new Error(`Verification server timed out: ${log}`);
			await new Promise((r) => setTimeout(r, 100));
		}
	}
	browser = await chromium.launch({ channel: 'chrome', headless: true });
	const page = await browser.newPage();
	const unexpectedRequests = [];
	page.on('request', (request) => {
		const url = new URL(request.url());
		if (url.origin !== origin || url.pathname.startsWith('/api/'))
			unexpectedRequests.push(request.url());
	});
	await page.route('**/gpu-verification-harness', (route) =>
		route.fulfill({
			contentType: 'text/html',
			body: '<!DOCTYPE html><title>Browser numerical verification</title>'
		})
	);
	await page.goto(`${origin}/gpu-verification-harness`);
	const report = await page.evaluate(async () => {
		const { DEFAULT_DESIGN_PARAMS } = await import('/src/lib/design/design-core.ts');
		const { DEFAULT_OPERATING_SCENARIO, operatingScenarioPresets } =
			await import('/src/lib/design/operating-cycle.ts');
		const { searchOperatingDesignsBrowser, operatingSummaryError } =
			await import('/src/lib/design/gpu-operating-search.ts');
		const { createSavedStudy, validateSavedStudy } =
			await import('/src/lib/design/study-storage.ts');
		const cases = [
			{
				name: 'reference',
				params: { ...DEFAULT_DESIGN_PARAMS },
				scenarios: operatingScenarioPresets({ ...DEFAULT_OPERATING_SCENARIO })
			},
			{
				name: 'maximum-bore-and-speed',
				params: {
					...DEFAULT_DESIGN_PARAMS,
					boreMm: 105,
					strokeMm: 125,
					rodLengthMm: 160,
					rpm: 3600
				},
				scenarios: operatingScenarioPresets({
					...DEFAULT_OPERATING_SCENARIO,
					rpm: 3600,
					pistonMassKg: 5,
					combustionRiseBar: 100
				})
			},
			{
				name: 'short-rod-no-speed',
				params: { ...DEFAULT_DESIGN_PARAMS, boreMm: 70, strokeMm: 75, rodLengthMm: 110 },
				scenarios: [
					{ ...DEFAULT_OPERATING_SCENARIO, rpm: 0, pistonMassKg: 0, combustionRiseBar: 0 }
				]
			}
		];
		const checks = [];
		for (const c of cases) {
			const gpu = await searchOperatingDesignsBrowser(
				c.params,
				c.scenarios,
				undefined,
				undefined,
				'webgpu'
			);
			if (gpu.computation.backend !== 'webgpu')
				throw new Error(`No WebGPU: ${gpu.computation.fallbackReason}`);
			const cpu = await searchOperatingDesignsBrowser(
				c.params,
				c.scenarios,
				undefined,
				undefined,
				'cpu'
			);
			const error = Math.max(
				...gpu.candidates.map((candidate, i) => operatingSummaryError(candidate, cpu.candidates[i]))
			);
			const passesAgree = gpu.candidates.every(
				(candidate, i) => candidate.passesNominalScreen === cpu.candidates[i].passesNominalScreen
			);
			const finalistsAgree = JSON.stringify(gpu.finalists) === JSON.stringify(cpu.finalists);
			if (error > gpu.computation.relativeTolerance || !passesAgree || !finalistsAgree)
				throw new Error(`Reference mismatch in ${c.name}: ${error}`);
			checks.push({
				name: c.name,
				gpu: gpu.computation,
				cpu: cpu.computation,
				maximumAllCandidateRelativeError: error,
				passesAgree,
				finalistsAgree,
				best: gpu.best?.id ?? null
			});
			if (c.name === 'reference') {
				const snapshot = {
					version: 1,
					params: c.params,
					baseline: c.params,
					scenario: c.scenarios[1],
					phase: 0,
					study: 'rod',
					tab: 'operating',
					volumeLocked: false,
					lockedVolume: 6.8094,
					structural: null,
					structuralContext: null,
					experiments: [],
					operatingSearch: gpu,
					search: null
				};
				const saved = await createSavedStudy('GPU verification case', snapshot);
				await validateSavedStudy(saved);
				if (
					JSON.stringify(saved.snapshot.operatingSearch.computation) !==
					JSON.stringify(gpu.computation)
				)
					throw new Error('Saved provenance changed.');
			}
		}
		// The application creates a fresh module worker for each study. Verify that exact path.
		const workerResult = await new Promise((resolve, reject) => {
			const worker = new Worker('/src/lib/design/operating-optimization.worker.ts', {
				type: 'module'
			});
			const timer = setTimeout(() => {
				worker.terminate();
				reject(new Error('Worker timed out'));
			}, 30000);
			worker.onmessage = ({ data }) => {
				if (data.type === 'result' || data.type === 'error') {
					clearTimeout(timer);
					worker.terminate();
					if (data.type === 'error') reject(new Error(data.message));
					else resolve(data.result);
				}
			};
			worker.onerror = (event) => {
				clearTimeout(timer);
				worker.terminate();
				reject(new Error(event.message));
			};
			worker.postMessage({
				type: 'search',
				revision: 'gpu-verification',
				params: cases[0].params,
				scenarios: cases[0].scenarios,
				compute: 'webgpu'
			});
		});
		if (workerResult.computation.backend !== 'webgpu')
			throw new Error(`Worker GPU fallback: ${workerResult.computation.fallbackReason}`);
		// Queue replacement prevents superseded results from escaping after a GPU await.
		const replacement = await new Promise((resolve, reject) => {
			const worker = new Worker('/src/lib/design/operating-optimization.worker.ts', {
				type: 'module'
			});
			const timer = setTimeout(() => {
				worker.terminate();
				reject(new Error('Replacement timed out'));
			}, 30000);
			let replaced = false;
			const first = {
				type: 'search',
				revision: 'superseded',
				params: cases[0].params,
				scenarios: cases[0].scenarios,
				compute: 'webgpu'
			};
			worker.onmessage = ({ data }) => {
				if (data.type === 'progress' && !replaced) {
					replaced = true;
					worker.postMessage({ ...first, revision: 'current' });
				} else if (data.type === 'result' || data.type === 'error') {
					clearTimeout(timer);
					worker.terminate();
					if (data.revision !== 'current' || data.type === 'error')
						reject(new Error('Stale or failed worker result'));
					else resolve(data.revision);
				}
			};
			worker.postMessage(first);
		});
		return {
			checks,
			freshWorker: workerResult.computation,
			staleResultGuard: replacement === 'current',
			savedGpuProvenance: true,
			userAgent: navigator.userAgent
		};
	});
	if (unexpectedRequests.length)
		throw new Error(`Unexpected network requests: ${unexpectedRequests.join(', ')}`);
	const evidence = {
		schemaVersion: 'browser-webgpu-verification-v1',
		checkedAt: new Date().toISOString(),
		package: '@jax-js/jax@0.1.25',
		method:
			'Headless Google Chrome on actual WebGPU adapter; 500-design results compared candidate-by-candidate with independent Float64 browser implementation, including identical 721-phase finalists. Timings are wall time, not GPU timestamp queries or general performance guarantees.',
		...report,
		noBackendRequests: true
	};
	if (output) {
		const path = resolve(root, output);
		await mkdir(dirname(path), { recursive: true });
		await writeFile(path, `${JSON.stringify(evidence, null, 2)}\n`);
	}
	console.log(JSON.stringify(evidence, null, 2));
} finally {
	await browser?.close();
	if (server?.pid) {
		try {
			process.kill(process.platform === 'win32' ? server.pid : -server.pid, 'SIGTERM');
		} catch {
			/* already stopped */
		}
	}
}
