# Xiaoqing Ledger project memory

This directory belongs only to this repository and travels with Git. Do not read, import or modify the user's global memory.

Read in this order: `status.md` → `decisions.md` → `architecture.md` → `workflows.md`. Check source and tests for module-specific work; memory does not replace implementation evidence.

## Maintenance rules

- Update the relevant entries after important changes. Replace stale conclusions instead of appending contradictory states.
- Date important conclusions and cite their evidence. Distinguish **Implemented**, **Tests passed**, **User confirmed**, **Observed** and **Unverified**. Historical documentation does not establish current validation.
- Keep only public project facts and conventions. Never store real deployment identifiers, secrets, session credentials, ledger records, personal profiles or private absolute paths. Record configuration variable names and repository-relative paths only.
- Check Git status and protect existing work before editing. Run applicable checks, review the diff and sensitive information, then commit and push to `origin`. Retain the local commit and report network or authentication failures; never force-push.
- Record conflicts between background information, older documents and implementation in `status.md` before changing behavior. Releases, deployments and history rewriting need authorization for the specific task; existing authorization in the conversation remains valid.
- Write all new or updated repository-facing prose in English, including this memory, documentation, commit messages and release notes. Application interface copy retains its established language unless a translation is explicitly requested.

Established on 2026-10-28 at source baseline `4c8a3d2`. This remains the repository's sole project-memory entry point. On 2026-11-02, the tracked memory files and Git metadata omitted from the transferred Windows workspace were restored from `origin/main` at `b3ee15c70eb3c8d7e53d9cc4a5b2c4763fd7fd03`; see `status.md` for the current work and its validation limits.
