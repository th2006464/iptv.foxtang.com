import { parseM3U, isExpiredSignedStream, signedStreamExpiry } from './playlist.js';
import { HD_REFERENCE_SOURCE_ID } from './hd-reference-catalog.js';

// One-off test mode: the HTML launcher keeps the captured M3U in the user's
// browser. Never store, log, fetch, export or bundle those bearer URLs here.
export const TEMPORARY_SESSION_MODE = 'one-off-hls-test-v1';

export function mergeTemporarySession(state, playlistText, now = Date.now()) {
  const parsed = parseM3U(playlistText, 'one-off-browser-session');
  if (parsed.channels.length < 100 || parsed.channels.length > 184) {
    throw new Error('临时清单应包含 100–184 个 HD.Rip 参考频道');
  }
  const station = new Map(state.channels.filter(c => c.sourceId === HD_REFERENCE_SOURCE_ID)
    .map(c => [String(c.referenceId), c]));
  const overlay = new Map();
  let expired = 0;
  for (const item of parsed.channels) {
    const id = String(item.tvgId || '');
    if (!/^[1-9]\d{0,5}$/.test(id) || !station.has(id) || overlay.has(id)) {
      throw new Error('临时清单频道编号与本站 184 台参考目录不匹配');
    }
    const candidates = [];
    for (const stream of item.streams || []) {
      const url = new URL(stream.url);
      if (url.protocol !== 'https:' || url.hostname !== 'hd.rip' ||
          !url.pathname.startsWith('/stream/') || !url.pathname.endsWith('/playlist.m3u8') ||
          signedStreamExpiry(stream.url) === null) {
        throw new Error('临时测试只接受抓取清单中的短期签名 HLS 格式');
      }
      if (isExpiredSignedStream(stream.url, now)) { expired++; continue; }
      candidates.push({
        url: stream.url, kind: 'hls', label: '我的订阅 · 当天临时测试（不保存）'
      });
    }
    overlay.set(id, candidates);
  }
  const channels = state.channels.map(channel => {
    if (channel.sourceId !== HD_REFERENCE_SOURCE_ID) return channel;
    const temporary = overlay.get(String(channel.referenceId));
    if (!temporary) return channel;
    const old = channel.streams || [];
    const seen = new Set(), streams = [];
    for (const item of [...temporary, ...old]) {
      if (seen.has(item.url)) continue;
      seen.add(item.url); streams.push(item);
      if (streams.length >= 12) break;
    }
    return { ...channel, streams };
  });
  return {
    state: { ...state, channels },
    matched: overlay.size,
    active: [...overlay.values()].filter(streams => streams.length).length,
    expired
  };
}
