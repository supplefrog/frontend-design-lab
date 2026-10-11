import {createNotesCore} from './notes-core.js?v=0187918e5d0e';

const $=id=>document.getElementById(id), core=createNotesCore(), reduced=matchMedia('(prefers-reduced-motion: reduce)');
let state=core.getState(), view='capture', selected=state.notes[0]?.id, a=state.notes[0]?.id, b=state.notes[2]?.id, slot='b', pairMode='suggest', breadth=65, filter='all', replayMode='latest', replayIndex=0, playing=false, powered=true, timer=0, morphFrame=0, morph=0, lastDeletedId=null;
let destination=null;
const drafts=new Map();
let deletedEditor=null,lastSavedId=null,inputEpoch=0;
const libraryNodes=new Map();
const pairMarkup=new Map();
const candidateNodes=new Map();let candidateEmpty=null;
let replayMotion=null,replaySignature=null,replayVisibleId=null;
let controlsRenderer=null, pageClosed=false, pageSuspended=false;
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const note=id=>state.notes.find(n=>n.id===id), summary=n=>n.text.replace(/^Sample note:\s*/,'').split('\n')[0], tags=n=>n.tags.map(t=>`<span class="tag">#${esc(t)}</span>`).join('');
const date=n=>new Date(n.updatedAt).toLocaleDateString(undefined,{month:'short',day:'numeric'});
const linked=(x,y)=>state.links.some(p=>p.includes(x)&&p.includes(y));
function announce(text){$('status-text').textContent=text;restartStatusScroll();}
const statusText=$('status-text');
let statusFrame=0,statusVisible=false,statusReading=false;
function restartStatusScroll(){
  cancelAnimationFrame(statusFrame);statusFrame=0;
  if(statusReading)return;
  statusText.scrollLeft=0;
  const distance=statusText.scrollWidth-statusText.clientWidth;
  if(distance<=1||!statusVisible||!powered||reduced.matches||document.hidden||pageSuspended)return;
  const pause=1400,travel=distance/22*1000,cycle=pause*2+travel,start=performance.now();
  function slide(now){
    const elapsed=(now-start)%cycle;
    statusText.scrollLeft=elapsed<pause?0:Math.min(distance,(elapsed-pause)/travel*distance);
    statusFrame=requestAnimationFrame(slide);
  }
  statusFrame=requestAnimationFrame(slide);
}
function readingStatus(){statusReading=statusText.matches(':hover')||statusText===document.activeElement;restartStatusScroll();}
for(const event of ['mouseenter','mouseleave','focus','blur'])statusText.addEventListener(event,readingStatus);
const statusVisibility=new IntersectionObserver(entries=>{statusVisible=entries[0].isIntersecting;restartStatusScroll();});
statusVisibility.observe(statusText);
const statusSize=new ResizeObserver(restartStatusScroll);statusSize.observe(statusText);
const tableColors={pink:'#ea7fa9',yellow:'#ffe69a'};
function chooseTable(color,save=false){
  if(!Object.hasOwn(tableColors,color))return;
  document.documentElement.dataset.table=color;
  document.documentElement.style.setProperty('--pink-backdrop',tableColors[color]);
  for(const ball of document.querySelectorAll('[data-table-background]'))ball.setAttribute('aria-pressed',String(ball.dataset.tableBackground===color));
  if(save){try{localStorage.setItem('mindlatch.table-background',color);}catch{}announce(color==='pink'?'Pink table.':'Butter yellow table.');}
}
chooseTable(document.documentElement.dataset.table||'pink');
for(const ball of document.querySelectorAll('[data-table-background]'))ball.addEventListener('click',()=>chooseTable(ball.dataset.tableBackground,true));
// Keep the fitted display fixed while allowing the full message to be read.
$('status-text').addEventListener('keydown',event=>{
  if(event.key==='Home'||event.key==='End'){
    event.preventDefault();$('status-text').scrollLeft=event.key==='Home'?0:$('status-text').scrollWidth;
  }
});
function decorativeClone(root){
  root.inert=true;root.setAttribute('aria-hidden','true');
  for(const el of root.querySelectorAll('*'))for(const attr of ['id','for','aria-labelledby','aria-describedby','aria-controls','aria-activedescendant','aria-owns','aria-details','aria-errormessage'])el.removeAttribute(attr);
  return root;
}
function result(r,success){if(!r.ok){announce(r.error);return false;}announce(state.storage.mode==='session'?`${success} Kept in this session only.`:success);return true;}
function draftFor(id){const n=note(id);return drafts.get(id)||{text:n?.text||'',tags:n?.tags.join(', ')||''};}
function draftStatus(){
  const kept=drafts.has(selected),deleted=!note(selected)&&deletedEditor?.id===selected;
  $('edit-draft-text').textContent=kept?(deleted?'Deleted note. Unsaved changes are kept; Undo restores them.':'Unsaved changes are kept while you move around.'):'';
  editorMeta();
}
function stashEditor(){if(!selected||$('edit-form').hidden)return;const n=note(selected);if(!n)return;const d={text:$('edit-text').value,tags:$('edit-tags').value};if(d.text!==n.text||d.tags!==n.tags.join(', ')){drafts.set(selected,d);lastSavedId=null;}else drafts.delete(selected);draftStatus();}
function editor(){
  const n=note(selected),deleted=!n&&deletedEditor?.id===selected?deletedEditor:null;
  // The empty state occupies the same live editor cavity, with read-only fields.
  $('edit-form').hidden=false;$('editor-empty').hidden=true;
  const d=deleted?(drafts.get(selected)||{text:deleted.text,tags:deleted.tags.join(', ')}):draftFor(selected);
  $('edit-text').value=d.text;$('edit-tags').value=d.tags;
  $('edit-text').placeholder=n||deleted?'':'Choose a note to open it here.';
  for(const id of ['edit-text','edit-tags'])$(id).readOnly=!n;
  $('edit-error').textContent='';draftStatus();
}
function editorMeta(){
  const n=note(selected),deleted=!n&&deletedEditor?.id===selected?deletedEditor:null,shown=n||deleted,dirty=drafts.has(selected),saved=n&&lastSavedId===selected&&!dirty;
  $('note-date').textContent=deleted?'DELETED':dirty?'UNSAVED':n?`${date(n)}${n.sample?' · SAMPLE':''}`:'NO NOTE';
  $('note-date').title=n?`${date(n)}${n.sample?' · SAMPLE':''}`:'';
  $('favorite').setAttribute('aria-pressed',String(!!shown?.favorite));$('favorite').textContent=shown?.favorite?'★ FAVORITE':'☆ FAVORITE';$('favorite').disabled=!n;
  $('edit-save').disabled=!n;$('edit-save-label').textContent=deleted?'DELETED':saved?'SAVED ✓':'SAVE NOTE';
  $('edit-save').setAttribute('aria-label',deleted?'Note deleted. Undo is available.':saved?'Save note. Current changes are saved.':'Save note');
  $('delete').disabled=!shown;$('delete-label').textContent=deleted?'UNDO':'DELETE';$('delete').setAttribute('aria-label',deleted?'Undo deletion of this note':'Delete this note');
}
// Navigation owns only necessary travel. Retarget from the actual scroll pose;
// a wheel, touch or navigation key hands control back to the reader immediately.
let travel=0, modeFrame=0, modeFinish=0, manualNavigation=false;
const bench=document.querySelector('.workbench'),rail=document.querySelector('.rail');
function indicate(next){document.querySelectorAll('[data-view]').forEach(btn=>{if(btn.dataset.view===next)btn.setAttribute('aria-current','page');else btn.removeAttribute('aria-current');});}
function visibleContext(){
  if(view==='library')return 'library';
  const entries=[['capture',document.querySelector('.capture-pad')],['pair',$('pair-panel')],['replay',$('replay-deck')]];
  const line=Math.min(innerHeight*.4,240);
  return entries.reduce((best,[id,el])=>{const r=el.getBoundingClientRect(),distance=r.top>line?r.top-line:r.bottom<line?line-r.bottom:0;return !best||distance<best.distance?{id,distance}:best;},null).id;
}
function stopTravel(){cancelAnimationFrame(travel);travel=0;manualNavigation=true;indicate(visibleContext());}
function reveal(el){
  cancelAnimationFrame(travel);travel=0;manualNavigation=false;indicate(destination);
  const r=el.getBoundingClientRect(),needed=Math.min(r.height,innerHeight-32);
  if(r.top>=16&&r.top+needed<=innerHeight-16)return;
  const start=scrollY,target=Math.max(0,Math.min(document.documentElement.scrollHeight-innerHeight,start+r.top-(r.top<16||r.height>innerHeight-32?16:innerHeight-16-needed)));
  if(Math.abs(target-start)<1)return;
  if(reduced.matches){scrollTo({top:target,behavior:'instant'});return;}
  const began=performance.now(),duration=Math.min(680,340+Math.abs(target-start)*.18);
  function step(now){const t=Math.min(1,(now-began)/duration),ease=t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;scrollTo({top:start+(target-start)*ease,behavior:'instant'});if(t<1)travel=requestAnimationFrame(step);else travel=0;}
  travel=requestAnimationFrame(step);
}
let modeReveal=null, modeSerial=0, studyCaptureHeight=0;
function modeElements(next){return [[$('capture-view'),next!=='library'],[$('library-view'),next==='library'],[$('pair-controls'),next!=='library']];}
function settleMode(){
  cancelAnimationFrame(modeFrame);modeFrame=0;clearTimeout(modeFinish);
  bench.classList.add('mode-measuring');
  for(const el of [bench,rail,$('main'),...modeElements(view).map(([el])=>el)])for(const animation of el.getAnimations())if(animation instanceof CSSTransition)animation.cancel();
  for(const [el,active]of modeElements(view)){
    el.hidden=!active;el.inert=!active;el.classList.toggle('mode-active',active);el.classList.remove('mode-leaving');
    for(const key of ['opacity','transform','top','left','width','height'])el.style.removeProperty(key);
  }
  $('main').style.height='';$('main').style.marginRight='';$('main').style.removeProperty('--mode-progress');
  bench.style.height='';bench.style.gridTemplateColumns='';rail.style.height='';bench.classList.remove('mode-changing');$('pair-controls-slot').hidden=view==='library';
  bench.getBoundingClientRect();bench.classList.remove('mode-measuring');
  controlsRenderer?.refresh?.();
  const target=modeReveal;modeReveal=null;if(target&&!manualNavigation)reveal(target);
}
// Layout styles use local CSS units; viewport geometry includes instrument zoom.
function layoutRect(el){const rect=el.getBoundingClientRect(),scale=parseFloat(getComputedStyle(document.querySelector('.instrument')).zoom)||1;return {width:rect.width/scale,height:rect.height/scale};}
function changeMode(next){
  if(view===next)return;
  const main=$('main'),ctrl=$('pair-controls'),slot=$('pair-controls-slot'),elements=modeElements(next),box=layoutRect(bench);
  if(view==='capture'&&!bench.classList.contains('mode-changing'))studyCaptureHeight=layoutRect(main).height;
  // Read the presented pose before retargeting, including an interrupted change.
  const start={progress:bench.classList.contains('mode-changing')?parseFloat(getComputedStyle(main).getPropertyValue('--mode-progress')):(view==='library'?1:0),height:layoutRect(main).height,bench:box.height,rail:layoutRect(rail).height,grid:getComputedStyle(bench).gridTemplateColumns,margin:getComputedStyle(main).marginRight,ctrl:layoutRect(ctrl)};
  const ink=elements.map(([el])=>({el,opacity:'1',transform:el.id==='pair-controls'?(el.hidden?'translateX(100%)':getComputedStyle(el).transform):'none',rect:layoutRect(el)}));
  const serial=++modeSerial;
  clearTimeout(modeFinish);cancelAnimationFrame(modeFrame);
  // Measure the actual final layout at its final width and with only its live
  // in-flow content. scrollHeight at the old grid width is not this endpoint.
  bench.classList.add('mode-measuring');bench.classList.remove('mode-changing');
  bench.style.height='';bench.style.gridTemplateColumns='';rail.style.height='';main.style.height='';main.style.marginRight='';
  slot.hidden=next==='library';for(const [el,active]of elements){el.hidden=!active;for(const key of ['top','left','width','height'])el.style.removeProperty(key);}
  view=next;bench.dataset.mode=next;
  const finalBox=layoutRect(bench);
  const end={width:layoutRect(main).width,height:layoutRect(main).height,bench:finalBox.height,rail:layoutRect(rail).height,grid:getComputedStyle(bench).gridTemplateColumns,margin:getComputedStyle(main).marginRight,ctrl:layoutRect(ctrl),panels:new Map(elements.map(([el])=>[el,layoutRect(el)]))};
  if(next==='capture')studyCaptureHeight=end.height;
  if(next==='library'&&matchMedia('(max-width:780px)').matches){
    const regions=[['list',$('note-list'),44],['text',$('edit-text'),100],['connected',$('connected-list'),44]];
    const dimensions=regions.map(([name,el,min])=>({name,height:layoutRect(el).height,min}));
    const capacity=dimensions.reduce((sum,r)=>sum+Math.max(0,r.height-r.min),0),need=Math.max(0,end.height-(studyCaptureHeight||start.height)),fraction=Math.min(1,need/capacity);
    for(const r of dimensions){main.style.setProperty('--study-'+r.name+'-end',r.height+'px');main.style.setProperty('--study-'+r.name+'-start',(r.height-(r.height-r.min)*fraction)+'px');}
  }
  slot.hidden=false;
  for(const [el,active]of elements){
    if(!active&&el.contains(document.activeElement))document.querySelector(`[data-view="${next}"]`)?.focus({preventScroll:true});
    el.inert=!active;el.hidden=false;el.classList.toggle('mode-active',active);el.classList.toggle('mode-leaving',!active);
  }
  bench.classList.add('mode-changing');bench.style.height=`${start.bench}px`;bench.style.gridTemplateColumns=start.grid;rail.style.height=`${start.rail}px`;
  main.style.height=`${start.height}px`;main.style.marginRight=start.margin;main.style.setProperty('--mode-progress',String(start.progress));
  // Both paper surfaces share the changing cavity width and one progress owner.
  // The side assembly retains its mounted width while its allocation closes.
  for(const {el,opacity,transform,rect}of ink){
    const active=elements.find(([node])=>node===el)[1],layout=active?end.panels.get(el):rect;
    if(el.id==='pair-controls'&&layout.width){el.style.width=`${layout.width}px`;el.style.height=`${layout.height}px`;}
    el.style.opacity=opacity;el.style.transform=transform;
  }
  const controlWidth=(next!=='library'?end.ctrl:start.ctrl).width;
  if(controlWidth)ctrl.style.width=`${controlWidth}px`;
  main.getBoundingClientRect();bench.classList.remove('mode-measuring');main.getBoundingClientRect();
  bench.style.height=`${end.bench}px`;bench.style.gridTemplateColumns=end.grid;rail.style.height=`${end.rail}px`;main.style.height=`${end.height}px`;main.style.marginRight=end.margin;main.style.setProperty('--mode-progress',next==='library'?'1':'0');
  for(const {el}of ink){el.style.opacity='';el.style.transform='';}
  if(reduced.matches){settleMode();return;}
  // One completion owner. The renderer has its own dirty/resize scheduling;
  // repeatedly demanding it from a layout rAF adds an unrelated frame owner.
  main.getBoundingClientRect();
  const transitions=[bench,rail,main,...elements.map(([el])=>el)].flatMap(el=>el.getAnimations()).filter(a=>a instanceof CSSTransition);
  Promise.all(transitions.map(a=>a.finished.catch(()=>{}))).then(()=>{if(serial===modeSerial)settleMode();});
}
function navigate(next,skipStash=false,historyMode='push'){
  // Settle the accepted selection before any later route takes ownership.
  clearInk();
  const same=destination===next&&(!manualNavigation||next==='library'), nextView=next==='library'?'library':'capture';
  if(!skipStash)stashEditor();
  if(nextView==='library'){library();editor();connections();}
  // A repeated current command preserves an already-owned travel trajectory.
  // Manual movement clears `same`, so a later explicit destination can reveal.
  if(same&&nextView===view){indicate(destination);return;}
  const changed=view!==nextView;manualNavigation=false;cancelAnimationFrame(travel);travel=0;changeMode(nextView);destination=next;
  if(historyMode&&location.hash!==`#${next}`)history[historyMode==='replace'?'replaceState':'pushState'](null,'',`#${next}`);
  const target=next==='pair'?$('pair-panel'):next==='replay'?$('replay-deck'):next==='library'?$('library-view'):document.querySelector('.capture-pad');indicate(destination);if(bench.classList.contains('mode-changing')&&!reduced.matches)modeReveal=target;else if(!(same&&next==='library'))reveal(target);
  if(next==='pair'&&!same)announce('Select a note object, then choose a related idea.');
}
// One transition owns the actual painted ink. Never copy live form controls
// or remove styling IDs. A retarget commits pending state before capturing again.
let inkTransition=null;
function clearInk(){
  const current=inkTransition;if(!current)return;
  const focused=document.activeElement,editing=current.el.contains(focused)&&focused.matches('input,textarea');
  current.commit();if(editing&&focused.isConnected)focused.focus({preventScroll:true});
  current.transition?.skipTransition();current.animation?.cancel();
  current.el.style.removeProperty('view-transition-name');
  inkTransition=null;
}
function replaceInk(el,update,animate=true){
  clearInk();
  if(!animate||reduced.matches){update();return;}
  const current={el,committed:false,transition:null,animation:null,update,commit(){if(this.committed)return;this.committed=true;this.update();}};
  inkTransition=current;
  function finish(){if(inkTransition!==current)return;el.style.removeProperty('view-transition-name');inkTransition=null;}
  // Stable live content keeps ordinary hit testing and typing available even
  // while an exit is interrupted. Commit once at the unreadable boundary.
  current.animation=el.animate([{opacity:1},{opacity:0}],{duration:90,easing:'ease-out',fill:'forwards'});
  current.animation.finished.then(()=>{
    if(inkTransition!==current)return;current.commit();current.animation.cancel();
    current.animation=el.animate([{opacity:0},{opacity:1}],{duration:150,easing:'ease-out'});
    current.animation.finished.then(finish,finish);
  }).catch(()=>{});
}
function openNote(id){
  if(!note(id))return;
  clearInk();stashEditor();const ownership=inputEpoch,form=$('edit-form'),changed=selected!==id,animate=view==='library'&&!form.hidden&&changed;
  if(view!=='library')navigate('library',true);
  replaceInk(form,()=>{
    deletedEditor=null;selected=id;editor();library();connections();
    // A later Tab, pointer or wheel owns focus and use position. Selection still commits.
    if(ownership===inputEpoch){
      if(changed&&matchMedia('(max-width:780px)').matches)reveal(form);
      if(document.documentElement.dataset.input==='keyboard')$('edit-text').focus({preventScroll:true});
      else{form.tabIndex=-1;form.focus({preventScroll:true});}
    }
  },animate);
}
// Manual interaction owns use position before delayed route revelation. Tab
// settles the live drawer before default focus can land in clipped ink. Pointer
// input retains the hit-tested node rather than moving it before pointerup.
document.addEventListener('keydown',event=>{
  if(!event.isTrusted||!bench.classList.contains('mode-changing'))return;
  if(event.key==='Tab') { modeReveal=null;stopTravel(); }
  else if($('main').contains(event.target)) { modeReveal=null;stopTravel(); }
},true);
document.addEventListener('pointerdown',event=>{
  if(event.isTrusted&&bench.classList.contains('mode-changing')&&$('main').contains(event.target)){modeReveal=null;stopTravel();}
},true);
for(const type of ['wheel','touchstart'])window.addEventListener(type,stopTravel,{passive:true});
window.addEventListener('pointerdown',()=>{if(travel)stopTravel();},{passive:true});
window.addEventListener('keydown',e=>{if(['ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' '].includes(e.key)&&!e.target.matches('input,textarea,[role=slider]'))stopTravel();});
window.addEventListener('scroll',()=>{if(!travel&&manualNavigation)indicate(visibleContext());},{passive:true});
function fragment(){const next=location.hash.slice(1);if(['capture','library','pair','replay'].includes(next))navigate(next,false,false);}
// Back/forward and native fragments both change this hash; one owner avoids
// applying the same route twice when the browser emits popstate + hashchange.
window.addEventListener('hashchange',fragment);
function library(){
  const q=$('search').value.trim().toLocaleLowerCase();const list=[...state.notes].sort((x,y)=>y.updatedAt.localeCompare(x.updatedAt)).filter(n=>(filter!=='favorites'||n.favorite)&&(filter!=='connected'||state.links.some(p=>p.includes(n.id)))&&(!q||`${n.text} ${n.tags.join(' ')}`.toLocaleLowerCase().includes(q)));
  $('note-count').textContent=`${state.notes.length} NOTES`;
  const container=$('note-list'),ids=new Set(list.map(n=>n.id));
  for(const [id,node]of libraryNodes)if(!ids.has(id)){node.remove();libraryNodes.delete(id);}
  container.querySelector('.empty-state')?.remove();
  let cursor=container.firstElementChild;
  for(const n of list){
    let row=libraryNodes.get(n.id);
    if(!row){row=document.createElement('button');row.className='note-row';row.dataset.open=n.id;row.innerHTML='<b></b><small></small>';libraryNodes.set(n.id,row);}
    row.setAttribute('aria-current',String(selected===n.id));
    row.querySelector('b').textContent=summary(n);row.querySelector('small').textContent=`${n.favorite?'★ · ':''}${n.tags.map(t=>'#'+t).join(' ')}${n.sample?' · SAMPLE':''}${drafts.has(n.id)?' · DRAFT':''}`;
    // Unchanged rows remain connected: a subsequent native Tab retains its node.
    if(row===cursor)cursor=cursor.nextElementSibling;else container.insertBefore(row,cursor);
  }
  if(!list.length){const empty=document.createElement('p');empty.className='empty-state';empty.textContent=state.notes.length?'No notes match. Try another search or filter.':'Your library is empty. Catch a thought to begin.';container.append(empty);}
}
function connections(){const related=state.links.filter(p=>p.includes(selected)).map(p=>note(p.find(id=>id!==selected))).filter(Boolean);$('connected-list').innerHTML=related.length?related.map(n=>`<article class="related-card"><button data-open="${esc(n.id)}">${esc(summary(n))}</button><p>${n.tags.map(t=>'#'+esc(t)).join(' ')}</p><button class="unlink" data-unlink="${esc(n.id)}">UNLINK</button></article>`).join(''):'<p class="empty-state">No links yet. Pair this thought with another note.</p>';$('link-existing').disabled=!note(selected)||state.notes.length<2;}
function settleCandidates(){for(const [id,entry]of candidateNodes){entry.animation?.cancel();entry.animation=null;if(entry.exiting){entry.node.remove();candidateNodes.delete(id);}}}
function renderCandidates(candidates,animate){
  const container=$('candidates');
  if(!candidateEmpty){candidateEmpty=document.createElement('p');candidateEmpty.className='micro';candidateEmpty.textContent='No matches here. Widen the range or choose all notes.';candidateEmpty.hidden=true;container.append(candidateEmpty);container.style.position='relative';}
  const ids=candidates.map(n=>n.id),selectedId=slot==='a'?a:b;
  const current=Array.from(container.children).filter(n=>n.dataset.candidate&&!n.inert).map(n=>n.dataset.candidate);
  const same=current.length===ids.length&&current.every((id,i)=>id===ids[i]);
  const sameText=candidates.every(n=>candidateNodes.get(n.id)?.node.textContent===summary(n));
  if(same&&sameText){if(candidateEmpty.hidden!==!!ids.length)candidateEmpty.hidden=!!ids.length;for(const n of candidates){const el=candidateNodes.get(n.id).node,value=String(n.id===selectedId);if(el.getAttribute('aria-pressed')!==value)el.setAttribute('aria-pressed',value);}return;}
  const paint=new Map();for(const [id,entry]of candidateNodes){if(entry.node.isConnected)paint.set(id,{box:entry.node.getBoundingClientRect(),clip:getComputedStyle(entry.node).clipPath});entry.animation?.cancel();entry.animation=null;}
  const viewport=container.getBoundingClientRect(),wanted=new Set(ids);
  // A changed eligibility/order starts at its first match. Sampled geometry carries
  // painted survivors there continuously; identical lists retain manual scrolling.
  container.scrollTop=0;container.scrollLeft=0;
  for(const [id,entry]of candidateNodes){if(wanted.has(id))continue;const visual=paint.get(id);if(!visual){entry.node.remove();candidateNodes.delete(id);continue;}entry.exiting=true;entry.node.inert=true;entry.node.setAttribute('aria-hidden','true');entry.node.tabIndex=-1;Object.assign(entry.node.style,{position:'absolute',left:`${visual.box.left-viewport.left}px`,top:`${visual.box.top-viewport.top}px`,width:`${visual.box.width}px`,height:`${visual.box.height}px`,pointerEvents:'none'});}
  candidateEmpty.hidden=!!ids.length;
  for(const n of candidates){let entry=candidateNodes.get(n.id);if(!entry){const node=document.createElement('button');node.type='button';node.dataset.candidate=n.id;entry={node,animation:null,exiting:false};node.addEventListener('focus',()=>{if(document.documentElement.dataset.input==='keyboard'){entry.animation?.cancel();entry.animation=null;}});node.addEventListener('pointerdown',event=>{if(event.button!==0||!entry.animation)return;const held=entry.animation;held.pause();const release=()=>{document.removeEventListener('pointerup',release,true);document.removeEventListener('pointercancel',release,true);if(entry.animation===held)held.play();};document.addEventListener('pointerup',release,true);document.addEventListener('pointercancel',release,true);});candidateNodes.set(n.id,entry);}const el=entry.node;entry.exiting=false;el.inert=false;el.removeAttribute('aria-hidden');el.removeAttribute('tabindex');el.style.cssText='';if(el.textContent!==summary(n))el.textContent=summary(n);const value=String(n.id===selectedId);if(el.getAttribute('aria-pressed')!==value)el.setAttribute('aria-pressed',value);}
  for(let i=0;i<ids.length;i++){const node=candidateNodes.get(ids[i]).node,active=Array.from(container.children).filter(n=>n.dataset.candidate&&!n.inert);if(active[i]!==node)container.insertBefore(node,active[i]||null);}
  const motion=animate&&!reduced.matches;
  // These are live paper controls, not translucent copies of their ink. Keep the
  // incoming controls usable immediately; outgoing cards withdraw behind them.
  for(const [id,entry]of candidateNodes){const el=entry.node,visual=paint.get(id),clip=visual?.clip&&visual.clip!=='none'?visual.clip:'inset(0% 0% 0% 0%)';if(entry.exiting){if(!motion){el.remove();candidateNodes.delete(id);continue;}const animation=el.animate([{clipPath:clip,transform:'translateY(0)'},{clipPath:'inset(0% 0% 100% 0%)',transform:'translateY(-5px)'}],{duration:170,easing:'ease-out'});entry.animation=animation;animation.finished.then(()=>{if(entry.animation===animation&&entry.exiting){el.remove();candidateNodes.delete(id);}}).catch(()=>{});continue;}
    const target=el.getBoundingClientRect(),dx=visual?visual.box.left-target.left:0,dy=visual?visual.box.top-target.top:5;
    if(motion&&el!==document.activeElement&&(Math.abs(dx)>.1||Math.abs(dy)>.1||clip!=='inset(0% 0% 0% 0%)')){const animation=el.animate([{clipPath:clip,transform:`translate(${dx}px,${dy}px)`},{clipPath:'inset(0% 0% 0% 0%)',transform:'translate(0,0)'}],{duration:210,easing:'cubic-bezier(.2,.75,.2,1)'});entry.animation=animation;animation.finished.then(()=>{if(entry.animation===animation)entry.animation=null;}).catch(()=>{});}
  }
}
function pairs(animate=false){
  if(!note(a))a=state.notes[0]?.id;if(!note(b)||a===b)b=state.notes.find(n=>n.id!==a)?.id;
  for(const [id,n,s]of[['note-a',note(a),'a'],['note-b',note(b),'b']]){const el=$(id),html=n?`${esc(summary(n))}<div class="tags">${tags(n)}</div>`:'Catch another note to start pairing.';if(pairMarkup.get(id)!==html){el.innerHTML=html;pairMarkup.set(id,html);}el.classList.toggle('selected',slot===s);if(el.disabled!==!n)el.disabled=!n;const label=`Choose ${s==='a'?'first':'second'} note${n?': '+summary(n):''}`;if(el.getAttribute('aria-label')!==label)el.setAttribute('aria-label',label);}
  const isLinked=!!a&&!!b&&linked(a,b);$('connect').disabled=!a||!b||a===b;$('connect').classList.toggle('linked',isLinked);$('connect').setAttribute('aria-label',isLinked?'Unlink selected notes':'Connect selected notes');
  const source=slot==='a'?b:a, candidates=source?core.getRelated(source,{mode:pairMode,breadth}):[];
  renderCandidates(candidates,animate);
  $('pair-hint').textContent=isLinked?'Connected · these notes now appear together in your library.':`Choosing ${slot==='a'?'first':'second'} note · ${candidates.length} ${pairMode==='suggest'?'tag matches':pairMode==='manual'?'available notes':'nearby notes'}.`;
  $('breadth').disabled=pairMode==='manual';
  $('breadth-label').textContent=pairMode==='manual'?'All notes · breadth off':`${breadth} · ${breadth<35?'tight connections':breadth<75?'shared threads':'broader connections'}`;
  materialState();
  
}
function replayNotes(){let notes=[...state.notes];if(replayMode==='favorites')notes=notes.filter(n=>n.favorite);if(replayMode==='connected')notes=notes.filter(n=>state.links.some(p=>p.includes(n.id)));return notes.sort((x,y)=>y.updatedAt.localeCompare(x.updatedAt));}
function materialState(){
  const lever=document.querySelector('[data-render-control="lever"]'),dial=document.querySelector('[data-render-control="dial"]'),play=$('play');
  document.querySelector('.tension').dataset.inactive=String(pairMode==='manual');
  // The live renderer owns the marker's physical position; fallback follows input.
  if(lever?.dataset.renderReady!=='true')$('breadth-gauge').style.setProperty('--gauge-y',`${18+(100-breadth)*1.84}px`);
  if(lever){lever.dataset.value=String(breadth);lever.dataset.disabled=String(pairMode==='manual');lever.setAttribute('aria-valuenow',String(breadth));lever.setAttribute('aria-valuetext',pairMode==='manual'?'All notes; breadth off':`${breadth} percent`);lever.setAttribute('aria-disabled',String(pairMode==='manual'));lever.tabIndex=pairMode==='manual'?-1:0;}
  if(dial){dial.dataset.mode=pairMode;dial.dataset.disabled='false';dial.setAttribute('aria-valuenow',String(['nearby','suggest','manual'].indexOf(pairMode)));dial.setAttribute('aria-valuetext',{nearby:'Nearby',suggest:'Tag matches',manual:'All notes'}[pairMode]);}
  play.dataset.playing=String(playing);play.dataset.disabled=String(play.disabled);
}
function replayContent(html,animate,direction,metadata){
  const el=$('replay-content'),commit=()=>{metadata();el.innerHTML=html;el.scrollTop=0;el.scrollLeft=0;};
  if(html===replaySignature){
    if(inkTransition?.el===el&&!inkTransition.committed)inkTransition.update=commit;
    else metadata();
    return;
  }
  replaySignature=html;replaceInk(el,commit,animate);
}
function replay(animate=false,direction=1){const notes=replayNotes();replayIndex=notes.length?((replayIndex%notes.length)+notes.length)%notes.length:0;const n=notes[replayIndex];const position=notes.length?`${replayIndex+1} / ${notes.length}`:'0 / 0',stamp=n?`${date(n)}${n.sample?' · SAMPLE':''}`:'';const html=n?`<p id="replay-text" tabindex="0" aria-label="Note text">${esc(n.text.replace(/^Sample note:\s*/,''))}</p><div id="replay-tags" class="tags" tabindex="0" aria-label="Note tags">${tags(n)}</div>`:`<p id="replay-text" tabindex="0" aria-label="Note text">${replayMode==='favorites'?'Star a note in the Library to replay it here.':replayMode==='connected'?'Connect two notes to replay their shared thread.':'Catch your first thought to begin.'}</p><div id="replay-tags" class="tags" tabindex="0" aria-label="Note tags"></div>`;replayContent(html,animate,direction,()=>{$('replay-position').textContent=position;$('replay-date').textContent=stamp;replayVisibleId=n?.id??null;$('replay-open').disabled=!n;});for(const id of ['prev','next','shuffle'])$(id).disabled=notes.length<2;$('play').disabled=!n||!powered;if(!n&&playing)setPlaying(false);materialState();}
function schedule(){clearTimeout(timer);$('replay-progress').getAnimations().forEach(x=>x.cancel());$('replay-progress').style.width='0';if(!playing||!powered||document.hidden||pageSuspended)return;if(!reduced.matches)$('replay-progress').animate([{width:'0%'},{width:'100%'}],{duration:6500,fill:'forwards'});timer=setTimeout(()=>{replayIndex++;replay(true);schedule();},6500);}
const polygon=(pts)=>'M'+pts[0]+' '+pts[1]+' L'+pts[2]+' '+pts[3]+' L'+pts[4]+' '+pts[5]+' L'+pts[6]+' '+pts[7]+' Z';
function paintMorph(value){const from=[[20,17,20,47,34,39,34,25],[34,25,34,39,45,32,45,32]],to=[[21,18,21,46,29,46,29,18],[35,18,35,46,43,46,43,18]];['play-left','play-right'].forEach((id,i)=>$(id).setAttribute('d',polygon(from[i].map((v,j)=>v+(to[i][j]-v)*value))));}
function setPlaying(value){playing=!!value&&powered&&replayNotes().length>0;$('play').setAttribute('aria-pressed',String(playing));$('play').setAttribute('aria-label',playing?'Pause automatic text replay':'Start automatic text replay');materialState();cancelAnimationFrame(morphFrame);const target=playing?1:0,start=morph,time=performance.now();function frame(now){const t=Math.min(1,(now-time)/230);morph=start+(target-start)*(1-Math.pow(1-t,3));paintMorph(morph);if(t<1)morphFrame=requestAnimationFrame(frame);}if(reduced.matches){morph=target;paintMorph(morph);}else morphFrame=requestAnimationFrame(frame);schedule();}
function refresh(){state=core.getState();if(!note(selected)&&deletedEditor?.id!==selected){selected=state.notes[0]?.id;editor();}pairs();library();connections();editorMeta();replay();$('undo').hidden=!state.canUndo;$('storage-status').textContent=state.storage.mode==='persistent'?'LOCAL LIBRARY · SAVED HERE':'SESSION ONLY · NOT SAVED';if(state.storage.error)announce(state.storage.error);}
core.subscribe(refresh);
for(const type of ['pointerdown','keydown','wheel','touchstart'])document.addEventListener(type,e=>{if(e.isTrusted)inputEpoch++;},{capture:true,passive:true});
document.addEventListener('pointerdown',()=>document.documentElement.dataset.input='pointer',true);document.addEventListener('keydown',e=>{if(['Tab','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Home','End','Enter',' '].includes(e.key))document.documentElement.dataset.input='keyboard';},true);
function pressedControl(target){if(target.closest('#play'))return $('play');if(target.closest('#breadth,[data-render-control="lever"]'))return document.querySelector('[data-render-control="lever"]');if(target.closest('[data-render-control="dial"]'))return document.querySelector('[data-render-control="dial"]');return null;}
function clearMaterialPress(){document.querySelectorAll('[data-render-control]').forEach(x=>x.dataset.pressed='false');}
document.addEventListener('pointerdown',e=>{const surface=pressedControl(e.target);if(surface&&!e.target.disabled&&surface.dataset.disabled!=='true')surface.dataset.pressed='true';},true);
for(const event of ['pointerup','pointercancel'])document.addEventListener(event,clearMaterialPress,true);
document.addEventListener('keydown',e=>{if(e.key===' '||e.key==='Enter'){const surface=pressedControl(e.target);if(surface&&!e.target.disabled&&surface.dataset.disabled!=='true')surface.dataset.pressed='true';}},true);
document.addEventListener('keyup',e=>{if(e.key===' '||e.key==='Enter')clearMaterialPress();},true);
window.addEventListener('blur',clearMaterialPress);
document.querySelectorAll('.brand,[data-view]').forEach(control=>control.addEventListener('pointerdown',e=>{if(e.button===0){e.preventDefault();control.focus({preventScroll:true});}}));
document.querySelectorAll('[data-view]').forEach(btn=>btn.addEventListener('click',()=>navigate(btn.dataset.view)));
document.querySelector('.brand').addEventListener('click',e=>{e.preventDefault();navigate('capture');});
$('capture-text').addEventListener('input',()=>{$('draft-indicator').textContent=$('capture-text').value?'Unsaved thought':'Just a thought…';$('capture-error').textContent='';});
$('capture-form').addEventListener('submit',e=>{e.preventDefault();const r=core.saveNote({text:$('capture-text').value,tags:$('capture-tags').value});$('capture-error').textContent=r.ok?'':r.error;if(result(r,'Note saved. Choose a second thought to connect.')){a=r.note.id;slot='b';$('capture-text').value='';$('capture-tags').value='';$('draft-indicator').textContent='Saved ✓';pairs(true);replayIndex=0;replay(true);}});
$('note-a').addEventListener('click',()=>{slot='a';pairs(true);});$('note-b').addEventListener('click',()=>{slot='b';pairs(true);});
$('candidates').addEventListener('click',e=>{const btn=e.target.closest('[data-candidate]');if(!btn)return;const id=btn.dataset.candidate;if(slot==='a')a=id;else b=id;pairs(true);if(document.documentElement.dataset.input==='keyboard')Array.from($('candidates').querySelectorAll('[data-candidate]')).find(x=>x.dataset.candidate===id)?.focus({preventScroll:true});});
$('connect').addEventListener('click',()=>{const r=core.toggleLink(a,b);result(r,r.linked?'Thoughts connected.':'Connection removed.');});
$('breadth').addEventListener('input',e=>{breadth=Number(e.target.value);pairs(true);});
const modes=['nearby','suggest','manual'],selectorStep=Math.PI/4;let tapDirection=1;
function tapPairMode(){const i=modes.indexOf(pairMode);if(i===0)tapDirection=1;if(i===2)tapDirection=-1;setPairMode(modes[i+tapDirection]);}
function setBreadth(value){if(pairMode==='manual')return;const next=Math.max(0,Math.min(100,Math.round(value)));if(next===breadth)return;breadth=next;$('breadth').value=String(next);pairs(true);}
function setPairMode(mode){if(!modes.includes(mode)||mode===pairMode)return;tapDirection=Math.sign(modes.indexOf(mode)-modes.indexOf(pairMode));pairMode=mode;document.querySelectorAll('[data-pair-mode]').forEach(x=>{const selected=x.dataset.pairMode===mode;x.dataset.selected=String(selected);if(selected)x.setAttribute('aria-current','true');else x.removeAttribute('aria-current');});pairs(true);}
for(const kind of ['lever','dial']){
  const surface=document.querySelector(`[data-render-control="${kind}"]`);let drag=null;
  const angle=e=>{const box=surface.getBoundingClientRect();return Math.atan2(e.clientY-box.top-box.height/2,e.clientX-box.left-box.width/2);};
  surface.addEventListener('pointerdown',e=>{if(surface.dataset.disabled==='true'||drag||e.button!==0)return;e.preventDefault();surface.focus({preventScroll:true});drag={id:e.pointerId,x:e.clientX,y:e.clientY,value:breadth,index:modes.indexOf(pairMode),angle:angle(e),travel:0,moved:false,height:surface.getBoundingClientRect().height};surface.dataset.pressed='true';surface.dataset.tracking='true';if(kind==='dial')surface.dataset.dragAngle=String((1-drag.index)*selectorStep);surface.setPointerCapture(e.pointerId);});
  surface.addEventListener('pointermove',e=>{if(!drag||drag.id!==e.pointerId)return;e.preventDefault();if(Math.hypot(e.clientX-drag.x,e.clientY-drag.y)>3)drag.moved=true;if(kind==='lever')setBreadth(drag.value+(drag.y-e.clientY)/Math.max(1,drag.height)*100);else{const nowAngle=angle(e);let delta=nowAngle-drag.angle;while(delta>Math.PI)delta-=Math.PI*2;while(delta< -Math.PI)delta+=Math.PI*2;drag.angle=nowAngle;drag.travel=Math.max(-drag.index*selectorStep,Math.min((2-drag.index)*selectorStep,drag.travel+delta));surface.dataset.dragAngle=String((1-drag.index)*selectorStep-drag.travel);setPairMode(modes[Math.max(0,Math.min(2,drag.index+Math.round(drag.travel/selectorStep)))]);}});
  const release=(e,cancel=false)=>{if(!drag||drag.id!==e.pointerId)return;const previous=drag;drag=null;surface.dataset.tracking='false';delete surface.dataset.dragAngle;surface.dataset.pressed='false';if(surface.hasPointerCapture(e.pointerId))surface.releasePointerCapture(e.pointerId);if(kind==='dial'&&!cancel&&!previous.moved)tapPairMode();};
  surface.addEventListener('pointerup',e=>release(e));surface.addEventListener('pointercancel',e=>release(e,true));surface.addEventListener('lostpointercapture',e=>release(e,true));
  surface.addEventListener('keydown',e=>{if(surface.dataset.disabled==='true')return;const keys=['ArrowUp','ArrowRight','ArrowDown','ArrowLeft','Home','End','PageUp','PageDown',' ','Enter'];if(!keys.includes(e.key))return;e.preventDefault();surface.dataset.pressed='true';if(kind==='lever'){if(e.key==='Home')setBreadth(0);else if(e.key==='End')setBreadth(100);else if(e.key==='ArrowUp'||e.key==='ArrowRight')setBreadth(breadth+1);else if(e.key==='ArrowDown'||e.key==='ArrowLeft')setBreadth(breadth-1);else if(e.key==='PageUp')setBreadth(breadth+10);else if(e.key==='PageDown')setBreadth(breadth-10);}else{const index=modes.indexOf(pairMode);if(e.key==='Home')setPairMode(modes[0]);else if(e.key==='End')setPairMode(modes[2]);else if(e.key==='ArrowDown'||e.key==='ArrowLeft'||e.key==='PageDown')setPairMode(modes[Math.max(0,index-1)]);else if(e.key===' '||e.key==='Enter')tapPairMode();else setPairMode(modes[Math.min(2,index+1)]);}});
  surface.addEventListener('keyup',()=>surface.dataset.pressed='false');surface.addEventListener('blur',()=>{surface.dataset.tracking='false';delete surface.dataset.dragAngle;if(drag){const id=drag.id;drag=null;if(surface.hasPointerCapture(id))surface.releasePointerCapture(id);}surface.dataset.pressed='false';});
}
$('search').addEventListener('input',library);document.querySelectorAll('[data-filter]').forEach(btn=>btn.addEventListener('click',()=>{filter=btn.dataset.filter;document.querySelectorAll('[data-filter]').forEach(x=>x.setAttribute('aria-pressed',String(x===btn)));library();}));
document.addEventListener('click',e=>{const btn=e.target.closest('[data-open]');if(btn)openNote(btn.dataset.open);const unlink=e.target.closest('[data-unlink]');if(unlink)result(core.toggleLink(selected,unlink.dataset.unlink),'Connection removed.');});
// Establish native caret/selection against the requested note, before the
// browser performs selection or input defaults on this live form.
$('edit-form').addEventListener('pointerdown',clearInk,true);
$('edit-form').addEventListener('keydown',clearInk,true);
for(const id of ['edit-text','edit-tags'])$(id).addEventListener('beforeinput',()=>{const el=$(id),all=el.selectionStart===0&&el.selectionEnd===el.value.length;clearInk();if(all)el.setSelectionRange(0,el.value.length);});
for(const id of ['edit-text','edit-tags'])$(id).addEventListener('input',()=>{clearInk($('edit-text'));stashEditor();$('edit-error').textContent='';});
$('edit-form').addEventListener('submit',e=>{e.preventDefault();if(!note(selected))return;stashEditor();if(!drafts.has(selected)){lastSavedId=selected;editorMeta();announce('Current changes are saved.');return;}const r=core.saveNote({id:selected,text:$('edit-text').value,tags:$('edit-tags').value});$('edit-error').textContent=r.ok?'':r.error;if(result(r,'Changes saved.')){drafts.delete(selected);lastSavedId=selected;editor();library();}});
$('favorite').addEventListener('click',()=>result(core.setFavorite(selected,!note(selected)?.favorite),'Favorite updated.'));
function undoDeletion(){clearInk();stashEditor();const id=lastDeletedId,r=core.undoRemove();result(r,'Deleted note restored with its connections.');if(r.ok){deletedEditor=null;lastDeletedId=null;}if(r.ok&&document.documentElement.dataset.input==='keyboard'&&note(id)&&selected!==id){openNote(id);}else editor();}
$('delete').addEventListener('click',()=>{clearInk();if(deletedEditor?.id===selected&&!note(selected)){undoDeletion();return;}stashEditor();const id=selected,n=note(id);if(!n)return;const previous=deletedEditor,previousId=lastDeletedId;deletedEditor={...n,tags:[...n.tags]};lastDeletedId=id;const r=core.removeNote(id);if(!r.ok){deletedEditor=previous;lastDeletedId=previousId;}result(r,'Note deleted. Undo is available.');editor();});
$('undo').addEventListener('click',undoDeletion);
$('link-existing').addEventListener('click',()=>{clearInk();a=selected;slot='b';navigate('pair');pairs(true);if(document.documentElement.dataset.input==='keyboard')$('note-b').focus({preventScroll:true});});
document.querySelectorAll('[data-replay-mode]').forEach(btn=>btn.addEventListener('click',()=>{replayMode=btn.dataset.replayMode;replayIndex=0;document.querySelectorAll('[data-replay-mode]').forEach(x=>x.setAttribute('aria-pressed',String(x===btn)));replay(true);schedule();}));
for(const [id,step]of[['prev',-1],['next',1]])$(id).addEventListener('click',()=>{replayIndex+=step;replay(true,step);schedule();});
$('shuffle').addEventListener('click',()=>{const length=replayNotes().length;replayIndex=(replayIndex+1+Math.floor(Math.random()*Math.max(1,length-1)))%length;replay(true);schedule();});
$('play').addEventListener('click',()=>{setPlaying(!playing);announce(playing?'Automatic text replay started. A thought every 6.5 seconds.':'Text replay paused.');});
$('replay-open').addEventListener('click',()=>{const id=replayVisibleId;if(note(id))openNote(id);});
$('power').addEventListener('click',()=>{powered=!powered;$('power').setAttribute('aria-pressed',String(powered));$('power').querySelector('span').textContent=powered?'ON':'STANDBY';document.body.classList.toggle('is-standby',!powered);if(!powered)setPlaying(false);replay();announce(powered?'Replay is ready. Press play when you want to rediscover a thought.':'Standby. Automatic replay is paused; your notes remain editable.');});
document.addEventListener('visibilitychange',()=>{schedule();restartStatusScroll();});
// A viewport change owns responsive reflow. The in-flight endpoint was measured
// at another width; do not later release that stale height into the new layout.
window.addEventListener('resize',()=>{
  if(!bench.classList.contains('mode-changing'))return;
  modeSerial++;modeReveal=null;stopTravel();settleMode();
});
reduced.addEventListener('change',()=>{cancelAnimationFrame(morphFrame);morph=playing?1:0;paintMorph(morph);clearInk();replayMotion?.cancel();replayMotion=null;settleMode();cancelAnimationFrame(travel);travel=0;indicate(manualNavigation?visibleContext():destination);settleCandidates();schedule();restartStatusScroll();});
window.addEventListener('beforeunload',e=>{stashEditor();if(drafts.size||$('capture-text').value.trim()||$('capture-tags').value.trim()){e.preventDefault();e.returnValue='';}});
window.addEventListener('pagehide',event=>{pageSuspended=true;cancelAnimationFrame(statusFrame);statusFrame=0;stopTravel();settleMode();clearInk();clearTimeout(timer);cancelAnimationFrame(morphFrame);replayMotion?.cancel();$('replay-progress').getAnimations().forEach(x=>x.cancel());settleCandidates();if(!event.persisted){pageClosed=true;statusVisibility.disconnect();statusSize.disconnect();core.dispose();controlsRenderer?.dispose?.();}});
window.addEventListener('pageshow',()=>{pageSuspended=false;if(!pageClosed){morph=playing?1:0;paintMorph(morph);controlsRenderer?.refresh?.();schedule();restartStatusScroll();}});
$('capture-view').classList.add('mode-active');$('pair-controls').classList.add('mode-active');bench.dataset.mode='capture';
refresh();editor();paintMorph(0);navigate(['library','pair','replay'].includes(location.hash.slice(1))?location.hash.slice(1):'capture',false,'replace');
import('./controls-3d.js?v=table-dial-demo-v1').then(({mountInstrumentControls})=>mountInstrumentControls()).then(renderer=>{if(pageClosed)renderer?.dispose?.();else {controlsRenderer=renderer;if(!renderer){document.documentElement.dataset.controls='fallback';document.body.dataset.materialRenderer='fallback';}}}).catch(()=>{document.documentElement.dataset.controls='fallback';document.body.dataset.materialRenderer='fallback';});
import('./clouds.js?v=cloud-p5-plate-r35').then(({mountClouds})=>{if(!pageClosed)return mountClouds();}).catch(()=>{});
