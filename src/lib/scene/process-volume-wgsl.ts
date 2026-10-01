import { wgslFn, wgsl } from 'three/tsl';

// Native WebGPU clip depth is [0,1]. Do not apply the legacy WebGL z*0.5+0.5 mapping.
// textureLoad avoids derivative restrictions inside the non-uniform ray-march loop.
export const processBoxHit =
	wgsl(`fn processBoxHit(o: vec3f, d: vec3f, lo: vec3f, hi: vec3f) -> vec2f {
 let safe = select(vec3f(-1.0),vec3f(1.0),d>=vec3f(0.0))*max(abs(d),vec3f(1e-7));
 let t0=(lo-o)/safe; let t1=(hi-o)/safe;
 let mn=min(t0,t1); let mx=max(t0,t1);
 return vec2f(max(max(mn.x,mn.y),mn.z),min(min(mx.x,mx.y),mx.z));
}`);

export const exhaustVolume = wgslFn(
	`fn exhaustVolume(
 vPoint:vec3f, pixel:vec2f, uCamera:vec3f, uMin:vec3f, uMax:vec3f,
 uDepth:texture_depth_2d, uModel:mat4x4f, uViewProjection:mat4x4f,
 uTime:f32, uGain:f32, uHasDepth:f32, uHasClip:f32, uPlane:vec4f
) -> vec4f {
 let direction=normalize(vPoint-uCamera);
 let hit=processBoxHit(uCamera,direction,uMin,uMax);
 let start=max(hit.x,0.0); let finish=hit.y;
 if(finish<=start){discard;}
 let stepSize=(finish-start)/32.0;
 let depth=textureLoad(uDepth,vec2i(pixel),0);
 var accum=vec4f(0.0);
 for(var i=0;i<32;i++) {
   let p=uCamera+direction*(start+(f32(i)+0.5)*stepSize);
   let world=uModel*vec4f(p,1.0);
   if(uHasClip>0.5&&dot(uPlane,world)<0.0){continue;}
   if(uHasDepth>0.5) {
     let projected=uViewProjection*vec4f(p,1.0);
     if(projected.z/projected.w>depth+0.000001){break;}
   }
   let progress=clamp(p.z/150.0,0.0,1.0);
   let radius=16.0+10.0*progress;
   // Every time-dependent feature translates toward the measured outward +z axis.
   let advected=uTime*220.0-p.z;
   let tail=advected-floor(advected/96.0)*96.0;
   let frontWidth=mix(3.0,18.0,smoothstep(0.0,0.7,progress));
   let pulse=exp(-tail/(16.0+progress*10.0))*smoothstep(0.0,frontWidth,96.0-tail);
   let radial=p.xy-vec2f(0.0,8.0*progress*progress);
   let normalizedRadius=length(radial)/radius;
   var envelope=exp(-2.8*normalizedRadius*normalizedRadius);
   envelope*=1.0-smoothstep(1.1,1.8,normalizedRadius);
   envelope*=smoothstep(-4.0,0.0,p.z);
   envelope*=1.0-smoothstep(40.0,150.0,p.z);
   let convected=p.z-uTime*220.0;
   let wisps=0.86+0.14*sin(convected*0.047+radial.x*0.11)*sin(radial.y*0.13+convected*0.037);
   let density=0.015*envelope*(0.52+0.48*pulse)*wisps*uGain;
   let alpha=1.0-exp(-density*stepSize);
   let color=mix(vec3f(0.77,0.56,0.41),vec3f(0.51,0.60,0.65),smoothstep(0.0,0.8,progress));
   accum=vec4f(accum.rgb+(1.0-accum.a)*alpha*color,accum.a+(1.0-accum.a)*alpha);
 }
 if(accum.a<0.001){discard;}
 return vec4f(accum.rgb/accum.a,accum.a);
}`,
	[processBoxHit]
);

const chamberGas = wgsl(`fn chamberGas(p:vec3f,uBounds:texture_2d<f32>,uPin:f32,
 c0:vec3f,c1:vec3f,c2:vec3f,c3:vec3f,a0:vec3f,a1:vec3f,a2:vec3f,a3:vec3f) -> bool {
 if(dot(p.xz,p.xz)>1722.25){return false;}
 let size=textureDimensions(uBounds,0);
 let cell=clamp(vec2i((p.xz+42.0)/84.0*vec2f(size)),vec2i(0),vec2i(size)-vec2i(1));
 let h=textureLoad(uBounds,cell,0).rg;
 if(p.y<=h.x+uPin||p.y>=h.y){return false;}
 let centers=array<vec3f,4>(c0,c1,c2,c3); let axes=array<vec3f,4>(a0,a1,a2,a3);
 for(var i=0;i<4;i++) {
   let q=p-centers[i];let ax=dot(q,axes[i]);let r=dot(q,q)-ax*ax;
   if(ax> -3.0&&ax<5.0&&r<196.0){return false;}
   if(ax>=0.0&&ax<85.0&&r<4.0){return false;}
 }
 return true;
}`);
const chamberEnvelope = wgsl(`fn chamberEnvelope(p:vec3f,uNozzle:f32,uBurn:f32,uPhase:f32) -> f32 {
 let q=p-vec3f(0.0,uNozzle-0.18,0.0);var sum=0.0;
 for(var i=0;i<8;i++) {
   let a=f32(i)*0.7853981634;
   let d=vec3f(0.93969262*cos(a),-0.34202014,0.93969262*sin(a));
   let along=dot(q,d);if(along<0.0||along>45.0){continue;}
   let radius=0.7+along*(0.055+uBurn*0.045);
   let radial=length(q-d*along);
   let mixing=exp(-0.5*radial*radial/(radius*radius));
   let extent=1.0-smoothstep(18.0+8.0*uBurn,31.0+10.0*uBurn,along);
   sum+=mixing*extent*smoothstep(1.0,6.0,along);
 }
 let fine=0.84+0.16*sin(p.x*0.78+sin(p.z*0.63)+uPhase)*sin(p.y*0.86-p.z*0.47);
 return min(sum,1.8)*fine;
}`);
export const chamberVolume = wgslFn(
	`fn chamberVolume(
 vPoint:vec3f,pixel:vec2f,uCamera:vec3f,uMin:vec3f,uMax:vec3f,
 uBounds:texture_2d<f32>,uDepth:texture_depth_2d,uModel:mat4x4f,uViewProjection:mat4x4f,
 uPin:f32,uNozzle:f32,uBurn:f32,uSpray:f32,uIntake:f32,uExhaust:f32,uPhase:f32,uTravelMm:f32,
 uHasDepth:f32,uHasClip:f32,uPlane:vec4f,
 c0:vec3f,c1:vec3f,c2:vec3f,c3:vec3f,a0:vec3f,a1:vec3f,a2:vec3f,a3:vec3f
) -> vec4f {
 let direction=normalize(vPoint-uCamera);let hit=processBoxHit(uCamera,direction,uMin,uMax);
 let start=max(hit.x,0.0);let finish=hit.y;if(finish<=start){discard;}
 let reacting=uBurn+uSpray>0.003;let steps=select(32,64,reacting);
 let stepSize=(finish-start)/f32(steps);
 let depth=textureLoad(uDepth,vec2i(pixel),0);var accum=vec4f(0.0);
 for(var i=0;i<64;i++) {
   if(i>=steps){break;}
   let p=uCamera+direction*(start+(f32(i)+0.5)*stepSize);
   if(uHasClip>0.5&&dot(uPlane,uModel*vec4f(p,1.0))<0.0){continue;}
   if(uHasDepth>0.5) {
     let projected=uViewProjection*vec4f(p,1.0);
     if(projected.z/projected.w>depth+0.000001){break;}
   }
   if(!chamberGas(p,uBounds,uPin,c0,c1,c2,c3,a0,a1,a2,a3)){continue;}
   var reaction=0.0;if(reacting){reaction=chamberEnvelope(p,uNozzle,uBurn,uPhase);}
   let mixingGlow=exp(-dot(p.xz,p.xz)/900.0)*(1.0-smoothstep(18.0,42.0,uNozzle-p.y));
   let sprayDensity=reaction*(0.085*uBurn+0.014*uSpray)+0.014*uBurn*mixingGlow;
   // Intake travels down from the head, exhaust travels up to the open exhaust valves.
   let intakeWave=0.88+0.12*sin((p.y+uTravelMm)*0.06544984695);
   let exhaustWave=0.88+0.12*sin((p.y-uTravelMm)*0.06544984695);
   let exchangeDensity=0.009*uIntake*intakeWave+0.007*uExhaust*exhaustWave;
   let density=sprayDensity+exchangeDensity;let alpha=1.0-exp(-density*stepSize);
   let flame=mix(vec3f(2.2,0.56,0.055),vec3f(4.4,2.25,0.62),smoothstep(0.15,1.1,reaction));
   var color=mix(vec3f(0.61,0.69,0.74),flame,clamp(uBurn*1.6,0.0,1.0));
   let gasColor=mix(vec3f(0.28,0.72,0.84),vec3f(0.89,0.40,0.19),uExhaust/max(0.0001,uIntake+uExhaust));
   color=mix(gasColor,color,sprayDensity/max(0.0001,density));
   accum=vec4f(accum.rgb+(1.0-accum.a)*alpha*color,accum.a+(1.0-accum.a)*alpha);
   if(accum.a>0.95){break;}
 }
 if(accum.a<0.001){discard;}
 return vec4f(accum.rgb/accum.a,accum.a);
}`,
	[processBoxHit, chamberGas, chamberEnvelope]
);

export const directedVolume =
	wgslFn(`fn directedVolume(pixel:vec2f,depth:f32,world:vec3f,normal:vec3f,view:vec3f,
 distance:f32,gain:f32,uTime:f32,uColor:vec3f,uDepth:texture_depth_2d,uHasDepth:f32,
 uHasClip:f32,uPlane:vec4f,baseOpacity:f32) -> vec4f {
 if(uHasClip>0.5&&dot(uPlane,vec4f(world,1.0))<0.0){discard;}
 let advected=uTime*220.0-distance;let tail=advected-floor(advected/96.0)*96.0;
 let pulse=exp(-tail/16.0)*min(1.0,(96.0-tail)/3.0);
 let radial=pow(max(0.0,dot(normalize(normal),normalize(view))),0.7);
 var alpha=radial*(baseOpacity+gain*(0.12+0.55*pulse));
 if(uHasDepth>0.5&&depth>textureLoad(uDepth,vec2i(pixel),0)+0.000002){alpha*=0.52;}
 return vec4f(uColor,alpha);
}`);
