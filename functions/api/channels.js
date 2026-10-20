import {
  HD_REFERENCE_SOURCE_ID, getReferenceChannels, refreshReferencePublicStreams
} from '../../src/hd-reference-catalog.js';
import { createBackendPayload } from '../../src/backend-catalog.js';

const RESPONSE_HEADERS = Object.freeze({
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'public, max-age=0, s-maxage=3600',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer'
});

// Cloudflare Pages Function. No secret storage, no playback proxy, no video
// retransmission: this returns whitelisted public stream metadata only.
export async function buildPublicCatalog(fetcher = fetch) {
  const base = {
    sources: [{ id: HD_REFERENCE_SOURCE_ID, enabled: true, type: 'builtin' }],
    channels: getReferenceChannels()
  };
  let channels = base.channels;
  let refreshed = false;
  try {
    // Public GitHub M3U refresh is best effort. Never block the catalog for an
    // unreachable source or promote a pay-only TV entry to "playable".
    const boundedFetcher = (url, options = {}) => {
      const timeout = typeof AbortSignal.timeout === 'function'
        ? AbortSignal.timeout(5500) : null;
      const signal = timeout && typeof AbortSignal.any === 'function'
        ? AbortSignal.any([options.signal, timeout].filter(Boolean))
        : options.signal;
      return fetcher(url, { ...options, signal, credentials: 'omit' });
    };
    const updated = await refreshReferencePublicStreams(base, boundedFetcher);
    channels = updated.state.channels;
    refreshed = true;
  } catch {
    // Static, verified-in-repository fallback: UI remains available.
  }
  return createBackendPayload(channels, { refreshed });
}

export async function onRequestGet(context) {
  const request = context.request;
  const cache = globalThis.caches?.default;
  // Version the cache key per application release; Pages Cache API entries outlive
  // individual deployments. Reusing /api/channels returned stale 15-channel
  // data after v12 had added 4 publicly broadcast stations.
  const revision = /^[a-f\d]{8,64}$/i.test(context.env?.CF_PAGES_COMMIT_SHA || '')
    ? context.env.CF_PAGES_COMMIT_SHA : '20261020-freemore14';
  const key = new Request(new URL('/api/channels?build=' + revision, request.url).href);
  if (cache) {
    try {
      const hit = await cache.match(key);
      if (hit) return hit;
    } catch { /* Cache API may not be available in local test environments. */ }
  }
  const data = await buildPublicCatalog();
  const response = new Response(JSON.stringify(data), {
    status: 200,
    headers: RESPONSE_HEADERS
  });
  if (cache && typeof context.waitUntil === 'function') {
    context.waitUntil(cache.put(key, response.clone()).catch(() => {}));
  }
  return response;
}
