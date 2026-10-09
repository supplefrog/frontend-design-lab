import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const appSource=await readFile(new URL('../../outputs/mindlatch-trial/app.js',import.meta.url),'utf8');
const rendererSource=await readFile(new URL('../../outputs/mindlatch-trial/controls-3d.js',import.meta.url),'utf8');

// Execute the actual installed registration/gesture code, not a reimplementation
// of the angle conversion. These stubs supply DOM/input boundaries only.
function controlHarness(){
  const makeSurface=()=>({dataset:{disabled:'false'},events:new Map(),capture:null,
    getBoundingClientRect:()=>({left:0,top:0,width:100,height:100}),focus(){},
    addEventListener(type,listener){this.events.set(type,listener);},
    setPointerCapture(id){this.capture=id;},hasPointerCapture(id){return this.capture===id;},
    releasePointerCapture(){this.capture=null;}});
  const dial=makeSurface(),lever=makeSurface();
  const indicators=['nearby','suggest','manual'].map(mode=>({dataset:{pairMode:mode},setAttribute(){},removeAttribute(){}}));
  const context=vm.createContext({pairMode:'suggest',breadth:65,
    document:{querySelector:selector=>selector.includes('lever')?lever:dial,querySelectorAll:()=>indicators},
    $:()=>({value:'65'}),pairs(){}});
  const start=appSource.indexOf("const modes=['nearby','suggest','manual'];");
  const end=appSource.indexOf("$('search').addEventListener",start);
  assert.ok(start>=0&&end>start,'production gesture registration seam must exist');
  vm.runInContext(appSource.slice(start,end),context);
  const emit=(type,x=50,y=10,extra={})=>dial.events.get(type)({clientX:x,clientY:y,pointerId:7,button:0,preventDefault(){},...extra});
  return {emit,dial,mode:()=>vm.runInContext('pairMode',context)};
}

test('physical clockwise advances the shared ordinal; counterclockwise retreats',()=>{
  const cw=controlHarness();cw.emit('pointerdown');cw.emit('pointermove',78,22);
  assert.equal(cw.mode(),'manual','top to upper-right is clockwise and advances Tag matches to All notes');
  cw.emit('pointerup',78,22);assert.equal(cw.mode(),'manual','drag release must not also cycle');
  const ccw=controlHarness();ccw.emit('pointerdown');ccw.emit('pointermove',22,22);
  assert.equal(ccw.mode(),'nearby','top to upper-left is counterclockwise and retreats');
});

test('reversal uses original drag detent; crossing the atan2 branch keeps direction',()=>{
  const h=controlHarness();h.emit('pointerdown');h.emit('pointermove',78,22);h.emit('pointermove',22,22);
  assert.equal(h.mode(),'nearby');h.emit('pointermove',50,10);assert.equal(h.mode(),'suggest');
  const branch=controlHarness();branch.emit('pointerdown',12,63);branch.emit('pointermove',12,37);
  assert.equal(branch.mode(),'manual','left/below to left/above follows clockwise through the angle branch');
});

test('tap, keyboard, cancellation and pointer ownership retain their existing semantics',()=>{
  const tap=controlHarness();tap.emit('pointerdown');tap.emit('pointerup');assert.equal(tap.mode(),'manual');
  tap.emit('pointerdown');tap.emit('pointerup');assert.equal(tap.mode(),'nearby');
  tap.emit('keydown',50,10,{key:'ArrowRight'});assert.equal(tap.mode(),'suggest');
  tap.emit('keydown',50,10,{key:'ArrowLeft'});assert.equal(tap.mode(),'nearby');
  const cancel=controlHarness();cancel.emit('pointerdown');cancel.emit('pointercancel');assert.equal(cancel.mode(),'suggest');
  assert.equal(cancel.dial.capture,null);assert.equal(cancel.dial.dataset.pressed,'false');
  const owned=controlHarness();owned.emit('pointerdown');owned.emit('pointermove',78,22,{pointerId:8});assert.equal(owned.mode(),'suggest');
  owned.emit('pointermove',78,22);owned.emit('pointercancel');assert.equal(owned.mode(),'manual','cancellation retains an already selected mode');
  owned.emit('pointermove',22,22);assert.equal(owned.mode(),'manual','released pointer cannot change the control');
});

test('the held dial follows a sub-detent pointer angle and releases to its semantic detent',()=>{
  const h=controlHarness();h.emit('pointerdown');h.emit('pointermove',58,10);
  assert.equal(h.mode(),'suggest','small turns must not prematurely switch the mode');
  assert.equal(h.dial.dataset.tracking,'true');
  assert.ok(Number(h.dial.dataset.dragAngle)<-.15&&Number(h.dial.dataset.dragAngle)>-.25,'the visible face follows the small clockwise turn');
  h.emit('pointerup',58,10);
  assert.equal(h.dial.dataset.tracking,'false');assert.equal(h.dial.dataset.dragAngle,undefined);
  assert.equal(h.mode(),'suggest','release settles to the unchanged detent');
});

test('clockwise travel stays at its stop across the angle branch and reversal responds immediately',()=>{
  const h=controlHarness();h.emit('pointerdown');
  const turn=offset=>h.emit('pointermove',50+40*Math.sin(offset),50-40*Math.cos(offset));
  for(const offset of [.8,1.6,2.4,3,3.3]){turn(offset);assert.equal(h.mode(),'manual','continuing clockwise must not flip to the opposite stop');}
  turn(3.1);assert.ok(Number(h.dial.dataset.dragAngle)>-.7,'reverse motion responds at the mechanical stop rather than winding back dead travel');
  turn(2.8);assert.equal(h.mode(),'suggest');
  h.emit('pointercancel');assert.equal(h.dial.dataset.tracking,'false');assert.equal(h.dial.capture,null);
});

test('production rendered mode angles follow the same physical direction as ordinal input',()=>{
  const start=rendererSource.indexOf('  function read(item){');
  const end=rendererSource.indexOf('  function symbol(',start);
  assert.ok(start>=0&&end>start,'production renderer read seam must exist');
  const read=vm.runInNewContext(`${rendererSource.slice(start,end)};read`,{});
  const angles=['nearby','suggest','manual'].map(mode=>read({type:'dial',anchor:{dataset:{mode}}}).rotation);
  assert.equal(read({type:'dial',anchor:{dataset:{mode:'suggest',tracking:'true',dragAngle:'-.23'}}}).rotation,-.23,'live rotation must not lag behind the semantic detent');
  assert.equal(read({type:'dial',anchor:{dataset:{mode:'suggest',tracking:'false',dragAngle:'-.23'}}}).rotation,0,'released state returns to the detent');
  // Project the actual marker's local point after Z rotation. DOM screen Y is
  // down, unlike the scene Y axis. Positive signed cross is therefore CW.
  const projected=angle=>{const x=-.347,y=-.347;return [x*Math.cos(angle)-y*Math.sin(angle),-(x*Math.sin(angle)+y*Math.cos(angle))];};
  for(let i=0;i<2;i++){
    const a=projected(angles[i]),b=projected(angles[i+1]);
    assert.ok(a[0]*b[1]-a[1]*b[0]>0,'advancing a rendered ordinal must turn the marker clockwise in screen space');
  }
});

test('repeat current navigation is inert while a genuine destination still works',()=>{
  let scrolls=0,historyWrites=0,refreshes=0,stashes=0;
  const nodes=new Map();const $=id=>{if(!nodes.has(id))nodes.set(id,{hidden:false,scrollIntoView(){scrolls++;}});return nodes.get(id);};
  const context=vm.createContext({destination:null,view:'capture',$,stashEditor(){stashes++;},library(){refreshes++;},editor(){},connections(){},announce(){},history:{replaceState(){historyWrites++;}},document:{querySelectorAll(){return[];}}});
  const start=appSource.indexOf('function navigate(next,skipStash=false){'),end=appSource.indexOf('function openNote(id){',start);
  assert.ok(start>=0&&end>start);vm.runInContext(appSource.slice(start,end),context);
  vm.runInContext("navigate('replay');navigate('replay');navigate('replay')",context);
  assert.equal(scrolls,1);assert.equal(historyWrites,1);assert.equal(stashes,1);
  vm.runInContext("navigate('capture');navigate('capture');navigate('library');navigate('library')",context);
  assert.equal(scrolls,1,'home activation does not introduce a new scroll');
  assert.equal(historyWrites,3);assert.equal(refreshes,1,'the library refreshes on entry rather than on every repeat');
  assert.equal(nodes.get('capture-view').hidden,true);assert.equal(nodes.get('library-view').hidden,false);
});

function openHarness(input='pointer',phone=true){
  const calls=[],form={hidden:true,tabIndex:undefined,
    scrollIntoView(options){calls.push({action:'scroll',target:'edit-form',options});},
    focus(options){calls.push({action:'focus',target:'edit-form',options});}};
  const text={focus(options){calls.push({action:'focus',target:'edit-text',options});}};
  const context=vm.createContext({view:'capture',selected:'old',reduced:{matches:true},
    $:id=>id==='edit-form'?form:text,document:{documentElement:{dataset:{input}}},
    matchMedia:()=>({matches:phone}),stashEditor(){calls.push({action:'stash'});},
    navigate(){form.hidden=false;},editor(){},library(){},connections(){}});
  const start=appSource.indexOf('function openNote(id){');
  const end=appSource.indexOf('function library(){',start);
  assert.ok(start>=0&&end>start,'production open-note seam must exist');
  vm.runInContext(appSource.slice(start,end),context);vm.runInContext("openNote('destination')",context);
  return {calls,form,selected:vm.runInContext('selected',context)};
}

test('explicit pointer open transfers focus to non-editable destination anchor',()=>{
  const h=openHarness();assert.equal(h.selected,'destination');
  assert.equal(h.calls[0].action,'stash','save existing draft before moving the editor');
  const focus=h.calls.filter(c=>c.action==='focus');
  assert.equal(focus.length,1,'scrolling alone leaves the originating replay button active');
  assert.equal(focus[0].target,'edit-form','phone pointer open must avoid an editable focus/virtual keyboard');
  assert.equal(focus[0].options.preventScroll,true);assert.equal(h.form.tabIndex,-1);
});

test('keyboard opening keeps immediate editable focus and desktop pointer opening avoids forced scrolling',()=>{
  const keyboard=openHarness('keyboard');
  assert.equal(keyboard.calls.find(c=>c.action==='focus')?.target,'edit-text');
  const desktop=openHarness('pointer',false);
  assert.equal(desktop.calls.some(c=>c.action==='scroll'),false);
});
