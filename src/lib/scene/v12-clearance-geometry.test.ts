import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { V12_CYLINDERS, V12_MOTION_DATUMS } from '../engine/v12-kinematics';
import { decodeV12ClearanceGeometry, V12_CLEARANCE_CORRECTION } from './v12-clearance-geometry';

const licensedAssetsAvailable =
	existsSync('static/models/v12-clearance-refined.json') &&
	existsSync('static/models/v12-clearance-refined.bin');

// Validation fixtures stay runnable in a clean checkout without purchased geometry.
function fixture() {
	const ids = [
		'v12-0665',
		'v12-0666',
		'v12-0715',
		'v12-0317',
		...Array.from({ length: 12 }, (_, i) => `v12-${String(i + 3).padStart(4, '0')}`)
	];
	const bytes = new ArrayBuffer(ids.length * 48);
	const meshes = ids.map((id, i) => {
		new Float32Array(bytes, i * 48, 9).set([0, 0, 0, 1, 0, 0, 0, 1, 0]);
		new Uint32Array(bytes, i * 48 + 36, 3).set([0, 1, 2]);
		return {
			id,
			positionByteOffset: i * 48,
			vertexCount: 3,
			indexByteOffset: i * 48 + 36,
			indexCount: 3
		};
	});
	return {
		bytes,
		manifest: {
			schemaVersion: 1,
			coordinateSystem: 'immutable source display coordinates',
			byteOrder: 'little-endian',
			positionType: 'float32',
			indexType: 'uint32',
			byteLength: bytes.byteLength,
			meshes
		}
	};
}

describe('derived native clearance geometry', () => {
	it('decodes an owned complete fixture without sharing mutable input buffers', () => {
		const { manifest, bytes } = fixture();
		const geometries = decodeV12ClearanceGeometry(manifest, bytes);
		expect(geometries.size).toBe(manifest.meshes.length);
		new Float32Array(bytes)[0] = 23;
		expect(geometries.get('v12-0665')!.getAttribute('position').getX(0)).toBe(0);
		for (const geometry of geometries.values()) geometry.dispose();
	});
	it.skipIf(!licensedAssetsAvailable)(
		'loads every corrected body, verifies provenance and preserves piston pin registration',
		() => {
			const manifest = JSON.parse(readFileSync('static/models/v12-clearance-refined.json', 'utf8'));
			const source = readFileSync('static/models/v12-clearance-refined.bin');
			const bytes = source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
			expect(createHash('sha256').update(source).digest('hex')).toBe(manifest.binarySha256);
			const geometries = decodeV12ClearanceGeometry(manifest, bytes);
			expect(geometries.size).toBe(16);
			for (const id of ['v12-0665', 'v12-0666', 'v12-0715', 'v12-0317'])
				expect(geometries.has(id)).toBe(true);
			const { displayScale, sourceCenterMeters } = V12_MOTION_DATUMS;
			for (const cylinder of V12_CYLINDERS) {
				const geometry = geometries.get(cylinder.pistonId)!;
				const position = geometry.getAttribute('position');
				let maximum = -Infinity;
				let minimum = Infinity;
				const [dx, dy] = cylinder.bankAxis;
				const [px, py] = cylinder.pistonPinCenterMm;
				for (let index = 0; index < position.count; index++) {
					const x = -(position.getZ(index) / displayScale - sourceCenterMeters[0]) * 1000;
					const y = (position.getY(index) / displayScale + sourceCenterMeters[2]) * 1000;
					const axial = (x - px) * dx + (y - py) * dy;
					minimum = Math.min(minimum, axial);
					maximum = Math.max(maximum, axial);
				}
				// The source skirt remains 14 mm below the same pin. Its curved low point may
				// lie between vertices, within the native tessellator's 0.1 mm deflection.
				expect(maximum).toBeCloseTo(V12_CLEARANCE_CORRECTION.pistonCrownHeightMm, 3);
				expect(minimum).toBeGreaterThan(-14.001);
				expect(minimum).toBeLessThan(-13.9);
				expect(geometry.boundingSphere!.radius).toBeGreaterThan(0);
			}
			for (const geometry of geometries.values()) geometry.dispose();
		}
	);

	it('rejects a partial or duplicated body set rather than silently using a mixed rig', () => {
		const { manifest, bytes } = fixture();
		expect(() =>
			decodeV12ClearanceGeometry({ ...manifest, meshes: manifest.meshes.slice(1) }, bytes)
		).toThrow(/incomplete/);
		const duplicate = structuredClone(manifest);
		duplicate.meshes[1].id = duplicate.meshes[0].id;
		expect(() => decodeV12ClearanceGeometry(duplicate, bytes)).toThrow(/identity/);
	});

	it('rejects overlapping binary ranges, invalid coordinates and out-of-range triangles', () => {
		const { manifest, bytes } = fixture();
		const overlap = structuredClone(manifest);
		overlap.meshes[1].positionByteOffset = 0;
		expect(() => decodeV12ClearanceGeometry(overlap, bytes)).toThrow(/range/);
		const coordinates = bytes.slice(0);
		new Float32Array(coordinates)[0] = NaN;
		expect(() => decodeV12ClearanceGeometry(manifest, coordinates)).toThrow(/coordinates/);
		const indices = bytes.slice(0);
		new Uint32Array(indices, manifest.meshes[0].indexByteOffset)[0] = 0xffffffff;
		expect(() => decodeV12ClearanceGeometry(manifest, indices)).toThrow(/triangle/);
	});
});
