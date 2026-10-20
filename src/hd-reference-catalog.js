import { HD_REFERENCE_CHANNELS } from './hd-reference-channels.js';
import { REFERENCE_EXTRA_STREAMS } from './hd-reference-sources.js';
import { CURATED_ROSTER } from './curated-roster.js';
import { CURATED_SNAPSHOT } from './curated-snapshot.js';
import { getPublicChannels, PUBLIC_SOURCE_ID } from './public-catalog.js';
import { safeHttpUrl, streamKind } from './playlist.js';

export const HD_REFERENCE_SOURCE_ID = 'mediahub-hd-reference-v1';
export const HD_REFERENCE_SOURCE_NAME = '频道目录 · 参考 HD.Rip（含付费台）';
export const LEGACY_DEFAULT_SOURCE_IDS = Object.freeze([
  PUBLIC_SOURCE_ID, 'github-iptv-org-default-v1', 'mediahub-curated-v2'
]);
const retired = new Set(LEGACY_DEFAULT_SOURCE_IDS);
const refSet = new Set(HD_REFERENCE_CHANNELS.map(x => x.id));
const curatedEntries = new Map(CURATED_SNAPSHOT.map(x => [x.key, x]));
const curatedTvg = new Map(CURATED_ROSTER.map(x => [x.key, x.tvgId]));
const backupPublic = getPublicChannels();

const referenceToCurated = Object.freeze({
  155: 'arirang', 181: 'france24-en', 351: 'cgtn',
  361: 'cctv1', 20: 'bbc-news', 23: 'bloomberg-us',
  44: 'cna', 114: 'rthk31', 115: 'rthk32', 53: 'daai1'
});
const aliasByReference = Object.freeze({
  2: ['ABCNews.us', 'ABCNewsLive.us', 'ABC News Live'],
  20: ['BBCNews.uk', 'BBC News'],
  23: ['BloombergTV.us', 'Bloomberg Television', 'BloombergTV.us@US'],
  44: ['CNA.sg', 'ChannelNewsAsia.sg'],
  53: ['DaAi1.tw', '大愛1', '大爱电视1'],
  84: ['HBO.tw', 'HBOAsia.sg'],
  81: ['HBOFamily.tw', 'HBO Family'],
  85: ['HBOHits.tw', 'HBO Hits'],
  86: ['HBOSignature.tw', 'HBO Signature'],
  219: ['HBOMalaysia.my', 'HBO Malaysia'],
  62: ['ELTASports1.tw', 'ELTA Sports 1', '爱尔达体育一台'],
  61: ['ELTASports2.tw', 'ELTA Sports 2', '爱尔达体育二台'],
  365: ['ELTASports3.tw', 'ELTA Sports 3', '爱尔达体育三台'],
  108: ['ELTASports4.tw', 'ELTA Sports 4', '爱尔达体育四台'],
  60: ['ELTAZonghe.tw', 'ELTA 综合'],
  24: ['BossGolf1.tw', '博斯高球一'],
  164: ['BossGolf2.tw', '博斯高球二'],
  165: ['BossTennis.tw', '博斯网球台'],
  26: ['BossSports1.tw', '博斯运动一'],
  27: ['BossSports2.tw', '博斯运动二'],
  12: ['GTVDrama.tw', '八大戏剧台'],
  14: ['GTVFirst.tw', '八大第一台'],
  158: ['GTVVariety.tw', '八大综合台'],
  136: ['VideolandSports.tw', '纬来体育台'],
  134: ['VideolandJapan.tw', '纬来日本台'],
  135: ['VideolandMovie.tw', '纬来电影台'],
  141: ['TVBJade.hk', '翡翠台'],
  110: ['TVBPearl.hk', '明珠台'],
  197: ['TVBSNews.tw', 'TVBS新闻'],
  129: ['TVBS.tw'],
  114: ['RTHKTV31.hk', '港台电视31', 'RTHK 31'],
  115: ['RTHKTV32.hk', '港台电视32', 'RTHK 32'],
  155: ['ArirangTV.kr', '阿里郎', 'Arirang'],
  169: ['CBSNews.us', 'CBS News'],
  181: ['France24.fr@English', 'France24English.fr', 'France 24 English'],
  250: ['Suria.sg', 'Suria'],
  351: ['CGTN.cn'],
  361: ['CCTV1.cn', 'CCTV-1 综合'],
  402: ['AlQuranAlKareemTV.sa'],
  406: ['AlSunnahAlNabawiyahTV.sa']
});
function normalize(value) {
  return String(value || '').normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}
const nameLookup = new Map();
for (const entry of HD_REFERENCE_CHANNELS) {
  for (const item of [entry.name, ...(aliasByReference[entry.id] || [])]) {
    const normalized = normalize(item);
    if (!normalized) continue;
    const ids = nameLookup.get(normalized) || new Set();
    ids.add(entry.id);
    nameLookup.set(normalized, ids);
  }
}
function candidateNames(channel) {
  const id = String(channel?.tvgId || '');
  const fullName = String(channel?.name || '');
  return [...new Set([
    fullName, id, id.replace(/@.*$/, ''), id.replace(/\.[a-z]{2,3}(?:@.*)?$/i, '')
  ])];
}
export function findReferenceId(channel) {
  if (channel?.sourceId === HD_REFERENCE_SOURCE_ID) {
    const id = Number(String(channel.id || '').replace('ref-', ''));
    return refSet.has(id) ? id : null;
  }
  // Name is more specific than TVG IDs without region/context.
  for (const label of candidateNames(channel)) {
    const matches = nameLookup.get(normalize(label));
    if (matches?.size === 1) return [...matches][0];
  }
  const curatedKey = String(channel?.id || '').startsWith('curated-')
    ? String(channel.id).slice(8) : null;
  if (curatedKey) {
    const match = Object.entries(referenceToCurated).find(([, key]) => key === curatedKey);
    if (match) return Number(match[0]);
  }
  return null;
}
function validStream(raw, imported = false) {
  const url = safeHttpUrl(raw?.url || '');
  if (!url) return null;
  if (!imported && !url.startsWith('https://')) return null;
  return {
    url, kind: ['hls', 'mpegts', 'flv', 'file', 'auto'].includes(raw?.kind)
      ? raw.kind : streamKind(url),
    label: String(raw?.label || (imported ? '个人订阅线路' : '公开线路')).slice(0, 70)
  };
}
function combineStreams(streams, maximum = 12, imported = false) {
  const output = [], seen = new Set();
  for (const line of streams || []) {
    const item = validStream(line, imported);
    if (!item || seen.has(item.url)) continue;
    seen.add(item.url);
    output.push(item);
    if (output.length >= maximum) break;
  }
  return output;
}
function freeLinesByReference() {
  const map = new Map();
  for (const [textId, key] of Object.entries(referenceToCurated)) {
    const id = Number(textId), entry = curatedEntries.get(key);
    const tvgId = curatedTvg.get(key);
    const backup = backupPublic.filter(c => c.tvgId === tvgId).flatMap(c => c.streams.map((s,i) => ({
      ...s, label: '公开广播备用 ' + (i + 1)
    })));
    map.set(id, {
      streams: combineStreams([...(entry?.streams || []), ...backup]),
      logo: entry?.logo || ''
    });
  }
  for (const [id, additional] of Object.entries(REFERENCE_EXTRA_STREAMS)) {
    const index = Number(id);
    const existing = map.get(index) || { streams: [], logo: '' };
    map.set(index, { ...existing, streams: combineStreams([
      ...existing.streams, ...additional
    ]) });
  }
  return map;
}
const FREE_LINES = freeLinesByReference();
const FREE_PUBLIC_IDS = new Set([...FREE_LINES.keys()]);
export function getReferenceChannels() {
  const byPinyin = new Intl.Collator('zh-CN', { numeric: true, sensitivity: 'base' });
  return HD_REFERENCE_CHANNELS.map(ref => {
    const publicData = FREE_LINES.get(ref.id);
    return {
      id: 'ref-' + ref.id, sourceId: HD_REFERENCE_SOURCE_ID,
      name: ref.name, group: ref.group, referenceId: ref.id,
      tvgId: aliasByReference[ref.id]?.find(v => v.includes('.')) || '',
      logo: publicData?.logo || '',
      streams: publicData?.streams ? [...publicData.streams] : [],
      addedAt: 0
    };
  }).sort((a, b) => byPinyin.compare(a.name, b.name) || a.referenceId - b.referenceId);
}
function migrateID(state, oldId, available) {
  if (available.has(oldId)) return oldId;
  const channel = state.channels.find(x => x.id === oldId);
  const id = findReferenceId(channel);
  return id && available.has('ref-' + id) ? 'ref-' + id : null;
}
export function installReferenceCatalog(state, now = Date.now()) {
  const previous = state.sources.find(x => x.id === HD_REFERENCE_SOURCE_ID);
  const bundled = getReferenceChannels();
  const oldReference = new Map(state.channels.filter(c => c.sourceId === HD_REFERENCE_SOURCE_ID).map(c => [c.id, c]));
  const oldBuiltin = state.channels.filter(c => retired.has(c.sourceId));
  const inherited = new Map();
  for (const channel of oldBuiltin) {
    const refId = findReferenceId(channel);
    if (!refId) continue;
    const key = 'ref-' + refId;
    inherited.set(key, [...(inherited.get(key) || []), ...(channel.streams || [])]);
  }
  const referenceChannels = bundled.map(item => {
    const existing = oldReference.get(item.id);
    return {
      ...item,
      logo: existing?.logo || item.logo,
      streams: combineStreams([
        ...(existing?.streams || []),
        ...(inherited.get(item.id) || []),
        ...item.streams
      ], 12, true)
    };
  });
  const ownChannels = state.channels.filter(c => !retired.has(c.sourceId) && c.sourceId !== HD_REFERENCE_SOURCE_ID);
  const channels = [...referenceChannels, ...ownChannels];
  const valid = new Set(channels.map(c => c.id));
  const favorites = [...new Set(state.favorites.map(id => migrateID(state, id, valid)).filter(Boolean))];
  const recent = [...new Set(state.recent.map(id => migrateID(state, id, valid)).filter(Boolean))].slice(0, 20);
  const priorCurated = state.sources.find(s => s.id === 'mediahub-curated-v2');
  const source = {
    id: HD_REFERENCE_SOURCE_ID, name: HD_REFERENCE_SOURCE_NAME,
    type: 'builtin', enabled: previous?.enabled ?? priorCurated?.enabled ?? true,
    catalogVersion: 1, createdAt: previous?.createdAt || now,
    updatedAt: previous?.updatedAt || now
  };
  return {
    ...state,
    sources: [source, ...state.sources.filter(s => !retired.has(s.id) && s.id !== HD_REFERENCE_SOURCE_ID)],
    channels, favorites, recent
  };
}
export function addReferenceStream(state, channelId, url, label = '个人添加线路') {
  const channel = state.channels.find(c => c.id === channelId && c.sourceId === HD_REFERENCE_SOURCE_ID);
  if (!channel) throw new Error('只能为参考频道添加播放线路');
  const safe = safeHttpUrl(url);
  if (!safe) throw new Error('请提供有效的 HTTP/HTTPS 播放地址');
  const streams = combineStreams([...channel.streams, {
    url: safe, kind: streamKind(safe), label
  }], 12, true);
  if (streams.length === channel.streams.length) return state;
  return { ...state, channels: state.channels.map(c => c.id === channelId ? { ...c, streams } : c) };
}
export function matchOwnPlaylist(state) {
  const ownSourceIds = new Set(state.sources.filter(s => s.id !== HD_REFERENCE_SOURCE_ID
    && s.type !== 'builtin' && s.enabled !== false).map(s => s.id));
  const ownChannels = state.channels.filter(c => ownSourceIds.has(c.sourceId));
  const additions = new Map(), stationCount = new Set();
  for (const channel of ownChannels) {
    const id = findReferenceId(channel);
    if (!id) continue;
    const key = 'ref-' + id;
    const streams = channel.streams || [];
    if (!streams.length) continue;
    const ref = state.channels.find(c => c.id === key && c.sourceId === HD_REFERENCE_SOURCE_ID);
    if (!ref) continue;
    const filtered = streams.map((item,i) => ({
      ...item, label: '我的订阅 · ' + (state.sources.find(s => s.id === channel.sourceId)?.name || '频道') + ' ' + (i + 1)
    }));
    const prior = additions.get(key) || [];
    additions.set(key, [...prior, ...filtered]);
    stationCount.add(key);
  }
  let addedLines = 0;
  const channels = state.channels.map(channel => {
    const extra = additions.get(channel.id);
    if (!extra) return channel;
    const streams = combineStreams([...channel.streams, ...extra], 12, true);
    addedLines += streams.length - channel.streams.length;
    return { ...channel, streams };
  });
  return { state: { ...state, channels }, matchedStations: stationCount.size, addedLines };
}

// Updates only free/public stations already included in the bundled catalogue.
// Never fills pay-only entries from unverified third-party mirrors.
const PUBLIC_PLAYLISTS = Object.freeze([
  { url: 'https://iptv-org.github.io/iptv/index.m3u', name: 'iptv-org' },
  { url: 'https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8', name: 'Free-TV' }
]);
async function collectPlaylist(file, fetcher) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 16000);
  try {
    const response = await fetcher(file.url, {
      credentials: 'omit', referrerPolicy: 'no-referrer', signal: controller.signal
    });
    if (!response.ok) throw new Error(file.name + ' HTTP ' + response.status);
    const declared = Number(response.headers?.get?.('content-length') || 0);
    if (declared > 4 * 1024 * 1024) throw new Error('播放列表过大');
    const text = await response.text();
    if (text.length > 4 * 1024 * 1024 || !text.startsWith('#EXTM3U'))
      throw new Error('不是有效的播放列表');
    const rows = text.split(/\r?\n/), results = new Map();
    for (let i=0;i<rows.length;i++) {
      if (!rows[i].startsWith('#EXTINF:')) continue;
      const id = /\btvg-id="([^"]+)"/i.exec(rows[i])?.[1];
      if (!id) continue;
      const matched = findReferenceId({tvgId:id});
      if (!matched || !FREE_PUBLIC_IDS.has(matched)) continue;
      let url = '';
      for (let j=i+1;j<Math.min(i+6,rows.length);j++) {
        const entry = rows[j].trim();
        if (entry.startsWith('#EXTINF:')) break;
        if (entry && !entry.startsWith('#')) { url = entry; break; }
      }
      if (!url.startsWith('https://')) continue;
      const list = results.get(matched) || [];
      if (list.length < 3) list.push({url, label:file.name + ' 更新线路'});
      results.set(matched,list);
    }
    return results;
  } finally { clearTimeout(timer); }
}
export async function refreshReferencePublicStreams(state, fetcher = fetch) {
  const results = await Promise.allSettled(PUBLIC_PLAYLISTS.map(p => collectPlaylist(p, fetcher)));
  if (results.every(r => r.status === 'rejected')) throw new Error('公开线路清单不可用，请稍后重试');
  let newLines = 0;
  const channels = state.channels.map(channel => {
    if (channel.sourceId !== HD_REFERENCE_SOURCE_ID) return channel;
    const refId = Number(channel.referenceId);
    let extras = [];
    for (const result of results) {
      if (result.status === 'fulfilled') extras = [...extras, ...(result.value.get(refId) || [])];
    }
    if (!extras.length) return channel;
    const streams = combineStreams([...channel.streams, ...extras],12,true);
    newLines += streams.length - channel.streams.length;
    return { ...channel, streams };
  });
  return {
    state: {
      ...state, channels,
      sources: state.sources.map(source => source.id === HD_REFERENCE_SOURCE_ID
        ? { ...source, updatedAt:Date.now() } : source)
    }, newLines
  };
}
