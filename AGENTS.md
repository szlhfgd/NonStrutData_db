# Repository Instructions

This is a fork working copy. The root holds the launcher, docs, and shared assets (`ui.cmd`, `AGENTS.md`, `CONTEXT.md`, `docs/`, `.scratch/`, `.env`, `tests/`, `lightrag_webui/`); **all backend project code lives in `lightrag/`** (a regular folder, not a separate git repo). Run backend dev/test commands from `lightrag/`; start the API server from the **repo root** (it loads `.env` from the startup directory) and run the WebUI from `lightrag_webui/`.

## Quick Reference

| What             | How                                                                        |
| ---------------- | -------------------------------------------------------------------------- |
| Install deps     | `cd lightrag && uv sync --extra test`                                      |
| Lint             | `cd lightrag && ruff check .`                                              |
| Run subset tests | `cd lightrag && ./scripts/test.sh ../tests/<dir>` (mirrors changed module) |
| Full test suite  | `cd lightrag && ./scripts/test.sh ../tests` (~7000 tests, >6 min)          |
| API server       | `.venv\Scripts\lightrag-server` (run from repo root; loads root `.env`)    |
| WebUI dev        | `cd lightrag_webui && bun install --frozen-lockfile && bun run dev`        |

## Critical Pattern

After instantiating `LightRAG`, you **must** call `await rag.initialize_storages()` before any insert/query. Forgetting this produces `AttributeError: __aenter__` or `KeyError: 'history_messages'`.

## Testing Convention

Run **only the test directories mirroring the modules you changed**. Do not run the full suite in the edit loop — that's CI's job. Report which subset you ran and its pass count.

Example: change in `lightrag/kg/redis_impl.py` → run `./scripts/test.sh ../tests/kg/redis_impl`.

## Detailed Guidance

For backend architecture, module layout, storage contracts, purge recovery, pipeline concurrency, and PR conventions, see the upstream [HKUDS/LightRAG](https://github.com/HKUDS/LightRAG) docs and the source in `lightrag/lightrag/`; the domain glossary lives in root `CONTEXT.md`.

## Agent skills

### Issue tracker

Issues live as markdown files under `.scratch/<feature>/` (local markdown tracker). See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout: root `CONTEXT.md` + `docs/adr/`. See `docs/agents/domain.md`.
Content

```
NonStrutData_db/            # 仓库根（fork 工作副本，代码本体在 lightrag/）
├── ui.cmd                  # 一键启动/关闭 WebUI + 后端（Windows）
├── AGENTS.md / CONTEXT.md  # 仓库说明与领域术语
├── docs/                   # 本地 agent 工作流文档
├── .scratch/               # 本地 markdown issue 追踪器
├── .env                    # 环境变量配置（LLM / Embedding 等）
├── env.example             # 后端配置模板（复制为 .env 使用）
├── tests/                  # pytest 测试
├── lightrag_webui/         # 前端 UI 层（React + TypeScript）
└── lightrag/               # ★ 项目本体
    ├── lightrag/           #   Python 核心包（业务编排：LightRAG、存储、LLM、解析器）
    └── ...                 #   scripts / examples / pyproject.toml 等
```
