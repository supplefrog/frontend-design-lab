// Advect only sky texture. Ridge geometry stays fixed; atmospheric radiance
// is composited in front of distant terrain using its source-bound occlusion.
export async function mountClouds(){
  const screen=document.querySelector('.replay-screen');
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const canvas=document.createElement('canvas');canvas.className='cloud-sky';canvas.setAttribute('aria-hidden','true');
  const gl=canvas.getContext('webgl',{alpha:false,antialias:false,powerPreference:'low-power'});if(!gl)return;
  const image=new Image();image.src=new URL('./assets/replay-landscape.png',import.meta.url).href;
  const photographed=new Image();photographed.src=new URL('../mindlatch/assets/replay-landscape.png',import.meta.url).href;
  try{await Promise.all([image.decode(),photographed.decode()]);}catch{return;}
  // A source-bound skyline trace defines one continuous matte, including the
  // hazy distant ridge. Mountain interiors never depend on a per-pixel hue guess.
  const skyline=[[0,458],[25,454],[50,447],[77,443],[96,436],[112,435],[143,446],[170,464],[206,493],[245,517],[282,535],[321,547],[360,555],[389,554],[412,550],[449,544],[479,544],[500,539],[521,541],[550,538],[577,536],[602,541],[630,539],[660,545],[694,544],[725,548],[753,548],[782,545],[810,550],[844,547],[872,548],[899,534],[927,516],[952,518],[981,510],[1015,492],[1044,484],[1074,481],[1100,490],[1130,507],[1160,525],[1190,537],[1225,548],[1260,544],[1290,538],[1320,542],[1350,540],[1380,535],[1410,530],[1440,526],[1470,521],[1500,512],[1530,510],[1560,500],[1590,493],[1620,483],[1650,473],[1680,457],[1710,447],[1740,435],[1770,422],[1800,418],[1820,409],[1840,412],[1870,418],[1900,425],[1930,433],[1960,437],[1983,441]];
  const w=image.width,h=image.height,guard=Math.ceil(w*.13);
  const source=document.createElement('canvas');source.width=w;source.height=h;
  const sourceContext=source.getContext('2d',{willReadFrequently:true});sourceContext.drawImage(image,0,0);
  const pixels=sourceContext.getImageData(0,0,w,h), original=new Uint8ClampedArray(pixels.data);
  const ridge=new Float32Array(w);
  let segment=0;
  for(let x=0;x<w;x++){
    const sx=x*1983/w;while(segment<skyline.length-2&&sx>skyline[segment+1][0])segment++;
    const [ax,ay]=skyline[segment],[bx,by]=skyline[segment+1];
    const predicted=(ay+(by-ay)*(sx-ax)/(bx-ax))*h/793;
    // The photographed skyline is the authority. A local color gradient also
    // detects bright sun/cloud edges; treating those as terrain notched the disk.
    ridge[x]=predicted-3;
  }
  // A smooth sky continuation avoids the vertical streaks produced by copying
  // a different horizon-adjacent row in every column. Feather only source sky
  // into it. A separate 24-source-pixel exclusion above the traced matte
  // removes uncertain treetop/ridge texels before wind can expose them.
  const stops=[[0,[105,153,230]],[.40,[199,177,206]],[.56,[247,176,167]],[.72,[251,189,153]],[1,[237,169,161]]];
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const u=x/w,v=y/h;let k=0;while(k<stops.length-2&&v>stops[k+1][0])k++;
    const t=(v-stops[k][0])/(stops[k+1][0]-stops[k][0]);
    const warm=0; // Clean plate: no baked local emitter in moving sky continuation.
    const blend=Math.min(1,Math.max(0,(y-ridge[x]+52*h/793)/(28*h/793)));
    for(let c=0;c<3;c++){
      const ambient=stops[k][1][c]*(1-t)+stops[k+1][1][c]*t;
      const light=[255,218,150][c],background=ambient*(1-warm*.65)+light*warm*.65;
      const i=(y*w+x)*4+c;pixels.data[i]=original[i]*(1-blend)+background*blend;
    }
  }

  sourceContext.putImageData(pixels,0,0);
  function overscanned(source){
    const field=document.createElement('canvas');field.width=w+guard*2;field.height=h;
    const context=field.getContext('2d');context.drawImage(source,guard,0);
    context.save();context.translate(guard,0);context.scale(-1,1);context.drawImage(source,0,0,guard,h,0,0,guard,h);context.restore();
    context.save();context.translate(guard+w,0);context.scale(-1,1);context.drawImage(source,w-guard,0,guard,h,-guard,0,guard,h);context.restore();
    return field;
  }
  const field=overscanned(source);
  // Separate optical proxy from cloud RGB: estimate dark cloud contrast against
  // each row's source-sky upper envelope. The traced matte excludes land, and
  // the sky continuation is clear air. This is a 2D photographic transmission
  // approximation, not inferred cloud depth or a terrain color classifier.
  const cloudMask=document.createElement('canvas');cloudMask.width=w;cloudMask.height=h;
  const cloudContext=cloudMask.getContext('2d'),cloudPixels=cloudContext.createImageData(w,h);
  const luminance=i=>(pixels.data[i]*.2126+pixels.data[i+1]*.7152+pixels.data[i+2]*.0722)/255;
  for(let y=0;y<h;y++){
    const clearSamples=[];
    for(let x=0;x<w;x+=8)if(y<ridge[x]-52*h/793)clearSamples.push(luminance((y*w+x)*4));
    clearSamples.sort((a,b)=>a-b);
    const clear=Math.max(.001,clearSamples[Math.floor((clearSamples.length-1)*.9)]??1);
    for(let x=0;x<w;x++){
      const i=(y*w+x)*4,continuation=Math.min(1,Math.max(0,(y-ridge[x]+52*h/793)/(28*h/793)));
      const density=Math.max(0,(clear-luminance(i))/clear);
      const transmission=1-(1-Math.exp(-5*density))*(1-continuation);
      cloudPixels.data[i]=cloudPixels.data[i+1]=cloudPixels.data[i+2]=Math.round(transmission*255);cloudPixels.data[i+3]=255;
    }
  }
  cloudContext.putImageData(cloudPixels,0,0);const cloudOcclusion=overscanned(cloudMask);
  const matte=document.createElement('canvas');matte.width=w;matte.height=h;
  const matteContext=matte.getContext('2d'),mask=matteContext.createImageData(w,h);
  for(let x=0;x<w;x++)for(let y=0;y<h;y++){const i=(y*w+x)*4;const coverage=Math.min(1,Math.max(0,y-ridge[x]+.5));mask.data[i]=mask.data[i+2]=Math.round(coverage*255);mask.data[i+1]=Math.round(Math.min(1,Math.max(0,(y-ridge[x])/(h*.16)))*255);mask.data[i+3]=255;}
  matteContext.putImageData(mask,0,0);
  // The setting path ends beyond the actual ridge and the entire soft disk,
  // not at an arbitrary fraction that leaves an emitter visible forever.
  // This is a two-minute illustrative scene clock, not a real-location ephemeris.
  const emitterX=.687,emitterStartY=.660,emitterOuterRadius=.0145;
  const firstColumn=Math.max(0,Math.floor((emitterX-emitterOuterRadius)*w));
  const lastColumn=Math.min(w-1,Math.ceil((emitterX+emitterOuterRadius)*w));
  let lowestRidge=0;for(let x=firstColumn;x<=lastColumn;x++)lowestRidge=Math.max(lowestRidge,ridge[x]);
  const emitterEndY=(lowestRidge+emitterOuterRadius/.4*h+2*h/793)/h;
  const emitterPosition=seconds=>[emitterX,emitterStartY+(emitterEndY-emitterStartY)*Math.min(1,Math.max(0,seconds/120))];
  const shader=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error('Cloud shader unavailable');return s;};
  const vertex=shader(gl.VERTEX_SHADER,'attribute vec2 p;varying vec2 v;void main(){v=(p+1.)*.5;gl_Position=vec4(p,0.,1.);}');
  const fragment=shader(gl.FRAGMENT_SHADER,`precision highp float;varying vec2 v;
    uniform sampler2D scene,cloudField,terrain,cloudOcclusion,photograph;uniform vec4 crop;uniform vec2 displayTexel,sunPosition;uniform float time,overscan,emitterVisibility;
    float land(vec2 uv){return texture2D(terrain,uv).r;}
    float transmission(vec2 uv,float wind){
      return texture2D(cloudOcclusion,vec2((uv.x-wind+overscan)/(1.+2.*overscan),uv.y)).r;
    }
    void main(){
      vec2 uv=vec2(v.x,1.-v.y)*crop.xy+crop.zw;
      vec3 clean=texture2D(scene,uv).rgb,photo=texture2D(photograph,uv).rgb;
      // Native clean plate separates baked radiance without color inversion.
      // Only the source light footprint is retouched; unrelated terrain retains
      // the exact photograph. A broad feather avoids a fabricated valley cap.
      vec2 lightArea=(uv-vec2(.687,.755))/vec2(.12,.135);
      float plateFootprint=exp(-pow(lightArea.x,4.)-pow(lightArea.y,4.));
      vec3 base=mix(photo,clean,plateFootprint);
      // A modest display-footprint detail correction, bounded to stationary
      // terrain. This does not change the source asset or increase buffer size.
      vec3 nearby=(texture2D(scene,uv+vec2(displayTexel.x,0.)).rgb+texture2D(scene,uv-vec2(displayTexel.x,0.)).rgb+texture2D(scene,uv+vec2(0.,displayTexel.y)).rgb+texture2D(scene,uv-vec2(0.,displayTexel.y)).rgb)*.25;
      base=clamp(base+(base-nearby)*.18,0.,1.);
      float wind=.10*sin(time*.04);
      vec2 fieldUV=vec2((uv.x-wind+overscan)/(1.+2.*overscan),uv.y);
      vec3 sky=texture2D(cloudField,fieldUV).rgb;
      vec2 sun=sunPosition;
      vec2 delta=(uv-sun)*vec2(1.,.4);
      float disk=1.-smoothstep(.0125,.0145,length(delta));
      // GPU Gems 3 ch13: sample emitter visibility against a separate occluder
      // mask. Surface texture and arbitrary foliage patterns are not light rays.
      float scattering=0.,decay=1.;
      for(int i=0;i<24;i++){
        vec2 at=mix(uv,sun,(float(i)+.5)/24.);
        float emission=1.-smoothstep(.0125,.0145,length((at-sun)*vec2(1.,.4)));
        // Separate untextured terrain occlusion from the moving sky's radiance.
        // Surface/photo foliage never supplies the shaft pattern (ch13.5.1).
        vec2 movingAt=vec2((at.x-wind+overscan)/(1.+2.*overscan),at.y);
        float radiance=texture2D(cloudOcclusion,movingAt).r;
        scattering+=emission*(1.-land(at))*radiance*decay;decay*=.949;
      }
      float cloudTransmission=transmission(uv,wind);
      float sourceVisibility=emitterVisibility*transmission(sun,wind);
      sky=mix(sky,vec3(1.,.985,.86),disk*cloudTransmission);
      vec3 color=mix(sky,base,land(uv));
      // Ch13.3/13.5: in-scattered light is added after regular scene shading.
      // The green matte channel is distance below the photographed back ridge,
      // a bounded 2D air-depth proxy, not a claim of reconstructed scene depth.
      // Suppress near/low foreground leakage and wide scene exposure changes.
      float airDepth=1.-smoothstep(.25,1.,texture2D(terrain,uv).g);
      float emitterRange=1.-smoothstep(.05,.14,length(delta));
      // The source radiance plate moves with its emitter, independently of
      // stationary terrain. Low-pass its difference to avoid tree/rock streaks.
      vec2 lightUV=uv-vec2(0.,sun.y-.660);
      vec3 sourceLight=vec3(0.);
      for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++){
        vec2 sampleUV=lightUV+vec2(float(i),float(j))*vec2(2./1983.,2./793.);
        sourceLight+=max(texture2D(photograph,sampleUV).rgb-texture2D(scene,sampleUV).rgb,vec3(0.))/9.;
      }
      color+=sourceLight*plateFootprint*land(uv)*sourceVisibility;
      color+=vec3(1.,.65,.28)*scattering*.060*sourceVisibility*airDepth*emitterRange;
      gl_FragColor=vec4(clamp(color,0.,1.),1.);
    }`);
  const program=gl.createProgram();gl.attachShader(program,vertex);gl.attachShader(program,fragment);gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))return;
  gl.useProgram(program);const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
  const p=gl.getAttribLocation(program,'p');gl.enableVertexAttribArray(p);gl.vertexAttribPointer(p,2,gl.FLOAT,false,0,0);
  function texture(source,unit,name){const t=gl.createTexture();gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,t);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source);gl.uniform1i(gl.getUniformLocation(program,name),unit);return t;}
  const textures=[texture(image,0,'scene'),texture(field,1,'cloudField'),texture(matte,2,'terrain'),texture(cloudOcclusion,3,'cloudOcclusion'),texture(photographed,4,'photograph')];
  gl.uniform1f(gl.getUniformLocation(program,'overscan'),guard/w);
  const crop=gl.getUniformLocation(program,'crop'),time=gl.getUniformLocation(program,'time');
  let frame=0,visible=false,disposed=false,suspended=false,elapsed=0,last=0,lastPaint=0;
  screen.prepend(canvas);screen.dataset.clouds='ready';
  // Integrate the same elliptical emitter footprint used by the disk shader
  // against the source-bound ridge. Point visibility misses its partial setting.
  function diskVisibility(seconds){
    const position=emitterPosition(seconds),cx=position[0]*w,cy=position[1]*h;
    const rx=.0135*w,ry=.0135/.4*h;let visibleArea=0,totalArea=0;
    for(let i=0;i<128;i++){
      const u=(i+.5)/64-1,x=cx+rx*u,half=ry*Math.sqrt(Math.max(0,1-u*u));
      const column=Math.min(w-1,Math.max(0,Math.floor(x))),fraction=x-column;
      const edge=ridge[column]*(1-fraction)+ridge[Math.min(w-1,column+1)]*fraction;
      totalArea+=2*half;visibleArea+=Math.max(0,Math.min(2*half,edge-(cy-half)));
    }
    return visibleArea/totalArea;
  }
  const initialVisibility=diskVisibility(0),emitterVisibility=gl.getUniformLocation(program,'emitterVisibility');
  function paint(now=0){
    if(disposed)return;
    const rect=screen.getBoundingClientRect(),dpr=Math.min(2,devicePixelRatio||1),w=Math.round(rect.width*dpr),h=Math.round(rect.height*dpr);
    if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;gl.viewport(0,0,w,h);}
    const scale=Math.max(rect.width/image.width,rect.height/image.height),sx=rect.width/(scale*image.width),sy=rect.height/(scale*image.height);
    gl.uniform4f(crop,sx,sy,(1-sx)*.5,(1-sy)*.65);gl.uniform2f(gl.getUniformLocation(program,'displayTexel'),sx/rect.width,sy/rect.height);const position=emitterPosition(elapsed/1000);gl.uniform2f(gl.getUniformLocation(program,'sunPosition'),position[0],position[1]);gl.uniform1f(time,elapsed/1000);gl.uniform1f(emitterVisibility,diskVisibility(elapsed/1000)/initialVisibility);gl.drawArrays(gl.TRIANGLES,0,6);canvas.dataset.paintTime=elapsed.toFixed(1);canvas.dataset.sunY=position[1].toFixed(7);canvas.dataset.emitterVisibility=(diskVisibility(elapsed/1000)/initialVisibility).toFixed(7);lastPaint=now;
  }
  function allowed(){return visible&&!document.hidden&&!reduced.matches&&!document.body.classList.contains('is-standby')&&!disposed&&!suspended;}
  function tick(now){frame=0;if(!allowed()){last=0;return;}if(last)elapsed+=now-last;last=now;if(now-lastPaint>=45)paint(now);frame=requestAnimationFrame(tick);}
  function update(){if(!allowed()){cancelAnimationFrame(frame);frame=0;last=0;}else if(!frame)frame=requestAnimationFrame(tick);canvas.hidden=reduced.matches||disposed;}
  const intersection=new IntersectionObserver(entries=>{visible=entries.reduce((a,b)=>b.time>=a.time?b:a).isIntersecting;update();});intersection.observe(screen);
  const resize=new ResizeObserver(()=>paint());resize.observe(screen);
  const state=new MutationObserver(update);state.observe(document.body,{attributes:true,attributeFilter:['class']});
  document.addEventListener('visibilitychange',update);reduced.addEventListener('change',update);
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();disposed=true;update();});
  window.addEventListener('pageshow',()=>{suspended=false;update();});
  window.addEventListener('pagehide',event=>{if(event.persisted){suspended=true;update();return;}disposed=true;cancelAnimationFrame(frame);intersection.disconnect();resize.disconnect();state.disconnect();document.removeEventListener('visibilitychange',update);reduced.removeEventListener('change',update);gl.deleteBuffer(buffer);textures.forEach(t=>gl.deleteTexture(t));gl.deleteProgram(program);gl.deleteShader(vertex);gl.deleteShader(fragment);});
  paint();update();
}
