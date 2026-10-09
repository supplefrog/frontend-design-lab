// Real HTMLAudioElement controller. No source or visual presentation is imposed.
export function createAudioCore(audio, options = {}) {
  const expectedDuration = Number.isFinite(options.expectedDuration) && options.expectedDuration > 0
    ? options.expectedDuration : 30;
  const storageKey = options.storageKey || 'field-audio.excerpts.v1';
  const listeners = new Set();
  const removers = [];
  let storage;
  let timer = null;
  let generation = 0;
  let destroyed = false;
  let state = {
    loadStatus: audio.readyState >= 1 ? 'ready' : 'loading',
    playbackStatus: 'idle', playbackMode: null, currentTime: audio.currentTime || 0,
    duration: expectedDuration, selection: { start: 0, end: Math.min(10, expectedDuration) },
    label: '', activeId: null, clips: [], error: null,
    storageStatus: 'available', storageMessage: null,
  };
  const snapshot = () => ({ ...state, selection: { ...state.selection },
    clips: state.clips.map(clip => ({ ...clip })), error: state.error && { ...state.error } });
  const emit = () => { if (!destroyed) for (const fn of listeners) fn(snapshot()); };
  const fail = (kind, message) => {
    state.error = { kind, message }; emit(); return { ok: false, error: { ...state.error } };
  };
  const validRange = (start, end, duration = state.duration) => {
    if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
    start = Math.max(0, Math.min(duration, start));
    end = Math.max(0, Math.min(duration, end));
    return end > start ? { start, end } : null;
  };
  const stopTimer = () => { if (timer !== null) clearTimeout(timer); timer = null; };
  const cancelPlayback = () => {
    generation++; stopTimer(); audio.pause(); state.currentTime = audio.currentTime || 0;
    state.playbackStatus = 'paused'; state.playbackMode = null;
  };
  const persist = () => {
    if (!storage) return;
    try {
      storage.setItem(storageKey, JSON.stringify({ version: 1, clips: state.clips }));
      state.storageStatus = 'available'; state.storageMessage = null;
    } catch {
      state.storageStatus = 'unavailable';
      state.storageMessage = 'Changes remain in this tab; browser storage could not save them.';
    }
  };
  let readingStorage = true;
  try {
    storage = Object.prototype.hasOwnProperty.call(options, 'storage') ? options.storage : globalThis.localStorage;
    if (!storage) throw new Error('Unavailable');
    const raw = storage.getItem(storageKey);
    readingStorage = false;
    if (raw !== null) {
      const data = JSON.parse(raw);
      if (!data || data.version !== 1 || !Array.isArray(data.clips)) throw new Error('Invalid data');
      const ids = new Set();
      for (const clip of data.clips) {
        const range = clip && validRange(clip.start, clip.end);
        if (!range || typeof clip.id !== 'string' || !clip.id || ids.has(clip.id) ||
            typeof clip.label !== 'string' || !clip.label.trim()) throw new Error('Invalid excerpt');
        ids.add(clip.id);
        state.clips.push({ id: clip.id, label: clip.label.trim(), ...range });
      }
    }
  } catch {
    state.clips = [];
    state.storageStatus = readingStorage ? 'unavailable' : 'corrupt';
    state.storageMessage = !readingStorage
      ? 'Saved data could not be read. It has not been overwritten; saving a new excerpt replaces it.'
      : 'Browser storage is unavailable. Excerpts will remain only in this tab.';
  }
  const on = (name, fn) => { audio.addEventListener(name, fn); removers.push(() => audio.removeEventListener(name, fn)); };
  const metadata = () => {
    if (!Number.isFinite(audio.duration) || audio.duration <= 0) {
      state.loadStatus = 'error'; fail('load', 'The recording has no usable duration.'); return;
    }
    state.duration = audio.duration;
    state.selection = validRange(state.selection.start, state.selection.end) || { start: 0, end: audio.duration };
    // Reconcile retained intervals with the loaded media rather than a preview duration.
    state.clips = state.clips.flatMap(clip => {
      const range = validRange(clip.start, clip.end);
      return range ? [{ ...clip, ...range }] : [];
    });
    state.loadStatus = 'ready';
    if (state.error?.kind === 'load') state.error = null;
    emit();
  };
  const finishInterval = () => {
    const end = state.selection.end;
    generation++; stopTimer(); audio.pause();
    try { audio.currentTime = end; } catch { /* Media errors are reported by the audio error event. */ }
    state.currentTime = end; state.playbackStatus = 'ended'; state.playbackMode = null; emit();
  };
  const checkInterval = () => {
    if (destroyed || state.playbackMode !== 'selection' || state.playbackStatus !== 'playing') return;
    if (audio.currentTime >= state.selection.end) { finishInterval(); return; }
    state.currentTime = audio.currentTime; emit();
    timer = setTimeout(checkInterval, Math.max(4, Math.min(20, (state.selection.end - audio.currentTime) * 1000)));
  };
  on('loadedmetadata', metadata);
  on('durationchange', () => { if (Number.isFinite(audio.duration) && audio.duration > 0) metadata(); });
  on('timeupdate', () => {
    state.currentTime = audio.currentTime;
    if (state.playbackMode === 'selection' && state.playbackStatus === 'playing' && audio.currentTime >= state.selection.end) finishInterval();
    else emit();
  });
  on('pause', () => {
    stopTimer();
    if (state.playbackStatus === 'playing') {
      generation++; state.playbackStatus = 'paused'; state.playbackMode = null;
      state.currentTime = audio.currentTime; emit();
    }
  });
  on('ended', () => {
    generation++; stopTimer(); state.currentTime = audio.currentTime;
    state.playbackStatus = 'ended'; state.playbackMode = null; emit();
  });
  on('error', () => {
    cancelPlayback(); state.loadStatus = 'error'; state.playbackStatus = 'error';
    const messages = { 1: 'Recording loading was interrupted.', 2: 'The recording could not be loaded.',
      3: 'The recording could not be decoded.', 4: 'The recording is missing or unsupported.' };
    fail('load', messages[audio.error?.code] || 'The recording could not be loaded.');
  });
  if (audio.readyState >= 1) metadata();
  const play = async mode => {
    if (destroyed) return { ok: false, error: { kind: 'lifecycle', message: 'Audio controller is closed.' } };
    if (state.loadStatus !== 'ready') return fail('load', state.loadStatus === 'loading'
      ? 'The recording is still loading.' : 'Load the recording before playing.');
    cancelPlayback();
    const token = generation;
    state.error = null; state.playbackMode = mode; state.playbackStatus = 'starting';
    try {
      // Full playback resumes the playhead; interval playback always starts at its boundary.
      if (mode === 'selection') audio.currentTime = state.selection.start;
      else if (audio.currentTime >= state.duration) audio.currentTime = 0;
      state.currentTime = audio.currentTime; emit();
      await audio.play();
      if (destroyed || token !== generation) return { ok: false, cancelled: true };
      if (audio.paused) {
        state.playbackStatus = 'paused'; state.playbackMode = null; emit();
        return { ok: false, cancelled: true };
      }
      state.playbackStatus = 'playing'; emit();
      if (mode === 'selection') checkInterval();
      return { ok: true };
    } catch (error) {
      if (destroyed || token !== generation) return { ok: false, cancelled: true };
      stopTimer(); state.playbackStatus = 'error'; state.playbackMode = null;
      return fail('play', error?.name === 'NotAllowedError'
        ? 'Playback was blocked. Use the play control again to allow audio.'
        : 'Playback failed. Try playing again.');
    }
  };
  const labelAndRange = () => {
    if (!state.label.trim()) return fail('validation', 'Add a descriptive label before retaining the excerpt.');
    if (!validRange(state.selection.start, state.selection.end)) return fail('validation', 'End must be after start.');
    return { ok: true };
  };
  return {
    getState: snapshot,
    subscribe(fn) { listeners.add(fn); fn(snapshot()); return () => listeners.delete(fn); },
    playFull: () => play('full'), playSelection: () => play('selection'),
    pause() { cancelPlayback(); emit(); return { ok: true }; },
    seek(seconds) {
      if (!Number.isFinite(seconds)) return fail('validation', 'Choose a valid playback time.');
      if (state.loadStatus !== 'ready') return fail('load', 'Wait for the recording to load before seeking.');
      cancelPlayback();
      try { audio.currentTime = Math.max(0, Math.min(state.duration, seconds)); }
      catch { return fail('play', 'The recording could not seek to that time.'); }
      state.currentTime = audio.currentTime; state.error = null; emit(); return { ok: true };
    },
    setSelection(start, end) {
      const range = validRange(start, end);
      if (!range) return fail('validation', 'Choose a nonempty interval with end after start.');
      cancelPlayback(); state.selection = range; state.error = null; emit(); return { ok: true };
    },
    setLabel(label) { state.label = String(label ?? ''); if (state.error?.kind === 'validation') state.error = null; emit(); },
    save() {
      const result = labelAndRange(); if (!result.ok) return result;
      const id = globalThis.crypto?.randomUUID?.() || `clip-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      state.clips.push({ id, label: state.label.trim(), ...state.selection });
      state.activeId = id; state.error = null; persist(); emit(); return { ok: true, id, persisted: state.storageStatus === 'available' };
    },
    choose(id) {
      const clip = state.clips.find(clip => clip.id === id);
      if (!clip) return fail('validation', 'That excerpt is no longer in the library.');
      cancelPlayback(); state.selection = { start: clip.start, end: clip.end }; state.label = clip.label;
      state.activeId = clip.id; state.error = null; emit(); return { ok: true };
    },
    update(id = state.activeId) {
      const index = state.clips.findIndex(clip => clip.id === id);
      if (index < 0) return fail('validation', 'Choose a retained excerpt before updating it.');
      const result = labelAndRange(); if (!result.ok) return result;
      state.clips[index] = { id, label: state.label.trim(), ...state.selection };
      state.activeId = id; state.error = null; persist(); emit(); return { ok: true, id, persisted: state.storageStatus === 'available' };
    },
    remove(id = state.activeId) {
      const index = state.clips.findIndex(clip => clip.id === id);
      if (index < 0) return fail('validation', 'That excerpt is no longer in the library.');
      if (state.activeId === id) { cancelPlayback(); state.activeId = null; }
      state.clips.splice(index, 1); state.error = null; persist(); emit();
      return { ok: true, persisted: state.storageStatus === 'available' };
    },
    destroy() { cancelPlayback(); destroyed = true; removers.forEach(remove => remove()); listeners.clear(); },
  };
}
