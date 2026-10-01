import * as THREE from 'three';
import { V12_CYLINDERS, V12_MOTION_DATUMS } from '../engine/v12-kinematics';

/** Measured native torus faces; appearance filtering never changes the certified surface. */
export const V12_PISTON_SKIRT_DETAIL = {
	pitchMm: 1,
	grooveRadiusMm: 0.25,
	cylinderRadiusMm: 42,
	firstCentreMm: -7.5,
	lastCentreMm: 11.5,
	grooveCount: 20,
	filterStartMmPerPixel: 0.15,
	filterFullMmPerPixel: 0.65,
	provenance: '40 native torus faces, R42/r0.25,20 axial stations at1mm pitch; two skirt arcs.'
} as const;

/** Add only appearance attributes. Position, index and original normals remain immutable. */
export function prepareV12PistonSurface(id: string, geometry: THREE.BufferGeometry): boolean {
	const cylinder = V12_CYLINDERS.find((entry) => entry.pistonId === id);
	if (!cylinder) return false;
	const position = geometry.getAttribute('position');
	const count = position.count;
	const macro = new Float32Array(count * 3);
	const detail = new Float32Array(count * 3);
	const eligible = new Uint8Array(count);
	const { displayScale: scale, sourceCenterMeters: centre } = V12_MOTION_DATUMS;
	const axis = cylinder.bankAxis;
	const pin = cylinder.pistonPinCenterMm;
	for (let i = 0; i < count; i++) {
		const x = (centre[0] - position.getZ(i) / scale) * 1000 - pin[0];
		const y = (position.getY(i) / scale + centre[2]) * 1000 - pin[1];
		const z = (position.getX(i) / scale - centre[1]) * 1000 - pin[2];
		const h = x * axis[0] + y * axis[1] + z * axis[2];
		const rx = x - h * axis[0];
		const ry = y - h * axis[1];
		const rz = z - h * axis[2];
		const radius = Math.hypot(rx, ry, rz);
		// Native→display normal rotation is [z,y,-x]. No scale is applied to a normal.
		if (radius > 0) macro.set([rz / radius, ry / radius, -rx / radius], i * 3);
		detail[i * 3] = h;
		detail[i * 3 + 2] = scale / 1000;
		eligible[i] = Number(radius >= 41.74 && radius <= 42.05 && h >= -7.751 && h <= 11.751);
	}
	// Face-local native vertices keep wrist-pin cuts/ring lands separate. A triangle
	// crossing the measured detail envelope cannot lend a filtered normal to its edge.
	const mask = eligible.slice();
	const index = geometry.index;
	for (let i = 0; i < (index?.count ?? count); i += 3) {
		const a = index?.getX(i) ?? i;
		const b = index?.getX(i + 1) ?? i + 1;
		const c = index?.getX(i + 2) ?? i + 2;
		if (!(eligible[a] && eligible[b] && eligible[c])) mask[a] = mask[b] = mask[c] = 0;
	}
	for (let i = 0; i < count; i++) detail[i * 3 + 1] = mask[i];
	geometry.setAttribute('pistonSkirtMacroNormal', new THREE.BufferAttribute(macro, 3));
	geometry.setAttribute('pistonSkirtDetail', new THREE.BufferAttribute(detail, 3));
	geometry.userData.pistonSkirtDetail = V12_PISTON_SKIRT_DETAIL;
	return true;
}

type Shader = Parameters<THREE.Material['onBeforeCompile']>[0];

/** Conservative pixel footprint: local groove slopes must not understate the projected1mm detail. */
export function applyV12PistonSurfaceShader(shader: Shader): void {
	shader.vertexShader = shader.vertexShader
		.replace(
			'#include <common>',
			`#include <common>
attribute vec3 pistonSkirtMacroNormal;
attribute vec3 pistonSkirtDetail;
varying vec3 vPistonSkirtMacroNormal;
varying vec3 vPistonViewPosition;
varying vec3 vPistonSkirtDetail;`
		)
		.replace(
			'#include <begin_vertex>',
			`#include <begin_vertex>
vPistonSkirtMacroNormal = normalMatrix * pistonSkirtMacroNormal;
vPistonViewPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
vPistonSkirtDetail = pistonSkirtDetail;
vPistonSkirtDetail.z *= length(modelViewMatrix[0].xyz);`
		);
	shader.fragmentShader = (
		`varying vec3 vPistonSkirtMacroNormal;
varying vec3 vPistonViewPosition;
varying vec3 vPistonSkirtDetail;
` + shader.fragmentShader
	).replace(
		'#include <normal_fragment_maps>',
		`#include <normal_fragment_maps>
float pistonDetailFootprint = max(length(dFdx(vPistonViewPosition)), length(dFdy(vPistonViewPosition))) / max(vPistonSkirtDetail.z, 0.000001);
float pistonDetailFilter = smoothstep(0.15, 0.65, pistonDetailFootprint) * vPistonSkirtDetail.y;
if (pistonDetailFilter > 0.0) {
vec3 pistonMacroNormal = normalize(vPistonSkirtMacroNormal);
#ifdef DOUBLE_SIDED
pistonMacroNormal *= faceDirection;
#endif
normal = normalize(mix(normal, pistonMacroNormal, pistonDetailFilter));
nonPerturbedNormal = normal;
}`
	);
}
