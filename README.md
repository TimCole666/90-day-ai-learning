# 90-Day AI Learning Platform

A self-contained, four-language curriculum platform for learning large
language model engineering: a 90-day structured course with exercises,
projects, source provenance, and agent-tool tracks — in English,
Simplified Chinese, Traditional Chinese, and Japanese.

Live instance: https://90d-ai-course.dengshen.cc

## What's inside

- `server.cjs` — dependency-free Node.js server (OAuth sign-in, private
  progress, portable export, per-account deletion)
- `curriculum/` — 90 days of lesson content in four locales, source
  registry, rights evidence, and review documents
- `projects/` — hands-on course projects
- `scripts/`, `lib/`, `tests/` — build, verification, and test tooling;
  `npm run verify:local` runs the full local acceptance suite
- `docs/` — architecture decisions (`docs/adr/`), agent conventions,
  and operations runbooks

## Requirements

Node.js >= 22.13. No runtime dependencies.

```bash
CONFIG_PATH=config.production.json node server.cjs
```

The app serves on `config.production.json`'s `host`/`port` and stores
data in `dataDir` (SQLite). Sign-in uses OAuth PKCE (Google + GitHub);
credentials go in environment variables — see `docs/operations/`.

## License

- Code: see `LICENSE`
- Curriculum content: Creative Commons BY-SA 4.0
  (`LICENSE-CC-BY-SA-4.0`); third-party source attributions in `NOTICE`
  and `curriculum/sources/`
