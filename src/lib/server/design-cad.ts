import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { env } from '$env/dynamic/private';
import exporterSource from './cad/rod_step.py?raw';
import { ApiProblem } from './validation';

export const ROD_CAD_SCHEMA = 'rod-solid-v1';
export const ROD_CAD_BOUNDS = {
	rodLengthMm: [110, 160],
	rodWidthMm: [14, 28],
	rodDepthMm: [12, 22],
	webMm: [2, 6],
	flangeMm: [2, 5]
} as const;
export type RodCadParams = Record<keyof typeof ROD_CAD_BOUNDS, number>;
export type RodCadReport = {
	schemaVersion: string;
	parameterHash: string;
	params: RodCadParams;
	kernel: string;
	units: 'mm';
	valid: boolean;
	solidCount: number;
	volumeMm3: number;
	massKg: number;
	densityKgM3: number;
	densityProvenance: string;
	boundsMm: { min: [number, number, number]; max: [number, number, number] };
	analyticVolumeMm3: number;
	relativeVolumeError: number;
	stepRoundTripValid: boolean;
	stepRoundTripRelativeVolumeError: number;
	limitations: string[];
};

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function validateRodCadParams(value: unknown): RodCadParams {
	if (!isObject(value)) throw new ApiProblem(400, 'Provide the rod geometry parameters.');
	const result = {} as RodCadParams;
	for (const [name, range] of Object.entries(ROD_CAD_BOUNDS)) {
		const raw = value[name];
		if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < range[0] || raw > range[1])
			throw new ApiProblem(400, `${name} must be between ${range[0]} and ${range[1]} mm.`);
		result[name as keyof RodCadParams] = raw;
	}
	if (result.webMm >= result.rodWidthMm || 2 * result.flangeMm >= result.rodDepthMm)
		throw new ApiProblem(400, 'The flange and web dimensions must leave a positive I-section.');
	return result;
}

export function validateRodCadRequest(value: unknown) {
	if (!isObject(value)) throw new ApiProblem(400, 'Provide a JSON object.');
	const format = value.format ?? 'step';
	if (format !== 'step' && format !== 'json')
		throw new ApiProblem(400, 'The CAD format must be step or json.');
	return { params: validateRodCadParams(value.params ?? value), format };
}

export function rodParameterHash(params: RodCadParams) {
	const canonical = validateRodCadParams(params);
	return createHash('sha256')
		.update(JSON.stringify({ schema: ROD_CAD_SCHEMA, ...canonical }))
		.digest('hex');
}

function pythonExecutable() {
	if (env.DESIGN_CAD_PYTHON?.trim()) return env.DESIGN_CAD_PYTHON.trim();
	for (const local of [
		'.venv-cad/bin/python',
		'references/00_Active_V12/audit-tools/.venv/bin/python'
	]) {
		const candidate = join(process.cwd(), local);
		if (existsSync(candidate)) return candidate;
	}
	return 'python3';
}

let active = false;

/** One bounded native process. Arguments are fixed paths; untrusted data goes only through stdin. */
export async function exportRodCad(
	params: RodCadParams
): Promise<{ step: Uint8Array; report: RodCadReport }> {
	const validated = validateRodCadParams(params);
	if (active)
		throw new ApiProblem(429, 'The CAD kernel is busy. Try again when the current model finishes.');
	active = true;
	let directory: string | undefined;
	try {
		directory = await mkdtemp(join(tmpdir(), 'diesel-rod-cad-'));
		const scriptPath = join(directory, 'rod_step.py');
		await writeFile(scriptPath, exporterSource, { mode: 0o600 });
		await new Promise<void>((resolve, reject) => {
			const child = execFile(
				pythonExecutable(),
				[scriptPath, directory!],
				{
					timeout: 25_000,
					killSignal: 'SIGKILL',
					maxBuffer: 262_144,
					windowsHide: true
				},
				(error) => {
					if (!error) return resolve();
					if (error.killed || error.signal === 'SIGKILL')
						return reject(new ApiProblem(504, 'The CAD calculation timed out. Try again.'));
					if (error.code === 'ENOENT' || error.code === 78)
						return reject(
							new ApiProblem(
								503,
								'Exact CAD export is unavailable on this server. Configure DESIGN_CAD_PYTHON with an OCP-enabled Python runtime.'
							)
						);
					reject(
						new ApiProblem(
							422,
							'The CAD kernel could not verify this solid. The previous verified design remains available.'
						)
					);
				}
			);
			child.stdin?.on('error', () => {
				/* Process completion reports unavailable runtimes. */
			});
			child.stdin?.end(JSON.stringify(validated));
		});
		const [step, reportText] = await Promise.all([
			readFile(join(directory, 'rod.step')),
			readFile(join(directory, 'report.json'), 'utf8')
		]);
		const report = JSON.parse(reportText) as RodCadReport;
		if (
			report.schemaVersion !== ROD_CAD_SCHEMA ||
			!report.valid ||
			report.solidCount !== 1 ||
			!report.stepRoundTripValid ||
			!(report.volumeMm3 > 0) ||
			report.relativeVolumeError > 1e-8
		)
			throw new ApiProblem(422, 'The generated CAD model did not pass its solid checks.');
		report.parameterHash = rodParameterHash(validated);
		return { step: new Uint8Array(step), report };
	} finally {
		try {
			if (directory) await rm(directory, { recursive: true, force: true });
		} finally {
			active = false;
		}
	}
}
