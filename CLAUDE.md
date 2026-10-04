# SalesOS — working rules

- Plan: `docs/SALESOS_PLAN.md`. App: Next.js (App Router) + TypeScript + Tailwind v4 at repo root.
- **Phase 0 prototype** runs on deterministic fake data in `lib/mock.ts` and in-memory state in `lib/store.tsx`. Business rules (status machine, permissions, metrics) live in `lib/*.ts`, never in components. Mock data is deleted in Phase 3.
- Design rules (plan §J): 6–10px radius, hairline borders, no gradients/glass/glow, purple only for active/primary/focus/charts, no per-datum cards. Custom CSS lives in `@layer components` in `app/globals.css` so Tailwind utilities can override it.
- **Progress tracker:** `public/progress/progress.json` is rendered at `/progress` by `public/progress/index.html`.
  After every meaningful unit of work, update it in the same commit: task `s` values (`todo|in_progress|done|blocked`), `currentFocus`, `updated` (ISO UTC), a `log` entry, and readiness `done` flags when the user supplies an item. Phase status is derived from tasks.
- Before pushing: `npx tsc --noEmit && npx next build`.
