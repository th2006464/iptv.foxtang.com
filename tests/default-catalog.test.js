import test from 'node:test';
import assert from 'node:assert/strict';
import { PUBLIC_SOURCE, PUBLIC_SOURCE_ID, PUBLIC_BOOTSTRAP_FLAG, getPublicChannels } from '../src/public-catalog.js';
import { EMPTY_STATE, appendSource, removeSource, toggleFavorite } from '../src/store.js';

test('public catalog has stable identities and valid first-party/CDN HTTPS streams', () => {
  const first = getPublicChannels();
  const next = getPublicChannels();
  assert.equal(first.length, 18);
  assert.deepEqual(first, next);
  assert.equal(new Set(first.map((channel) => channel.id)).size, first.length);
  assert.equal(PUBLIC_SOURCE.id, PUBLIC_SOURCE_ID);
  assert.equal(PUBLIC_SOURCE.type, 'builtin');
  assert.equal(typeof PUBLIC_BOOTSTRAP_FLAG, 'string');
  for (const channel of first) {
    assert.equal(channel.sourceId, PUBLIC_SOURCE_ID);
    assert.ok(channel.name && channel.group && channel.tvgId);
    assert.ok(channel.streams.length > 0);
    for (const stream of channel.streams) {
      const url = new URL(stream.url);
      assert.equal(url.protocol, 'https:');
      assert.equal(url.username, '');
      assert.equal(url.password, '');
      assert.equal(stream.kind, 'hls');
      assert.ok(url.hostname.length > 2);
    }
  }
});

test('built-in public source can be disabled or deleted without affecting private sources', () => {
  const publicChannels = getPublicChannels();
  const customChannel = {
    id: 'custom-one', sourceId: 'custom-playlist', name: 'Private channel',
    streams: [{ url: 'https://example.org/test.m3u8', kind: 'hls', label: 'Primary' }]
  };
  let state = appendSource(EMPTY_STATE(), PUBLIC_SOURCE, publicChannels);
  state = appendSource(state, { id: 'custom-playlist', type: 'file', enabled: true, name: 'my playlist' }, [customChannel]);
  state = toggleFavorite(state, publicChannels[0].id);
  state = toggleFavorite(state, customChannel.id);
  state = { ...state, sources: state.sources.map(s => s.id === PUBLIC_SOURCE_ID ? { ...s, enabled: false } : s) };
  assert.equal(state.sources.find(s => s.id === PUBLIC_SOURCE_ID).enabled, false);
  state = removeSource(state, PUBLIC_SOURCE_ID);
  assert.equal(state.channels.length, 1);
  assert.equal(state.channels[0].id, customChannel.id);
  assert.deepEqual(state.favorites, [customChannel.id]);
});
