# Fox IPTV — Luna 合并与上线执行说明

## 执行边界

Luna 负责 PR 核对、验证、标准 Merge Commit 合并、Cloudflare Pages 部署和结果汇报。Luna 不负责开发或修改业务代码。浏览器验收由使用者负责。遇到失败按 STOP 规则停下并反馈日志摘要。

## 合并前门槛

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
4. 对 iptv.foxtang.com 建立 Cloudflare Access 身份认证，只授权本人。
5. 检查 Pages 默认 *.pages.dev 域名和所有 PR Preview URL 是否可绕开 Access；不可保护时停止正式公开使用并先处理公开入口。
6. 不创建 D1、R2、Workers、代理服务或上传真实 IPTV 凭据；这个 MVP 不需要任何后端环境变量。

## 生产验收交给使用者

- 无频道时导入引导与空状态正确。
- 导入有权访问的本地 M3U，正确分类与显示频道。
- 搜索、收藏、最近播放、删除、停用与重新启用来源正常。
- 刷新和重开浏览器后频道保留。
- 至少用一条授权 HTTPS HLS 在桌面、手机实测。能否播放取决于源站与终端。
- 使用没有 CORS 的订阅时有明确提示，不默默假装成功。
- 手机频道列表可滚动；深浅主题切换正确。
- Cloudflare Access 对未授权访问拦截，检查 pages.dev 路径。

## STOP 条件

- 任何代码测试/构建失败，PR Head SHA 不符或工作区不干净
- 发现真实私人源、Token 或未经授权的流媒体内容提交到仓库
- Cloudflare Access 未配置或绕过路径未核实
- 新部署产生意外路由、鉴权和安全回归

## 回报内容

PR 编号与 URL、Head SHA、Merge Commit SHA、测试结果、Pages Deployment ID、生产域名及部署结果，最后明确指出浏览器真实源播放验收由用户完成。**Luna 不需也不应索取真实 M3U 凭据。**
