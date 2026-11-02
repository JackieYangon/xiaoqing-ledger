# 开发与发布工作流

更新日期：2026-11-02。当前为 Windows 和 PowerShell，2026-10-28 的 Ubuntu 结果仅作历史记录。每次工作先确认实际 Node.js、pnpm、Git 工具，不假定或记录私人绝对运行路径。

## 当前配置与构建目录

在仓库根目录执行：

```powershell
pnpm install --frozen-lockfile
if (!(Test-Path -LiteralPath .env.local)) { Copy-Item .env.example .env.local }
pnpm setup:local
pnpm build:mp-weixin
```

需要正式登录时，在被忽略的 .env.local 配置 XQ_APP_ID 和 XQ_CLOUD_ENV，不将真实值写入公开文档或提交。进程值优先；未给替代值时保留本地项目 AppID，显式空 AppID 选择游客模式。云环境须单独配置。

build:mp-weixin 选择 dist/build/mp-weixin/，dev:mp-weixin 选择 dist/dev/mp-weixin/。等构建完成后再用开发者工具打开仓库根目录；开发模式持续保持编译进程。普通 setup 和类型检查保留所选目录。仅 setup:local 不会生成 app.json，不用手写空 app.json 掩盖未构建问题。

普通游客预览可不配置云环境。生产上传准备，包括仅准备不上传，要求两项部署标识：

```powershell
node scripts/prepare-local-config.cjs --mp-mode build --require-cloud
pnpm upload:mp-weixin --prepare-only
```

第一条检查并生成配置，第二条构建独立上传项目，不执行上传；两者都不是远程发布或审核提交的证据。实际上传需已登录、已配置的开发者工具 CLI 和该操作授权。

## 缺环境登录错误排查

1. 核对本地 XQ_APP_ID、XQ_CLOUD_ENV 及覆盖它们的进程变量，目标环境须有已部署的 ledger 云函数。
2. 重新生产构建，或重启开发编译进程并等完成；重新打开项目，核对实际读取目录。
3. 若当前产物已含环境，但仍提示旧的缺环境错误，仅清除开发者工具的编译缓存，再编译并登录。不要清应用存储或全部用户数据。
4. 若出现当前的新错误，检查其内容及对应云函数日志；H5 只有游客体验，不能验证正式登录。

**实际观察（2026-11-02）**：按以上方式清除旧编译缓存后，模拟器登录成功并显示个人账号、已同步状态和最近同步时间；该账本为零笔记录。这不代表真机、多账号或新增账单验收。

## 提交前验证

按修改范围选择检查：

```powershell
pnpm test
pnpm type-check
pnpm build:mp-weixin
pnpm build:h5
```

命令完成后才在 status.md 记录结果。同日 v1.0.4 全部 11 个测试入口、类型检查及小程序构建已通过；随后 r1 仅更新版本及文档，定向版本测试、小程序、桌面 UI 和 Windows 安装包构建均通过。安装包大小及内部归档核验见 status.md，实际安装和完整扫码仍未验证；不要把之前通过的全量检查写成 r1 已重新执行。

质量门槛：主包小于 1500000 字节，requiredComponents，单图片/音频不超过 200000 字节。r1 产物核对版本 1.0.4-r1、代码 10004、正确根目录、14 页及非空云环境，具体包体数值见 status.md。

pnpm test 先生成共同核心，再执行 11 个入口：

| 入口 | 覆盖及边界 |
| --- | --- |
| version、upload-mp-weixin | 版本、构建模式、配置优先级、严格预检和上传回执；上传是模拟，缺配置预检另跑真实子进程 |
| ledger、insights | 数据兼容、金额、存储失败、筛选、预算及统计 |
| ui-features | 页面 setup 和交互模拟，不是真机渲染 |
| cloud | 模拟数据库隔离、事务、并发、分页及恢复 |
| auth、auth-persistence | 游客隔离、登录、存储、恢复、身份变化和网络异常 |
| features | 群组、资料、分类及周期语义 |
| desktop-auth、desktop-gateway | 配对、过期/重放、网关限制及平铺文件一致性 |

模拟上传成功或注入数据库错误不是实际远程事件。检查已跟踪 cloudfunctions/ledger/core.cjs 无意外变更；配置、dist、安装包及临时文件不得入源码提交。文档修改以事实、链接、语言和差异核验为主，不增加只复述文字的测试。

## Git 与版本发布

先查 git status --short、git diff --check、目标差异及敏感信息，只暂存授权文件。**Git 提交信息用英文；默认 README、发布标题/说明、AGENTS 和项目记忆保持中文。** 保留 README.en.md 作为英文译本。提交后推送实际分支到 origin；远程变化先检查和整合，不重置用户工作、不强推；失败保留本地提交。

发布沿用历史交付格式，除非用户明确变更范围，必须包括对应版本的 Windows EXE、中文 Quickstart 和 SHA256SUMS.txt，不能把自动源码归档当成完整桌面交付。固定顺序为：

1. 核对版本、授权和远程状态，先创建发布草稿，保留应有的体验测试版标识。
2. 构建对应版本的桌面安装包，准备中文安装及使用说明，生成附件 SHA-256 清单；记录构建结果及尚未完成的真机/安装验收。
3. 上传所有预期附件，逐项核对版本、文件名、大小、校验值与完整性；未齐全前保持草稿。
4. 全部附件检查通过后发布，再核验远程标签目标、发布状态和资产列表，并更新项目状态。

**当前发布事实（2026-11-02）**：v1.0.4 预发布已发布，标签目标 055750626406cbbf7ed4c734c27264c5187bce40，immutable:true 且零自定义附件，保留历史。无法补附件或删除后复用标签，用户已选择补发 v1.0.4-r1。r1 完整附件准备及发布尚待完成；不提前标记成功，也不把此前仅源码状态当最终范围。中文标题和正文的远程更新结果需单独核验。

普通提交不等于部署云函数或小程序审核。本轮已有版本补发授权继续有效，不重复询问；若后续需另行部署，按实际任务授权执行并独立记录结果。

## 历史 Ubuntu 工作流

2026-10-28 使用 Ubuntu 22.04.5 LTS x86_64、临时 Node.js 22.16.0（归档 SHA-256 核验）和 pnpm 10.20.0；未永久改 PATH 或依赖版本。以下命令当时通过：

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm type-check
CI=1 pnpm build:mp-weixin
CI=1 pnpm build:h5
pnpm build:desktop-ui
pnpm build:desktop-gateway
```

安装使用临时 store、952 包、锁文件不变。CI=1 跳过依赖更新检查，避免受限 os.networkInterfaces()；没有改依赖源码。虽然存在被忽略的依赖安装脚本提示，实际前端构建通过，没有盲目批准全部脚本或整体升级。

历史配置为空，不能验证登录。示例网关模式 release，而旧桌面文档为 trial，不据此判断实际云端设置。Linux 可用 cp -n .env.example .env.local 防止覆盖，不照搬 Windows 盘符或命令。

## 桌面与平台边界

- 桌面需要 Node.js 22.12 或更新版本；XQ_DESKTOP_API_URL 在本地配置，XQ_WECHAT_APP_SECRET 只放云端服务端。build:desktop-gateway 保持网关文件根目录平铺。
- XQ_MINI_ENV 与实际小程序代码版本一致；体验/开发版本须包含桌面确认页，体验用户需有访问权限；云端变量优先于生成配置。
- 历史 Ubuntu 会话带 ELECTRON_RUN_AS_NODE，版本输出不等于 GUI 启动；移除后仍受沙箱和无图形环境限制，没有关闭应用安全配置绕过。
- 当时缺少 Windows NSIS 打包工具，未尝试 EXE 构建；这不代表当前 Windows 任务不能打包。当前 r1 安装包制作状态以 status.md 最新证据为准。
- 构建成功、附件下载完整、安装卸载成功、完整扫码同步成功是不同验收层级；模拟测试或模拟器登录不能代替全部实际体验。
