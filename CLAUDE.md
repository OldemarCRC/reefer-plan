# CLAUDE.md — reefer-plan

## Git workflow
- After every completed task, suggest a commit message in the format `type(scope): description vX.XX.XX` (version from `docs/PROJECT_STATUS.md`).
- Do NOT run `git add`, `git commit`, or `git push` — the user commits manually.

## End-of-session docs
When the user signals end of session, update:
1. `docs/PROJECT_STATUS.md` — version bump + session summary
2. `docs/PROJECT_INVESTMENT.md` — session log row
3. `docs/MANUAL_DRAFT_AGENCY.md` / `docs/MANUAL_DRAFT_SHIPPER.md` — only if user-facing features changed

Full rules in `docs/PROJECT_STATUS.md`.
