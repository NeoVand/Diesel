import type { RodGeometryParams, StructuralRequest, StructuralResult } from '../design/structural';

export type RodCadParams = RodGeometryParams;
export interface RodCadReport {
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
}
export type CadExport = { step: Uint8Array; report: RodCadReport };
export type KernelRequest =
	| { id: number; kind: 'cad'; params: RodCadParams; kernelUrl: string }
	| { id: number; kind: 'analysis'; request: StructuralRequest; kernelUrl: string };
export type KernelResponse =
	| { id: number; kind: 'progress'; message: string }
	| { id: number; kind: 'cad'; value: CadExport }
	| { id: number; kind: 'analysis'; value: StructuralResult }
	| { id: number; kind: 'error'; message: string };

const bounds = {
	rodLengthMm: [110, 160],
	rodWidthMm: [14, 28],
	rodDepthMm: [12, 22],
	webMm: [2, 6],
	flangeMm: [2, 5]
} as const;

export function validateGeometry(value: RodCadParams): RodCadParams {
	const result = {} as RodCadParams;
	for (const key of Object.keys(bounds) as (keyof RodCadParams)[]) {
		const v = value[key],
			[min, max] = bounds[key];
		if (!Number.isFinite(v) || v < min || v > max)
			throw new Error(`${key} must be between ${min} and ${max} mm.`);
		result[key] = v;
	}
	if (result.webMm >= result.rodWidthMm || 2 * result.flangeMm >= result.rodDepthMm)
		throw new Error('The web and flanges must leave a positive I-section.');
	return result;
}

export function analyticVolume(p: RodCadParams): number {
	const area = (w: number) => {
		const overlap = (r: number) => {
			const h = Math.min(w / 2, r);
			return h * Math.sqrt(r * r - h * h) + r * r * Math.asin(h / r);
		};
		return (
			w * p.rodLengthMm +
			Math.PI * (32 ** 2 + 15 ** 2 - 25 ** 2 - 9 ** 2) -
			overlap(32) -
			overlap(15)
		);
	};
	return area(p.webMm) * (p.rodDepthMm - 2 * p.flangeMm) + 2 * area(p.rodWidthMm) * p.flangeMm;
}

export async function hashValue(value: unknown): Promise<string> {
	const bytes = new TextEncoder().encode(JSON.stringify(value));
	const digest = await crypto.subtle.digest('SHA-256', bytes);
	return Array.from(new Uint8Array(digest), (v) => v.toString(16).padStart(2, '0')).join('');
}

export const parameterHash = (p: RodCadParams) =>
	hashValue({ schema: 'rod-solid-v1', ...validateGeometry(p) });
