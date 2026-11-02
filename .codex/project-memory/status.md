# Current status and migration record

Updated: 2026-11-02. The active environment is Windows with PowerShell. Git metadata and the five tracked project-memory files were missing from the transferred workspace; they were restored from `origin/main` at `b3ee15c70eb3c8d7e53d9cc4a5b2c4763fd7fd03`. Use the current Git working tree rather than a historical machine-specific checkout path.

## Current v1.0.4 work

| Status and date | Fact and evidence |
| --- | --- |
| User confirmed, 2026-11-02 | Future Git/GitHub and repository-facing content must be in English. The user authorized committing, pushing and publishing the v1.0.4 repository release, including updated documentation for the sign-in fix. This authorization is separate from mini program review, cloud deployment and desktop installer publication. |
| Implemented, 2026-11-02 | `package.json.version` is 1.0.4. The app's version display and generated manifest continue to use that single source. Evidence: `package.json`, `src/config/version.ts`, `scripts/prepare-local-config.cjs`. |
| Implemented, 2026-11-02 | Development and production scripts pass `--mp-mode dev` or `--mp-mode build`; generated `miniprogramRoot` points to the corresponding `dist` output. Ordinary setup preserves an existing known development/production target. Evidence: package scripts and configuration generator. |
| Implemented, 2026-11-02 | Missing environment replacements no longer erase an AppID already entered in the local project. Explicit empty AppID values still select guest mode. Configuration arguments, identifiers and JSON inputs are checked before generated files are written. Evidence: `scripts/prepare-local-config.cjs`, `tests/version.test.cjs`. |
| Implemented, 2026-11-02 | Upload preparation, including `--prepare-only`, invokes `--mp-mode build --require-cloud` and fails before building or creating an upload project when AppID or cloud environment is missing. Ordinary guest-preview builds remain available. Evidence: configuration/upload scripts and their regression tests. |
| Observed, 2026-11-02 | After rebuilding and clearing only the developer tools' compilation cache, simulator sign-in displayed the personal account, synchronized cloud status and a recent synchronization timestamp. The tested ledger had zero entries. This was a simulator observation, not a physical-device or multi-account test. |
| Implemented, 2026-11-02 | Both READMEs and the new v1.0.4 notes are in English. Troubleshooting distinguishes compilation-cache cleanup from deletion of application storage and user data. `AGENTS.md` uses a portable root and preserves project-memory, data-safety and commit/push rules. |
| Tests passed, 2026-11-02 | Documentation checks found matching README copies, English text in the modified public documents and existing repository-relative link targets. Evidence: the documentation check output in this task. |
| Tests passed, 2026-11-02 | All 11 `pnpm test` entry points and `pnpm type-check` passed for the current change. Cloud and upload services are mocked. Evidence: completed command output and exit status in this task. |
| Tests passed, 2026-11-02 | Production mini program build and quality gates passed: main package 300966 bytes, `requiredComponents`, nine media assets with a largest size of 51787 bytes. Generated output matches application 1.0.4, manifest code 10004, root `dist/build/mp-weixin/` and 14 pages; a nonempty cloud environment was included without logging identifiers. Evidence: completed build and output checks. |
| Pending at commit time, 2026-11-02 | Commit, push and publication of the v1.0.4 preview source release are authorized but not yet recorded as complete in this memory. Verify publication through the remote tag/release rather than interpreting this pre-publication record as a completion claim. No new desktop installer, mini program review submission or cloud deployment is included. |

The sign-in recovery concerns local deployment configuration and stale compiled code; it does not establish a backend authentication defect or backend fix. No data-format or existing-ledger migration is introduced.

## Historical checks: Ubuntu, 2026-10-28

These results were recorded at source baseline `4c8a3d2` on Ubuntu 22.04.5 LTS x86_64. They are historical evidence and do not validate the current Windows checkout or v1.0.4 revision.

| Historical status | Check and result |
| --- | --- |
| Tests passed | Temporary Node.js 22.16.0 and pnpm 10.20.0; frozen-lockfile installation using a temporary store succeeded with 952 packages and no dependency-version changes. |
| Tests passed | All 11 `pnpm test` entry points and `pnpm type-check` passed. Database, page and upload services were mocked. |
| Tests passed | `CI=1 pnpm build:mp-weixin`: main package 300529 bytes, `requiredComponents`, nine media assets with a largest size of 51787 bytes. This build used empty deployment settings and did not verify sign-in. |
| Tests passed | H5, desktop UI and desktop gateway builds passed. Generated shared core had no unexpected diff; flat gateway copies were consistent. Ten tracked JSON files parsed and generated/local files were confirmed ignored. |
| Unverified | Electron GUI could not launch in the restricted headless session. Node-mode version output was not treated as an Electron launch. Windows installer packaging was not attempted; the required packaging tools were not found. |

Existing circular-dependency and Vite CJS warnings did not prevent those historical builds. `CI=1` bypassed the dependency's update check after restricted network-interface enumeration failed; dependency source was not modified.

## Historical background discrepancies

- **Implemented / discrepancy, recorded 2026-10-28:** baseline `4c8a3d2` already supported guest browsing and in-memory sample-ledger edits, unlike earlier background stating that every business feature required login. Formal cloud-ledger access still required authentication. This release preserves that boundary.
- **Implemented / discrepancy, recorded 2026-10-28:** older files under `outputs/` contain superseded claims about cold-start sign-in, H5, desktop availability and category deletion. Verify current source before relying on those instructions; this task does not treat old statements as current behavior.
- **Historical documentation only:** v1.0.3 notes describe a Windows preview installer and prior build results. They do not prove current remote release assets, online mini program version, physical-device behavior or installer compatibility.
- **User confirmed historically:** the earlier handover reported successful desktop code scanning. That statement did not establish Ubuntu GUI support, complete synchronization or current v1.0.4 desktop acceptance.

## Remaining verification boundaries

- Actual deployment values stay in ignored local configuration and must never appear in public memory. The observed simulator login does not verify all collection permissions, indexes, timeout settings, gateway limits or scheduler logs.
- A timer definition in `cloudfunctions/ledger/config.json` does not prove that a trigger has been deployed and is running.
- Physical-device sign-in, two-account/two-device synchronization, group interactions, interruption recovery, desktop cancellation/expiry/replay and Windows installation/uninstallation remain separate acceptance work.
- Discover the active toolchain for each environment. Desktop development requires Node.js 22.12 or later; the general mini program Node.js 20+ guidance does not override that requirement.
