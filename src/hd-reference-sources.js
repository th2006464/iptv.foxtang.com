// Selected openly published broadcaster/official-CDN streams from community IPTV indices.
// Only public/free examples; the HD.Rip website is not a stream provider for this project.
// Availability and geo/CORS restrictions have not been live-playback verified.
export const REFERENCE_EXTRA_STREAMS = Object.freeze({
  2: [
    {url:'https://abcnews-streams.akamaized.net/hls/live/2023560/abcnewshudson1/master.m3u8',label:'ABC News 官方 CDN'}
  ],
  169: [
    {url:'https://cbsnews.akamaized.net/hls/live/2020607/cbsnlineup_8/master.m3u8',label:'CBS News 官方 CDN'},
    {url:'https://dai.google.com/linear/hls/event/Sid4xiTQTkCT1SLu6rjUSQ/master.m3u8',label:'CBS News 公开备线'}
  ],
  250: [
    {url:'https://d11h6a6nhl9kj9.cloudfront.net/hls/clr4ctv_suria/master.m3u8',label:'Suria 公开 CDN · 可能地区限制'}
  ],
  402: [
    {url:'https://cdn-globecast.akamaized.net/live/eds/saudi_quran/hls_roku/index.m3u8',label:'沙特 Quran 公共 CDN'}
  ],
  406: [
    {url:'https://cdn-globecast.akamaized.net/live/eds/saudi_sunnah/hls_roku/index.m3u8',label:'沙特 Sunnah 公共 CDN'}
  ]
});
