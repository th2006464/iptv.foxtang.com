import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { EMPTY_STATE } from '../src/store.js';
import { getReferenceChannels, installReferenceCatalog } from '../src/hd-reference-catalog.js';
import { mergeTemporarySession, TEMPORARY_SESSION_MODE } from '../src/temporary-session.js';

const reference = getReferenceChannels();
function fakeM3u(expires = 1893456000) {
  return '#EXTM3U\n' + reference.map(c =>
    '#EXTINF:-1 tvg-id="' + c.referenceId + '" tvg-name="' + c.name + '",' + c.name +
    '\nhttps://hd.rip/stream/test' + c.referenceId +
    '/playlist.m3u8?e=' + expires + '&s=LOCAL_DEMO_ONLY&tid=LOCAL_TEST&tsum=DEMO'
  ).join('\n');
}
test('one-off M3U adds exactly one in-memory line per 184 reference channels, without new rows', () => {
  const initial = installReferenceCatalog(EMPTY_STATE());
  const copy = structuredClone(initial);
  const merged = mergeTemporarySession(initial, fakeM3u(), Date.UTC(2026,9,20));
  assert.equal(reference.length,184);
  assert.equal(merged.matched,184);
  assert.equal(merged.active,184);
  assert.equal(merged.expired,0);
  assert.equal(merged.state.channels.length,initial.channels.length);
  assert.deepEqual(merged.state.sources,initial.sources);
  assert.deepEqual(initial,copy, 'never mutate the IndexedDB state snapshot');
  const arirang = merged.state.channels.find(c => c.id === 'ref-155');
  assert.match(arirang.streams[0].url,/^https:\/\/hd\.rip\/stream\//);
  assert.match(arirang.streams[0].label,/临时测试/);
  assert.equal(merged.state.channels.filter(c=>c.sourceId==='mediahub-hd-reference-v1').length,184);
});
test('expired signed URLs are omitted and not leaked into the rendered stream state', () => {
  const initial = installReferenceCatalog(EMPTY_STATE());
  const merged = mergeTemporarySession(initial, fakeM3u(1790000000), Date.UTC(2027,1,1));
  assert.equal(merged.expired,184);
  assert.equal(merged.active,0);
  assert.ok(!merged.state.channels.some(c => c.streams.some(s=>s.url.includes('LOCAL_DEMO_ONLY'))));
});
test('reject unrelated hosts and channel numbering instead of importing arbitrary HTML/test payload', () => {
  const initial=installReferenceCatalog(EMPTY_STATE());
  assert.throws(()=>mergeTemporarySession(initial, fakeM3u().replaceAll('https://hd.rip/', 'https://example.com/')),/短期签名/);
  assert.throws(()=>mergeTemporarySession(initial, fakeM3u().replace('tvg-id="155"','tvg-id="999999"')),/不匹配/);
  assert.throws(()=>mergeTemporarySession(initial, '#EXTM3U\n#EXTINF:-1,Test\nhttps://example.com/test.m3u8'),/100–184/);
});
test('temporary test mode is opt-in via opener nonce, memory-only and not publicly bundled', async () => {
  const source=await readFile(new URL('../src/main.js',import.meta.url),'utf8');
  const asset=await readFile(new URL('../index.html',import.meta.url),'utf8');
  assert.equal(TEMPORARY_SESSION_MODE,'one-off-hls-test-v1');
  assert.match(source,/params\.get\('oneOffTest'\) !== '1' \|\| !window\.opener/);
  assert.match(source,/event\.source !== window\.opener/);
  assert.match(source,/event\.data\.nonce !== nonce/);
  assert.match(source,/canPersist = false;[\s\S]{0,90}state = result\.state/);
  assert.doesNotMatch(source,/hd\.rip\/stream\/[a-z_0-9]+\/playlist\.m3u8\?e=\d+/i);
  assert.match(asset,/main\.js\?v=20261020-oneoff15/);
  assert.match(asset,/styles\.css\?v=20261020-oneoff15/);
});
