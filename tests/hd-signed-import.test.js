import test from 'node:test';
import assert from 'node:assert/strict';
import { HD_REFERENCE_CHANNELS } from '../src/hd-reference-channels.js';
import { EMPTY_STATE, appendSource } from '../src/store.js';
import { parseM3U, signedStreamExpiry, isExpiredSignedStream } from '../src/playlist.js';
import {
  HD_REFERENCE_SOURCE_ID, findReferenceId, matchOwnPlaylist, installReferenceCatalog
} from '../src/hd-reference-catalog.js';
import { readFile } from 'node:fs/promises';

test('every captured numeric tvg-id matches the exact HD.Rip reference, even for duplicate names', () => {
  assert.equal(HD_REFERENCE_CHANNELS.length, 184);
  for (const entry of HD_REFERENCE_CHANNELS) {
    assert.equal(findReferenceId({ tvgId: String(entry.id), name: '故意不同的频道名称' }), entry.id);
  }
  assert.equal(findReferenceId({ name: '中视' }), null);
  assert.equal(findReferenceId({ tvgId: '148', name: '中视' }), 148);
  assert.equal(findReferenceId({ tvgId: '149', name: '中视' }), 149);
});

test('an imported local 184-channel M3U attaches 184 lines to existing stations, without dropping personal sources', () => {
  const m3u = '#EXTM3U\n' + HD_REFERENCE_CHANNELS.map(item =>
    '#EXTINF:-1 tvg-id="' + item.id + '" tvg-name="' + item.name + '" group-title="HD.Rip",' + item.name
    + '\nhttps://stream.example/' + item.id + '/playlist.m3u8'
  ).join('\n');
  const sourceId = 'personal-hd-reference-snapshot-v1';
  const list = parseM3U(m3u, sourceId);
  assert.equal(list.channels.length, 184);
  const base = installReferenceCatalog(EMPTY_STATE());
  const personal = { id:'my-other-source', type:'file', name:'我的其他频道', enabled:true };
  const own = { id:'custom-1',sourceId:personal.id,name:'测试自用台',streams:[{url:'https://example.com/own.m3u8',kind:'hls'}] };
  const withOwn=appendSource(base,personal,[own]);
  const source={id:sourceId,type:'file',name:'本机 HD.Rip 频道快照',enabled:true};
  const imported=appendSource(withOwn,source,list.channels);
  const result=matchOwnPlaylist(imported, { preferSourceId:sourceId });
  assert.equal(result.matchedStations,184);
  assert.ok(result.addedLines>=160);
  assert.equal(result.state.channels.filter(c=>c.sourceId===HD_REFERENCE_SOURCE_ID).length,184);
  assert.equal(result.state.channels.filter(c=>c.sourceId===sourceId).length,184);
  assert.ok(result.state.channels.some(c=>c.id===own.id));
  assert.equal(result.state.channels.find(c=>c.id==='ref-148').streams[0].url,'https://stream.example/148/playlist.m3u8');
  assert.equal(result.state.channels.find(c=>c.id==='ref-149').streams[0].url,'https://stream.example/149/playlist.m3u8');
  const updated=appendSource(result.state,source,list.channels,true);
  assert.equal(updated.channels.filter(c=>c.sourceId===sourceId).length,184, 're-import replaces old snapshot instead of duplicating it');
});

test('most recent personal lines take precedence over an old public stream', () => {
  const prior=installReferenceCatalog(EMPTY_STATE());
  const source={id:'signed-import',type:'file',name:'我的暂时订阅',enabled:true};
  const c={id:'mine-155',sourceId:source.id,name:'阿里郎 Arirang',tvgId:'155',
    streams:[{url:'https://example.org/new-arirang.m3u8',kind:'hls'}]};
  const state=appendSource(prior,source,[c]);
  const r=matchOwnPlaylist(state,{preferSourceId:source.id});
  const ref=r.state.channels.find(item=>item.id==='ref-155');
  assert.equal(ref.streams[0].url,'https://example.org/new-arirang.m3u8');
  assert.ok(r.addedLines >= 1);
  assert.equal(matchOwnPlaylist(r.state, {preferSourceId:source.id}).addedLines,0);
});

test('signed stream expiry is parsed without requesting, renewing, or disclosing credentials', () => {
  const url='https://hd.rip/stream/test/playlist.m3u8?e=1792559778&s=DEMO_ONLY_NOT_A_SECRET&tid=DEMO';
  const expiry=1792559778000;
  assert.equal(signedStreamExpiry(url),expiry);
  assert.equal(isExpiredSignedStream(url,expiry-1),false);
  assert.equal(isExpiredSignedStream(url,expiry),true);
  assert.equal(signedStreamExpiry('https://example.com/stream.m3u8?e=1792559778&s=x'),null);
  assert.equal(signedStreamExpiry('https://hd.rip/test.m3u8?e=foo&s=x'),null);
});

test('site imports private playlists without embedding captured signed HD.Rip URLs in the repo', async () => {
  const app = await readFile(new URL('../src/main.js',import.meta.url),'utf8');
  const html = await readFile(new URL('../index.html',import.meta.url),'utf8');
  assert.match(app,/PRIVATE_HD_SNAPSHOT_ID/);
  assert.match(app,/preferSourceId: source\.id/);
  assert.match(app,/previewExpiry/);
  assert.match(app,/findReferenceId\(c\)/);
  assert.match(html,/id="manageBtn"/);
  assert.doesNotMatch(app,/hd\.rip\/stream\//);
  assert.ok(!app.includes('s=719b1e13'));
});
