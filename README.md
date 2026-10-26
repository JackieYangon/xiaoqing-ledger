# 小青账本

基于 uni-app + Vue 3 + TypeScript 的微信记账小程序。当前版本 **0.2.0，本地增强版**。

## 功能

- **快速记账**：分类选择、金额加减计算（如 `18.5+6-2`）、自定义数字键盘、常用备注建议、保存并再记、复制历史账单再记一笔。
- **收支明细**：按日分组，月份、类型、分类及备注搜索；日历显示每日收支，选中日期可补记。
- **预算管理**：每月独立总预算及分类限额，剩余预算、进度和超支提示。空金额表示不设限，分类限额不自动分摊总预算。
- **统计**：月度/年度收支、结余、记录天数、每日/每月趋势、分类排行、前五笔大额记录。月度分类可点击查看明细。
- **分类管理**：每种收支类型最多新增 40 个自定义分类。默认分类及被历史账单、预算引用的分类不能删除。
- **备份恢复**：完整 JSON 复制、校验预览、确认合并；兼容 v0.1 备份，重复导入不会重复入账，相同 ID 保留本机版本。已有月份预算、隐私设置不覆盖。
- **CSV 导出**：复制全部或指定月份账单的 CSV 文本，保存为 UTF-8 `.csv` 后可用 Excel 打开；不支持用 CSV 恢复。
- **首页金额隐藏**：隐藏首页总额、预算金额和最近账单金额，并记住开关；其他页面仍可查看明细。

功能方向参考 [鲨鱼记账官网](https://www.shayujizhang.com/) 的快速记账、预算、收支日历和统计能力；使用小青自己的品牌与界面，不包含对方素材。

## 启动

需要 Node.js 20+ 和 pnpm。使用 `pnpm-lock.yaml` 锁定依赖。

```powershell
pnpm install --frozen-lockfile
pnpm dev:mp-weixin
```

等待编译完成后，在微信开发者工具导入**项目根目录**。`project.config.json` 中 `miniprogramRoot` 指向 `dist/dev/mp-weixin/`；开发期间保持编译终端运行。

项目已配置自己的 AppID。其他开发者使用此工程时，请同步修改 `src/manifest.json` 的 `mp-weixin.appid` 和根目录 `project.config.json` 的 `appid`。不填写 AppSecret，顶层的 DCloud appid 是另一个字段。

Windows 也可使用快捷脚本；它优先使用 PATH 中的 pnpm，再尝试本机 Codex 自带的 pnpm，不改系统环境变量：

```powershell
.\dev.ps1
.\dev.ps1 -Target h5
```

H5 预览可用 `pnpm dev:h5`，地址以终端显示为准。微信真机验证仍需在开发者工具完成。

## 检查与构建

```powershell
pnpm test
pnpm type-check
pnpm build:mp-weixin
pnpm build:h5
```

生产产物在 `dist/build/mp-weixin`，可单独导入开发者工具；H5 产物在 `dist/build/h5`。不要直接修改 dist 文件。

## 数据与升级

数据仍使用 `xiaoqing.ledger.v1` 本地存储键，内部格式升级为 schema 2。读取旧 schema 1 不改写原始数据，首次成功保存时升级；写入失败不报告成功。发现损坏或未知格式时停止写入，避免覆盖原数据。

金额按整数分保存。预算、账单和分类使用同一份存储快照；备份先完整校验，确认后一次性写入，重复导入按账单 ID 去重，不静默覆盖冲突账单。备份恢复文本上限 200 万字符，账单数上限 50000，自定义分类每种最多 40 个。合并超限会拒绝写入。

清除应用存储会丢失账本；浏览器、开发工具和手机的本地数据相互独立。**当前没有微信登录、云端同步、定时提醒、自动读取支付账单或电脑端 EXE。** 本地备份不是加密备份，请自行妥善保管。

## 代码结构

- `src/core/ledger.ts`：金额计算、校验、旧版兼容、预算/分类、备份合并、统计与 CSV。
- `src/services/ledger.ts`：本地仓库适配、共享状态与导航。
- `src/components/BillList.vue`：账单列表展示。
- `src/pages/`：首页、明细/日历、记账、统计、预算、分类、数据备份和我的。
- `tests/ledger.test.cjs`：数据完整性、金额、预算、分类、升级、备份、日历边界测试。

未来接入 NestJS + PostgreSQL 时，将数据入口改为异步 API，补充登录、鉴权、请求幂等和冲突处理，并设计用户确认的本地数据迁移流程，再接入 Electron 电脑端。

模板来源：https://github.com/dcloudio/uni-preset-vue/tree/vite-ts
