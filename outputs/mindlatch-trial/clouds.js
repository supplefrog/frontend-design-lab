// Slow drift of the existing sky; the horizon, mountains and sun stay fixed.
export async function mountClouds(){
  const screen=document.querySelector('.replay-screen');
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const canvas=document.createElement('canvas');canvas.className='cloud-sky';canvas.setAttribute('aria-hidden','true');
  const gl=canvas.getContext('webgl',{alpha:false,antialias:false,powerPreference:'low-power'});if(!gl)return;
  const image=new Image();image.src=new URL('./assets/replay-landscape.png',import.meta.url).href;
  try{await image.decode();}catch{return;}
  const shader=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error('Cloud shader unavailable');return s;};
  const vertex=shader(gl.VERTEX_SHADER,'attribute vec2 p;varying vec2 v;void main(){v=(p+1.)*.5;gl_Position=vec4(p,0.,1.);}');
  const fragment=shader(gl.FRAGMENT_SHADER,`precision highp float;varying vec2 v;uniform sampler2D scene;uniform vec4 crop;uniform float time;
    void main(){vec2 uv=vec2(v.x,1.-v.y)*crop.xy+crop.zw;
      float sky=1.-smoothstep(.40,.50,uv.y);
      float drift=.009*(sin(time*.035+uv.y*1.8)-sin(uv.y*1.8))+.004*(sin(time*.071+uv.y*5.)-sin(uv.y*5.));
      uv.x=clamp(uv.x+drift*sky,0.,1.);gl_FragColor=texture2D(scene,uv);}`);
  const program=gl.createProgram();gl.attachShader(program,vertex);gl.attachShader(program,fragment);gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))return;
  gl.useProgram(program);const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
  const p=gl.getAttribLocation(program,'p');gl.enableVertexAttribArray(p);gl.vertexAttribPointer(p,2,gl.FLOAT,false,0,0);
  const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);
  const crop=gl.getUniformLocation(program,'crop'),time=gl.getUniformLocation(program,'time');
  let frame=0,visible=false,disposed=false,elapsed=0,last=0,lastPaint=0;
  screen.prepend(canvas);screen.dataset.clouds='ready';
  function paint(now=0){
    if(disposed)return;
    const rect=screen.getBoundingClientRect(),dpr=Math.min(2,devicePixelRatio||1),w=Math.round(rect.width*dpr),h=Math.round(rect.height*dpr);
    if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;gl.viewport(0,0,w,h);}
    const scale=Math.max(rect.width/image.width,rect.height/image.height),sx=rect.width/(scale*image.width),sy=rect.height/(scale*image.height);
    gl.uniform4f(crop,sx,sy,(1-sx)*.5,(1-sy)*.65);gl.uniform1f(time,elapsed/1000);gl.drawArrays(gl.TRIANGLES,0,6);canvas.dataset.paintTime=elapsed.toFixed(1);lastPaint=now;
  }
  function allowed(){return visible&&!document.hidden&&!reduced.matches&&!document.body.classList.contains('is-standby')&&!disposed;}
  function tick(now){frame=0;if(!allowed()){last=0;return;}if(last)elapsed+=Math.min(100,now-last);last=now;if(now-lastPaint>=45)paint(now);frame=requestAnimationFrame(tick);}
  function update(){if(!allowed()){cancelAnimationFrame(frame);frame=0;last=0;}else if(!frame)frame=requestAnimationFrame(tick);canvas.hidden=reduced.matches||disposed;}
  const intersection=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;update();});intersection.observe(screen);
  const resize=new ResizeObserver(()=>paint());resize.observe(screen);
  const state=new MutationObserver(update);state.observe(document.body,{attributes:true,attributeFilter:['class']});
  document.addEventListener('visibilitychange',update);reduced.addEventListener('change',update);
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();canvas.hidden=true;disposed=true;cancelAnimationFrame(frame);});
  window.addEventListener('pagehide',()=>{disposed=true;cancelAnimationFrame(frame);intersection.disconnect();resize.disconnect();state.disconnect();document.removeEventListener('visibilitychange',update);reduced.removeEventListener('change',update);gl.deleteBuffer(buffer);gl.deleteTexture(texture);gl.deleteProgram(program);gl.deleteShader(vertex);gl.deleteShader(fragment);},{once:true});
  paint();update();
}
