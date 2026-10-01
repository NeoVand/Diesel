import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { V12ChamberDomain, V12_CHAMBER_DATUMS } from './v12-chamber-domain';
import { V12ChamberVolume } from './v12-chamber-volume';
import { V12CombustionGlow } from './v12-combustion-glow';

const bytes = readFileSync('static/models/v12-chamber-domains.bin');
const data = new Float32Array(
	bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
);
function fixture() {
	const volumes = V12_CHAMBER_DATUMS.cylinders.map(
		(_, i) => new V12ChamberVolume(new V12ChamberDomain(i, data))
	);
	const glow = new V12CombustionGlow();
	const update = (phase: number, enabled = true) => {
		volumes.forEach((v) => {
			v.domain.update(phase);
			v.update(phase, false, enabled, null);
		});
		glow.update(volumes, enabled, null);
	};
	return {
		volumes,
		glow,
		update,
		dispose: () => {
			glow.dispose();
			volumes.forEach((v) => {
				v.dispose();
				v.domain.dispose();
			});
		}
	};
}

describe('cycle-synchronized combustion illumination', () => {
	it('illuminates firing chambers from inside their moving gas domains over the full cycle', () => {
		const f = fixture();
		const covered = new Set<string>();
		try {
			for (let phase = 0; phase < 720; phase += 4) {
				f.update(phase);
				expect(f.glow.group.children).toHaveLength(2);
				for (const child of f.glow.group.children) {
					const light = child as THREE.PointLight;
					expect(light.visible).toBe(true);
					expect(light.castShadow).toBe(false);
					expect(light.intensity).toBeLessThanOrEqual(0.24);
					if (!light.intensity) continue;
					const owner = f.volumes.find((v) => {
						const p = light.position.clone().applyMatrix4(v.domain.toWorld.clone().invert());
						return v.heatRelease > 0 && v.domain.contains(p.x, p.y, p.z);
					});
					expect(owner).toBeDefined();
					covered.add(owner!.domain.datum.pistonId);
				}
			}
			expect(covered.size).toBe(12);
		} finally {
			f.dispose();
		}
	});
	it('retains fixed light identities, reproduces seek and suppresses disabled/sectioned glow', () => {
		const f = fixture();
		const lights = [...f.glow.group.children] as THREE.PointLight[];
		const snapshot = () => lights.map((l) => [l.intensity, ...l.position.toArray()]);
		try {
			f.update(205);
			const expected = snapshot();
			expect(f.glow.getDiagnostics().activeLights).toBeGreaterThan(0);
			f.update(500);
			f.update(205);
			expect(snapshot()).toEqual(expected);
			f.glow.update(f.volumes, true, new THREE.Plane(new THREE.Vector3(1, 0, 0), -100));
			expect(f.glow.getDiagnostics().activeLights).toBe(0);
			f.update(205, false);
			expect(f.glow.getDiagnostics().activeLights).toBe(0);
			expect(f.glow.group.children).toEqual(lights);
		} finally {
			f.dispose();
		}
		expect(f.glow.group.children).toHaveLength(0);
	});
});
