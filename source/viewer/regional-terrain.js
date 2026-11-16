import * as T from 'three';
import {terrainSettings} from './terrain-profile.js';

const clamp=T.MathUtils.clamp;
function dataField(texture){
  const c=document.createElement('canvas');c.width=1024;c.height=512;
  const ctx=c.getContext('2d',{willReadFrequently:true});
  ctx.drawImage(texture.image,0,0,1024,512);
  return ctx.getImageData(0,0,1024,512).data;
}

// Regional data is compact and available before the mesh is built. Color tiles stream
// separately, so a camera move never makes a landmark or a shoreline jump in height.
export function regionalTerrain(profile,get,load,failed){
  const settings=terrainSettings(profile);
  const cameraDir=new T.Vector3();
  const uniforms=Object.fromEntries(['baseSurface','coverSurface','mineralColor','sedimentColor','mineralSurface','sedimentSurface',
    'geology'].map(k=>[k,{value:null}]));

  uniforms.gridFade={value:new T.Vector4()};
  uniforms.regionReady={value:0};uniforms.materialReady={value:0};
  let disposed=false,materials,materialLoadedAt;
  const count=4,slots=Array.from({length:count},()=>({tile:null,texture:null,revision:0}));
  for(let i=0;i<count;i++){
    uniforms['gridMap'+i]={value:null};
    uniforms['gridRect'+i]={value:new T.Vector4(0,0,-1,-1)};
  }
  const grid=profile.grid||[],retry=new Map();
  let pending=0;
  function request(slot,tile){
    const revision=++slot.revision;
    slot.tile=tile;pending++;
    load(tile.color).then(tex=>{
      if(disposed||slot.revision!==revision||slot.tile!==tile){tex.dispose();return;}
      tex.colorSpace=T.SRGBColorSpace;
      tex.anisotropy=uniforms.geology.value?.anisotropy||1;
      tex.userData.tileId=tile.id;slot.texture=tex;
      slot.loadedAt=performance.now();
    }).catch(e=>{
      if(!disposed&&slot.revision===revision&&slot.tile===tile){slot.tile=null;retry.set(tile.id,performance.now()+15000);failed(tile.color,e);}
    }).finally(()=>{pending--;});
  }
  function stream(u,v,density){
    const candidates=[];
    for(const tile of grid){
      if(density<settings.fetchDensity*Math.pow(2,tile.depth)||(retry.get(tile.id)||0)>performance.now())continue;
      const [x,y,w,h]=tile.bounds;
      const du=Math.abs((((u-x-w/2)+1.5)%1)-.5),dv=Math.abs(v-y-h/2);
      const outside=Math.hypot(Math.max(0,du-w/2)*settings.gridScale[0],Math.max(0,dv-h/2)*settings.gridScale[1]);
      if(outside>settings.neighborRadius)continue;
      candidates.push({tile,score:outside*10+du+dv-(tile.depth && outside===0?.1:0)});
    }
    candidates.sort((a,b)=>a.score-b.score);
    const wanted=[];
    for(const {tile} of candidates){
      const lineage=[];
      for(let t=tile;t&&!wanted.includes(t);t=grid.find(p=>p.id===t.parent))lineage.unshift(t);
      if(wanted.length+lineage.length<=count)wanted.push(...lineage);
      if(wanted.length===count)break;
    }
    for(const slot of slots)if(slot.tile&&!wanted.includes(slot.tile)){
      slot.texture?.dispose();slot.texture=null;slot.tile=null;
    }
    for(const tile of wanted){
      if(pending>=settings.requestLimit)break;
      if(!slots.some(s=>s.tile===tile)){const slot=slots.find(s=>!s.tile);if(slot)request(slot,tile);}
    }
    const available=slots.filter(s=>s.texture).sort((a,b)=>a.tile.depth-b.tile.depth);
    const now=performance.now();
    for(let i=0;i<count;i++){
      const s=available[i];
      uniforms.gridFade.value.setComponent(i,s?T.MathUtils.smoothstep(now-s.loadedAt,0,settings.fadeMs):0);
      uniforms['gridMap'+i].value=s?.texture||null;
      if(s)uniforms['gridRect'+i].value.fromArray(s.tile.bounds);
      else uniforms['gridRect'+i].value.set(0,0,-1,-1);
    }
  }
  let data;
  const ready=profile.gridGeology ? get(profile.gridGeology,false,false).then(tex=>{
    if(!tex||disposed)return;
    tex.wrapS=T.RepeatWrapping;
    uniforms.geology.value=tex;uniforms.regionReady.value=1;data=dataField(tex);
  }) : Promise.resolve();
  function height(u,v,parent){
    if(!data)return parent;
    const x=u*1024-.5,y=clamp((1-v)*512-.5,0,511);
    const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy;
    const value=(dx,dy)=>data[4*(Math.min(511,iy+dy)*1024+((ix+dx+1024)%1024))]/255;
    return T.MathUtils.lerp(T.MathUtils.lerp(value(0,0),value(1,0),fx),T.MathUtils.lerp(value(0,1),value(1,1),fx),fy);
  }
  function update(camera,radius,px,fov){
    if(!grid.length)return;
    if(materialLoadedAt!==undefined)uniforms.materialReady.value=T.MathUtils.smoothstep(performance.now()-materialLoadedAt,0,settings.fadeMs);
    cameraDir.copy(camera).normalize();
    const distance=camera.length()/radius;
    // Start fetching before a parent texel fills a physical framebuffer pixel.
    const projected=px*settings.projectionScale/(2*Math.tan(fov*Math.PI/360)*Math.max(.08,distance-1)*(settings.referenceSize[0]/settings.gridScale[0]));
    if(projected>settings.materialDensity&&!materials){
      materials=Promise.all(Object.entries(profile.minerals||{}).map(async ([key,path])=>{
        const t=await get(path,true,!key.endsWith('Surface'));if(t)uniforms[key].value=t;
      })).then(()=>{if(!disposed)materialLoadedAt=performance.now();}).catch(e=>failed((profile.label||'Planet')+' materials',e));
    }
    const u=(Math.atan2(cameraDir.z,-cameraDir.x)/(2*Math.PI)+1)%1,v=Math.asin(cameraDir.y)/Math.PI+.5;
    const cap=profile.polarCaps?T.MathUtils.smoothstep(Math.abs(cameraDir.y),...settings.polarRange):0;
    const anchor=cameraDir.y>0?settings.polarNorth:settings.polarSouth;
    stream(cap>.5?anchor[0]+cameraDir.x*settings.polarScale[0]:u,cap>.5?anchor[1]+cameraDir.z*settings.polarScale[1]:v,projected);

  }
  return {ready,height,update,uniforms,debug:()=>({tiles:slots.filter(s=>s.texture).map(s=>s.tile.id),pending,geologyReady:uniforms.regionReady.value,materialReady:uniforms.materialReady.value}),dispose(){disposed=true;for(const s of slots)s.texture?.dispose();}};
}
