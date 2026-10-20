import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { EMPTY_STATE } from '../src/store.js';
import { installReferenceCatalog } from '../src/hd-reference-catalog.js';
import {
  PUBLIC_FEED_REFERENCE_IDS, publicStream, createBackendPayload,
  mergeBackendCatalog
} from '../src/backend-catalog.js';
import { buildPublicCatalog } from '../functions/api/channels.js';

test('all 184 reference channels are returned, but pay-only channels have no public playback addresses', async () => {
  const catalog = await buildPublicCatalog(async () => { throw new Error('offline'); });
  assert.equal(catalog.version, 1);
  assert.equal(catalog.channelCount, 184);
  assert.equal(catalog.channels.length, 184);
  assert.equal(new Set(catalog.channels.map(x => x.id)).size, 184);
  const premium = catalog.channels.filter(c => [84, 62, 61, 365, 108, 24, 164].includes(c.referenceId));
  assert.equal(premium.length, 7);
  assert.ok(premium.every(c => c.streams.length === 0));
  assert.ok(catalog.playableCount > 0);
  assert.equal(catalog.refreshed, false);
});

test('the backend fetches approved public community sources, never promotes a premium entry', async () => {
  const playlist = [
    '#EXTM3U',
    '#EXTINF:-1 tvg-id="ABCNews.us",ABC News',
    'https://abc.example.net/new/abc.m3u8',
    '#EXTINF:-1 tvg-id="HBO.tw",HBO',
    'https://example.net/stream/hbo.m3u8'
  ].join('\n');
  let fetchCalls = 0;
  const catalog = await buildPublicCatalog(async (url, options) => {
    fetchCalls++;
    assert.ok(url.startsWith('https://'));
    assert.equal(options.credentials, 'omit');
    return {
      ok: true, headers: { get: () => String(playlist.length) },
      text: async () => playlist
    };
  });
  assert.equal(fetchCalls, 2);
  assert.equal(catalog.refreshed, true);
  assert.ok(catalog.channels.find(c => c.referenceId === 2).streams
    .some(s => s.url === 'https://abc.example.net/new/abc.m3u8'));
  assert.deepEqual(catalog.channels.find(c => c.referenceId === 84).streams, []);
});

test('public catalog refuses signed HD.Rip URLs or credential-bearing links', () => {
  assert.equal(publicStream({
    url: 'https://hd.rip/video.m3u8?e=1792559778&s=FAKE_DEMO'
  }), null);
  assert.equal(publicStream({
    url: 'https://example.net/stream.m3u8?token=FAKE_DEMO'
  }), null);
  assert.equal(publicStream({
    url: 'http://example.net/live.m3u8'
  }), null);
  assert.ok(publicStream({ url: 'https://example.net/live.m3u8',kind:'hls' }));
  assert.ok(!PUBLIC_FEED_REFERENCE_IDS.includes(84));
  assert.ok(!PUBLIC_FEED_REFERENCE_IDS.includes(62));
});

test('browser sync merges central public lines without touching private sources or favorites', () => {
  const original = installReferenceCatalog(EMPTY_STATE());
  const privateSource = { id: 'mine', name: '私人授权频道', type: 'file', enabled: true };
  const personal = { id: 'private-chan',sourceId:'mine',name:'我的测试台',
    streams:[{url:'https://mine.example/stream.m3u8',kind:'hls'}] };
  const ab = original.channels.find(x => x.id === 'ref-2');
  const given = {
    ...original,
    sources: [...original.sources, privateSource],
    channels: [...original.channels.map(c=> c.id==='ref-2'?
      { ...c, streams:[{url:'https://mine.example/news.m3u8',kind:'hls',label:'我的订阅 · ABC'},
        ...c.streams]} : c),personal],
    favorites:['ref-2','private-chan']
  };
  const payload = createBackendPayload(original.channels);
  payload.channels.find(c => c.id === 'ref-2').streams.unshift({
    url:'https://fresh.example/abc-news.m3u8',kind:'hls',label:'ABC 官方公开源'
  });
  payload.channels.find(c => c.id === 'ref-84').streams.push({
    url:'https://example.org/not-authorized-hbo.m3u8',kind:'hls',label:'Unverified'
  });
  const merged = mergeBackendCatalog(given,payload);
  assert.deepEqual(merged.favorites,given.favorites);
  assert.deepEqual(merged.sources,given.sources);
  assert.ok(merged.channels.some(c=>c.id==='private-chan'));
  const abc=merged.channels.find(c=>c.id==='ref-2');
  assert.equal(abc.streams[0].url,'https://mine.example/news.m3u8');
  assert.equal(abc.streams[1].url,'https://fresh.example/abc-news.m3u8');
  assert.equal(merged.channels.find(c=>c.id==='ref-84').streams.length,0);
  assert.equal(merged.channels.length,given.channels.length);
  assert.ok(ab.streams.length);
});

test('strict catalog contracts and Pages Function integration are present', async () => {
  const main=await readFile(new URL('../src/main.js',import.meta.url),'utf8');
  const endpoint=await readFile(new URL('../functions/api/channels.js',import.meta.url),'utf8');
  const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
  assert.match(main,/fetch\('\/api\/channels\?rev=/);
  assert.match(main,/void syncPublicBackend\(\)/);
  assert.match(endpoint,/export async function onRequestGet/);
  assert.match(endpoint,/Cache-Control/);
  assert.match(endpoint,/CF_PAGES_COMMIT_SHA/);
  assert.match(endpoint,/\?build=/);
  assert.match(main,/cache: 'no-store'/);
  assert.match(html,/styles\.css\?v=20261020-freemore14/);
  assert.match(html,/main\.js\?v=20261020-freemore14/);
  const base=installReferenceCatalog(EMPTY_STATE());
  assert.throws(()=>mergeBackendCatalog(base,{version:1,channels:[]}),/数量/);
});
