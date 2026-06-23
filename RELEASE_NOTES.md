Release v1.0.1
=================

Summary
-------
- Performance: Optimized leaderboard streak computation (single SQL aggregation) to reduce DB load and latency.
- Streaks: Removed 7-day artificial cap; streaks now compute correctly (safety bound 365 days) and display starting at 3 consecutive days.
- UI: Improved leader streak tag with prominent fire emoji (🔥) and polished styling.
- Scoring fixes: Applied octopus goalkeeper points fix (e.g., Courtois / nawaf case) and updated related scripts.
- QA: Deleted test/QA accounts tied to Portugal matches and revalidated leaderboard.

Validation
----------
- Project build: `npm run build` — succeeded.
- QA smoke tests: `npm run qa:smoke` — 8/8 passed.

Notes
-----
The repository contains a GitHub Actions workflow (`.github/workflows/release.yml`) that will build, run smoke tests, and create a GitHub Release when a tag matching `v*` is pushed.
