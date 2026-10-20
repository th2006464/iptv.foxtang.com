// Default public-channel starter catalog.
//
// Sources: https://github.com/iptv-org/iptv (streams/{fr,us,hk,tw,cn,kr,jp,de,sg}.m3u)
// Snapshot researched on 2026-10-20. Only HTTPS publisher/broadcaster or known
// distribution/CDN endpoints are included. This is NOT an HD.Rip feed export.
// No tokened URLs, premium/DRM channels, proxy endpoints or protected feeds.
// Listings are best-effort; availability, rights, CORS and regional restrictions
// remain the responsibility of each stream publisher.
import { hashKey, safeHttpUrl } from './playlist.js';

export const PUBLIC_SOURCE_ID = 'fox-public-broadcasts-v1';
export const PUBLIC_BOOTSTRAP_FLAG = 'fox-public-broadcasts-offered-v1';

export const PUBLIC_SOURCE = Object.freeze({
  id: PUBLIC_SOURCE_ID,
  name: '默认公共频道 · 公开直播',
  type: 'builtin',
  enabled: true,
  createdAt: 0,
  updatedAt: 0
});

// [key, name, region or category, tvg id, streams (HLS URLs)]
const CATALOG = [
  ['france24-en', 'France 24 English', '国际新闻', 'France24.fr@English', [
    'https://live.france24.com/hls/live/2037218/F24_EN_HI_HLS/master_2300.m3u8',
    'https://live.france24.com/hls/live/2037218-b/F24_EN_HI_HLS/master_2300.m3u8'
  ]],
  ['france24-fr', 'France 24 Français', '国际新闻', 'France24.fr@French', [
    'https://live.france24.com/hls/live/2037179/F24_FR_HI_HLS/master_2300.m3u8'
  ]],
  ['france24-ar', 'France 24 العربية', '国际新闻', 'France24.fr@Arabic', [
    'https://live.france24.com/hls/live/2037222/F24_AR_HI_HLS/master_2300.m3u8'
  ]],
  ['bloomberg-us', 'Bloomberg TV US', '财经新闻', 'BloombergTV.us@US', [
    'https://bloomberg.com/media-manifest/streams/us.m3u8'
  ]],
  ['bloomberg-asia', 'Bloomberg TV Asia', '财经新闻', 'BloombergTV.us@Asia', [
    'https://bloomberg.com/media-manifest/streams/asia.m3u8'
  ]],
  ['euronews-en', 'Euronews English', '国际新闻', 'EuronewsEnglish.fr@SD', [
    'https://cdn-euronews.akamaized.net/live/eds/euronews-en/25002/index.m3u8'
  ]],
  ['euronews-fr', 'Euronews Français', '国际新闻', 'EuronewsFrench.fr@SD', [
    'https://cdn-euronews.akamaized.net/live/eds/euronews-fr/25026/index.m3u8'
  ]],
  ['dw-en', 'DW English', '国际新闻', 'DW.de@English', [
    'https://dwamdstream102.akamaized.net/hls/live/2015525/dwstream102/master.m3u8'
  ]],
  ['cgtn-en', 'CGTN English', '中文及亚洲', 'CGTN.cn@SD', [
    'https://english-livebkali.cgtn.com/live/encgtn.m3u8',
    'https://hlspackager.akamaized.net/live/DB/CGTN_ENGLISH/HLS/CGTN_ENGLISH.m3u8'
  ]],
  ['cgtn-documentary', 'CGTN Documentary', '纪实文化', 'CGTNDocumentary.cn@SD', [
    'https://hlspackager.akamaized.net/live/DB/CGTN_DOCUMENTARY/HLS/CGTN_DOCUMENTARY.m3u8'
  ]],
  ['cgtn-global-biz', 'CGTN Global Biz', '财经新闻', 'CGTNGlobalBiz.cn@SD', [
    'https://fastlive.cctvplus.com/out/v1/2b3d8a0c805d437f9dc85b764c2ac599/index.m3u8'
  ]],
  ['nhk-world', 'NHK WORLD-JAPAN', '日韩频道', 'NHKWorldJapan.jp@SD', [
    'https://masterpl.hls.nhkworld.jp/hls/w/live/smarttv.m3u8',
    'https://media-osa.hls.nhkworld.jp/hls/w/live/master.m3u8'
  ]],
  ['arirang-tv', 'Arirang TV', '日韩频道', 'ArirangTV.kr@SD', [
    'https://amdlive-ch01-ctnd-com.akamaized.net/arirang_1ch/smil:arirang_1ch.smil/playlist.m3u8',
    'https://amdlive-ch02-ctnd-com.akamaized.net/arirang_1ch/smil:arirang_1ch.smil/playlist.m3u8'
  ]],
  ['taiwanplus', 'TaiwanPlus TV', '中文及亚洲', 'TaiwanPlus.tw@SD', [
    'https://bcovlive-a.akamaihd.net/rce33d845cb9e42dfa302c7ac345f7858/ap-northeast-1/6282251407001/playlist.m3u8'
  ]],
  ['rthk31', 'RTHK 31 · 香港电台（地区限制）', '港台频道 · 地区限制', 'RTHKTV31.hk@SD', [
    'https://rthktv31-live.akamaized.net/hls/live/2036818/RTHKTV31/master.m3u8',
    'https://rthklive1-lh.akamaihd.net/i/rthk31_1@167495/master.m3u8'
  ]],
  ['rthk32', 'RTHK 32 · 香港电台（地区限制）', '港台频道 · 地区限制', 'RTHKTV32.hk@SD', [
    'https://rthktv32-live.akamaized.net/hls/live/2036819/RTHKTV32/master.m3u8'
  ]],
  ['africanews-en', 'Africanews English', '国际新闻', 'AfricanewsEnglish.fr@SD', [
    'https://cdn-euronews.akamaized.net/live/eds/africanews-en/25049/index.m3u8'
  ]],
  ['cna-originals', 'CNA Originals', '纪实文化', 'CNAOriginals.sg@SD', [
    'https://amg01082-cna-amg01082c1-rlaxx-us-11304.playouts.now.amagi.tv/playlist.m3u8'
  ]]
];

export function getPublicChannels() {
  return CATALOG.map(([key, name, group, tvgId, addresses]) => {
    const streams = addresses.map((url, index) => ({
      url: safeHttpUrl(url),
      kind: 'hls',
      label: index ? '备用线路 ' + (index + 1) : '主线路'
    }));
    if (streams.some((stream) => !stream.url)) throw new Error('公共频道包含无效 URL: ' + key);
    return {
      id: 'public-' + hashKey(key),
      sourceId: PUBLIC_SOURCE_ID,
      name,
      group,
      tvgId,
      logo: '',
      streams,
      addedAt: 0
    };
  });
}
