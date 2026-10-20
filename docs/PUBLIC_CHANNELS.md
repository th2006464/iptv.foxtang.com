# HD.Rip 公开频道目录与个人线路绑定

更新时间：2026-10-20。

## HD.Rip 参考范围

读取 `https://hd.rip/` 首页的公开 `application/ld+json` ItemList。该结构化数据当前包含 **184 条频道记录**，每条记录有频道编号与台名，例如：

- 阿里郎 Arirang（155）
- 八大综合（158）
- 博斯网球（165）
- 爱尔达体育1台（62）
- HBO（84）、HBO Malaysia（219）
- 无线翡翠台 (香港)（141）
- TVBS新闻台（197）

这些是**公开频道名称和编号**，不是 HD.Rip 播放 URL、API、DRM 凭据或版权许可。原网页截图显示“187 个在线频道”，而这次获取到的结构化目录报告为“184”；因此本站不能声称两个统计完全一致。

## 当前目录及播放来源

- `src/hd-reference-channels.js`：184 条频道名称、编号和大致分类，顺序取自页面公开结构化目录。
- `src/hd-reference-sources.js`：额外整理的新闻、公共广播免费流候选地址；不存在付费电视的未经授权直播地址。
- `src/hd-reference-catalog.js`：把部分对应电视台和已有 `src/curated-snapshot.js` 的免费候选线路匹配至参考名单，逐台展示可选线路；未找到合适 URL 时存储 `streams: []`，在 UI 中显示“待绑定”。
- `src/playlist.js`：私人订阅 M3U 解析，按照频道 TVG ID 和名称识别用户手中有权观看的 HBO、ELTA、博斯及其他频道；不执行 DRM 或付费鉴权绕过。
- `src/main.js`：用户选中“待绑定”频道后手动保存 HTTP(S) 播放 URL，或通过源管理匹配个人订阅；私人播放 URL 只保存于当前浏览器。

公开目录中的资源来自 `iptv-org/iptv` 与 `Free-TV/IPTV` 等社区维护的列表。来源公开 ≠ 发布授权或播放验证通过；即使使用 HTTPS，直播仍可能受 CORS、地区、码流兼容性及服务端鉴权影响。本站不代理、转码、录制和缓存视频。绑定付费订阅的用户必须确认自己有权访问。

## 站点升级与兼容性

- 新建或升级的浏览器默认显示完整 184 条频道记录，**不需要外网下载海量第三方 M3U**。
- 旧版本 `fox-public-broadcasts-v1`（18 台）、`github-iptv-org-default-v1`（全球目录）和 `mediahub-curated-v2`（88 台）在安装时迁移到 `mediahub-hd-reference-v1`，私人清单来源不受影响。
- 参考电视台稳定标识为 `ref-<HD.Rip公开编号>`，保留同名不同编号的记录。对应的历史收藏、最近播放及用户已绑定线路尽可能保留；对不唯一的名字不执行模糊自动匹配。
- JSON 备份格式 `fox-iptv-backup-v1` 不变，支持导出和恢复。
- 如果节目没有公开候选 URL，将显示“待绑定”，而不是伪称在线播放可用。
- 公开源更新只会增加与已识别的免费频道匹配的候选线路；不为付费频道自动补上不明镜像。

## 验收

`npm run check` 现在包括 JavaScript 语法检查、Node 测试和 Cloudflare Pages 静态构建；这能避免之前发生的入口 `async async function init()` 语法错误被普通单元测试遗漏。它不能替代 iPhone Safari 的播放、跨域和地区可用性实测。
