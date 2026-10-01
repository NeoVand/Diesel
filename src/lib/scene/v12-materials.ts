import * as THREE from 'three';
import { applyV12PistonSurfaceShader } from './v12-piston-surface';
import {
	attribute,
	float,
	materialRoughness,
	max,
	mix,
	modelNormalMatrix,
	modelViewMatrix,
	normalView,
	positionLocal,
	positionView,
	reference,
	smoothstep,
	varying,
	vec4,
	faceDirection,
	mx_noise_float,
	screenCoordinate,
	wgslFn
} from 'three/tsl';
import type { MeshStandardNodeMaterial, Node } from 'three/webgpu';
// Fixed 8×8 Bayer coverage in the light's shadow map. A stable screen-space
// threshold makes the returning shell's shadow fade without a final opacity snap.
// Keep every node in the public TSL module: mixing source-module Fn nodes with
// bundled WebGPU nodes creates separate builder state in Three's distribution.
const shadowCoverageThreshold = wgslFn(`
fn shadowCoverageThreshold(pixel: vec2f) -> f32 {
  let p = vec2u(pixel) & vec2u(7u);
  var threshold: u32 = 0u;
  for (var bit: u32 = 0u; bit < 3u; bit = bit + 1u) {
    let x = (p.x >> bit) & 1u;
    let y = (p.y >> bit) & 1u;
    threshold = (threshold << 2u) | (((x ^ y) << 1u) | y);
  }
  return (f32(threshold) + 0.5) / 64.0;
}
`);

type SourcePart = {
	id: string;
	role: string;
	sourcePath: string;
	sourceMaterial: string;
};
type Finish = {
	name: string;
	color: string;
	metalness: number;
	roughness: number;
	coat?: number;
	coatRoughness?: number;
	grain?: number;
};

// Authored display finishes. These are not measured alloys or simulation properties.
const finishes = {
	orange: {
		// The unmodified GLB cam covers are linear RGB [1, .15686275, 0]
		// (sRGB #ff6e00), metallic .95. Retain that orange, shifting gently toward yellow.
		name: 'Warm orange metallic finish',
		color: '#ff8508',
		metalness: 0.95,
		roughness: 0.22,
		coat: 0.18,
		coatRoughness: 0.18,
		grain: 0.006
	},
	coverMetal: {
		name: 'Satin cast-metal cover',
		color: '#a7a7a7',
		metalness: 0.65,
		roughness: 0.38
	},
	timingCover: {
		name: 'Graphite metallic timing cover',
		color: '#46515d',
		metalness: 0.65,
		roughness: 0.29,
		coat: 0.18
	},
	structure: {
		name: 'Graphite coated casting',
		color: '#545d65',
		metalness: 0,
		roughness: 0.43,
		coat: 0.1,
		grain: 0.05
	},
	head: {
		name: 'Satin alloy casting',
		color: '#b0b8be',
		metalness: 1,
		roughness: 0.39,
		grain: 0.035
	},
	blackCoat: {
		name: 'Black satin coating',
		color: '#292f35',
		metalness: 0,
		roughness: 0.38,
		coat: 0.15,
		grain: 0.02
	},
	polymer: {
		name: 'Black engineering polymer',
		color: '#262b31',
		metalness: 0,
		roughness: 0.49,
		grain: 0.025
	},
	rubber: { name: 'Soft black elastomer', color: '#181d22', metalness: 0, roughness: 0.73 },
	aluminum: { name: 'Satin machined alloy', color: '#b8c2ca', metalness: 1, roughness: 0.3 },
	cast: {
		name: 'Fine alloy casting',
		color: '#a3acb3',
		metalness: 1,
		roughness: 0.46,
		grain: 0.05
	},
	steel: { name: 'Satin steel', color: '#919ba5', metalness: 1, roughness: 0.3 },
	polished: { name: 'Machined steel', color: '#a6b0ba', metalness: 1, roughness: 0.23 },
	liner: { name: 'Honed steel', color: '#89949d', metalness: 1, roughness: 0.28 },
	exhaust: {
		name: 'Warm cast exhaust metal',
		color: '#898580',
		metalness: 1,
		roughness: 0.42,
		grain: 0.045
	},
	turbine: {
		name: 'Dark heat-side casting',
		color: '#6f6962',
		metalness: 1,
		roughness: 0.49,
		grain: 0.05
	},
	fastener: { name: 'Satin plated hardware', color: '#87939e', metalness: 1, roughness: 0.29 }
} satisfies Record<string, Finish>;

function finishFor(material: THREE.MeshStandardMaterial, part: SourcePart): Finish {
	const source = material.userData.sourceMaterialName ?? material.name ?? part.sourceMaterial;
	// A single source body can include rubber, resin and metal primitives. Resolve each slot.
	if (/rubber/i.test(source)) return finishes.rubber;
	if (/plastic|acetal|resin/i.test(source)) return finishes.polymer;
	if (part.id === 'v12-0317') return finishes.timingCover;
	if (part.role === 'covers')
		return /Titanium.*Polished/i.test(source) || ['v12-0259', 'v12-0260'].includes(part.id)
			? finishes.orange
			: finishes.coverMetal;
	if (part.role === 'block') return finishes.structure;
	if (part.role === 'sump') return finishes.blackCoat;
	if (part.role === 'head')
		return /seat ring|valve guide/i.test(part.sourcePath) ? finishes.steel : finishes.head;
	if (part.role === 'intake') return finishes.blackCoat;
	if (part.role === 'exhaust') return finishes.exhaust;
	if (part.role === 'turbo') {
		if (/turbine_housing/i.test(part.sourcePath)) return finishes.turbine;
		if (/bearing_housing/i.test(part.sourcePath)) return finishes.steel;
		if (/compressor_cover/i.test(part.sourcePath)) return finishes.cast;
		return finishes.polished;
	}
	if (part.role === 'piston') return finishes.aluminum;
	if (part.role === 'liner') return finishes.liner;
	if (part.role === 'fasteners') return finishes.fastener;
	if (part.role === 'crankshaft' || part.role === 'camshaft') return finishes.polished;
	if (/powder coat/i.test(source)) return finishes.blackCoat;
	if (/aluminum/i.test(source)) return /polished/i.test(source) ? finishes.aluminum : finishes.cast;
	return finishes.steel;
}

/** A fine, antialiased roughness variation in source-object space; no UVs or normal changes. */
export function restoreV12MaterialDetail(material: THREE.Material) {
	const grain = Number(material.userData.displayRoughnessGrain ?? 0);
	const skirt = material.userData.pistonSkirtFiltering === true;
	if (!(material instanceof THREE.MeshStandardMaterial)) return;
	// StandardNodeLibrary transfers these node properties onto the WebGPU material.
	// Keep source standard/physical classes so opacity, pooling and asset provenance
	// retain their existing behavior. Clones reconstruct nodes here from userData.
	const nodeMaterial = material as THREE.MeshStandardMaterial &
		Pick<MeshStandardNodeMaterial, 'roughnessNode' | 'normalNode' | 'maskShadowNode'>;
	// WebGPU does not consume Mesh.customDepthMaterial. Use its native shadow-only
	// mask to preserve the smooth coverage return when leaving mechanism/X-ray.
	nodeMaterial.maskShadowNode = smoothstep(
		0.12,
		1,
		reference('opacity', 'float', material)
	).greaterThanEqual(shadowCoverageThreshold(screenCoordinate.xy) as Node<'float'>);
	if (!grain && !skirt) return;
	if (grain) {
		const p = positionLocal.mul(42);
		const footprint = max(p.dFdx().length(), p.dFdy().length());
		const visibility = float(1).sub(smoothstep(0.35, 0.9, footprint));
		const amplitude = reference('displayRoughnessGrain', 'float', material.userData);
		nodeMaterial.roughnessNode = materialRoughness
			.add(mx_noise_float(p).mul(0.5).mul(amplitude).mul(visibility))
			.clamp(0.08, 1);
	}
	if (skirt) {
		const detail = attribute('pistonSkirtDetail', 'vec3');
		const macro = varying(
			modelNormalMatrix.mul(attribute('pistonSkirtMacroNormal', 'vec3'))
		).normalize();
		const millimetreScale = varying(
			detail.z.mul(modelViewMatrix.mul(vec4(1, 0, 0, 0)).xyz.length())
		);
		const footprint = max(positionView.dFdx().length(), positionView.dFdy().length()).div(
			max(millimetreScale, 0.000001)
		);
		const blend = smoothstep(0.15, 0.65, footprint).mul(varying(detail.y));
		nodeMaterial.normalNode = mix(normalView, macro.mul(faceDirection), blend).normalize();
	}
	material.onBeforeCompile = (shader) => {
		if (skirt) applyV12PistonSurfaceShader(shader);
		if (!grain) return;
		shader.uniforms.uFinishGrain = { value: grain };
		shader.vertexShader = shader.vertexShader
			.replace('#include <common>', '#include <common>\nvarying vec3 vFinishPosition;')
			.replace('#include <begin_vertex>', '#include <begin_vertex>\nvFinishPosition = position;');
		shader.fragmentShader = shader.fragmentShader
			.replace(
				'#include <common>',
				`#include <common>
varying vec3 vFinishPosition;
uniform float uFinishGrain;
float finishHash(vec3 p) {
	p = fract(p * 0.1031);
	p += dot(p, p.yzx + 33.33);
	return fract((p.x + p.y) * p.z);
}
float finishNoise(vec3 p) {
	vec3 cell = floor(p), f = fract(p);
	f = f * f * (3.0 - 2.0 * f);
	return mix(mix(mix(finishHash(cell), finishHash(cell + vec3(1,0,0)), f.x),
		mix(finishHash(cell + vec3(0,1,0)), finishHash(cell + vec3(1,1,0)), f.x), f.y),
		mix(mix(finishHash(cell + vec3(0,0,1)), finishHash(cell + vec3(1,0,1)), f.x),
		mix(finishHash(cell + vec3(0,1,1)), finishHash(cell + vec3(1,1,1)), f.x), f.y), f.z);
}`
			)
			.replace(
				'#include <roughnessmap_fragment>',
				`#include <roughnessmap_fragment>
vec3 finishP = vFinishPosition * 42.0;
float finishFootprint = max(length(dFdx(finishP)), length(dFdy(finishP)));
float finishVisibility = 1.0 - smoothstep(0.35, 0.9, finishFootprint);
roughnessFactor = clamp(roughnessFactor + (finishNoise(finishP) - 0.5) * uFinishGrain * finishVisibility, 0.08, 1.0);`
			);
	};
	// Grain is a uniform: finishes share the same program while retaining individual surfaces.
	material.customProgramCacheKey = () => `v12-finish-grain-v1-skirt-${Number(skirt)}`;
}

export function applyV12Material(material: THREE.Material, part: SourcePart) {
	if (!(material instanceof THREE.MeshStandardMaterial)) return;
	const finish = finishFor(material, part);
	material.color.set(finish.color);
	material.metalness = finish.metalness;
	material.roughness = finish.roughness;
	material.envMapIntensity = 0.9;
	material.clipShadows = true;
	material.userData.displayFinish = finish.name;
	material.userData.displayFinishPolicy = 'Authored appearance; production composition unverified';
	material.userData.displayRoughnessGrain = finish.grain ?? 0;
	material.userData.pistonSkirtFiltering = part.role === 'piston';
	if (material instanceof THREE.MeshPhysicalMaterial) {
		// The source uses [2,2,2], including on resin and rubber. Restore neutral dielectric response.
		material.specularColor.setRGB(1, 1, 1);
		material.specularIntensity = 1;
		material.ior = 1.5;
		material.clearcoat = finish.coat ?? 0;
		material.clearcoatRoughness = finish.coatRoughness ?? 0.32;
		material.anisotropy = 0;
	}
	restoreV12MaterialDetail(material);
}
