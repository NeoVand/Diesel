import * as THREE from 'three';

/** Ghosted casings cast no opaque shadow; coverage returns continuously with the surface. */
export function opacityShadowCoverage(opacity: number): number {
	const t = THREE.MathUtils.clamp((opacity - 0.12) / 0.88, 0, 1);
	return t * t * (3 - 2 * t);
}

/** Keep depth ordering stable through the transparent-to-opaque render-queue handoff. */
export function applyV12Opacity(
	mesh: THREE.Mesh,
	opacity: number,
	eligibleShadowCaster: boolean
): void {
	const shadowCoverage = opacityShadowCoverage(opacity);
	mesh.castShadow = eligibleShadowCaster && shadowCoverage > 0;
	if (eligibleShadowCaster) {
		// Hash only the shadow depth pass. The visible surface remains smooth alpha blending.
		// BasicDepthPacking keeps the opacity uniform in Three's depth shader; this renderer
		// consumes the native shadow depth texture, not packed RGBA depth.
		mesh.customDepthMaterial ??= new THREE.MeshDepthMaterial({
			alphaHash: true,
			depthPacking: THREE.BasicDepthPacking
		});
		mesh.customDepthMaterial.opacity = shadowCoverage;
	}
	for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
		const transparent = opacity < 1;
		if (material.transparent !== transparent) {
			material.transparent = transparent;
			material.needsUpdate = true;
		}
		material.depthWrite = true;
		material.forceSinglePass = true;
		material.opacity = opacity;
	}
}
