# Ubuntu 工作流

验证日期：2026-10-28；环境 Ubuntu 22.04.5 LTS x86_64。初始 PATH 无 Node.js/npm/pnpm，node_modules 缺失。本轮在临时目录安装 Node.js 22.16.0（官方归档 SHA-256 校验通过）、pnpm 10.20.0，未修改系统 PATH 配置或项目依赖版本。临时工具链不是永久环境，迁移/重启后应重新提供工具链并加入当前 shell PATH。

## 已验证命令

在仓库根目录，使用上述工具链：

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm type-check
CI=1 pnpm build:mp-weixin
CI=1 pnpm build:h5
pnpm build:desktop-ui
pnpm build:desktop-gateway
```

**测试通过**：本轮安装使用临时 `--store-dir`，952 个包，锁文件无变化；其余命令均成功。`CI=1` 跳过 uni-app 更新检查，避免受限环境 `os.networkInterfaces()` 报 `uv_interface_addresses` 错误（依据安装依赖 `uni-cli-shared/dist/checkUpdate.js`）。无需更改源码或依赖。

安装时 pnpm 10.20.0 提示部分依赖构建脚本被忽略（含 esbuild）；既有 `pnpm-workspace.yaml` 使用 allowBuilds。此次前端构建实际成功，不因提示盲目批准全部安装脚本或升级依赖。

## 配置位置

**代码已实现**（`.env.example`、生成脚本）：需要云端联调时，在未跟踪的 `.env.local` 安全填写 XQ_APP_ID、XQ_CLOUD_ENV、XQ_DESKTOP_API_URL、XQ_MINI_ENV，不能在聊天或提交中提供真实值。可用 `cp -n .env.example .env.local` 防止覆盖已有文件；本轮未创建含实际值的配置。

`pnpm setup:local` 生成小程序/ledger 配置；`node scripts/prepare-desktop.cjs` 生成桌面配置；`pnpm build:desktop-gateway` 生成网关平铺文件及扫码模式。环境变量优先于本地文件。缺配置仍可构建，但不能验证云登录；AppSecret 变量 XQ_WECHAT_APP_SECRET 仅配置于云函数服务端，不放 `.env.local`。

## 测试入口与边界

`pnpm test` 先生成共享核心，然后顺序运行 11 个 `.test.cjs`：

| 入口 | 覆盖范围 |
| --- | --- |
| version、upload-mp-weixin | 版本一致性、上传构建/回执流程；上传为模拟，不实际发布 |
| ledger、insights | 数据兼容、金额、存储失败、筛选、预算和统计 |
| ui-features | 页面 setup 与交互模拟，不是真机渲染 |
| cloud | 模拟数据库隔离、事务、并发、分页及恢复 |
| auth、auth-persistence | 游客隔离、登录、存储、恢复、账号变化及网络异常 |
| features | 群组、资料、分类及周期语义 |
| desktop-auth、desktop-gateway | 配对、失效、重放、网关限制及平铺文件一致性 |

测试中的模拟上传成功文字和 DATABASE_ERROR 故障注入不是实际部署/云端事故。检查结束后用 `git diff` 确认已跟踪 `cloudfunctions/ledger/core.cjs` 无意外变更，配置与 dist 等产物未加入提交。

## 桌面及发布边界

- 桌面 UI 构建通过；Electron 45.0.0 运行文件已下载。受限会话有 ELECTRON_RUN_AS_NODE，直接 `electron --version` 输出的是内嵌 Node 版本，不能当 Electron 版本证据。
- 去掉 ELECTRON_RUN_AS_NODE 后启动因 sandbox_host_linux / shutdown 不允许而失败，且会话没有 DISPLAY/WAYLAND_DISPLAY。未完成 GUI 运行验收，不关闭应用安全配置绕过。
- 有正常图形会话和工具链后，候选命令为 `env -u ELECTRON_RUN_AS_NODE pnpm desktop`；本轮尚未验证该完整命令。
- `pnpm package:desktop` 明确执行 Windows NSIS 打包。本机 PATH 未发现 wine、makensis、xvfb-run；尚未尝试 exe 构建，不宣称 Ubuntu 绝对不能构建或已经构建成功。需要发布任务时再评估工具链或 Windows CI，不擅自改流程。
- 小程序编译可在 Ubuntu 完成，微信开发者工具上传、实际图标显示和真机扫码需另行验收。不要照搬 `dev.ps1`、Windows CLI 路径；上传命令或 prepare-only 不属于本次执行范围。

## 提交流程

核对 `git status --short`、`git diff --check`、目标文件差异及敏感信息，只暂存本轮文件；普通提交后 `git push origin main`（其他任务以实际分支为准）。远程变化时先检查，不重置、不强推。文档修改无需追加镜像实现的测试，保证链接、事实及验证层级正确即可。
