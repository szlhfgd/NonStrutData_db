# Repository Instructions

Fork working copy of [HKUDS/LightRAG](https://github.com/HKUDS/LightRAG). All backend project code lives in `lightrag/` — a **regular folder inside this repo, not a nested git repo**. Operational assets sit at the root: `.env`, `.venv`, `tests/`, `lightrag_webui/`, `requirements*.txt`, `env.example`.

## Commands (Windows; `uv` is NOT installed here)

| What             | How                                                                                                                                         |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Install deps     | `.venv\Scripts\python.exe -m pip install -r requirements.txt -r requirements-test.txt` then `-m pip install -e ./lightrag` (from repo root) |
| Lint             | `cd lightrag && ruff check .` (works only after test deps installed)                                                                        |
| Run subset tests | `cd lightrag && ./scripts/test.sh ../tests/<mirror-of-changed-module>`                                                                      |
| Full test suite  | `cd lightrag && ./scripts/test.sh ../tests` (~7000 tests, >6 min — not in the edit loop)                                                    |
| API server       | `.venv\Scripts\lightrag-server` — **must** run from the repo root                                                                           |
| WebUI dev        | `cd lightrag_webui && bun run dev` (or `npx vite --host`)                                                                                   |
| Start / stop all | `ui.cmd start \| stop \| restart` (backend 9621 + frontend 5173)                                                                            |

> The current `.venv` is Python 3.12 **runtime-only**: `pytest`, `ruff`, `pre-commit` are absent until you install `requirements-test.txt`. `scripts/test.sh` aborts with "Unable to find a Python environment with pytest available" otherwise. README's `uv sync` / `bun` instructions assume tooling that may not exist here.

## Gotchas that will bite you

- **`.env` loads from the process working directory** (`load_dotenv(".env")` in `lightrag/lightrag/api/config.py` and `auth.py`). Start `lightrag-server` from the repo root only — from `lightrag/` it silently loses all config (LLM keys, bindings) and prints *"Startup directory must contain .env file"*.
- Root `.env` uses root-relative paths: `WORKING_DIR=./lightrag/rag_storage`, `INPUT_DIR=./lightrag/inputs`. Build output of the frontend is also root-relative: `lightrag_webui/../lightrag/lightrag/api/webui`.
- **`await rag.initialize_storages()` is mandatory** after instantiating `LightRAG`, or you get `AttributeError: __aenter__` / `KeyError: 'history_messages'`.
- No auth by default (guest mode). The `TOKEN_SECRET not set ... guest-mode JWT` warning at startup is **expected** unless `AUTH_ACCOUNTS` + `TOKEN_SECRET` are configured.
- The backend serves the built WebUI from `lightrag/lightrag/api/webui` (packaged as `api/webui/**`). Rebuild with `bun run build` from `lightrag_webui/`. `bun.lock` is the source of truth; `package-lock.json` is gitignored.

## Layout

```
root                       operational workspace, everything tracked by root git
├── .env / env.example / requirements.txt / requirements-test.txt
├── .venv/                 Python 3.12 env (runtime-only unless you add test deps)
├── tests/                 pytest suite, mirrors lightrag/lightrag/<module>
├── lightrag_webui/        React 19 + Vite + TS frontend (bun.lock pins deps)
├── pre_insert/            pre-insert PDF inspection gate (classifies PDFs before parser; see docs/adr/0001)
└── lightrag/
    ├── lightrag/api/      server entry (lightrag_server.py), config.py, built webui
    ├── lightrag/          python package (storage backends, llm bindings, parsers)
    ├── scripts/           test.sh, regen_native_docx_golden.py
    └── pyproject.toml     extras: api, test, offline-storage, offline-llm, offline, evaluation, observability
```

## Testing locals

- Tests live at the repo **root**; pass `../tests/...` to `scripts/test.sh` (it runs `python -m pytest` from `lightrag/`).
- pytest config in `lightrag/pyproject.toml`: `asyncio_mode = auto`, `testpaths = ["tests"]`.
- Pre-commit (ruff + format) config at `lightrag/.pre-commit-config.yaml`.

## Agent skills

### Issue tracker

Issues live as markdown files under `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Five canonical roles: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: root `CONTEXT.md` + `docs/adr/`. See `docs/agents/domain.md`. Upstream architecture / storage contracts / purge recovery / PR conventions: HKUDS/LightRAG docs + `lightrag/lightrag/` source.