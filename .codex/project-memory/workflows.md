# 开发与发布工作流

更新日期：2026-11-10。当前为 Windows 和 PowerShell，2026-10-28 的 Ubuntu 结果仅作历史记录。每次工作先确认实际 Node.js、pnpm、Git 工具，不假定或记录私人绝对运行路径。

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

命令完成后才在 status.md 记录结果。2026-11-10 的 1.0.5 修改在二级页面清理后通过全部 12 个测试脚本、类型检查、小程序与 H5 生产构建；共享核心修改后的桌面 UI 构建也已通过。H5 在隔离浏览器中完成手机尺寸的实际渲染及预算明细跳转检查，具体范围见 status.md。历史 v1.0.4/r1 检查不能代替本轮验证；构建、页面显示、真机登录和实际安装分别记录，不互相替代。

质量门槛：主包小于 1500000 字节，requiredComponents，单图片/音频不超过 200000 字节。本轮已核对产物版本 1.0.5、代码 10005、生产根目录、14 页及本地 AppID/云环境存在；主包 309764 字节、9 个媒体文件、最大 51787 字节。只报告配置存在与否，不输出真实标识。

pnpm test 先生成共同核心，再执行 package.json 列出的测试入口：

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

## 本机工具恢复记录

- **实际观察，2026-11-10**：迁移后的 node_modules 含 Windows 不信任的旧目录链接，关键依赖无法通过链接读取。先校验源与目标均在工作区内，将旧 node_modules 非破坏性移动到被忽略的 work/dependency-recovery-v1.0.5/node_modules，再使用原锁文件、已有缓存和仅命令行的 hoisted/copy 选项安装；未修改项目依赖、锁文件、安全策略或 ACL。
- 此次使用 pnpm 11 运行脚本时显式设置 --config.verify-deps-before-run=false，避免其自动校验把已恢复布局重新安装。此为本机恢复办法，不写入项目通用依赖设置；不要由此整体升级依赖。
- VS Code 无 Git 追踪时先查看最新 Git 输出：区分 Git 未找到、未打开仓库、所有者信任检查失败与侧栏隐藏。仅在确认当前仓库可信且错误确为所有者检查时加入该仓库的精确 safe.directory，禁止通配信任。修复后以普通 Git 状态及 VS Code 打开仓库日志验证；Ctrl+Shift+G 可打开源代码管理。

## Git 与版本发布

先查 git status --short、git diff --check、目标差异及敏感信息，只暂存授权文件。**Git 提交信息用英文；默认 README、发布标题/说明、AGENTS 和项目记忆保持中文。** 保留 README.en.md 作为英文译本。提交后推送实际分支到 origin；远程变化先检查和整合，不重置用户工作、不强推；失败保留本地提交。

发布沿用历史交付格式，除非用户明确变更范围，必须包括对应版本的 Windows EXE、中文 Quickstart 和 SHA256SUMS.txt，不能把自动源码归档当成完整桌面交付。固定顺序为：

1. 核对版本、授权和远程状态，先创建发布草稿。标题显示中文版本名称和版本号；按用户要求将当前发布设为 Latest，此时不能同时标为预发布。发布标记不代替实际验收，仍如实说明未签名和未完成的验证。
2. 构建对应版本的桌面安装包，准备中文安装及使用说明，生成附件 SHA-256 清单；记录构建结果及尚未完成的真机/安装验收。
3. 上传所有预期附件，逐项核对版本、文件名、大小、校验值与完整性；未齐全前保持草稿。
4. 全部附件检查通过后发布，再核验远程标签目标、发布状态和资产列表，并更新项目状态。

**当前发布事实（2026-11-02）**：v1.0.4 预发布已发布，标签目标 055750626406cbbf7ed4c734c27264c5187bce40，immutable:true 且零自定义附件，保留历史。无法补附件或删除后复用标签，用户已选择补发 v1.0.4-r1。r1 已发布，标签目标 a7c66235b4d08f73168ef2668f176de135f2ea67；先在草稿中核对全部三个附件的名称、大小与 SHA-256，再发布为普通 Release，并依用户要求设为 Latest。releases/latest 已确认指向 v1.0.4-r1，中文标题和正文已核验。v1.0.4 的中文标题及正文也已更新，旧标签不变。

**当前任务边界（用户确认，2026-11-10）**：1.0.5 只修改、验证、提交并推送，先不创建 tag 或 Release，待用户试用后再发布。此前 r1 补发已完成，不能沿用为本轮发布授权。普通提交不等于部署云函数、小程序上传或审核；这些动作按对应任务授权执行并独立记录。

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
