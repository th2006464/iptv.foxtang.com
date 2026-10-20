// Candidate public HLS broadcasts on the broadcasters' own domain or their
// distribution CDN. Source references: iptv-org/iptv streams (2026-10-20),
// Free-TV/IPTV and official broadcaster live pages.
// No captured HD.Rip URLs, authentication tokens, private mirrors or DRM feeds.
// These are NOT guaranteed playable in every region/browser.
export const DIRECT_PUBLIC_BROADCASTS = Object.freeze({
  // CGTN English, official broadcaster CDN; HLS variant/codec is negotiated in playlist.
  351: [
    { url: 'https://english-livebkali.cgtn.com/live/encgtn.m3u8', kind: 'hls',
      label: 'CGTN 官方英文直播 · 1080p 源标（未实测）' }
  ],
  // RTM TV1 Malaysia, openly published RTM CDN (geo restrictions may apply).
  251: [
    { url: 'https://d25tgymtnqzu8s.cloudfront.net/smil:tv1/playlist.m3u8?id=1',
      kind: 'hls', label: '马来西亚 TV1 广播 CDN · 可能限制地区' }
  ],
  // TVRI is the national Indonesian public broadcaster. The URL is the
  // broadcaster's own streaming host, not a third-party IPTV retransmission.
  380: [
    { url: 'https://ott-balancer.tvri.go.id/live/eds/Nasional/hls/Nasional.m3u8',
      kind: 'hls', label: '印尼 TVRI 官方直播 · HD 候选' }
  ],
  // Indonesian Metro TV newsroom stream (Medcom-owned delivery domain).
  392: [
    { url: 'https://edge.medcom.id/live-edge/smil:metro.smil/playlist.m3u8',
      kind: 'hls', label: 'Metro TV / Medcom 官方直播' }
  ],
  // Parliament of Thailand public live broadcast (not continuous 24/7).
  408: [
    { url: 'https://tv-live.tpchannel.org/live/tv.m3u8',
      kind: 'hls', label: '泰国国会电视台官方直播 · 非全天播出' }
  ]
});
