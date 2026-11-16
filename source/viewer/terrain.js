import * as T from 'three';
import {terrainSettings} from './terrain-profile.js';
import {regionalTerrain} from './regional-terrain.js';

// Bases have U × V pointing out. Adjacent faces share the same edge samples.
const axes = [
  [[1,0,0],[0,0,-1],[0,1,0]], [[-1,0,0],[0,0,1],[0,1,0]],
  [[0,1,0],[1,0,0],[0,0,-1]], [[0,-1,0],[1,0,0],[0,0,1]],
  [[0,0,1],[1,0,0],[0,1,0]], [[0,0,-1],[-1,0,0],[0,1,0]]
].map(face => face.map(axis => new T.Vector3(...axis)));
function direction(face,u,v) {
  const [n,x,y] = axes[face];
  return n.clone().addScaledVector(x,u).addScaledVector(y,v).normalize();
}
function height(n) {
  return .56*Math.sin(11*n.x+3*n.y)*Math.cos(9*n.z-7*n.y)
    +.28*Math.sin(24*n.x+19*n.z)*Math.cos(21*n.y)+.16*Math.sin(46*n.z-27*n.y);
}
export function surfacePoint(n,r,profile,outline) {
  if(profile.project) return profile.project(n,r);
  const p=n.clone();
  if(outline){
    const t=((Math.atan2(n.y,n.x)/(2*Math.PI)+1)%1)*outline.length;
    const i=Math.floor(t), scale=T.MathUtils.lerp(outline[i],outline[(i+1)%outline.length],t-i);
    p.set(n.x*scale,n.y*scale,n.z*(.74+.09*Math.sin(5*n.x+4*n.y)));
  }
  return p.multiplyScalar(r*(1+profile.relief*height(n)));
}

// A filtered copy of the color guide drives regional relief; the render texture stays full-size.
function readRelief(image,regional,profile,settings) {
  const canvas=document.createElement('canvas');
  canvas.width=1024;canvas.height=512;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  ctx.imageSmoothingQuality='high';ctx.filter='blur(1.8px)';ctx.drawImage(image,0,0,1024,512);
  const rgba=ctx.getImageData(0,0,1024,512).data;
  const heights=new Float32Array(1024*512);
  for(let i=0;i<heights.length;i++){
    const k=4*i, tone=(.28*rgba[k]+.58*rgba[k+1]+.14*rgba[k+2])/255;
    const inland=T.MathUtils.smoothstep(rgba[k+3],...settings.inlandRange);
    heights[i]=inland*Math.pow(tone,1.55);
  }
  function heightAt(u,v){
    const x=((u%1+1)%1)*1024-.5,y=T.MathUtils.clamp((1-v)*512-.5,0,511);
    const i=Math.floor(x),j=Math.floor(y),fx=x-i,fy=y-j;
    const left=(i+1024)%1024,right=(left+1)%1024, next=Math.min(j+1,511);
    return T.MathUtils.lerp(T.MathUtils.lerp(heights[j*1024+left],heights[j*1024+right],fx),
      T.MathUtils.lerp(heights[next*1024+left],heights[next*1024+right],fx),fy);
  }
  return n=>{
    const blend=profile.polarCaps?T.MathUtils.smoothstep(Math.abs(n.y),...settings.polarRange):0;
    const [lon,lat]=n.y>0?settings.polarNorth:settings.polarSouth;
    const capU=lon+n.x*settings.polarScale[0],capV=lat+n.z*settings.polarScale[1];
    const cap=profile.polarShore?regional.height(capU,capV,heightAt(capU,capV)):heightAt(capU,capV);
    if(blend===1)return cap;
    const u=(Math.atan2(n.z,-n.x)/(2*Math.PI)+1)%1,v=Math.asin(n.y)/Math.PI+.5;
    return T.MathUtils.lerp(regional.height(u,v,heightAt(u,v)),cap,blend);
  };
}

function geometry(sample,face,u,v,size,steps) {
  const pos=[],uv=[],index=[],normals=[];
  function vertex(x,y,skirt=1) {
    const n=direction(face,u+size*x/steps,v+size*y/steps);
    const p=sample(n).multiplyScalar(skirt);
    if(steps>8){
      const a=u+size*x/steps,b=v+size*y/steps,delta=.004;
      const tangent=sample(direction(face,a+delta,b)).sub(sample(direction(face,a-delta,b)));
      const bitangent=sample(direction(face,a,b+delta)).sub(sample(direction(face,a,b-delta)));
      const normal=tangent.cross(bitangent).normalize();normals.push(normal.x,normal.y,normal.z);
    }
    pos.push(p.x,p.y,p.z); uv.push(x/steps,y/steps);
    return pos.length/3-1;
  }
  for(let y=0;y<=steps;y++) for(let x=0;x<=steps;x++){
    const i=vertex(x,y);
    if(x&&y) index.push(i-steps-2,i-steps-1,i,i-steps-2,i,i-1);
  }
  // Skirts cover T junctions while neighboring leaves change resolution.
  for(const edge of [i=>[i,0],i=>[steps,i],i=>[steps-i,steps],i=>[0,steps-i]]){
    let oldTop,oldBottom;
    for(let i=0;i<=steps;i++){
      const [x,y]=edge(i),top=y*(steps+1)+x,bottom=vertex(x,y,1-.025*size);
      if(i)index.push(oldTop,oldBottom,bottom,oldTop,bottom,top);
      oldTop=top;oldBottom=bottom;
    }
  }
  const geo=new T.BufferGeometry();
  geo.setAttribute('position',new T.Float32BufferAttribute(pos,3));
  geo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geo.setIndex(index);
  if(normals.length)geo.setAttribute('normal',new T.Float32BufferAttribute(normals,3));
  else geo.computeVertexNormals();
  geo.computeBoundingSphere();return geo;
}

const noiseGLSL = `
float hash3(vec3 p){
 p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);
}
float noise3(vec3 p){
 vec3 i=floor(p), f=fract(p);f=f*f*(3.-2.*f);
 return mix(mix(mix(hash3(i),hash3(i+vec3(1,0,0)),f.x),
 mix(hash3(i+vec3(0,1,0)),hash3(i+vec3(1,1,0)),f.x),f.y),
 mix(mix(hash3(i+vec3(0,0,1)),hash3(i+vec3(1,0,1)),f.x),
 mix(hash3(i+vec3(0,1,1)),hash3(i+vec3(1)),f.x),f.y),f.z);
}`;
// Optional tangent-plane caps close artwork at the poles.
// Sample land in a tangent plane there, using the same transition in both render passes.
const profileDeclarations = `uniform vec4 coastNoise;
uniform vec2 coastFilter;
uniform vec3 sedimentBlend;
uniform vec4 coverBlend;
uniform vec4 mineralBlend;
uniform float grainLod;
uniform float shadowFootprint;

uniform vec2 polarNorth;
uniform vec2 polarSouth;
uniform vec2 polarScale;
uniform vec2 polarRange;
uniform vec2 referenceSize;
uniform vec2 colorFootprint;
uniform vec2 shoreline;
uniform vec2 inlandRange;
uniform vec2 wetRange;
uniform vec4 materialScales;
uniform vec2 cliffRange;
uniform vec2 closeRange;
uniform vec3 wetTint;
uniform vec3 paletteFloor;
uniform float ridgePower;
uniform float grainStrength;
uniform float waterEnabled;
uniform float waterOrbitMix;
uniform float regionalColorMatch;
uniform float regionalDetail;
uniform float regionalSharpness;
uniform float realismStrength;
uniform vec3 waterDeep;
uniform vec3 waterShallow;
uniform vec3 waterSky;
uniform vec3 waterGlint;
uniform float shallowFalloff;
uniform float waveFrequency;
uniform float waveGrowth;
uniform float waveAmplitude;
uniform float waveSpeed;
uniform vec3 windDirection;
uniform vec2 lightOffset;
uniform float specularWidth;
uniform vec3 reflectanceSettings;
uniform float fadeMs;
uniform float fetchDensity;
uniform float materialDensity;
uniform float neighborRadius;
uniform float requestLimit;
uniform float projectionScale;
uniform vec2 gridScale;`;
const guideSampling = `
#ifdef SPLIT_ORBIT
uniform sampler2D guideEast;
#endif
vec4 sampleOrbital(vec2 uv,vec2 dx,vec2 dy){
 #ifdef SPLIT_ORBIT
 float u=fract(uv.x)*2.;
 vec2 st=vec2(fract(u),uv.y);
 dx.x*=2.;dy.x*=2.;
 bool east=u>=1.;
 vec4 value=east?textureGrad(guideEast,st,dx,dy):textureGrad(guide,st,dx,dy);
 // Reconstruct the filter footprint where either clamped half meets its neighbor.
 float width=clamp(max(abs(dx.x)+abs(dy.x),1./float(textureSize(guide,0).x)),0.,1.)*.5;
 float edge=min(st.x,1.-st.x);
 if(edge<width){
   vec2 adjacent=vec2(st.x<.5?1.:0.,st.y);
   vec4 other=east?textureGrad(guide,adjacent,dx,dy):textureGrad(guideEast,adjacent,dx,dy);
   value=mix(value,other,.5*(1.-edge/width));
 }
 return value;
 #else
 return textureGrad(guide,uv,dx,dy);
 #endif
}
vec4 surfaceGuide(vec3 n,float footprint){
 float polar=smoothstep(polarRange.x,polarRange.y,abs(n.y));
 vec2 anchor=n.y>0.?polarNorth:polarSouth;
 vec2 capUV=anchor+n.xz*polarScale;
 vec4 capSample=sampleOrbital(capUV,dFdx(capUV)*footprint,dFdy(capUV)*footprint);
 #ifdef POLAR_SHORE
 vec4 cap=capSample;
 #else
 vec4 cap=vec4(capSample.rgb,1.);
 #endif
 #ifdef POLAR_CAPS
 if(polar>=1.)return cap;
 #endif
 vec2 uv=vec2(atan(n.z,-n.x)/6.2831853,asin(clamp(n.y,-1.,1.))/3.14159265+.5);
 vec2 dx=dFdx(uv),dy=dFdy(uv);
 dx.x-=round(dx.x);dy.x-=round(dy.x);
 vec4 mapped=sampleOrbital(uv,dx*footprint,dy*footprint);
 #ifdef POLAR_CAPS
 return mix(mapped,cap,polar);
 #else
 return mapped;
 #endif
}`;
const bakeFragment=`${profileDeclarations}

uniform sampler2D cover, substrate, guide;
uniform vec3 axisU,axisV,axisN;
uniform vec2 origin;
uniform float span,relief,pageSize;
varying vec2 patchUV; varying vec3 terrainPosition,terrainNormal;
${noiseGLSL}
${guideSampling}
float elevation(vec3 p){
 return .56*sin(11.*p.x+3.*p.y)*cos(9.*p.z-7.*p.y)
 +.28*sin(24.*p.x+19.*p.z)*cos(21.*p.y)+.16*sin(46.*p.z-27.*p.y);
}
vec3 projectTile(sampler2D tex, vec3 p,vec3 w){
 return texture2D(tex,p.yz).rgb*w.x+texture2D(tex,p.zx).rgb*w.y+texture2D(tex,p.xy).rgb*w.z;
}
void main(){
 vec2 uv=origin+span*((patchUV*pageSize-1.)/(pageSize-2.));
 vec3 n=normalize(axisN+axisU*uv.x+axisV*uv.y);
 float h=elevation(n);
 vec3 normal=normalize(terrainNormal);
 float slope=1.-clamp(dot(normal,n),0.,1.);
 vec3 w=pow(abs(normal),vec3(4));w/=dot(w,vec3(1));
 vec4 atlas=surfaceGuide(n,1.);
 vec3 macro=atlas.rgb;
 float exposed=smoothstep(.23,.83,.33+h*.26+sqrt(slope)*2.+(noise3(n*19.)-.5)*.7);
 vec3 rock=projectTile(substrate,terrainPosition*18.,w),land=projectTile(cover,terrainPosition*13.,w);
 vec3 broadLand=projectTile(cover,terrainPosition*2.7,w);
 vec3 broadRock=projectTile(substrate,terrainPosition*3.4,w);
 vec3 detail=mix(mix(broadLand,broadRock,exposed),mix(land,rock,exposed),.32);
 // Preserve the dossier's hemisphere-scale values, including its painted night side.
 vec3 pigment=pow(max(detail,vec3(.0005)),vec3(.73));
 float luminance=dot(macro,vec3(.2126,.7152,.0722));
 vec3 color=.46*macro+pigment*(.14+2.9*sqrt(luminance))*smoothstep(.002,.065,luminance);
 color*=clamp(1.+1.4*dot(normal-n,normalize(vec3(-.5,.8,.45))),.68,1.32);
 gl_FragColor=vec4(color,1.);
}`;
const displayFragment=`${profileDeclarations}

uniform sampler2D page,guide;
#ifdef DIRECT_CRUST
uniform sampler2D coverColor,baseColor,baseSurface,coverSurface,mineralColor,sedimentColor,mineralSurface,sedimentSurface,geology;

uniform float regionReady,materialReady;
uniform sampler2D gridMap0,gridMap1,gridMap2,gridMap3;
uniform vec4 gridFade;
uniform vec4 gridRect0,gridRect1,gridRect2,gridRect3;
vec4 sampleOrbital(vec2 uv,vec2 dx,vec2 dy);
vec3 gridSample(sampler2D tex,vec4 rect,float ready,vec2 uv,vec2 dx,vec2 dy,float density,vec3 parent){
 if(rect.z<=0.)return parent;
 vec2 st=(uv-rect.xy)/rect.zw;
 float edge=min(min(st.x,st.y),min(1.-st.x,1.-st.y));
 if(edge<=0.)return parent;
 float footprint=density*regionalDetail*min(rect.z*gridScale.x,rect.w*gridScale.y);
 float weight=ready*smoothstep(0.,.012,edge)*smoothstep(.18,.86,footprint);
 if(weight<=0.)return parent;
 // Compare both maps at the same geographic scale. Keep the orbital palette
 // while replacing its ridge band with the corresponding registered regional band.
 vec2 gx=vec2(1./colorFootprint.x,0.),gy=vec2(0.,1./colorFootprint.y);
 vec3 broad=sampleOrbital(uv,gx,gy).rgb;
 vec3 regional=textureGrad(tex,st,dx/rect.zw,dy/rect.zw).rgb;
 vec3 regionalBroad=textureGrad(tex,st,gx/rect.zw,gy/rect.zw).rgb;
 vec3 corrected=mix(regional,regional*clamp((broad+.035)/(regionalBroad+.035),vec3(.70),vec3(1.4)),regionalColorMatch);
 // Bounded band enhancement retains registered features while limiting halos.
 vec3 localLow=textureGrad(tex,st,dx/rect.zw*2.,dy/rect.zw*2.).rgb;
 corrected+=regionalSharpness*clamp(regional-localLow,vec3(-.08),vec3(.08));
 return mix(parent,corrected,weight);
}
vec3 gridColor(vec2 uv,vec2 dx,vec2 dy,float density,vec3 parent){
 vec3 c=gridSample(gridMap0,gridRect0,gridFade.x,uv,dx,dy,density,parent);
 c=gridSample(gridMap1,gridRect1,gridFade.y,uv,dx,dy,density,c);
 c=gridSample(gridMap2,gridRect2,gridFade.z,uv,dx,dy,density,c);
 return gridSample(gridMap3,gridRect3,gridFade.w,uv,dx,dy,density,c);
}
uniform float bodyRadius,waterTime;
varying vec3 eyeLocal;varying vec3 terrainN;
varying float eyeDistance;
vec3 surfaceSample(sampler2D tex,vec3 p,vec3 w){
 return texture2D(tex,p.yz).rgb*w.x+texture2D(tex,p.zx).rgb*w.y+texture2D(tex,p.xy).rgb*w.z;
}
// Packed tangent-space X/Y normals and roughness; transform each projection into object space.
vec4 surfaceResponse(sampler2D tex,vec3 p,vec3 n,vec3 w){
 vec4 x=texture2D(tex,p.yz),y=texture2D(tex,p.zx),z=texture2D(tex,p.xy);
 vec2 sx=x.rg*2.-1.,sy=y.rg*2.-1.,sz=z.rg*2.-1.;
 vec3 perturb=w.x*vec3(0.,sx)+w.y*vec3(sy.y,0.,sy.x)+w.z*vec3(sz,0.);
 vec3 N=normalize(n+perturb-n*dot(n,perturb));
 vec3 L=normalize(vec3(-.45,.68,.58)),V=normalize(eyeLocal);
 float rough=dot(vec3(x.b,y.b,z.b),w);
 float diffuse=.84+.36*(dot(N,L)-dot(n,L));
 float spec=.14*(1.-rough)*pow(max(dot(N,normalize(L+V)),0.),mix(70.,8.,rough));
 return vec4(diffuse,spec,rough,dot(vec3(x.a,y.a,z.a),w));
}
// Remove the broad albedo of the repeating material so its grain can modulate
// the regional ridge without painting over it. LOD 6 averages 64 source texels.
vec3 grainRatio(sampler2D tex,vec3 p,vec3 w){
 vec3 broad=textureLod(tex,p.yz,grainLod).rgb*w.x+textureLod(tex,p.zx,grainLod).rgb*w.y+textureLod(tex,p.xy,grainLod).rgb*w.z;
 return clamp((surfaceSample(tex,p,w)+.025)/(broad+.025),vec3(.48),vec3(1.8));
}
#endif
uniform float baked,pageSize;
varying vec2 patchUV; varying vec3 localP;
${noiseGLSL}
${guideSampling}
void main(){
 vec3 n=normalize(localP);
 vec4 atlas=surfaceGuide(n,1.);
 vec3 color=baked>.5?texture2D(page,(patchUV*(pageSize-2.)+1.)/pageSize).rgb:atlas.rgb;
 #ifdef DIRECT_CRUST

 vec3 q=localP/bodyRadius;
 float coast=(atlas.a*255.-shoreline.x)/shoreline.y;
 coast+=(noise3(q*coastNoise.x)-.5)*coastNoise.z+(noise3(q*coastNoise.y)-.5)*coastNoise.w;
 float edgeWidth=max(coastFilter.x,fwidth(coast)*coastFilter.y);
 float water=waterEnabled*(1.-smoothstep(-edgeWidth,edgeWidth,coast));
 // Resolve the parent footprint before introducing the registered regional detail.
 vec2 uv=vec2(fract(atan(n.z,-n.x)/6.2831853),asin(clamp(n.y,-1.,1.))/3.14159265+.5);
 vec2 dx=dFdx(uv),dy=dFdy(uv);dx.x-=round(dx.x);dy.x-=round(dy.x);
 vec2 dims=referenceSize;
 float pixelSpan=1./max(.0001,max(length(dx*dims),length(dy*dims)));
 float closeWeight=max(smoothstep(closeRange.x,closeRange.y,pixelSpan),realismStrength*(1.-smoothstep(.22,.80,eyeDistance/bodyRadius)));
 float cap=0.;
 #ifdef POLAR_CAPS
 cap=smoothstep(polarRange.x,polarRange.y,abs(n.y));
 #endif
 vec3 mapped=atlas.rgb;
 if(cap<1.)mapped=gridColor(uv,dx,dy,pixelSpan,mapped);
 if(cap>0.){
   vec2 polarUV=(n.y>0.?polarNorth:polarSouth)+n.xz*polarScale;
   vec2 pdx=dFdx(polarUV),pdy=dFdy(polarUV);
   float density=1./max(.0001,max(length(pdx*dims),length(pdy*dims)));
   mapped=mix(mapped,gridColor(polarUV,pdx,pdy,density,atlas.rgb),cap);
 }
 float chroma=(mapped.g-mapped.b)/max(.018,(mapped.g+mapped.r)*.5);
 float mineral=smoothstep(.17,.57,chroma)*smoothstep(.009,.07,mapped.g);
 float deposits=.22;
 if(regionReady>.5){
   vec2 poleUV=(n.y>0.?polarNorth:polarSouth)+n.xz*polarScale;
   vec3 data=mix(textureGrad(geology,uv,dx,dy).rgb,texture2D(geology,poleUV).rgb,cap);
   mineral=data.g;deposits=data.b;
 }
 color=mapped;
 if(closeWeight>0. && water<1. && materialReady>0.){
   vec3 normal=normalize(terrainN);
   vec3 w=pow(abs(normal),vec3(5.));w/=dot(w,vec3(1));
   float slope=1.-clamp(dot(normal,n),0.,1.);
   float cliff=smoothstep(cliffRange.x,cliffRange.y,slope);
   float wet=1.-smoothstep(wetRange.x,wetRange.y,coast);
   // Geology establishes the deposit; relative material heights let grains settle
   // into base-material fissures while raised ledges remain exposed through the deposit.
   float sediment=smoothstep(sedimentBlend.x,sedimentBlend.y,deposits+sedimentBlend.z*(1.-cliff));
   vec4 rock=surfaceResponse(baseSurface,q*materialScales.x,normal,w);
   vec4 coverResponse=surfaceResponse(coverSurface,q*materialScales.y,normal,w);
   vec4 mineralResponse=surfaceResponse(mineralSurface,q*materialScales.z,normal,w);
   vec4 sedimentResponse=surfaceResponse(sedimentSurface,q*materialScales.w,normal,w);
   vec4 deposit=mix(mineralResponse,sedimentResponse,sediment);
   float coverWeight=smoothstep(.12,.82,coverBlend.x+deposits*coverBlend.y-cliff*coverBlend.z+coverBlend.w*(coverResponse.a-rock.a));
   vec4 bed=mix(rock,coverResponse,coverWeight);
   float cover=clamp(mineralBlend.x*mineral+mineralBlend.y*deposits-mineralBlend.z*cliff,0.,1.);
   float mineralWeight=smoothstep(.12,.86,cover+mineralBlend.w*(deposit.a-bed.a));
   vec3 bedGrain=mix(grainRatio(baseColor,q*materialScales.x,w),grainRatio(coverColor,q*materialScales.y,w),coverWeight);
   vec3 depositGrain=mix(grainRatio(mineralColor,q*materialScales.z,w),grainRatio(sedimentColor,q*materialScales.w,w),sediment);
   vec4 lighting=mix(bed,deposit,mineralWeight);
   vec3 grain=mix(bedGrain,depositGrain,mineralWeight);
   vec3 broad=surfaceGuide(n,max(1.,pixelSpan*shadowFootprint)).rgb;
   // Bound the painted shadows against the local land palette. Image shadows
   // otherwise produce black rims when the shoreline material no longer hides them.
   vec3 palette=max(broad,paletteFloor);
   vec3 ridgeContrast=clamp((mapped+.012)/(palette+.012),vec3(.35),vec3(2.4));
   vec3 regionalTone=palette*pow(ridgeContrast,vec3(ridgePower));
   vec3 response=mix(vec3(1.),grain,grainStrength)*(lighting.x/.84);
   response*=mix(vec3(1.),wetTint,wet);
   float amount=closeWeight*materialReady;
   color=mix(mapped,regionalTone*response,amount)+vec3(amount*lighting.y);
   // At very close range replace illustrative motifs with a photographic
   // material, keeping the regional image's broad geographic color and ridges.
   float nearDetail=realismStrength*(1.-smoothstep(.22,.80,eyeDistance/bodyRadius))*materialReady;
   vec3 leaf=surfaceSample(coverColor,q*materialScales.y,w);
   vec3 stone=surfaceSample(baseColor,q*materialScales.x,w);
   float exposed=smoothstep(.12,.55,mineral+cliff*.45);
   vec3 localAlbedo=mix(leaf,stone,exposed);
   vec3 leafMean=textureLod(coverColor,q.yz*materialScales.y,6.).rgb*w.x+textureLod(coverColor,q.zx*materialScales.y,6.).rgb*w.y+textureLod(coverColor,q.xy*materialScales.y,6.).rgb*w.z;
   vec3 stoneMean=textureLod(baseColor,q.yz*materialScales.x,6.).rgb*w.x+textureLod(baseColor,q.zx*materialScales.x,6.).rgb*w.y+textureLod(baseColor,q.xy*materialScales.x,6.).rgb*w.z;
   vec3 localMean=mix(leafMean,stoneMean,exposed);
   vec3 detailRatio=clamp((localAlbedo+.035)/(localMean+.035),vec3(.45),vec3(1.7));
   vec3 geographic=palette;
   vec3 natural=geographic*detailRatio*(lighting.x/.84);
   color=mix(color,natural,nearDetail*(1.-water));
 }
 // The atlas alpha carries the shoreline through every quadtree level.
 if(water>0.){
   // Object-space waves stay continuous across longitude and at the poles.
   vec3 windAxis=normalize(windDirection);
   vec3 tangent=normalize(cross(n,abs(dot(n,windAxis))>.97?vec3(0.,1.,0.):windAxis));
   vec3 across=cross(n,tangent);
   float footprint=max(length(dFdx(n)),length(dFdy(n)));
   float gust=noise3(n*135.+vec3(waterTime*.018));
   vec3 perturb=vec3(0.);
   for(int j=0;j<8;j++){
     float k=float(j);
     vec3 direction=normalize(vec3(sin(k*2.399+1.7),cos(k*1.731+.4),sin(k*3.117+.8)));
     float frequency=waveFrequency*pow(waveGrowth,k);
     float phase=dot(n,direction)*frequency-waterTime*waveSpeed*(.35+k*.21)
       +4.*noise3(n*(29.+k*19.)+direction*7.);
     float resolved=1.-smoothstep(.45,2.4,footprint*frequency);
     vec3 gradient=direction-n*dot(direction,n);
     perturb+=gradient*cos(phase)*(waveAmplitude/(1.+k*.24))*resolved;
   }
   vec3 surfaceNormal=normalize(n+perturb*(.65+.6*gust));
   vec3 view=normalize(eyeLocal);
   vec3 light=normalize(n+tangent*lightOffset.x+across*lightOffset.y);
   vec3 halfVector=normalize(view+light);
   float alignment=max(0.,dot(surfaceNormal,halfVector));
   // Broaden subpixel specular peaks with the normal variance to avoid flashing.
   float variance=dot(dFdx(surfaceNormal),dFdx(surfaceNormal))
     +dot(dFdy(surfaceNormal),dFdy(surfaceNormal));
   float exponent=1./(specularWidth+variance*.8);
   float glint=pow(alignment,exponent)*min(1.,exponent/850.);
   float breakup=smoothstep(.30,.75,noise3(n*1750.+vec3(waterTime*.045)));
   float fresnel=reflectanceSettings.x+reflectanceSettings.y*pow(1.-max(dot(view,surfaceNormal),0.),reflectanceSettings.z);
   float shallows=exp(-max(0.,-coast)*shallowFalloff);
   vec3 depthColor=mix(waterDeep,waterShallow,shallows);
   vec3 lake=depthColor+waterSky*fresnel
     +waterGlint*glint*(.22+.78*breakup);
   color=mix(color,lake,water*mix(waterOrbitMix,1.,closeWeight));
 }
 #endif
 for(int i=0;i<4;i++){
   float freq=280.*exp2(float(i)*2.);
   float weight=1.-smoothstep(.12,.65,length(fwidth(n))*freq);
   #ifdef DIRECT_CRUST
   weight*=1.-water;
   #endif
   color*=1.+weight*(noise3(n*freq)-.5)*.13;
 }
 gl_FragColor=vec4(color,1.);
 #include <colorspace_fragment>
}`;
const quadVertex=`
attribute vec3 surfacePosition,surfaceNormal;
varying vec3 terrainPosition,terrainNormal;
varying vec2 patchUV;
void main(){
  patchUV=uv;terrainPosition=surfacePosition;terrainNormal=surfaceNormal;
  gl_Position=vec4(position.xy,0.,1.);
}`;
const meshVertex='varying vec3 eyeLocal;varying vec3 terrainN; varying float eyeDistance; varying vec2 patchUV;varying vec3 localP;void main(){patchUV=uv;localP=position;terrainN=normal;vec3 eye=-(modelViewMatrix*vec4(position,1.)).xyz;eyeLocal=transpose(mat3(modelViewMatrix))*eye;eyeDistance=length(eye);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}';
const uniforms = values => Object.fromEntries(Object.entries(values).map(([k,value])=>[k,{value}]));

export function createTerrain({renderer,radius,profile,outline,load,failed=console.error}) {
  const settings=terrainSettings(profile);
  const vectorTypes={2:T.Vector2,3:T.Vector3,4:T.Vector4};
  const profileUniforms=Object.fromEntries(Object.entries(settings).map(([key,value])=>
    [key,{value:Array.isArray(value)?new vectorTypes[value.length](...value):value}]));
  const root=new T.Group(), cache=new Map(), textures=[];
  let reliefField;
  const sample=n=>{
    const p=surfacePoint(n,radius,profile,outline);
    return reliefField?p.multiplyScalar(1+profile.mappedRelief*reliefField(n)):p;
  };
  let disposed=false,tick=0,ready=false;
  // A 4K virtual tile is paged in 256-texel regions. A page border supports bilinear filtering.
  const pageSize=258,maxPages=72;
  const bake=new T.ShaderMaterial({vertexShader:quadVertex,fragmentShader:bakeFragment,defines:{...(profile.polarCaps?{POLAR_CAPS:1}:{}),...(profile.polarShore?{POLAR_SHORE:1}:{})},
    uniforms:{...profileUniforms,...uniforms({cover:null,substrate:null,guide:null,origin:new T.Vector2(),span:2,
      axisU:null,axisV:null,axisN:null,relief:profile.relief,pageSize})},depthTest:false,depthWrite:false});
  const quad=new T.Mesh(new T.PlaneGeometry(2,2,8,8),bake),screen=new T.Scene(),ortho=new T.Camera();
  const bakeUV=quad.geometry.attributes.uv;
  for(const name of ['surfacePosition','surfaceNormal']){
    quad.geometry.setAttribute(name,new T.Float32BufferAttribute(new Float32Array(bakeUV.count*3),3));
  }
  screen.add(quad);
  async function get(path,repeat,srgb=true){
    const texture=await load(path);
    if(disposed){texture.dispose();return;}
    if(profile.directCrust)texture.anisotropy=renderer.capabilities.getMaxAnisotropy();
    texture.colorSpace=srgb?T.SRGBColorSpace:T.NoColorSpace;
    texture.wrapS=T.RepeatWrapping;texture.wrapT=repeat?T.RepeatWrapping:T.ClampToEdgeWrapping;
    textures.push(texture);return texture;
  }
  const regional=regionalTerrain(profile,get,load,failed);
  async function loadOrbit(){
    if(profile.orbitalHalves && renderer.capabilities.maxTextureSize>=(profile.orbitalHalfSize||8192)){
      try{
        const halves=await Promise.all(profile.orbitalHalves.map(path=>get(path,false)));
        if(disposed)return [];
        for(const half of halves)half.wrapS=T.ClampToEdgeWrapping;
        return halves;
      }catch(error){if(!disposed)failed((profile.label||'Planet')+' orbital overlay',error);}
    }
    return disposed?[]:[await get(profile.guide,false)];
  }
  const loaded=Promise.all([get(profile.cover,true),get(profile.substrate,true),loadOrbit(),regional.ready])
    .then(([cover,substrate,[guide,east]])=>{
      if(disposed)return;
      let reliefImage=guide.image;
      if(east){
        bake.defines.SPLIT_ORBIT=1;
        bake.uniforms.guideEast={value:east};
        const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=512;
        const ctx=canvas.getContext('2d');ctx.imageSmoothingQuality='high';
        ctx.drawImage(guide.image,0,0,512,512);ctx.drawImage(east.image,512,0,512,512);
        reliefImage=canvas;
      }
      bake.uniforms.cover.value=cover;bake.uniforms.substrate.value=substrate;
      if(profile.mappedRelief)reliefField=readRelief(reliefImage,regional,profile,settings);
      bake.uniforms.guide.value=guide;ready=true;
    });
  function discard(key,node){
    root.remove(node.mesh);node.mesh.geometry.dispose();node.mesh.material.dispose();node.page?.dispose();cache.delete(key);
  }
  function composite(node){
    const [n,x,y]=axes[node.face], uniforms=bake.uniforms;
    uniforms.axisN.value=n;uniforms.axisU.value=x;uniforms.axisV.value=y;
    uniforms.origin.value.set(node.u,node.v);uniforms.span.value=node.size;
    // Supply the true local tangent plane, including any custom body deformation.
    const attrs=quad.geometry.attributes, epsilon=.0005;
    const at=(u,v)=>sample(direction(node.face,u,v)).divideScalar(radius);
    for(let i=0;i<bakeUV.count;i++){
      const u=node.u+node.size*(bakeUV.getX(i)*pageSize-1)/(pageSize-2);
      const v=node.v+node.size*(bakeUV.getY(i)*pageSize-1)/(pageSize-2);
      const p=at(u,v);
      const normal=at(u+epsilon,v).sub(at(u-epsilon,v))
        .cross(at(u,v+epsilon).sub(at(u,v-epsilon))).normalize();
      attrs.surfacePosition.setXYZ(i,p.x,p.y,p.z);
      attrs.surfaceNormal.setXYZ(i,normal.x,normal.y,normal.z);
    }
    attrs.surfacePosition.needsUpdate=true;attrs.surfaceNormal.needsUpdate=true;
    const page=new T.WebGLRenderTarget(pageSize,pageSize,{depthBuffer:false});
    const old=renderer.getRenderTarget();
    try{renderer.setRenderTarget(page);renderer.render(screen,ortho);}
    finally{renderer.setRenderTarget(old);}
    node.page=page;
    node.mesh.material.uniforms.page.value=page.texture;node.mesh.material.uniforms.baked.value=1;
  }
  const frustum=new T.Frustum(),clip=new T.Matrix4(),localCamera=new T.Vector3();
  function update(camera,px,time=0){
    if(!ready||disposed||!root.parent?.visible)return;
    tick++; root.updateWorldMatrix(true,false);camera.updateWorldMatrix(true,false);
    localCamera.copy(camera.position);root.worldToLocal(localCamera);regional.update(localCamera,radius,px,camera.fov);
    clip.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse).multiply(root.matrixWorld);
    frustum.setFromProjectionMatrix(clip);
    for(const node of cache.values())node.mesh.visible=false;
    const visible=[];
    function candidate(face,u,v,size,depth,code){
      const n=direction(face,u+size/2,v+size/2),center=sample(n);
      const bound=radius*size*(outline?1.5:1.05);
      if(!frustum.intersectsSphere(new T.Sphere(center,bound)))return;
      if(!outline && n.dot(localCamera)+bound*localCamera.length()/radius < radius*.96)return;
      const dist=Math.max(radius*.04,center.distanceTo(localCamera)-bound*.35);
      const pixels=radius*size*px/(2*Math.tan(T.MathUtils.degToRad(camera.fov/2))*dist);
      return {face,u,v,size,depth,code,dist,pixels};
    }
    // Split the most under-resolved leaf first. Keep a complete drawable cover
    // inside the memory budget, even on wide viewports or flattened asteroids.
    const leaves=[];
    for(let i=0;i<6;i++){
      const leaf=candidate(i,-1,-1,2,0,String(i)+':');
      if(leaf)leaves.push(leaf);
    }
    while(leaves.length<=maxPages-3){
      let largest=-1,limit=325;
      for(let i=0;i<leaves.length;i++){
        if(leaves[i].depth<8 && leaves[i].pixels>limit){largest=i;limit=leaves[i].pixels;}
      }
      if(largest<0)break;
      const [{face,u,v,size,depth,code}]=leaves.splice(largest,1);
      for(let j=0;j<4;j++){
        const child=candidate(face,u+(j%2)*size/2,v+(j>>1)*size/2,size/2,depth+1,code+j);
        if(child)leaves.push(child);
      }
    }
    for(const {face,u,v,size,depth,code,dist} of leaves){
      let node=cache.get(code);
      if(!node){
        const mat=new T.ShaderMaterial({vertexShader:meshVertex,fragmentShader:displayFragment,defines:{...bake.defines,...(profile.directCrust?{DIRECT_CRUST:1}:{}),...(profile.polarCaps?{POLAR_CAPS:1}:{})},
          uniforms:{...profileUniforms,...regional.uniforms,guideEast:bake.uniforms.guideEast||{value:null},...uniforms({coverColor:bake.uniforms.cover.value,baseColor:bake.uniforms.substrate.value,bodyRadius:radius,waterTime:0,guide:bake.uniforms.guide.value,page:null,baked:0,pageSize})}});
        const mesh=new T.Mesh(geometry(sample,face,u,v,size,profile.mappedRelief?24:8),mat);
        node={mesh,face,u,v,size,last:tick,page:null};root.add(mesh);cache.set(code,node);
      }
      node.mesh.material.uniforms.waterTime.value=time;node.last=tick;node.distance=dist;node.depth=depth;node.mesh.visible=true;visible.push(node);
    }
    const cold=[...cache].filter(([,n])=>n.last!==tick).sort((a,b)=>a[1].last-b[1].last);
    for(const [key,node] of cold)if(cache.size>maxPages)discard(key,node);
    visible.sort((a,b)=>a.distance-b.distance);
    const pending=visible.filter(n=>!n.page);
    for(const node of pending.slice(0,2))composite(node);
    root.userData.stats={level:Math.max(0,...visible.map(n=>n.depth)),visible:visible.length,cached:cache.size,resident:[...cache.values()].filter(n=>n.page).length,regional:regional.debug(),orbit:[bake.uniforms.guide.value?.image?.width,bake.uniforms.guide.value?.image?.height,bake.uniforms.guideEast?.value?.image?.width||0],orbitUploaded:[bake.uniforms.guide.value,bake.uniforms.guideEast?.value].map(t=>!!t&&!!renderer.properties.get(t).__webglTexture),regionalUploaded:[0,1,2,3].map(i=>regional.uniforms['gridMap'+i].value).filter(t=>t&&renderer.properties.get(t).__webglTexture).length};
  }
  function dispose(){
    disposed=true;regional.dispose();for(const [key,node] of cache)discard(key,node);
    for(const t of textures)t.dispose();quad.geometry.dispose();bake.dispose();
  }
  return {root,loaded,update,dispose,sample};
}
