import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
// Load the exact browser ES module without requiring a project-wide package.json.
const source = await readFile(new URL('../../outputs/mindlatch/notes-core.js', import.meta.url), 'utf8');
const { createNotesCore } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
function storage(initial) {
  const values = new Map(initial ? [['mindlatch.notes.v1', initial]] : []);
  return { values, getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}
function core(store = storage()) {
  let count = 0;
  return createNotesCore({ storage: store, now: () => new Date('2026-10-09T10:00:00Z'), idFactory: () => `user-${++count}` });
}

test('save, edit, favorite and links survive real serialization/reload; snapshots are isolated', () => {
  const store = storage();
  store.values.set('older-demo', '{"text":"old data must not leak"}');
  const c = core(store);
  assert.ok(c.getState().notes.every(n => n.sample && n.text.startsWith('Sample note:')));
  assert.equal(c.saveNote({ text: '  ' }).ok, false);
  const { note } = c.saveNote({ text: '  A real thought  ', tags: ' design, Design, space, ' });
  assert.equal(note.text, 'A real thought');
  assert.deepEqual(note.tags, ['Design', 'space']);
  assert.equal(note.sample, false);
  c.setFavorite(note.id, true);
  assert.deepEqual(c.toggleLink(note.id, 'sample-window'), { ok: true, linked: true });
  assert.equal(c.toggleLink(note.id, note.id).ok, false);
  assert.equal(c.toggleLink(note.id, 'missing').ok, false);
  const createdAt = note.createdAt;
  c.saveNote({ id: note.id, text: 'Edited', tags: ['new'] });
  const reload = core(store).getState();
  const actual = reload.notes.find(n => n.id === note.id);
  assert.equal(actual.text, 'Edited');
  assert.equal(actual.createdAt, createdAt);
  assert.equal(actual.favorite, true);
  assert.ok(reload.links.some(p => p.includes(note.id) && p.includes('sample-window')));
  reload.notes[0].text = 'tampered';
  assert.notEqual(c.getState().notes[0].text, 'tampered');
  assert.equal(c.toggleLink('sample-window', note.id).linked, false);
  assert.equal(c.getState().links.filter(p => p.includes(note.id)).length, 0);
  assert.equal(store.values.get('older-demo'), '{"text":"old data must not leak"}');
});

test('one deletion undo restores full note, original order and incident links', () => {
  const c = core();
  const before = c.getState();
  assert.equal(c.removeNote('sample-window').ok, true);
  assert.equal(c.getState().links.some(p => p.includes('sample-window')), false);
  assert.equal(c.getState().canUndo, true);
  assert.equal(c.undoRemove().ok, true);
  assert.deepEqual(c.getState().notes, before.notes);
  assert.deepEqual(c.getState().links, before.links);
  assert.equal(c.undoRemove().ok, false);
  c.removeNote('sample-window');
  c.removeNote('sample-walk');
  c.undoRemove();
  assert.equal(c.getState().notes.some(n => n.id === 'sample-window'), false);
  assert.equal(c.getState().notes.some(n => n.id === 'sample-walk'), true);
});

test('suggest breadth includes weaker then unmatched candidates with stable rankings', () => {
  const c = core();
  const ids = (mode, breadth) => c.getRelated('sample-window', { mode, breadth }).map(n => n.id);
  assert.deepEqual(ids('suggest', 0), ['sample-desk', 'sample-rain']);
  assert.deepEqual(ids('suggest', 50), ['sample-desk', 'sample-rain', 'sample-walk']);
  assert.equal(ids('suggest', 100).length, 5);
  assert.deepEqual(ids('suggest', 100).slice(0, 3), ids('suggest', 50));
  assert.ok(ids('nearby', 0).length < ids('nearby', 100).length);
  assert.equal(ids('manual', 0).length, 5);
  assert.deepEqual(c.getRelated('missing'), []);
});

test('denied writes retain every mutation in session and expose the failure', () => {
  const store = storage();
  store.setItem = () => { throw new Error('Quota exceeded'); };
  const c = core(store);
  assert.equal(c.getState().storage.mode, 'session');
  assert.match(c.getState().storage.error, /Quota exceeded/);
  const result = c.saveNote({ text: 'Must not be lost', tags: [] });
  assert.equal(result.ok, true);
  assert.equal(c.getState().notes.at(-1).text, 'Must not be lost');
  assert.equal(store.values.has('mindlatch.notes.v1'), false);
  store.setItem = (key, value) => store.values.set(key, value);
  c.setFavorite(result.note.id, true);
  assert.equal(c.getState().storage.mode, 'persistent');
  assert.equal(core(store).getState().notes.at(-1).text, 'Must not be lost');
});

test('broken and denied reads preserve the stored original and use honest session state', () => {
  for (const raw of ['{bad json', '{"version":99,"notes":[],"links":[]}', '{"version":1,"notes":[{}],"links":[]}']) {
    const store = storage(raw);
    const c = core(store);
    assert.equal(c.getState().storage.mode, 'session');
    assert.ok(c.getState().storage.error);
    c.saveNote({ text: 'session thought', tags: [] });
    assert.equal(store.values.get('mindlatch.notes.v1'), raw);
  }
  const c = core({ getItem() { throw new Error('Access denied'); }, setItem() { assert.fail('Must not overwrite inaccessible store'); } });
  assert.match(c.getState().storage.error, /Access denied/);
  assert.equal(c.saveNote({ text: 'Still usable', tags: [] }).ok, true);
});

test('own-key unversioned schema migrates; bad links are removed and undirected links deduplicate', () => {
  const before = core().getState();
  const store = storage(JSON.stringify({ notes: before.notes, links: [['sample-window', 'sample-desk'], ['sample-desk', 'sample-window'], ['sample-window', 'missing'], ['sample-window', 'sample-window']] }));
  const c = core(store);
  assert.equal(c.getState().links.length, 1);
  assert.equal(JSON.parse(store.values.get('mindlatch.notes.v1')).version, 1);
  assert.equal(c.getState().storage.mode, 'persistent');
});

test('subscriptions report committed state, unsubscribe and dispose stop delivery', () => {
  const c = core();
  const events = [];
  const unsubscribe = c.subscribe(s => events.push(s));
  c.setFavorite('sample-window', false);
  assert.equal(events.length, 1);
  assert.equal(events[0].notes.find(n => n.id === 'sample-window').favorite, false);
  unsubscribe();
  c.setFavorite('sample-window', true);
  assert.equal(events.length, 1);
  c.subscribe(s => events.push(s));
  c.dispose();
  c.removeNote('sample-window');
  assert.equal(events.length, 1);
});
