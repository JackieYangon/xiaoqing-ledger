# 架构与数据流

核对日期：2026-10-28。以下为**代码已实现**，证据为列出的源码；不表示线上部署或真机通过。

## 客户端与入口

- 小程序：Vue 3、TypeScript、uni-app；`src/main.ts`、`src/App.vue` 启动及前台恢复认证，`src/pages.json` 声明页面和四个底部导航项。`src/pages/` 提供记账、明细、预算、统计、群组、资料、定期任务、备份及桌面登录确认。
- `src/core/ledger.ts` 负责整数分金额、schema 1/2 兼容、校验、分类、预算、备份合并；`src/core/insights.ts` 负责两端筛选、排序、预算复制及同进度统计。
- `src/services/ledger.ts` 维护当前账号/账本状态、读写和切换；`src/core/cloud-client.ts` 处理 revision 分页、幂等请求、待确认写入及恢复。待确认存储键按环境、账号、群组隔离，退出不直接删除未确认写入。
- `src/services/guest-ledger.ts` 通过内存读写适配器构造示例账本，不访问旧数据，不随登录迁入正式账本。H5 为游客体验，条件编译禁用微信云端登录。
- 桌面：`desktop/ui/main.js` → `App.vue`，Vue 界面复用上述核心；`desktop/main.cjs` 创建 Electron 窗口及 HTTPS 请求，`preload.cjs` 仅暴露受限 IPC 接口。启用 contextIsolation/sandbox，关闭 nodeIntegration，拦截新窗口及导航。会话 token 在界面内存中；待确认请求使用 localStorage。

## 认证和正式账本

1. 小程序主动登录经 `cloud-transport.ts` 调用 `ledger`；`handler.js` 校验可信上下文 APPID/OPENID，计算账号归属，不信任客户端 owner。
2. 服务端建立最长 24 小时会话，仅存凭据散列；业务操作再次校验账号与会话。`auth.ts` 专用本地登录记录只含会话、账号及到期时间，冷启动/前台验证，过期续期必须保持同一账号。网络失败隐藏账号数据并保留登录记录；身份变化清除原账号状态。
3. 桌面生成随机凭据，仅发送散列申请二维码；二维码包含公开 scene。小程序已登录用户核对六位数字并确认，`desktop-auth.js` 事务创建归属于该用户的 desktop_session。配对 2 分钟、会话 24 小时；取消、过期和重复确认受校验。
4. `desktop-gateway/index.js` 只接收限定 POST 操作，验证桌面会话后传给共享 handler，访问同一账号和群组账本。网关是独立 HTTP 入口，不能把原 ledger 暴露为匿名 HTTP。

证据：`src/services/auth.ts`、`src/services/cloud-transport.ts`、`desktop/{main,preload}.cjs`、`desktop/ui/App.vue`、`cloudfunctions/ledger/{index,handler,desktop-auth}.js`、`cloudfunctions/desktop-gateway/index.js`。

## 云端与数据安全

- `xq_books`：账本设置、资料、群组及定期规则；`xq_entries`：账单；`xq_requests`：会话、幂等回执、邀请、配对及 cycle_ 周期标记。集合管理员权限是部署要求，本轮未查询线上权限。
- 群组成员资格在读取及事务内重新验证；群主管理预算、分类及导入，成员仅可修改/删除自己的普通账单。自动定期账单允许关联同项目的手动记录更新，需保留该例外语义。
- 写入使用请求指纹和回执去重，校验账本 revision 与记录 version；事务同时更新账单、计数和设置。不确定结果保留待确认请求，冲突要求刷新后重新确认。
- `features.js` 按北京时间计算周/月周期，`cycleId(scope, ruleId, period)` 保证关联唯一；每次调度处理最多 20 个到期规则。入口仅接受可信 SOURCE=wx_trigger 且匹配 timer 名称的全局任务。

证据：`cloudfunctions/ledger/{handler,features,index}.js`、`src/core/cloud-client.ts`、`tests/{cloud,features,desktop-auth}.test.cjs`。

## 配置及生成链

- 版本唯一来源为根 `package.json.version`（当前 1.0.3）。`src/config/version.ts` 用于界面；`prepare-local-config.cjs` 生成 manifest 版本名称/数字版本。云函数子包版本是独立包元数据，不代表产品版本。
- `.env.local` 或进程变量配置 XQ_APP_ID、XQ_CLOUD_ENV；环境变量优先。模板为 `src/manifest.template.json`、`project.config.template.json`。生成 `src/manifest.json`、`project.config.json`、`src/config/cloud.local.ts`、`cloudfunctions/ledger/local-config.json`，均忽略提交。缺配置可生成空值以编译，不能访问正式云端。
- `build-cloud.cjs` 将 `src/core/ledger.ts` 转译为**已跟踪**的 `cloudfunctions/ledger/core.cjs`；不要直接编辑生成副本。`build:cloud` 先生成配置，`test` 先生成共享核心。
- `build-desktop-gateway.cjs` 生成配置及共享核心后，将 handler.js、features.js、core.cjs、desktop-auth.js、local-config.json **平铺**复制到网关根目录，全部忽略提交；不要恢复嵌套 ledger 目录。二维码模式优先级：云端环境变量 → 生成配置 → release。
- `prepare-desktop.cjs` 从 XQ_DESKTOP_API_URL 生成 `desktop/config.local.json`；只允许无凭据 HTTPS 地址。XQ_WECHAT_APP_SECRET 只能放云函数服务端环境变量。
- `dist/`、`release/`、`work/`、node_modules 和本地配置被忽略；`outputs/` 已跟踪且非忽略目录，不能作为默认私人工作区。

证据：`package.json`、`.env.example`、`.gitignore`、`scripts/prepare-*.cjs`、`scripts/build-*.cjs`。
