<p align="center"><img src="src/static/avatar.png" width="88" height="88" alt="Xiaoqing Ledger logo" /></p>
<h1 align="center">Xiaoqing Ledger</h1>
<p align="center"><b>Record daily spending. Keep your books in sync.</b><br />A WeChat bookkeeping mini program built with uni-app, Vue 3 and TypeScript.</p>
<p align="center"><a href="README.md">简体中文</a> · <b>English</b></p>
<p align="center">
  <a href="#features"><img src="https://img.shields.io/badge/version-1.0.2-237859?style=flat-square" alt="Version 1.0.2" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="MIT" /></a>
  <a href="https://developers.weixin.qq.com/miniprogram/dev/framework/"><img src="https://img.shields.io/badge/WeChat-Mini_Program-07C160?style=flat-square&amp;logo=wechat&amp;logoColor=white" alt="WeChat" /></a>
  <a href="https://uniapp.dcloud.net.cn/"><img src="https://img.shields.io/badge/framework-uni--app-2B9939?style=flat-square" alt="uni-app" /></a>
  <a href="https://vuejs.org/"><img src="https://img.shields.io/badge/Vue-3-4FC08D?style=flat-square&amp;logo=vuedotjs&amp;logoColor=white" alt="Vue 3" /></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&amp;logo=typescript&amp;logoColor=white" alt="TypeScript" /></a>
</p>
<p align="center"><a href="#screenshots">Screenshots</a> · <a href="#demo">Live demo GIF</a> · <a href="#features">Features</a> · <a href="#getting-started">Getting started</a> · <a href="#deploying-cloud-development">Cloud deployment</a></p>
<p align="center">Version 1.0.2 · Cross-platform filtering · Budget reuse · Period comparisons</p>

<a name="screenshots"></a>
<h2 align="center">A look inside</h2>
<p align="center">Sign in, organize categories, and set a recurring schedule.</p>
<table align="center" width="100%">
  <tr>
    <td width="33%" align="center" valign="top"><h3>WeChat sign-in</h3><img src="docs/images/login.png" width="220" alt="WeChat sign-in" /><p>Sign in to access your synced ledger.</p></td>
    <td width="33%" align="center" valign="top"><h3>Category management</h3><img src="docs/images/categories.png" width="220" alt="Category management" /><p>Rename or delete any category.</p></td>
    <td width="33%" align="center" valign="top"><h3>Recurring schedules</h3><img src="docs/images/recurring.png" width="220" alt="Recurring schedules" /><p>Choose a monthly date in one tap.</p></td>
  </tr>
</table>

<a name="demo"></a>
<h2 align="center">Choose a day. Repeat every month.</h2>
<table align="center" width="100%">
  <tr>
    <td width="36%" align="center" valign="middle"><img src="docs/images/recurring-selection.gif" width="260" alt="Selecting monthly recurring dates" /><br /><sub>Monthly day selection</sub></td>
    <td width="64%" valign="top">
<h3>Set a schedule in three steps</h3>
<ol><li><b>Choose a cycle</b><br />Monthly or weekly, for recurring expenses such as rent or subscriptions.</li><li><b>Select the date</b><br />Tap 1–31 in the monthly grid. Dates beyond the month length use its last day.</li><li><b>Enter the amount and category</b><br />Create the rule; the cloud scheduler checks due rules every five minutes after its trigger is deployed.</li></ol>
<h3>Keep one entry per period</h3>
<ul><li>Link a manual expense to the rule to prevent duplicate automatic records.</li><li>Pause a rule, or delete it while keeping historical entries.</li><li>Schedules create ledger records, not actual payments.</li></ul>
<p><b>More than recurring entries</b><br />Switch between personal and group books, share group budgets, review trends, and export JSON or CSV backups.</p>
<p><a href="#getting-started">Set up your own instance →</a></p>
    </td>
  </tr>
</table>
<p align="center"><sub>Actual mini program screenshots; the GIF plays captured selection steps with pauses. No records were created or deleted.</sub></p>

The interface is currently in Simplified Chinese; this README provides English setup and usage instructions. Media excludes personal profiles, transaction details, invitation codes and deployment identifiers. Files in `docs/images/` are not included in the mini program package.

---

Download the Windows preview from the [v1.0.2 Release](https://github.com/JackieYangon/xiaoqing-ledger/releases/tag/v1.0.2). Desktop v1.0.2 remains a pre-release, uses the trial mini program and requires WeChat trial access. See the [release notes](docs/releases/v1.0.2.md).

## Features

- **WeChat sign-in and cloud sync:** all business pages require sign-in. Account ownership is derived on the server from trusted WeChat identity. Use the same WeChat account on another phone to retrieve synced records.
- **Optional profile:** choose an avatar and enter a nickname explicitly. New records retain a snapshot of their author's profile. Names cannot be used to impersonate another account.
- **Personal and group ledgers:** switch books from the profile page. Personal records are not automatically shared. Group members see shared records and their authors, and can edit or delete their own entries. The creator manages shared budgets, categories and imports.
- **Group invitations:** join through a WeChat share card or a 16-character invitation code. Invitations expire after seven days; generating a new invitation invalidates the previous one. Limits: 20 members per group and 20 groups per account. Members can leave; creators can delete an empty group with no rules or other members.
- **Fast entry:** income and expense categories, arithmetic amounts such as `18.5+6-2`, a numeric keypad, note suggestions, and save-and-add-another. Existing records can be copied as new entries.
- **Records and calendar:** combine monthly, custom-date or all-date views with type, historical category, keyword and inclusive amount filters. Search categories, notes and authors; sort by date or amount and export filtered CSV. Calendar totals support backdated entry. The mini program and desktop share the filtering rules.
- **Budgets:** monthly total and category budgets, remaining amounts and overspending indicators on both clients. Copy the previous month's budget into a draft or fill the total from category limits, then save explicitly. Historical categories are retained. Daily allowance divides the remaining total by days left including today; future months use the full month and past months have no daily allowance.
- **Statistics:** monthly/yearly summaries, trends, category rankings and largest entries on both clients, with savings rate, daily average expenses and days without recorded expenses. Current periods compare through today's calendar date against the corresponding date in the previous period, clamped at month end; historical periods compare complete periods. Future-dated entries are excluded from current-period statistics. Savings rate is undefined without income; a day without recorded expenses does not establish that no spending occurred. Hiding amounts affects the home page only.
- **Editable categories:** every category can be renamed or deleted, including the initial categories. Up to 50 categories per income/expense type. Historical entries and existing category budgets retain their original labels. Renaming updates recurring rules; deletion pauses affected rules. Empty category lists remain empty until a category is added.
- **Recurring records:** weekly or monthly schedules, with a 1–31 day grid for monthly rules. Short months use the last day for dates beyond their length. Rules use Beijing time and do not backfill periods before creation. This creates bookkeeping entries, **not actual payments**. Up to 50 rules per ledger.
- **Explicit deduplication:** link a manual expense to its recurring rule. Only one entry is kept per book/rule/period. A manual entry prevents automatic creation; a later manual entry updates an automatically generated one. Unlinked entries are not deduplicated by guessing from amount or category.
- **Pause and delete rules:** resume without backfilling the paused period. Deleting a rule stops future generation and preserves existing entries. Only its creator or the group creator may manage a group rule. A departed member's rules are paused by the scheduler. Deleting a linked entry preserves its period marker so it is not recreated automatically.
- **Backup and export:** JSON backup validation and merge, plus CSV export. Existing entry IDs are skipped on import and current budgets are preserved. CSV is for export, not restoration.

## Getting started

Requirements: Node.js 20+, pnpm, WeChat Developer Tools, and your own mini program AppID and Cloud Development environment.

```powershell
pnpm install --frozen-lockfile
Copy-Item .env.example .env.local
# Set XQ_APP_ID and XQ_CLOUD_ENV in .env.local to your own values.
pnpm setup:local
pnpm dev:mp-weixin
```

After compilation, import the **repository root** into WeChat Developer Tools and click Compile. Keep the development terminal running. The generated `project.config.json` points to `dist/dev/mp-weixin/`.

Do not enter an AppSecret in the frontend. `.env.local` and generated deployment files are ignored by Git:

- `project.config.json`
- `src/manifest.json`
- `src/config/cloud.local.ts`
- `cloudfunctions/ledger/local-config.json`

Edit shared settings in `project.config.template.json` and `src/manifest.template.json`. Development and build commands generate local configuration automatically. After changing manifest settings, restart the development build.

Windows shortcuts are also available:

```powershell
.\dev.ps1
.\dev.ps1 -Target h5
```

The helper uses pnpm from PATH, with a fallback to the local Codex runtime if available; it does not modify system environment variables. H5 is a sign-in preview only, not a usable browser ledger. A desktop EXE is available as a development build; QR sign-in requires a separately configured HTTPS gateway and real-device acceptance testing before production use.

## Checks and builds

```powershell
pnpm test
pnpm type-check
pnpm build:mp-weixin
pnpm build:h5
```

Production output is written to `dist/build/mp-weixin` and `dist/build/h5`. Do not edit generated files. The mini program build automatically checks that the main package is below 1,500,000 bytes, component injection is enabled with `requiredComponents`, and each image/audio asset is at most 200,000 bytes. WeChat Developer Tools remains the final authority for its upload checks.

Documentation images live in `docs/images/`, outside `src/static/`, and are not included in the mini program package.

## Deploying Cloud Development

1. Create `xq_books`, `xq_entries` and `xq_requests` in your own cloud environment. Set all three to **administrator-only read/write**. Clients access data through cloud functions, not directly.
2. Run `pnpm build:cloud` to prepare local configuration and generate shared validation code.
3. Right-click `cloudfunctions/ledger` in WeChat Developer Tools and upload/deploy with dependencies installed in the cloud. Choose your own environment. Include the generated `local-config.json`, or set the cloud function environment variable `XQ_APP_ID`. A missing AppID causes requests to be rejected rather than bypassing identity validation.
4. Set the function timeout to **20 seconds** and confirm it is active.
5. Compile and sign in. Check the cloud sync page before relying on another device to retrieve records.

For entry pagination, create an ascending compound index on `xq_entries.owner` and `_id` if prompted. Changing the AppID or cloud environment requires updating `.env.local`, rebuilding and redeploying.

### Background scheduler

`cloudfunctions/ledger/config.json` defines a timer named `ledgerRecurring` with the expression `0 */5 * * * * *` (every five minutes).

After deploying the function, right-click **`cloudfunctions/ledger/config.json` → Upload Trigger** in WeChat Developer Tools. Some versions expose the action on the function folder. Verify execution logs in the cloud console; uploading code alone does not confirm that the timer is active. The app displays the most recent background check when available. A manual due-date check is also available for the selected book.

The entry point checks the trusted runtime source `wx_trigger`; client event fields cannot authorize global scheduler execution. Do not expose the function through an anonymous HTTP endpoint.

Each invocation processes up to 20 due rules and advances their next date after a successful transaction. Concurrent execution and manual checks share the same deduplication markers. Monitor runtime, failures and backlog as usage grows. Suggested recurring-query indexes include `type`, `active`, `nextDate`, and, for scoped checks, `scope`.

## Identity, privacy and data safety

- Trusted OPENID/APPID and a valid session are required for ledger operations. Client-supplied account fields cannot replace server-side identity.
- Session credentials are kept in memory and last up to 24 hours. Cold starts and logout require signing in again. Foreground identity checks guard against account changes. Logout clears local in-memory data and revokes the current session without deleting cloud records or other devices' sessions.
- The app processes account identifiers, voluntarily provided profile details, entries, budgets and group membership. Shared book entries and author details are visible to group members. Open-source licensing does not authorize access to users' data.
- Avatar uploads accept PNG/JPEG, are compressed by the client and checked by the server, with a size limit of roughly 200 KB. Storage paths are assigned on the server, and temporary display URLs are returned. Old avatar files are retained for historical records. Automated profile/avatar content moderation is not currently included.
- `xq_books` stores books, profiles, groups and recurring rules. `xq_entries` stores records. `xq_requests` stores sessions, idempotency receipts, invitations and period markers. Do not delete `cycle_` markers: doing so can allow a deleted periodic entry to be recreated.
- This repository contains no maintainer deployment identifiers. Never commit `.env.local`, AppSecret, access tokens, private keys, account exports or personal screenshots. Never put service credentials in frontend environment variables.

## Backups, migration and limits

Legacy local data remains under `xiaoqing.ledger.v1`; schema 1/2 is supported. Export a copy first, then explicitly migrate it to the signed-in personal account from the sync page. Migration does not delete the original local data. Confirm successful sync before changing phones.

Imports run in batches of up to 20 entries. Retrying skips existing IDs and preserves current budgets/settings; a failure may occur after earlier batches have succeeded. Cross-book imports attribute entries to the importing user and remove recurring-rule associations. Pending requests remain isolated by environment, account and book, and can be retried after reconnecting. Concurrent edits require refreshing and reconfirming instead of overwriting another device's changes. Offline entry creation is not supported.

Amounts are stored as integer cents. JSON exports include entries, categories and budgets, but not group membership, invitations, recurring rules or profile configuration. Limits: 50,000 entries and 2,000,000 characters per JSON backup. Backups are not encrypted. Cloud storage is not a substitute for independent backups; clearing local storage may discard unmigrated data and pending requests.

## Project structure

| Path | Purpose |
| --- | --- |
| `src/core/ledger.ts` | Amounts, validation, compatibility, categories, budgets, backup merging and summaries |
| `src/core/cloud-client.ts` | Pagination, pending writes and recovery |
| `src/services/auth.ts` | Sign-in, session validation and protected navigation |
| `src/services/ledger.ts` | Shared ledger state, cloud operations and book switching |
| `src/pages/` | Mini program screens |
| `src/components/BillList.vue` | Entry and author display |
| `cloudfunctions/ledger/` | Trusted identity, transactions, group access and recurring processing |
| `scripts/` | Local configuration, shared-code generation and package checks |
| `tests/` | Data integrity, cloud isolation, authentication and feature tests |
| `docs/images/` | Public README screenshots and GIF |

Database tests use a mock and do not replace real-device/cloud acceptance tests. The initial scaffold comes from [uni-preset-vue/vite-ts](https://github.com/dcloudio/uni-preset-vue/tree/vite-ts). Navigation PNGs are committed; regenerate them with `python scripts/build-icons.py` in a Python environment with Pillow installed.

## License

Original project code is licensed under [MIT](LICENSE). Preserve its copyright and license notice when redistributing the software or substantial portions of it. The software is provided without warranty.

Third-party dependencies retain their own licenses: the direct uni-app packages use Apache-2.0; Vue, vue-i18n and wx-server-sdk use MIT. Preserve their applicable notices and license texts when distributing third-party code. The project continues to use MIT for simplicity; Apache-2.0 dependencies do not by themselves require relicensing the original application code. Neither this license nor public source availability grants access to user data.
