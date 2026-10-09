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
  canvas.dataset.rendererRevision='front-bezel-20261009';
  canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:4;';
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({canvas, alpha:true, antialias:true, powerPreference:'low-power'});
  } catch { return false; }
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.autoClear = false;
  // Supersample reflective edges, including on ordinary-density displays.
  // This renderer settles at rest; only actual GPU limits reduce its buffer.
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
  const envCanvas = document.createElement('canvas'); envCanvas.width=1024; envCanvas.height=512;
  const ctx = envCanvas.getContext('2d');
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
  function mesh(parent,g,m,x=0,y=0,z=0){const item=new THREE.Mesh(ownGeometry(g),m);item.position.set(x,y,z);parent.add(item);return item;}
  function ring(parent,r,t,z,m){return mesh(parent,new THREE.TorusGeometry(r,t,24,128),m,0,0,z);}
  function disc(parent,r,depth,z,m){const item=mesh(parent,new THREE.CylinderGeometry(r,r,depth,96),m,0,0,z);item.rotation.x=Math.PI/2;return item;}
  function dome(parent,r,depth,z,m){
    const profile=Array.from({length:65},(_,i)=>{const angle=i/64*Math.PI/2;return new THREE.Vector2(r*Math.cos(angle),depth*Math.sin(angle));});
    const item=mesh(parent,new THREE.LatheGeometry(profile,128),m,0,0,z);item.rotation.x=Math.PI/2;return item;
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
      root.rotation.y=0;
      const mount=new THREE.Group();root.add(mount);mount.position.set(-.40,-.10,0);
      // A rounded metal face rolls the reflection from its outer lip to the
      // inset. A flat extruded plate reflects one dark band across the bezel.
      const face=new THREE.BufferGeometry(),positions=[],indices=[],around=128,across=32;
      for(let row=0;row<=across;row++)for(let col=0;col<=around;col++){
        const t=row/across,angle=col/around*Math.PI*2;
        positions.push(Math.cos(angle)*THREE.MathUtils.lerp(.47,.185,t),Math.sin(angle)*THREE.MathUtils.lerp(.99,.85,t),.73+.125*Math.sin(Math.PI*t));
      }
      for(let row=0;row<across;row++)for(let col=0;col<around;col++){
        const a=row*(around+1)+col,b=a+1,c=a+around+1,d=c+1;indices.push(a,b,c,b,d,c);
      }
      face.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));face.setIndex(indices);face.computeVertexNormals();
      mesh(mount,face,chrome);
      const surround=ring(mount,1,.023,.79,chrome);surround.scale.set(.47,1,1);
      const innerRim=ring(mount,1,.012,.79,chrome);innerRim.scale.set(.185,.85,1);
      const cavity=mesh(mount,new THREE.SphereGeometry(1,96,48),black,0,0,.60);cavity.scale.set(.465,.995,.09);
      function sideDisc(parent,r,depth,x,m){
        const part=mesh(parent,new THREE.CylinderGeometry(r,r,depth,96),m,x,0,0);part.rotation.z=Math.PI/2;return part;
      }
      function sideRing(parent,r,t,x,m){const part=ring(parent,r,t,0,m);part.rotation.y=Math.PI/2;part.position.x=x;return part;}
      const rotor=new THREE.Group();mount.add(rotor);item.rotor=rotor;item.axis='x';
      sideDisc(rotor,.83,.30,0,brushed);
      sideRing(rotor,.80,.018,.15,chrome);sideRing(rotor,.80,.018,-.15,chrome);
      for(let x=-.12;x<=.12;x+=.04)sideRing(rotor,.832,.006,x,black);
      sideDisc(mount,.11,.20,.49,chrome);sideRing(mount,.11,.018,.59,black);
      // The wheel, tube and grip are one rigid rotor around this fixed axle.
      // At value 65 the grip is upright, as in the selected master.
      const curve=new THREE.CatmullRomCurve3([
        new THREE.Vector3(.49,0,.08),new THREE.Vector3(.65,0,.15),
        new THREE.Vector3(.90,0,.45),new THREE.Vector3(.98,.12,.45),new THREE.Vector3(.98,.49,.45)
      ],false,'centripetal');
      mesh(rotor,new THREE.TubeGeometry(curve,64,.055,24,false),chrome);
      const grip=mesh(rotor,new THREE.CapsuleGeometry(.14,.43,16,64),enamel,.98,.73,.45);
      grip.scale.set(1,1,1.12);
      item.fit=2.78;item.centerY=0;
    }else if(type==='dial'){
      disc(root,.98,.18,-.12,black);ring(root,.94,.04,-.015,chrome);ring(root,.83,.026,.015,black);
      const rotor=new THREE.Group();root.add(rotor);item.rotor=rotor;
      dome(rotor,.79,.23,.02,enamel);ring(rotor,.77,.025,.06,enamel);
      // Indicator sits ON the rotating face and rotates about the knob center.
      const marker=mesh(rotor,new THREE.CapsuleGeometry(.055,.31,6,16),black,-.347,-.347,.221);marker.scale.z=.35;marker.rotation.z=-Math.PI/4;
      root.rotation.set(.07,-.09,0);item.fit=2.22;item.centerY=0;
    }else{
      disc(root,1.42,.14,-.13,black);ring(root,1.38,.054,-.02,chrome);ring(root,1.29,.026,.025,black);ring(root,1.24,.055,.015,chrome);
      disc(root,1.20,.09,.025,brushed);ring(root,1.14,.016,.087,chrome);ring(root,.91,.024,.105,black);ring(root,.88,.016,.125,chrome);
      const cap=new THREE.Group();root.add(cap);item.cap=cap;
      const polishedCap=material({color:0xe9edf0,metalness:1,roughness:.17,bumpMap:bump,bumpScale:.002,envMapIntensity:1.45});
      dome(cap,.855,.20,.035,polishedCap);
      item.symbols=[0,1].map(()=>{
        const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(18),3));
        const symbol=mesh(cap,g,black,0,0,.244);return symbol;
      });
      item.fit=3.08;item.centerY=0;
    }
    return item;
  }
  const items=anchors.map(build);
  let disposed=false,lost=false,frame=0,lastTime=0,width=0,height=0;
  document.body.append(canvas);
  function read(item){
    const d=item.anchor.dataset,disabled=d.disabled==='true';
    let rotation=0;
    if(item.type==='lever')rotation=(65-THREE.MathUtils.clamp(Number(d.value)||0,0,100))*.010;
    if(item.type==='dial')rotation=({nearby:-.78,suggest:0,manual:.78})[d.mode]??0;
    // Disable freezes the actual lever at its last physical angle; values cannot imply activity.
    if(disabled&&item.type==='lever'&&item.current)rotation=item.current.rotation;
    return {rotation,press:!disabled&&d.pressed==='true'?-0.075:0,morph:d.playing==='true'?1:0,dim:disabled?.48:1};
  }
  function symbol(item,t){
    const play=[[[22,17],[22,47],[36,39],[36,25]],[[36,25],[36,39],[47,32],[47,32]]];
    const pause=[[[23,18],[23,46],[29,46],[29,18]],[[35,18],[35,46],[41,46],[41,18]]];
    item.symbols.forEach((s,i)=>{
      const attr=s.geometry.attributes.position;
      const centerX=THREE.MathUtils.lerp(34.5,32,t);
      [0,1,2,0,2,3].forEach((index,n)=>{const p=play[i][index],q=pause[i][index];attr.setXYZ(n,(THREE.MathUtils.lerp(p[0],q[0],t)-centerX)*.030,(32-THREE.MathUtils.lerp(p[1],q[1],t))*.030,0);});
      attr.needsUpdate=true;s.geometry.computeVertexNormals();
    });
  }
  function ready(value){items.forEach(i=>i.anchor.dataset.renderReady=String(value));}
  function demand(){if(!disposed&&!lost&&!document.hidden&&!frame){lastTime=performance.now();frame=requestAnimationFrame(draw);}}
  function draw(time){
    frame=0;if(disposed||lost||document.hidden)return;
    if(forced.matches){canvas.style.display='none';ready(false);return;}
    canvas.style.display='block';
    const w=window.innerWidth,h=window.innerHeight,deviceDpr=window.devicePixelRatio||1,requestedDpr=Math.max(2,deviceDpr*1.5);
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
    }
    renderer.setScissorTest(false);renderer.setClearColor(0,0);renderer.clear();renderer.setScissorTest(true);
    // Use actual monotonic elapsed time: a throttled callback must settle rather
    // than replay a backlog of artificial 50ms steps.
    const dt=Math.max(0,(time-lastTime)/1000)||1/60;lastTime=time;
    let moving=false;
    for(const item of items){
      const rect=item.anchor.getBoundingClientRect();
      if(!rect.width||!rect.height||rect.right<=0||rect.bottom<=0||rect.left>=w||rect.top>=h)continue;
      item.target=read(item);if(!item.current)item.current={...item.target};
      const amount=reduced.matches?1:1-Math.exp(-dt*24);
      for(const k of ['rotation','press','morph','dim']){
        const difference=item.target[k]-item.current[k];
        if(Math.abs(difference)<.0006)item.current[k]=item.target[k];
        else {item.current[k]+=difference*amount;if(!reduced.matches)moving=true;}
      }
      const state=item.current;
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
      item.scene.environmentIntensity=state.dim;
      item.scene.children.filter(x=>x.isLight).forEach(x=>{x.intensity=(x===item.scene.children[0]?3.2:.4)*state.dim;});
      const aspect=rect.width/rect.height;
      item.camera.aspect=aspect;
      const distance=item.fit/2/Math.tan(THREE.MathUtils.degToRad(14.5))*Math.max(1,1/aspect);
      item.camera.position.set(0,item.centerY,distance);item.camera.lookAt(0,item.centerY,0);item.camera.updateProjectionMatrix();
      renderer.setViewport(rect.left,h-rect.bottom,rect.width,rect.height);
      const left=Math.max(0,rect.left),bottom=Math.max(0,h-rect.bottom),right=Math.min(w,rect.right),top=Math.min(h,h-rect.top);
      renderer.setScissor(left,bottom,right-left,top-bottom);
      renderer.clearDepth();renderer.render(item.scene,item.camera);
      item.anchor.dataset.renderReady='true';
      item.anchor.dataset.renderFrames=String((Number(item.anchor.dataset.renderFrames)||0)+1);
    }
    document.body.dataset.materialRenderer='three';
    if(moving)demand();
  }
  const mutation=new MutationObserver(demand);
  mutation.observe(document.querySelector('.instrument')||document.body,{subtree:true,attributes:true,attributeFilter:['data-value','data-mode','data-playing','data-disabled','data-pressed','hidden','class']});
  const resize=new ResizeObserver(demand);items.forEach(i=>resize.observe(i.anchor));
  const intersection=new IntersectionObserver(demand);items.forEach(i=>intersection.observe(i.anchor));
  function visibility(){if(document.hidden){cancelAnimationFrame(frame);frame=0;lastTime=0;}else demand();}
  function contextLost(event){event.preventDefault();lost=true;cancelAnimationFrame(frame);frame=0;canvas.style.display='none';ready(false);document.body.dataset.materialRenderer='fallback';}
  function dispose(){
    if(disposed)return;disposed=true;cancelAnimationFrame(frame);ready(false);
    mutation.disconnect();resize.disconnect();intersection.disconnect();
    window.removeEventListener('resize',demand);window.removeEventListener('scroll',demand,true);window.removeEventListener('pagehide',dispose);
    document.removeEventListener('visibilitychange',visibility);reduced.removeEventListener('change',demand);forced.removeEventListener('change',demand);canvas.removeEventListener('webglcontextlost',contextLost);
    geometries.forEach(x=>x.dispose());materials.forEach(x=>x.dispose());textures.forEach(x=>x.dispose());environment.dispose();renderer.dispose();canvas.remove();
    document.body.dataset.materialRenderer='fallback';
  }
  window.addEventListener('resize',demand);window.addEventListener('scroll',demand,{capture:true,passive:true});window.addEventListener('pagehide',dispose,{once:true});
  document.addEventListener('visibilitychange',visibility);reduced.addEventListener('change',demand);forced.addEventListener('change',demand);canvas.addEventListener('webglcontextlost',contextLost);
  demand();
  return {refresh:demand,dispose};
}
