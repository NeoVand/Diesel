import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { env } from '$env/dynamic/private';
import type { StructuralInertia, StructuralResult, Vector3Tuple } from '$lib/design/structural';
import { rodParameterHash, validateRodCadParams, type RodCadParams } from './design-cad';
import { ApiProblem } from './validation';
import cadSource from './cad/rod_step.py?raw';
import elasticitySource from './cad/rod_elasticity.py?raw';

export interface NativeStructuralRequest {
	params: RodCadParams;
	loadCase: { forceN: Vector3Tuple; label: string; inertia?: StructuralInertia };
	refine: boolean;
	refinementLevel: 1 | 2 | 3;
}

function object(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function vector(value: unknown, name: string, maximum: number): Vector3Tuple {
	if (
		!Array.isArray(value) ||
		value.length !== 3 ||
		value.some((v) => typeof v !== 'number' || !Number.isFinite(v))
	)
		throw new ApiProblem(400, `${name} must contain three finite numbers.`);
	if (Math.hypot(...value) > maximum)
		throw new ApiProblem(400, `${name} is outside the supported scenario range.`);
	return [...value] as Vector3Tuple;
}

export function validateStructuralRequest(body: unknown): NativeStructuralRequest {
	if (!object(body) || !object(body.params))
		throw new ApiProblem(400, 'Provide geometry and load parameters.');
	const params = validateRodCadParams(body.params);
	if (body.refine !== undefined && typeof body.refine !== 'boolean')
		throw new ApiProblem(400, 'Refinement must be true or false.');
	if (body.refinementLevel !== undefined && ![1, 2, 3].includes(body.refinementLevel as number))
		throw new ApiProblem(400, 'Choose one, two or three refinement levels.');
	const refinementLevel = (body.refinementLevel ?? (body.refine ? 2 : 1)) as 1 | 2 | 3;
	let forceN: Vector3Tuple;
	let label = 'Fixed big-bore fixture with distributed small-bore load';
	let inertia: StructuralInertia | undefined;
	if (body.loadCase !== undefined) {
		if (!object(body.loadCase)) throw new ApiProblem(400, 'Provide a valid load case.');
		forceN = vector(body.loadCase.forceN, 'Bearing force', 100_000);
		if (body.loadCase.label !== undefined) {
			if (typeof body.loadCase.label !== 'string' || body.loadCase.label.length > 160)
				throw new ApiProblem(400, 'Keep the load-case label under 160 characters.');
			label = body.loadCase.label.replace(/\p{Cc}/gu, ' ').trim() || label;
		}
		if (body.loadCase.inertia !== undefined) {
			const source = body.loadCase.inertia;
			if (!object(source))
				throw new ApiProblem(400, 'Provide a valid rigid-body acceleration field.');
			inertia = {
				originAccelerationMps2: vector(
					source.originAccelerationMps2,
					'Origin acceleration',
					1_000_000
				),
				angularVelocityRadS: vector(source.angularVelocityRadS, 'Angular velocity', 10_000),
				angularAccelerationRadS2: vector(
					source.angularAccelerationRadS2,
					'Angular acceleration',
					10_000_000
				)
			};
		}
	} else {
		const axial = body.params.loadKn;
		const transverse = body.params.lateralLoadN;
		if (
			typeof axial !== 'number' ||
			!Number.isFinite(axial) ||
			axial < 0 ||
			axial > 50 ||
			typeof transverse !== 'number' ||
			!Number.isFinite(transverse) ||
			Math.abs(transverse) > 2000
		)
			throw new ApiProblem(
				400,
				'Provide axial load from 0–50 kN and transverse load from −2000–2000 N.'
			);
		forceN = [0, -axial * 1000, transverse];
	}
	return {
		params,
		loadCase: { forceN, label, ...(inertia ? { inertia } : {}) },
		refine: refinementLevel > 1,
		refinementLevel
	};
}

export function structuralAnalysisHash(request: NativeStructuralRequest): string {
	return createHash('sha256')
		.update(
			JSON.stringify({
				schema: 'rod-solid-fea-v1',
				geometry: rodParameterHash(request.params),
				forceN: request.loadCase.forceN,
				inertia: request.loadCase.inertia ?? null,
				refinementLevel: request.refinementLevel
			})
		)
		.digest('hex');
}

function pythonExecutable() {
	const configured = env.DESIGN_STRUCTURAL_PYTHON?.trim() || env.DESIGN_CAD_PYTHON?.trim();
	if (configured) return configured;
	const local = join(process.cwd(), '.venv-cad/bin/python');
	return existsSync(local) ? local : 'python3';
}

let active = false;

export async function runStructuralAnalysis(
	request: NativeStructuralRequest
): Promise<StructuralResult> {
	if (active)
		throw new ApiProblem(429, 'A solid analysis is already running. Try again when it finishes.');
	active = true;
	let directory: string | undefined;
	try {
		directory = await mkdtemp(join(tmpdir(), 'diesel-solid-fea-'));
		await Promise.all([
			writeFile(join(directory, 'rod_step.py'), cadSource, { mode: 0o600 }),
			writeFile(join(directory, 'rod_elasticity.py'), elasticitySource, { mode: 0o600 })
		]);
		await new Promise<void>((resolve, reject) => {
			const child = execFile(
				pythonExecutable(),
				[join(directory!, 'rod_elasticity.py'), directory!],
				{
					timeout: 28_000,
					killSignal: 'SIGKILL',
					maxBuffer: 524_288,
					windowsHide: true,
					env: {
						...process.env,
						OPENBLAS_NUM_THREADS: '1',
						OMP_NUM_THREADS: '1',
						MKL_NUM_THREADS: '1'
					}
				},
				(error) => {
					if (!error) return resolve();
					if (error.killed || error.signal === 'SIGKILL')
						return reject(
							new ApiProblem(
								504,
								'The solid analysis exceeded its time limit. Try the standard mesh.'
							)
						);
					if (error.code === 'ENOENT' || error.code === 78)
						return reject(
							new ApiProblem(
								503,
								'The native solid solver is unavailable. Configure an OCP, Gmsh, SciPy and scikit-fem Python runtime.'
							)
						);
					reject(
						new ApiProblem(
							422,
							'The native solver could not verify this mesh or equilibrium solution. No result has been substituted.'
						)
					);
				}
			);
			child.stdin?.on('error', () => {
				/* Completion reports native-runtime errors. */
			});
			child.stdin?.end(JSON.stringify(request));
		});
		const result = JSON.parse(
			await readFile(join(directory, 'analysis.json'), 'utf8')
		) as StructuralResult;
		if (
			result.schemaVersion !== 'rod-solid-fea-v1' ||
			result.stats.solveResidualRelative > 1e-7 ||
			result.stats.forceBalanceRelative > 1e-5 ||
			result.stats.momentBalanceRelative > 1e-5 ||
			result.surface.positionsMm.length !== result.surface.displacementMm.length ||
			result.surface.positionsMm.length !== result.surface.vonMisesMpa.length * 3
		)
			throw new ApiProblem(422, 'The native result did not pass its field and equilibrium checks.');
		result.parameterHash = rodParameterHash(request.params);
		result.analysisHash = structuralAnalysisHash(request);
		return result;
	} finally {
		try {
			if (directory) await rm(directory, { recursive: true, force: true });
		} finally {
			active = false;
		}
	}
}
