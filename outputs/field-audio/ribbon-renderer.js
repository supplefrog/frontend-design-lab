import * as THREE from '../consistency/components/vendor/three.module.min.js';

// Authored membranes: the interval's envelope supplies width, while distinct
// folds supply the satin-film form. No texture or raster is used by the scene.
export function createRibbonScene(host, { peaks = [], reducedMotion = false, onStatus = () => {}, onFrame = () => {} } = {}) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true, powerPreference: 'low-power' });
  } catch (error) {
    onStatus({ mode: 'fallback', reason: 'WebGL unavailable', error: String(error) });
    return { setSelection() {}, setSpectrum() {}, setPlayback() {}, destroy() {} };
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const canvas = renderer.domElement;
  canvas.style.cssText = 'width:100%;height:100%;display:block;pointer-events:none';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.dataset.frames = '0';
  canvas.dataset.renderState = 'initializing';
  host.appendChild(canvas);
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-5.6, 5.6, 2.8, -2.8, .1, 50);
  camera.position.set(0, .1, 14);
  camera.lookAt(0, 0, 0);
  const sculpture = new THREE.Group();
  scene.add(sculpture);
  const resources = [];
  const uniforms = {
    uBands: { value: new Float32Array(32) },
    uEnergy: { value: new THREE.Vector4() }, uRms: { value: 0 },
    uPointer: { value: new THREE.Vector2() }, uPlayhead: { value: -1 },
  };
  const vertex = `
    uniform float uBands[32]; uniform vec4 uEnergy; uniform float uRms; uniform float uLayer;
    varying vec3 vPosition; varying vec3 vNormal; varying vec2 vUv;
    float spectrum(float at){
      float value=0.;
      for(int i=0;i<32;i++)value+=uBands[i]*max(0.,1.-abs(float(i)-at));
      return value;
    }
    void main(){
      vec3 p=position;
      float endFade=sin(uv.x*3.14159265);
      // Each membrane follows a different frequency register. The fixed spatial
      // folds stay recognizable; there is no oscillator standing in for audio.
      float band=spectrum(uv.x*7.+uLayer*8.);
      float register=uLayer<.5?uEnergy.x:(uLayer<1.5?uEnergy.y:(uLayer<2.5?uEnergy.z:uEnergy.w));
      float across=uv.y*2.-1.;
      float center=1.-across*across;
      float crease=sin(uv.x*(10.+uLayer*4.)+uLayer*1.7);
      float swell=(register*.32+band*.29)*endFade;
      p.y+=across*swell*(.52+crease*.24)+band*endFade*crease*.12;
      p.z+=swell*(center*(.9-uLayer*.17)+across*crease*.62)
        +uRms*.08*endFade*center*(uLayer-1.5);
      vPosition=p;
      vNormal=normalize(normalMatrix*normalize(normal+vec3(-band*crease*.13,-swell*across*.42,0.)));
      vUv=uv;
      gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);
    }`;
  const fragment = `
    uniform vec2 uPointer; uniform float uPlayhead;
    uniform float uOpacity; uniform float uTint; uniform float uLayer;
    uniform vec4 uEnergy; uniform float uRms;
    varying vec3 vPosition; varying vec3 vNormal; varying vec2 vUv;
    void main(){
      vec3 N=normalize(vNormal); if(!gl_FrontFacing)N=-N;
      // Fine film creases modulate the normal, rather than drawing opaque stripes.
      float crease=sin(vUv.x*238.+sin(vUv.y*17.)*2.4)*.035;
      N=normalize(N+vec3(crease,crease*.4,0.));
      vec3 L=normalize(vec3(-.55+uPointer.x*.22,.85+uPointer.y*.18,1.35));
      float facing=abs(N.z); float rim=pow(1.-facing,2.4);
      float diffuse=max(0.,dot(N,L));
      float halfLight=max(0.,dot(N,normalize(L+vec3(0.,0.,1.))));
      float sheen=pow(halfLight,38.);
      float pearl=pow(halfLight,7.);
      float core=exp(-pow((vUv.x-.54)*3.7,2.));
      float lit=smoothstep(.12,.95,diffuse);
      vec3 cyan=mix(vec3(.12,.43,.47),vec3(.64,.91,.85),lit);
      vec3 lime=mix(vec3(.4,.61,.18),vec3(.92,.96,.55),lit);
      vec3 color=mix(cyan,lime,core*(.87-uTint*.24));
      float edge=pow(abs(vUv.y*2.-1.),24.);
      float grain=sin(vUv.x*740.+sin(vUv.y*190.)*3.)*sin(vUv.y*260.)*.038;
      color*=.96+grain;
      float thickness=(1.-abs(vUv.y*2.-1.))*.45;
      vec3 transmission=mix(vec3(.55,.91,.86),vec3(.98,.99,.67),core);
      // Light is behind the film: broad transmission survives away from the
      // specular edge. Grazing angles absorb more; thin faces glow through.
      float transmitted=core*(.32+thickness*.44)*(.65+.35*facing);
      color=mix(color,transmission,transmitted);
      color+=transmission*core*.20+vec3(.25,.30,.26)*sheen+vec3(.07,.10,.08)*pearl;
      float register=uLayer<.5?uEnergy.x:(uLayer<1.5?uEnergy.y:(uLayer<2.5?uEnergy.z:uEnergy.w));
      color+=transmission*(core*.17+edge*.05)*register;
      color=mix(color,vec3(.93,1.,.91),edge*.85);
      float scan=exp(-pow((vUv.x-uPlayhead)*32.,2.));
      color+=vec3(.06,.1,.015)*scan;
      float taper=smoothstep(0.,.055,vUv.x)*smoothstep(1.,.945,vUv.x);
      float alpha=(uOpacity+rim*.13+sheen*.055+edge*.22+(1.-lit)*.025)*taper;
      gl_FragColor=vec4(color,alpha);
    }`;
  let selected = { start: 6.2, end: 11.8, duration: 30 };
  let meshes = [], envelope = [];
  const peakAt = (time) => {
    if (!peaks.length) return .24;
    const index = THREE.MathUtils.clamp(time / selected.duration * (peaks.length - 1), 0, peaks.length - 1);
    const lo = Math.floor(index), f = index - lo;
    return Math.abs(Number(peaks[lo]) || 0) * (1-f) + Math.abs(Number(peaks[Math.min(lo+1, peaks.length-1)]) || 0)*f;
  };
  function amplitude(u) {
    const p = u * (envelope.length - 1), i = Math.floor(p);
    return THREE.MathUtils.lerp(envelope[i] || 0, envelope[Math.min(i+1,envelope.length-1)] || 0, p-i);
  }
  const folds = [
    { phase: .15, width: 1.36, depth: .34, offset: .04, opacity: .23, tint: 0, turn: 1.2 },
    { phase: 2.1, width: 1.06, depth: -.46, offset: -.16, opacity: .24, tint: .45, turn: -1.35 },
    { phase: 4.2, width: .90, depth: .76, offset: .24, opacity: .19, tint: .9, turn: 1.6 },
    { phase: 3.2, width: .62, depth: -.78, offset: .06, opacity: .19, tint: .55, turn: -1.8 },
  ];
  function point(u, v, fold) {
    const x = (u-.5)*9.8;
    const ends = Math.pow(Math.sin(Math.PI*u), .57);
    const env = amplitude(u);
    const width = fold.width * ends * (.5 + env*.78) * (1+.22*Math.sin(u*16+fold.phase));
    const twist = Math.sin(u*11.8+fold.phase)*fold.turn+.24*Math.sin(u*23+fold.phase);
    const center = Math.sin(u*13+fold.phase)*.27*ends + fold.offset*ends;
    return [x, center + v*width*Math.cos(twist), fold.depth*ends+v*width*Math.sin(twist)+.25*(1-v*v)*Math.sin(u*15+fold.phase)+v*v*v*.08*ends];
  }
  function removeGeometry() {
    meshes.forEach(object => { sculpture.remove(object); object.geometry.dispose(); object.material.dispose(); });
    meshes = [];
  }
  function rebuild() {
    removeGeometry();
    // Smooth the source at the membrane scale; retain unsmoothed peaks in its core.
    envelope = Array.from({length:161}, (_, i) => {
      const t = selected.start+(selected.end-selected.start)*i/160;
      const step=(selected.end-selected.start)/160;
      return (peakAt(t-step*2)+peakAt(t-step)+peakAt(t)*2+peakAt(t+step)+peakAt(t+step*2))/6;
    });
    const max = Math.max(.04, ...envelope);
    envelope = envelope.map(p => Math.pow(p/max,.62));
    folds.forEach((fold, order) => {
      const positions = [], uvs = [], indices = [], nx=160, ny=16;
      for(let i=0;i<=nx;i++) for(let j=0;j<=ny;j++) {
        positions.push(...point(i/nx, j/ny*2-1, fold)); uvs.push(i/nx,j/ny);
      }
      for(let i=0;i<nx;i++) for(let j=0;j<ny;j++) {
        const a=i*(ny+1)+j,b=a+ny+1;
        indices.push(a,b,a+1,b,b+1,a+1);
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
      geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
      geometry.setIndex(indices); geometry.computeVertexNormals();
      const layerUniforms={...uniforms,uLayer:{value:order}};
      const material = new THREE.ShaderMaterial({ uniforms:{...layerUniforms,uOpacity:{value:fold.opacity},uTint:{value:fold.tint}}, vertexShader:vertex, fragmentShader:fragment, transparent:true, side:THREE.DoubleSide, depthWrite:false });
      const mesh = new THREE.Mesh(geometry,material); mesh.renderOrder=order+2;
      sculpture.add(mesh); meshes.push(mesh);
      // Continuous white hairline contours retain a delicate edge at every fold.
      [-1,1].forEach(v => {
        const p=[],uv=[];
        for(let i=0;i<=nx;i++){p.push(...point(i/nx,v,fold));uv.push(i/nx,(v+1)/2);}
        const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
        const m=new THREE.ShaderMaterial({ uniforms:layerUniforms, vertexShader:vertex.replace('normal+vec3(', 'vec3(0.,0.,1.)+vec3('), fragmentShader:'uniform vec4 uEnergy; uniform float uLayer; varying vec2 vUv; void main(){float a=sin(vUv.x*3.14159265);float e=uLayer<.5?uEnergy.x:(uLayer<1.5?uEnergy.y:(uLayer<2.5?uEnergy.z:uEnergy.w));gl_FragColor=vec4(.92,1.,.9,a*(.64+e*.25));}', transparent:true,depthWrite:false });
        const line=new THREE.Line(g,m);line.renderOrder=8;sculpture.add(line);meshes.push(line);
      });
    });
    const p=[], colors=[];
    for(let i=0;i<440;i++) {
      const u=i/439,t=selected.start+(selected.end-selected.start)*u;
      const amp=peakAt(t)/max;
      const h=Math.min(1.65,Math.pow(amp,.78)*1.05)*Math.pow(Math.sin(Math.PI*u),.55);
      const x=(u-.5)*9.8,base=Math.sin(u*15)*.045;
      p.push(x,base-h,.07,x,base+h,.07);
      const c=new THREE.Color().setRGB(.18+.12*Math.sin(Math.PI*u),.43+.12*Math.sin(Math.PI*u),.16+.20*(1-Math.sin(Math.PI*u)));
      colors.push(c.r,c.g,c.b,c.r,c.g,c.b);
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
    const m=new THREE.LineBasicMaterial({vertexColors:true,transparent:true,opacity:.47,depthWrite:false,depthTest:false});
    const lines=new THREE.LineSegments(g,m); lines.renderOrder=7;sculpture.add(lines);meshes.push(lines);
  }
  // Soft transmitted light, finite plane, not a postprocessing bloom pass.
  const haloGeometry=new THREE.PlaneGeometry(11,5);
  const haloMaterial=new THREE.ShaderMaterial({uniforms,vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:`
    uniform vec4 uEnergy; uniform float uRms; varying vec2 vUv;
    void main(){
      vec2 p=(vUv-.5)*vec2(2.,3.);
      vec2 lime=p-vec2(.10,-.03), aqua=p-vec2(-.39,.07);
      float a=exp(-dot(lime*vec2(1.45,1.),lime*vec2(1.45,1.))*7.);
      float b=exp(-dot(aqua*vec2(1.2,1.2),aqua*vec2(1.2,1.2))*8.);
      vec3 color=mix(vec3(.68,1.,.95),vec3(.98,1.,.68),a/(a+b+.0001));
      gl_FragColor=vec4(color,a*(.53+uEnergy.x*.12)+b*(.30+uEnergy.z*.09));
    }`,transparent:true,depthWrite:false});
  const halo=new THREE.Mesh(haloGeometry,haloMaterial);halo.position.z=-1.5;halo.renderOrder=0;scene.add(halo);resources.push(haloGeometry,haloMaterial);
  let frame=0, destroyed=false, playing=false, visible=true, contextLost=false, lastStamp=0;
  let spectrumSignal=null;
  const cleanEnergy=value=>Math.min(1,Math.max(0,Number(value)||0));
  function followEnergy(currentValue,targetValue,dt){
    const next=currentValue+(targetValue-currentValue)*(1-Math.exp(-dt/(targetValue>currentValue?.055:.24)));
    return targetValue===0&&next<.001?0:next;
  }
  const target=new THREE.Vector2(),current=new THREE.Vector2();
  const mq=window.matchMedia('(prefers-reduced-motion: reduce)');
  let reduce=Boolean(reducedMotion || mq.matches);
  function request(){ if(!destroyed && !contextLost && visible && !document.hidden && !frame)frame=requestAnimationFrame(draw); }
  function draw(stamp) {
    frame=0; if(destroyed || contextLost || !visible || document.hidden)return;
    const dt=lastStamp?Math.min(.05,(stamp-lastStamp)/1000):1/60;lastStamp=stamp;
    current.lerp(target,reduce?1:.11);
    const active=playing&&!reduce&&spectrumSignal;
    let energyRemaining=0;
    for(let i=0;i<32;i++){
      const wanted=active?cleanEnergy(spectrumSignal.bands?.[i]):0;
      const value=reduce?0:followEnergy(uniforms.uBands.value[i],wanted,dt);
      uniforms.uBands.value[i]=value;energyRemaining=Math.max(energyRemaining,value);
    }
    const energy=uniforms.uEnergy.value;
    energy.x=reduce?0:followEnergy(energy.x,active?cleanEnergy(spectrumSignal.low):0,dt);
    energy.y=reduce?0:followEnergy(energy.y,active?cleanEnergy(spectrumSignal.mid):0,dt);
    energy.z=reduce?0:followEnergy(energy.z,active?cleanEnergy(spectrumSignal.high):0,dt);
    energy.w=reduce?0:followEnergy(energy.w,active?cleanEnergy(spectrumSignal.air):0,dt);
    uniforms.uRms.value=reduce?0:followEnergy(uniforms.uRms.value,active?cleanEnergy(spectrumSignal.rms):0,dt);
    energyRemaining=Math.max(energyRemaining,energy.x,energy.y,energy.z,energy.w,uniforms.uRms.value);
    uniforms.uPointer.value.copy(current);
    sculpture.rotation.x=reduce?0:current.y*.09;sculpture.rotation.y=reduce?0:current.x*.11;
    renderer.render(scene,camera);
    canvas.dataset.frames = String(Number(canvas.dataset.frames) + 1);
    canvas.dataset.drawCalls = String(renderer.info.render.calls);
    canvas.dataset.triangles = String(renderer.info.render.triangles);
    canvas.dataset.spectrumLow=energy.x.toFixed(4);canvas.dataset.spectrumMid=energy.y.toFixed(4);
    canvas.dataset.spectrumHigh=energy.z.toFixed(4);canvas.dataset.spectrumAir=energy.w.toFixed(4);
    canvas.dataset.spectrumRms=uniforms.uRms.value.toFixed(4);
    canvas.dataset.spectrumPeak=energyRemaining.toFixed(4);
    canvas.dataset.renderState = reduce?'reduced':playing?'playing':energyRemaining>0?'settling':'settled';
    onFrame(canvas);
    if((playing&&!reduce) || energyRemaining>0 || current.distanceTo(target)>.001)request();
    else lastStamp=0;
  }
  function resize(){
    const width=Math.max(1,host.clientWidth),height=Math.max(1,host.clientHeight);
    renderer.setSize(width,height,false);
    canvas.dataset.hostSize = `${width}x${height}`;
    const aspect=width/height,halfWidth=Math.max(5.55,2.15*aspect),halfHeight=halfWidth/aspect;
    camera.left=-halfWidth;camera.right=halfWidth;camera.top=halfHeight;camera.bottom=-halfHeight;camera.updateProjectionMatrix();request();
  }
  function pointer(event){ if(reduce || event.pointerType==='touch')return;const r=host.getBoundingClientRect();target.set((event.clientX-r.left)/r.width*2-1,1-(event.clientY-r.top)/r.height*2);request(); }
  function leave(){target.set(0,0);request();}
  function visibility(){lastStamp=0;if(document.hidden){cancelAnimationFrame(frame);frame=0;}else request();}
  function preference(){reduce=Boolean(reducedMotion||mq.matches);if(reduce){target.set(0,0);uniforms.uPlayhead.value=-1;}request();}
  function lost(event){event.preventDefault();contextLost=true;cancelAnimationFrame(frame);frame=0;onStatus({mode:'fallback',reason:'WebGL context lost'});}
  function restored(){contextLost=false;lastStamp=0;onStatus({mode:'webgl',reason:'WebGL context restored'});request();}
  const resizeObserver=new ResizeObserver(resize);resizeObserver.observe(host);
  const intersectionObserver=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;canvas.dataset.intersecting=String(visible);if(!visible){cancelAnimationFrame(frame);frame=0;lastStamp=0;}else request();});intersectionObserver.observe(host);
  host.addEventListener('pointermove',pointer);host.addEventListener('pointerleave',leave);
  document.addEventListener('visibilitychange',visibility);mq.addEventListener('change',preference);
  canvas.addEventListener('webglcontextlost',lost);canvas.addEventListener('webglcontextrestored',restored);
  rebuild();resize();
  onStatus({mode:'webgl',renderer:'Three.js membrane sculpture',reducedMotion:reduce});
  return {
    setSelection(start,end,duration=30){
      if(destroyed)return;
      duration=Math.max(.01,Number(duration)||30);
      start=THREE.MathUtils.clamp(Number(start)||0,0,Math.max(0,duration-.001));
      end=THREE.MathUtils.clamp(Number(end)||duration,start+.001,duration);
      selected={start,end,duration};rebuild();request();
    },
    setSpectrum(signal){
      if(destroyed)return;
      // Retain the caller's stable analyser object; draw reads its live buffers.
      spectrumSignal=signal||null;
    },
    setPlayback(time,isPlaying){
      if(destroyed)return;
      const nextPlaying=Boolean(isPlaying);
      const nextHead=nextPlaying&&!reduce?(Number(time)-selected.start)/(selected.end-selected.start):-1;
      const changed=playing!==nextPlaying||uniforms.uPlayhead.value!==nextHead;
      playing=nextPlaying;uniforms.uPlayhead.value=nextHead;
      if(changed)request();
    },
    destroy(){
      if(destroyed)return;destroyed=true;cancelAnimationFrame(frame);
      resizeObserver.disconnect();intersectionObserver.disconnect();
      host.removeEventListener('pointermove',pointer);host.removeEventListener('pointerleave',leave);
      document.removeEventListener('visibilitychange',visibility);mq.removeEventListener('change',preference);
      canvas.removeEventListener('webglcontextlost',lost);canvas.removeEventListener('webglcontextrestored',restored);
      removeGeometry();resources.forEach(r=>r.dispose());renderer.dispose();renderer.forceContextLoss();canvas.remove();
    },
  };
}
