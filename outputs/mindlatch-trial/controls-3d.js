import * as THREE from '../consistency/components/vendor/three.module.min.js';

// Semantic DOM controls own input. This layer owns only their physical representation.
export async function mountInstrumentControls() {
  const anchors = [...document.querySelectorAll('[data-render-control]')];
  if (!anchors.length) return false;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const forced = matchMedia('(forced-colors: active)');
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  canvas.dataset.instrumentRenderer='true';
  canvas.dataset.rendererRevision='seated-controls-20261009';
  canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:4;';
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({canvas, alpha:true, antialias:true, powerPreference:'low-power'});
  } catch { return false; }
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.autoClear = false;
  // The compositor retains two samples per physical display pixel. Each object
  // gets its own filtered, multisampled target; unused page area is not 4x.
  const gl=renderer.getContext();
  const viewportLimits=gl.getParameter(gl.MAX_VIEWPORT_DIMS);
  const bufferLimit=Math.min(gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),gl.getParameter(gl.MAX_TEXTURE_SIZE));
  const maxBufferWidth=Math.min(bufferLimit,viewportLimits[0]);
  const maxBufferHeight=Math.min(bufferLimit,viewportLimits[1]);
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
  function mesh(parent,g,m,x=0,y=0,z=0){const item=new THREE.Mesh(ownGeometry(g),m);item.position.set(x,y,z);parent.add(item);return item;}
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
    const key=new THREE.DirectionalLight(0xffffff,3.2);key.position.set(-3,4,5);scene.add(key);
    const fill=new THREE.DirectionalLight(0xa9c2e8,.4);fill.position.set(3,-1,3);scene.add(fill);
    const root=new THREE.Group();scene.add(root);
    const camera=new THREE.PerspectiveCamera(29,1,.1,40);
    const type=anchor.dataset.renderControl;
    const enamel=material({color:type==='lever'?0xffcd13:0xf53a94,metalness:.14,roughness:.21,envMapIntensity:.7});
    const item={anchor,scene,root,camera,type,enamel,current:null,target:null};
    if(type==='lever'){
      // The broad, polished housing faces the visitor. The inset wheel still
      // turns around its real horizontal axle; only the crank/wheel rotate.
      root.rotation.y=0;root.position.x=.14;
      const mount=new THREE.Group();root.add(mount);mount.position.set(-.42,-.14,0);
      // Literal master-contour stations (reference-lever.png pixel coordinates).
      // Separate capsule returns/opening replace concentric elliptical mouths.
      const scale=2.20/194,toPoint=([x,y])=>new THREE.Vector2((x-73)*scale,(167-y)*scale);
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
        positions.push(THREE.MathUtils.lerp(a.x,b.x,t),THREE.MathUtils.lerp(a.y,b.y,t),.70+.16*Math.sin(Math.PI*t));
      }
      for(let row=0;row<across;row++)for(let col=0;col<around;col++){
        const a=row*(around+1)+col,b=a+1,c=a+around+1,d=c+1;indices.push(a,b,c,b,d,c);
      }
      face.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));face.setIndex(indices);face.computeVertexNormals();
      mesh(mount,face,chrome);
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
      // Move the circular wheel's center forward so its visible edge remains
      // nearly full height; the old zero-depth wheel exposed only its middle.
      rotor.position.z=.60;
      const smoothWheel=material({color:0xd8dadd,metalness:1,roughness:.22,envMapIntensity:1.25});
      sideDisc(rotor,.88,.26,.025,smoothWheel);
      sideRing(rotor,.865,.014,.155,chrome);sideRing(rotor,.865,.014,-.105,chrome);
      sideDisc(mount,.13,.24,.56,chrome).position.z=.60;sideRing(mount,.13,.018,.68,black).position.z=.60;
      // The wheel, tube and grip are one rigid rotor around this fixed axle.
      // At value 65 the grip is upright, as in the selected master.
      const curve=new THREE.CatmullRomCurve3([
        new THREE.Vector3(.56,0,0),new THREE.Vector3(.94,0,.20),
        new THREE.Vector3(1.23,.08,.26),new THREE.Vector3(1.34,.23,.26),new THREE.Vector3(1.34,.53,.26)
      ],false,'centripetal');
      mesh(rotor,new THREE.TubeGeometry(curve,128,.068,32,false),chrome);
      // A tapered enamel handle has a wide rolled crown and a narrower ferrule,
      // rather than the small capsule that lost the selected master's weight.
      const gripProfile=[[0,0],[.14,.018],[.17,.045],[.18,.11],[.23,.81],[.235,.86],[.21,.91],[.14,.935],[0,.94]].map(([r,y])=>new THREE.Vector2(r,y));
      mesh(rotor,new THREE.LatheGeometry(gripProfile,256),enamel,1.34,.52,.26);
      mesh(rotor,new THREE.CylinderGeometry(.17,.15,.07,64),chrome,1.34,.52,.26);
      item.fitWidth=2.35;item.fitHeight=2.92;item.frontDepth=1.6;item.centerY=.02;
    }else if(type==='dial'){
      const socket=material({color:0x12496a,metalness:.45,roughness:.38,envMapIntensity:.65});
      disc(root,.99,.10,-.12,socket);ring(root,.955,.022,-.015,chrome);
      ring(root,.91,.009,.015,black);
      const rotor=new THREE.Group();root.add(rotor);item.rotor=rotor;
      const radialEnamel=new THREE.MeshPhysicalMaterial({color:0xf53a94,metalness:.52,roughness:.29,anisotropy:.85,anisotropyRotation:Math.PI/2,clearcoat:.65,clearcoatRoughness:.23,envMapIntensity:.9});materials.add(radialEnamel);item.enamel=radialEnamel;
      // A dished cone meets at its center. Radial tangents and normals stay
      // axisymmetric in world space, so fixed studio illumination does not turn
      // with the attached marker/face under semantic rotation.
      radialFace(rotor,[[.90,0],[.885,.055],[.85,.084],[.56,.058],[.28,.032],[0,.006]],.025,radialEnamel);
      // Indicator sits ON the rotating face and rotates about the knob center.
      const marker=mesh(rotor,new THREE.CapsuleGeometry(.038,.25,6,16),black,-.47,-.47,.153);marker.scale.z=.35;marker.rotation.z=-Math.PI/4;
      root.rotation.set(.03,-.04,0);item.fitWidth=2.28;item.fitHeight=2.28;item.centerY=0;
    }else{
      disc(root,1.42,.11,-.12,black);ring(root,1.38,.046,-.02,chrome);ring(root,1.29,.027,.005,black);
      const annulus=radialFace(root,[[1.27,0],[1.25,.035],[1.21,.070],[.76,.078],[.72,.06]],.015,transportFinish?finishMaterial():brushed);
      if(transportFinish){mapRadialFinish(annulus,.72,1.27,.31,.435);item.finishMaterials=[annulus.material];}
      ring(root,1.25,.022,.045,chrome);ring(root,.73,.020,.09,black);ring(root,.69,.018,.10,chrome);
      const cap=new THREE.Group();root.add(cap);item.cap=cap;
      const polishedCap=material({color:0xcdd1d5,metalness:1,roughness:.34,bumpMap:bump,bumpScale:.001,envMapIntensity:.85});
      const pushFace=radialFace(cap,[[.675,0],[.666,.018],[.635,.044],[.38,.052],[0,.053]],.095,transportFinish?finishMaterial():polishedCap);
      if(transportFinish){mapRadialFinish(pushFace,0,.675,0,.295);item.finishMaterials.push(pushFace.material);}
      item.pushMaterial=pushFace.material;
      item.symbols=[0,1].map(()=>{
        const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(18),3));
        const symbol=mesh(cap,g,black,0,0,.155);return symbol;
      });
      item.fitWidth=3.12;item.fitHeight=3.12;item.centerY=0;
    }
    if(type==='lever'){
      // Fit the complete rigid assembly at every allowed pose once. The camera
      // center and framing then stay fixed as the grip moves through its travel.
      const envelope=new THREE.Box3();
      for(let value=0;value<=100;value+=5){
        item.rotor.rotation.x=(65-value)*.010;root.updateMatrixWorld(true);
        envelope.union(new THREE.Box3().setFromObject(root,true));
      }
      item.rotor.rotation.x=0;root.updateMatrixWorld(true);
      const size=envelope.getSize(new THREE.Vector3()),center=envelope.getCenter(new THREE.Vector3());
      item.fitWidth=size.x*1.10;item.fitHeight=size.y*1.10;
      item.centerX=center.x;item.centerY=center.y;item.frontDepth=envelope.max.z+.20;
    }
    return item;
  }
  const items=anchors.map(build);
  const copyScene=new THREE.Scene(),copyCamera=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
  const copyMaterial=new THREE.ShaderMaterial({
    transparent:true,depthTest:false,depthWrite:false,toneMapped:true,
    uniforms:{source:{value:null},texel:{value:new THREE.Vector2()}},
    vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
    fragmentShader:`uniform sampler2D source;uniform vec2 texel;varying vec2 vUv;
      void main(){
        vec4 c=(texture2D(source,vUv+texel*vec2(-.5,-.5))+
          texture2D(source,vUv+texel*vec2(.5,-.5))+
          texture2D(source,vUv+texel*vec2(-.5,.5))+
          texture2D(source,vUv+texel*vec2(.5,.5)))*.25;
        // Resolve coverage before compositing transparent edges onto the case.
        gl_FragColor=vec4(c.rgb/max(c.a,.0001),c.a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });materials.add(copyMaterial);
  copyScene.add(new THREE.Mesh(ownGeometry(new THREE.PlaneGeometry(2,2)),copyMaterial));
  const samples=Math.min(4,gl.getParameter(gl.MAX_SAMPLES)||0);
  for(const item of items){
    item.targetBuffer=new THREE.WebGLRenderTarget(1,1,{samples,depthBuffer:true});
    item.targetBuffer.texture.minFilter=THREE.LinearFilter;
    item.targetBuffer.texture.magFilter=THREE.LinearFilter;
    item.targetBuffer.texture.generateMipmaps=false;
  }
  let disposed=false,lost=false,frame=0,lastTime=0,width=0,height=0;
  document.body.append(canvas);
  function read(item){
    const d=item.anchor.dataset,disabled=d.disabled==='true';
    let rotation=0;
    if(item.type==='lever')rotation=(65-THREE.MathUtils.clamp(Number(d.value)||0,0,100))*.010;
    if(item.type==='dial')rotation=({nearby:.78,suggest:0,manual:-.78})[d.mode]??0;
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
  function demand(){if(!disposed&&!lost&&!document.hidden&&!frame){lastTime=performance.now();frame=requestAnimationFrame(draw);}}
  function draw(time){
    frame=0;if(disposed||lost||document.hidden)return;
    if(forced.matches){canvas.style.display='none';ready(false);document.body.dataset.materialRenderer='fallback';return;}
    canvas.style.display='block';
    // DOM anchors and the drawing projection use the same CSS pixel surface.
    // Window width includes the scrollbar; the fixed 100% canvas does not.
    const surface=canvas.getBoundingClientRect();
    const w=surface.width,h=surface.height,deviceDpr=window.devicePixelRatio||1,requestedDpr=deviceDpr*2;
    const dpr=Math.min(requestedDpr,maxBufferWidth/w,maxBufferHeight/h);
    if(width!==w||height!==h||renderer.getPixelRatio()!==dpr){
      width=w;height=h;renderer.setPixelRatio(dpr);renderer.setSize(w,h,false);
      canvas.dataset.pixelRatio=dpr.toFixed(4);
      canvas.dataset.requestedPixelRatio=requestedDpr.toFixed(4);
      canvas.dataset.devicePixelRatio=deviceDpr.toFixed(4);
      canvas.dataset.qualityScale=(dpr/deviceDpr).toFixed(4);
      canvas.dataset.cssViewport=`${w}x${h}`;
      canvas.dataset.pixelBuffer=`${canvas.width}x${canvas.height}`;
      canvas.dataset.hardwareBufferLimit=`${maxBufferWidth}x${maxBufferHeight}`;
      canvas.dataset.filter='local-2x-box-msaa';canvas.dataset.samples=String(samples);
    }
    const boxes=items.map(item=>item.anchor.getBoundingClientRect());
    renderer.setRenderTarget(null);renderer.setClearColor(0,0);
    // The browser discards the default framebuffer after presentation. Cache
    // expensive object targets, then recompose all visible targets each frame.
    renderer.setScissorTest(false);renderer.clear();
    renderer.setScissorTest(true);
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
      const paintKey=[state.rotation,state.press,state.morph,state.dim].join('/');
      const changed=item.paintKey!==paintKey;
      item.paintKey=paintKey;
      if(item.rotor)item.rotor.rotation[item.axis||'z']=state.rotation;
      if(item.cap){item.cap.position.z=state.press;symbol(item,state.morph);}
      item.anchor.dataset.currentAngle=state.rotation.toFixed(6);
      item.anchor.dataset.currentPress=state.press.toFixed(6);
      item.anchor.dataset.currentMorph=state.morph.toFixed(6);
      item.anchor.dataset.angleAxis=item.axis||'z';
      item.anchor.dataset.renderPixelRatio=dpr.toFixed(4);
      item.anchor.dataset.renderCssSize=`${rect.width.toFixed(2)}x${rect.height.toFixed(2)}`;
      item.anchor.dataset.renderPixelSize=`${Math.round(rect.width*dpr)}x${Math.round(rect.height*dpr)}`;
      item.enamel.color.setHex(item.type==='lever'?0xffcd13:0xf53a94).multiplyScalar(state.dim);
      if(item.type==='lever')item.enamel.color.lerp(new THREE.Color(0xb7c1c8),THREE.MathUtils.clamp((1-state.dim)/.28,0,1));
      item.finishMaterials?.forEach(m=>m.color.setScalar(state.dim));
      if(item.pushMaterial)item.pushMaterial.color.setScalar(state.dim*(1-.18*THREE.MathUtils.clamp(-state.press/.19,0,1)));
      item.scene.environmentIntensity=state.dim;
      item.scene.children.filter(x=>x.isLight).forEach(x=>{x.intensity=(x===item.scene.children[0]?3.2:.4)*state.dim;});
      const aspect=rect.width/rect.height;
      item.camera.aspect=aspect;
      // The lever is tall; fitting it as a square made its tall bay mostly void.
      // Retain the complete moving envelope independently on both axes.
      const distance=Math.max(item.fitHeight,item.fitWidth/aspect)/2/Math.tan(THREE.MathUtils.degToRad(14.5))+(item.frontDepth||.25);
      item.camera.position.set(item.centerX||0,item.centerY,distance);item.camera.lookAt(item.centerX||0,item.centerY,0);item.camera.updateProjectionMatrix();
      const targetWidth=Math.min(maxBufferWidth,Math.max(1,Math.ceil(rect.width*dpr*2)));
      const targetHeight=Math.min(maxBufferHeight,Math.max(1,Math.ceil(rect.height*dpr*2)));
      const sizeChanged=item.targetBuffer.width!==targetWidth||item.targetBuffer.height!==targetHeight;
      if(sizeChanged)item.targetBuffer.setSize(targetWidth,targetHeight);
      if(changed||sizeChanged){
        renderer.setRenderTarget(item.targetBuffer);renderer.setScissorTest(false);
        // setRenderTarget installs its physical-pixel viewport. setViewport uses
        // renderer DPR again, which would crop the object at non-unit ratios.
        renderer.clear();renderer.render(item.scene,item.camera);
        item.anchor.dataset.renderFrames=String((Number(item.anchor.dataset.renderFrames)||0)+1);
      }
      renderer.setRenderTarget(null);renderer.setScissorTest(true);
      renderer.setViewport(rect.left,h-rect.bottom,rect.width,rect.height);
      const left=Math.max(0,rect.left),bottom=Math.max(0,h-rect.bottom),right=Math.min(w,rect.right),top=Math.min(h,h-rect.top);
      renderer.setScissor(left,bottom,right-left,top-bottom);
      renderer.clear();copyMaterial.uniforms.source.value=item.targetBuffer.texture;
      copyMaterial.uniforms.texel.value.set(1/targetWidth,1/targetHeight);
      renderer.render(copyScene,copyCamera);
      item.anchor.dataset.renderPixelSize=`${targetWidth}x${targetHeight}`;
      item.anchor.dataset.renderReady='true';
      item.anchor.dataset.compositeFrames=String((Number(item.anchor.dataset.compositeFrames)||0)+1);
    }
    document.body.dataset.materialRenderer='three';
    if(moving)demand();
  }
  const mutation=new MutationObserver(demand);
  mutation.observe(document.querySelector('.instrument')||document.body,{subtree:true,attributes:true,attributeFilter:['data-value','data-mode','data-playing','data-disabled','data-pressed','data-tracking','data-drag-angle','hidden','class']});
  const resize=new ResizeObserver(demand);items.forEach(i=>resize.observe(i.anchor));resize.observe(canvas);
  const intersection=new IntersectionObserver(demand);items.forEach(i=>intersection.observe(i.anchor));
  function visibility(){if(document.hidden){cancelAnimationFrame(frame);frame=0;lastTime=0;}else demand();}
  function contextLost(event){event.preventDefault();lost=true;cancelAnimationFrame(frame);frame=0;canvas.style.display='none';ready(false);document.body.dataset.materialRenderer='fallback';}
  function dispose(){
    if(disposed)return;disposed=true;cancelAnimationFrame(frame);ready(false);
    mutation.disconnect();resize.disconnect();intersection.disconnect();
    window.removeEventListener('resize',demand);window.removeEventListener('scroll',demand,true);window.removeEventListener('pagehide',dispose);
    document.removeEventListener('visibilitychange',visibility);reduced.removeEventListener('change',demand);forced.removeEventListener('change',demand);canvas.removeEventListener('webglcontextlost',contextLost);
    items.forEach(x=>x.targetBuffer.dispose());geometries.forEach(x=>x.dispose());materials.forEach(x=>x.dispose());textures.forEach(x=>x.dispose());environment.dispose();renderer.dispose();canvas.remove();
    document.body.dataset.materialRenderer='fallback';
  }
  window.addEventListener('resize',demand);window.addEventListener('scroll',demand,{capture:true,passive:true});window.addEventListener('pagehide',dispose,{once:true});
  document.addEventListener('visibilitychange',visibility);reduced.addEventListener('change',demand);forced.addEventListener('change',demand);canvas.addEventListener('webglcontextlost',contextLost);
  demand();
  return {refresh:demand,dispose};
}
