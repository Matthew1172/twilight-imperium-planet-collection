import {profiles,uncachedAssets} from './profiles.js';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import ships from '../flagship-viewer-config.json';

import dossier from './dossier-config.json';
import { worldScene, disposeWorld, gasTorus } from './dossier-terrain-pilot.js';

const assets = new URL('.', document.currentScript.src);
const asset = path => new URL(path, assets).href;
const motionPreference=matchMedia('(prefers-reduced-motion: reduce)');
const motionPaused=()=>motionPreference.matches || document.body.matches('.world-effects-paused,.ambience-paused');

const local = location.protocol === 'file:';
const localAssets = new Map();
let assetSequence=0;
function loadLocal(path) {
  if (localAssets.has(path)) return localAssets.get(path);
  const promise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const token = 'flagshipAsset' + (++assetSequence);
    window[token] = resolve;
    script.src = asset(path + '.js') + '#' + token;
    script.onload = () => { delete window[token]; script.remove(); };
    script.onerror = () => { delete window[token]; script.remove(); reject(new Error(path)); };
    document.head.append(script);
  });
  if(!path.startsWith('dossier-worlds/maps-v10/')&&!uncachedAssets.has(path))localAssets.set(path, promise);
  return promise;
}

function decodeBytes(base64) {
  if(Uint8Array.fromBase64)return Uint8Array.fromBase64(base64);
  const raw=atob(base64),out=new Uint8Array(raw.length);
  for(let i=0;i<out.length;i++)out[i]=raw.charCodeAt(i);
  return out;
}

function nebula() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#02040e';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < 42; i++) {
    const x = 40 + i * 23;
    const y = 260 + 86 * Math.sin(i * .22);
    const radius = 55 + 68 * (Math.sin(i * 1.8) + 1);
    const cloud = ctx.createRadialGradient(x,y,0,x,y,radius);
    cloud.addColorStop(0, i % 3 ? '#6546dd13' : '#e7388f1a');
    cloud.addColorStop(1, '#04061500');
    ctx.fillStyle = cloud;
    ctx.fillRect(x-radius,y-radius,2*radius,2*radius);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

async function mount(panel) {
  const ship = ships[panel.dataset.flagshipModel];
  if (!ship) return;
  const stage = panel.querySelector('.flight-stage');
  const status = panel.querySelector('[role=status]');
  const download = panel.querySelector('[download]');
  const plain = panel.querySelector('input');
  const chooser = panel.querySelector('select');
  const path = panel.dataset.previewModel || ship.model;
  const url = asset(path);
  stage.style.backgroundImage = `url("${asset(ship.poster)}")`;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, .1, 650);
  camera.position.set(52, 30, 72);
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.18;
    renderer.setPixelRatio(devicePixelRatio);
  } catch {
    status.textContent = 'WebGL is unavailable. Use the STL download to inspect the model.';
    download.href = url;
    download.hidden = false;
    return;
  }
  stage.append(renderer.domElement);
  renderer.domElement.setAttribute('aria-label', ship.name + ' interactive STL model');
  const controls = new OrbitControls(camera,renderer.domElement);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minDistance = 48;
  controls.maxDistance = 135;
  scene.add(new THREE.HemisphereLight(0xb6cfff, 0x39253f, 2.1));
  for (const [color, intensity, pos] of [[0xffedcf,3,[35,65,40]],[0x667bff,2,[-43,10,-70]]]) {
    const light = new THREE.DirectionalLight(color,intensity);
    light.position.set(...pos);
    scene.add(light);
  }
  const cosmos = new THREE.Group();
  const home = new THREE.Group();
  const galaxyTexture = nebula();
  camera.lookAt(0,0,0);
  home.quaternion.copy(camera.quaternion);
  cosmos.add(home);
  const backdrop = new THREE.Scene();
  backdrop.add(cosmos);
  backdrop.add(new THREE.HemisphereLight(0xe0edff,0x9e8584,1.55));
  const sun = new THREE.DirectionalLight(0xffe4c7,3.3);
  sun.position.set(-120,85,110).applyQuaternion(home.quaternion);
  backdrop.add(sun);
  backdrop.background = new THREE.Color(0x02040e);
  renderer.autoClear = false;

  const stars = [];
  for (let i=0; i<1900; i++) {
    const v = new THREE.Vector3().randomDirection();
    stars.push(...v.multiplyScalar(185 + Math.random()*22));
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(stars, 3));
  const starfield = new THREE.Points(starGeo, new THREE.PointsMaterial({
    color:0xc5d7ff, size:.28, opacity:.82, transparent:true
  }));
  cosmos.add(starfield);

  const sky = new THREE.Mesh(new THREE.SphereGeometry(220, 48, 32),
    new THREE.MeshBasicMaterial({map:galaxyTexture, side:THREE.BackSide, depthWrite:false}));
  sky.renderOrder=-1;
  cosmos.add(sky);

  const dust = new Float32Array(200*3);
  for (let i=0; i<dust.length; i++) dust[i]=(Math.random()-.5)*135;
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position',new THREE.BufferAttribute(dust,3));
  const particles = new THREE.Points(dustGeo,new THREE.PointsMaterial({
    color:0x8ebcff, size:.19, opacity:.44, transparent:true, blending:THREE.AdditiveBlending
  }));
  cosmos.add(particles);

  const systems=ship.systems.map(group=>group.slice());
  if(ship.folder.endsWith('/council-keleres') && dossier['Mecatol Rex']) systems.push([{name:'Mecatol Rex'}]);
  if (systems.length > 1) {
    systems.forEach((group,i)=>chooser.add(new Option(group[0].name==='Mecatol Rex'?'Council headquarters · Mecatol Rex':group.map(p=>p.name).join(' / '),i)));
    chooser.closest('label').hidden=false;
  }

  const focusLabel=document.createElement('label');
  focusLabel.append('Inspect ');
  const focus=document.createElement('select');
  focus.setAttribute('aria-label','Inspect flagship or home world');
  focusLabel.append(focus);panel.querySelector('.flight-header').append(focusLabel);
  const info=document.createElement('div');
  info.className='flight-reference';info.hidden=true;
  stage.after(info);
  const homeView={position:camera.position.clone(),target:controls.target.clone()};
  let active=[],systemRevision=0,elapsed=0,lastFrame;
  const issues=new Set();
  const env={renderer,caps:renderer.capabilities,asset,local,loadLocal,decodeBytes,failed:(id,err)=>{issues.add(id);console.error('Dossier asset:',id,err);status.textContent='Unable to load '+[...issues].join(', ')+'.';}};

  function reframe(){
    info.replaceChildren();
    const selected=focus.value===''?undefined:active[Number(focus.value)];
    active.forEach(w=>w.group.userData.setDetail?.(w===selected));
    info.hidden=!selected;
    active.forEach(w=>w.group.visible=!selected||w===selected||(selected.name==='Ordinian'&&w.name==='Revelation'));
    scene.visible=!selected;
    if (selected) {
      const {group,r,d,name}=selected,center=group.getWorldPosition(new THREE.Vector3());
      const narrow=Math.max(1,1/camera.aspect);
      const distance=r*4.75*narrow;
      controls.minDistance=r*1.2;
      controls.maxDistance=distance*1.9;
      controls.target.copy(center);
      const inspectionOffset=new THREE.Vector3(0,0,distance);
      if(d.slug==='0-0-0'){
        // The northern shipyards sit at this location in the equirectangular map.
        const longitude=2*Math.PI*130/600, colatitude=Math.PI*72/300;
        inspectionOffset.set(-Math.cos(longitude)*Math.sin(colatitude),Math.cos(colatitude),Math.sin(longitude)*Math.sin(colatitude))
          .applyAxisAngle(new THREE.Vector3(0,1,0),group.children[0].rotation.y).multiplyScalar(distance);
      }
      camera.position.copy(center).add(inspectionOffset.applyQuaternion(home.quaternion));
      const thumb=new Image();
      thumb.src=asset((d.reference||d.globe).replace(/^assets\//,''));
      thumb.alt=name+' as illustrated on the faction dossier';
      const card=document.createElement('a');card.href=asset('../'+d.card);card.target='_blank';card.rel='noopener';
      card.textContent='View dossier card';
      const nameTag=document.createElement('strong');nameTag.textContent=name;
      const copy=document.createElement('p');copy.textContent=d.description;
      const details=document.createElement('div');details.append(nameTag,copy,card);
      if(d.props?.length){
        const list=document.createElement('p');
        list.className='flight-objects';
        d.props.forEach((p,i)=>{
          if(i)list.append(' · ');
          const a=document.createElement('a');a.textContent=p.label;
          a.href=asset((p.concept || 'assets/dossier-worlds/models/'+p.model+'.png').replace(/^assets\//,''));
          a.title='View concept art';a.target='_blank';a.rel='noopener';list.append(a);
        });
        details.append(list);
      }
      const regions=profiles[d.slug]?.regions;
      if(regions){
        const places=document.createElement('div');
        places.className='d-flex flex-wrap gap-2 mt-2';
        for(const region of regions){
          const button=document.createElement('button');
          button.type='button';button.className='btn btn-sm btn-outline-secondary';
          button.textContent=region.label;
          button.addEventListener('click',()=>{
            const [u,v,w,h]=region.bounds;
            const lon=(u+w/2)*Math.PI*2,lat=(v+h/2-.5)*Math.PI;
            const direction=new THREE.Vector3(-Math.cos(lon)*Math.cos(lat),Math.sin(lat),Math.sin(lon)*Math.cos(lat));
            camera.position.copy(group.children[0].localToWorld(direction.multiplyScalar(r*1.45)));
            controls.target.copy(group.getWorldPosition(new THREE.Vector3()));controls.update();
          });
          places.append(button);
        }
        details.append(places);
      }
      info.append(thumb,details);
    }else{
      controls.minDistance=48;controls.maxDistance=135;
      controls.target.copy(homeView.target);camera.position.copy(homeView.position);
    }
    controls.update();
  }
  function setSystem(){
    const version=++systemRevision;
    stage.setAttribute('aria-busy','true');issues.clear();
    home.children.slice().forEach(group=>{disposeWorld(group);home.remove(group);});
    focus.replaceChildren(new Option(ship.name,''));
    active=[];
    const worlds=systems[Number(chooser.value)||0];
    panel.querySelector('.flight-worlds').textContent=worlds.map(p=>p.name).join(' · ');
    worlds.forEach(({name},i)=>{
      const d=dossier[name];if(!d){env.failed(name,'Missing dossier');return;}
      const r=name==='Revelation'?12:worlds.length===1?45:worlds.length===2?34:25;
      const group=worldScene(d,r,env,()=>version===systemRevision);
      const x=worlds.length===1?49:worlds.length===2?[-47,53][i]:[-62,6,67][i];
      const y=worlds.length===1?32:worlds.length===2?[20,41][i]:[18,49,20][i];
      group.position.set(x,y,-146-i*5);
      if(name==='Ordinian')group.position.set(18,26,-146);
      if(name==='Revelation')group.position.set(65,41,-138);
      home.add(group);
      focus.add(new Option(name,active.length));active.push({name,d,group,r});
    });
    if(worlds.length===3 && active.some(w=>w.d.effects?.includes('gas-torus'))){
      home.add(gasTorus());
    }
    const requestedWorld=new URLSearchParams(location.search).get('world');
    if(version===1 && requestedWorld){
      const i=active.findIndex(w=>w.name===requestedWorld);
      if(i>=0)focus.value=String(i);
    }
    reframe();
    Promise.all(active.map(w=>w.group.userData.ready)).then(()=>{
      if(version===systemRevision)stage.setAttribute('aria-busy','false');
    });
  }
  focus.addEventListener('change',()=>{if(plain.checked){plain.checked=false;mode();}reframe();});
  chooser.addEventListener('change',setSystem);
  setSystem();

  const material = new THREE.MeshStandardMaterial({color:0xb4b8c4, metalness:.28, roughness:.34});
  function mode() {
    if(plain.checked && focus.value!==''){focus.value='';reframe();}
    cosmos.visible = !plain.checked;
    scene.background = null;
    material.color.set(plain.checked ? 0xb4b8c4 : 0xcdd3df);
    plain.closest('label').lastChild.textContent = plain.checked ? 'Plain view' : 'Galactic view';
    panel.classList.toggle('flight-plain',plain.checked);
  }
  plain.addEventListener('change',mode);
  mode();

  const resize = new ResizeObserver(() => {
    const {clientWidth,clientHeight} = stage;
    if (!clientWidth || !clientHeight) return;
    const previousAspect=camera.aspect;
    renderer.setSize(clientWidth,clientHeight,false);
    camera.aspect=clientWidth/clientHeight;
    camera.updateProjectionMatrix();
    if(focus.value!=='' && Math.abs(previousAspect-camera.aspect)>.15)reframe();
  });
  resize.observe(stage);
  let visible = true;
  new IntersectionObserver(([entry]) => {visible=entry.isIntersecting;}).observe(panel);
  renderer.setAnimationLoop(() => {
    if (!visible || document.hidden){lastFrame=undefined;return;}
    const now=performance.now();
    if(!motionPaused() && !plain.checked && lastFrame!==undefined)elapsed+=Math.min(.1,(now-lastFrame)*.001);
    lastFrame=now;
    if(!plain.checked)for(const o of home.children)o.userData.tick?.(elapsed);
    if(!plain.checked)for(const w of active)w.group.userData.update(elapsed,renderer.domElement.height,camera);
    if (!motionPaused() && !plain.checked) {
      particles.rotation.y += .00035;
      const t = performance.now() * .001;
      particles.material.opacity = .38 + .09*Math.sin(t*.8);

    }
    controls.update();
    renderer.setClearColor(plain.checked ? 0x252a31 : 0x02040e);
    renderer.clear();
    if (!plain.checked) {
      renderer.render(backdrop,camera);
      renderer.clearDepth();
    }
    if(focus.value==='')renderer.render(scene,camera);
    if(new URLSearchParams(location.search).has('terrainDebug')){const selected=active[Number(focus.value)];panel.dataset.terrainDebug=JSON.stringify({maxTexture:renderer.capabilities.maxTextureSize,textures:renderer.info.memory.textures,terrain:selected?.group.children[0]?.userData.stats||null});}
  });
  try {
    const loader = new STLLoader();
    const geometry = local
      ? loader.parse(decodeBytes(await loadLocal(path)).buffer)
      : await loader.loadAsync(url);
    geometry.rotateX(-Math.PI/2); // Final STL files are Z-up.
    geometry.center();
    scene.add(new THREE.Mesh(geometry,material));
    status.textContent = panel.dataset.previewModel ? 'Earlier Artemiris test STL · viewer demonstration' : 'Drag to orbit · scroll or pinch to zoom';
    download.href = url;
    download.hidden = false;
  } catch {
    status.textContent = location.protocol === 'file:' ? 'The local model asset could not be loaded. Refresh the page and try again.' : 'The STL could not be loaded.';
    download.href=url;download.hidden=false;
  }

}

const lazy = new IntersectionObserver(entries => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    lazy.unobserve(entry.target);
    mount(entry.target);
  }
}, {rootMargin:'200px'});
document.querySelectorAll('[data-flagship-model]').forEach(panel => lazy.observe(panel));
