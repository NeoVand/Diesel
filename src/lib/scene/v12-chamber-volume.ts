import * as THREE from 'three';
import { V12ChamberDomain } from './v12-chamber-domain';
import { v12ProcessCycle } from '../engine/v12-process-cycle';
import { DIRECTED_FLOW_PITCH_MM, DIRECTED_FLOW_SPEED_MM_S } from './directed-flow-volume';

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
 uniform sampler2D uBounds;
 uniform sampler2D uDepth;
 uniform vec2 uResolution;
 uniform mat4 uModel;
 uniform mat4 uViewProjection;
 uniform float uPin;
 uniform float uNozzle;
 uniform float uBurn;
 uniform float uSpray;
 uniform float uIntake;
 uniform float uExhaust;
 uniform float uPhase;
 uniform float uTravelMm;
 uniform float uHasDepth;
 uniform float uHasClip;
 uniform vec4 uPlane;
 uniform vec3 uValveCenters[4];
 uniform vec3 uValveAxes[4];
 vec2 hitBox(vec3 o,vec3 d) {
   vec3 safe=sign(d+vec3(1e-8))*max(abs(d),vec3(1e-7));
   vec3 t0=(uMin-o)/safe,t1=(uMax-o)/safe;
   vec3 mn=min(t0,t1),mx=max(t0,t1);
   return vec2(max(max(mn.x,mn.y),mn.z),min(min(mx.x,mx.y),mx.z));
 }
 bool gas(vec3 p) {
   if(dot(p.xz,p.xz)>1722.25)return false;
   vec2 h=texture2D(uBounds,(p.xz+42.0)/84.0).rg;
   if(p.y<=h.x+uPin||p.y>=h.y)return false;
   for(int i=0;i<4;i++) {
     vec3 q=p-uValveCenters[i];float ax=dot(q,uValveAxes[i]);
     float r=dot(q,q)-ax*ax;
     if(ax> -3.0&&ax<5.0&&r<196.0)return false;
     if(ax>=0.0&&ax<85.0&&r<4.0)return false;
   }
   return true;
 }
 float envelope(vec3 p) {
   vec3 q=p-vec3(0.0,uNozzle-0.18,0.0);
   float sum=0.0;
   for(int i=0;i<8;i++) {
     float a=float(i)*0.7853981634;
     vec3 d=vec3(0.93969262*cos(a),-0.34202014,0.93969262*sin(a));
     float along=dot(q,d);
     if(along<0.0||along>45.0)continue;
     float radius=0.7+along*(0.055+uBurn*0.045);
     float radial=length(q-d*along);
     float mixing=exp(-0.5*radial*radial/(radius*radius));
     float extent=1.0-smoothstep(18.0+8.0*uBurn,31.0+10.0*uBurn,along);
     float prepared=smoothstep(1.0,6.0,along);
     sum+=mixing*extent*prepared;
   }
   // Deterministic spatial modulation is illustrative mixing, never a temperature contour.
   float fine=0.84+0.16*sin(p.x*0.78+sin(p.z*0.63)+uPhase)*sin(p.y*0.86-p.z*0.47);
   return min(sum,1.8)*fine;
 }
 void main() {
   vec3 direction=normalize(vPoint-uCamera);
   vec2 hit=hitBox(uCamera,direction);
   float start=max(hit.x,0.0), finish=hit.y;
   if(finish<=start)discard;
   bool reacting=uBurn+uSpray>0.003;
   float steps=reacting?64.0:32.0;
   float stepSize=(finish-start)/steps;
   float depth=texture2D(uDepth,gl_FragCoord.xy/uResolution).r;
   vec4 accum=vec4(0.0);
   for(int i=0;i<64;i++) {
     if(float(i)>=steps)break;
     vec3 p=uCamera+direction*(start+(float(i)+0.5)*stepSize);
     vec4 world=uModel*vec4(p,1.0);
     if(uHasClip>0.5&&dot(uPlane,world)<0.0)continue;
     if(uHasDepth>0.5) {
       vec4 projected=uViewProjection*vec4(p,1.0);
       if(projected.z/projected.w*0.5+0.5>depth+0.000001)break;
     }
     if(!gas(p))continue;
     float reaction=reacting?envelope(p):0.0;
     // The broader, dimmer reacting charge follows the eight jet cores into the bowl.
     // Every sample still passes the native moving gas-domain and opaque-depth tests above.
     float mixingGlow=exp(-dot(p.xz,p.xz)/900.0)*(1.0-smoothstep(18.0,42.0,uNozzle-p.y));
     float sprayDensity=reaction*(0.085*uBurn+0.014*uSpray)+0.014*uBurn*mixingGlow;
     // A bounded gas charge makes the head-to-cylinder relationship readable. It follows the
     // recovered moving crown/head envelope and valve exclusions; color is a process key.
     // Intake travels down from the head (-axial), exhaust returns toward the head (+axial).
     // Use the unwrapped drive clock so a 720-degree cycle boundary never resets the pattern.
     float intakeWave=0.88+0.12*sin((p.y+uTravelMm)*${((2 * Math.PI) / DIRECTED_FLOW_PITCH_MM).toFixed(10)});
     float exhaustWave=0.88+0.12*sin((p.y-uTravelMm)*${((2 * Math.PI) / DIRECTED_FLOW_PITCH_MM).toFixed(10)});
     float exchangeDensity=0.009*uIntake*intakeWave+0.007*uExhaust*exhaustWave;
     float density=sprayDensity+exchangeDensity;
     float alpha=1.0-exp(-density*stepSize);
     // Radiant hot cores and a softer amber reaction zone. Optical emission only: these
     // intensities are a teaching treatment, not inferred flame temperature or radiometry.
     vec3 flame=mix(vec3(2.2,0.56,0.055),vec3(4.4,2.25,0.62),smoothstep(0.15,1.1,reaction));
     vec3 color=mix(vec3(0.61,0.69,0.74),flame,clamp(uBurn*1.6,0.0,1.0));
     vec3 gasColor=mix(vec3(0.28,0.72,0.84),vec3(0.89,0.40,0.19),uExhaust/max(0.0001,uIntake+uExhaust));
     color=mix(gasColor,color,sprayDensity/max(0.0001,density));
     accum.rgb+=(1.0-accum.a)*alpha*color;
     accum.a+=(1.0-accum.a)*alpha;
     if(accum.a>0.95)break;
   }
   if(accum.a<0.001)discard;
   gl_FragColor=vec4(accum.rgb/accum.a,accum.a);
   #include <colorspace_fragment>
   #include <premultiplied_alpha_fragment>
 }`;

/** Emission/absorption integration of a declared spray-region envelope, clipped to recovered gas bounds. */
export class V12ChamberVolume {
	readonly mesh: THREE.Mesh<THREE.BoxGeometry, THREE.ShaderMaterial>;
	private readonly inverse: THREE.Matrix4;
	private readonly camera = new THREE.Vector3();
	constructor(readonly domain: V12ChamberDomain) {
		const uniforms = {
			uMin: { value: new THREE.Vector3(-42, 100, -42) },
			uMax: { value: new THREE.Vector3(42, 221, 42) },
			uBounds: { value: domain.texture },
			uDepth: { value: null },
			uResolution: { value: new THREE.Vector2(1, 1) },
			uCamera: { value: this.camera },
			uModel: { value: domain.toWorld },
			uViewProjection: { value: new THREE.Matrix4() },
			uPin: { value: 0 },
			uNozzle: { value: domain.datum.nozzleAxialMm },
			uBurn: { value: 0 },
			uSpray: { value: 0 },
			uIntake: { value: 0 },
			uExhaust: { value: 0 },
			uPhase: { value: 0 },
			uTravelMm: { value: 0 },
			uHasDepth: { value: 0 },
			uHasClip: { value: 0 },
			uPlane: { value: new THREE.Vector4() },
			uValveCenters: { value: domain.valveCenters },
			uValveAxes: { value: domain.valveAxes }
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
		this.mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
		this.mesh.name = `Bounded spray/combustion volume ${domain.datum.pistonId}`;
		this.mesh.matrixAutoUpdate = false;
		this.mesh.matrix.copy(domain.toWorld);
		this.inverse = domain.toWorld.clone().invert();
		this.mesh.frustumCulled = false;
		this.mesh.visible = false;
		this.mesh.renderOrder = -1;
		this.mesh.onBeforeRender = (_renderer, _scene, camera) => {
			this.camera.setFromMatrixPosition(camera.matrixWorld).applyMatrix4(this.inverse);
			uniforms.uViewProjection.value
				.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
				.multiply(domain.toWorld);
		};
	}
	update(
		phase: number,
		fuel: boolean,
		combustion: boolean,
		clipPlane: THREE.Plane | null,
		air = false,
		exhaust = false,
		flowSeconds = phase / 90
	) {
		const cycle = v12ProcessCycle(this.domain.cylinder, phase),
			u = this.mesh.material.uniforms;
		u.uPin.value = this.domain.pinAxialMm;
		u.uMin.value.y = this.domain.pinAxialMm + 28;
		u.uMax.value.y = this.domain.datum.nozzleAxialMm;
		u.uBurn.value = combustion ? cycle.combustion : 0;
		u.uSpray.value = fuel ? cycle.injection : 0;
		u.uIntake.value = air ? Math.sqrt(cycle.intake) : 0;
		u.uExhaust.value = exhaust ? Math.sqrt(cycle.exhaust) : 0;
		u.uPhase.value = (cycle.cycleDeg * Math.PI) / 180;
		u.uTravelMm.value = flowSeconds * DIRECTED_FLOW_SPEED_MM_S;
		u.uHasClip.value = clipPlane ? 1 : 0;
		if (clipPlane) u.uPlane.value.set(...clipPlane.normal.toArray(), clipPlane.constant);
		this.mesh.visible = u.uBurn.value + u.uSpray.value + u.uIntake.value + u.uExhaust.value > 0.003;
	}
	get heatRelease(): number {
		return this.mesh.visible ? this.mesh.material.uniforms.uBurn.value : 0;
	}
	setDepth(texture: THREE.DepthTexture, width: number, height: number) {
		const u = this.mesh.material.uniforms;
		u.uDepth.value = texture;
		u.uResolution.value.set(width, height);
		u.uHasDepth.value = 1;
	}
	dispose() {
		this.mesh.geometry.dispose();
		this.mesh.material.dispose();
	}
}
