# Repository Instructions

Fork working copy of [HKUDS/LightRAG](https://github.com/HKUDS/LightRAG). All backend project code lives in `lightrag/` — a **regular folder inside this repo, not a nested git repo**. Operational assets sit at the root: `.env`, `.venv`, `tests/`, `lightrag_webui/`, `requirements*.txt`, `env.example`.

## Commands (Windows; `uv` is NOT installed here)

| What              | How                                                                                                                                         |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Install deps      | `.venv\Scripts\python.exe -m pip install -r requirements.txt -r requirements-test.txt` then `-m pip install --no-build-isolation --no-deps -e ./lightrag` (from repo root; `--no-build-isolation --no-deps` required offline — pip's isolated build can't reach PyPI for setuptools) |
| Lint              | `cd lightrag && ruff check .` (works only after test deps installed)                                                                        |
| Run subset tests  | `cd lightrag && ./scripts/test.sh ../tests/<mirror-of-changed-module>`                                                                      |
| Full test suite   | `cd lightrag && ./scripts/test.sh ../tests` (~7000 tests, >6 min — not in the edit loop)                                                    |
| Integration tests | `cd lightrag && ./scripts/test.sh ../tests -m "integration or requires_db or requires_api" --run-integration` (off by default)              |
| API server        | `.venv\Scripts\lightrag-server` — **must** run from the repo root                                                                           |
| WebUI dev         | `cd lightrag_webui && bun run dev` (or `npx vite --host`)                                                                                   |
| WebUI build       | `cd lightrag_webui && bun run build` (or `npx vite build` if `bun` is absent — output lands in `../lightrag/lightrag/api/webui`)            |
| Start / stop all  | `ui.cmd start \| stop \| restart` (backend 9621 + frontend 5173)                                                                            |

> The current `.venv` is Python 3.12 **runtime-only**: `pytest`, `ruff`, `pre-commit` are absent until you install `requirements-test.txt`. `scripts/test.sh` aborts with "Unable to find a Python environment with pytest available" otherwise. README's `uv sync` / `bun` instructions assume tooling that may not exist here.

## Gotchas that will bite you

- **`.env` loads from the process working directory** (`load_dotenv(".env")` in `lightrag/lightrag/api/config.py` and `auth.py`). Start `lightrag-server` from the repo root only — from `lightrag/` it silently loses all config (LLM keys, bindings) and prints *"Startup directory must contain .env file"*.
- Root `.env` uses root-relative paths: `WORKING_DIR=./lightrag/rag_storage`, `INPUT_DIR=./lightrag/inputs`. Build output of the frontend is also root-relative: `lightrag_webui/../lightrag/lightrag/api/webui`.
- **`await rag.initialize_storages()` is mandatory** after instantiating `LightRAG`, or you get `AttributeError: __aenter__` / `KeyError: 'history_messages'`.
- No auth by default (guest mode). The `TOKEN_SECRET not set ... guest-mode JWT` warning at startup is **expected** unless `AUTH_ACCOUNTS` + `TOKEN_SECRET` are configured.
- The backend serves the built WebUI from `lightrag/lightrag/api/webui` (packaged as `api/webui/**`). Rebuild with `bun run build` from `lightrag_webui/`. `bun.lock` is the source of truth; `package-lock.json` is gitignored.
- **Parser routing diverges by launch path.** `.env` sets `LIGHTRAG_PARSER=pdf:mineru,pptx:mineru,docx:native,*:legacy-R`, but `ui.cmd start` **overrides** it inline with `*:native-teP,*:legacy-R` and also sets `PYTHONIOENCODING=utf-8`. Running `lightrag-server` directly honors the `.env` routing; running via `ui.cmd` does not. If parser behavior mismatches your expectation, check which path you used.
- **`lightrag-server` restart does NOT kill the old process.** A prior instance keeps holding port 9621; the new one exits with `[Errno 10048] bind on address ('0.0.0.0', 9621): only one usage of each socket address permitted`. Before restarting, run `Get-Process -Name "lightrag-server" | Stop-Process -Force` (PowerShell) to free the port. `ui.cmd stop` kills by listening-port lookup, so it works, but a manual re-launch does not.
- **tiktoken downloads BPE vocab on first start.** `LightRAG.__post_init__` constructs `TiktokenTokenizer("gpt-4o-mini")`, which fetches the BPE merge file from `openaipublic.blob.core.windows.net`. On an offline machine this raises `ConnectionResetError(10054)` and the server exits before binding. Fix: on a connected machine (or once while online) run `.venv\Scripts\python.exe -c "import tiktoken; tiktoken.encoding_for_model('gpt-4o-mini')"` to seed the cache at `%LOCALAPPDATA%\tiktoken\`, then the server starts offline.

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
- **Markers gate what runs.** `offline` is the default CI gate (no external services). `integration` / `requires_db` / `requires_api` are **skipped unless you pass `--run-integration`**. `pg_smoke` additionally needs `POSTGRES_PASSWORD` set. A plain `pytest` invocation silently skips most backend-dependent tests — pass `-m` explicitly when you need them.
- Pre-commit (ruff + format) config at `lightrag/.pre-commit-config.yaml`.

## Agent skills

### Issue tracker

Issues live as markdown files under `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Five canonical roles: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: root `CONTEXT.md` + `docs/adr/`. See `docs/agents/domain.md`. Upstream architecture / storage contracts / purge recovery / PR conventions: HKUDS/LightRAG docs + `lightrag/lightrag/` source.