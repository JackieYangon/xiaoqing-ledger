# 架构与数据流

核对日期：2026-11-10。以下为**代码已实现**，证据为所列源码，不表示线上部署或真机通过。核心架构最初记录于 2026-10-28；本轮版本改动集中于小程序界面、预算用量展示和静态说明文案，不改变认证、云端协议及数据格式。

## 客户端与入口

- 小程序：Vue 3、TypeScript、uni-app；src/main.ts 和 src/App.vue 处理启动及前台恢复认证，src/pages.json 声明页面和四个底部导航。src/pages/ 包括记账、明细、预算、统计、群组、资料、定期任务、备份及桌面登录确认。
- src/styles/theme.css 由 src/App.vue 引入，统一小程序主题、卡片、表单和账单列表样式；各页面保留局部布局。
- src/core/ledger.ts 负责整数分金额、schema 1/2 兼容、校验、分类、预算、备份合并和统计；src/core/insights.ts 负责两端筛选、排序、预算复制草稿、同进度统计，以及供小程序使用的 budgetUsage 月度预算用量。budgetUsage 返回月度分组和限额、支出、剩余、超出、真实百分比及条形宽度，不修改输入数据。
- src/services/ledger.ts 维护当前账号/账本状态、读写及切换；src/core/cloud-client.ts 处理 revision 分页、幂等请求、待确认写入及恢复。待确认存储键按环境、账号、群组隔离，退出不直接删除未确认写入。
- src/services/guest-ledger.ts 用内存适配器构造示例账本，不访问旧数据，不随登录迁入正式账本。H5 为游客体验，条件编译禁用云端账号登录。
- 桌面：desktop/ui/main.js 加载 App.vue，界面复用共同核心；desktop/main.cjs 创建 Electron 窗口及 HTTPS 请求，preload.cjs 仅暴露受限 IPC。启用 contextIsolation/sandbox，关闭 nodeIntegration，限制新窗口和导航。会话凭据在界面内存，待确认请求使用 localStorage。

## 认证和正式账本

1. 小程序主动登录经 src/services/cloud-transport.ts 调用 ledger；handler.js 校验可信上下文 APPID/OPENID 并计算账号归属，不信任客户端指定的 owner。
2. 服务端建立最长 24 小时会话，仅存凭据散列；业务操作再次校验账号和会话。auth.ts 专用本地登录记录只含凭据、账号和到期时间；冷启动/前台验证，过期续期须保持同一账号。网络失败隐藏账号数据并保留登录记录，身份变化清除原账号状态。
3. 桌面生成随机凭据，只发送散列申请二维码；二维码含公开 scene。已登录的小程序用户核对六位数字并确认，desktop-auth.js 事务创建该用户的 desktop_session。配对有效期 2 分钟，会话 24 小时，取消、过期及重复确认受校验。
4. cloudfunctions/desktop-gateway/index.js 只接收限定 POST 操作，验证桌面会话后交给共享 handler，访问同一账号及群组账本。网关是独立 HTTP 入口，原 ledger 不能暴露为匿名 HTTP。

证据：src/services/auth.ts、src/services/cloud-transport.ts、desktop/main.cjs、desktop/preload.cjs、desktop/ui/App.vue，以及云端入口、handler、desktop-auth 模块。

## 云端与数据安全

- xq_books 保存账本设置、资料、群组及定期规则；xq_entries 保存账单；xq_requests 保存会话、幂等回执、邀请、配对和 cycle_ 周期标记。集合管理员权限是部署要求，不由本地代码检查推定线上已满足。
- 群组成员资格在读取及事务内重新验证；群主管理预算、分类和导入，成员只修改/删除自己的普通账单。自动定期账单允许关联同项目的手动记录更新，保留这一例外语义。
- 写入用请求指纹和回执去重，校验账本 revision 和记录 version；事务同时更新账单、计数及设置。不确定结果保留待确认请求，冲突需刷新后再确认。
- features.js 按北京时间计算周/月周期，cycleId(scope, ruleId, period) 保证关联唯一；每次调度最多处理 20 个到期规则。全局任务入口只接受可信 SOURCE=wx_trigger 且匹配 timer 名称的请求。

证据：cloudfunctions/ledger/handler.js、features.js、index.js、src/core/cloud-client.ts 及 cloud/features/desktop-auth 测试。

## 配置与生成链

- 应用版本唯一来源为根 package.json.version，当前为 1.0.5。src/config/version.ts 用于界面；scripts/prepare-local-config.cjs 生成 manifest 版本名称及数字代码，1.0.5 对应数字代码 10005。云函数子包版本是独立元数据。
- 配置脚本接受 --mp-mode dev|build 和 --require-cloud。开发/生产命令传入对应模式；不指定模式时保留已知 dist/dev/mp-weixin/ 或 dist/build/mp-weixin/，否则取模板默认值。
- AppID 优先级为进程 XQ_APP_ID、.env.local 中 XQ_APP_ID、本地项目既有 AppID；显式空值选择游客模式，touristappid 视为无正式 AppID。XQ_CLOUD_ENV 来自进程环境或 .env.local，单有 AppID 不会自动得到云环境。
- 模板为 src/manifest.template.json 和 project.config.template.json。生成的 src/manifest.json、project.config.json、src/config/cloud.local.ts、cloudfunctions/ledger/local-config.json 均忽略提交。所有输入校验后才写入，内容不变则不重写；普通预览构建允许空部署配置。
- 上传准备（含 --prepare-only）先执行 --mp-mode build --require-cloud；缺 AppID 或云环境则在配置写入、构建及上传目录创建前失败。每次上传重新生产构建、检查质量，并复制可读字节到新的 work/wechat-release/ 项目，设置 miniprogramRoot=miniprogram/。上传成功须同时有 CLI 成功状态和新回执；prepare-only 不上传。
- scripts/build-cloud.cjs 将 src/core/ledger.ts 转译为已跟踪的 cloudfunctions/ledger/core.cjs，不直接修改生成副本。build:cloud 先生成配置，test 先生成共同核心。
- scripts/build-desktop-gateway.cjs 生成配置及核心，再把 handler、features、core、desktop-auth、local-config 平铺复制至网关根目录；这些副本被忽略，不恢复嵌套 ledger 目录。二维码模式优先级为云端环境变量、生成配置、release。
- scripts/prepare-desktop.cjs 从 XQ_DESKTOP_API_URL 生成 desktop/config.local.json，只允许无嵌入凭据的 HTTPS 地址。XQ_WECHAT_APP_SECRET 只能在云函数服务端配置。
- dist/、release/、work/、node_modules/ 和本地部署配置被忽略；outputs/ 已跟踪，不作为默认私人工作目录。桌面附件通过发布资产交付，不加入源码提交。

证据：package scripts、.env.example、.gitignore、配置/构建/上传脚本及回归测试。实际测试和发布情况见 status.md，发布步骤见 workflows.md。
