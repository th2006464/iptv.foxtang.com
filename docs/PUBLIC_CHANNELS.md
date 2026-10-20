# 精选电视台和备用线路

**版本：2026-10-20**。不是复制 HD.Rip 的网站接口或付费节目源，只参考用户提供的 HD.Rip 截图来组织类似的频道浏览与线路切换体验。

## 数据来源

- [iptv-org/iptv](https://github.com/iptv-org/iptv) 的公开 M3U 项目及 `streams/{tw,hk,cn,kr,jp,sg,fr,de,qa,uk,us}.m3u`：整理 TVG ID、HTTPS 地址及备用播出源。
- [Free-TV/IPTV](https://github.com/Free-TV/IPTV)：补充免费电视台的独立公开来源和部分图标。
- `src/public-catalog.js`：此前验证仅存在于公开目录中的首批 18 个频道，现在**不再作为单独默认来源显示**，仅为名单中能匹配到的频道补充已有备线。

## 数据组织与当前快照

- `src/curated-roster.js`：手工挑选约 99 个候选台名，稳定 key、分组及可匹配 TVG ID。
- `src/curated-snapshot.js`：筛选出实际具有 HTTPS 免费公开候选源的 88 个电视台，138 条线路，37 个公开频道图标引用。
- `src/curated-catalog.js`：按照 TVG ID 聚合线路，避免把多个 URL 误显示为多个频道，限定单个频道不超过 7 条线路。
- 首页直接使用本地构建资源，**不自动下载全球上万频道的 M3U**，加载失败时仍有本地精选表。
- 源管理中的「更新公共线路」会按需请求 `https://iptv-org.github.io/iptv/index.m3u` 和 `https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8`，只向已存在的 88 个电视台补充新地址，不扩大默认电视台数量。

## 历史数据兼容

已有浏览器中的 `fox-public-broadcasts-v1` 和 `github-iptv-org-default-v1` 被迁移替换为 `mediahub-curated-v2`。已导入的私人 M3U、收藏、最近观看记录不会被清空；能够匹配相同 TVG ID 的公开收藏和最近播放会映射到新频道 ID。旧版 JSON 备份格式 `fox-iptv-backup-v1` 继续支持。

## 重要界限

- IPTV 链接公开出现在 GitHub 上，不等于直播内容的分发权或所有设备可播性已被验证。
- HBO、爱尔达以及仅有第三方不明镜像的订阅付费频道不在默认源中；不绕过 DRM、版权鉴权、CORS、地域限制。
- 不采集、记录、缓存、代理、录制、转码第三方视频；直播数据由浏览器直接向源站请求。
- 某些节目可能带地域限制或源站拒绝访问。选择「换线路」可以试不同公共 CDN，但不能保证播放成功。
- 切换多条线路不意味着自动检查它们是否工作。需要真实浏览器实测，别把 GitHub CI 当播放验收。
