import * as THREE from 'three';
import { MeshBasicNodeMaterial, type Node } from 'three/webgpu';
import {
	reference,
	uniformTexture,
	uniformArray,
	mix,
	vec3,
	positionGeometry,
	varying
} from 'three/tsl';

type ProcessUniforms = Record<string, { value: unknown }>;

/** Native node material with explicit, inspectable process inputs. Never compiles legacy GLSL. */
export class ProcessNodeMaterial<
	U extends ProcessUniforms = ProcessUniforms
> extends MeshBasicNodeMaterial {
	readonly processNodes: Record<string, Node> = {};
	private readonly fallbackDepth = new THREE.DepthTexture(1, 1, THREE.UnsignedIntType);
	// An unattached depth texture inherits canvas MSAA during compileAsync. Pin its
	// source target to one sample so the binding remains texture_depth_2d in every pass.
	private readonly fallbackTarget = new THREE.RenderTarget(1, 1, {
		depthTexture: this.fallbackDepth,
		samples: 0
	});
	constructor(
		readonly uniforms: U,
		options: THREE.MeshBasicMaterialParameters = {}
	) {
		super(options);
		this.fog = false;
		for (const [name, input] of Object.entries(uniforms)) {
			const value = input.value;
			if (name === 'uDepth' || value instanceof THREE.Texture) {
				const node = uniformTexture((value as THREE.Texture | null) ?? this.fallbackDepth);
				Object.defineProperty(input, 'value', {
					get: () => node.value,
					set: (next: THREE.Texture) => (node.value = next),
					configurable: true
				});
				this.processNodes[name] = node;
			} else if (Array.isArray(value)) {
				// Shader gates are shared mutable arrays. Valve vectors get individual uniform references.
				if (typeof value[0] === 'number') this.processNodes[name] = uniformArray(value, 'float');
			} else {
				const type =
					value instanceof THREE.Vector2
						? 'vec2'
						: value instanceof THREE.Color
							? 'color'
							: value instanceof THREE.Vector3
								? 'vec3'
								: value instanceof THREE.Vector4
									? 'vec4'
									: value instanceof THREE.Matrix4
										? 'mat4'
										: 'float';
				this.processNodes[name] = reference('value', type, input);
			}
		}
	}
	/** Bounding box position remains in the recovered native-mm coordinate frame. */
	boundedPosition() {
		const point = varying(
			mix(
				vec3(this.processNodes.uMin as Node<'vec3'>),
				vec3(this.processNodes.uMax as Node<'vec3'>),
				positionGeometry.add(0.5)
			)
		);
		this.positionNode = point;
		return point;
	}
	override dispose() {
		this.fallbackTarget.dispose();
		this.fallbackDepth.dispose();
		super.dispose();
	}
}
