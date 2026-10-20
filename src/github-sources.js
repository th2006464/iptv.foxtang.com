// Public IPTV playlists generated from the iptv-org GitHub repository.
//
// Main source: https://github.com/iptv-org/iptv
// Documentation: https://github.com/iptv-org/iptv/blob/master/PLAYLISTS.md
// Public M3U endpoints: https://iptv-org.github.io/iptv/
//
// Playlists are dynamically fetched on user request, not mirrored or bundled.
// Only directories and filename patterns defined here can become presets.
// A public listing does not establish rebroadcast rights or playability.
export const GITHUB_PLAYLISTS = Object.freeze([
  { id: 'news', name: '📰 全球新闻', description: '各国新闻直播频道', path: 'categories/news.m3u' },
  { id: 'business', name: '📈 财经商业', description: '财经及商业相关频道', path: 'categories/business.m3u' },
  { id: 'documentary', name: '🎬 纪实文化', description: '纪录片频道', path: 'categories/documentary.m3u' },
  { id: 'science', name: '🔭 科技科学', description: '科学与知识频道', path: 'categories/science.m3u' },
  { id: 'us', name: '🇺🇸 美国频道', description: '美国地区公开 IPTV 清单', path: 'countries/us.m3u' },
  { id: 'cn', name: '🇨🇳 中国大陆', description: '中国大陆地区频道（可能存在地区限制）', path: 'countries/cn.m3u' },
  { id: 'hk', name: '🇭🇰 中国香港', description: '香港地区频道（可能存在地区限制）', path: 'countries/hk.m3u' },
  { id: 'tw', name: '🇹🇼 中国台湾', description: '台湾地区频道', path: 'countries/tw.m3u' },
  { id: 'jp', name: '🇯🇵 日本频道', description: '日本地区公开 IPTV 清单', path: 'countries/jp.m3u' },
  { id: 'kr', name: '🇰🇷 韩国频道', description: '韩国地区公开 IPTV 清单', path: 'countries/kr.m3u' },
  { id: 'sg', name: '🇸🇬 新加坡', description: '新加坡地区频道', path: 'countries/sg.m3u' },
  { id: 'fr', name: '🇫🇷 法国频道', description: '法国地区频道', path: 'countries/fr.m3u' },
  { id: 'de', name: '🇩🇪 德国频道', description: '德国地区频道', path: 'countries/de.m3u' }
].map(entry => Object.freeze({
  ...entry,
  url: 'https://iptv-org.github.io/iptv/' + entry.path
})));

export function findGithubPlaylist(id) {
  return GITHUB_PLAYLISTS.find(item => item.id === id) || null;
}
