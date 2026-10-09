import { createAudioCore } from './audio-core.js';
import { createAudioSignal } from './audio-signal.js';

const $ = id => document.getElementById(id);
const audio = $('audio');
const core = createAudioCore(audio);
const audioSignal = createAudioSignal(audio);
let recordingUrl = null, recordingRequest = null;
// The local static server does not serve byte ranges. A small complete Blob
// gives the media element a genuinely seekable recording on that server too.
async function loadRecording() {
  recordingRequest?.abort();
  const request = new AbortController();recordingRequest = request;
  feedback();$('load-status').textContent = 'Loading the recording…';$('retry').hidden = true;
  try {
    const response = await fetch(audio.dataset.src, {signal:request.signal});
    if (!response.ok) throw new Error('The recording could not load. Retry to continue.');
    const recording = await response.blob();
    if (request.signal.aborted || pageSuspended) return;
    const previous = recordingUrl;
    recordingUrl = URL.createObjectURL(recording);audio.src = recordingUrl;audio.load();
    if (previous) URL.revokeObjectURL(previous);
  } catch (error) {
    if (request.signal.aborted) return;
    feedback('The recording could not load. Retry to continue.', true);
    $('load-status').textContent = 'The recording could not load. Retry to continue.';$('retry').hidden = false;
  }
}
const motion = matchMedia('(prefers-reduced-motion: reduce)');
document.addEventListener('pointerdown', () => { document.documentElement.dataset.inputMode = 'pointer'; }, true);
document.addEventListener('keydown', () => { document.documentElement.dataset.inputMode = 'keyboard'; }, true);
let peaks = [], scene = null, previousClips = '', lastSelection = '', lastError = '', drag = null;
let clipPreviews = null, hoverProfile = null, sceneGeneration = 0;
// Start both calls inside the play gesture; audio-core keeps its cancellation
// token while the browser resumes the analysis context asynchronously.
async function playAudio() {
  const outputReady = audioSignal.ensure();
  const playback = core.playSelection();
  await outputReady;
  return playback;
}
// Two matching quadrilaterals join into a triangle and separate into pause bars.
// Matching commands let native CSS interpolate from the current painted shape.
const playPath = 'M8 4L14 8L14 16L8 20Z M14 8L20 12L20 12L14 16Z';
const pausePath = 'M7 4L10 4L10 20L7 20Z M14 4L17 4L17 20L14 20Z';
function setPlayIcon(icon, playing) {
  const mode = playing ? 'pause' : 'play';
  if (icon.dataset.mode === mode) return;
  icon.dataset.mode = mode;
  const path = playing ? pausePath : playPath;
  icon.setAttribute('d', path);
  icon.style.setProperty('d', `path("${path}")`);
}
const decimal = v => Number(v).toFixed(1);
const clock = v => `${Math.floor(v / 60)}:${(v % 60).toFixed(1).padStart(4, '0')}`;
// Media events own domain state; one visual sampler owns continuous progress.
// Never extrapolate time or ease toward a stale timeupdate timestamp.
let transportState = core.getState(), transportFrame = null, pageSuspended = false;
let previousUI = '';
const playhead = $('playhead'), currentTime = $('current-time');
const waveTrack = $('wave-track');
let trackWidth = waveTrack.clientWidth;
playhead.dataset.positionSource = 'actual-media-time';
const trackResize = new ResizeObserver(entries => {
  const entry = entries.find(item => item.target === waveTrack);
  if (!entry) return;
  trackWidth = entry.contentRect.width;
  paintProgress();
});
trackResize.observe(waveTrack);
function paintProgress() {
  const state = transportState;
  const playing = state.playbackStatus === 'playing' && !audio.paused;
  let time = playing || audio.seeking ? audio.currentTime : state.currentTime;
  const limit = state.playbackMode === 'selection' ? state.selection.end : state.duration;
  time = Math.max(0, Math.min(limit, Number(time) || 0));
  // Move a stable composited stroke; no layout read, raster move or pixel snap.
  playhead.style.transform = `translate3d(${time / state.duration * trackWidth}px, 0, 0)`;
  const text = clock(time);
  if (currentTime.textContent !== text) currentTime.textContent = text;
  const signal = audioSignal.sample();
  scene?.setSpectrum(signal);
  scene?.setPlayback(time, playing && !pageSuspended && !document.hidden);
  clipPreviews?.update({...state,currentTime:time},signal);
}
function stopProgress() {
  if (transportFrame !== null) cancelAnimationFrame(transportFrame);
  transportFrame = null;
}
function canSampleProgress() {
  return !pageSuspended && !document.hidden && !audio.paused && !audio.seeking &&
    transportState.playbackStatus === 'playing';
}
function requestProgress() {
  if (transportFrame === null && canSampleProgress()) transportFrame = requestAnimationFrame(sampleProgress);
}
function sampleProgress() {
  transportFrame = null;
  if (!canSampleProgress()) return;
  paintProgress();
  requestProgress();
}
function syncProgress() {
  if (!canSampleProgress()) { stopProgress(); paintProgress(); }
  else if (transportFrame === null) { paintProgress(); requestProgress(); }
}
function receiveState(state) {
  transportState = state;
  // Selection playback emits its boundary checks every ~20 ms. Those checks
  // need not rewrite fields, library actions or other unchanged controls.
  const {currentTime: ignoredTime, ...ui} = state;
  const signature = JSON.stringify(ui);
  if (signature !== previousUI) { previousUI = signature; render(state); }
  syncProgress();
}
function feedback(message = '', error = false) {
  if ($('feedback').textContent !== message) $('feedback').textContent = message;
  $('feedback').classList.toggle('error', error);
}
function result(value, success) {
  if (value?.cancelled) return;
  if (value?.ok === false) feedback(value.error?.message || 'This action could not be completed.', true);
  else if (success) feedback(success + (value?.persisted === false ? ' Kept in this tab only.' : ''));
  return value;
}
async function action(fn, success) {
  try { return result(await fn(), success); }
  catch (error) { feedback(error.message || 'This action could not be completed.', true); }
}
function pathFor(values, width = 1000, height = 140) {
  if (!values.length) return '';
  const maximum = Math.max(...peaks, .01);
  const points = values.map((v, i) => [i * width / Math.max(1, values.length - 1), Math.min(1, v / maximum) * height * .45]);
  return `M0 ${height / 2} ` + points.map(([x, y]) => `L${x.toFixed(2)} ${(height / 2 - y).toFixed(2)}`).join(' ') + ' ' + points.reverse().map(([x, y]) => `L${x.toFixed(2)} ${(height / 2 + y).toFixed(2)}`).join(' ') + ' Z';
}
function drawWaveform() {
  const path = pathFor(peaks);
  $('wave-path').setAttribute('d', path);
  $('selected-path').setAttribute('d', path);
  const svg=$('waveform'), namespace=svg.namespaceURI;
  let light=$('wave-backlight'), selectedLight=$('selection-backlight');
  if(!light){
    const filter=document.createElementNS(namespace,'filter');filter.id='wave-transmission';
    filter.setAttribute('x','-5%');filter.setAttribute('y','-45%');filter.setAttribute('width','110%');filter.setAttribute('height','190%');
    const blur=document.createElementNS(namespace,'feGaussianBlur');blur.setAttribute('stdDeviation','5');filter.append(blur);svg.querySelector('defs').append(filter);
    light=document.createElementNS(namespace,'path');light.id='wave-backlight';light.setAttribute('fill','#d9ffff');light.setAttribute('opacity','.72');light.setAttribute('filter','url(#wave-transmission)');
    selectedLight=document.createElementNS(namespace,'path');selectedLight.id='selection-backlight';selectedLight.setAttribute('fill','#f2ffae');selectedLight.setAttribute('opacity','.90');selectedLight.setAttribute('filter','url(#wave-transmission)');selectedLight.setAttribute('clip-path','url(#selection-clip)');
    svg.insertBefore(light,$('wave-path'));svg.insertBefore(selectedLight,$('wave-path'));
  }
  light.setAttribute('d',path);selectedLight.setAttribute('d',path);
}
function setBoundary(which, value) {
  const state = core.getState();
  const start = which === 'start' ? value : state.selection.start;
  const end = which === 'end' ? value : state.selection.end;
  return result(core.setSelection(start, end));
}
function commitFields() {
  const start = $('start').value === '' ? NaN : Number($('start').value);
  const end = $('end').value === '' ? NaN : Number($('end').value);
  const response = core.setSelection(start, end);
  $('start').setAttribute('aria-invalid', String(!response.ok));
  $('end').setAttribute('aria-invalid', String(!response.ok));
  return result(response);
}
function miniature(clip) {
  const start = Math.floor(clip.start / core.getState().duration * peaks.length);
  const end = Math.max(start + 2, Math.ceil(clip.end / core.getState().duration * peaks.length));
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 220 70'); svg.setAttribute('preserveAspectRatio', 'none'); svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(svg.namespaceURI, 'path');
  const values=peaks.slice(start,end), maximum=Math.max(...peaks,.01);
  path.setAttribute('d',values.map((value,i)=>{const x=i*220/Math.max(1,values.length-1),h=Math.min(1,value/maximum)*30;return `M${x.toFixed(2)} ${(35-h).toFixed(2)}v${(h*2).toFixed(2)}`;}).join(''));
  path.setAttribute('fill','none');path.setAttribute('stroke','#337f6f');path.setAttribute('stroke-opacity','.48');path.setAttribute('stroke-width','.8');
  svg.append(path);return svg;
}
function drawLibrary(state) {
  const signature = JSON.stringify([state.clips, state.activeId]);
  if (signature === previousClips) return;
  previousClips = signature;
  const oldFocus = document.activeElement?.dataset;
  const focusClip = oldFocus?.clip, focusAction = oldFocus?.action;
  $('clip-list').replaceChildren();
  state.clips.forEach(clip => {
    const card = document.createElement('li');card.className = 'clip-card' + (clip.id === state.activeId ? ' active' : '');
    const choose = document.createElement('button');choose.className = 'clip-choose';choose.type = 'button';choose.dataset.clip = clip.id;choose.dataset.action = 'choose';choose.setAttribute('aria-pressed', String(clip.id === state.activeId));choose.setAttribute('aria-label', `Edit ${clip.label}`);
    const label = document.createElement('span');label.className = 'clip-label';label.textContent = clip.label;
    const range = document.createElement('span');range.className = 'clip-range';range.textContent = `${decimal(clip.end - clip.start)} s · ${decimal(clip.start)} – ${decimal(clip.end)}`;
    const art=document.createElement('span');art.className='clip-art';art.dataset.clip=clip.id;art.setAttribute('aria-hidden','true');
    const still=document.createElement('canvas');still.className='clip-still';still.width=220;still.height=70;
    art.append(miniature(clip),still);
    choose.append(art, label, range);choose.addEventListener('click', () => {
      if (!result(core.choose(clip.id))?.ok) return;
      feedback('Excerpt selected. Edit its label or boundaries above.');
      $('label').focus({preventScroll:true});
      $('fragment-form').scrollIntoView({behavior:motion.matches ? 'instant' : 'smooth', block:'center'});
    });
    const actions = document.createElement('div');actions.className = 'clip-actions';
    const replay = document.createElement('button');replay.type = 'button';replay.textContent = 'Replay';replay.dataset.clip = clip.id;replay.dataset.action = 'replay';replay.setAttribute('aria-label', `Replay ${clip.label}`);replay.disabled = state.loadStatus !== 'ready';replay.addEventListener('click', () => {
      const current = core.getState();
      if (current.activeId === clip.id && current.playbackMode === 'selection' && ['playing', 'starting'].includes(current.playbackStatus)) core.pause();
      else if (result(core.choose(clip.id))?.ok) action(() => playAudio());
    });
    const remove = document.createElement('button');remove.type = 'button';remove.className = 'remove';remove.textContent = 'Remove';remove.dataset.clip = clip.id;remove.dataset.action = 'remove';remove.setAttribute('aria-label', `Remove ${clip.label}`);remove.addEventListener('click', () => { result(core.remove(clip.id), 'Excerpt removed.'); const first = $('clip-list').querySelector('button');(first || $('label')).focus(); });
    actions.append(replay, remove);card.append(choose, actions);$('clip-list').append(card);
  });
  if (focusClip) [...$('clip-list').querySelectorAll('button')].find(b => b.dataset.clip === focusClip && b.dataset.action === focusAction)?.focus({preventScroll:true});
  $('empty-library').hidden = state.clips.length > 0;
  $('clip-count').textContent = `${state.clips.length} excerpt${state.clips.length === 1 ? '' : 's'}`;
  $('rail-count').textContent = state.clips.length;
  clipPreviews?.refresh(state.clips);
}
function render(state) {
  const ready = state.loadStatus === 'ready';
  const playing = ['playing', 'starting'].includes(state.playbackStatus);
  $('play').disabled = !ready; $('restart').disabled = !ready; $('preview').disabled = !ready;
  $('play').setAttribute('aria-label', playing ? 'Pause selection' : 'Play selection');
  setPlayIcon($('play-icon'), playing);
  const selectionPlaying = playing && state.playbackMode === 'selection';
  setPlayIcon($('preview-icon'), selectionPlaying);
  $('preview-label').textContent = selectionPlaying ? 'Pause fragment' : 'Play fragment';
  $('duration-time').textContent = clock(state.duration);
  const signature = JSON.stringify([state.selection, state.duration]);
  if (signature !== lastSelection) {
    lastSelection = signature;
    const {start, end} = state.selection;
    for (const [id, value] of [['start', start], ['end', end]]) {
      if (document.activeElement !== $(id)) $(id).value = decimal(value);
      $(id).max = state.duration;
      const handle = $(id + '-handle');handle.style.left = `${value / state.duration * 100}%`;handle.querySelector('span').textContent = decimal(value);
      handle.setAttribute('aria-valuenow', value);handle.setAttribute('aria-valuemax', state.duration);handle.setAttribute('aria-valuetext', `${decimal(value)} seconds`);
    }
    $('selected-region').style.left = `${start / state.duration * 100}%`;
    $('selected-region').style.width = `${(end - start) / state.duration * 100}%`;
    $('clip-rect').setAttribute('x', start / state.duration * 1000);$('clip-rect').setAttribute('width', (end - start) / state.duration * 1000);
    $('interval-length').textContent = `${decimal(end - start)} s`;
    $('fragment-detail').textContent = `${decimal(end - start)} seconds · from ${decimal(start)} to ${decimal(end)}`;
    scene?.setSelection(start, end, state.duration);
    if ($('ribbon-scene').dataset.mode === 'fallback') fallbackScene();
  }
  if (document.activeElement !== $('label')) $('label').value = state.label;
  $('fragment-heading').textContent = state.label.trim() || 'Untitled fragment';
  $('fragment-kind').textContent = state.activeId ? 'Selected excerpt' : 'New fragment';
  $('update').hidden = !state.activeId;
  const loadMessage = state.loadStatus === 'loading' ? 'Loading the recording…' : state.loadStatus === 'error' ? 'The recording could not load. Retry to continue.' : 'Play uses the selected range. Drag the handles to change it.';
  if ($('load-status').textContent !== loadMessage) $('load-status').textContent = loadMessage;
  $('retry').hidden = state.loadStatus !== 'error';
  $('storage-note').textContent = state.storageStatus === 'corrupt' ? 'Saved data could not be read. Your next save replaces it with this library.' : state.storageStatus === 'unavailable' ? (state.storageMessage || 'Storage is unavailable. Excerpts stay in this tab only.') : '';
  document.querySelector('.local-note').textContent = state.storageStatus === 'unavailable' ? 'Kept in this tab' : 'Saved on this device';
  const message = state.error?.message || '';
  if (message && message !== lastError) feedback(message, true);
  else if (!message && lastError && $('feedback').textContent === lastError) feedback();
  lastError = message;
  drawLibrary(state);
  document.querySelectorAll('.clip-actions button[data-action="replay"]').forEach(button => {
    button.disabled = !ready;
    const isPlaying = selectionPlaying && button.dataset.clip === state.activeId;
    const text = isPlaying ? 'Pause' : 'Replay';
    if (button.textContent !== text) button.textContent = text;
    const clip = state.clips.find(item => item.id === button.dataset.clip);
    const name = `${text} ${clip?.label || 'excerpt'}`;
    if (button.getAttribute('aria-label') !== name) button.setAttribute('aria-label', name);
  });
}

core.setSelection(6.2, 11.8);core.setLabel('Two bright calls');
core.subscribe(receiveState);
audio.addEventListener('seeking', () => { stopProgress(); paintProgress(); });
audio.addEventListener('seeked', syncProgress);
audio.addEventListener('pause', syncProgress);
document.addEventListener('visibilitychange', syncProgress);
window.addEventListener('pageshow', () => { pageSuspended = false; syncProgress(); });
$('play').addEventListener('click', () => { if (['playing', 'starting'].includes(core.getState().playbackStatus)) core.pause(); else action(() => playAudio()); });
$('restart').addEventListener('click', () => result(core.seek(core.getState().selection.start)));
$('preview').addEventListener('click', () => { const s = core.getState();if (['playing', 'starting'].includes(s.playbackStatus) && s.playbackMode === 'selection') core.pause();else action(() => playAudio()); });
$('label').addEventListener('input', event => { core.setLabel(event.target.value);$('label').removeAttribute('aria-invalid'); });
for (const id of ['start', 'end']) {
  $(id).addEventListener('change', () => { if(commitFields()?.ok) feedback(); });
  $(id).addEventListener('blur', () => { if ($(id).getAttribute('aria-invalid') !== 'true') $(id).value = decimal(core.getState().selection[id]); });
}
$('fragment-form').addEventListener('submit', event => { event.preventDefault();if (!commitFields()?.ok) return;core.setLabel($('label').value);const response = result(core.save(), 'Saved to your library.');$('label').setAttribute('aria-invalid', String(response?.ok === false));if (!response?.ok) $('label').focus(); });
$('update').addEventListener('click', () => { if (!commitFields()?.ok) return;core.setLabel($('label').value);result(core.update(), 'Excerpt updated.'); });
$('retry').addEventListener('click', loadRecording);
for (const which of ['start', 'end']) {
 const handle = $(which + '-handle');
 handle.addEventListener('keydown', event => {
  const state = core.getState(), step = event.shiftKey ? 1 : .1;let value = state.selection[which];
  if (['ArrowRight', 'ArrowUp'].includes(event.key)) value += step;
  else if (['ArrowLeft', 'ArrowDown'].includes(event.key)) value -= step;
  else if(event.key === 'Home') value = which === 'start' ? 0 : state.selection.start + .1;
  else if(event.key === 'End') value = which === 'end' ? state.duration : state.selection.end - .1;
  else return;
  event.preventDefault();value = Math.max(0, Math.min(state.duration, value));
  value = which === 'start' ? Math.min(value, state.selection.end - .1) : Math.max(value, state.selection.start + .1);
  setBoundary(which, Number(value.toFixed(2)));
 });
 handle.addEventListener('pointerdown', event => { if (drag || event.button !== 0) return;event.preventDefault();drag = {which, id:event.pointerId};handle.setPointerCapture(event.pointerId);handle.focus({preventScroll:true}); });
 handle.addEventListener('pointermove', event => {
  if (!drag || event.pointerId !== drag.id) return;
  const box = $('wave-track').getBoundingClientRect(), state = core.getState();
  let value = Math.max(0, Math.min(state.duration, (event.clientX - box.left) / box.width * state.duration));
  value = which === 'start' ? Math.min(value, state.selection.end - .1) : Math.max(value, state.selection.start + .1);
  setBoundary(which, Math.round(value * 10) / 10);
 });
 for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) handle.addEventListener(name, event => { if (drag?.id === event.pointerId) drag = null; });
}
$('wave-track').addEventListener('click', event => { if (event.target.closest('.handle')) return;const box = event.currentTarget.getBoundingClientRect();result(core.seek((event.clientX - box.left) / box.width * core.getState().duration)); });
async function loadScene() {
 const generation=++sceneGeneration;
 clipPreviews?.destroy();clipPreviews=null;
 scene?.destroy();scene = null;
 $('ribbon-scene').querySelector('[data-fallback]')?.remove();
 try { const [{createRibbonScene},{createClipPreviews}]=await Promise.all([import('./ribbon-renderer.js'),import('./clip-previews.js')]);if(generation!==sceneGeneration||pageSuspended)return;scene = createRibbonScene($('ribbon-scene'), {peaks, reducedMotion:motion.matches, onStatus: info => { $('ribbon-scene').dataset.mode = info.mode;if(info.mode === 'fallback') fallbackScene(); else $('ribbon-scene').querySelector('[data-fallback]')?.remove(); }});const state = core.getState();scene.setSelection(state.selection.start, state.selection.end, state.duration);clipPreviews=createClipPreviews($('clip-list'),{createScene:createRibbonScene,peaks,duration:state.duration,reducedMotion:motion.matches,profile:hoverProfile});clipPreviews.refresh(state.clips);paintProgress(); }
 catch { fallbackScene(); }
}
function fallbackScene() {
 const host = $('ribbon-scene'), state = core.getState(), svg = miniature({start:state.selection.start,end:state.selection.end});
 host.dataset.mode = 'fallback';host.querySelector('[data-fallback]')?.remove();
 svg.dataset.fallback = '';svg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;opacity:.65';host.append(svg);
}
fetch('assets/sample.json').then(response => {if(!response.ok) throw Error('Waveform metadata unavailable.');return response.json();}).then(metadata => {peaks = metadata.waveformPeaks || [];drawWaveform();previousClips = '';drawLibrary(core.getState());loadScene();}).catch(() => {feedback('Waveform preview is unavailable. You can still edit the interval using Start and End.', true);loadScene();});
motion.addEventListener('change', loadScene);
fetch('assets/hover-spectrum.json').then(r=>{if(!r.ok)throw Error('No silent preview');return r.json();}).then(profile=>{hoverProfile=profile;clipPreviews?.setProfile(profile);}).catch(()=>{});
loadRecording();
window.addEventListener('pagehide', event => {pageSuspended = true;stopProgress();paintProgress();if (!event.persisted) {recordingRequest?.abort();if(recordingUrl)URL.revokeObjectURL(recordingUrl);trackResize.disconnect();scene?.destroy();clipPreviews?.destroy();core.destroy();audioSignal.destroy();}});
for (const button of document.querySelectorAll('.round,.glass-button,.save-button')) {
  button.addEventListener('pointermove', event => {
    if (motion.matches || event.pointerType === 'touch') return;
    const box = button.getBoundingClientRect();button.style.setProperty('--light-x', `${(event.clientX - box.left) / box.width * 100}%`);button.style.setProperty('--light-y', `${(event.clientY - box.top) / box.height * 100}%`);
  });
  button.addEventListener('pointerleave', () => {button.style.removeProperty('--light-x');button.style.removeProperty('--light-y');});
}
