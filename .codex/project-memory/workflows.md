# Development and release workflows

Updated: 2026-11-02. The current checkout runs on Windows with PowerShell. Earlier Ubuntu results are retained below as historical evidence. Discover the active Node.js, pnpm and Git tools for each session; do not assume private absolute runtime paths or persist machine-specific paths in this memory.

## Current setup and build selection

From the repository root:

```powershell
pnpm install --frozen-lockfile
if (!(Test-Path -LiteralPath .env.local)) { Copy-Item .env.example .env.local }
pnpm setup:local
pnpm build:mp-weixin
```

Fill `XQ_APP_ID` and `XQ_CLOUD_ENV` in the ignored local file when account sign-in is required. Never include actual values in public prose or commits. Process environment values take precedence; an existing AppID is preserved if no replacement is supplied, but an explicitly empty AppID selects guest mode. The cloud environment must be configured separately.

`build:mp-weixin` selects `dist/build/mp-weixin/`; `dev:mp-weixin` selects `dist/dev/mp-weixin/`. Wait for a completed build before opening the repository root in the developer tools. Keep the development compiler running for live changes. Setup and type checks preserve the selected directory. `setup:local` alone does not generate `app.json`, and an empty hand-written `app.json` is not a repair.

Ordinary guest-preview builds are allowed without cloud settings. Upload preparation requires the two deployment identifiers, including prepare-only:

```powershell
node scripts/prepare-local-config.cjs --mp-mode build --require-cloud
pnpm upload:mp-weixin --prepare-only
```

The first command checks/generates local configuration; the second rebuilds and creates an isolated upload project without uploading it. They are not proof of a remote release, mini program upload or review submission. Actual upload requires a configured, signed-in developer-tools CLI and authorization for that action.

## Missing-environment sign-in recovery

1. Confirm the intended local `XQ_APP_ID`/`XQ_CLOUD_ENV` and any overriding process values; the selected environment must contain the deployed `ledger` function.
2. Rebuild, or restart the development compiler and wait for compilation. Reopen the repository project and check its selected output directory.
3. If the old missing-environment error persists, clear only the developer tools' compilation cache, then compile and retry sign-in. Do not clear application storage or all user data.
4. If a current error remains, inspect it and the corresponding cloud-function logs. H5 cannot validate account login because it supports guest browsing only.

**Observed, 2026-11-02:** simulator login displayed a personal account, synchronized status and a recent sync timestamp after rebuild/cache recovery. The ledger was empty. This observation does not establish physical-device or multi-account acceptance.

## Validation before committing

Applicable commands include:

```powershell
pnpm test
pnpm type-check
pnpm build:mp-weixin
pnpm build:h5
```

Record command outcomes in `status.md` only after they finish. On 2026-11-02, the current v1.0.4 full test run, type check and production mini program build passed. This does not claim a new H5 build in this round. Package checks require a main package below 1500000 bytes, `requiredComponents`, and image/audio assets no larger than 200000 bytes. The current output check confirmed the selected root, all 14 pages, version 1.0.4/code 10004 and a populated cloud environment without logging identifiers; exact package sizes are in `status.md`.

`pnpm test` first regenerates the shared core, then runs 11 test entry points:

| Entry points | Coverage and limit |
| --- | --- |
| version, upload-mp-weixin | Version generation, mode/credential handling, upload preflight/build/receipts; upload is mocked |
| ledger, insights | Data compatibility, amounts, failed storage, filtering, budgets and statistics |
| ui-features | Simulated page setup and interactions, not physical-device rendering |
| cloud | Mock database isolation, transactions, concurrent writes, pagination and recovery |
| auth, auth-persistence | Guest isolation, sign-in, storage, restoration, account changes and network failures |
| features | Groups, profiles, categories and recurring semantics |
| desktop-auth, desktop-gateway | Pairing, expiry/replay, gateway restrictions and flat generated-file consistency |

Simulated upload success and injected database errors are not remote deployment events or production incidents. Review generated tracked `cloudfunctions/ledger/core.cjs` for unintended changes. Keep configuration, `dist`, release artifacts and scratch files out of the commit. Documentation-only work needs factual/link review rather than tests that merely repeat prose.

## Git, publication and project memory

Inspect `git status --short`, `git diff --check`, intended changes and sensitive content; stage only authorized files. Commit and push to the actual branch on `origin`. On remote changes, inspect and integrate them; do not reset user work or force-push. Preserve a local commit if pushing fails.

The user authorized v1.0.4 repository publication on 2026-11-02. Preparation retains the prior pre-release status and provides source archives. Use English commit messages, release title/body and updated documentation. Publication is pending at the time this record is prepared; confirm the final result from remote tag/release evidence. No new v1.0.4 desktop installer, cloud deployment or mini program review submission is implied. Keep memory factual, public, dated and repository-local; never read or update global user memory.

## Historical Ubuntu checks: 2026-10-28

The previous session used Ubuntu 22.04.5 LTS x86_64 with temporary Node.js 22.16.0 (official archive checksum verified) and pnpm 10.20.0. It did not permanently configure the toolchain or change dependency versions. The following commands passed in that session:

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm type-check
CI=1 pnpm build:mp-weixin
CI=1 pnpm build:h5
pnpm build:desktop-ui
pnpm build:desktop-gateway
```

The installation used a temporary store and 952 packages with an unchanged lockfile. `CI=1` skipped the dependency's update check to avoid restricted `os.networkInterfaces()` access; source/dependencies were not patched. pnpm reported ignored dependency scripts, but actual frontend builds succeeded, so no blanket script approval or dependency upgrade was introduced.

Historical configuration was empty and could not verify login. The example gateway mode was `release`; old desktop release notes described `trial`, which did not prove the server's actual environment setting. A safe Linux configuration copy can use `cp -n .env.example .env.local`; do not copy Windows drive paths into Linux instructions.

## Desktop and platform limits

- Desktop development requires Node.js 22.12 or later. Configure `XQ_DESKTOP_API_URL` locally and `XQ_WECHAT_APP_SECRET` only server-side. `build:desktop-gateway` keeps shared files flat in the gateway root.
- Choose `XQ_MINI_ENV` for the deployed mini program code version. Trial/development code must include the desktop confirmation page, and trial users need access. Server environment values override generated settings.
- Historically, the Ubuntu session had `ELECTRON_RUN_AS_NODE` set. Its version output was not evidence of Electron GUI launch. Removing it still failed in the restricted, headless session; application security settings were not disabled to bypass that failure.
- Windows NSIS packaging was not attempted in that Ubuntu session because its packaging toolchain was unavailable. The current v1.0.4 task does not claim a new installer build or installation test.
- Physical-device sign-in, complete desktop pairing, synchronization, group access, interruption handling and installer compatibility require separate acceptance evidence. Mock tests and a simulator login do not replace them.
