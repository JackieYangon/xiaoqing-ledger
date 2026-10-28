# 当前状态与迁移记录

核对日期：2026-10-28；初始工作树干净，分支 main，源码基线 `4c8a3d2`；origin 为本项目仓库 `git@github.com:JackieYangon/xiaoqing-ledger.git`。本轮仅新增项目记忆并更新 AGENTS.md，不修改业务实现、不升级依赖、不部署云函数或发布版本。

## 版本与背景差异

| 状态 | 事实及证据 |
| --- | --- |
| 代码已实现 | 根 package.json、双语 README 及本地标签包含 1.0.3，产品当前源码版本为 1.0.3；不同于背景 v1.0.1。LICENSE 为 MIT。 |
| 尚未验证 | docs/releases/v1.0.3.md 记载 Windows 体验测试版及历史构建结果；本轮未核验远程 Release 附件、小程序线上版本或安装包。标签存在不等于发布验收。 |
| 代码已实现 / 差异 | `4c8a3d2` 已在 v1.0.3 版本号基础上加入游客内存体验和持久登录，见 auth.ts、guest-ledger.ts、auth-persistence 测试；与“所有业务必须登录”背景冲突，详见 decisions.md，暂不改行为。 |
| 代码已实现 / 差异 | outputs/开始使用.md 含“冷启动需重新登录”“H5 仅登录提示”“未实现电脑端”“已有记录分类不能删除”等旧说法，且与其验收清单冲突；后续不能以此为当前事实，本轮保留原文。 |
| 用户确认 | 用户在本次接手说明中确认此前微信扫码成功；只代表此前扫码路径，不代表当前 Ubuntu、完整跨端同步、群组和异常场景验收。 |

## 本轮验证

以下均在 2026-10-28 执行，证据为对应命令退出码及输出：

| 状态 | 检查及结果 |
| --- | --- |
| 测试通过 | 临时 Node.js 22.16.0 + pnpm 10.20.0；`pnpm install --frozen-lockfile`（临时 store）成功，952 包；package.json、锁文件无修改。 |
| 测试通过 | `pnpm test` 全部 11 个测试入口通过；数据库、页面和上传服务使用模拟，非线上或真机测试。 |
| 测试通过 | `pnpm type-check`。 |
| 测试通过 | `CI=1 pnpm build:mp-weixin`：主包 300529 字节，requiredComponents，9 个媒体资源最大 51787 字节，三项门槛通过。空部署配置编译结果，不代表可登录的部署包。 |
| 测试通过 | `CI=1 pnpm build:h5`、`pnpm build:desktop-ui`、`pnpm build:desktop-gateway`；共享生成核心无差异，网关根目录文件一致。 |
| 测试通过 | 已跟踪 10 个 JSON 可解析；`git check-ignore` 验证本地配置、dist/release/work 被忽略。 |
| 尚未验证 | Electron GUI：运行文件 45.0.0 已下载，清除 ELECTRON_RUN_AS_NODE 后因沙箱权限失败，无图形显示变量。不能把 Node 模式版本输出当 Electron 启动成功。 |
| 尚未验证 | Windows exe 打包：PATH 无 wine、makensis；没有运行 package:desktop，没有修改发布流程。 |

构建出现现有循环依赖警告及 Vite CJS API 弃用提示，不影响本轮构建通过。普通沙箱构建初次因更新检查调用网卡接口失败，改用依赖支持的 CI=1 后通过；没有修改依赖源码。

## 配置与环境待办

- **尚未验证（2026-10-28）**：初检 `.env.local`、所有生成配置均缺失，XQ_APP_ID / XQ_CLOUD_ENV / XQ_DESKTOP_API_URL / XQ_MINI_ENV 未设置。验证后仅生成空部署配置及默认 release 网关配置；没有真实配置迁入。需要联调时在忽略的 `.env.local` 安全补齐，详见 workflows.md。
- **代码已实现（2026-10-28）**：示例及网关默认模式是 release；历史发布说明记载 trial。当前线上环境变量不可见，不判断线上扫码模式。
- **尚未验证（2026-10-28）**：云端集合权限、索引、20 秒超时、网关限流、触发器部署及执行日志均未查询。config.json 的 timer 定义不能证明任务正在执行。
- **尚未验证（2026-10-28）**：双账号、双设备双向同步、群组权限真机交互、网络断开恢复、扫码取消/过期/重放真机路径、图标显示、Windows 安装卸载及新增页面实际体验。
- **待办（2026-10-28）**：系统仍缺持久 Node/pnpm 工具链，本轮使用临时目录工具；后续开发先确认 PATH，桌面依赖要求 Node >=22.12（依据 electron 包 engines）。不沿用仅 Node 20 的一般前端说明覆盖桌面要求。
- **待办（2026-10-28）**：后续涉及登录边界时确认游客差异；按需修订 outputs 旧指南。现阶段不重构、不部署、不建立第二套记忆。
