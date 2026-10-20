import { safeHttpUrl, streamKind, signedStreamExpiry } from './playlist.js';
import { HD_REFERENCE_SOURCE_ID } from './hd-reference-catalog.js';

// Only stations already identified as public/free broadcaster feeds are
// eligible for unauthenticated server-side delivery. A TV name appearing on
// GitHub or HD.Rip does not authorize publishing a pay-TV access URL.
export const PUBLIC_FEED_REFERENCE_IDS = Object.freeze([
  2, 20, 23, 44, 53, 114, 115, 155, 169, 181, 250, 251, 351, 361, 380, 392, 402, 406, 408
]);
const PUBLIC = new Set(PUBLIC_FEED_REFERENCE_IDS);
export const BACKEND_CATALOG_VERSION = 1;

export function publicStream(raw) {
  const url = safeHttpUrl(raw?.url);
  if (!url || !url.startsWith('https://')) return null;
  const parsed = new URL(url);
  const host = parsed.hostname.toLowerCase();
  if (host === 'hd.rip' || host.endsWith('.hd.rip')) return null;
  if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(host)) return null;
  if ([...parsed.searchParams.keys()].some(key =>
    /^(?:s|tid|tsum|signature|token|auth|auth_key|authorization|access_token|password|session|sessionid|key)$/i.test(key))) return null;
  if (signedStreamExpiry(url) !== null) return null;
  if (/\.mpd(?:$|\?)/i.test(url)) return null; // DASH/DRM not supported by this HLS/MPEGTS player
  return { url, kind: ['hls', 'mpegts', 'flv', 'auto'].includes(raw.kind) ? raw.kind : streamKind(url),
    label: String(raw.label || '公开播放线路').slice(0, 70) };
}
function uniquePublic(streams) {
  const values = [], seen = new Set();
  for (const raw of streams || []) {
    const candidate = publicStream(raw);
    if (!candidate || seen.has(candidate.url)) continue;
    values.push(candidate); seen.add(candidate.url);
    if (values.length >= 12) break;
  }
  return values;
}
export function createBackendPayload(channels, { refreshed = false, generatedAt = new Date().toISOString() } = {}) {
  const safe = channels.filter(c => c.sourceId === HD_REFERENCE_SOURCE_ID)
    .map(channel => ({
      id: channel.id, referenceId: channel.referenceId,
      streams: PUBLIC.has(Number(channel.referenceId)) ? uniquePublic(channel.streams) : []
    }));
  return {
    version: BACKEND_CATALOG_VERSION, generatedAt, refreshed,
    channelCount: safe.length, playableCount: safe.filter(c => c.streams.length).length,
    source: 'Public broadcaster and free TV feeds only',
    channels: safe
  };
}
export function mergeBackendCatalog(state, payload) {
  if (payload?.version !== BACKEND_CATALOG_VERSION || !Array.isArray(payload.channels)
      || payload.channels.length !== 184) throw new Error('后台频道目录版本或数量不匹配');
  const incoming = new Map();
  for (const entry of payload.channels) {
    const id = Number(entry.referenceId);
    if (!Number.isInteger(id) || entry.id !== 'ref-' + id || incoming.has(entry.id)
        || !Array.isArray(entry.streams)) throw new Error('后台频道数据无效');
    incoming.set(entry.id, PUBLIC.has(id) ? uniquePublic(entry.streams) : []);
  }
  const channels = state.channels.map(channel => {
    if (channel.sourceId !== HD_REFERENCE_SOURCE_ID) return channel;
    const incomingStreams = incoming.get(channel.id);
    if (!incomingStreams) return channel;
    const existing = channel.streams || [];
    const personal = existing.filter(s => /^(?:我的订阅|个人添加线路|本机)/.test(s.label || ''));
    const fallbacks = existing.filter(s => !personal.includes(s));
    const ordered = [], seen = new Set();
    for (const s of [...personal, ...incomingStreams, ...fallbacks]) {
      const url = safeHttpUrl(s.url);
      if (!url || seen.has(url)) continue;
      ordered.push(s); seen.add(url);
      if (ordered.length >= 12) break;
    }
    return { ...channel, streams: ordered };
  });
  return { ...state, channels };
}
