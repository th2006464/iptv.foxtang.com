import test from 'node:test';
import assert from 'node:assert/strict';
import { parseM3U, safeHttpUrl, streamKind, makeManualChannel } from '../src/playlist.js';
const SAMPLE = '\uFEFF#EXTM3U\n#EXTINF:-1 tvg-id="cctv1" tvg-name="中央, 一套" group-title="新闻, 中文" tvg-logo="https://logo.example/a.png",别名\nhttps://example.com/live.m3u8?token=secret\n#EXTINF:-1 tvg-id="cctv1" tvg-name="中央, 一套" group-title="新闻, 中文",别名\nhttps://backup.example/live.m3u8\n#EXTINF:-1 group-title="Movies",电影频道\nhttps://example.com/live.ts\n';
test('parses quoted commas, Chinese and backup URLs', () => {
  const x = parseM3U(SAMPLE, 'source1');
  assert.equal(x.channels.length, 2);
  assert.equal(x.channels[0].name, '中央, 一套');
  assert.equal(x.channels[0].group, '新闻, 中文');
  assert.equal(x.channels[0].streams.length, 2);
  assert.equal(x.duplicates, 1);
  assert.equal(x.channels[1].streams[0].kind, 'mpegts');
});
test('stable ids for same source', () => {
  const a = parseM3U(SAMPLE, 's');
  const b = parseM3U(SAMPLE, 's');
  assert.deepEqual(a.channels.map((c) => c.id), b.channels.map((c) => c.id));
});
test('rejects invalid and dangerous URLs', () => {
  for (const s of ['javascript:alert(1)', 'file:///tmp/test', 'data:text/plain,a', 'https://user:password@example.com/', '//example.com', 'rtsp://x/live']) {
    assert.equal(safeHttpUrl(s), null);
  }
  assert.equal(safeHttpUrl('https://example.com/live'), 'https://example.com/live');
  assert.equal(streamKind('https://example.com/live.m3u8?auth=1'), 'hls');
});
test('recognizes HLS media playlists instead of misparsing as IPTV', () => {
  assert.throws(() => parseM3U('#EXTM3U\n#EXT-X-TARGETDURATION:5\n#EXTINF:5,\nhttps://a.example/part.ts', 'a'), /HLS/);
});
test('invalid lines get counted, valid entries retained', () => {
  const result = parseM3U('#EXTM3U\n#EXTINF:-1,坏地址\njavascript:alert(1)\n#EXTINF:-1,有效\nhttps://a.example/video.mp4\n', 'a');
  assert.equal(result.skipped, 1);
  assert.equal(result.channels.length, 1);
});
test('manual channel normalizes defaults', () => {
  const c = makeManualChannel({ name: '  测试 ', url: 'https://a.example/live.flv', kind: 'auto' }, 's');
  assert.equal(c.name, '测试');
  assert.equal(c.streams[0].kind, 'auto');
  assert.throws(() => makeManualChannel({ url: 'ftp://a.com' }, 's'));
});
