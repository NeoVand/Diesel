import * as THREE from 'three';
import { prepareV12PistonSurface } from './v12-piston-surface';

export const V12_CLEARANCE_CORRECTION = {
	classification: 'Derived native solid clearance correction',
	pistonCrownHeightMm: 38.5,
	sourcePistonCrownHeightMm: 40,
	lowerBoreReliefRadiusMm: 42.25,
	lowerBoreReliefAxialRangeMm: [88, 104],
	guideSupportRadiusMm: 5,
	minimumGuideCapClearanceMm: 0.2,
	correctedGuideScrews: 22,
	sourcePreserved: true
} as const;

const expectedIds = new Set([
	'v12-0665',
	'v12-0666',
	'v12-0715',
	'v12-0317',
	...Array.from({ length: 12 }, (_, index) => `v12-${String(index + 3).padStart(4, '0')}`)
]);

function record(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function integer(value: unknown, maximum: number): value is number {
	return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= maximum;
}

/** Decode owned, immutable source-coordinate replacements; no source geometry is mutated. */
export function decodeV12ClearanceGeometry(
	manifest: unknown,
	bytes: ArrayBuffer
): Map<string, THREE.BufferGeometry> {
	if (
		!record(manifest) ||
		manifest.schemaVersion !== 1 ||
		manifest.coordinateSystem !== 'immutable source display coordinates' ||
		manifest.byteOrder !== 'little-endian' ||
		manifest.positionType !== 'float32' ||
		manifest.indexType !== 'uint32' ||
		manifest.byteLength !== bytes.byteLength ||
		bytes.byteLength > 64 * 1024 * 1024 ||
		!Array.isArray(manifest.meshes) ||
		manifest.meshes.length !== expectedIds.size
	) {
		throw new Error('Unsupported or incomplete clearance geometry manifest.');
	}
	const geometries = new Map<string, THREE.BufferGeometry>();
	let cursor = 0;
	try {
		for (const mesh of manifest.meshes) {
			if (
				!record(mesh) ||
				typeof mesh.id !== 'string' ||
				!expectedIds.has(mesh.id) ||
				geometries.has(mesh.id) ||
				!integer(mesh.vertexCount, 2_000_000) ||
				mesh.vertexCount < 3 ||
				!integer(mesh.indexCount, 6_000_000) ||
				mesh.indexCount < 3 ||
				mesh.indexCount % 3 !== 0 ||
				mesh.positionByteOffset !== cursor ||
				mesh.indexByteOffset !== cursor + mesh.vertexCount * 12 ||
				cursor + mesh.vertexCount * 12 + mesh.indexCount * 4 > bytes.byteLength
			) {
				throw new Error('Invalid clearance mesh range or identity.');
			}
			const positions = new Float32Array(bytes, cursor, mesh.vertexCount * 3).slice();
			const indices = new Uint32Array(
				bytes,
				mesh.indexByteOffset as number,
				mesh.indexCount
			).slice();
			const vertexCount = mesh.vertexCount;
			if (positions.some((value) => !Number.isFinite(value) || Math.abs(value) > 100)) {
				throw new Error('Clearance geometry contains invalid source coordinates.');
			}
			if (indices.some((value) => value >= vertexCount)) {
				throw new Error('Clearance geometry contains an invalid triangle index.');
			}
			const geometry = new THREE.BufferGeometry();
			geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
			geometry.setIndex(new THREE.BufferAttribute(indices, 1));
			geometry.computeVertexNormals();
			prepareV12PistonSurface(mesh.id, geometry);
			geometry.computeBoundingBox();
			geometry.computeBoundingSphere();
			geometry.userData.clearanceCorrection = V12_CLEARANCE_CORRECTION;
			geometry.userData.sourceComponentId = mesh.id;
			geometries.set(mesh.id, geometry);
			cursor += mesh.vertexCount * 12 + mesh.indexCount * 4;
		}
		if (cursor !== bytes.byteLength)
			throw new Error('Unexpected trailing clearance geometry bytes.');
		return geometries;
	} catch (error) {
		for (const geometry of geometries.values()) geometry.dispose();
		throw error;
	}
}

/** Load once per studio. The caller owns disposal, source replacement, bounds and section caps. */
export async function loadV12ClearanceGeometry(
	fetcher: typeof fetch = fetch
): Promise<Map<string, THREE.BufferGeometry>> {
	const [manifestResponse, binaryResponse] = await Promise.all([
		fetcher('/models/v12-clearance-refined.json'),
		fetcher('/models/v12-clearance-refined.bin')
	]);
	if (!manifestResponse.ok || !binaryResponse.ok) {
		throw new Error('Could not load the corrected piston and mounting geometry.');
	}
	const [manifest, bytes]: [unknown, ArrayBuffer] = await Promise.all([
		manifestResponse.json(),
		binaryResponse.arrayBuffer()
	]);
	if (!record(manifest) || typeof manifest.binarySha256 !== 'string') {
		throw new Error('Missing clearance geometry provenance.');
	}
	const digest = await crypto.subtle.digest('SHA-256', bytes);
	const actualHash = [...new Uint8Array(digest)]
		.map((v) => v.toString(16).padStart(2, '0'))
		.join('');
	if (actualHash !== manifest.binarySha256)
		throw new Error('Clearance geometry checksum mismatch.');
	return decodeV12ClearanceGeometry(manifest, bytes);
}
