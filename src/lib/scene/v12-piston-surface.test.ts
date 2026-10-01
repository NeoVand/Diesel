import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import * as THREE from 'three';
import { applyV12PistonSurfaceShader, prepareV12PistonSurface } from './v12-piston-surface';
import { decodeV12ClearanceGeometry } from './v12-clearance-geometry';
import { applyV12Material, restoreV12MaterialDetail } from './v12-materials';
import { V12MaterialPool } from './v12-material-pool';
import { V12_CYLINDERS, v12NativeToDisplay } from '../engine/v12-kinematics';

const assets = existsSync('static/models/v12-clearance-refined.bin');

function shader() {
	return {
		uniforms: {},
		vertexShader: '#include <common>\n#include <begin_vertex>',
		fragmentShader: '#include <common>\n#include <normal_fragment_maps>'
	} as Parameters<THREE.Material['onBeforeCompile']>[0];
}

describe('native piston skirt footprint filtering', () => {
	it('limits eligibility to measured outer groove triangles and leaves all certified arrays unchanged', () => {
		const c = V12_CYLINDERS.find((c) => c.pistonId === 'v12-0003')!;
		const vertices = [0, 0.1, 0.2, 38.5, 38.5, 38.5].flatMap((h, i) => {
			const angle = (i % 3) * 0.02;
			const radius = 41.8;
			const across = [-c.bankAxis[1], c.bankAxis[0], 0];
			const native = c.pistonPinCenterMm.map(
				(v, j) =>
					v +
					h * c.bankAxis[j] +
					radius * Math.cos(angle) * across[j] +
					(j === 2 ? radius * Math.sin(angle) : 0)
			);
			return v12NativeToDisplay(native as [number, number, number]);
		});
		const g = new THREE.BufferGeometry();
		g.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
		g.setIndex([0, 1, 2, 3, 4, 5]);
		g.computeVertexNormals();
		const position = g.attributes.position.array.slice();
		const normal = g.attributes.normal.array.slice();
		const index = g.index!.array.slice();
		expect(prepareV12PistonSurface(c.pistonId, g)).toBe(true);
		expect(g.attributes.position.array).toEqual(position);
		expect(g.attributes.normal.array).toEqual(normal);
		expect(g.index!.array).toEqual(index);
		const detail = g.getAttribute('pistonSkirtDetail');
		for (let i = 0; i < 3; i++) expect(detail.getY(i)).toBe(1);
		for (let i = 3; i < 6; i++) expect(detail.getY(i)).toBe(0);
		expect(prepareV12PistonSurface('v12-0665', new THREE.BufferGeometry())).toBe(false);
		g.dispose();
	});

	it.skipIf(!assets)(
		'adds finite source-space detail to all twelve pistons, with crowns and ring grooves excluded',
		() => {
			const manifest = JSON.parse(readFileSync('static/models/v12-clearance-refined.json', 'utf8'));
			const file = readFileSync('static/models/v12-clearance-refined.bin');
			const bytes = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
			const decoded = decodeV12ClearanceGeometry(manifest, bytes);
			for (const c of V12_CYLINDERS) {
				const g = decoded.get(c.pistonId)!;
				const detail = g.getAttribute('pistonSkirtDetail');
				const macro = g.getAttribute('pistonSkirtMacroNormal');
				let eligible = 0;
				let invalid = 0;
				let maximumUnitError = 0;
				let minimumHeight = Infinity;
				let maximumHeight = -Infinity;
				for (let i = 0; i < detail.count; i++) {
					if (!Number.isFinite(detail.getX(i))) invalid++;
					if (detail.getY(i)) {
						eligible++;
						minimumHeight = Math.min(minimumHeight, detail.getX(i));
						maximumHeight = Math.max(maximumHeight, detail.getX(i));
						maximumUnitError = Math.max(
							maximumUnitError,
							Math.abs(Math.hypot(macro.getX(i), macro.getY(i), macro.getZ(i)) - 1)
						);
					}
				}
				expect(invalid).toBe(0);
				expect(minimumHeight).toBeGreaterThanOrEqual(-7.751);
				expect(maximumHeight).toBeLessThanOrEqual(11.751);
				expect(maximumUnitError).toBeLessThan(1e-6);
				expect(eligible).toBeGreaterThan(1000);
				expect(eligible).toBeLessThan(detail.count);
			}
			expect(decoded.get('v12-0665')!.hasAttribute('pistonSkirtDetail')).toBe(false);
			for (const g of decoded.values()) g.dispose();
		}
	);

	it('uses a fragment footprint to alter only shading normals, including clone restoration', () => {
		const s = shader();
		applyV12PistonSurfaceShader(s);
		expect(s.fragmentShader).toContain('dFdx(vPistonViewPosition)');
		expect(s.fragmentShader).toContain('smoothstep(0.15, 0.65');
		expect(s.fragmentShader).toContain('mix(normal, pistonMacroNormal');
		expect(s.vertexShader).not.toContain('transformed =');
		const base = new THREE.MeshPhysicalMaterial();
		applyV12Material(base, { id: 'v12-0003', role: 'piston', sourcePath: '', sourceMaterial: '' });
		const clone = base.clone();
		restoreV12MaterialDetail(clone);
		const restored = shader();
		clone.onBeforeCompile(restored, {} as THREE.WebGLRenderer);
		expect(restored.fragmentShader).toContain('pistonDetailFilter');
		expect(clone.customProgramCacheKey()).toBe(base.customProgramCacheKey());
		base.dispose();
		clone.dispose();
	});

	it('never pools a piston-only program with otherwise identical unfiltered metal', () => {
		const filtered = new THREE.MeshPhysicalMaterial();
		applyV12Material(filtered, {
			id: 'v12-0003',
			role: 'piston',
			sourcePath: '',
			sourceMaterial: ''
		});
		const unfiltered = filtered.clone();
		unfiltered.userData.pistonSkirtFiltering = false;
		const pool = new V12MaterialPool();
		const a = pool.get(filtered);
		const b = pool.get(unfiltered);
		expect(a).not.toBe(b);
		expect(a.customProgramCacheKey()).not.toBe(b.customProgramCacheKey());
		const s = shader();
		a.onBeforeCompile(s, {} as THREE.WebGLRenderer);
		expect(s.fragmentShader).toContain('pistonDetailFilter');
		pool.dispose();
		filtered.dispose();
		unfiltered.dispose();
	});
});
