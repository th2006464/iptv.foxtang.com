import { DIRECT_PUBLIC_BROADCASTS } from '../src/direct-public-broadcasts.js';

// This is an advisory, intentionally non-blocking smoke check from the
// GitHub Actions runner, not proof of playback in iPhone Safari or anywhere
// else. Never request or print credentials, private streams or full media.
const candidates = Object.entries(DIRECT_PUBLIC_BROADCASTS).map(([id, streams]) => ({
  id: Number(id), url: streams[0].url
}));
async function probe({ id, url }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);
  try {
    const response = await fetch(url, {
      redirect: 'follow', signal: controller.signal,
      headers: { Accept: 'application/vnd.apple.mpegurl, application/x-mpegURL, */*' }
    });
    const reader = response.body?.getReader();
    let first = '';
    if (reader) {
      const { value } = await reader.read();
      if (value) first = new TextDecoder().decode(value);
      await reader.cancel().catch(() => {});
    }
    const manifest = /^#EXTM3U/.test(first.trimStart());
    const cors = response.headers.get('access-control-allow-origin') || 'not-sent';
    return {
      id, status: response.status, playlist: manifest, cors,
      result: response.ok && manifest ? 'MANIFEST_RECEIVED' : 'UNVERIFIED'
    };
  } catch (e) {
    return { id, result: 'UNREACHABLE_FROM_CI', reason: e?.name || 'network' };
  } finally {
    clearTimeout(timeout);
  }
}
const results = await Promise.all(candidates.map(probe));
for (const item of results) {
  console.log('[public stream probe]', JSON.stringify(item));
}
console.log('GitHub runner manifests:', results.filter(x => x.result === 'MANIFEST_RECEIVED').length,
  '/', results.length, '— user-device playback, region and decoding not verified.');
