# Repository Instructions

This is a fork working copy. The root contains only a placeholder `main.py`; **all project code lives in `lightrag/`**. Run all commands from `lightrag/` unless noted otherwise.

## Quick Reference

| What             | How                                                                                |
| ---------------- | ---------------------------------------------------------------------------------- |
| Install deps     | `cd lightrag && uv sync --extra test`                                              |
| Lint             | `cd lightrag && ruff check .`                                                      |
| Run subset tests | `cd lightrag && ./scripts/test.sh tests/<dir>` (mirrors changed module)            |
| Full test suite  | `cd lightrag && ./scripts/test.sh tests` (~7000 tests, >6 min)                     |
| API server       | `cd lightrag && lightrag-server` (needs `.env` — copy from `lightrag/env.example`) |
| WebUI dev        | `cd lightrag/lightrag_webui && bun install --frozen-lockfile && bun run dev`       |

## Critical Pattern

After instantiating `LightRAG`, you **must** call `await rag.initialize_storages()` before any insert/query. Forgetting this produces `AttributeError: __aenter__` or `KeyError: 'history_messages'`.

## Testing Convention

Run **only the test directories mirroring the modules you changed**. Do not run the full suite in the edit loop — that's CI's job. Report which subset you ran and its pass count.

Example: change in `lightrag/kg/redis_impl.py` → run `./scripts/test.sh tests/kg/redis_impl`.

## Detailed Guidance

For architecture, module layout, storage contracts, purge recovery, pipeline concurrency, code style, and PR conventions, read **[`lightrag/AGENTS.md`](lightrag/AGENTS.md)** — it is the authoritative reference.

## Agent skills

### Issue tracker

Issues live as markdown files under `.scratch/<feature>/` (local markdown tracker). See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout: root `CONTEXT.md` + `docs/adr/`. See `docs/agents/domain.md`.
