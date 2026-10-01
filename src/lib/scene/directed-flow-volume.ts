import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { v12NativeToDisplay } from '../engine/v12-kinematics';

export interface DirectedFlowRoute {
	id: string;
	/** Ordered from physical upstream to downstream, in native millimetres. */
	pointsMm: readonly (readonly number[])[];
	radiusMm: number;
	gate: number;
	/** Shared network coordinate: adjacent segments must agree at their common endpoint. */
	distanceOffsetMm?: number;
	/** Keep measured field polylines unsmoothed; inferred connectors can be rounded. */
	smooth?: boolean;
}

class PolylineCurve extends THREE.Curve<THREE.Vector3> {
	private readonly lengths = [0];
	constructor(private readonly points: THREE.Vector3[]) {
		super();
		for (let i = 1; i < points.length; i++)
			this.lengths.push(this.lengths[i - 1] + points[i].distanceTo(points[i - 1]));
	}
	getLength() {
		return this.lengths[this.lengths.length - 1];
	}
	getPointAt(t: number, out = new THREE.Vector3()) {
		return this.getPoint(t, out);
	}
	getTangentAt(t: number, out = new THREE.Vector3()) {
		return this.getTangent(t, out);
	}
	getPoint(t: number, out = new THREE.Vector3()) {
		const length = t * this.lengths[this.lengths.length - 1];
		let i = 1;
		while (i < this.lengths.length - 1 && this.lengths[i] < length) i++;
		return out.lerpVectors(
			this.points[i - 1],
			this.points[i],
			(length - this.lengths[i - 1]) / (this.lengths[i] - this.lengths[i - 1])
		);
	}
}

export function directedFlowLengthMm(points: readonly (readonly number[])[]): number {
	let length = 0;
	for (let i = 1; i < points.length; i++)
		length += Math.hypot(...points[i].map((value, axis) => value - points[i - 1][axis]));
	return length;
}

/** Positive time always moves downstream. The pulse has a short head and a soft trailing body. */
export const DIRECTED_FLOW_SPEED_MM_S = 220;
export const DIRECTED_FLOW_PITCH_MM = 96;
export function directedFlowPulse(distanceMm: number, seconds: number): number {
	const tail =
		(((seconds * DIRECTED_FLOW_SPEED_MM_S - distanceMm) % DIRECTED_FLOW_PITCH_MM) +
			DIRECTED_FLOW_PITCH_MM) %
		DIRECTED_FLOW_PITCH_MM;
	return Math.exp(-tail / 16) * Math.min(1, (DIRECTED_FLOW_PITCH_MM - tail) / 3);
}

/** Static, merged geometry with GPU advection. These are explanatory flow envelopes, not pipe solids. */
export class DirectedFlowVolume {
	readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
	private readonly gates = new Float32Array(64);
	private readonly plane = new THREE.Plane();
	private readonly clips = [this.plane];
	private disposed = false;
	constructor(
		readonly routes: readonly DirectedFlowRoute[],
		color: number,
		name: string,
		options: { baseOpacity?: number; throughSolids?: boolean } = {}
	) {
		const geometries: THREE.BufferGeometry[] = [];
		for (const route of routes) {
			if (route.gate < 0 || route.gate >= 64 || route.pointsMm.length < 2)
				throw new RangeError(`Invalid flow route ${route.id}`);
			const points = route.pointsMm.map((p) => new THREE.Vector3(...v12NativeToDisplay(p)));
			const curve =
				route.smooth && points.length > 2
					? new THREE.CatmullRomCurve3(points, false, 'centripetal')
					: new PolylineCurve(points);
			const scale = new THREE.Vector3(...v12NativeToDisplay([1, 0, 0])).distanceTo(
				new THREE.Vector3(...v12NativeToDisplay([0, 0, 0]))
			);
			const lengthMm = curve.getLength() / scale;
			const geometry = new THREE.TubeGeometry(
				curve,
				Math.max(8, Math.ceil(lengthMm / 4)),
				route.radiusMm * scale,
				8,
				false
			);
			const count = geometry.getAttribute('position').count;
			geometry.setAttribute(
				'aGate',
				new THREE.BufferAttribute(new Float32Array(count).fill(route.gate), 1)
			);
			const distances = new Float32Array(count);
			for (let i = 0; i < count; i++)
				distances[i] =
					(route.distanceOffsetMm ?? 0) + geometry.getAttribute('uv').getX(i) * lengthMm;
			geometry.setAttribute('aDistance', new THREE.BufferAttribute(distances, 1));
			geometries.push(geometry);
		}
		const geometry = mergeGeometries(geometries)!;
		geometries.forEach((g) => g.dispose());
		const material = new THREE.ShaderMaterial({
			uniforms: {
				uDepth: { value: null },
				uResolution: { value: new THREE.Vector2(1, 1) },
				uHasDepth: { value: 0 },
				uTime: { value: 0 },
				uGates: { value: this.gates },
				uColor: { value: new THREE.Color(color) }
			},
			vertexShader: `
				attribute float aGate; attribute float aDistance;
				varying float vGate; varying float vDistance; varying vec3 vNormal; varying vec3 vView;
				#include <clipping_planes_pars_vertex>
				void main(){
					vGate=aGate; vDistance=aDistance; vNormal=normalize(normalMatrix*normal);
					vec4 mvPosition=modelViewMatrix*vec4(position,1.0); vView=-mvPosition.xyz;
					gl_Position=projectionMatrix*mvPosition;
					#include <clipping_planes_vertex>
				}`,
			fragmentShader: `
				uniform float uTime; uniform float uGates[64]; uniform vec3 uColor;
				uniform sampler2D uDepth; uniform vec2 uResolution; uniform float uHasDepth;
				varying float vGate; varying float vDistance; varying vec3 vNormal; varying vec3 vView;
				#include <clipping_planes_pars_fragment>
				void main(){
					#include <clipping_planes_fragment>
					float gain=uGates[int(vGate+0.5)];
					float tail=mod(uTime*${DIRECTED_FLOW_SPEED_MM_S.toFixed(1)}-vDistance,${DIRECTED_FLOW_PITCH_MM.toFixed(1)});
					float pulse=exp(-tail/16.0)*min(1.0,(${DIRECTED_FLOW_PITCH_MM.toFixed(1)}-tail)/3.0);
					float radial=pow(max(0.0,dot(normalize(vNormal),normalize(vView))),0.7);
					float alpha=radial*(${(options.baseOpacity ?? 0.14).toFixed(3)}+gain*(0.12+0.55*pulse));
					if(uHasDepth>0.5 && gl_FragCoord.z>texture2D(uDepth,gl_FragCoord.xy/uResolution).r+0.000002) alpha*=0.52;
					gl_FragColor=vec4(uColor,alpha);
					#include <colorspace_fragment>
				}`,
			transparent: true,
			depthWrite: false,
			depthTest: !options.throughSolids,
			clipping: true,
			toneMapped: false,
			side: THREE.FrontSide
		});
		this.mesh = new THREE.Mesh(geometry, material);
		this.mesh.name = name;
		this.mesh.renderOrder = 1;
		this.mesh.frustumCulled = false;
		this.mesh.visible = false;
	}
	setDepth(texture: THREE.DepthTexture, width: number, height: number) {
		const u = this.mesh.material.uniforms;
		u.uDepth.value = texture;
		u.uResolution.value.set(width, height);
		u.uHasDepth.value = this.mesh.material.depthTest ? 0 : 1;
	}
	update(
		seconds: number,
		visible: boolean,
		gains: readonly number[],
		clipPlane: THREE.Plane | null
	) {
		if (this.disposed) return;
		this.mesh.visible = visible;
		if (!visible) return;
		if (!Number.isFinite(seconds)) throw new RangeError('Finite flow clock required');
		this.mesh.material.uniforms.uTime.value = seconds;
		for (let i = 0; i < this.gates.length; i++)
			this.gates[i] = Math.max(0, Math.min(1, gains[i] ?? 0));
		if (clipPlane) this.plane.copy(clipPlane);
		if (!!clipPlane !== !!this.mesh.material.clippingPlanes?.length) {
			this.mesh.material.clippingPlanes = clipPlane ? this.clips : null;
			this.mesh.material.needsUpdate = true;
		}
	}
	getDiagnostics() {
		return {
			routes: this.routes.length,
			drawCalls: 1,
			visible: this.mesh.visible,
			activeRoutes: this.routes.filter((r) => this.gates[r.gate] > 0).length,
			vertices: this.mesh.geometry.getAttribute('position').count,
			scope: 'Directed explanatory flow envelopes; not a transient flow solution'
		};
	}
	dispose() {
		if (this.disposed) return;
		this.disposed = true;
		this.mesh.visible = false;
		this.mesh.geometry.dispose();
		this.mesh.material.dispose();
	}
}
