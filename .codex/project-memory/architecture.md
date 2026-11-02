# Architecture and data flow

Reviewed: 2026-11-02. Statements below describe **Implemented** code and cite source files; they do not establish deployment, physical-device acceptance or successful current automated checks. Core architecture was first documented on 2026-10-28; v1.0.4 changes concern local configuration and release preparation.

## Clients and entry points

- Mini program: Vue 3, TypeScript and uni-app. `src/main.ts` and `src/App.vue` handle startup and foreground authentication restoration. `src/pages.json` declares screens and four bottom navigation entries. `src/pages/` covers entries, records, budgets, statistics, groups, profile, recurring rules, backup and desktop confirmation.
- `src/core/ledger.ts` implements integer-cent amounts, schema 1/2 compatibility, validation, categories, budgets, backup merging and statistics. `src/core/insights.ts` supplies shared filtering, sorting, budget-copy drafts and corresponding-period comparisons.
- `src/services/ledger.ts` maintains current account/book state, operations and switching. `src/core/cloud-client.ts` handles revision pagination, idempotent requests, pending writes and recovery. Pending storage is isolated by environment/account/book and is not simply deleted on sign-out.
- `src/services/guest-ledger.ts` builds an in-memory sample ledger without reading legacy data or importing trial entries during sign-in. H5 offers guest browsing; conditional compilation disables cloud account sign-in there.
- Desktop: `desktop/ui/main.js` loads `App.vue` and reuses the shared core. `desktop/main.cjs` creates the Electron window and HTTPS transport; `preload.cjs` exposes restricted IPC. Context isolation and sandboxing are enabled, Node integration is disabled, and new-window/navigation requests are restricted. Session tokens remain in interface memory; pending writes use localStorage.

## Authentication and account ledgers

1. Voluntary mini program sign-in calls `ledger` through `src/services/cloud-transport.ts`. The handler verifies trusted runtime APPID/OPENID and derives account ownership rather than trusting a client-supplied owner.
2. The server creates sessions lasting up to 24 hours, storing credential hashes. Account and session checks protect business operations. `src/services/auth.ts` keeps a dedicated local record containing credential, account and expiry. Startup/foreground checks renew only the same account; temporary network failure hides account data while retaining the record. Identity changes clear the previous account state.
3. Desktop pairing generates a random credential and submits only its hash to request a code. The code contains a public scene. A signed-in mini program user compares the six-digit value and confirms. `desktop-auth.js` creates the account's desktop session transactionally. Pairing lasts two minutes and sessions 24 hours; cancellation, expiry and repeated confirmation are checked.
4. `cloudfunctions/desktop-gateway/index.js` accepts a limited set of POST operations, validates the desktop session and invokes the shared handler for the same account and group books. It is a separate HTTP entry point; the original `ledger` function must not be exposed anonymously over HTTP.

Evidence: `src/services/auth.ts`, `src/services/cloud-transport.ts`, `desktop/main.cjs`, `desktop/preload.cjs`, `desktop/ui/App.vue`, and the ledger/gateway entry points, handler and desktop-auth modules.

## Cloud and data safety

- `xq_books` contains books, profiles, groups and recurring rules; `xq_entries` stores entries; `xq_requests` contains sessions, idempotency receipts, invitations, pairing and `cycle_` markers. Administrator-only collection permissions are a deployment requirement, not a conclusion from local source inspection.
- Group membership is rechecked when reading and within transactions. Creators manage budgets, categories and imports; members edit/delete their own ordinary entries. A manual entry associated with an automatic periodic record has its documented update exception; preserve that behavior.
- Request fingerprints/receipts prevent duplicate writes. Book revisions and entry versions protect concurrent edits; transactions update entries, counters and settings together. Uncertain results preserve pending requests and conflicts require a refresh and confirmation.
- Features use Beijing time for cycle calculations. `cycleId(scope, ruleId, period)` identifies each associated occurrence; each scheduler invocation handles at most 20 due rules. Global scheduled work requires trusted `SOURCE=wx_trigger` and the expected timer name.

Evidence: `cloudfunctions/ledger/handler.js`, `features.js`, `index.js`, `src/core/cloud-client.ts`, and cloud/features/desktop-auth tests.

## Configuration and generation chain

- Root `package.json.version` is the sole application version source, currently 1.0.4. `src/config/version.ts` exposes it to the interface. `scripts/prepare-local-config.cjs` generates manifest version name/code. Cloud package versions are independent package metadata.
- The configuration script accepts `--mp-mode dev|build` and `--require-cloud`. Development/production package scripts pass their respective mode. With no mode, a known existing `dist/dev/mp-weixin/` or `dist/build/mp-weixin/` target is preserved; otherwise the template supplies the default.
- AppID precedence is process `XQ_APP_ID`, `.env.local` `XQ_APP_ID`, then an existing local project AppID. Explicit empty replacements select guest mode; `touristappid` is treated as no account AppID. `XQ_CLOUD_ENV` comes from the local process environment or `.env.local`; an AppID alone does not supply the cloud environment.
- Templates are `src/manifest.template.json` and `project.config.template.json`. Generated `src/manifest.json`, `project.config.json`, `src/config/cloud.local.ts` and `cloudfunctions/ledger/local-config.json` remain ignored. Inputs are parsed/validated before writes, and unchanged generated content is not rewritten. Ordinary preview builds allow missing deployment values.
- Upload preparation invokes `--mp-mode build --require-cloud`, including `--prepare-only`. A missing AppID or cloud environment fails before generation/build/upload-project creation. Every upload rebuilds production output, checks package quality and copies files to a fresh ignored `work/wechat-release/` project with `miniprogramRoot=miniprogram/`. Successful upload requires CLI confirmation and a fresh receipt; prepare-only does not upload.
- `scripts/build-cloud.cjs` transpiles `src/core/ledger.ts` into the tracked generated `cloudfunctions/ledger/core.cjs`. Do not edit that copy directly. `build:cloud` prepares configuration first; `test` regenerates the shared core first.
- `scripts/build-desktop-gateway.cjs` generates configuration/core and copies handler, features, core, desktop-auth and local-config files flat into the gateway root. Those copies are ignored; do not restore a nested ledger folder. Code-version precedence is server environment, generated configuration, then `release`.
- `scripts/prepare-desktop.cjs` generates `desktop/config.local.json` from `XQ_DESKTOP_API_URL`, allowing only HTTPS URLs without embedded credentials. `XQ_WECHAT_APP_SECRET` belongs only in the gateway's server-side environment.
- `dist/`, `release/`, `work/`, `node_modules/` and local deployment configuration are ignored. `outputs/` is tracked and must not serve as a default private scratch directory.

Evidence: package scripts, `.env.example`, `.gitignore`, configuration/build/upload scripts and regression tests. See `status.md` for actual check outcomes and `workflows.md` for platform-specific operation.
