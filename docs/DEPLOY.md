# Fox IPTV — Luna 合并与上线执行说明

## 执行边界

本项目由开发者完成 GitHub PR 合并；后续如由 Luna 执行部署，Luna 只负责 Cloudflare Pages 构建、域名绑定及部署回报，不要求修改代码。**第一版公开访问：不配置 Cloudflare Access、身份验证或访问白名单。** UI、频道导入和直播播放验收由使用者在上线后自行完成。

## GitHub 合并验证门槛（由开发者执行）

1. 检查 PR Head SHA 与交接指定值完全相同，PR 可合并。
2. 在干净 checkout 上依次执行：

    npm ci
    npm run check
    git diff --check

3. 验证 Node 测试与静态构建均成功，dist 目录包含 index.html、src/main.js、src/styles.css 和 _headers。
4. 检查 Git 历史没有私人 M3U、包含令牌的真实 URL、密码或任何未授权频道清单。
5. 合并使用标准 Merge Commit，不使用 squash 或 rebase。禁止未通过验证仍强行发布。

## Pages 首次部署

1. Cloudflare → Workers & Pages → Pages → Connect to Git，连接 th2006464/iptv.foxtang.com。
2. Production branch 为 main，Framework preset 为 None，build command 为 npm run build，output directory 为 dist，Node 22。
3. 绑定自定义域名 iptv.foxtang.com，并确认 TLS 证书和路由生效。
4. **不创建 Cloudflare Access**，不配置登录认证、访问白名单或其他私有站点限制。自定义域名和 Pages 默认/预览链接公开可访问，是首版的预期状态。
5. 上线前仅核对构建与域名/HTTPS 是否正常，页面 UI、设备兼容与真实播放留给使用者发布后验收，不因这些手工验收尚未完成而阻止本次部署。
6. 不创建 D1、R2、Workers、视频代理或上传真实 IPTV 凭据；MVP 无后端环境变量。

## 生产验收交给使用者

- 无频道时导入引导与空状态正确。
- 导入有权访问的本地 M3U，正确分类与显示频道。
- 搜索、收藏、最近播放、删除、停用与重新启用来源正常。
- 刷新和重开浏览器后频道保留。
- 至少用一条授权 HTTPS HLS 在桌面、手机实测。能否播放取决于源站与终端。
- 使用没有 CORS 的订阅时有明确提示，不默默假装成功。
- 手机频道列表可滚动；深浅主题切换正确。
- 公开访问不要求登录，包括自定义域名和 Pages 默认地址；确认未意外启用 Cloudflare Access。

## STOP 条件

- 任何代码测试/构建失败，PR Head SHA 不符或工作区不干净
- 发现真实私人源、Token 或未经授权的流媒体内容提交到仓库
- 新部署产生意外路由、鉴权和安全回归

## 回报内容

PR 编号与 URL、Head SHA、Merge Commit SHA、测试结果、Pages Deployment ID、公开访问状态、生产域名及部署结果，最后明确指出网页/UI/真实源播放验收由用户在上线后完成。**Luna 不需也不应索取真实 M3U 凭据。**
