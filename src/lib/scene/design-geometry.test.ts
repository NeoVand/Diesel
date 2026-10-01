import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
	BASELINE_DESIGN,
	evaluateRod,
	rodFieldAt,
	rodVolumeMm3,
	sliderCrankSample
} from '$lib/design/design-core';
import { crankTrainPoses, createRodGeometries, normalizeCrankPhase } from './design-geometry';

function signedVolume(geometry: THREE.BufferGeometry) {
	const p = geometry.getAttribute('position');
	let volume = 0;
	const a = new THREE.Vector3(),
		b = new THREE.Vector3(),
		c = new THREE.Vector3();
	for (let i = 0; i < p.count; i += 3) {
		a.fromBufferAttribute(p, i);
		b.fromBufferAttribute(p, i + 1);
		c.fromBufferAttribute(p, i + 2);
		volume += a.dot(b.cross(c)) / 6;
	}
	return volume;
}

describe('generated engineering design geometry', () => {
	it('uses the same Bank A / station 1 TDC reference and travel derivatives as the analysis plot', () => {
		for (const params of [
			BASELINE_DESIGN,
			{ ...BASELINE_DESIGN, strokeMm: 125, rodLengthMm: 110 },
			{ ...BASELINE_DESIGN, strokeMm: 75, rodLengthMm: 160 }
		]) {
			const travel = (angle: number) => {
				const pose = crankTrainPoses(params, angle)[0];
				return params.rodLengthMm + params.strokeMm / 2 - pose.piston.dot(pose.axis);
			};
			const deltaRadians = 0.001,
				deltaDegrees = (deltaRadians * 180) / Math.PI;
			const omega = (params.rpm * 2 * Math.PI) / 60;
			for (let angle = 0; angle <= 360; angle += 3) {
				const expected = sliderCrankSample(params, angle);
				const centre = travel(angle),
					before = travel(angle - deltaDegrees),
					after = travel(angle + deltaDegrees);
				expect(centre).toBeCloseTo(expected.displacementMm, 10);
				expect((((after - before) / (2 * deltaRadians)) * omega) / 1000).toBeCloseTo(
					expected.velocityMps,
					4
				);
				expect(
					Math.abs(
						(((after - 2 * centre + before) / deltaRadians ** 2) * omega ** 2) / 1000 -
							expected.accelerationMps2
					)
				).toBeLessThan(0.005);
			}
		}
	});

	it('normalizes forward and reverse playback to the displayed 0–360 degree interval', () => {
		expect(normalizeCrankPhase(360)).toBe(0);
		expect(normalizeCrankPhase(721)).toBe(1);
		expect(normalizeCrankPhase(-15)).toBe(345);
		expect(() => normalizeCrankPhase(NaN)).toThrow(RangeError);
	});
	it('samples the physical midspan field rather than coloring only the end vertices', () => {
		const geometries = createRodGeometries(BASELINE_DESIGN);
		const assessment = evaluateRod(BASELINE_DESIGN);
		let maximumDisplacement = 0,
			maximumStress = 0;
		for (const geometry of geometries) {
			const points = geometry.getAttribute('position');
			for (let i = 0; i < points.count; i++) {
				const field = rodFieldAt(BASELINE_DESIGN, points.getY(i), points.getZ(i), assessment);
				maximumDisplacement = Math.max(maximumDisplacement, field.displacementMm);
				maximumStress = Math.max(maximumStress, Math.abs(field.stressMpa));
			}
			geometry.dispose();
		}
		expect(maximumDisplacement / assessment.deflectionMm).toBeGreaterThan(0.99);
		expect(maximumStress / assessment.stressMpa).toBeGreaterThan(0.99);
	});
	it('matches the exact layered CAD volume without filling either mating bore', () => {
		for (const params of [
			BASELINE_DESIGN,
			{
				...BASELINE_DESIGN,
				rodLengthMm: 160,
				rodWidthMm: 28,
				rodDepthMm: 22,
				webMm: 6,
				flangeMm: 5
			}
		]) {
			const geometries = createRodGeometries(params);
			const volume = geometries.reduce((sum, geometry) => sum + signedVolume(geometry), 0);
			expect(Math.abs(volume / rodVolumeMm3(params) - 1)).toBeLessThan(0.0004);
			const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
			const meshes = geometries.map((geometry) => new THREE.Mesh(geometry, material));
			for (const y of [0, params.rodLengthMm]) {
				const ray = new THREE.Raycaster(new THREE.Vector3(0, y, 50), new THREE.Vector3(0, 0, -1));
				expect(ray.intersectObjects(meshes)).toHaveLength(0);
			}
			const webRay = new THREE.Raycaster(
				new THREE.Vector3(0, params.rodLengthMm / 2, 50),
				new THREE.Vector3(0, 0, -1)
			);
			expect(webRay.intersectObjects(meshes).length).toBeGreaterThan(0);
			geometries.forEach((geometry) => geometry.dispose());
			material.dispose();
		}
	});

	it('keeps all twelve rods attached to their pins and constrained to 60-degree cylinder banks', () => {
		for (const params of [
			BASELINE_DESIGN,
			{ ...BASELINE_DESIGN, boreMm: 105, strokeMm: 125, rodLengthMm: 110 },
			{ ...BASELINE_DESIGN, boreMm: 70, strokeMm: 75, rodLengthMm: 160 }
		]) {
			for (let phase = 0; phase <= 720; phase += 5) {
				const poses = crankTrainPoses(params, phase);
				expect(poses).toHaveLength(12);
				for (const pose of poses) {
					expect(pose.piston.distanceTo(pose.pin)).toBeCloseTo(params.rodLengthMm, 10);
					const rodTop = new THREE.Vector3(0, params.rodLengthMm, 0)
						.applyQuaternion(pose.rodRotation)
						.add(pose.pin);
					expect(rodTop.distanceTo(pose.piston)).toBeLessThan(1e-10);
					const radial = new THREE.Vector3(0, pose.piston.y, pose.piston.z).normalize();
					expect(radial.dot(pose.axis)).toBeCloseTo(1, 12);
					expect(Math.hypot(pose.pin.y, pose.pin.z)).toBeCloseTo(params.strokeMm / 2, 10);
					expect(pose.rodRotation.length()).toBeCloseTo(1, 12);
				}
			}
		}
	});

	it('returns exactly to the same geometry after a full mechanical revolution', () => {
		const a = crankTrainPoses(BASELINE_DESIGN, 19);
		const b = crankTrainPoses(BASELINE_DESIGN, 379);
		for (let i = 0; i < a.length; i++) {
			expect(a[i].pin.distanceTo(b[i].pin)).toBeLessThan(1e-10);
			expect(a[i].piston.distanceTo(b[i].piston)).toBeLessThan(1e-10);
		}
	});
});
