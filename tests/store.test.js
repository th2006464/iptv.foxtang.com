import test from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY_STATE, appendSource, removeSource, toggleFavorite, recordRecent } from '../src/store.js';
const s1 = { id: 's1', name: 'a' };
const s2 = { id: 's2', name: 'b' };
const c1 = { id: 'c1', sourceId: 's1' };
const c2 = { id: 'c2', sourceId: 's2' };
test('independent sources and cascade deletion', () => {
  let s = appendSource(EMPTY_STATE(), s1, [c1]);
  s = appendSource(s, s2, [c2]);
  s = toggleFavorite(s, 'c1');
  s = toggleFavorite(s, 'c2');
  s = recordRecent(s, 'c1');
  s = removeSource(s, 's1');
  assert.deepEqual(s.channels.map((c) => c.id), ['c2']);
  assert.deepEqual(s.favorites, ['c2']);
  assert.deepEqual(s.recent, []);
});
test('refresh preserves favorites when IDs are stable', () => {
  let s = appendSource(EMPTY_STATE(), s1, [c1]);
  s = toggleFavorite(s, 'c1');
  s = appendSource(s, s1, [{ ...c1, name: 'new' }], true);
  assert.deepEqual(s.favorites, ['c1']);
  assert.equal(s.channels[0].name, 'new');
});
