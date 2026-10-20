# 默认公共频道来源与限制

这份文档记录 MediaHub Live 的首批默认频道来源，**不代表 HD.Rip 原站使用相同 URL**，也不意味着第三方源的二次展示/转播权已经被核实。

## 数据来源

2026-10-20 查阅 https://github.com/iptv-org/iptv 的公开直播目录，重点检查 streams/fr.m3u、streams/us.m3u、streams/hk.m3u、streams/tw.m3u、streams/cn.m3u、streams/kr.m3u、streams/jp.m3u、streams/de.m3u 和 streams/sg.m3u。从中选择直播发布方或其 CDN 分发 HTTPS HLS 端点，**没有选择付费 HBO / DAZN / SkySports 等未经授权的直播地址**。

数据仅用于浏览器指向原始直播服务器；本项目不接收、代理、缓存、录制或转码视频。地址和频道名称会在仓库中公开，但与用户导入的私人清单分开存储。清单随时可能更新、失效或出现播出地区/版权限制。

## 已收录频道（18）

- France 24 English / Français / العربية
- Bloomberg TV US / Asia
- Euronews English / Français
- DW English
- CGTN English / Documentary / Global Biz
- NHK WORLD-JAPAN
- Arirang TV
- TaiwanPlus TV
- RTHK 31 / 32（源目录注明 Geo-blocked，已显式标记地区限制）
- Africanews English
- CNA Originals

各频道的具体 URL 和备用线路定义于 src/public-catalog.js。额外的 13 种 GitHub 公开 M3U 目录请参阅 docs/GITHUB_PLAYLISTS.md。频道访问可能被 403、跨域策略、设备解码或地区限制阻止，来源目录列出的 URL **不等于实际可播放验证通过**。

## 如何维护

1. 从源发布者/可用公开列表验证流 URL、用途和适用范围。
2. 只修改 src/public-catalog.js；不添加含 Token 的私人源、付费 DRM、加密密钥、绕过地理限制的代理。
3. 执行 npm ci && npm run check。测试只验证 URL 结构与数据一致性，不代表网络视频真实可播放。
4. 由使用者在生产浏览器验收真实直播。
5. 对无法播放或授权状态不明确的频道，优先移除或等待发布者官方资料确认。

## 重要隐私与用户体验

- 首次访问时把 18 个预置频道导入 IndexedDB。
- 用户可以停用或删除公共来源，删除后不会每次刷新自动重新添加。
- 私人 M3U 和收藏继续保存在本机，本项目没有私人 IPTV 上传端点。
- 本站没有复用 HD.Rip 的品牌标志、页面源代码、频道 API 或隐藏凭据。
