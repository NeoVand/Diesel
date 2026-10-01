import * as THREE from 'three';
import type { WebGPURenderer } from 'three/webgpu';

/**
 * Three r186 samples combined depth/stencil with an 'all' aspect view, which WebGPU
 * correctly rejects for texture_depth_2d. Keep both aspects in the render attachment
 * (section caps require stencil), but cache a depth-only sampled view for its binding.
 *
 * This narrow bridge follows the pinned r186 WebGPUBindingUtils view-cache key.
 * The real-GPU process regression exercises a depth24plus-stencil8 target with MSAA
 * canvas warmup, so a Three upgrade cannot silently invalidate this compatibility path.
 */
export function prepareProcessDepthView(renderer: WebGPURenderer, depth: THREE.DepthTexture) {
	if (depth.format !== THREE.DepthStencilFormat) return;
	// Backend inherits DataMap.get at runtime; r186's public declaration omits it.
	const backend = renderer.backend as unknown as {
		get(texture: THREE.Texture): { texture?: GPUTexture; [key: string]: unknown };
	};
	const data = backend.get(depth);
	const texture = data.texture;
	if (!texture) throw new Error('Process depth attachment was not allocated');
	const layers = texture.depthOrArrayLayers > 1 ? `-${texture.depthOrArrayLayers}` : '';
	const key = `view-${texture.width}-${texture.height}${layers}-${texture.mipLevelCount}-0`;
	if (!data[key]) {
		data[key] = texture.createView({
			aspect: 'depth-only',
			dimension: '2d',
			mipLevelCount: texture.mipLevelCount,
			baseMipLevel: 0
		});
	}
}
