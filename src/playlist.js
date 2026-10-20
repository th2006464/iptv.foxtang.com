// No data is uploaded to our own server. Imported text and stream addresses stay in the browser.
export const MAX_IMPORT_BYTES = 20 * 1024 * 1024;
export const MAX_CHANNELS = 15000;

export function safeHttpUrl(value) {
  if (typeof value !== 'string' || value.length > 8192) return null;
  try {
    const u = new URL(value.trim());
    if (!['http:', 'https:'].includes(u.protocol) || !u.hostname || u.username || u.password) return null;
    return u.href;
  } catch {
    return null;
  }
}
// Signature expiry is metadata only: we never generate/renew stream signatures.
// Scope this to a known signed URL format rather than treating every 'e=' as an expiry.
export function signedStreamExpiry(value) {
  const url = safeHttpUrl(value);
  if (!url) return null;
  const parsed = new URL(url);
  if (parsed.hostname !== 'hd.rip' && !parsed.hostname.endsWith('.hd.rip')) return null;
  if (!parsed.searchParams.has('s')) return null;
  const raw = parsed.searchParams.get('e');
  if (!raw || !/^\d{10}$/.test(raw)) return null;
  const epochMs = Number(raw) * 1000;
  return Number.isSafeInteger(epochMs) && epochMs > 1577836800000 && epochMs < 4102444800000
    ? epochMs : null;
}
export function isExpiredSignedStream(value, now = Date.now()) {
  const expiresAt = signedStreamExpiry(value);
  return expiresAt !== null && expiresAt <= now;
}
export function streamKind(value) {
  const url = safeHttpUrl(value);
  if (!url) return 'auto';
  const path = new URL(url).pathname.toLowerCase();
  if (path.endsWith('.m3u8')) return 'hls';
  if (path.endsWith('.ts') || path.endsWith('.m2ts')) return 'mpegts';
  if (path.endsWith('.flv')) return 'flv';
  if (/\.(mp4|m4v|webm|mp3|aac)$/.test(path)) return 'file';
  return 'auto';
}
export function hashKey(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}
function normalizeName(value, fallback) {
  return String(value || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 160) || fallback;
}
function extinf(line) {
  // The comma separating display name is only meaningful outside quoted attribute values.
  let quoted = false;
  let quote = '';
  let comma = -1;
  for (let i = 8; i < line.length; i++) {
    const ch = line[i];
    if ((ch === '"' || ch === "'") && (!quoted || ch === quote)) {
      quoted = !quoted; quote = quoted ? ch : '';
    } else if (ch === ',' && !quoted) { comma = i; break; }
  }
  const left = line.slice(8, comma < 0 ? undefined : comma);
  const title = comma < 0 ? '' : line.slice(comma + 1).trim();
  const attrs = {};
  const re = /([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s,]+))/g;
  let m;
  while ((m = re.exec(left))) attrs[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? '';
  return { attrs, title };
}
export function parseM3U(text, sourceId) {
  if (typeof text !== 'string') throw new Error('无效的清单内容');
  if (new TextEncoder().encode(text).length > MAX_IMPORT_BYTES) throw new Error('清单超过 20 MB 限制');
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  const meaningful = lines.find((x) => x.trim());
  if (!meaningful || !meaningful.trim().startsWith('#EXTM3U')) throw new Error('不是有效的 #EXTM3U 频道清单');
  if (lines.some((l) => /^\s*#EXT-X-(STREAM-INF|TARGETDURATION|MEDIA-SEQUENCE)/i.test(l))) {
    throw new Error('这是 HLS 视频流清单，请使用“单个频道”添加其 URL');
  }
  const channels = [];
  const seen = new Map();
  let pending = null;
  let groupHint = '';
  let skipped = 0;
  let duplicates = 0;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (/^#EXTINF:/i.test(line)) { pending = extinf(line); groupHint = ''; continue; }
    if (/^#EXTGRP:/i.test(line)) { groupHint = line.slice(8).trim(); continue; }
    if (line.startsWith('#')) continue;
    if (!pending) { skipped++; continue; }
    const url = safeHttpUrl(line);
    if (!url) { skipped++; pending = null; groupHint = ''; continue; }
    const { attrs, title } = pending;
    const name = normalizeName(attrs['tvg-name'] || title, '未命名频道');
    const group = normalizeName(attrs['group-title'] || groupHint, '未分类');
    const tvgId = normalizeName(attrs['tvg-id'], '');
    const logo = safeHttpUrl(attrs['tvg-logo'] || '') || '';
    const identity = tvgId ? 'id:' + tvgId + '|name:' + name : 'url:' + url;
    const key = sourceId + '|' + identity;
    const item = seen.get(key);
    if (item) {
      if (!item.streams.some((s) => s.url === url)) item.streams.push({ url, kind: streamKind(url), label: '备用线路 ' + (item.streams.length + 1) });
      duplicates++;
    } else {
      if (channels.length >= MAX_CHANNELS) throw new Error('超过单次 15,000 个频道限制');
      const channel = {
        id: hashKey(key) + '-' + hashKey(sourceId + ':' + name),
        sourceId, name, group, tvgId, logo,
        streams: [{ url, kind: streamKind(url), label: '主线路' }],
        addedAt: Date.now()
      };
      channels.push(channel);
      seen.set(key, channel);
    }
    pending = null; groupHint = '';
  }
  if (pending) skipped++;
  if (!channels.length) throw new Error('没有解析到有效频道，请检查格式和链接');
  return { channels, skipped, duplicates };
}
export function makeManualChannel({ name, group, url, kind }, sourceId) {
  const safe = safeHttpUrl(url);
  if (!safe) throw new Error('需要有效的 http/https 播放地址（不支持内嵌用户名密码）');
  const label = normalizeName(name, '我的频道');
  return {
    id: hashKey(sourceId + ':' + safe) + '-' + hashKey(label),
    sourceId, name: label, group: normalizeName(group, '自定义'), tvgId: '', logo: '',
    streams: [{ url: safe, kind: ['hls', 'mpegts', 'flv', 'file', 'auto'].includes(kind) ? kind : streamKind(safe), label: '主线路' }],
    addedAt: Date.now()
  };
}
