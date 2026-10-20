import test from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY_STATE } from '../src/store.js';
import { PUBLIC_SOURCE_ID } from '../src/public-catalog.js';
import {
  CURATED_SOURCE_ID, LEGACY_AUTO_SOURCE_ID, CURATED_CHANNEL_LIMIT,
  getCuratedChannels, installCuratedCatalog, refreshCuratedCatalog
} from '../src/curated-catalog.js';
import { CURATED_ROSTER } from '../src/curated-roster.js';

const sample = getCuratedChannels();

test('curated lineup has one stable station per row and multiple selectable public feeds', () => {
  assert.ok(CURATED_ROSTER.length >= 75);
  assert.ok(sample.length >= 75 && sample.length <= CURATED_CHANNEL_LIMIT, sample.length);
  assert.equal(sample[0].name, '阿里郎 Arirang');
  assert.equal(new Set(sample.map(c => c.id)).size, sample.length);
  assert.ok(sample.filter(c => c.streams.length > 1).length >= 20);
  assert.ok(sample.filter(c => c.logo).length >= 30);
  for (const channel of sample) {
    assert.equal(channel.sourceId, CURATED_SOURCE_ID);
    assert.ok(channel.group);
    assert.ok(channel.tvgId);
    assert.ok(channel.streams.length <= 7);
    assert.equal(new Set(channel.streams.map(s => s.url)).size, channel.streams.length);
    for (const stream of channel.streams) {
      assert.ok(stream.url.startsWith('https://'), stream.url);
      assert.ok(stream.label.startsWith('iptv-org') || stream.label.startsWith('Free-TV') || stream.label.startsWith('广播公开备线'));
      assert.ok(!/freem3u|mov3\.co|pdtvhd|xykt/i.test(stream.url));
    }
  }
  assert.ok(!sample.some(c => /HBO|爱尔达|ELTA/i.test(c.name)), 'premium-only streams cannot be invented');
});

test('migration retires the 18-channel source and giant GitHub import but preserves personal data', () => {
  const privateOne = { id: 'mine', sourceId: 'private', name: '我的频道', group: '自定义', streams: [{url:'https://example.com/test.m3u8'}] };
  const previous = {
    ...EMPTY_STATE(),
    sources: [
      { id: PUBLIC_SOURCE_ID, name: '旧公开目录', type: 'builtin', enabled: true },
      { id: LEGACY_AUTO_SOURCE_ID, name: '全球频道', type: 'url', enabled: true },
      { id: 'private', name: '私人源', type: 'file', enabled: true }
    ],
    channels: [
      { id: 'old-arirang', sourceId: PUBLIC_SOURCE_ID, name: 'Arirang TV', tvgId: 'ArirangTV.kr@SD' },
      { id: 'old-auto', sourceId: LEGACY_AUTO_SOURCE_ID, name: 'unrelated', tvgId: 'RandomChannel.us@SD' },
      privateOne
    ],
    favorites: ['old-arirang', 'mine'], recent: ['old-arirang', 'mine']
  };
  const next = installCuratedCatalog(previous, 1000);
  assert.equal(next.sources.length, 2);
  assert.equal(next.sources[0].id, CURATED_SOURCE_ID);
  assert.ok(next.channels.some(c => c.id === 'mine'));
  assert.ok(!next.channels.some(c => c.id === 'old-auto' || c.id === 'old-arirang'));
  assert.ok(next.favorites.includes('mine'));
  assert.ok(next.favorites.includes('curated-arirang'));
  assert.ok(next.recent.includes('curated-arirang'));
  assert.equal(next.channels.filter(c => c.sourceId === CURATED_SOURCE_ID).length, sample.length);
  const again = installCuratedCatalog(next, 1001);
  assert.equal(again.channels.length, next.channels.length);
  assert.ok(again.favorites.includes('curated-arirang'));
  assert.ok(again.favorites.includes('mine'));
});

test('curated source respects the disabled state', () => {
  const installed = installCuratedCatalog(EMPTY_STATE(), 1000);
  const disabled = { ...installed, sources: installed.sources.map(s => s.id === CURATED_SOURCE_ID ? { ...s, enabled: false } : s) };
  assert.equal(installCuratedCatalog(disabled, 1001).sources[0].enabled, false);
});

test('manual public-feed refresh adds lines only to selected stations', async () => {
  const installed = installCuratedCatalog(EMPTY_STATE(), 1000);
  const sampleM3U = [
    '#EXTM3U',
    '#EXTINF:-1 tvg-id="ArirangTV.kr@SD" tvg-logo="https://example.com/arirang.png",Arirang',
    'https://amdlive-ch04-ctnd-com.akamaized.net/arirang_1ch/smil:arirang_1ch.smil/playlist.m3u8',
    '#EXTINF:-1 tvg-id="UnknownPayTV.us@SD",Unknown Pay TV',
    'https://example.com/unknown.m3u8'
  ].join('\n');
  const withLines = await refreshCuratedCatalog(installed, async url => ({
    ok: true, headers: { get: () => String(sampleM3U.length) },
    text: async () => sampleM3U
  }));
  const arirang = withLines.channels.find(c => c.id === 'curated-arirang');
  assert.ok(arirang.streams.some(x => x.url.includes('amdlive-ch04-ctnd-com')));
  assert.equal(withLines.channels.length, installed.channels.length);
  assert.ok(!withLines.channels.some(c => /UnknownPayTV/.test(c.name)));
  assert.ok(withLines.sources[0].updatedAt > 1000);
});

test('initial curated channels require no third-party network request', () => {
  const state = installCuratedCatalog(EMPTY_STATE());
  assert.ok(state.channels.length >= 75);
  assert.equal(state.sources[0].type, 'builtin');
});
