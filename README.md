# 小青账本

uni-app + Vue 3 + TypeScript 小程序。当前为本地体验版，尚未接入微信登录、云同步或电脑端，不可作为完整线上产品发布。

## 启动

需要 Node.js 20+ 和 pnpm。项目使用 pnpm-lock.yaml 锁定依赖。

```powershell
pnpm install --frozen-lockfile
pnpm dev:mp-weixin
```

先等待开发编译完成，再在微信开发者工具导入项目根目录；根目录 `project.config.json` 的 `miniprogramRoot` 已指向 `dist/dev/mp-weixin/`。开发期间保持编译终端运行。也可直接导入编译目录。在 `src/manifest.json` 的 `mp-weixin.appid` 填入自己的微信 AppID（不是顶层的 DCloud appid），重新编译。不填写 AppSecret。无 AppID 时可以先使用 H5 预览，开发工具测试号能力以工具提示为准。

```powershell
pnpm dev:h5
```

Windows 如果尚未把 pnpm 加入 PATH，也可以在本机执行项目的 `dev.ps1`，它优先使用 PATH 中的 pnpm，再尝试当前 Codex 自带的 pnpm。不修改系统环境变量。

```powershell
.\dev.ps1
.\dev.ps1 -Target h5
```

## 已实现

- 首页本月收支和最近账单；无演示账单，首次启动为空。
- 新增、编辑、删除收支记录；整数分金额，日期和分类校验。
- 按月份、收支类型、备注或分类查询。
- 月度收支结余、分类占比。
- 复制 JSON 备份（尚无导入界面）。
- 存储失败不报告保存成功；损坏数据不会被新账单覆盖；编辑版本校验。

## 数据说明

数据存储于当前运行环境的 `xiaoqing.ledger.v1` 本地存储键。浏览器、模拟器、真机互相独立；清除存储会丢失记录。请不要把唯一的重要账本放在测试版本里。H5 用于界面检查，不能替代微信真机验收。

`src/core/ledger.ts` 是可单独测试的金额、校验和本地存储逻辑；`src/services/ledger.ts` 是页面的数据访问入口。未来云端接入时，应将该入口改为异步 API，而不是把本机保存继续当作云端保存。须明确设计旧本地数据迁移并由用户确认。

## 检查

```powershell
pnpm test
pnpm type-check
pnpm build:mp-weixin
pnpm build:h5
```

生产编译目录为 `dist/build/mp-weixin`。源码在 `src`，不要改 dist 中的生成文件。

## 手工验收

1. 新安装应显示空账本，无虚构登录或同步状态。
2. 新增 25 元餐饮支出、100 元工资收入，首页应显示支出 25、收入 100、结余 75。
3. 将餐饮修改为 30 元，返回各页面统计应同步变化；重新启动后仍存在。
4. 按月份/类型/关键词筛选；删除时取消应保留，确认后移除。
5. 输入 0、负数、三位小数应失败；存储异常不应显示保存成功。
6. 复制备份，在文本编辑器检查账单内容。

## 后续阶段

NestJS + PostgreSQL 后端、微信登录和账号绑定、服务端鉴权、请求幂等和版本冲突、云端备份，再接入 Electron 电脑端。当前不包含实际服务地址或伪造接口。

模板来源：https://github.com/dcloudio/uni-preset-vue/tree/vite-ts
