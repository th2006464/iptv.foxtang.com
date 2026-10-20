import { CURATED_ROSTER } from './curated-roster.js';
import { CURATED_SNAPSHOT } from './curated-snapshot.js';
import { getPublicChannels, PUBLIC_SOURCE_ID } from './public-catalog.js';
import { safeHttpUrl, streamKind } from './playlist.js';

// Public, curated and stable: one TV station per row, several alternate streams.
// Large "index.category.m3u" imports from older versions are retired and never auto-readded.
export const CURATED_SOURCE_ID = 'mediahub-curated-v2';
export const LEGACY_AUTO_SOURCE_ID = 'github-iptv-org-default-v1';
export const CURATED_SOURCE_NAME = 'HD.Rip 风格 · 精选公共电视台';
export const CURATED_CHANNEL_LIMIT = 110;
const ROSTER = new Map(CURATED_ROSTER.map(c => [c.key, c]));
const SNAPSHOT = new Map(CURATED_SNAPSHOT.map(c => [c.key, c]));
const retired = new Set([PUBLIC_SOURCE_ID, LEGACY_AUTO_SOURCE_ID]);
const normalizeId = id => String(id || '').trim().toLowerCase();
const bareId = id => normalizeId(id).split('@')[0];
const aliases = new Map();
for (const item of CURATED_ROSTER) {
  for (const id of [item.tvgId, ...item.aliases]) {
    const key = normalizeId(id);
    if (!aliases.has(key)) aliases.set(key, []);
    aliases.get(key).push(item.key);
  }
}
function rosterKeys(id) {
  const exact = normalizeId(id), base = bareId(id);
  return new Set([...(aliases.get(exact) || []), ...(aliases.get(base) || [])]);
}
function safeStream(url) {
  const safe = safeHttpUrl(url);
  if (!safe || !safe.startsWith('https://')) return null;
  const host = new URL(safe).hostname;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return null;
  if (/(freem3u|mov3\.co|xykt|pdtvhd|pishow|iptvperu|(?:[?&](?:auth_key|token|password)=))/i.test(safe)) return null;
  if (/youtube\.com|youtu\.be|\.mpd(?:[?]|$)|\.mp4(?:[?]|$)|\.m3u(?:[?]|$)/i.test(safe)) return null;
  return safe;
}
function streamList(streams, max = 7) {
  const result = [];
  const seen = new Set();
  for (const raw of streams || []) {
    const url = safeStream(raw.url);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    result.push({
      url, kind: raw.kind === 'hls' || /\.m3u8(?:$|\?)/i.test(url) ? 'hls' : streamKind(url),
      label: String(raw.label || '公开线路').slice(0, 64)
    });
    if (result.length >= max) break;
  }
  return result;
}
function publicBackups() {
  const map = new Map();
  for (const channel of getPublicChannels()) {
    for (const key of rosterKeys(channel.tvgId)) {
      map.set(key, [...(map.get(key) || []), ...channel.streams.map((s,i) => ({
        ...s, label: '广播公开备线 ' + (i + 1)
      }))]);
    }
  }
  return map;
}
export function getCuratedChannels() {
  const fallback = publicBackups();
  return CURATED_ROSTER.slice(0, CURATED_CHANNEL_LIMIT).flatMap(item => {
    const snap = SNAPSHOT.get(item.key);
    const streams = streamList([...(snap?.streams || []), ...(fallback.get(item.key) || [])]);
    if (!streams.length) return [];
    return [{
      id: 'curated-' + item.key, sourceId: CURATED_SOURCE_ID, name: item.name,
      group: item.group, tvgId: item.tvgId, logo: snap?.logo || '',
      streams, addedAt: 0
    }];
  });
}
function matchingLegacyId(old, curated) {
  const full = normalizeId(old.tvgId);
  if (!full) return null;
  const candidates = curated.filter(c => {
    const item = ROSTER.get(c.id.slice('curated-'.length));
    return item && [...rosterKeys(full)].includes(item.key);
  });
  return candidates[0]?.id || null;
}
export function installCuratedCatalog(state, now = Date.now()) {
  const bundled = getCuratedChannels();
  const existing = state.sources.find(s => s.id === CURATED_SOURCE_ID);
  const installed = state.channels.filter(c => c.sourceId === CURATED_SOURCE_ID);
  const preserveLocal = existing?.catalogVersion === 2;
  const active = bundled.map(c => {
    const previous = preserveLocal ? installed.find(old => old.id === c.id) : null;
    return previous ? { ...c, logo: c.logo || previous.logo, streams: streamList([...previous.streams, ...c.streams]) } : c;
  });
  const retiredChannels = state.channels.filter(c => retired.has(c.sourceId));
  const oldFavorite = retiredChannels.filter(c => state.favorites.includes(c.id));
  const oldRecent = retiredChannels.filter(c => state.recent.includes(c.id));
  const migrateId = c => matchingLegacyId(c, active);
  const regular = state.channels.filter(c => !retired.has(c.sourceId) && c.sourceId !== CURATED_SOURCE_ID);
  const channels = [...active, ...regular];
  const valid = new Set(channels.map(c => c.id));
  const source = {
    id: CURATED_SOURCE_ID, name: CURATED_SOURCE_NAME, type: 'builtin', enabled: existing?.enabled ?? true,
    catalogVersion: 2, createdAt: existing?.createdAt ?? now, updatedAt: existing?.updatedAt ?? now
  };
  const favorites = [...new Set([
    ...state.favorites.filter(id => valid.has(id)),
    ...oldFavorite.map(migrateId).filter(Boolean)
  ])];
  const recent = [...new Set([
    ...oldRecent.map(migrateId).filter(Boolean),
    ...state.recent.filter(id => valid.has(id))
  ])].slice(0, 20);
  return {
    ...state, sources: [source, ...state.sources.filter(s => !retired.has(s.id) && s.id !== CURATED_SOURCE_ID)],
    channels, favorites, recent
  };
}

// Optional, explicit refresh. The curated channel whitelist remains authoritative:
// downloading a public M3U never adds a new station or a premium cable station.
const LIVE_CATALOGS = Object.freeze([
  { url: 'https://iptv-org.github.io/iptv/index.m3u', name: 'iptv-org' },
  { url: 'https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8', name: 'Free-TV' }
]);
function extractPublicCandidates(m3u, provider) {
  const result = new Map();
  const rows = m3u.split(/\r?\n/);
  for (let i = 0; i < rows.length; i++) {
    const line = rows[i];
    if (!line.startsWith('#EXTINF:')) continue;
    const id = /\btvg-id="([^"]+)"/i.exec(line)?.[1];
    if (!id) continue;
    const keys = rosterKeys(id);
    if (!keys.size) continue;
    const logo = safeHttpUrl(/\btvg-logo="([^"]+)"/i.exec(line)?.[1] || '') || '';
    let url = '';
    for (let j = i + 1; j < Math.min(i + 6, rows.length); j++) {
      const v = rows[j].trim();
      if (v.startsWith('#EXTINF:')) break;
      if (v && !v.startsWith('#')) { url = v; break; }
    }
    if (!safeStream(url)) continue;
    for (const key of keys) {
      const match = result.get(key) || { streams: [], logo: '' };
      if (match.streams.length < 2) match.streams.push({ url, label: provider + ' 最新线路' });
      if (!match.logo && logo) match.logo = logo;
      result.set(key, match);
    }
  }
  return result;
}
async function readPublicPlaylist(entry, fetcher) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const response = await fetcher(entry.url, { credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store', signal: ctrl.signal });
    if (!response.ok) throw new Error(entry.name + ' HTTP ' + response.status);
    const declaredSize = Number(response.headers?.get?.('content-length') || 0);
    if (declaredSize > 4 * 1024 * 1024) throw new Error('公共清单过大');
    const text = await response.text();
    if (text.length > 4 * 1024 * 1024 || !text.startsWith('#EXTM3U')) throw new Error('不是有效的公共 M3U');
    return extractPublicCandidates(text, entry.name);
  } finally { clearTimeout(timer); }
}
export async function refreshCuratedCatalog(state, fetcher = fetch) {
  const responses = await Promise.allSettled(LIVE_CATALOGS.map(entry => readPublicPlaylist(entry, fetcher)));
  if (responses.every(r => r.status === 'rejected')) throw new Error('两套 GitHub 公共清单均无法读取（可能是网络或跨域限制）');
  const current = state.channels.filter(c => c.sourceId === CURATED_SOURCE_ID);
  const channels = current.map(c => {
    const key = c.id.slice('curated-'.length);
    let streams = c.streams;
    let logo = c.logo;
    for (const result of responses) {
      if (result.status !== 'fulfilled') continue;
      const candidate = result.value.get(key);
      if (candidate) {
        streams = streamList([...candidate.streams, ...streams]);
        if (!logo) logo = candidate.logo;
      }
    }
    return { ...c, streams, logo };
  });
  const source = state.sources.find(s => s.id === CURATED_SOURCE_ID);
  if (!source) throw new Error('没有找到精选公共频道来源');
  return {
    ...state, channels: [...channels, ...state.channels.filter(c => c.sourceId !== CURATED_SOURCE_ID)],
    sources: state.sources.map(s => s.id === CURATED_SOURCE_ID ? { ...s, updatedAt: Date.now() } : s)
  };
}
