import {createNotesCore} from './notes-core.js?v=0187918e5d0e';

const $=id=>document.getElementById(id), core=createNotesCore(), reduced=matchMedia('(prefers-reduced-motion: reduce)');
let state=core.getState(), view='capture', selected=state.notes[0]?.id, a=state.notes[0]?.id, b=state.notes[2]?.id, slot='b', pairMode='suggest', breadth=65, filter='all', replayMode='latest', replayIndex=0, playing=false, powered=true, timer=0, morphFrame=0, morph=0, lastDeletedId=null;
let destination=null;
const drafts=new Map(), swaps=new Map();
const pairMarkup=new Map();
const candidateNodes=new Map();let candidateEmpty=null;
let replayMotion=null,replaySignature=null;
let controlsRenderer=null, pageClosed=false;
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const note=id=>state.notes.find(n=>n.id===id), summary=n=>n.text.replace(/^Sample note:\s*/,'').split('\n')[0], tags=n=>n.tags.map(t=>`<span class="tag">#${esc(t)}</span>`).join('');
const date=n=>new Date(n.updatedAt).toLocaleDateString(undefined,{month:'short',day:'numeric'});
const linked=(x,y)=>state.links.some(p=>p.includes(x)&&p.includes(y));
function announce(text){$('status-text').textContent=text;}
function decorativeClone(root){
  root.inert=true;root.setAttribute('aria-hidden','true');
  for(const el of root.querySelectorAll('*'))for(const attr of ['id','for','aria-labelledby','aria-describedby','aria-controls','aria-activedescendant','aria-owns','aria-details','aria-errormessage'])el.removeAttribute(attr);
  return root;
}
function result(r,success){if(!r.ok){announce(r.error);return false;}announce(state.storage.mode==='session'?`${success} Kept in this session only.`:success);return true;}
function draftFor(id){const n=note(id);return drafts.get(id)||{text:n?.text||'',tags:n?.tags.join(', ')||''};}
function stashEditor(){if(!selected||$('edit-form').hidden)return;const n=note(selected);if(!n)return;const d={text:$('edit-text').value,tags:$('edit-tags').value};if(d.text!==n.text||d.tags!==n.tags.join(', '))drafts.set(selected,d);else drafts.delete(selected);$('edit-draft').textContent=drafts.has(selected)?'Unsaved changes · kept while you move around.':'';}
function editor(){const n=note(selected);$('edit-form').hidden=!n;$('editor-empty').hidden=!!n;if(!n)return;const d=draftFor(selected);$('edit-text').value=d.text;$('edit-tags').value=d.tags;$('edit-error').textContent='';$('edit-draft').textContent=drafts.has(selected)?'Unsaved changes · kept while you move around.':'';editorMeta();}
function editorMeta(){const n=note(selected);$('note-date').textContent=n?`${date(n)}${n.sample?' · SAMPLE':''}`:'';$('favorite').setAttribute('aria-pressed',String(!!n?.favorite));$('favorite').textContent=n?.favorite?'★ FAVORITE':'☆ FAVORITE';}
function navigate(next,skipStash=false){if(destination===next)return;destination=next;if(!skipStash)stashEditor();view=next==='library'?'library':'capture';$('capture-view').hidden=view==='library';$('library-view').hidden=view!=='library';$('pair-controls').hidden=view==='library';document.querySelectorAll('[data-view]').forEach(btn=>{if(btn.dataset.view===next)btn.setAttribute('aria-current','page');else btn.removeAttribute('aria-current');});if(view==='library'){library();editor();connections();}if(next==='pair'){$('pair-panel').scrollIntoView({block:'nearest',behavior:'instant'});announce('Select a note object, then choose a related idea.');}if(next==='replay')$('replay-deck').scrollIntoView({block:'nearest',behavior:'instant'});history.replaceState(null,'',`#${next}`);}
function openNote(id){
  stashEditor();const form=$('edit-form'), wasVisible=view==='library'&&!form.hidden&&selected!==id;let outgoing;
  if(wasVisible&&!reduced.matches){outgoing=document.createElement('div');for(const child of form.children)outgoing.append(child.cloneNode(true));outgoing.querySelectorAll('textarea,input').forEach((x,i)=>{const source=form.querySelectorAll('textarea,input')[i];if(source)x.value=source.value;});decorativeClone(outgoing);}
  selected=id;navigate('library',true);editor();library();connections();
  if(outgoing){const previous=swaps.get(form);if(previous){previous.animations.forEach(x=>x.cancel());previous.old.remove();}form.style.position='relative';Object.assign(outgoing.style,{position:'absolute',inset:'0',pointerEvents:'none',zIndex:'1'});form.append(outgoing);const animations=[outgoing.animate([{opacity:1,transform:'translateY(0)'},{opacity:0,transform:'translateY(-5px)'}],{duration:180,easing:'ease-out'}),...Array.from(form.children).filter(x=>x!==outgoing).map(x=>x.animate([{opacity:.15,transform:'translateY(5px)'},{opacity:1,transform:'translateY(0)'}],{duration:220,easing:'ease-out'}))];swaps.set(form,{old:outgoing,animations});Promise.all(animations.map(x=>x.finished.catch(()=>{}))).then(()=>{outgoing.remove();if(swaps.get(form)?.old===outgoing)swaps.delete(form);});}
  if(matchMedia('(max-width:780px)').matches)$('edit-form').scrollIntoView({block:'start',behavior:'instant'});
  if(document.documentElement.dataset.input==='keyboard')$('edit-text').focus({preventScroll:true});
  else{form.tabIndex=-1;form.focus({preventScroll:true});}
}
function library(){
  const q=$('search').value.trim().toLocaleLowerCase();const list=[...state.notes].sort((x,y)=>y.updatedAt.localeCompare(x.updatedAt)).filter(n=>(filter!=='favorites'||n.favorite)&&(filter!=='connected'||state.links.some(p=>p.includes(n.id)))&&(!q||`${n.text} ${n.tags.join(' ')}`.toLocaleLowerCase().includes(q)));
  $('note-count').textContent=`${state.notes.length} NOTES`;
  $('note-list').innerHTML=list.length?list.map(n=>`<button class="note-row" data-open="${esc(n.id)}" aria-current="${selected===n.id}"><b>${esc(summary(n))}</b><small>${n.favorite?'★ · ':''}${n.tags.map(t=>'#'+esc(t)).join(' ')}${n.sample?' · SAMPLE':''}${drafts.has(n.id)?' · DRAFT':''}</small></button>`).join(''):`<p class="empty-state">${state.notes.length?'No notes match. Try another search or filter.':'Your library is empty. Catch a thought to begin.'}</p>`;
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
  const paint=new Map();for(const [id,entry]of candidateNodes){if(entry.node.isConnected)paint.set(id,{box:entry.node.getBoundingClientRect(),opacity:parseFloat(getComputedStyle(entry.node).opacity)});entry.animation?.cancel();entry.animation=null;}
  const viewport=container.getBoundingClientRect(),wanted=new Set(ids);
  // A changed eligibility/order starts at its first match. Sampled geometry carries
  // painted survivors there continuously; identical lists retain manual scrolling.
  container.scrollTop=0;container.scrollLeft=0;
  for(const [id,entry]of candidateNodes){if(wanted.has(id))continue;const visual=paint.get(id);if(!visual){entry.node.remove();candidateNodes.delete(id);continue;}entry.exiting=true;entry.node.inert=true;entry.node.setAttribute('aria-hidden','true');entry.node.tabIndex=-1;Object.assign(entry.node.style,{position:'absolute',left:`${visual.box.left-viewport.left}px`,top:`${visual.box.top-viewport.top}px`,width:`${visual.box.width}px`,height:`${visual.box.height}px`,pointerEvents:'none'});}
  candidateEmpty.hidden=!!ids.length;
  for(const n of candidates){let entry=candidateNodes.get(n.id);if(!entry){const node=document.createElement('button');node.type='button';node.dataset.candidate=n.id;entry={node,animation:null,exiting:false};candidateNodes.set(n.id,entry);}const el=entry.node;entry.exiting=false;el.inert=false;el.removeAttribute('aria-hidden');el.removeAttribute('tabindex');el.style.cssText='';if(el.textContent!==summary(n))el.textContent=summary(n);const value=String(n.id===selectedId);if(el.getAttribute('aria-pressed')!==value)el.setAttribute('aria-pressed',value);}
  for(let i=0;i<ids.length;i++){const node=candidateNodes.get(ids[i]).node,active=Array.from(container.children).filter(n=>n.dataset.candidate&&!n.inert);if(active[i]!==node)container.insertBefore(node,active[i]||null);}
  const motion=animate&&!reduced.matches;
  for(const [id,entry]of candidateNodes){const el=entry.node,visual=paint.get(id);if(entry.exiting){if(!motion){el.remove();candidateNodes.delete(id);continue;}const animation=el.animate([{opacity:visual?.opacity??1,transform:'translateY(0)'},{opacity:0,transform:'translateY(-5px)'}],{duration:170,easing:'ease-out'});entry.animation=animation;animation.finished.then(()=>{if(entry.animation===animation&&entry.exiting){el.remove();candidateNodes.delete(id);}}).catch(()=>{});continue;}
    const target=el.getBoundingClientRect(),dx=visual?visual.box.left-target.left:0,dy=visual?visual.box.top-target.top:5,opacity=visual?.opacity??0;
    if(motion&&(Math.abs(dx)>.1||Math.abs(dy)>.1||opacity<.999)){const animation=el.animate([{opacity,transform:`translate(${dx}px,${dy}px)`},{opacity:1,transform:'translate(0,0)'}],{duration:210,easing:'cubic-bezier(.2,.75,.2,1)'});entry.animation=animation;animation.finished.then(()=>{if(entry.animation===animation)entry.animation=null;}).catch(()=>{});}
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
  if(lever){lever.dataset.value=String(breadth);lever.dataset.disabled=String(pairMode==='manual');lever.setAttribute('aria-valuenow',String(breadth));lever.setAttribute('aria-valuetext',pairMode==='manual'?'All notes; breadth off':`${breadth} percent`);lever.setAttribute('aria-disabled',String(pairMode==='manual'));lever.tabIndex=pairMode==='manual'?-1:0;}
  if(dial){dial.dataset.mode=pairMode;dial.dataset.disabled='false';dial.setAttribute('aria-valuenow',String(['nearby','suggest','manual'].indexOf(pairMode)));dial.setAttribute('aria-valuetext',{nearby:'Nearby',suggest:'Tag matches',manual:'All notes'}[pairMode]);}
  play.dataset.playing=String(playing);play.dataset.disabled=String(play.disabled);
}
function replayContent(html,animate,direction){
  if(html===replaySignature)return;
  const el=$('replay-content'),transform=getComputedStyle(el).transform,current=transform==='none'?0:new DOMMatrixReadOnly(transform).m41;
  replayMotion?.cancel();replayMotion=null;replaySignature=html;el.innerHTML=html;el.scrollTop=0;el.scrollLeft=0;
  if(!animate||reduced.matches)return;
  // One fully readable semantic layer: commands retarget its current physical
  // displacement rather than rebuilding fading copies of the previous note.
  const animation=el.animate([{transform:`translateX(${current}px)`,offset:0},{transform:`translateX(${-direction*8}px)`,offset:.32},{transform:'translateX(0)',offset:1}],{duration:230,easing:'cubic-bezier(.2,.75,.2,1)'});
  replayMotion=animation;animation.finished.then(()=>{if(replayMotion===animation)replayMotion=null;}).catch(()=>{});
}
function replay(animate=false,direction=1){const notes=replayNotes();replayIndex=notes.length?((replayIndex%notes.length)+notes.length)%notes.length:0;const n=notes[replayIndex];$('replay-position').textContent=notes.length?`${replayIndex+1} / ${notes.length}`:'0 / 0';$('replay-date').textContent=n?`${date(n)}${n.sample?' · SAMPLE':''}`:'';const html=n?`<p id="replay-text">${esc(summary(n))}</p><div id="replay-tags" class="tags">${tags(n)}</div>`:`<p id="replay-text">${replayMode==='favorites'?'Star a note in the Library to replay it here.':replayMode==='connected'?'Connect two notes to replay their shared thread.':'Catch your first thought to begin.'}</p><div id="replay-tags" class="tags"></div>`;replayContent(html,animate,direction);$('replay-open').disabled=!n;for(const id of ['prev','next','shuffle'])$(id).disabled=notes.length<2;$('play').disabled=!n||!powered;if(!n&&playing)setPlaying(false);materialState();}
function schedule(){clearTimeout(timer);$('replay-progress').getAnimations().forEach(x=>x.cancel());$('replay-progress').style.width='0';if(!playing||!powered||document.hidden)return;if(!reduced.matches)$('replay-progress').animate([{width:'0%'},{width:'100%'}],{duration:6500,fill:'forwards'});timer=setTimeout(()=>{replayIndex++;replay(true);schedule();},6500);}
const polygon=(pts)=>'M'+pts[0]+' '+pts[1]+' L'+pts[2]+' '+pts[3]+' L'+pts[4]+' '+pts[5]+' L'+pts[6]+' '+pts[7]+' Z';
function paintMorph(value){const from=[[20,17,20,47,34,39,34,25],[34,25,34,39,45,32,45,32]],to=[[21,18,21,46,29,46,29,18],[35,18,35,46,43,46,43,18]];['play-left','play-right'].forEach((id,i)=>$(id).setAttribute('d',polygon(from[i].map((v,j)=>v+(to[i][j]-v)*value))));}
function setPlaying(value){playing=!!value&&powered&&replayNotes().length>0;$('play').setAttribute('aria-pressed',String(playing));$('play').setAttribute('aria-label',playing?'Pause automatic text replay':'Start automatic text replay');materialState();cancelAnimationFrame(morphFrame);const target=playing?1:0,start=morph,time=performance.now();function frame(now){const t=Math.min(1,(now-time)/230);morph=start+(target-start)*(1-Math.pow(1-t,3));paintMorph(morph);if(t<1)morphFrame=requestAnimationFrame(frame);}if(reduced.matches){morph=target;paintMorph(morph);}else morphFrame=requestAnimationFrame(frame);schedule();}
function refresh(){state=core.getState();if(!note(selected)){selected=state.notes[0]?.id;editor();}pairs();library();connections();editorMeta();replay();$('undo').hidden=!state.canUndo;$('storage-status').textContent=state.storage.mode==='persistent'?'SAMPLE NOTES + YOUR NOTES · SAVED IN THIS BROWSER':'SESSION ONLY · CHANGES WILL NOT SURVIVE RELOAD';if(state.storage.error)announce(state.storage.error);}
core.subscribe(refresh);
document.addEventListener('pointerdown',()=>document.documentElement.dataset.input='pointer',true);document.addEventListener('keydown',e=>{if(['Tab','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key))document.documentElement.dataset.input='keyboard';},true);
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
$('capture-form').addEventListener('submit',e=>{e.preventDefault();const r=core.saveNote({text:$('capture-text').value,tags:$('capture-tags').value});$('capture-error').textContent=r.ok?'':r.error;if(result(r,'Note saved. Choose a second thought to connect.')){a=r.note.id;slot='b';$('capture-text').value='';$('capture-tags').value='';$('draft-indicator').textContent='Just a thought…';pairs(true);replayIndex=0;replay(true);}});
$('note-a').addEventListener('click',()=>{slot='a';pairs(true);});$('note-b').addEventListener('click',()=>{slot='b';pairs(true);});
$('candidates').addEventListener('click',e=>{const btn=e.target.closest('[data-candidate]');if(!btn)return;const id=btn.dataset.candidate;if(slot==='a')a=id;else b=id;pairs(true);if(document.documentElement.dataset.input==='keyboard')Array.from($('candidates').querySelectorAll('[data-candidate]')).find(x=>x.dataset.candidate===id)?.focus({preventScroll:true});});
$('connect').addEventListener('click',()=>{const r=core.toggleLink(a,b);result(r,r.linked?'Thoughts connected.':'Connection removed.');});
$('breadth').addEventListener('input',e=>{breadth=Number(e.target.value);pairs(true);});
const modes=['nearby','suggest','manual'];
function setBreadth(value){if(pairMode==='manual')return;const next=Math.max(0,Math.min(100,Math.round(value)));if(next===breadth)return;breadth=next;$('breadth').value=String(next);pairs(true);}
function setPairMode(mode){if(!modes.includes(mode)||mode===pairMode)return;pairMode=mode;document.querySelectorAll('[data-pair-mode]').forEach(x=>{const selected=x.dataset.pairMode===mode;x.dataset.selected=String(selected);if(selected)x.setAttribute('aria-current','true');else x.removeAttribute('aria-current');});pairs(true);}
for(const kind of ['lever','dial']){
  const surface=document.querySelector(`[data-render-control="${kind}"]`);let drag=null;
  const angle=e=>{const box=surface.getBoundingClientRect();return Math.atan2(e.clientY-box.top-box.height/2,e.clientX-box.left-box.width/2);};
  surface.addEventListener('pointerdown',e=>{if(surface.dataset.disabled==='true'||drag||e.button!==0)return;e.preventDefault();surface.focus({preventScroll:true});drag={id:e.pointerId,x:e.clientX,y:e.clientY,value:breadth,index:modes.indexOf(pairMode),angle:angle(e),travel:0,moved:false,height:surface.getBoundingClientRect().height};surface.dataset.pressed='true';surface.dataset.tracking='true';if(kind==='dial')surface.dataset.dragAngle=String((1-drag.index)*.78);surface.setPointerCapture(e.pointerId);});
  surface.addEventListener('pointermove',e=>{if(!drag||drag.id!==e.pointerId)return;e.preventDefault();if(Math.hypot(e.clientX-drag.x,e.clientY-drag.y)>3)drag.moved=true;if(kind==='lever')setBreadth(drag.value+(drag.y-e.clientY)/Math.max(1,drag.height)*100);else{const nowAngle=angle(e);let delta=nowAngle-drag.angle;while(delta>Math.PI)delta-=Math.PI*2;while(delta< -Math.PI)delta+=Math.PI*2;drag.angle=nowAngle;drag.travel=Math.max(-drag.index*.78,Math.min((2-drag.index)*.78,drag.travel+delta));surface.dataset.dragAngle=String((1-drag.index)*.78-drag.travel);setPairMode(modes[Math.max(0,Math.min(2,drag.index+Math.round(drag.travel/.78)))]);}});
  const release=(e,cancel=false)=>{if(!drag||drag.id!==e.pointerId)return;const previous=drag;drag=null;surface.dataset.tracking='false';delete surface.dataset.dragAngle;surface.dataset.pressed='false';if(surface.hasPointerCapture(e.pointerId))surface.releasePointerCapture(e.pointerId);if(kind==='dial'&&!cancel&&!previous.moved)setPairMode(modes[(modes.indexOf(pairMode)+1)%3]);};
  surface.addEventListener('pointerup',e=>release(e));surface.addEventListener('pointercancel',e=>release(e,true));surface.addEventListener('lostpointercapture',e=>release(e,true));
  surface.addEventListener('keydown',e=>{if(surface.dataset.disabled==='true')return;const keys=['ArrowUp','ArrowRight','ArrowDown','ArrowLeft','Home','End','PageUp','PageDown',' ','Enter'];if(!keys.includes(e.key))return;e.preventDefault();surface.dataset.pressed='true';if(kind==='lever'){if(e.key==='Home')setBreadth(0);else if(e.key==='End')setBreadth(100);else if(e.key==='ArrowUp'||e.key==='ArrowRight')setBreadth(breadth+1);else if(e.key==='ArrowDown'||e.key==='ArrowLeft')setBreadth(breadth-1);else if(e.key==='PageUp')setBreadth(breadth+10);else if(e.key==='PageDown')setBreadth(breadth-10);}else{const index=modes.indexOf(pairMode);if(e.key==='Home')setPairMode(modes[0]);else if(e.key==='End')setPairMode(modes[2]);else if(e.key==='ArrowDown'||e.key==='ArrowLeft'||e.key==='PageDown')setPairMode(modes[Math.max(0,index-1)]);else if(e.key===' '||e.key==='Enter')setPairMode(modes[(index+1)%3]);else setPairMode(modes[Math.min(2,index+1)]);}});
  surface.addEventListener('keyup',()=>surface.dataset.pressed='false');surface.addEventListener('blur',()=>{surface.dataset.tracking='false';delete surface.dataset.dragAngle;if(drag){const id=drag.id;drag=null;if(surface.hasPointerCapture(id))surface.releasePointerCapture(id);}surface.dataset.pressed='false';});
}
$('search').addEventListener('input',library);document.querySelectorAll('[data-filter]').forEach(btn=>btn.addEventListener('click',()=>{filter=btn.dataset.filter;document.querySelectorAll('[data-filter]').forEach(x=>x.setAttribute('aria-pressed',String(x===btn)));library();}));
document.addEventListener('click',e=>{const btn=e.target.closest('[data-open]');if(btn)openNote(btn.dataset.open);const unlink=e.target.closest('[data-unlink]');if(unlink)result(core.toggleLink(selected,unlink.dataset.unlink),'Connection removed.');});
for(const id of ['edit-text','edit-tags'])$(id).addEventListener('input',()=>{stashEditor();$('edit-error').textContent='';});
$('edit-form').addEventListener('submit',e=>{e.preventDefault();const r=core.saveNote({id:selected,text:$('edit-text').value,tags:$('edit-tags').value});$('edit-error').textContent=r.ok?'':r.error;if(result(r,'Changes saved.')){drafts.delete(selected);editor();library();}});
$('favorite').addEventListener('click',()=>result(core.setFavorite(selected,!note(selected)?.favorite),'Favorite updated.'));
$('delete').addEventListener('click',()=>{stashEditor();const id=selected,r=core.removeNote(id);if(r.ok)lastDeletedId=id;result(r,'Note deleted. Undo is available.');editor();});
$('undo').addEventListener('click',()=>{stashEditor();const id=lastDeletedId,r=core.undoRemove();result(r,'Deleted note restored with its connections.');if(r.ok&&document.documentElement.dataset.input==='keyboard'&&note(id)){openNote(id);}else editor();if(r.ok)lastDeletedId=null;});
$('link-existing').addEventListener('click',()=>{a=selected;slot='b';navigate('pair');pairs(true);if(document.documentElement.dataset.input==='keyboard')$('note-b').focus({preventScroll:true});});
document.querySelectorAll('[data-replay-mode]').forEach(btn=>btn.addEventListener('click',()=>{replayMode=btn.dataset.replayMode;replayIndex=0;document.querySelectorAll('[data-replay-mode]').forEach(x=>x.setAttribute('aria-pressed',String(x===btn)));replay(true);schedule();}));
for(const [id,step]of[['prev',-1],['next',1]])$(id).addEventListener('click',()=>{replayIndex+=step;replay(true,step);schedule();});
$('shuffle').addEventListener('click',()=>{const length=replayNotes().length;replayIndex=(replayIndex+1+Math.floor(Math.random()*Math.max(1,length-1)))%length;replay(true);schedule();});
$('play').addEventListener('click',()=>{setPlaying(!playing);announce(playing?'Automatic text replay started. A thought every 6.5 seconds.':'Text replay paused.');});
$('replay-open').addEventListener('click',()=>{const n=replayNotes()[replayIndex];if(n)openNote(n.id);});
$('power').addEventListener('click',()=>{powered=!powered;$('power').setAttribute('aria-pressed',String(powered));$('power').querySelector('span').textContent=powered?'ON':'STANDBY';document.body.classList.toggle('is-standby',!powered);if(!powered)setPlaying(false);replay();announce(powered?'Replay is ready. Press play when you want to rediscover a thought.':'Standby. Automatic replay is paused; your notes remain editable.');});
document.addEventListener('visibilitychange',schedule);
reduced.addEventListener('change',()=>{cancelAnimationFrame(morphFrame);morph=playing?1:0;paintMorph(morph);for(const [el,s]of swaps){s.animations.forEach(x=>x.cancel());s.old.remove();swaps.delete(el);}replayMotion?.cancel();replayMotion=null;settleCandidates();schedule();});
window.addEventListener('beforeunload',e=>{stashEditor();if(drafts.size||$('capture-text').value.trim()||$('capture-tags').value.trim()){e.preventDefault();e.returnValue='';}});
window.addEventListener('pagehide',()=>{pageClosed=true;clearTimeout(timer);cancelAnimationFrame(morphFrame);replayMotion?.cancel();settleCandidates();core.dispose();controlsRenderer?.dispose?.();});
refresh();editor();paintMorph(0);navigate(['library','pair','replay'].includes(location.hash.slice(1))?location.hash.slice(1):'capture');
import('./controls-3d.js?v=0e851423ed78').then(({mountInstrumentControls})=>mountInstrumentControls()).then(renderer=>{if(pageClosed)renderer?.dispose?.();else controlsRenderer=renderer;}).catch(()=>{document.body.dataset.materialRenderer='fallback';});
import('./clouds.js?v=7e8bacaf0fdd').then(({mountClouds})=>{if(!pageClosed)return mountClouds();}).catch(()=>{});
