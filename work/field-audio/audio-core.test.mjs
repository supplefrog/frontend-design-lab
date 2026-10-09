import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
// Import the browser ES module without adding a package.json to the shared app.
const source = await readFile(new URL('../../outputs/field-audio/audio-core.js', import.meta.url), 'utf8');
const { createAudioCore } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
class AudioStub extends EventTarget {
  readyState = 1; duration = 30; currentTime = 0; paused = true;
  pause() { const was = this.paused; this.paused = true; if (!was) this.dispatchEvent(new Event('pause')); }
  play() { this.paused = false; return Promise.resolve(); }
}
const memory = () => {
  const map = new Map();
  return { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value) };
};
const audio = new AudioStub();
const storage = memory();
const core = createAudioCore(audio, { storage });
assert.equal(core.setSelection(9, 9).ok, false);
assert.equal(core.setSelection(NaN, 14).ok, false);
assert.equal(core.setSelection(-10, 40).ok, true);
assert.deepEqual(core.getState().selection, { start: 0, end: 30 });
assert.equal(core.save().ok, false, 'Empty label never creates a retained excerpt');
core.setSelection(4, 8); core.setLabel('  Test excerpt  ');
const first = core.save(); assert.equal(first.persisted, true);
core.setSelection(11, 13); core.setLabel('Second'); const second = core.save();
core.choose(first.id); core.setLabel('Edited'); core.update();
assert.deepEqual(core.getState().clips.map(c => c.id), [first.id, second.id]);
const reopened = createAudioCore(new AudioStub(), { storage });
assert.deepEqual(reopened.getState().clips, core.getState().clips, 'Boundary, label and order round trip');
// Returned state cannot mutate the live controller.
const copy = core.getState(); copy.clips[0].start = 999; copy.selection.end = 0;
assert.equal(core.getState().clips[0].start, 4);
assert.equal(core.getState().selection.end, 8);
await core.playSelection(); audio.currentTime = 8.02;
audio.dispatchEvent(new Event('timeupdate'));
assert.equal(audio.paused, true); assert.equal(audio.currentTime, 8);
assert.equal(core.getState().playbackStatus, 'ended');
// A delayed successful play cannot revive or reclassify a newly chosen interval.
let resolvePlay;
audio.play = () => { audio.paused = false; return new Promise(resolve => { resolvePlay = resolve; }); };
const oldPlay = core.playSelection(); core.choose(second.id); resolvePlay();
assert.equal((await oldPlay).cancelled, true);
assert.equal(audio.paused, true); assert.equal(core.getState().playbackStatus, 'paused');
assert.deepEqual(core.getState().selection, { start: 11, end: 13 });
audio.play = () => Promise.reject(Object.assign(new Error('Blocked'), { name: 'NotAllowedError' }));
assert.equal((await core.playFull()).ok, false);
assert.equal(core.getState().error.kind, 'play');
assert.equal(core.getState().playbackStatus, 'error');
// Timer enforces interval even when timeupdate is not delivered.
audio.play = () => { audio.paused = false; return Promise.resolve(); };
await core.playSelection(); audio.currentTime = 13.02;
await new Promise(resolve => setTimeout(resolve, 45));
assert.equal(audio.paused, true); assert.equal(audio.currentTime, 13);
// Broken JSON is safe and remains intact until an explicit write.
const broken = memory(); broken.setItem('field-audio.excerpts.v1', '{bad');
const corrupt = createAudioCore(new AudioStub(), { storage: broken });
assert.equal(corrupt.getState().storageStatus, 'corrupt');
assert.equal(broken.getItem('field-audio.excerpts.v1'), '{bad');
const unavailable = createAudioCore(new AudioStub(), { storage: { getItem() { throw new Error('Denied'); } } });
assert.equal(unavailable.getState().storageStatus, 'unavailable');
const quota = createAudioCore(new AudioStub(), { storage: { getItem: () => null, setItem() { throw new Error('Quota'); } } });
quota.setLabel('Still retained'); assert.equal(quota.save().persisted, false);
assert.equal(quota.getState().clips.length, 1);
for (const controller of [core, reopened, corrupt, unavailable, quota]) controller.destroy();
console.log('PASS: range invariants, persistence and order, interval stopping, cancelled play, honest errors, storage failure.');
