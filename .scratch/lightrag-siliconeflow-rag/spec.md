# Spec: Personal RAG on LightRAG with Silicone Flow + MinerU Cloud

Status: ready-for-agent

## Problem Statement

The user is a professional on a Windows machine with no local GPU. They need a
personal Retrieval-Augmented Generation (RAG) knowledge base built on this
LightRAG fork, reachable through the packaged WebUI, that ingests real-world
business documents — Word, PDF, and PowerPoint — many of which have complex
layout (tables, mixed Chinese/English, scanned pages) and cannot be handled by
plain-text extraction alone.

The available local compute cannot run a full document-parsing service
(MinerU) with a VLM. The user therefore wants document parsing and model
inference to run against paid cloud services, configured entirely through
LightRAG's native configuration surface rather than invasive code surgery.

After resolving where each component lives:

- LLM, embedding, rerank, and visual-LM (VLM) inference → **Silicone Flow**
  (an OpenAI-compatible API).
- Document parsing for PDF/PPTX (incl. scanned pages, tables) → **mineru.net
  official cloud API**, a separate paid account.
- Markdown and DOCX → **native** parser.

The user also decided to start with LightRAG's default file-based storage
backends (JSON/NetworkX/vector under a working directory), not a relational or
graph database.

## Solution

A working, self-hosted RAG server (`lightrag-server` + packaged WebUI) on the
user's Windows machine that:

1. Routes document ingestion by file type through LightRAG's parser routing:
   PDF/PPTX → MinerU official cloud; Markdown/DOCX → native; any residual type
   → legacy fallback.
2. Uses Silicone Flow for all model inference: DeepSeek-V3 (LLM),
   BAAI/bge-m3 (embedding), BAAI/bge-reranker-v2-m3 (rerank), and
   Qwen/Qwen2.5-VL-7B-Instruct (VLM image analysis).
3. Enables VLM image analysis so charts and figures extracted from documents
   are understood and become queryable entities/relations.
4. Enables reranking so retrieval quality benefits from a cross-encoder.

Most of this is pure `.env` configuration (the native, supported path). The
only code change is enabling an `openai` rerank binding so Silicone Flow's
`/v1/rerank` endpoint can be reached through the existing rerank dispatch.

## User Stories

1. As a user, I want to upload a Markdown file, so that its text is ingested
   and becomes queryable.
2. As a user, I want to upload a DOCX file, so that its text and simple layout
   are ingested natively without an external parser.
3. As a user, I want to upload a PDF with standard text, so that MinerU cloud
   parses it into clean content.
4. As a user, I want to upload a PDF containing scanned pages, so that
   MinerU's scanned-page handling (OCR) recovers the text.
5. As a user, I want to upload a PowerPoint file with complex slides and
   tables, so that MinerU cloud extracts its content faithfully.
6. As a user, I want complex tables inside PDF/PPTX to be preserved as usable
   content, so that structured data is not flattened into unusable text.
7. As a user, I want mixed Chinese/English documents to be processed correctly,
   so that both languages are retrievable.
8. As a user, I want charts and figures inside documents to be understood via
   a visual-LM, so that image content becomes queryable entities/relations.
9. As a user, I want to ask natural-language questions over the ingested
   corpus, so that I can retrieve relevant answers.
10. As a user, I want query results reranked by a cross-encoder, so that the
    most relevant chunks surface first.
11. As a user, I want to use graph-aware retrieval modes (e.g. hybrid/mix), so
    that I can exploit the knowledge-graph structure LightRAG builds.
12. As a user, I want to do all of this through the packaged WebUI, so that I
    do not need to write code or call the API directly.
13. As a user, I want the server to run on my GPU-less Windows machine, so
    that no local model/inference hardware is required.
14. As a user, I want model and parsing credentials to be isolated per paid
    provider, so that I can track costs independently.
15. As a user, I want to start with the default file-based storage, so that I
    can validate the pipeline before committing to a heavier backend.
16. As a user, I want the rerank provider to accept Silicone Flow's
    OpenAI-compatible rerank endpoint, so that I don't need a separate paid
    rerank service.
17. As a user, I want the VLM binding to use Silicone Flow's hosted
    Qwen2.5-VL-7B, so that image analysis runs in the cloud at moderate cost.

## Implementation Decisions

- **Provider strategy:** Silicone Flow provides the LLM (DeepSeek-V3),
  embedding (BAAI/bge-m3), rerank (BAAI/bge-reranker-v2-m3), and VLM
  (Qwen/Qwen2.5-VL-7B-Instruct), all reachable via the `openai` binding to
  `https://api.siliconflow.cn/v1`. This is configuration-only.
- **Rerank binding patch (the only code change):** the rerank dispatch is
  gated by an enum of bindings (`null/cohere/jina/aliyun`) that lacks an
  `openai` option, so Silicone Flow's `/v1/rerank` cannot be reached through
  config alone. The engineering change is to extend the binding options to
  include `openai` and map it to the existing generic `jina_rerank` adapter,
  whose request/response payload is compatible with an OpenAI-compatible
  cross-encoder rerank endpoint. No new rerank implementation is written.
- **Document parsing:** MinerU runs entirely as mineru.net official cloud
  (`MINERU_API_MODE=official`) using its `vlm` model version; `MINERU_IS_OCR`
  stays false because MinerU's `vlm` model auto-detects scanned pages.
  Markdown and DOCX use the native engine. Routing is expressed through
  `LIGHTRAG_PARSER` rules (PDF/PPTX → mineru; docx → native; fallback →
  legacy).
- **VLM:** multimodal analysis is enabled (`VLM_PROCESS_ENABLE`), with a
  dedicated role-level binding to Silicone Flow's Qwen2.5-VL-7B via the openai
  binding.
- **Storage:** LightRAG's default file-based backends (KV/vector/graph/doc
  status under a working directory) are used.
- **Interfaces touched:** the server's argument/environment schema for the
  rerank binding choices, and the server's rerank dispatch table that maps a
  binding string to a rerank function. No storage schema or public core API
  changes.

## Testing Decisions

- **What makes a good test:** only external behavior — a rerank binding string
  is accepted/validated, and resolves to the correct rerank function — not the
  internals of the rerank payload. Parser routing is validated by asserting
  that a given file type resolves to the expected engine/parse path.
- **Modules tested:** the API configuration layer (routing/binding validation)
  and the parser routing layer. Rerank provider payloads are mock-based; no
  live Silicone Flow/mineru.net calls in unit tests.
- **Prior art:** follow the existing conventions — `tests/api/config/` for
  argument/environment validation of bindings, and `tests/parser/external/mineru/`
  for MinerU routing with mocked HTTP (per repository guidance, external
  services are mocked in unit tests and never hit live endpoints).

## Out of Scope

- Local MinerU deployment (Docker + GPU/CPU backend).
- Relational or graph database backends (PostgreSQL, Neo4j).
- VLM fine-tuning or model training.
- Providers other than Silicone Flow and mineru.net.
- Deep code surgery beyond the minimal rerank binding patch; the intent is to
  stay on LightRAG's native configuration surface wherever possible.

## Further Notes

- Two independent paid accounts/credentials are required and must be kept
  separate in `.env`: Silicone Flow API key, and mineru.net API token.
- The VLM is pinned to the 7B variant to moderate cost; a 72B variant is an
  upgrade path.
- Switching embedding models later requires clearing the data directory
  (LightRAG's documented pitfall for vector-space changes).
- Confirmed decisions: MinerU = mineru.net official cloud; VLM =
  Qwen/Qwen2.5-VL-7B-Instruct; storage = default file backends.
