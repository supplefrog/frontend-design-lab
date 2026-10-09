// The notes instrument's DOM-independent state. This key never reads older demos.
const DEFAULT_KEY = 'mindlatch.notes.v1';
const MAX_TEXT = 100000;
const copy = value => JSON.parse(JSON.stringify(value));
const pair = (a, b) => [a, b].sort();
const pairKey = (a, b) => JSON.stringify(pair(a, b));

function normalizeTags(tags = []) {
  if (typeof tags === 'string') tags = tags.split(',');
  if (!Array.isArray(tags) || tags.length > 100 || tags.some(t => typeof t !== 'string' || t.length > 200)) throw new Error('Use up to 100 tags, each under 200 characters.');
  return [...new Map(tags.map(t => t.trim()).filter(Boolean).map(t => [t.toLocaleLowerCase(), t])).values()];
}

function seeds() {
  return [
    ['sample-window', 'Sample note: Morning light on the windowsill. Build a small ritual around noticing it.', ['ritual', 'attention'], true],
    ['sample-walk', 'Sample note: Take the long way home. A walk can make room for an unfinished thought.', ['ritual', 'movement'], false],
    ['sample-desk', 'Sample note: Clear one corner of the desk before starting. Make space for attention.', ['ritual', 'attention', 'space'], false],
    ['sample-colour', 'Sample note: Blue for the structure, pink for connection, yellow for the next action.', ['design', 'colour'], true],
    ['sample-question', 'Sample note: What would this idea look like if it were half the size?', ['design', 'question'], false],
    ['sample-rain', 'Sample note: Rain on the roof. Keep this ordinary moment for later.', ['attention'], false]
  ].map(([id, text, tags, favorite], i) => ({ id, text, tags, favorite, sample: true, createdAt: new Date(Date.UTC(2026, 9, 1, 9, i * 10)).toISOString(), updatedAt: new Date(Date.UTC(2026, 9, 1, 9, i * 10)).toISOString() }));
}

function parseStore(raw) {
  const value = JSON.parse(raw);
  if (!value || (value.version !== undefined && value.version !== 1) || !Array.isArray(value.notes) || !Array.isArray(value.links)) throw new Error('Stored notes have an unsupported format.');
  const ids = new Set();
  const notes = value.notes.map(n => {
    if (!n || typeof n.id !== 'string' || !n.id.trim() || ids.has(n.id) || typeof n.text !== 'string' || !n.text.trim() || n.text.length > MAX_TEXT || !Array.isArray(n.tags) || typeof n.favorite !== 'boolean' || typeof n.sample !== 'boolean' || typeof n.createdAt !== 'string' || typeof n.updatedAt !== 'string' || !Number.isFinite(Date.parse(n.createdAt)) || !Number.isFinite(Date.parse(n.updatedAt))) throw new Error('Stored notes contain invalid data.');
    ids.add(n.id);
    return { id: n.id, text: n.text.trim(), tags: normalizeTags(n.tags), favorite: n.favorite, sample: n.sample, createdAt: n.createdAt, updatedAt: n.updatedAt };
  });
  const seen = new Set();
  const links = value.links.filter(p => Array.isArray(p) && p.length === 2 && p[0] !== p[1] && ids.has(p[0]) && ids.has(p[1])).map(p => pair(...p)).filter(p => { const key = pairKey(...p); if (seen.has(key)) return false; seen.add(key); return true; });
  return { notes, links };
}

export function createNotesCore(options = {}) {
  const storageKey = options.storageKey ?? DEFAULT_KEY;
  const now = options.now ?? (() => new Date());
  const idFactory = options.idFactory ?? (() => globalThis.crypto?.randomUUID?.() ?? `note-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  let storage;
  let writable = true;
  let status = { mode: 'persistent', error: null };
  let data = { notes: seeds(), links: [['sample-desk', 'sample-window']] };
  let removed = null;
  const listeners = new Set();
  try {
    storage = Object.hasOwn(options, 'storage') ? options.storage : globalThis.localStorage;
    if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') throw new Error('Browser storage is unavailable.');
    const raw = storage.getItem(storageKey);
    if (raw !== null) data = parseStore(raw);
  } catch (error) {
    writable = false;
    status = { mode: 'session', error: `${error.message || 'Unable to read browser storage.'} Changes are kept for this session only.` };
  }
  function persist() {
    if (!writable) return;
    try {
      storage.setItem(storageKey, JSON.stringify({ version: 1, ...data }));
      status = { mode: 'persistent', error: null };
    } catch (error) {
      status = { mode: 'session', error: `${error.message || 'Unable to write browser storage.'} Changes are kept for this session only.` };
    }
  }
  const getState = () => copy({ ...data, storage: status, canUndo: Boolean(removed) });
  function commit() {
    persist();
    // One subscriber must not prevent other subscribers or corrupt a completed save.
    for (const listener of listeners) { try { listener(getState()); } catch (error) { globalThis.console?.error('Mindlatch subscriber failed', error); } }
  }
  persist();
  const find = id => data.notes.find(n => n.id === id);
  return {
    getState,
    subscribe(listener) { if (typeof listener !== 'function') throw new TypeError('Listener must be a function.'); listeners.add(listener); return () => listeners.delete(listener); },
    saveNote({ id, text, tags } = {}) {
      if (typeof text !== 'string' || !text.trim()) return { ok: false, error: 'Write a thought before saving.' };
      if (text.length > MAX_TEXT) return { ok: false, error: 'Keep a note under 100,000 characters.' };
      let normalized;
      try { normalized = normalizeTags(tags); } catch (error) { return { ok: false, error: error.message }; }
      const existing = id === undefined ? null : find(id);
      if (id !== undefined && !existing) return { ok: false, error: 'This note no longer exists.' };
      let timestamp, nextId;
      try {
        timestamp = now().toISOString();
        nextId = existing?.id ?? idFactory();
        if (typeof nextId !== 'string' || !nextId.trim() || (!existing && find(nextId))) throw new Error('Cannot create a unique note ID.');
      } catch (error) { return { ok: false, error: error.message }; }
      const note = existing ? { ...existing, text: text.trim(), tags: normalized, updatedAt: timestamp } : { id: nextId, text: text.trim(), tags: normalized, favorite: false, sample: false, createdAt: timestamp, updatedAt: timestamp };
      if (existing) data.notes[data.notes.indexOf(existing)] = note;
      else data.notes.push(note);
      commit();
      return { ok: true, note: copy(note) };
    },
    removeNote(id) {
      const index = data.notes.findIndex(n => n.id === id);
      if (index < 0) return { ok: false, error: 'This note no longer exists.' };
      removed = { note: copy(data.notes[index]), index, links: copy(data.links.filter(p => p.includes(id))) };
      data.notes.splice(index, 1);
      data.links = data.links.filter(p => !p.includes(id));
      commit();
      return { ok: true };
    },
    undoRemove() {
      if (!removed) return { ok: false, error: 'There is no deletion to undo.' };
      if (find(removed.note.id)) return { ok: false, error: 'A note with that ID already exists.' };
      data.notes.splice(Math.min(removed.index, data.notes.length), 0, removed.note);
      for (const p of removed.links) if (p.every(find) && !data.links.some(link => pairKey(...link) === pairKey(...p))) data.links.push(p);
      removed = null;
      commit();
      return { ok: true };
    },
    setFavorite(id, value) {
      const note = find(id);
      if (!note) return { ok: false, error: 'This note no longer exists.' };
      if (typeof value !== 'boolean') return { ok: false, error: 'Favorite must be on or off.' };
      note.favorite = value;
      commit();
      return { ok: true };
    },
    toggleLink(a, b) {
      if (a === b || !find(a) || !find(b)) return { ok: false, error: 'Choose two different existing notes.' };
      const index = data.links.findIndex(p => pairKey(...p) === pairKey(a, b));
      if (index >= 0) data.links.splice(index, 1);
      else data.links.push(pair(a, b));
      commit();
      return { ok: true, linked: index < 0 };
    },
    getRelated(id, { mode = 'suggest', breadth = 50 } = {}) {
      const source = find(id);
      if (!source) return [];
      breadth = Number.isFinite(Number(breadth)) ? Math.max(0, Math.min(100, Number(breadth))) : 50;
      const sourceTags = new Set(source.tags.map(t => t.toLocaleLowerCase()));
      const sourceIndex = data.notes.indexOf(source);
      const candidates = data.notes.filter(n => n.id !== id).map(n => {
        const overlap = n.tags.filter(t => sourceTags.has(t.toLocaleLowerCase())).length;
        const similarity = overlap / Math.max(1, new Set([...sourceTags, ...n.tags.map(t => t.toLocaleLowerCase())]).size);
        return { note: n, overlap, similarity, distance: Math.abs(data.notes.indexOf(n) - sourceIndex), time: Math.abs(Date.parse(n.createdAt) - Date.parse(source.createdAt)) };
      });
      if (mode === 'suggest') {
        // Tight: strong matches. Mid: any shared tag. Wide: include unmatched thoughts.
        const eligible = candidates.filter(c => breadth >= 75 || (breadth >= 35 ? c.overlap > 0 : c.similarity >= 0.5));
        eligible.sort((a, b) => b.similarity - a.similarity || b.overlap - a.overlap || a.distance - b.distance || a.note.id.localeCompare(b.note.id));
        return copy(eligible.map(c => c.note));
      }
      if (mode === 'nearby') {
        const radius = 1 + Math.floor((Math.max(1, data.notes.length - 2)) * breadth / 100);
        return copy(candidates.filter(c => c.distance <= radius).sort((a, b) => a.time - b.time || a.distance - b.distance || a.note.id.localeCompare(b.note.id)).map(c => c.note));
      }
      return copy(candidates.map(c => c.note));
    },
    dispose() { listeners.clear(); }
  };
}
