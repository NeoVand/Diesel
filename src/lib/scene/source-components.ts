import * as THREE from 'three';
import type { PartId } from '$lib/engine/types';
import type { ComponentRecord } from '$lib/engine/lab-state';
import { NATIVE_SOURCE_PROVENANCE } from './native-source-provenance';
import { EXPLOSION_MULTIPLIER } from './parts-layout';

export type Finish =
	'paint' | 'iron' | 'steel' | 'aluminium' | 'rubber' | 'fastener' | 'exhaust' | 'bronze';

export const SYSTEM_NAMES: Record<PartId, string> = {
	block: 'Block & structure',
	heads: 'Cylinder heads',
	turbo: 'Turbocharger',
	air: 'Air induction',
	cooling: 'Cooling circuit',
	fuel: 'Fuel delivery',
	exhaust: 'Exhaust system',
	flywheel: 'Flywheel housing',
	accessories: 'Accessories'
};

/** Classification is visual inference from the purchased OBJ, not a Caterpillar parts catalog. */
export function classifySource(name: string, bounds: THREE.Box3): PartId {
	const p = bounds.getCenter(new THREE.Vector3());
	const s = bounds.getSize(new THREE.Vector3());
	const index = Number(name.match(/_(\d+)$/)?.[1] ?? -1);
	if (name === 'Frame_156826') return 'block';
	if ([479, 480, 488, 491, 512, 522, 523, 499].includes(index)) return 'turbo';
	if ([566, 580, 581, 584, 585, 567, 555].includes(index)) return 'air';
	if ([516, 517, 521, 524, 528, 534, 535, 536, 537, 538, 41, 42, 43].includes(index))
		return 'heads';
	if ([388, 403, 404, 365, 394, 423, 439, 440].includes(index)) return 'exhaust';
	if (p.x < -665 && p.z < 650) return 'flywheel';
	if (p.x > 565) return 'cooling';
	if (p.z > 750 && Math.abs(p.y) < 175) return 'fuel';
	if (p.z > 730 && Math.abs(p.y) > 150) return 'heads';
	if (s.x > 700 || (Math.abs(p.y) < 240 && p.z < 740)) return 'block';
	return 'accessories';
}

/** Display finishes inferred from geometry and region; these are not alloy specifications. */
export function sourceFinish(name: string, parent: PartId, bounds: THREE.Box3): Finish {
	const s = bounds.getSize(new THREE.Vector3());
	const sorted = [s.x, s.y, s.z].sort((a, b) => a - b);
	const index = Number(name.match(/_(\d+)$/)?.[1] ?? -1);
	if (sorted[2] < 52 && sorted[0] > 1.5) return 'fastener';
	if (sorted[0] < 4 && sorted[2] > 95) return 'iron';
	if (parent === 'exhaust') return 'exhaust';
	if (parent === 'turbo') return [479, 480, 488, 491].includes(index) ? 'iron' : 'aluminium';
	if (parent === 'air') return sorted[0] < 60 && sorted[2] > 210 ? 'rubber' : 'iron';
	if (parent === 'fuel' && sorted[0] < 55) return 'steel';
	if (parent === 'flywheel' && sorted[2] < 125) return 'steel';
	if (parent === 'accessories' && sorted[0] < 28 && sorted[2] > 170) return 'rubber';
	return 'paint';
}

const OFFSETS: Record<PartId, [number, number, number]> = {
	block: [0, -0.1, 0],
	heads: [0, 1.3, 0.4],
	turbo: [-1.1, 1.0, 0],
	air: [-0.8, 1.5, 0],
	cooling: [1.5, 0.35, 0],
	fuel: [0, 0.9, -1.1],
	exhaust: [0, 1.0, -1.25],
	flywheel: [-1.45, -0.1, 0],
	accessories: [0.1, -0.15, 1.4]
};

export function sourceOffset(
	name: string,
	parent: PartId,
	center: THREE.Vector3,
	size: THREE.Vector3
): THREE.Vector3 {
	if (name === 'Frame_156826') return new THREE.Vector3(0, -0.1 * EXPLOSION_MULTIPLIER, 0);
	const offset = new THREE.Vector3(...OFFSETS[parent]);
	const index = Number(name.match(/_(\d+)$/)?.[1] ?? 0);
	const lane = ((index % 7) - 3) * 0.08;
	offset.x += center.x * 0.38 + lane;
	offset.z += center.z * 0.65;
	offset.y += Math.max(0, center.y + 1.2) * 0.18;
	if (parent === 'heads') offset.z += Math.sign(center.z || 1) * 1.1;
	if (parent === 'turbo' || parent === 'air') offset.z += Math.sign(center.z || 1) * 0.5;
	if (Math.max(size.x, size.y, size.z) < 0.16) offset.multiplyScalar(1.08);
	return offset.multiplyScalar(EXPLOSION_MULTIPLIER);
}

/** Exported plate/casting contact skins coincide at world Z=±0.507866913.
 * This microscopic section-display separation resolves ambiguous double-sided rasterization.
 * It is a display correction, not an OEM gasket or physical-clearance measurement.
 */
export function sourceContactSeparation(id: string): number {
	const index = Number(id.match(/^Frame_Object_(\d+)$/)?.[1]);
	if ([56, 57, 58, 69, 70, 71].includes(index)) return 0.0005;
	if ([59, 60, 61, 66, 67, 68].includes(index)) return -0.0005;
	return 0;
}

/** Remove repeated same-winding positional triangles; keep reversed thin-sheet skins. */
export function removeRedundantSourceTriangles(geometry: THREE.BufferGeometry): number {
	const position = geometry.getAttribute('position'),
		index = geometry.index,
		seen = new Set<string>(),
		kept: number[] = [];
	const vertex = (i: number) => `${position.getX(i)},${position.getY(i)},${position.getZ(i)}`;
	let removed = 0;
	for (let i = 0; i < (index?.count ?? position.count); i += 3) {
		const ids = [0, 1, 2].map((j) => (index ? index.getX(i + j) : i + j)),
			keys = ids.map(vertex);
		const key = keys.map((_, j) => keys.slice(j).concat(keys.slice(0, j)).join('|')).sort()[0];
		if (seen.has(key)) {
			removed++;
			continue;
		}
		seen.add(key);
		kept.push(...ids);
	}
	if (removed) geometry.setIndex(kept);
	return removed;
}

export function sourceRecord(
	id: string,
	parent: PartId,
	finish: Finish,
	triangles: number
): ComponentRecord {
	const native = NATIVE_SOURCE_PROVENANCE[id];
	const base = id === 'Frame_156826' ? 'Main casting' : SYSTEM_NAMES[parent];
	const contactNote = sourceContactSeparation(id)
		? ' A microscopic display-only separation resolves coincident exported contact skins in cutaway; it is not physical clearance.'
		: '';
	const provenance = native
		? ` Recovered vendor CAD product label ${native.product}; high geometry correspondence with native STEP body (maximum bounds residual ${native.residual.toFixed(3)} visual-export units). This is vendor metadata, not verified OEM part identity or function.`
		: ' No confident native product association has been established for this body.';
	return {
		id,
		name: native
			? `${base} · CAD ${native.product} · ${id.replace('Frame_Object_', '')}`
			: `${base} · ${id.replace('Frame_Object_', '')}`,
		parent,
		sourceGroup: id,
		...(native ? { cadProduct: native.product } : {}),
		kind: 'source',
		confidence: 'visual',
		material: `${finish} · display interpretation`,
		triangleCount: triangles,
		description:
			'Purchased 3512 exterior mesh group. System classification and surface finish are visual interpretations; exact 3512C arrangement applicability is unverified.' +
			provenance +
			contactNote
	};
}

export const FINISH_PARAMETERS: Record<Finish, THREE.MeshPhysicalMaterialParameters> = {
	paint: {
		color: 0xe2ac14,
		metalness: 0.04,
		roughness: 0.48,
		clearcoat: 0.08,
		clearcoatRoughness: 0.42
	},
	iron: { color: 0x4c545d, metalness: 0.72, roughness: 0.56 },
	steel: { color: 0x7f8a92, metalness: 0.94, roughness: 0.35, anisotropy: 0.25 },
	aluminium: { color: 0x909ea8, metalness: 0.86, roughness: 0.4, anisotropy: 0.2 },
	rubber: { color: 0x242b32, metalness: 0, roughness: 0.75 },
	fastener: { color: 0x849099, metalness: 0.96, roughness: 0.32 },
	exhaust: { color: 0x65584b, metalness: 0.72, roughness: 0.62 },
	bronze: { color: 0xc19143, metalness: 0.88, roughness: 0.3 }
};

export function makeFinish(finish: Finish): THREE.MeshPhysicalMaterial {
	const material = new THREE.MeshPhysicalMaterial({
		...FINISH_PARAMETERS[finish],
		envMapIntensity: 0.82
	});
	const grain =
		finish === 'paint' ? 0.035 : finish === 'iron' || finish === 'exhaust' ? 0.065 : 0.018;
	material.onBeforeCompile = (shader) => {
		shader.vertexShader = 'varying vec3 vSurfacePosition;\n' + shader.vertexShader;
		shader.vertexShader = shader.vertexShader.replace(
			'#include <begin_vertex>',
			'#include <begin_vertex>\nvSurfacePosition=position;'
		);
		shader.fragmentShader =
			'varying vec3 vSurfacePosition;\nfloat surfaceHash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}\n' +
			shader.fragmentShader;
		shader.fragmentShader = shader.fragmentShader.replace(
			'#include <roughnessmap_fragment>',
			`#include <roughnessmap_fragment>\nvec3 grainPosition=vSurfacePosition*240.0; float grainFootprint=max(max(fwidth(grainPosition.x),fwidth(grainPosition.y)),fwidth(grainPosition.z)); float grainVisibility=1.0-smoothstep(.35,1.0,grainFootprint); roughnessFactor=clamp(roughnessFactor+(surfaceHash(floor(grainPosition))-.5)*${grain.toFixed(3)}*grainVisibility,.05,.95);`
		);
	};
	material.customProgramCacheKey = () => `engineering-finish-${finish}`;
	return material;
}
