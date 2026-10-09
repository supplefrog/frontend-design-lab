import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const app=await readFile('outputs/field-audio/app.js','utf8');
const source=await readFile('outputs/field-audio/audio-core.js','utf8');
const {createAudioCore}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
class Audio extends EventTarget {
 readyState=1;duration=30;currentTime=0;paused=true;
 play(){this.paused=false;return Promise.resolve();}
 pause(){const changed=!this.paused;this.paused=true;if(changed)this.dispatchEvent(new Event('pause'));}
}
const audio=new Audio(),core=createAudioCore(audio,{storage:null});
const controls=new Map();
const $=id=>{if(!controls.has(id))controls.set(id,new EventTarget());return controls.get(id);};
let pending;
const context=vm.createContext({core,audioSignal:{ensure:()=>Promise.resolve()},$,result:x=>x,action:fn=>{pending=fn();}});
// Execute the shipped gesture helper and listeners against the real audio core.
const helper=app.slice(app.indexOf('async function playAudio('),app.indexOf('// Two matching'));
vm.runInContext(helper,context);
for(const id of ['play','restart','preview']){
 const listener=app.split('\n').find(line=>line.startsWith(`$('${id}').addEventListener('click'`));
 assert.ok(listener,`${id} keeps its transport action`);vm.runInContext(listener,context);
}
core.setSelection(4,4.2);audio.currentTime=19;
$('play').dispatchEvent(new Event('click'));await pending;
assert.equal(audio.currentTime,4,'Primary Play starts at the selection boundary even after an outside seek');
assert.equal(core.getState().playbackMode,'selection');
audio.currentTime=4.21;audio.dispatchEvent(new Event('timeupdate'));
assert.equal(audio.paused,true,'Primary Play stops at the selected end');assert.equal(audio.currentTime,4.2);
$('restart').dispatchEvent(new Event('click'));assert.equal(audio.currentTime,4,'Restart returns to the selected start');
$('play').dispatchEvent(new Event('click'));await pending;
$('play').dispatchEvent(new Event('click'));assert.equal(audio.paused,true,'The same control pauses');
core.setSelection(7,7.2);$('preview').dispatchEvent(new Event('click'));await pending;
assert.equal(audio.currentTime,7);audio.currentTime=7.21;audio.dispatchEvent(new Event('timeupdate'));assert.equal(audio.paused,true);
core.destroy();console.log('PASS: primary and fragment controls honor the selected bounds, pause, and selected restart.');
