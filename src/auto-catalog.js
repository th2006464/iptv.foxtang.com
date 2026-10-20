import { parseM3U } from './playlist.js';

// The default public catalog is a GitHub-hosted community playlist.
// Only public metadata/URLs are downloaded, directly in the user's browser.
// Not a promise that streams are licensed, reachable, or playable everywhere.
export const AUTO_CATALOG = Object.freeze({
  id: 'github-iptv-org-default-v1',
  name: 'GitHub · 全球公开频道',
  url: 'https://iptv-org.github.io/iptv/index.category.m3u'
});
const MAX_BYTES = 12 * 1024 * 1024;
export async function loadAutoCatalog(fetcher = fetch) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 18000);
  try {
    const response = await fetcher(AUTO_CATALOG.url, {
      credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store',
      signal: controller.signal
    });
    if (!response.ok) throw new Error('公共频道清单 HTTP ' + response.status);
    const length = Number(response.headers?.get?.('content-length') || 0);
    if (length > MAX_BYTES) throw new Error('频道清单超过 12MB 安全上限');
    const text = await response.text();
    if (new TextEncoder().encode(text).length > MAX_BYTES) throw new Error('频道清单超过 12MB 安全上限');
    const parsed = parseM3U(text, AUTO_CATALOG.id);
    if (!parsed.channels.length) throw new Error('频道清单没有可导入的频道');
    return parsed;
  } finally { clearTimeout(timer); }
}
