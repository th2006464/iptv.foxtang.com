import test from 'node:test';
import assert from 'node:assert/strict';
import { AUTO_CATALOG, loadAutoCatalog } from '../src/auto-catalog.js';
test('loads the public GitHub catalog without touching private sources', async () => {
  const sample = '#EXTM3U\n#EXTINF:-1 tvg-id="TestTV.us" group-title="News",Test TV\nhttps://example.com/test.m3u8\n';
  const result = await loadAutoCatalog(async (url, options) => {
    assert.equal(url, 'https://iptv-org.github.io/iptv/index.category.m3u');
    assert.equal(options.credentials, 'omit');
    return { ok: true, headers: { get: () => String(sample.length) }, text: async () => sample };
  });
  assert.equal(result.channels.length, 1);
  assert.equal(result.channels[0].sourceId, AUTO_CATALOG.id);
});
test('does not accept failed catalog responses', async () => {
  await assert.rejects(loadAutoCatalog(async () => ({ ok: false, status: 503 })), /503/);
});
