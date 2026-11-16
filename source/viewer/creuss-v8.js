import * as THREE from 'three';
export function polarWeather(body,r,random,animations){
  body.rotation.order='ZXY';body.rotation.z=.74;body.rotation.x=.53;
  const mouth=.32;
  // Trim both spherical caps. The open tube joins the two circular boundaries.
  body.geometry.dispose();
  body.geometry=new THREE.SphereGeometry(r,128,80,0,Math.PI*2,mouth,Math.PI-2*mouth);
  const clock={value:0};cloudVolume(body,r,clock);
  const cloud=new THREE.ShaderMaterial({uniforms:{t:clock},transparent:true,depthWrite:false,
    vertexShader:`varying vec3 p; varying vec3 n; varying vec3 eye; void main(){p=normalize(position);vec4 v=modelViewMatrix*vec4(position,1.);n=normalMatrix*normal;eye=-v.xyz;gl_Position=projectionMatrix*v;}`,
    fragmentShader:`varying vec3 p,n,eye;uniform float t;
    float hash(vec3 a){return fract(sin(dot(a,vec3(13.1,71.7,39.6)))*4375.4);}
    float noise3(vec3 a){vec3 i=floor(a),f=fract(a);f=f*f*(3.-2.*f);return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+1.),f.x),f.y),f.z);}
    void main(){vec3 q=normalize(p);float a=q.y*5.+.24*sin(q.y*10.+t*.09)+t*.032;
    q.xz=mat2(cos(a),-sin(a),sin(a),cos(a))*q.xz;
    float flow=noise3(q*4.);float density=.54*noise3(q*10.+2.*flow)+.30*noise3(q*26.+flow*4.)+.16*noise3(q*64.);
    float rim=pow(1.-max(dot(normalize(n),normalize(eye)),0.),3.);
    gl_FragColor=vec4(mix(vec3(.07,.48,.74),vec3(.79,.96,1.),smoothstep(.42,.68,density)),.69*smoothstep(.39,.68,density)+.27*rim);
    #include <colorspace_fragment>
    }`});
  body.add(new THREE.Mesh(new THREE.SphereGeometry(r*1.033,112,80,0,Math.PI*2,mouth,Math.PI-2*mouth),cloud));
  // A textured toroidal volume with a bright filament and feathered outer haze.
  const belt=new THREE.Group();belt.rotation.x=Math.PI/2;body.add(belt);
  const band=new THREE.ShaderMaterial({uniforms:{t:clock},transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
    vertexShader:`varying vec2 u;varying vec3 n,v;void main(){u=uv;vec4 q=modelViewMatrix*vec4(position,1.);n=normalMatrix*normal;v=-q.xyz;gl_Position=projectionMatrix*q;}`,
    fragmentShader:`varying vec2 u;varying vec3 n,v;uniform float t;void main(){
      float a=u.x*6.283185,b=u.y*6.283185;
      float braid=b*5.+1.9*sin(a*7.-t*.4)+.8*sin(a*17.+t*.25);
      float thread=pow(.5+.5*cos(braid),5.);
      float mist=.45+.55*pow(.5+.5*sin(a*13.+b*3.+t*.27),2.);
      float edge=smoothstep(0.,.36,dot(normalize(n),normalize(v)));
      gl_FragColor=vec4(mix(vec3(.08,.48,.84),vec3(.70,.98,1.),thread),edge*mist*(.19+.63*thread));
      #include <colorspace_fragment>
    }`});
  belt.add(new THREE.Mesh(new THREE.TorusGeometry(r*1.24,r*.145,36,200),band));
  const motes=[],hues=[];
  for(let i=0;i<2200;i++){
    const angle=random()*Math.PI*2, distance=r*(1.13+.26*random());
    motes.push(distance*Math.cos(angle),distance*Math.sin(angle),(random()+random()-1)*r*.14);
    hues.push(.25+.6*random(),.67+.3*random(),1);
  }
  const field=new THREE.BufferGeometry();
  field.setAttribute('position',new THREE.Float32BufferAttribute(motes,3));
  field.setAttribute('color',new THREE.Float32BufferAttribute(hues,3));
  const drift=new THREE.Points(field,new THREE.PointsMaterial({size:r*.007,vertexColors:true,transparent:true,opacity:.8,depthWrite:false,blending:THREE.AdditiveBlending}));
  belt.add(drift);animations.push(t=>drift.rotation.z=t*.07);
  const throatRadius=r*Math.sin(mouth),halfLength=r*Math.cos(mouth);
  const passage=new THREE.ShaderMaterial({uniforms:{t:clock},side:THREE.BackSide,
    vertexShader:`varying vec2 u;void main(){u=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`varying vec2 u;uniform float t;void main(){
      float depth=1.-abs(2.*u.y-1.);
      float spiral=u.x*18.84956+u.y*27.-t*.64;
      float vein=pow(.5+.5*cos(spiral+1.3*sin(u.y*17.+u.x*6.283)),8.);
      float ripple=pow(.5+.5*cos(depth*42.-t*.9),13.);
      vec3 wall=mix(vec3(.09,.023,.20),vec3(.006,.014,.065),depth);
      gl_FragColor=vec4(wall+(1.-depth*.79)*(vein*vec3(.34,.51,.90)+ripple*vec3(.22,.08,.43)),1.);
      #include <colorspace_fragment>
    }`});
  body.add(new THREE.Mesh(new THREE.CylinderGeometry(throatRadius,throatRadius,halfLength*2,112,32,true),passage));
  // Wisps follow different paths around the belt's cross section.
  for(let i=0;i<5;i++){
    const path=[];
    for(let j=0;j<160;j++){
      const a=j*2*Math.PI/160,phase=a*2+i*1.257;
      const radius=r*(1.27+.115*Math.cos(phase)+.025*Math.sin(7*a+i));
      path.push(new THREE.Vector3(radius*Math.cos(a),radius*Math.sin(a),r*.13*Math.sin(phase)));
    }
    const curve=new THREE.CatmullRomCurve3(path,true);
    const strand=new THREE.Mesh(new THREE.TubeGeometry(curve,192,r*(i%2?.009:.019),6,true),
      new THREE.MeshStandardMaterial({color:i%2?0x7aeaff:0x577ba9,emissive:0x15526c,roughness:.42}));
    belt.add(strand);animations.push(t=>strand.rotation.z=t*.021);
  }
  for(const sign of [-1,1]){
    const plume=new THREE.Group();plume.rotation.z=sign===1?0:Math.PI;body.add(plume);
    const lip=new THREE.Mesh(new THREE.TorusGeometry(throatRadius,r*.026,12,112),new THREE.MeshStandardMaterial({color:0xa4c8ff,emissive:0x7852b9,emissiveIntensity:.72,metalness:.32,roughness:.22}));
    lip.position.y=halfLength;lip.rotation.x=Math.PI/2;plume.add(lip);
    const profile=[[.51,0],[.83,.10],[.73,.17],[.89,.20],[.94,.55],[.86,.57],[.93,.60],[.81,.79],[.41,.90],[0,1]];
    const crystal=new THREE.LatheGeometry(profile.map(([x,y])=>new THREE.Vector2(x,y)),6).toNonIndexed();
    crystal.computeVertexNormals();
    const tint=[],pos=crystal.attributes.position;
    for(let v=0;v<pos.count;v++){
      const h=pos.getY(v), side=.65+.35*Math.cos(Math.atan2(pos.getZ(v),pos.getX(v))*3.);
      tint.push((.22+.7*h)*side,.21+.61*h,.62+.37*h);
    }
    crystal.setAttribute('color',new THREE.Float32BufferAttribute(tint,3));
    for(let i=0;i<42;i++){
      const a=random()*Math.PI*2,spread=Math.sqrt(random()),length=.14+.47*(1-spread)+.21*random();
      const m=new THREE.Mesh(crystal,new THREE.MeshStandardMaterial({color:i%3?0xb9aaff:0xabf5ff,emissive:0x7464cc,vertexColors:true,emissiveIntensity:.19,roughness:.21,metalness:.21,flatShading:true}));
      mineralSurface(m.material,clock);m.position.set(Math.cos(a)*r*(.34+.09*spread),r*.91,Math.sin(a)*r*(.34+.09*spread));
      m.scale.set(r*(.04+.04*random()),r*length*(i%9===0?1.32:1.),r*.055);m.rotation.set(spread*.48*Math.sin(a),a,-spread*.48*Math.cos(a));plume.add(m);
    }
    const count=980,positions=new Float32Array(count*3),seeds=Array.from({length:count},()=>[random(),random()*6.283,random()]);
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(positions,3));
    const points=new THREE.Points(geo,new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
      vertexShader:`void main(){vec4 v=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*v;gl_PointSize=clamp(540./-v.z,1.,8.);}`,
      fragmentShader:`void main(){float w=max(0.,1.-length(gl_PointCoord-.5)*2.);gl_FragColor=vec4(mix(vec3(.48,.26,.98),vec3(.9,.98,1.),w*w),w*w*.82);}`}));
    points.frustumCulled=false;plume.add(points);
    animations.push(t=>{clock.value=t;seeds.forEach(([offset,a,width],i)=>{const h=(offset+t*.17)%1,angle=a+h*3.;const s=r*(.31+.11*width+.09*Math.sin(h*3.14)-h*.08);positions.set([s*Math.cos(angle),r*(.98+.83*h),s*Math.sin(angle)],i*3);});geo.attributes.position.needsUpdate=true;});
  }
}

// Integrate cloud density along each sight line, stopping where it meets the globe.
function cloudVolume(body,r,clock){
  const material=new THREE.ShaderMaterial({uniforms:{t:clock},transparent:true,depthWrite:false,
    vertexShader:`varying vec3 entry,ray;void main(){entry=position;ray=position-(inverse(modelMatrix)*vec4(cameraPosition,1.)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`varying vec3 entry,ray;uniform float t;
    float hash(vec3 p){p=fract(p*.3183+.17);p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
    float noise3(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
    return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
    mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+1.),f.x),f.y),f.z);}
    void main(){vec3 dir=normalize(ray);float b=dot(entry,dir),hit=b*b-dot(entry,entry)+1.;
    float len=hit>0.?-b-sqrt(hit):-2.*b;float stepLen=max(0.,len)/44.;vec4 sum=vec4(0.);
    for(int i=0;i<44;i++){vec3 p=entry+dir*((float(i)+.5)*stepLen);float altitude=length(p)-1.;
      float pole=smoothstep(.78,1.,abs(normalize(p).y));
      float depth=.15+.34*pole;if(altitude>depth)continue;
      float a=p.y*3.8+t*.024+.4*sin(p.y*7.);
      vec3 q=p;q.xz=mat2(cos(a),-sin(a),sin(a),cos(a))*p.xz;
      float f=noise3(q*4.);float eddy=.52*noise3(q*10.+f*3.)+.31*noise3(q*24.+f*5.)+.17*noise3(q*54.);
      float density=smoothstep(.32,.72,eddy)*(1.-smoothstep(.025,depth,altitude));
      density*=smoothstep(.28,.46,length(p.xz));float absorb=1.-exp(-density*stepLen*(5.+5.*pole));
      float light=clamp(.57+.32*dot(normalize(p),normalize(vec3(-.6,.8,.6)))+.33*eddy,0.,1.);
      vec3 tint=mix(vec3(.018,.11,.24),mix(vec3(.50,.91,1.),vec3(.91,.70,1.),pole),light*light);
      sum.rgb+=(1.-sum.a)*absorb*tint;sum.a+=(1.-sum.a)*absorb;}
    if(sum.a<.005)discard;gl_FragColor=vec4(sum.rgb/sum.a,sum.a);
    #include <colorspace_fragment>
    }`});
  const shell=new THREE.Mesh(new THREE.SphereGeometry(1.51,80,48),material);
  shell.scale.setScalar(r);shell.renderOrder=2;body.add(shell);
}
function mineralSurface(mat,clock){
  mat.onBeforeCompile=s=>{
    s.uniforms.mineralTime=clock;
    s.vertexShader='varying vec3 mineral;\n'+s.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n mineral=position;');
    s.fragmentShader='varying vec3 mineral; uniform float mineralTime;\n'+s.fragmentShader.replace('#include <emissivemap_fragment>',`
      #include <emissivemap_fragment>
      float plane=mineral.y*37.+mineral.x*2.6+mineral.z*.9;
      float growth=pow(.5+.5*cos(plane),14.);
      float fissure=pow(.5+.5*cos(mineral.x*9.+mineral.z*11.+sin(mineral.y*13.)),28.);
      diffuseColor.rgb*=.72+.26*sin(plane*.43);
      totalEmissiveRadiance+=vec3(.26,.55,.91)*(growth*.34+fissure*.65)*(.8+.2*sin(mineralTime*.7+mineral.y*6.));
    `);
  };
}
