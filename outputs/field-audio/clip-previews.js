// One shared Three.js preview context. Idle cards cache an actual scene frame;
// only the hovered/focused or playing excerpt has a moving canvas.
export function createClipPreviews(container, { createScene, peaks, duration, reducedMotion, profile = null }) {
  const host = document.createElement('div'); host.className = 'clip-live'; host.setAttribute('aria-hidden', 'true');
  const zero = {bands:new Float32Array(32),rms:0,low:0,mid:0,high:0,air:0};
  const hoverSignal = {bands:new Float32Array(32),rms:0,low:0,mid:0,high:0,air:0};
  const pointerHover = matchMedia('(hover:hover)');
  let entries = [], hovered = null, focused = null, active = null, capture = null;
  let frame = null, hoverStart = 0, destroyed = false, visible = new Set();
  let transport = {playbackStatus:'idle'}, liveSignal = zero;
  const cache = new Map();
  const scene = createScene(host, {peaks,reducedMotion,onStatus:()=>{},onFrame:canvas => {
    if (!capture || canvas.width < 20 || !['settled','reduced'].includes(canvas.dataset.renderState)) return;
    const entry = capture; capture = null;
    const cached = document.createElement('canvas'); cached.width = canvas.width; cached.height = canvas.height;
    cached.getContext('2d').drawImage(canvas,0,0); cache.set(entry.key,cached);
    paintStill(entry,cached); host.remove(); queueSnapshot();
  }});
  function paintStill(entry, image) {
    entry.still.width = image.width; entry.still.height = image.height;
    entry.still.getContext('2d').drawImage(image,0,0);
    entry.art.dataset.previewReady = 'true';
  }
  function queueSnapshot() {
    if (destroyed || active || capture || document.hidden) return;
    const next = entries.find(e=>visible.has(e.art) && !cache.has(e.key));
    if (!next) { host.remove(); return; }
    capture = next; next.art.append(host);
    scene.setSelection(next.clip.start,next.clip.end,duration);
    scene.setSpectrum(zero); scene.setPlayback(next.clip.start,false);
  }
  function candidate() {
    if (['playing','starting'].includes(transport.playbackStatus) && transport.playbackMode === 'selection')
      return entries.find(e=>isSavedInterval(e)) || null;
    return entries.find(e=>e.clip.id === (hovered || focused)) || null;
  }
  function isSavedInterval(entry) {
    return entry.clip.id === transport.activeId &&
      Math.abs(entry.clip.start-(transport.selection?.start??-1))<.000001 &&
      Math.abs(entry.clip.end-(transport.selection?.end??-1))<.000001;
  }
  function reconcile() {
    if (destroyed) return;
    const wanted = candidate();
    if (wanted !== active) {
      if (active) active.art.dataset.previewMode = 'still';
      active = wanted; capture = null; hoverStart = performance.now();
      if (active) {
        active.art.append(host); scene.setSelection(active.clip.start,active.clip.end,duration);
      } else {
        scene.setSpectrum(zero); scene.setPlayback(0,false); queueSnapshot();
      }
    }
    if (active && visible.has(active.art) && !document.hidden && !reducedMotion) request();
    else { if(frame !== null) cancelAnimationFrame(frame);frame = null;scene.setPlayback(0,false);queueSnapshot(); }
  }
  function request(){if(frame === null)frame=requestAnimationFrame(tick);}
  function tick(stamp) {
    frame = null;
    if (!active || destroyed || document.hidden || reducedMotion || !visible.has(active.art)) return;
    const isLive = transport.playbackStatus === 'playing' && transport.playbackMode === 'selection' && isSavedInterval(active);
    let time;
    if (isLive) {
      time = transport.currentTime; scene.setSpectrum(liveSignal); active.art.dataset.previewMode = 'live-audio';
    } else if (profile?.frames?.length) {
      time = active.clip.start + ((stamp-hoverStart)/1000) % (active.clip.end-active.clip.start);
      const position = Math.max(0,Math.min(profile.frames.length-1,time*profile.fps));
      const lo = Math.floor(position), blend = position-lo;
      const a=profile.frames[lo],b=profile.frames[Math.min(lo+1,profile.frames.length-1)];
      for(let i=0;i<32;i++)hoverSignal.bands[i]=a[i+1]*(1-blend)+b[i+1]*blend;
      hoverSignal.rms=a[0]*(1-blend)+b[0]*blend;
      const average=(start,end)=>{let value=0,count=0;for(let i=0;i<32;i++){const hz=50*(8000/50)**((i+.5)/32);if(hz>=start&&hz<end){value+=hoverSignal.bands[i];count++;}}return value/Math.max(1,count);};
      hoverSignal.low=average(50,250);hoverSignal.mid=average(250,1600);hoverSignal.high=average(1600,6000);hoverSignal.air=average(6000,8001);
      scene.setSpectrum(hoverSignal); active.art.dataset.previewMode = 'silent-audio-preview';
    } else {
      scene.setSpectrum(zero);scene.setPlayback(0,false);active.art.dataset.previewMode='still';return;
    }
    scene.setPlayback(time,true); request();
  }
  const observer = new IntersectionObserver(changes=>{
    for(const change of changes) { if(change.isIntersecting)visible.add(change.target);else visible.delete(change.target); }
    reconcile();queueSnapshot();
  });
  function clipId(event) { return event.target.closest('[data-clip]')?.dataset.clip; }
  const over = event=>{if(!pointerHover.matches || event.pointerType==='touch')return;const id=clipId(event);if(id && id!==hovered){hovered=id;reconcile();}};
  const out = event=>{const id=clipId(event),next=event.relatedTarget?.closest?.('[data-clip]')?.dataset.clip;if(id===hovered&&next!==id){hovered=null;reconcile();}};
  const focus = event=>{focused=clipId(event)||null;reconcile();};
  const blur = event=>{focused=event.relatedTarget?.closest?.('[data-clip]')?.dataset.clip||null;reconcile();};
  const visibility=()=>reconcile();
  container.addEventListener('pointerover',over);container.addEventListener('pointerout',out);
  container.addEventListener('focusin',focus);container.addEventListener('focusout',blur);
  document.addEventListener('visibilitychange',visibility);
  return {
    refresh(clips) {
      observer.disconnect();visible.clear();active=null;capture=null;hovered=null;focused=null;host.remove();
      entries=clips.map(clip=>{
        const art=[...container.querySelectorAll('.clip-art')].find(e=>e.dataset.clip===clip.id);
        if(!art)return null;
        const entry={clip,art,still:art.querySelector('canvas'),key:JSON.stringify([clip.id,clip.start,clip.end])};
        if(cache.has(entry.key))paintStill(entry,cache.get(entry.key));
        observer.observe(art);return entry;
      }).filter(Boolean);
      // Drop snapshots whose excerpt was removed or changed.
      const keys=new Set(entries.map(e=>e.key));for(const key of cache.keys())if(!keys.has(key))cache.delete(key);
      reconcile();
    },
    update(state,signal) { transport=state;liveSignal=signal||zero;reconcile(); },
    setProfile(next){profile=next;reconcile();},
    destroy(){destroyed=true;if(frame!==null)cancelAnimationFrame(frame);observer.disconnect();scene.destroy();host.remove();cache.clear();
      container.removeEventListener('pointerover',over);container.removeEventListener('pointerout',out);container.removeEventListener('focusin',focus);container.removeEventListener('focusout',blur);document.removeEventListener('visibilitychange',visibility);},
  };
}
