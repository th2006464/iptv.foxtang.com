import test from 'node:test';
import assert from 'node:assert/strict';
import { GITHUB_PLAYLISTS, findGithubPlaylist } from '../src/github-sources.js';

test('all GitHub playlist presets point to documented iptv-org URLs', () => {
  assert.ok(GITHUB_PLAYLISTS.length >= 12);
  assert.equal(GITHUB_PLAYLISTS.length, new Set(GITHUB_PLAYLISTS.map(p => p.id)).size);
  for (const preset of GITHUB_PLAYLISTS) {
    const u = new URL(preset.url);
    assert.equal(u.protocol, 'https:');
    assert.equal(u.hostname, 'iptv-org.github.io');
    assert.match(u.pathname, /^\/iptv\/(categories|countries)\/[a-z]+\.m3u$/);
    assert.ok(preset.description);
    assert.equal(findGithubPlaylist(preset.id), preset);
  }
  assert.equal(findGithubPlaylist('missing'), null);
});
