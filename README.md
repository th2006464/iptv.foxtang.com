# MediaHub Live · 在线直播影院

受 HD.Rip 的频道浏览体验启发，独立编写的个人 M3U/IPTV 网页播放器。**不包含付费频道、DRM 绕过或者 HD.Rip 原站的私人直播接口。**

## 影院 UI（2026-10-20 重构）

页面根据用户提供的 HD.Rip 布局截图重新设计：紧凑深色顶栏、左侧独立滚动频道清单、右侧宽屏直播播放器及下方实时频道状态面板。保留 MediaHub Live 名称和来自 set-05/media.png 的小尺寸 Logo。分辨率、缓冲长度由浏览器真实播放器读取；使用 hls.js 时可显示清单中声明的编码及标称码率，无法读取时显示「—」。P2P、弹幕和节目表尚未接入，不显示虚假状态。

手机端先显示可滚动的频道表，再显示播放器和频道信息。原 M3U、收藏、GitHub 频道库和 IndexedDB 数据不变。细节见 docs/UI_REFERENCE.md。

## 默认电视台：HD.Rip 风格精选频道 + 多条公开线路

默认不是把全球数千个 IPTV 地址全部导入，而是按照 [HD.Rip](https://hd.rip/) 的紧凑频道表形态，挑选约 **88 个具有公开来源的电视台**，分成港台、央视及大陆、日韩、国际新闻、财经商业、免费体育和纪录电影七类。每个电视台只占频道表一行；同台不同 CDN、清晰度和公开来源合并进「播放线路」下拉框，或点击「⇄ 换线路」循环切换。

数据快照来自 [iptv-org](https://github.com/iptv-org/iptv) 和 [Free-TV/IPTV](https://github.com/Free-TV/IPTV)，部分频道还有旧公共清单提供的备选 URL。当前来源快照共 88 个频道、至少 138 条候选公开线路（实际合并旧备用线后可能更多）；**这不是实际可播放验收结果**。部分线路会受地区限制、CORS、格式或源站规则影响。

**第一次打开时从本站 JS 加载精选快照，不需要等远程清单下载**。升级前浏览器自动加载的 18 个频道和庞大全球频道库会被替换为这一份精选列表，私人 M3U 和其他来源不被清除，能对应上的旧收藏尽可能迁移。点击「源管理 → 更新公共线路」可按需从两套 GitHub 清单追加最新公开地址，始终不自动新增不在精选名单内的电视台。

HBO、爱尔达等付费频道不会因为在 HD.Rip 截图里出现就被接入来历不明的订阅地址。如果有合法的私人播放清单，可以继续通过 M3U 导入。本站不支持绕过 DRM、付费鉴权、CORS 或地域封锁。

## GitHub 公开频道库（按需导入）

点击首页“GitHub 频道库”，可从 [iptv-org GitHub 项目](https://github.com/iptv-org/iptv) 动态载入按地区与主题分类的 **13 组 M3U 清单**，包括全球新闻、财经、纪录片、科技，以及美、中、港、台、日、韩、新、法、德等地区。确认之前只在浏览器预览；源站支持 CORS 时才可导入。清单来源可手动更新，不做浏览器后台自动大规模抓取。

公开目录不等于所有频道已获转播授权或能在你所在地区播放。完整设计和限制见 [docs/GITHUB_PLAYLISTS.md](docs/GITHUB_PLAYLISTS.md)。

## 第一阶段已经实现

- 桌面/手机自适应暗黑影院 UI，支持浅色模式
- 88 个精选公共频道及多条候选线路、GitHub 频道库（13 组可选来源）+ 导入本地 M3U/TXT 文件、拖拽、粘贴 M3U、HTTPS M3U 订阅
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

## Logo 和 favicon

顶部和浏览器标签图标都使用 `public/media.png`，复制自用户已有仓库 `th2006464/logo.foxtang.com` 的 `logos/set-05/media.png`。本地托管，不向 logo.foxtang.com 发起运行时请求；导航区域按 32px 显示，移动端 28px。为兼容既有用户数据，IndexedDB 数据库名称与历史 JSON 备份格式标识暂时保留 `fox-iptv-*`，但界面和浏览器标题已统一为 MediaHub Live。

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
- 精选频道有 37 个公开图标引用，可在源管理中关闭外部 Logo 请求，以减少第三方网络流量。
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
