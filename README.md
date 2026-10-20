# Fox IPTV · 私人直播影院

受 HD.Rip 的频道浏览体验启发，独立编写的个人 M3U/IPTV 网页播放器。**不包含任何电视直播源、付费频道或者授权绕过功能。**

## 第一阶段已经实现

- 桌面/手机自适应暗黑影院 UI，支持浅色模式
- 导入本地 M3U/TXT 文件、拖拽文件、粘贴 M3U 文本、HTTPS M3U 订阅
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

部署前请参阅 docs/DEPLOY.md、docs/TEST_PLAN.md。使用 Cloudflare Access 保护 iptv.foxtang.com，另行检查 Pages 默认域名与 PR 预览域名的访问控制。

## 安全与限制

- 清单、收藏、播放地址和令牌存储在当前浏览器，不上传到网站后端；IndexedDB 并未加密。
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
- scripts/build.mjs：无依赖构建
- public/_headers、public/_redirects：Cloudflare Pages 静态安全配置
- tests/：Node 内置单元测试
- docs/DEPLOY.md：Luna 合并与部署指令
- docs/TEST_PLAN.md：生产验收流程

UI 与代码原创，不复制 HD.Rip 的代码、商标、视频资源或受版权保护的页面资产。
