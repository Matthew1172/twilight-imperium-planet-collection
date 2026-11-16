import {createTerrain} from './terrain.js';
import {profiles} from './profiles.js';
import {polarWeather} from './creuss-v8.js';
import contours from './asteroid-contours.json';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const V = (x,y,z) => new THREE.Vector3(x,y,z);
const TAU = Math.PI * 2;
const gltf = new GLTFLoader();
const color = value => new THREE.Color(value);
function randomFor(text) {
  let state=1;
  for(const ch of text) state=(state*31 + ch.charCodeAt(0))>>>0;
  return () => ((state=(Math.imul(state,1664525)+1013904223)>>>0) / 4294967296);
}
function sphere(lat,lon,r) {
  return V(r*Math.cos(lat)*Math.sin(lon),r*Math.sin(lat),r*Math.cos(lat)*Math.cos(lon));
}

// Particles travel along the atmosphere. Radius distinguishes lofted dust from falling ice.
const layers = {
  dust:    ['#dda06f',220,.105,.25, .09],
  hail:    ['#e3f5ff',210,.024,.85, .08],
  soot:    ['#716c78',120,.11,.33, .04],
  spores:  ['#d0d89b',130,.031,.8, .09],
  embers:  ['#ff8530',110,.04,.85, .06],
  mist:    ['#dce9e7',120,.14,.14, .03],
  clouds:  ['#f5f0e8',100,.14,.12, .016],
  ice:     ['#cdeafc',95,.036,.7, .045],
  traffic: ['#ffcf85',24,.026,.95, .22],
  energy:  ['#a5a3ff',95,.05,.63,.07],
  debris:  ['#b29a94',95,.05,.8,.17],
  ash:     ['#998a91',100,.08,.4,.045],
};
function atmosphere(parent,r,key,random,animations,polar) {
  const [tint,count,size,opacity,speed]=layers[key];
  const dust=key==='dust', hail=key==='hail', traffic=key==='traffic';
  const coords=[], seeds=[];
  for(let i=0;i<count;i++) {
    const lat=polar&&(dust||hail) ? (i%3===0 ? -1 : 1)*(.58+.83*random()) : Math.asin(random()*2-1);
    const lon=polar&&(hail||dust) ? (i%4)*1.54 + random()*.86 : TAU*random();
    coords.push(lat,lon,random()); seeds.push(random());
  }
  const geom=new THREE.BufferGeometry();
  geom.setAttribute('position',new THREE.Float32BufferAttribute(coords,3));
  geom.setAttribute('seed',new THREE.Float32BufferAttribute(seeds,1));
  const mat=new THREE.ShaderMaterial({
    uniforms:{t:{value:0},r:{value:r},tint:{value:color(tint)},alpha:{value:opacity},heightPx:{value:600}},
    vertexShader:`uniform float t,r,heightPx; attribute float seed; varying float life; void main(){
      float phase=fract(position.z+t*${hail?'0.28':'.06'});
      float a=position.x+0.055*sin(phase*6.283+seed*12.);
      float b=position.y+t*${speed.toFixed(3)}+0.07*sin(a*7.+phase*6.283);
      float h=${hail?'(1.-phase)*.10':traffic?'.10+seed*.18':'seed*.035+phase*.025'};
      vec3 p=vec3(cos(a)*sin(b),sin(a),cos(a)*cos(b))*r*(1.012+h);
      vec4 v=modelViewMatrix*vec4(p,1.);
      gl_Position=projectionMatrix*v;
      gl_PointSize=clamp(heightPx*projectionMatrix[1][1]*r*${size.toFixed(3)}*(.65+.6*seed)/(-2.*v.z),1.2,72.);
      life=${traffic?'1.':'.3+.7*sin(3.14159*phase)'};
    }`,
    fragmentShader:`uniform vec3 tint; uniform float alpha; varying float life; void main(){
      vec2 p=gl_PointCoord-.5; ${hail?'p.x=p.x*1.9+p.y*.42;':''}
      ${dust||key==='mist'||key==='clouds'||key==='soot'?'p.y=p.y*1.65+.13*sin(p.x*8.);':''}
      float a=clamp(1.-4.*dot(p,p),0.,1.);
      gl_FragColor=vec4(tint,alpha*life*a*a);
      #include <colorspace_fragment>
    }`,
    transparent:true,depthWrite:false,blending:['energy','embers','traffic'].includes(key)?THREE.AdditiveBlending:THREE.NormalBlending
  });
  const points=new THREE.Points(geom,mat); points.frustumCulled=false; points.renderOrder=3;
  parent.add(points);
  animations.push((t,px)=>{mat.uniforms.t.value=t; mat.uniforms.heightPx.value=px;});
}
function lightning(parent,r,random,animations) {
  for(let storm=0;storm<7;storm++) {
    const pts=[], lat=(storm%2?-.86:.86)+(random()-.5)*.35, lon=storm*.91+.12;
    let prev=sphere(lat,lon,r*1.055);
    for(let k=1;k<=12;k++){
      const a=lat-k*.018+(random()-.5)*.046,b=lon+k*.034+(random()-.5)*.042;
      const next=sphere(a,b,r*1.055);
      pts.push(prev,next);
      if(k%3===0)pts.push(next,sphere(a-.066,b-.046,r*1.052));
      prev=next;
    }
    const mat=new THREE.LineBasicMaterial({color:0xc6dbff,transparent:true,depthWrite:false});
    const bolt=new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts),mat);
    parent.add(bolt);
    animations.push(t=>{const phase=(t+storm*1.71)%6.8;mat.opacity=phase<.48?.92*Math.exp(-phase*5):.015;});
  }
}
function ring(parent,r,dark) {
  const group=new THREE.Group();
  group.rotation.order='ZXY';group.rotation.x=-1.28;group.rotation.z=.38;
  for(const [inner,outer] of [[1.20,1.24],[1.28,1.34],[1.37,1.40],[1.44,1.57],[1.60,1.66],[1.81,1.94],[1.98,2.0]]) {
    const geo=new THREE.RingGeometry(inner*r,outer*r,160);
    const vertices=geo.attributes.position, colors=[];
    const pall=[0x615eaf,0x84cbc3,0xa96a99,0xdd82a3].map(color);
    for(let i=0;i<vertices.count;i++){
      const angle=Math.atan2(vertices.getY(i),vertices.getX(i));
      const phase=1.5+1.47*Math.cos(angle-.6+inner*.35),k=Math.floor(phase);
      const c=pall[k].clone().lerp(pall[Math.min(k+1,3)],phase-k);
      c.multiplyScalar(dark?.65:.9);
      colors.push(c.r,c.g,c.b);
    }
    geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
    group.add(new THREE.Mesh(geo,new THREE.MeshBasicMaterial({vertexColors:true,toneMapped:false,transparent:true,opacity:.87,side:THREE.DoubleSide,depthWrite:false})));
  }
  parent.add(group);
}
export function gasTorus() {
  const root=new THREE.Group();
  const random=randomFor('Atharal gas torus'), positions=[], phases=[];
  for(let i=0;i<700;i++){
    const a=random()*TAU,r=64+(random()+random()-1)*6;
    positions.push(3+r*Math.cos(a),19+r*.47*Math.sin(a)+(random()-.5)*6,-151+Math.sin(a)*10+(random()-.5)*7);
    phases.push(random());
  }
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geo.setAttribute('phase',new THREE.Float32BufferAttribute(phases,1));
  const mat=new THREE.ShaderMaterial({uniforms:{t:{value:0}},vertexShader:`attribute float phase; varying float f;uniform float t;
    void main(){f=phase;vec3 p=position;p.y+=1.8*sin(t*.16+phase*6.28);
    vec4 v=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*v;gl_PointSize=clamp((2300.+3100.*phase)/-v.z,2.,55.);}`,
    fragmentShader:`varying float f; void main(){vec2 p=(gl_PointCoord-.5)*2.;float h=max(0.,1.-dot(p,p));
    gl_FragColor=vec4(mix(vec3(.45,.49,.26),vec3(.74,.68,.26),f),.036*h*h);
    #include <colorspace_fragment>
    }`,blending:THREE.AdditiveBlending,transparent:true,depthWrite:false});
  root.add(new THREE.Points(geo,mat));root.userData.tick=t=>mat.uniforms.t.value=t;return root;
}
function moons(parent,r,count,random,animations) {
  const pivot=new THREE.Group();pivot.rotation.z=.22;parent.add(pivot);
  for(let i=0;i<count;i++) {
    const moon=new THREE.Mesh(new THREE.IcosahedronGeometry(r*(count>1?.047:.11),2),new THREE.MeshStandardMaterial({color:0xaaa299,flatShading:true}));
    const a=.79+i*TAU/count;
    pivot.add(moon);
    animations.push(t=>moon.position.copy(sphere(.13,a+t*.035,r*(1.42+.12*i))));
  }
}
function normaliseModel(model) {
  const box=new THREE.Box3().setFromObject(model);
  const size=box.getSize(V(0,0,0)), center=box.getCenter(V(0,0,0));
  model.position.sub(center);
  const root=new THREE.Group();root.add(model);
  return {root,diameter:Math.max(size.x,size.y,size.z,.001)};
}
async function mountProp(prop,index,g,r,env,live,animations,body) {
  const path='dossier-worlds/models/'+prop.model+'.glb';
  let result;
  if(env.local){
    const payload=await env.loadLocal(path);
    const bytes=env.decodeBytes(payload.replace(/^data:[^,]+,/,''));
    result=await gltf.parseAsync(bytes.buffer,'');
  }else result=await gltf.loadAsync(env.asset(path));
  if(!live()){disposeWorld(result.scene);return;}
  const {root,diameter}=normaliseModel(result.scene), orbit=new THREE.Group();
  root.userData.label=prop.label; g.add(orbit); orbit.add(root);
  const central=prop.placement==='body', belt=prop.model==='sumerian-station', ground=prop.placement==='surface';
  const span=r*(central?2.05:belt?3.4:ground?.31:.55);
  root.scale.setScalar(span/diameter);
  if(prop.model==='flaah') root.userData.flaahScale=span/diameter;
  if(central){body.visible=false;return;}
  if(belt){root.rotation.x=.31;root.rotation.z=.25;return;}
  const atmospheric=prop.placement==='atmosphere'||prop.model==='flaah';
  const lat=prop.model==='qwaar-palace'?-.44:ground?.23:index%2?-.18:.31, start=ground?-.37:[.99,-.64,-1.35,.58][index%4];
  if(prop.model==='wun-escha'){
    const water=new THREE.Mesh(new THREE.SphereGeometry(.56*diameter,24,16),new THREE.MeshBasicMaterial({
      color:0x3cbbd9,transparent:true,opacity:.19,depthWrite:false}));
    water.scale.set(1,.72,1);root.add(water);
  }
  if(ground){root.position.copy(sphere(lat,start,r*(prop.model==='wun-escha'?1.003:prop.model==='flaah'?1.12:1.034)));if(body.userData.surfacePoint)root.position.copy(body.userData.surfacePoint(root.position.clone().normalize())).multiplyScalar(prop.model==='flaah'?1.12:1.012);root.quaternion.setFromUnitVectors(V(0,1,0),root.position.clone().normalize());body.add(orbit);}
  else {
    const advance=t=>{const a=start+t*(.047-index*.006);root.position.copy(sphere(lat+.15*Math.sin(a),a,r*(atmospheric?1.095:1.36+.08*index)));root.rotation.y=a+.43;};
    advance(0);animations.push(advance);
  }
}
// A few systems have solid foreground detail as well as a painted reference.
function fragments(group,r,random,animations,shattered) {
  const n=shattered?37:52;
  const rock=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,0),new THREE.MeshStandardMaterial({
    color:shattered?0x976659:0x9e8e79,roughness:1,flatShading:true
  }),n);
  const temp=new THREE.Object3D();
  for(let i=0;i<n;i++){
    const a=random()*TAU,dist=r*(1.1+random()*.57);
    temp.position.set(dist*Math.cos(a),dist*(shattered?.85:.40)*Math.sin(a),Math.sin(2*a)*r*.3);
    const size=r*(.009+random()**3*.077);
    temp.scale.set(size*1.55,size,size*.82);temp.rotation.set(random()*5,random()*5,random()*5);temp.updateMatrix();
    rock.setMatrixAt(i,temp.matrix);
  }
  group.add(rock);animations.push(t=>rock.rotation.y=.017*t);
}
function surfaceLights(body,r,random,animations,cities) {
  const nodes=new THREE.Group();
  for(let i=0;i<(cities?6:15);i++){
    const lat=(random()-.5)*1.8,lon=TAU*(i+.23)/15;
    const site=new THREE.Group();site.position.copy(sphere(lat,lon,r*1.002));
    site.quaternion.setFromUnitVectors(V(0,0,1),site.position.clone().normalize());
    const radius=r*(cities?.045:.012)*(1+random());
    const mat=new THREE.MeshBasicMaterial({color:cities?0xd8ca9c:0xf69969,transparent:true,opacity:.72,depthWrite:false,side:THREE.DoubleSide});
    site.add(new THREE.Mesh(new THREE.RingGeometry(radius*.77,radius,32),mat));
    if(cities){site.add(new THREE.Mesh(new THREE.RingGeometry(radius*.35,radius*.43,24),mat));}
    nodes.add(site);
    animations.push(t=>mat.opacity=.46+.23*Math.sin(i+t*.65));
  }
  body.add(nodes);
}
function dimensionalDust(group,r,random,animations,kind) {
  const count=kind==='nebula'?310:240,pts=[],colors=[];
  for(let i=0;i<count;i++){
    const a=i*.16,dist=r*(.1+random());
    pts.push(Math.cos(a+dist/r*2.2)*dist,Math.sin(a+dist/r*2.2)*dist*.84,(random()-.5)*r*.44);
    const c=color(kind==='dimension'?0xf77570:kind==='vortex'?0x7fbde4:kind==='nebula'?0xc2a4bf:0xd487ef);
    c.multiplyScalar(.3+random());colors.push(c.r,c.g,c.b);
  }
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(pts,3));
  geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  const swarm=new THREE.Points(geo,new THREE.PointsMaterial({size:r*.014,vertexColors:true,blending:THREE.AdditiveBlending,transparent:true,opacity:.65,depthWrite:false}));
  group.add(swarm);animations.push(t=>{swarm.rotation.z=t*.018;swarm.rotation.y=.2*Math.sin(t*.09);});
}
function waterHighlights(mat,animations){
  const time={value:0};
  mat.onBeforeCompile=shader=>{
    shader.uniforms.tideTime=time;
    shader.fragmentShader='uniform float tideTime;\n'+shader.fragmentShader.replace('#include <map_fragment>',`
      #include <map_fragment>
      #ifdef USE_MAP
      float wet=smoothstep(.0,.14,diffuseColor.b-diffuseColor.r);
      float wave=sin(vMapUv.x*950.+sin(vMapUv.y*270.)*3.+tideTime)+sin(vMapUv.y*1100.-tideTime*.45);
      diffuseColor.rgb+=wet*.06*pow(max(0.,wave*.5),6.)*vec3(.45,.78,.95);
      #endif
    `);
  };
  animations.push(t=>time.value=t);
}

export function disposeWorld(group) {
  group.userData.disposeTerrain?.();
  const textures=new Set(), mats=new Set(), geos=new Set();
  group.traverse(o=>{if(o.geometry)geos.add(o.geometry);for(const m of [].concat(o.material||[])){mats.add(m); for(const v of Object.values(m))if(v?.isTexture)textures.add(v);}});
  for(const item of [...textures,...mats,...geos])item.dispose();
}
export function worldScene(d,r,env,live){
  const g=new THREE.Group(), animations=[],random=randomFor(d.slug);
  if(profiles[d.slug]){
    const profile={guide:'dossier-worlds/maps/'+d.slug+'.webp',...profiles[d.slug]};
    const terrain=createTerrain({
      renderer:env.renderer,radius:r,profile,outline:contours[d.name],failed:env.failed,
      load:async path=>new THREE.TextureLoader().loadAsync(env.local?await env.loadLocal(path):env.asset(path))
    });
    const body=terrain.root;
    body.userData.surfacePoint=terrain.sample;
    g.add(body);
    for(const key of d.effects||[]){
      if(key==='asteroids')fragments(g,r,random,animations,false);
      if(layers[key])atmosphere(body,r,key,random,animations,false);
    }
    const props=(d.props||[]).map((prop,i)=>terrain.loaded.then(()=>live() && mountProp(prop,i,g,r,env,live,animations,body)));
    g.userData.ready=Promise.all([terrain.loaded,...props]).catch(e=>env.failed(d.name,e));
    g.userData.disposeTerrain=terrain.dispose;
    g.userData.update=(time,px,camera)=>{
      if(!g.visible)return;
      body.rotation.y=.006*time;
      if(d.slug==='nestphar'){
        const distance=g.worldToLocal(camera.getWorldPosition(new THREE.Vector3())).length()/r;
        const scale=THREE.MathUtils.smoothstep(distance,1.45,1.85);
        body.traverse(o=>{if(o.userData.flaahScale)o.scale.setScalar(o.userData.flaahScale*scale);});
      }
      terrain.update(camera,px,time);
      for(const move of animations)move(time,px);
    };
    return g;
  }
  const creuss=d.name==='Creuss';
  const special=!creuss&&['rift','nebula','vortex','station','dimension'].includes(d.kind);
  let geom=special?new THREE.PlaneGeometry(r*2.2,r*2.2):new THREE.SphereGeometry(r,96,64);
  if(d.kind==='asteroid'){
    const v=geom.attributes.position;
    for(let i=0;i<v.count;i++){
      const n=V(v.getX(i),v.getY(i),v.getZ(i)).normalize();
      const outline=contours[d.name];
      const angle=((Math.atan2(n.y,n.x)/TAU+1)%1)*(outline?.length||1),j=Math.floor(angle);
      const rad=outline?r*THREE.MathUtils.lerp(outline[j],outline[(j+1)%outline.length],angle-j):r;
      v.setXYZ(i,rad*n.x,rad*n.y,r*n.z*(.74+.09*Math.sin(5*n.x+4*n.y)));
    }
    geom.computeVertexNormals();
  }
  const mat=new THREE.MeshBasicMaterial({color:0xffffff,toneMapped:false,side:special?THREE.DoubleSide:THREE.FrontSide,transparent:special,alphaTest:special?.035:0});
  const body=new THREE.Mesh(geom,mat);g.add(body);
  if(creuss){polarWeather(body,r,random,animations);mat.color.set(0x76d8ff);}
  const path=creuss?d.terrain:'dossier-worlds/maps/'+d.slug+'.webp';
  const mapReady=(async()=>{
    const url=env.local?await env.loadLocal(path):env.asset(path);
    const map=await new THREE.TextureLoader().loadAsync(url);
    if(!live()){map.dispose();return;}
    map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=env.caps.getMaxAnisotropy();
    mat.map=map;mat.needsUpdate=true;
  })().catch(error=>env.failed(d.slug,error));
  const keys=new Set(d.effects||[]);
  if(keys.has('ocean'))waterHighlights(mat,animations);
  let materialReady;
  if(d.kind!=='station'){
    const zones={
      alloy:['[0.0.0]','Mordai II','Ixth','Mecatol Rex','Elysium','Mez Lo Orz Fei Zsha'],
      lava:['Muaat','Tallin Hollow'],sand:['Hercant','Arretze','Kamdorn','Quinarra','Darien','Winnu'],
      ice:["Tren'lak",'Arcturus','Archon Tau'],canopy:['Nestphar','Wren Terra','Druaa','Naazir','Rokha','Archon Ren','Jord','Moll Primus'],
      reef:['Nar','Jol','Ikatena','Rep Lo Orz Qet'],cloud:['Acheron','The Dark','Ahk Creuxx','Creuss','Cronos','Cronos Hollow','Valk','Ylir','Avar','Shalloq','Tallin'],
      marsh:['Maaluuk','Retillion']
    };
    const zone=Object.keys(zones).find(k=>zones[k].includes(d.name))||'stone';
    const materialPath='dossier-worlds/materials-v9/'+zone+'.jpg';
    const grain={value:null},offset={value:new THREE.Vector2(random(),random())};
    materialReady=(async()=>{
      const url=env.local?await env.loadLocal(materialPath):env.asset(materialPath);
      const tile=await new THREE.TextureLoader().loadAsync(url);
      if(!live()){tile.dispose();return;}
      tile.wrapS=tile.wrapT=THREE.MirroredRepeatWrapping;tile.anisotropy=env.caps.getMaxAnisotropy();
      mat.surfaceTile=tile;grain.value=tile;mat.needsUpdate=true;
    })().catch(e=>env.failed(materialPath,e));
    const terrainLayer={value:null};
    const mindnet=d.slug==='0-0-0';
    const terrainPath='dossier-worlds/'+(mindnet?'terrain-v12/':'terrain-v11/')+d.slug+'.jpg';
    const terrainReady=(async()=>{
      const url=env.local?await env.loadLocal(terrainPath):env.asset(terrainPath);
      const tex=await new THREE.TextureLoader().loadAsync(url);
      if(!live()){tex.dispose();return;}
      tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=env.caps.getMaxAnisotropy();
      mat.reliefLayer=tex;terrainLayer.value=tex;mat.needsUpdate=true;
    })().catch(e=>env.failed(terrainPath,e));
    const districtReady=mindnet && (async()=>{
      const path='dossier-worlds/terrain-v12/central-district.jpg';
      const url=env.local?await env.loadLocal(path):env.asset(path);
      const tex=await new THREE.TextureLoader().loadAsync(url);
      if(!live()){tex.dispose();return;}
      tex.colorSpace=THREE.SRGBColorSpace;
      tex.anisotropy=env.caps.getMaxAnisotropy();
      mat.districtMap=tex;mat.needsUpdate=true;
    })().catch(e=>env.failed('central district',e));
    materialReady=Promise.all([materialReady,terrainReady,districtReady]);
    const original=mat.onBeforeCompile.bind(mat);
    let generation=0, requested; const detailUniform={value:null};
    mat.onBeforeCompile=shader=>{
      original(shader);
      if(!mat.terrainDetail||!grain.value||!terrainLayer.value)return;
      shader.uniforms.reliefLayer=terrainLayer;shader.uniforms.detailMap=detailUniform;
      for(let i=1;i<4;i++)shader.uniforms['quadrant'+i]={value:mat['quadrant'+i]||null};shader.uniforms.grain=grain;shader.uniforms.origin=offset;
      if(mat.districtMap)shader.uniforms.districtMap={value:mat.districtMap};
      const tiles=Boolean(mat.quadrant1);
      shader.fragmentShader=(mat.districtMap?'#define CENTRAL_DISTRICT\nuniform sampler2D districtMap;\n':'')+(tiles?'#define PLANET_QUADRANTS\n':'')+'uniform sampler2D quadrant1,quadrant2,quadrant3;uniform sampler2D detailMap,grain,reliefLayer;uniform vec2 origin;\n'+shader.fragmentShader.replace('#include <map_fragment>',`
        #include <map_fragment>
        #ifdef USE_MAP
        vec3 fine=texture2D(detailMap,vMapUv).rgb;
        vec3 broad=textureLod(detailMap,vMapUv,5.0).rgb;
        #ifdef PLANET_QUADRANTS
          vec2 tileUV=fract(vMapUv*2.);
          vec2 dx=dFdx(vMapUv)*2.,dy=dFdy(vMapUv)*2.;
          if(vMapUv.y>.5){
            if(vMapUv.x<.5){fine=textureGrad(detailMap,tileUV,dx,dy).rgb;broad=textureLod(detailMap,tileUV,5.).rgb;}
            else {fine=textureGrad(quadrant1,tileUV,dx,dy).rgb;broad=textureLod(quadrant1,tileUV,5.).rgb;}
          }else{
            if(vMapUv.x<.5){fine=textureGrad(quadrant2,tileUV,dx,dy).rgb;broad=textureLod(quadrant2,tileUV,5.).rgb;}
            else {fine=textureGrad(quadrant3,tileUV,dx,dy).rgb;broad=textureLod(quadrant3,tileUV,5.).rgb;}
          }
        #endif
        vec3 weights=vec3(.2126,.7152,.0722);
        vec3 terrain=texture2D(reliefLayer,vMapUv).rgb;
        #ifdef CENTRAL_DISTRICT
          vec2 districtUV=(vMapUv*vec2(8192.,4096.)-vec2(1515.,2853.))/520.;
          vec2 edges=min(districtUV,1.-districtUV);
          float districtWeight=smoothstep(0.,.085,min(edges.x,edges.y));
          terrain=mix(terrain,texture2D(districtMap,districtUV).rgb,districtWeight);
        #endif
        vec3 tint=(broad+.03)/(dot(broad,weights)+.03);
        vec3 palette=mix(terrain,terrain*tint,.55);
        palette=mix(palette,broad,${mindnet?'.045':special?'.85':creuss?'.55':'.24'});
        vec2 uv=vMapUv*vec2(1.,.5);
        float tileWidth=float(textureSize(grain,0).x);
        float contrast=0.;
        // Band-limited material octaves span 16K to 100x the master's linear texel density.
        // Remove each octave's mean so the dossier's geography remains stable as the view changes.
        for(int i=0;i<5;i++){
          float scale=(16384./tileWidth)*pow(3.16227766,float(i));
          vec2 st=uv*scale+origin*float(i+1);
          st+=.18*texture2D(grain,uv*(scale*.071)+origin).rg;
          float footprint=max(length(dFdx(st)),length(dFdy(st)))*tileWidth;
          float resolved=1.-smoothstep(2.,14.,footprint);
          vec3 texel=texture2D(grain,st).rgb;
          vec3 localMean=textureLod(grain,st,4.).rgb;
          contrast+=resolved*dot(texel-localMean,weights)*(.9-.11*float(i));
        }
        diffuseColor.rgb=palette*exp2(contrast);
        #endif
      `);
    };
    mat.customProgramCacheKey=()=>String(Boolean(mat.terrainDetail&&grain.value&&terrainLayer.value))+'-'+String(Boolean(mat.quadrant1))+'-'+String(keys.has('ocean'))+'-'+d.kind+'-'+String(mindnet)+'-'+String(Boolean(mat.districtMap));
    g.userData.setDetail=async focused=>{
      const max=env.caps.maxTextureSize;
      const suffix=!focused?'.webp':max>=16384?'.jpg':max>=8192?'quadrants':'-8k.jpg';
      if(requested===suffix)return;
      requested=suffix;
      const revision=++generation;
      const file=suffix==='.webp'?path:'dossier-worlds/maps-v10/'+d.slug+suffix;
      try{
        const paths=suffix==='quadrants'?[0,1,2,3].map(i=>'dossier-worlds/maps-v10/'+d.slug+'-q'+i+'.jpg'):[file];
        const textures=[];
        try{
          for(const item of paths){
            const url=env.local?await env.loadLocal(item):env.asset(item);
            if(!live()||generation!==revision)break;
            const tex=await new THREE.TextureLoader().loadAsync(url);
            tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=env.caps.getMaxAnisotropy();
            textures.push(tex);
          }
        }catch(e){textures.forEach(tex=>tex.dispose());throw e;}
        if(!live()||generation!==revision){textures.forEach(tex=>tex.dispose());return;}
        for(let i=1;i<4;i++){mat['quadrant'+i]?.dispose();mat['quadrant'+i]=textures[i]||null;}
        mat.terrainDetail?.dispose();mat.terrainDetail=textures[0];detailUniform.value=textures[0];
        mat.needsUpdate=true;
      }catch(error){requested=undefined;env.failed(file,error);}
    };
  }
  if(keys.has('machinery')||d.slug==='mez-lo-orz-fei-zsha')surfaceLights(body,r,random,animations,d.slug==='mez-lo-orz-fei-zsha');
  if(keys.has('asteroids')||d.kind==='rift')fragments(g,r,random,animations,d.kind==='rift');
  if(['vortex','dimension','nebula','rift'].includes(d.kind))dimensionalDust(g,r,random,animations,d.kind);
  if(keys.has('lightning'))lightning(body,r,random,animations);
  if(keys.has('planetary-rings'))ring(g,r,d.name==='Cronos Hollow');
  if(d.moonCount)moons(g,r,d.moonCount,random,animations);
  for(const key of keys) if(layers[key])atmosphere(special?g:body,r,key,random,animations,d.name==='Quinarra');
  const propsReady=(d.props||[]).map((p,i)=>mountProp(p,i,g,r,env,live,animations,body).catch(error=>env.failed(p.label,error)));
  g.userData.ready=Promise.all([mapReady,materialReady,...propsReady]);
  g.userData.update=(t,px,camera)=>{
    if(special){body.quaternion.copy(g.getWorldQuaternion(new THREE.Quaternion()).invert()).multiply(camera.quaternion);}
    else body.rotation.y=.006*t;
    for(const move of animations)move(t,px);
  };
  return g;
}
