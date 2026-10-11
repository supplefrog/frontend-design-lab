import * as THREE from '../consistency/components/vendor/three.module.min.js';


// Semantic DOM controls own input. This layer owns only their physical representation.
export async function mountInstrumentControls() {
  const anchors = [...document.querySelectorAll('[data-render-control]')];
  if (!anchors.length) return false;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const forced = matchMedia('(forced-colors: active)');
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({canvas, alpha:true, antialias:false, powerPreference:'low-power'});
  } catch { return false; }
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.autoClear = false;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  // Render each bay directly at its output canvas resolution.
  const gl=renderer.getContext();
  const viewportLimits=gl.getParameter(gl.MAX_VIEWPORT_DIMS);
  const bufferLimit=Math.min(gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),gl.getParameter(gl.MAX_TEXTURE_SIZE));
  const maxBufferWidth=Math.min(bufferLimit,viewportLimits[0]);
  const maxBufferHeight=Math.min(bufferLimit,viewportLimits[1]);
  // Keep one GPU renderer, but present its live pixels inside each real bay.
  // The browser composites metal and receiving housing as a single CSS group.
  const presentations=anchors.map(anchor=>{
    const surface=document.createElement('canvas');
    surface.setAttribute('aria-hidden','true');surface.dataset.instrumentRenderer='true';
    surface.dataset.rendererRevision='bay-composite-r30';
    surface.style.cssText='position:absolute;right:auto;bottom:auto;pointer-events:none;';
    return {surface,context:surface.getContext('2d',{alpha:true})};
  });
  if(presentations.some(p=>!p.context)){renderer.dispose();return false;}
  const geometries = new Set(), materials = new Set(), textures = new Set();
  const ownGeometry = g => (geometries.add(g), g);
  const material = properties => {
    const m = new THREE.MeshStandardMaterial(properties); materials.add(m); return m;
  };
  // Same fixed upper-left studio panorama as the approved chrome component.
  const envCanvas = document.createElement('canvas'); envCanvas.width=2048; envCanvas.height=1024;
  const ctx = envCanvas.getContext('2d');ctx.scale(2,2);
  const gradient=ctx.createLinearGradient(0,0,0,512);
  [[0,'#2d3340'],[.42,'#090b10'],[.7,'#555e6d'],[1,'#050609']].forEach(([s,c])=>gradient.addColorStop(s,c));
  ctx.fillStyle=gradient;ctx.fillRect(0,0,1024,512);
  [[135,42,185,300,'#ffffff'],[360,90,22,298,'#ffffff'],[663,120,28,252,'#cad9eb'],[735,55,220,300,'#f6ebd1'],[0,310,1024,9,'#bbc7d3']].forEach(([x,y,w,h,c])=>{ctx.fillStyle=c;ctx.fillRect(x,y,w,h);});
  const envTexture=new THREE.CanvasTexture(envCanvas);
  envTexture.mapping=THREE.EquirectangularReflectionMapping;envTexture.colorSpace=THREE.SRGBColorSpace;
  const pmrem=new THREE.PMREMGenerator(renderer);
  let environment;
  try { environment=pmrem.fromEquirectangular(envTexture); }
  catch {pmrem.dispose();envTexture.dispose();renderer.dispose();return false;}
  pmrem.dispose();envTexture.dispose();
  const brushCanvas=document.createElement('canvas');brushCanvas.width=128;brushCanvas.height=512;
  const brush=brushCanvas.getContext('2d');
  for(let y=0;y<512;y++){const v=123+Math.sin(y*7.23)*16+Math.sin(y*1.79)*6;brush.fillStyle=`rgb(${v},${v},${v})`;brush.fillRect(0,y,128,1);}
  const bump=new THREE.CanvasTexture(brushCanvas);bump.wrapS=bump.wrapT=THREE.RepeatWrapping;textures.add(bump);
  const chrome=material({color:0xe1e4e6,metalness:1,roughness:.14,envMapIntensity:1.3});
  const brushed=material({color:0xbfc3c5,metalness:1,roughness:.3,bumpMap:bump,bumpScale:.008,envMapIntensity:1.2});
  const black=material({color:0x08090c,metalness:.45,roughness:.24});
  let transportFinish;
  try{
    transportFinish=await new THREE.TextureLoader().loadAsync(new URL('./assets/chrome-play.png',import.meta.url).href);
    transportFinish.colorSpace=THREE.SRGBColorSpace;transportFinish.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());textures.add(transportFinish);
  }catch{/* Existing live materials remain the usable asset-loading fallback. */}
  function finishMaterial(){
    const m=new THREE.MeshBasicMaterial({map:transportFinish,toneMapped:false});materials.add(m);return m;
  }
  function mapRadialFinish(part,inner,outer,sourceInner,sourceOuter){
    const p=part.geometry.attributes.position,uv=part.geometry.attributes.uv;
    for(let i=0;i<p.count;i++){
      // Lathe's radial plane is local X/Z; local Y supplies the shallow depth.
      const x=p.getX(i),y=-p.getZ(i),r=Math.hypot(x,y);
      const radius=THREE.MathUtils.lerp(sourceInner,sourceOuter,THREE.MathUtils.clamp((r-inner)/(outer-inner),0,1));
      uv.setXY(i,.5+(r?x/r*radius:0),.5+(r?y/r*radius:0));
    }
    uv.needsUpdate=true;
  }
  function mesh(parent,g,m,x=0,y=0,z=0){const item=new THREE.Mesh(ownGeometry(g),m);item.position.set(x,y,z);item.castShadow=true;item.receiveShadow=true;parent.add(item);return item;}
  function ring(parent,r,t,z,m){return mesh(parent,new THREE.TorusGeometry(r,t,32,384),m,0,0,z);}
  function disc(parent,r,depth,z,m){const item=mesh(parent,new THREE.CylinderGeometry(r,r,depth,192),m,0,0,z);item.rotation.x=Math.PI/2;return item;}
  function dome(parent,r,depth,z,m){
    const profile=Array.from({length:65},(_,i)=>{const angle=i/64*Math.PI/2;return new THREE.Vector2(r*Math.cos(angle),depth*Math.sin(angle));});
    const item=mesh(parent,new THREE.LatheGeometry(profile,384),m,0,0,z);item.rotation.x=Math.PI/2;return item;
  }
  function radialFace(parent,profile,z,m){
    const item=mesh(parent,new THREE.LatheGeometry(profile.map(([r,d])=>new THREE.Vector2(r,d)),384),m,0,0,z);item.rotation.x=Math.PI/2;return item;
  }
  function rod(parent,a,b,r,m){
    const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),delta=end.clone().sub(start);
    const item=mesh(parent,new THREE.CylinderGeometry(r,r,delta.length(),20),m);
    item.position.copy(start.add(end).multiplyScalar(.5));item.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());return item;
  }
  function build(anchor){
    const scene=new THREE.Scene();scene.environment=environment.texture;
    const key=new THREE.DirectionalLight(0xffffff,3.2);key.position.set(...(anchor.dataset.renderControl==='lever'?[-3,8,14]:[-3,4,5]));scene.add(key);
    const fill=new THREE.DirectionalLight(0xa9c2e8,.4);fill.position.set(3,-1,3);scene.add(fill);
    const root=new THREE.Group();scene.add(root);
    const camera=anchor.dataset.renderControl==='lever'?new THREE.OrthographicCamera(-4,4,4,-4,.1,40):new THREE.PerspectiveCamera(29,1,.1,40);
    const type=anchor.dataset.renderControl;
    const enamel=material({color:type==='lever'?0xffcd13:0xf53a94,metalness:.14,roughness:.21,envMapIntensity:.7});
    const item={anchor,scene,root,camera,type,enamel,current:null,target:null};
    if(type==='lever'){
      // The broad, polished housing faces the visitor. The inset wheel still
      // turns around its real horizontal axle; only the crank/wheel rotate.
      root.rotation.y=0;root.position.x=0;
      const mount=new THREE.Group();root.add(mount);mount.position.set(0,0,0);
      // Literal master-contour stations (reference-lever.png pixel coordinates).
      // Separate capsule returns/opening replace concentric elliptical mouths.
      const scale=7.6/194,toPoint=([x,y])=>new THREE.Vector2((x-73)*scale*1.25,(167-y)*scale);
      function contour(start,segments){
        const path=new THREE.Shape(),p=toPoint(start);path.moveTo(p.x,p.y);
        segments.forEach(points=>{const q=points.map(toPoint);if(q.length===1)path.lineTo(q[0].x,q[0].y);else path.bezierCurveTo(q[0].x,q[0].y,q[1].x,q[1].y,q[2].x,q[2].y);});return path;
      }
      const outer=contour([73,70],[[[48,68],[37,92],[32,131]],[[25,173],[27,206],[38,235]],[[44,255],[57,265],[74,263]],[[96,264],[110,249],[116,213]],[[125,165],[118,114],[108,91]],[[99,75],[86,69],[73,70]]]);
      const opening=contour([73,81],[[[59,81],[55,91],[55,107]],[[54,227]],[[54,246],[62,253],[74,253]],[[87,253],[92,244],[92,229]],[[92,107]],[[92,91],[87,81],[73,81]]]);
      const outerPoints=outer.getSpacedPoints(192),innerPoints=opening.getSpacedPoints(192);
      const face=new THREE.BufferGeometry(),positions=[],indices=[],around=192,across=32;
      for(let row=0;row<=across;row++)for(let col=0;col<=around;col++){
        const t=row/across,a=outerPoints[col],b=innerPoints[col];
        positions.push(THREE.MathUtils.lerp(a.x,b.x,t),THREE.MathUtils.lerp(a.y,b.y,t),.70+.48*Math.sin(Math.PI*t));
      }
      for(let row=0;row<across;row++)for(let col=0;col<around;col++){
        const a=row*(around+1)+col,b=a+1,c=a+around+1,d=c+1;indices.push(a,b,c,b,d,c);
      }
      face.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));face.setIndex(indices);face.computeVertexNormals();
      const castChrome=chrome.clone();castChrome.roughness=.14;materials.add(castChrome);item.housing=mesh(mount,face,castChrome);item.housing.name="housing";
      mesh(mount,new THREE.ShapeGeometry(outer,32),black,0,0,.57);
      for(const [path,radius,z]of [[outer,.018,.70],[opening,.012,.70]]){
        const points=path.getSpacedPoints(192).map(p=>new THREE.Vector3(p.x,p.y,z));
        mesh(mount,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),192,radius,12,false),chrome);
      }
      function sideDisc(parent,r,depth,x,m){
        const part=mesh(parent,new THREE.CylinderGeometry(r,r,depth,192),m,x,0,0);part.rotation.z=Math.PI/2;return part;
      }
      function sideRing(parent,r,t,x,m){const part=ring(parent,r,t,0,m);part.rotation.y=Math.PI/2;part.position.x=x;return part;}
      const rotor=new THREE.Group();mount.add(rotor);item.rotor=rotor;item.axis='x';
      rotor.position.z=1.55;
      // A circular chrome wheel is seen edge-on through the recessed opening.
      // It shares the crank's axle and turns with it; its silhouette stays
      // circular through the complete half-turn.
      const groovePositions=[-.45,-.30,-.15,0,.15,.30,.45];
      const crown=x=>3.04-.14*x*x;
      const wheelProfile=[[0,-.63],[2.64,-.63],[2.90,-.58],[crown(-.48),-.48]];
      for(const x of groovePositions)wheelProfile.push([crown(x-.016),x-.016],[crown(x)-.035,x],[crown(x+.016),x+.016]);
      wheelProfile.push([crown(.48),.48],[2.90,.58],[2.64,.63],[0,.63]);
      const wheelPoints=wheelProfile.map(([r,x])=>new THREE.Vector2(r,x));
      item.wheel=mesh(rotor,new THREE.LatheGeometry(wheelPoints,192),chrome);item.wheel.rotation.z=Math.PI/2;item.wheel.name='chrome-wheel';
      for(const x of groovePositions){
        const groove=sideRing(rotor,crown(x)-.017,.006,x,black);groove.name='wheel-groove';
      }
      sideDisc(rotor,.23,1.45,1.24,chrome);
      sideDisc(rotor,.30,.60,2.02,brushed);
      rod(mount,[2.10,0,.78],[2.10,0,1.55],.27,chrome);
      sideDisc(mount,.35,.40,2.12,chrome).position.z=1.55;
      sideRing(mount,.35,.035,2.33,black).position.z=1.55;
      sideDisc(rotor,.28,.16,2.36,chrome);
      // A rigid formed crank lies in the pivot plane. With positive x-axis
      // travel it swings toward the viewer, then down, clear of the board.
      const curve=new THREE.CatmullRomCurve3([
        new THREE.Vector3(2.30,0,0),new THREE.Vector3(3.22,0,0),
        new THREE.Vector3(3.75,.14,0),new THREE.Vector3(4.16,.52,0),
        new THREE.Vector3(4.28,1.28,0)
      ],false,'centripetal');
      item.crank=mesh(rotor,new THREE.TubeGeometry(curve,96,.29,24,false),chrome);item.crank.name='crank';
      const gripProfile=[[0,0],[.45,.025],[.60,.09],[.66,.22],[.75,2.65],[.88,3.35],[.84,3.65],[.55,3.82],[0,3.87]].map(([r,y])=>new THREE.Vector2(r,y));
      item.grip=mesh(rotor,new THREE.LatheGeometry(gripProfile,192),enamel,4.28,1.28,0);item.grip.name='grip';
      item.ferrule=mesh(rotor,new THREE.CylinderGeometry(.62,.56,.24,64),chrome,4.28,1.28,0);item.ferrule.name='ferrule';
      item.fitWidth=2.35;item.fitHeight=2.92;item.frontDepth=1.6;item.centerY=.02;
    }else if(type==='dial'){
      // A recessed, nested metal socket reconstructs the approved mount.
      // Its depth comes from receiving surfaces and reflections, not a black outline.
      const socket=material({color:0x12496a,metalness:.45,roughness:.38,envMapIntensity:.65});
      disc(root,.99,.07,-.19,socket);
      radialFace(root,[[.99,-.125],[.988,-.07],[.972,.010],[.953,.042],[.916,.051],[.890,.035],[.875,-.025],[.860,-.09]],0,chrome);
      radialFace(root,[[.863,-.09],[.863,.008],[.838,.016],[.815,-.04],[.815,-.09]],0,black);
      // Three stationary detents, 45 degrees apart, centered on the approved
      // lower-left rest marker. Nearby -> tag matches -> all notes is clockwise.
      for(const angle of [Math.PI/4,0,-Math.PI/4]){
        const phi=-3*Math.PI/4+angle;
        const tick=mesh(root,new THREE.BoxGeometry(.012,.055,.008),black,Math.cos(phi)*.937,Math.sin(phi)*.937,.058);
        tick.rotation.z=phi-Math.PI/2;
      }
      const rotor=new THREE.Group();root.add(rotor);item.rotor=rotor;
      const radialEnamel=new THREE.MeshPhysicalMaterial({color:0xf53a94,metalness:.52,roughness:.29,anisotropy:.85,anisotropyRotation:Math.PI/2,clearcoat:.65,clearcoatRoughness:.23,envMapIntensity:.9});materials.add(radialEnamel);item.enamel=radialEnamel;
      // Radial tangent directions are axisymmetric. Fixed environment lighting
      // stays in world space while the physically attached pointer rotates.
      radialFace(rotor,[[.790,0],[.777,.055],[.746,.084],[.49,.058],[.245,.032],[0,.006]],.025,radialEnamel);
      const marker=mesh(rotor,new THREE.CapsuleGeometry(.033,.22,6,16),black,-.41,-.41,.153);marker.scale.z=.35;marker.rotation.z=-Math.PI/4;
      root.rotation.set(.03,-.04,0);item.fitWidth=2.28;item.fitHeight=2.28;item.centerY=0;
    }else{
      // The push cap travels into an actual bore. A solid disc behind the
      // annulus previously intersected the outer cap at full depression.
      radialFace(root,[[1.42,0],[1.42,.215],[.70,.215],[.70,0],[1.42,0]],-.28,black);
      disc(root,.74,.05,-.28,black);ring(root,1.38,.046,-.02,chrome);ring(root,1.29,.027,.005,black);
      const annulus=radialFace(root,[[1.27,0],[1.25,.035],[1.21,.070],[.76,.078],[.72,.06]],.015,transportFinish?finishMaterial():brushed);
      if(transportFinish){mapRadialFinish(annulus,.72,1.27,.31,.435);item.finishMaterials=[annulus.material];}
      ring(root,1.25,.022,.045,chrome);ring(root,.73,.020,.09,black);ring(root,.69,.018,.10,chrome);
      const cap=new THREE.Group();root.add(cap);item.cap=cap;
      const polishedCap=material({color:0xcdd1d5,metalness:1,roughness:.34,bumpMap:bump,bumpScale:.001,envMapIntensity:.85});
      const pushFace=radialFace(cap,[[.668,0],[.660,.018],[.629,.044],[.38,.052],[0,.053]],.095,transportFinish?finishMaterial():polishedCap);
      if(transportFinish){mapRadialFinish(pushFace,0,.668,0,.295);item.finishMaterials.push(pushFace.material);}
      item.pushMaterial=pushFace.material;
      item.symbols=[0,1].map(()=>{
        const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(18),3));
        const symbol=mesh(cap,g,black,0,0,.155);return symbol;
      });
      item.fitWidth=3.12;item.fitHeight=3.12;item.centerY=0;
    }
    if(type==='lever'){item.fitWidth=12;item.fitHeight=14;item.frontDepth=4;item.centerX=0;item.centerY=0;}
    // The receiving plane belongs to the same camera and light as the object.
    // Contact and cast shadows seat the mount against its dimensional board.
    const contactMaterial=new THREE.ShadowMaterial({opacity:.22});materials.add(contactMaterial);
    const receiver=new THREE.Mesh(ownGeometry(new THREE.PlaneGeometry(type==='lever'?26:8,type==='lever'?26:8)),contactMaterial);
    receiver.position.z=type==='lever'?.48:-.19;receiver.receiveShadow=true;scene.add(receiver);
    key.castShadow=true;key.shadow.mapSize.set(512,512);key.shadow.camera.left=type==='lever'?-9:-4;key.shadow.camera.right=type==='lever'?9:4;
    key.shadow.camera.top=type==='lever'?9:4;key.shadow.camera.bottom=type==='lever'?-9:-4;key.shadow.camera.near=.1;key.shadow.camera.far=type==='lever'?32:16;
    key.shadow.normalBias=.02;key.shadow.bias=-.0002;key.shadow.radius=2;
    const bounce=new THREE.HemisphereLight(0xfff5e6,type==='lever'?0xe95592:0x0988cf,.45);scene.add(bounce);
    scene.children.filter(x=>x.isLight).forEach(light=>light.userData.baseIntensity=light.intensity);
    return item;
  }
  const items=anchors.map((anchor,index)=>Object.assign(build(anchor),presentations[index]));
  const li=items.find(i=>i.type==='lever');
  function extrema(a,b,lo,hi){const angles=[lo,hi],t=Math.atan2(b,a);for(let k=-2;k<=2;k++){const q=t+k*Math.PI;if(q>lo&&q<hi)angles.push(q);}return angles.map(t=>a*Math.cos(t)+b*Math.sin(t));}
  const lo=0,hi=Math.PI;
  const solid=new THREE.Box2(),shadow=new THREE.Box2(),tmp=new THREE.Vector3();
  // Directional light [-3,8,14] projects onto the board z=.48.
  const shadowX=3/14,shadowY=-8/14,receiverZ=.48;
  function expandRange(box,xs,ys){for(const x of xs)for(const y of ys)box.expandByPoint(new THREE.Vector2(x,y));}
  li.rotor.rotation.x=0;li.root.updateMatrixWorld(true);
  li.root.traverse(part=>{if(!part.isMesh)return;part.updateMatrix();const moving=part.parent===li.rotor,vs=part.geometry.attributes.position;for(let j=0;j<vs.count;j++){
    tmp.fromBufferAttribute(vs,j).applyMatrix4(moving?part.matrix:part.matrixWorld);const{x,y,z}=tmp;
    if(moving){
      const pivot=li.rotor.position.z;
      expandRange(solid,[x],extrema(y,-z,lo,hi));
      expandRange(shadow,extrema(shadowX*z,shadowX*y,lo,hi).map(v=>x+shadowX*(pivot-receiverZ)+v),extrema(y+shadowY*z,-z+shadowY*y,lo,hi).map(v=>shadowY*(pivot-receiverZ)+v));
    }else{
      solid.expandByPoint(new THREE.Vector2(x,y));
      if(z>=receiverZ)shadow.expandByPoint(new THREE.Vector2(x+shadowX*(z-receiverZ),y+shadowY*(z-receiverZ)));
    }
  }});
  li.projectedBounds={solid,shadow};
  const housingHeight=new THREE.Box3().setFromObject(li.housing).getSize(new THREE.Vector3()).y;
  const dialItem=items.find(i=>i.type==='dial');
  let dialMeasureKey='',dialPaintHeight=0;
  const projected=new THREE.Vector3();
  function measureDialHeight(rect){
    const key=`${rect.width}/${rect.height}`;
    if(key===dialMeasureKey)return dialPaintHeight;
    dialMeasureKey=key;
    const aspect=rect.width/rect.height;
    const distance=Math.max(dialItem.fitHeight,dialItem.fitWidth/aspect)/2/Math.tan(THREE.MathUtils.degToRad(14.5))+(dialItem.frontDepth||.25);
    dialItem.camera.aspect=aspect;dialItem.camera.position.set(0,dialItem.centerY,distance);dialItem.camera.lookAt(0,dialItem.centerY,0);
    dialItem.camera.updateProjectionMatrix();dialItem.camera.updateMatrixWorld();dialItem.root.updateMatrixWorld(true);
    let minY=Infinity,maxY=-Infinity;
    dialItem.root.traverse(part=>{
      if(!part.isMesh)return;
      const vertices=part.geometry.attributes.position;
      for(let i=0;i<vertices.count;i++){
        projected.fromBufferAttribute(vertices,i).applyMatrix4(part.matrixWorld).project(dialItem.camera);
        minY=Math.min(minY,projected.y);maxY=Math.max(maxY,projected.y);
      }
    });
    dialPaintHeight=(maxY-minY)*rect.height/2;
    return dialPaintHeight;
  }
  
  const copyScene=new THREE.Scene(),copyCamera=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
  const copyMaterial=new THREE.ShaderMaterial({
    transparent:true,depthTest:false,depthWrite:false,toneMapped:true,
    uniforms:{source:{value:null},texel:{value:new THREE.Vector2()},footprint:{value:1},displayFilter:{value:0}},
    vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
    fragmentShader:`uniform sampler2D source;uniform vec2 texel;uniform float footprint;uniform int displayFilter;varying vec2 vUv;
      void main(){
        vec4 c=texture2D(source,vUv);
        if(displayFilter>0){
          c=vec4(0.0);float total=0.0;
          for(int y=0;y<4;y++)for(int x=0;x<4;x++){
            float wx=(x==0||x==3)?1.0:3.0,wy=(y==0||y==3)?1.0:3.0;
            float weight=displayFilter==2?wx*wy:1.0;
            c+=texture2D(source,vUv+texel*vec2(float(x)-1.5,float(y)-1.5)*footprint*.25)*weight;
            total+=weight;
          }
          c/=total;
        }
        // Preserve alpha coverage when compositing transparent edges.
        gl_FragColor=vec4(c.rgb/max(c.a,.0001),c.a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });materials.add(copyMaterial);
  copyScene.add(new THREE.Mesh(ownGeometry(new THREE.PlaneGeometry(2,2)),copyMaterial));

  const resolveMaterial=new THREE.ShaderMaterial({depthTest:false,depthWrite:false,blending:THREE.NoBlending,toneMapped:false,
    uniforms:{source:{value:null},texel:{value:new THREE.Vector2()},factor:{value:1}},vertexShader:copyMaterial.vertexShader,
    fragmentShader:`uniform sampler2D source;uniform vec2 texel;uniform int factor;varying vec2 vUv;
      void main(){vec4 c=vec4(0.0);
        for(int y=0;y<4;y++)for(int x=0;x<4;x++)if(x<factor&&y<factor)
          c+=texture2D(source,vUv+texel*(vec2(float(x),float(y))-(float(factor)-1.0)*.5));
        gl_FragColor=c/float(factor*factor);}`});materials.add(resolveMaterial);
  const resolved=new THREE.WebGLRenderTarget(1,1,{depthBuffer:false,type:THREE.HalfFloatType});

  const filterQuad=copyScene.children[0];
  let filterWidth=0,filterHeight=0;
  const quality={canvas:3,ssaa:2,msaa:0,smaa:'off',display:'tent',viewScale:1};
  let samples=0;
  for(const item of items){
    item.targetBuffer=new THREE.WebGLRenderTarget(1,1,{samples,depthBuffer:true});
    item.targetBuffer.texture.minFilter=THREE.LinearFilter;
    item.targetBuffer.texture.magFilter=THREE.LinearFilter;
    item.targetBuffer.texture.generateMipmaps=false;
  }
  let disposed=false,lost=false,frame=0,lastTime=0;
  items.forEach(item=>item.anchor.append(item.surface));
  function read(item){
    const d=item.anchor.dataset,disabled=d.disabled==='true';
    let rotation=0;
    if(item.type==='lever')rotation=(100-THREE.MathUtils.clamp(Number(d.value)||0,0,100))*Math.PI/100;
    if(item.type==='dial')rotation=({nearby:Math.PI/4,suggest:0,manual:-Math.PI/4})[d.mode]??0;
    if(item.type==='dial'&&!disabled&&d.tracking==='true'&&Number.isFinite(Number(d.dragAngle)))rotation=Number(d.dragAngle);
    // Disable freezes the actual lever at its last physical angle; values cannot imply activity.
    if(disabled&&item.type==='lever'&&item.current)rotation=item.current.rotation;
    return {rotation,press:item.type==='play'&&!disabled&&d.pressed==='true'?-0.19:0,morph:d.playing==='true'?1:0,dim:disabled?.72:1};
  }
  function symbol(item,t){
    const play=[[[22,17],[22,47],[36,39],[36,25]],[[36,25],[36,39],[47,32],[47,32]]];
    const pause=[[[23,18],[23,46],[29,46],[29,18]],[[35,18],[35,46],[41,46],[41,18]]];
    item.symbols.forEach((s,i)=>{
      const attr=s.geometry.attributes.position;
      const centerX=THREE.MathUtils.lerp(34.5,32,t);
      [0,1,2,0,2,3].forEach((index,n)=>{const p=play[i][index],q=pause[i][index];attr.setXYZ(n,(THREE.MathUtils.lerp(p[0],q[0],t)-centerX)*.023,(32-THREE.MathUtils.lerp(p[1],q[1],t))*.023,0);});
      attr.needsUpdate=true;s.geometry.computeVertexNormals();
    });
  }
  function ready(value){items.forEach(i=>i.anchor.dataset.renderReady=String(value));}
  let pageSuspended=false;
  function demand(resetClock=true){if(!disposed&&!lost&&!pageSuspended&&!document.hidden&&!frame){if(resetClock)lastTime=performance.now();frame=requestAnimationFrame(draw);}}
  function draw(time){
    const cpuStart=performance.now();
    frame=0;if(disposed||lost||document.hidden)return;
    if(forced.matches){items.forEach(i=>i.surface.style.display='none');ready(false);document.body.dataset.materialRenderer='fallback';return;}
    items.forEach(i=>i.surface.style.display='block');
    const w=document.documentElement.clientWidth,h=innerHeight,deviceDpr=window.devicePixelRatio||1,requestedDpr=deviceDpr*quality.canvas;
    const displayScale=parseFloat(getComputedStyle(document.querySelector('.instrument')).zoom)||1;
    const boxes=items.map(item=>item.anchor.getBoundingClientRect());
    const dialRect=boxes[items.indexOf(dialItem)];
    const referenceScale=dialRect.width&&dialRect.height?1.75*measureDialHeight(dialRect)/housingHeight:0;
    // Use actual monotonic elapsed time: a throttled callback must settle rather
    // than replay a backlog of artificial 50ms steps.
    const dt=Math.max(0,(time-lastTime)/1000)||1/60;lastTime=time;
    let moving=false;
    for(const [index,item] of items.entries()){
      const rect=boxes[index];
      const visible=!!rect.width&&!!rect.height&&rect.right>0&&rect.bottom>0&&rect.left<w&&rect.top<h;
      item.anchor.dataset.renderVisible=String(visible);
      if(!visible)continue;
      item.target=read(item);if(!item.current)item.current={...item.target};
      const amount=reduced.matches?1:1-Math.exp(-dt*24);
      for(const k of ['rotation','press','morph','dim']){
        const difference=item.target[k]-item.current[k];
        if(k==='rotation'&&item.anchor.dataset.tracking==='true')item.current[k]=item.target[k];
        else if(Math.abs(difference)<.0006)item.current[k]=item.target[k];
        else {item.current[k]+=difference*amount;if(!reduced.matches)moving=true;}
      }
      const state=item.current;
      // Publish both physical representations in the same frame. A separate CSS
      // transition trails continuous dragging and diverges during easing.
      if(item.type==='lever')document.getElementById('breadth-gauge').style.setProperty('--gauge-y',`${18+state.rotation/Math.PI*184}px`);
      const paintKey=[state.rotation,state.press,state.morph,state.dim].join('/');
      const changed=item.paintKey!==paintKey;
      item.paintKey=paintKey;
      if(item.rotor)item.rotor.rotation[item.axis||'z']=state.rotation;
      if(item.cap){item.cap.position.z=state.press;symbol(item,state.morph);}
      item.anchor.dataset.currentAngle=state.rotation.toFixed(6);
      item.anchor.dataset.currentPress=state.press.toFixed(6);
      item.anchor.dataset.currentMorph=state.morph.toFixed(6);
      item.anchor.dataset.angleAxis=item.axis||'z';
      item.anchor.dataset.renderCssSize=`${rect.width.toFixed(2)}x${rect.height.toFixed(2)}`;
      const finish=getComputedStyle(document.querySelector('.instrument'));
      item.enamel.color.set(item.type==='lever'?0xffcd13:finish.getPropertyValue('--dial-pink').trim()).multiplyScalar(state.dim);
      if(item.type==='dial'){
        // Optional local comparison values retain the approved finish by default.
        for(const [key,fallback] of [['metalness',.52],['roughness',.29],['anisotropy',.85],['clearcoat',.65],['clearcoatRoughness',.23]]){
          const property='--dial-'+key.replace(/[A-Z]/g,c=>'-'+c.toLowerCase());
          const value=finish.getPropertyValue(property).trim();
          item.enamel[key]=value===''?fallback:THREE.MathUtils.clamp(Number(value),0,1);
        }
      }
      if(item.type==='lever')item.enamel.color.lerp(new THREE.Color(0xb7c1c8),THREE.MathUtils.clamp((1-state.dim)/.28,0,1));
      item.finishMaterials?.forEach(m=>m.color.setScalar(state.dim));
      if(item.pushMaterial)item.pushMaterial.color.setScalar(state.dim*(1-.18*THREE.MathUtils.clamp(-state.press/.19,0,1)));
      item.scene.environmentIntensity=state.dim;
      item.scene.children.filter(x=>x.isLight).forEach(x=>{x.intensity=x.userData.baseIntensity*state.dim;});
      const bay=item.type==='lever'?item.anchor.closest('.tension').getBoundingClientRect():rect;
      let padding=item.type==='lever'?Math.max(0,Math.min(12,(bay.width-rect.width)/2-2)):0;
      let topPadding=padding,bottomPadding=padding;
      if(item.type==='lever'){
        const title=item.anchor.closest('.tension').querySelector('#breadth-title').getBoundingClientRect(),out=item.anchor.closest('.tension').querySelector('.control-instruction').getBoundingClientRect();
        topPadding=Math.max(0,rect.top-title.bottom-4);bottomPadding=Math.max(0,out.top-rect.bottom-4);
        // The reference proportion owns the object scale. Grow the transparent
        // paint enclosure to contain every pose and shadow at that scale.
        const bounds=Object.values(item.projectedBounds);
        const centerX=(item.projectedBounds.solid.min.x+item.projectedBounds.solid.max.x)/2;
        const extentX=Math.max(...bounds.flatMap(b=>[Math.abs(b.min.x-centerX),Math.abs(b.max.x-centerX)]));
        const extentY=Math.max(...bounds.flatMap(b=>[Math.abs(b.min.y),Math.abs(b.max.y)]));
        padding=Math.max(padding,Math.ceil(extentX*referenceScale+8-rect.width/2));
        topPadding=Math.max(topPadding,Math.ceil(extentY*referenceScale+8-rect.height/2));
        bottomPadding=Math.max(bottomPadding,Math.ceil(extentY*referenceScale+8-rect.height/2));
      }
      const paintRect={left:rect.left-padding,right:rect.right+padding,top:rect.top-topPadding,bottom:rect.bottom+bottomPadding,width:rect.width+2*padding,height:rect.height+topPadding+bottomPadding};
      const dpr=Math.min(requestedDpr,maxBufferWidth/(paintRect.width*quality.ssaa),maxBufferHeight/(paintRect.height*quality.ssaa));
      item.anchor.dataset.renderPixelRatio=dpr.toFixed(4);
      Object.assign(item.surface.dataset,{pixelRatio:dpr.toFixed(4),requestedPixelRatio:requestedDpr.toFixed(4),devicePixelRatio:deviceDpr.toFixed(4),qualityScale:(quality.ssaa*dpr/deviceDpr).toFixed(4),filter:`output${quality.canvas}x-smaa-${quality.smaa}-${quality.display}`,supersampling:String(quality.ssaa),samples:String(samples)});
      // The DOM anchor rectangle includes borders; its absolute containing box
      // starts inside them. Reserve the same projected full-shadow rectangle.
      Object.assign(item.surface.style,{left:`${-padding/displayScale-item.anchor.clientLeft}px`,top:`${-topPadding/displayScale-item.anchor.clientTop}px`,width:`${paintRect.width/displayScale}px`,height:`${paintRect.height/displayScale}px`});
      const aspect=rect.width/rect.height;
      item.camera.clearViewOffset();item.camera.aspect=aspect;
      // The lever is tall; fitting it as a square made its tall bay mostly void.
      // Retain the complete moving envelope independently on both axes.
      let distance=Math.max(item.fitHeight,item.fitWidth/aspect)/2/Math.tan(THREE.MathUtils.degToRad(14.5))+(item.frontDepth||.25);
      if(item.objectFitPoints){
        const tangent=Math.tan(THREE.MathUtils.degToRad(14.5)),halfW=paintRect.width/2-8,halfH=paintRect.height/2-8;
        distance=Math.max(...item.objectFitPoints.map(([x,y,z])=>z+Math.max(Math.abs(x)*rect.height/(2*tangent*halfW),Math.abs(y)*rect.height/(2*tangent*halfH))));
      }
      if(item.shadowBounds){
        const bounds=item.shadowBounds,tangent=Math.tan(THREE.MathUtils.degToRad(14.5));
        // Eight CSS pixels reserve the PCF penumbra and final resolve footprint.
        const halfW=paintRect.width/2-8,halfH=paintRect.height/2-8;
        const shadowDistance=.48+Math.max(Math.abs(bounds.min.x),Math.abs(bounds.max.x))*rect.height/(2*tangent*halfW);
        const shadowHeight=.48+Math.max(Math.abs(bounds.min.y),Math.abs(bounds.max.y))*rect.height/(2*tangent*halfH);
        distance=Math.max(distance,shadowDistance,shadowHeight);
      }
      if(item.type==='lever'){
        const available={left:rect.width/2+padding,right:rect.width/2+padding,up:rect.height/2+topPadding,down:rect.height/2+bottomPadding};
        // One constant enclosure contains the entire continuous swept object
        // and receiving shadow. Its camera does not follow the current pose.
        const envelopes=Object.values(item.projectedBounds);
        const minX=Math.min(...envelopes.map(b=>b.min.x)),maxX=Math.max(...envelopes.map(b=>b.max.x));
        const minY=Math.min(...envelopes.map(b=>b.min.y)),maxY=Math.max(...envelopes.map(b=>b.max.y));
        // Center the solid assembly's full swept envelope below its heading.
        // Shadows affect the paint bounds, but never move the object framing.
        const centerX=(item.projectedBounds.solid.min.x+item.projectedBounds.solid.max.x)/2;
        const extentX=Math.max(Math.abs(minX-centerX),Math.abs(maxX-centerX));
        const extentY=Math.max(Math.abs(minY),Math.abs(maxY));
        const scale=referenceScale||Math.min((Math.min(available.left,available.right)-8)/extentX,(Math.min(available.up,available.down)-8)/extentY);
        const halfY=rect.height/(2*scale);item.camera.left=-halfY*aspect;item.camera.right=halfY*aspect;item.camera.top=halfY;item.camera.bottom=-halfY;distance=20;
        item.camera.position.set(centerX,0,20);item.camera.lookAt(centerX,0,0);
        item.anchor.dataset.fixedEnvelopeCenterX=String(centerX);item.anchor.dataset.framing='assembly-centered-full-half-turn';
        item.anchor.dataset.initialAxleOffset=String(-centerX*scale);
        item.anchor.dataset.parallelHalfY=String(halfY);item.anchor.dataset.projectedScale=String(scale);
        item.anchor.dataset.housingHeight=String(housingHeight*scale);item.anchor.dataset.knobHeight=String(dialPaintHeight);
        item.anchor.dataset.housingKnobHeightRatio=String(housingHeight*scale/dialPaintHeight);
        item.anchor.dataset.middleMechanism='circular-chrome-wheel';
      }else{item.camera.position.set(item.centerX||0,item.centerY,distance);item.camera.lookAt(item.centerX||0,item.centerY,0);}
      item.anchor.dataset.cameraDistance=String(distance);item.camera.updateProjectionMatrix();
      if(padding||topPadding||bottomPadding)item.camera.setViewOffset(rect.width,rect.height,-padding,-topPadding,paintRect.width,paintRect.height);
      item.anchor.dataset.paintPadding=String(padding);
      item.anchor.dataset.fitEnvelope=JSON.stringify([item.fitWidth,item.fitHeight,item.frontDepth]);
      const outputDpr=dpr;
      const outputWidth=Math.min(Math.floor(maxBufferWidth/quality.ssaa),Math.max(1,Math.round(paintRect.width*outputDpr))),outputHeight=Math.min(Math.floor(maxBufferHeight/quality.ssaa),Math.max(1,Math.round(paintRect.height*outputDpr)));
      const targetWidth=outputWidth*quality.ssaa;
      const targetHeight=outputHeight*quality.ssaa;
      const sizeChanged=item.targetBuffer.width!==targetWidth||item.targetBuffer.height!==targetHeight;
      if(sizeChanged)item.targetBuffer.setSize(targetWidth,targetHeight);
      item.surface.dataset.displayPixelRatio=String(outputDpr);
      const outputChanged=item.surface.width!==outputWidth||item.surface.height!==outputHeight;
      if(changed||sizeChanged||item.qualityDirty){
        renderer.setRenderTarget(item.targetBuffer);renderer.setScissorTest(false);
        // setRenderTarget installs its physical-pixel viewport. setViewport uses
        // renderer DPR again, which would crop the object at non-unit ratios.
        renderer.clear();renderer.render(item.scene,item.camera);
        item.surface.dataset.actualSamples=String(gl.getParameter(gl.SAMPLES));
        item.anchor.dataset.renderFrames=String((Number(item.anchor.dataset.renderFrames)||0)+1);
      }
      if(changed||sizeChanged||outputChanged||item.qualityDirty||item.anchor.dataset.renderReady!=='true'){
        renderer.setRenderTarget(null);renderer.setScissorTest(false);
        renderer.setDrawingBufferSize(outputWidth,outputHeight,1);
        renderer.setClearColor(0,0);renderer.clear();
        if(filterWidth!==outputWidth||filterHeight!==outputHeight){
          resolved.setSize(outputWidth,outputHeight);
          filterWidth=outputWidth;filterHeight=outputHeight;
        }
        let input=item.targetBuffer;
        if(quality.ssaa>1){
          resolveMaterial.uniforms.source.value=input.texture;resolveMaterial.uniforms.texel.value.set(1/targetWidth,1/targetHeight);
          resolveMaterial.uniforms.factor.value=quality.ssaa;
          filterQuad.material=resolveMaterial;renderer.setRenderTarget(resolved);renderer.clear();renderer.render(copyScene,copyCamera);input=resolved;
        }

        filterQuad.material=copyMaterial;copyMaterial.uniforms.source.value=input.texture;
        copyMaterial.uniforms.texel.value.set(1/outputWidth,1/outputHeight);
        copyMaterial.uniforms.footprint.value=Math.max(1,outputDpr/deviceDpr/quality.viewScale);
        copyMaterial.uniforms.displayFilter.value=quality.display==='browser'?0:quality.display==='area'?1:2;
        renderer.setRenderTarget(null);renderer.clear();
        renderer.render(copyScene,copyCamera);
        if(outputChanged){item.surface.width=outputWidth;item.surface.height=outputHeight;}
        item.context.clearRect(0,0,outputWidth,outputHeight);
        // Transfer this actual rendered state synchronously before WebGL's
        // non-preserved default buffer is discarded. No substitute sprite.
        item.context.drawImage(canvas,0,0);
        item.surface.dataset.pixelBuffer=`${outputWidth}x${outputHeight}`;
        item.anchor.dataset.compositeFrames=String((Number(item.anchor.dataset.compositeFrames)||0)+1);
        item.qualityDirty=false;
      }
      item.anchor.dataset.renderPixelSize=`${targetWidth}x${targetHeight}`;
      item.anchor.dataset.renderReady='true';
    }
    document.body.dataset.materialRenderer='three';document.documentElement.dataset.controls='live';
    // CSS owns assembly translation and opacity even between renderer callbacks.
    // Only live physical state interpolation requires another drawing frame.
    if(moving)demand(false);
  }
  const mutation=new MutationObserver(demand);
  mutation.observe(document.querySelector('.instrument')||document.body,{subtree:true,attributes:true,attributeFilter:['data-value','data-mode','data-playing','data-disabled','data-pressed','data-tracking','data-drag-angle','hidden','class']});
  const paletteMutation=new MutationObserver(()=>{items.forEach(i=>i.qualityDirty=true);demand();});
  paletteMutation.observe(document.documentElement,{attributes:true,attributeFilter:['data-palette']});
  const resize=new ResizeObserver(demand);items.forEach(i=>resize.observe(i.anchor));
  const intersection=new IntersectionObserver(demand);items.forEach(i=>intersection.observe(i.anchor));
  function visibility(){if(document.hidden){cancelAnimationFrame(frame);frame=0;lastTime=0;}else demand();}
  function contextLost(event){event.preventDefault();lost=true;cancelAnimationFrame(frame);frame=0;items.forEach(i=>i.surface.style.display='none');ready(false);document.body.dataset.materialRenderer='fallback';}
  function pageHide(event){if(event.persisted){pageSuspended=true;cancelAnimationFrame(frame);frame=0;lastTime=0;}else dispose();}
  function pageShow(){pageSuspended=false;demand();}
  function dispose(){
    if(disposed)return;disposed=true;cancelAnimationFrame(frame);ready(false);
    mutation.disconnect();paletteMutation.disconnect();resize.disconnect();intersection.disconnect();
    window.removeEventListener('resize',demand);window.removeEventListener('scroll',demand,true);window.removeEventListener('pagehide',pageHide);window.removeEventListener('pageshow',pageShow);
    document.removeEventListener('visibilitychange',visibility);reduced.removeEventListener('change',demand);forced.removeEventListener('change',demand);canvas.removeEventListener('webglcontextlost',contextLost);

    resolved.dispose();items.forEach(x=>{x.targetBuffer.dispose();x.surface.remove();});geometries.forEach(x=>x.dispose());materials.forEach(x=>x.dispose());textures.forEach(x=>x.dispose());environment.dispose();renderer.dispose();
    document.body.dataset.materialRenderer='fallback';
  }
  window.addEventListener('resize',demand);window.addEventListener('scroll',demand,{capture:true,passive:true});window.addEventListener('pagehide',pageHide);window.addEventListener('pageshow',pageShow);
  document.addEventListener('visibilitychange',visibility);reduced.addEventListener('change',demand);forced.addEventListener('change',demand);canvas.addEventListener('webglcontextlost',contextLost);
  demand();
  return {refresh:demand,dispose};
}
