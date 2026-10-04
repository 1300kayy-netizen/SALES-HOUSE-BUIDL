# SalesOS — working rules

- Plan: `docs/SALESOS_PLAN.md`.
- **Progress tracker:** `progress/progress.json` is rendered by `progress/index.html` (deployed on Vercel, Root Directory = `progress`).
  After every meaningful unit of work, update it in the same commit: task `s` values (`todo|in_progress|done|blocked`), `currentFocus`, `updated` (ISO UTC), a `log` entry, and readiness `done` flags when the user supplies an item. Phase status is derived from tasks.
