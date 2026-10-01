import * as THREE from 'three';
import datums from '../engine/v12-exhaust-outlet-datums.json';
import { v12NativeToDisplay, v12NativeVectorToDisplay } from '../engine/v12-kinematics';
import { DIRECTED_FLOW_PITCH_MM, DIRECTED_FLOW_SPEED_MM_S } from './directed-flow-volume';

export const V12_EXHAUST_OUTLETS = datums;
export const V12_EXHAUST_PLUME = {
	lengthMm: 150,
	startMm: -4,
	steps: 32,
	// These are optical presentation dimensions, not inferred exhaust mass flow or emissions.
	coreRadiusMm: 16,
	spreadMm: 10,
	speedMmS: DIRECTED_FLOW_SPEED_MM_S,
	pitchMm: DIRECTED_FLOW_PITCH_MM
} as const;

/** Local z is strictly outward. Local x/y span the recovered 60 mm diameter mouth. */
export function v12ExhaustOutletFrame(instance: number): THREE.Matrix4 {
	const outlet = datums.outlets[instance];
	if (!outlet) throw new RangeError('Unknown exhaust outlet');
	const z = new THREE.Vector3(...outlet.axis).normalize();
	const x = new THREE.Vector3(0, 1, 0).cross(z).normalize();
	const y = z.clone().cross(x).normalize();
	return new THREE.Matrix4()
		.makeBasis(
			new THREE.Vector3(...v12NativeVectorToDisplay(x.toArray())),
			new THREE.Vector3(...v12NativeVectorToDisplay(y.toArray())),
			new THREE.Vector3(...v12NativeVectorToDisplay(z.toArray()))
		)
		.setPosition(...v12NativeToDisplay(outlet.centerMm));
}

const vertexShader = `
 varying vec3 vPoint;
 uniform vec3 uMin;
 uniform vec3 uMax;
 void main() {
   vPoint=mix(uMin,uMax,position+0.5);
   gl_Position=projectionMatrix*modelViewMatrix*vec4(vPoint,1.0);
 }`;
const fragmentShader = `
 precision highp float;
 varying vec3 vPoint;
 uniform vec3 uCamera;
 uniform vec3 uMin;
 uniform vec3 uMax;
 uniform sampler2D uDepth;
 uniform vec2 uResolution;
 uniform mat4 uModel;
 uniform mat4 uViewProjection;
 uniform float uTime;
 uniform float uGain;
 uniform float uHasDepth;
 uniform float uHasClip;
 uniform vec4 uPlane;
 vec2 hitBox(vec3 o,vec3 d) {
   // Camera-aligned views can have exactly zero ray components.
   vec3 safe=sign(d+vec3(1e-8))*max(abs(d),vec3(1e-7));
   vec3 t0=(uMin-o)/safe,t1=(uMax-o)/safe;
   vec3 mn=min(t0,t1),mx=max(t0,t1);
   return vec2(max(max(mn.x,mn.y),mn.z),min(min(mx.x,mx.y),mx.z));
 }
 void main() {
   vec3 direction=normalize(vPoint-uCamera);
   vec2 hit=hitBox(uCamera,direction);
   float start=max(hit.x,0.0),finish=hit.y;
   if(finish<=start)discard;
   float stepSize=(finish-start)/${V12_EXHAUST_PLUME.steps.toFixed(1)};
   float depth=texture2D(uDepth,gl_FragCoord.xy/uResolution).r;
   vec4 accum=vec4(0.0);
   for(int i=0;i<${V12_EXHAUST_PLUME.steps};i++) {
     vec3 p=uCamera+direction*(start+(float(i)+0.5)*stepSize);
     vec4 world=uModel*vec4(p,1.0);
     if(uHasClip>0.5&&dot(uPlane,world)<0.0)continue;
     if(uHasDepth>0.5) {
       vec4 projected=uViewProjection*vec4(p,1.0);
       if(projected.z/projected.w*0.5+0.5>depth+0.000001)break;
     }
     float progress=clamp(p.z/${V12_EXHAUST_PLUME.lengthMm.toFixed(1)},0.0,1.0);
     float radius=${V12_EXHAUST_PLUME.coreRadiusMm.toFixed(1)}+${V12_EXHAUST_PLUME.spreadMm.toFixed(1)}*progress;
     // All time-dependent structure is transported toward +z. There is no reverse/noise velocity.
     float tail=mod(uTime*${DIRECTED_FLOW_SPEED_MM_S.toFixed(1)}-p.z,${DIRECTED_FLOW_PITCH_MM.toFixed(1)});
     float frontWidth=mix(3.0,18.0,smoothstep(0.0,0.7,progress));
     float pulse=exp(-tail/(16.0+progress*10.0))*smoothstep(0.0,frontWidth,${DIRECTED_FLOW_PITCH_MM.toFixed(1)}-tail);
     vec2 radial=p.xy-vec2(0.0,8.0*progress*progress);
     float normalizedRadius=length(radial)/radius;
     float envelope=exp(-2.8*normalizedRadius*normalizedRadius);
     envelope*=1.0-smoothstep(1.1,1.8,normalizedRadius);
     envelope*=smoothstep(${V12_EXHAUST_PLUME.startMm.toFixed(1)},0.0,p.z);
     envelope*=1.0-smoothstep(40.0,${V12_EXHAUST_PLUME.lengthMm.toFixed(1)},p.z);
     float convected=p.z-uTime*${DIRECTED_FLOW_SPEED_MM_S.toFixed(1)};
     float wisps=0.86+0.14*sin(convected*0.047+radial.x*0.11)*sin(radial.y*0.13+convected*0.037);
     float density=0.015*envelope*(0.52+0.48*pulse)*wisps*uGain;
     float alpha=1.0-exp(-density*stepSize);
     // Warm neutral at the measured rim, cooling to a faint neutral haze. This color is a process key.
     vec3 color=mix(vec3(0.77,0.56,0.41),vec3(0.51,0.60,0.65),smoothstep(0.0,0.8,progress));
     accum.rgb+=(1.0-accum.a)*alpha*color;
     accum.a+=(1.0-accum.a)*alpha;
   }
   if(accum.a<0.001)discard;
   gl_FragColor=vec4(accum.rgb/accum.a,accum.a);
   #include <colorspace_fragment>
   #include <premultiplied_alpha_fragment>
 }`;

/** Continuous optical density at measured rims; no particles, smoke/emissions claim, or solved jet. */
export class V12ExhaustOutlet {
	readonly group = new THREE.Group();
	private readonly geometry = new THREE.BoxGeometry(1, 1, 1);
	private readonly meshes: THREE.Mesh<THREE.BoxGeometry, THREE.ShaderMaterial>[];
	private disposed = false;
	constructor() {
		this.group.name = 'Measured exhaust mouths · bounded illustrative exit volumes';
		this.group.visible = false;
		this.meshes = datums.outlets.map((outlet, index) => {
			const toWorld = v12ExhaustOutletFrame(index);
			const inverse = toWorld.clone().invert();
			const camera = new THREE.Vector3();
			const uniforms = {
				uMin: { value: new THREE.Vector3(-48, -48, V12_EXHAUST_PLUME.startMm) },
				uMax: { value: new THREE.Vector3(48, 56, V12_EXHAUST_PLUME.lengthMm) },
				uCamera: { value: camera },
				uModel: { value: toWorld },
				uViewProjection: { value: new THREE.Matrix4() },
				uDepth: { value: null },
				uResolution: { value: new THREE.Vector2(1, 1) },
				uHasDepth: { value: 0 },
				uHasClip: { value: 0 },
				uPlane: { value: new THREE.Vector4() },
				uTime: { value: 0 },
				uGain: { value: 0 }
			};
			const material = new THREE.ShaderMaterial({
				uniforms,
				vertexShader,
				fragmentShader,
				side: THREE.BackSide,
				transparent: true,
				depthTest: false,
				depthWrite: false,
				premultipliedAlpha: true,
				toneMapped: false
			});
			const mesh = new THREE.Mesh(this.geometry, material);
			mesh.name = `Continuous outward exhaust volume · ${outlet.componentId}`;
			mesh.matrixAutoUpdate = false;
			mesh.matrix.copy(toWorld);
			mesh.frustumCulled = false;
			mesh.visible = false;
			mesh.renderOrder = 2;
			mesh.onBeforeRender = (_renderer, _scene, viewCamera) => {
				camera.setFromMatrixPosition(viewCamera.matrixWorld).applyMatrix4(inverse);
				uniforms.uViewProjection.value
					.multiplyMatrices(viewCamera.projectionMatrix, viewCamera.matrixWorldInverse)
					.multiply(toWorld);
			};
			return mesh;
		});
		this.group.add(...this.meshes);
	}
	update(
		timeSeconds: number,
		visible: boolean,
		clipPlane: THREE.Plane | null,
		bankGains: readonly number[]
	) {
		if (this.disposed) return;
		if (!Number.isFinite(timeSeconds)) throw new RangeError('Finite exhaust clock required');
		this.group.visible = visible;
		for (const [index, mesh] of this.meshes.entries()) {
			const uniforms = mesh.material.uniforms;
			const gain = bankGains[index] ?? 0;
			uniforms.uTime.value = timeSeconds;
			uniforms.uGain.value = Number.isFinite(gain) ? Math.sqrt(Math.max(0, Math.min(1, gain))) : 0;
			uniforms.uHasClip.value = clipPlane ? 1 : 0;
			if (clipPlane) uniforms.uPlane.value.set(...clipPlane.normal.toArray(), clipPlane.constant);
			mesh.visible = visible && uniforms.uGain.value > 0;
		}
	}
	get needsDepth() {
		return this.group.visible && this.meshes.some((mesh) => mesh.visible);
	}
	setDepth(texture: THREE.DepthTexture, width: number, height: number) {
		for (const mesh of this.meshes) {
			const uniforms = mesh.material.uniforms;
			uniforms.uDepth.value = texture;
			uniforms.uResolution.value.set(width, height);
			uniforms.uHasDepth.value = 1;
		}
	}
	warmupVisibility(): () => void {
		const groupVisible = this.group.visible;
		const visible = this.meshes.map((mesh) => mesh.visible);
		this.group.visible = true;
		this.meshes.forEach((mesh) => (mesh.visible = true));
		return () => {
			this.group.visible = groupVisible;
			this.meshes.forEach((mesh, i) => (mesh.visible = visible[i]));
		};
	}
	getDiagnostics() {
		return {
			activeVolumes: this.group.visible ? this.meshes.filter((mesh) => mesh.visible).length : 0,
			drawObjects: this.disposed ? 0 : this.meshes.length,
			steps: V12_EXHAUST_PLUME.steps,
			presentation: 'Continuous bounded optical density, advected outward from measured rims',
			speedMmS: V12_EXHAUST_PLUME.speedMmS,
			opaqueDepth: this.meshes.every((mesh) => mesh.material.uniforms.uHasDepth.value === 1)
		};
	}
	dispose() {
		if (this.disposed) return;
		this.disposed = true;
		this.group.visible = false;
		this.geometry.dispose();
		this.meshes.forEach((mesh) => mesh.material.dispose());
		this.group.clear();
	}
}
