# Fox IPTV · 私人直播影院

受 HD.Rip 的频道浏览体验启发，独立编写的个人 M3U/IPTV 网页播放器。**不包含付费频道、DRM 绕过或者 HD.Rip 原站的私人直播接口。**

## 默认公共频道（第二阶段）

首次打开网站，会自动向当前浏览器 IndexedDB 加入 **18 个预置公开频道**，包括 France 24、Bloomberg、Euronews、DW、CGTN、NHK WORLD-JAPAN、Arirang、TaiwanPlus、RTHK31/32、CNA Originals 等。点击频道后浏览器直接访问发布方或 CDN 的 HTTPS HLS 流，不经过 Cloudflare 代理。即使还没导入个人 M3U，也会显示默认列表。关闭、删除公共来源后不会在每次刷新时自动恢复。

**必须区分：这些是从 iptv-org 的公开直播列表按频道名称筛选的类似频道，不是通过抓取 HD.Rip 实际 API 获得的地址，也不保证与原站相同。** 清单地址于 2026-10-20 记录，仅验证了公开列表中存在这些地址，未逐个完成实际播放、合法传播权限、CORS 和地域可用性验证。地区限制频道会明确标示。第三方直播源可随时失效；如不能观看，请测试个人有权访问的 M3U。来源清单、维护方法见 docs/PUBLIC_CHANNELS.md。

## 第一阶段已经实现

- 桌面/手机自适应暗黑影院 UI，支持浅色模式
- 18 个默认公共直播频道 + 导入本地 M3U/TXT 文件、拖拽、粘贴 M3U、HTTPS M3U 订阅
- 手动添加单个频道，M3U 解析预览，识别频道名称、分组、备用线路
- 频道搜索、来源过滤、分组、收藏、最近播放、启停与删除来源
- IndexedDB 保存频道数据，localStorage 保存非敏感界面偏好
- JSON 私人备份/恢复，带隐私提醒
- 原生视频、hls.js 播放 HLS、mpegts.js 播放 TS/FLV；画中画、全屏、重试
- 无后端、无数据库、无 Cloudflare Worker、无视频代理

为首次上线的可靠性，本 MVP 选择**零构建依赖原生 JavaScript ES Modules**，而不是初稿提出的 React + Tailwind。构建通过 Node 内置模块复制静态文件；仅在实际需要 HLS/TS 时从 jsDelivr 按需加载固定版本 hls.js / mpegts.js。后续可将播放器依赖转为自托管，进一步减少第三方代码风险。

## 本地使用（Node 20+）

    npm ci
    npm run check
    python3 -m http.server 8080 --directory dist

浏览器访问 http://localhost:8080/ 。请勿使用 file:// 直接打开，以免模块和本地存储受限。

## Cloudflare Pages

- Framework preset：None
- Build command：npm run build
- Build output directory：dist
- Production branch：main
- 推荐 Node.js：22

部署前请参阅 docs/DEPLOY.md、docs/TEST_PLAN.md。**首版为公开测试站点：不配置 Cloudflare Access，也不要求登录。** 自定义域名和 Pages 默认地址可以公开访问；上线后的浏览器功能由使用者验收，后续如需登录保护再单独规划。

## 公开站点说明

这个项目部署的是**公开可访问的播放器前端**；站点包含由客户端读取的公共直播链接索引，但不在服务器端托管或转发视频。每个人导入的清单只保存在自己的浏览器中，不会因为站点公开而自动公开。但 IndexedDB 并未加密，访问浏览器的其他本机用户或扩展可能读取清单。不要在公共设备导入敏感订阅。

## 安全与限制

- 私人导入清单、收藏、播放地址和令牌存储在当前浏览器，不上传到网站后端；IndexedDB 并未加密。
- GitHub 仓库不应出现真实清单、Token、私人播放 URL、用户名或密码。JSON 备份可能包含这些信息，必须妥善保管。
- 频道源由浏览器直接请求，不能绕过 HTTPS、CORS、编码兼容性、DRM 和平台鉴权。禁止未授权转播。
- 默认关闭外部 Logo 请求，避免额外第三方网络流量。
- 跨设备不能自动同步。另一设备可以通过私人 JSON 备份恢复。
- ?ch= 只引用本地频道 ID，绝不传输源地址。
- iOS 的画中画、全屏、HEVC/TS 等能力因浏览器和设备而异。
- 没有实现 EPG、P2P、云端收藏同步、流代理或视频转码。

## 目录结构

- index.html / src/styles.css：影院 UI
- src/main.js：界面与导入、源管理
- src/playlist.js：M3U 解析、URL 校验与格式推断
- src/store.js：IndexedDB、收藏与最近播放
- src/player.js：播放引擎与生命周期
- src/public-catalog.js：18 个预置公共频道及公开源目录元数据
- scripts/build.mjs：无依赖构建
- public/_headers、public/_redirects：Cloudflare Pages 静态安全配置
- tests/：Node 内置单元测试
- docs/DEPLOY.md：Luna 合并与部署指令
- docs/TEST_PLAN.md：生产验收流程

UI 与代码原创，不复制 HD.Rip 的代码、商标、视频资源或受版权保护的页面资产。
