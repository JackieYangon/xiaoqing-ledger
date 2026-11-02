# Repository collaboration rules

- The repository root is the directory containing this `AGENTS.md` and `package.json`. Use paths relative to that directory; do not assume a machine-specific checkout location.
- After each authorized code change is complete and relevant validation passes, create a Git commit describing the concrete change and push it to the `origin` remote without asking again. If pushing fails, keep the local commit and report the reason. Never force-push over remote history.
- Write all new or updated repository-facing prose in English. This includes documentation, Git commit messages, pull request titles and descriptions, issues and comments, release titles and notes, and developer-facing script messages and comments. Keep application interface text in its established language unless the user explicitly requests a translation.
- Frontend source belongs in `src`; cloud source belongs in `cloudfunctions`. `dist` contains generated output: do not edit it directly or commit it. Keep local deployment configuration, credentials and generated release output out of Git.
- Data-format changes must remain compatible with existing ledger records. A storage or validation failure must not overwrite original user data. Troubleshooting compilation must preserve application storage, legacy records and pending requests; clear only the compilation cache when that is the relevant remedy.
- Use Xiaoqing Ledger's own terminology in branding, interface text, documentation and commit descriptions. Do not introduce third-party product names, links or comparisons as product branding or positioning.

## Repository-local project memory

- Before relevant work, read `.codex/project-memory/README.md`, then follow its index to check the current status, decisions, architecture and workflows. Verify implementation details against source and tests; historical documentation is not evidence of current validation.
- Update the relevant memory entries when important facts change, instead of appending contradictory states. Date important conclusions, cite their evidence and distinguish implemented code, passed tests, user confirmation and unverified claims.
- Store only public project facts and conventions in this repository's memory. Do not read, import or modify the user's global memory. Do not record actual deployment identifiers, secrets, session credentials, user data or private absolute paths; use variable names and repository-relative paths.
- Check Git status before editing and preserve existing work. After code or documentation changes, run applicable checks and review the diff for correctness and sensitive information before committing and pushing to `origin`. Retain local commits if pushing fails, report the reason and never force-push.
- Record conflicts between background information, older documentation and the implementation in the project status before changing product behavior. Ordinary commits and pushes do not authorize a release, deployment or history rewrite; those actions require authorization for the specific task. Apply authorization already given in the conversation without asking again.
