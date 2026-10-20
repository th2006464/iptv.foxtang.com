import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { HD_REFERENCE_SOURCE_ID, getReferenceChannels } from '../src/hd-reference-catalog.js';
import { DIRECT_PUBLIC_BROADCASTS } from '../src/direct-public-broadcasts.js';
import { PUBLIC_FEED_REFERENCE_IDS, createBackendPayload } from '../src/backend-catalog.js';
import { nextFallbackIndex, MAX_AUTOMATIC_BACKUPS } from '../src/line-failover.js';

test('small official broadcaster HLS shortlist adds playable candidates to existing HD.Rip reference IDs', () => {
  const channels = getReferenceChannels();
  assert.equal(channels.length, 184);
  assert.equal(channels.filter(c => c.sourceId === HD_REFERENCE_SOURCE_ID).length, 184);
  const ids = [7, 226, 251, 351, 380, 392, 408];
  for (const id of ids) {
    const ref = channels.find(c => c.referenceId === id);
    assert.ok(ref, 'missing HD reference ' + id);
    const candidate = DIRECT_PUBLIC_BROADCASTS[id][0];
    assert.equal(ref.streams[0].url, candidate.url, 'official candidate must be prioritized');
    assert.ok(PUBLIC_FEED_REFERENCE_IDS.includes(id), 'approved free/public reference must be in backend whitelist');
    assert.match(candidate.url, /^https:\/\/[^?#]+\.m3u8(?:\?[^#]*)?$/);
    assert.doesNotMatch(candidate.url, /hd\.rip|\/proxy\/|(?:(?:\?|&)(?:token|auth|s|tid|tsum|signature)=)/i);
  }
  const payload = createBackendPayload(channels, { generatedAt: '2026-10-20T00:00:00.000Z' });
  for (const id of ids) {
    assert.ok(payload.channels.find(c=>c.referenceId===id).streams
      .some(s=>s.url === DIRECT_PUBLIC_BROADCASTS[id][0].url));
  }
  for (const id of [62, 61, 84, 219, 308, 164]) {
    assert.ok(!PUBLIC_FEED_REFERENCE_IDS.includes(id), 'do not expose pay-only station');
    assert.deepEqual(payload.channels.find(c => c.referenceId===id)?.streams, []);
  }
});

test('fallback attempts each different line at most twice, never loops to first failed URL', () => {
  const streams = ['primary','backup1','backup2','backup3'];
  assert.equal(MAX_AUTOMATIC_BACKUPS, 2);
  const attempted = new Set([0]);
  const first = nextFallbackIndex(streams, 0, attempted, 0);
  assert.equal(first, 1);
  attempted.add(first);
  const second = nextFallbackIndex(streams, first, attempted, 1);
  assert.equal(second, 2);
  attempted.add(second);
  assert.equal(nextFallbackIndex(streams, second, attempted, 2), -1);
  assert.equal(nextFallbackIndex(['only'], 0, new Set([0]), 0), -1);
  assert.equal(nextFallbackIndex(streams, 0, new Set([0,1,2,3]), 0), -1);
});

test('runtime failover is triggered only for fatal playback errors and is invalidated by channel switch', async () => {
  const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  const player = await readFile(new URL('../src/player.js', import.meta.url), 'utf8');
  assert.match(main, /if \(status === 'error'\) onFatalPlaybackError\(\)/);
  assert.match(main, /resetFailover\(id\); controller\.reset\(\)/);
  assert.match(main, /MAX_AUTOMATIC_BACKUPS/);
  assert.match(main, /failover\.pending = true/);
  assert.match(main, /failover\.generation !== generation \|\| channel\.id !== ui\.selected/);
  assert.match(player, /!data\.fatal/);
  assert.doesNotMatch(main, /hd\.rip\/stream\//);
});

test('latest backend data remains public-only and no signed user playlist is bundled', async () => {
  const files = ['../src/backend-catalog.js', '../src/direct-public-broadcasts.js', '../functions/api/channels.js'];
  for(const path of files) {
    const body = await readFile(new URL(path, import.meta.url), 'utf8');
    assert.doesNotMatch(body, /(?:(?:\?|&)(?:token|s|tid|tsum)=)[^'"]{12,}/);
  }
});
