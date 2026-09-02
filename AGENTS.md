# Repository Instructions

This is a fork working copy. The root holds only launcher/docs (`ui.cmd`, `AGENTS.md`, `CONTEXT.md`, `docs/`, `.scratch/`); **all project code lives in `lightrag/`** (a nested git repo). Run all commands from `lightrag/` unless noted otherwise.

## Quick Reference

| What             | How                                                                                |
| ---------------- | ---------------------------------------------------------------------------------- |
| Install deps     | `cd lightrag &&  sync --extra test`                                                |
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
Content

```
NonStrutData_db/            # 仓库根（fork 工作副本，非代码本体）
├── ui.cmd                  # 一键启动/关闭 WebUI + 后端（Windows）
├── AGENTS.md / CONTEXT.md  # 仓库说明与领域术语
├── docs/                   # 本地 agent 工作流文档
├── .scratch/               # 本地 markdown issue 追踪器
├── .env/                   # 存放 API_KEY（未提交）
└── lightrag/               # ★ 项目本体（嵌套 git 仓库，见上）
    ├── lightrag/           #   Python 核心包（业务编排：LightRAG、存储、LLM、解析器）
    ├── lightrag_webui/     #   前端 UI 层（React + TypeScript）
    ├── tests/              #   pytest 测试
    └── ...                 #   scripts / docs / examples / env.example 等
```
