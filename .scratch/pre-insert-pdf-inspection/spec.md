# Pre-Insert PDF Inspection

Status: ready-for-agent

## Problem Statement

As a knowledge-base operator ingesting large batches of documents, I pay OCR-API latency and cost for every PDF even when roughly half of them are already text-based (born-digital reports, papers, invoices, legal docs). There is no step that looks at a PDF and decides whether it actually needs OCR before sending it down the parsing pipeline. The result is wasted money and slow ingestion for documents that could have been extracted locally in milliseconds.

## Solution

A Pre-Insert Inspection gate runs after a file is on disk but before it is enqueued for parsing. For PDFs, it uses the `pdf-inspector` Rust/Python library to classify each file as `text_based`, `scanned`, `image_based`, or `mixed`. Text-based PDFs take the Local Path: pdf-inspector extracts Markdown directly from the text layer and the document is enqueued as `RAW` (parser chain bypassed, ~150ms, no OCR). The other three PdfTypes take the API Path: they fall through to the existing parser routing (MinerU or Docling), which performs OCR via external API as before. Non-PDF files pass through the gate uninspected. On any inspector failure the gate opens (fail-open): the file proceeds to the parser chain unchanged, so a Rust-backed dependency crash can never halt ingestion.

## User Stories

1. As a knowledge-base operator, I want text-based PDFs to be extracted locally without calling an OCR API, so that I save API cost on the ~54% of PDFs that don't need OCR.
2. As a knowledge-base operator, I want scanned PDFs to be routed to the existing OCR-capable parser, so that I still get text out of image-only documents.
3. As a knowledge-base operator, I want mixed PDFs (some text pages, some scanned) to be routed to OCR, so that no page is silently dropped.
4. As a knowledge-base operator, I want image-based PDFs (e.g. exported slides) to be routed to OCR, so that their visual content is still captured.
5. As a knowledge-base operator, I want the inspection to run on both uploaded files and scan-discovered files, so that the gate covers every ingestion entry, not just one.
6. As a knowledge-base operator, I want non-PDF files (`.docx`, `.md`, `.txt`, images) to pass through the gate unchanged, so that existing ingestion for those types is not affected.
7. As a knowledge-base operator, I want a corrupt or unreadable PDF to still be ingested via the existing parser chain, so that a dependency failure does not block my document pipeline.
8. As a knowledge-base operator, I want the inspection result (PdfType, confidence, pages needing OCR) to be logged, so that I can diagnose why a PDF was routed one way or the other.
9. As a knowledge-base operator, I want the extracted Markdown from a text-based PDF to preserve headings, lists, and tables, so that the knowledge graph built from it has the same structural quality as one built by the legacy parser.
10. As a knowledge-base operator, I want the source file path to remain attached to the document even when the parser is bypassed, so that citations still point to the original PDF.
11. As a developer, I want the inspection logic to live in one module under `pre_insert/`, so that swapping the classification library later only touches one file.
12. As a developer, I want the inspection hook to sit at the single ingestion chokepoint, so that I don't have to wire it into multiple entry points.
13. As a developer, I want the gate to fail-open with a logged warning, so that production ingestion survives a pdf-inspector crash or version incompatibility.
14. As a developer, I want the inspection to be synchronous-and-threaded (via `asyncio.to_thread`), so that a ~10-200ms blocking call does not stall the async event loop.
15. As a developer, I want `pdf-inspector` to be a detect-only dependency (no local OCR runtime), so that I don't have to ship PDFium and ONNX Runtime DLLs on Windows.
16. As a site reliability engineer, I want the inspection gate to be an optimization rather than a hard gate, so that disabling or removing it returns ingestion to its prior behavior with no data loss.

## Implementation Decisions

### Integration point

The inspection hook sits inside `pipeline_enqueue_file` (the single chokepoint where both `/documents/upload` and `/documents/scan` converge), immediately after parser directives are resolved and before the enqueue kwargs are built. This is the only place where the file is confirmed on disk, the parser engine is known, and the parser has not yet been called. Wiring here covers every file-shaped ingestion path with one edit.

### Integration mode

The `pdf-inspector` Python package (Rust-backed wheel, installed from PyPI) is used in detect-and-extract mode only. Two calls are made per text-based PDF: `classify_pdf` (returns `PdfClassification{pdf_type, confidence, page_count, pages_needing_ocr}`) and, only when `pdf_type == "text_based"`, `process_pdf` (returns `PdfResult{markdown, ...}`). No local OCR runtime is invoked; the package's OCR features are not imported. OCR-eligible PDFs rely on the existing MinerU/Docling external-API path.

### Routing decision

The inspection outcome drives a binary enqueue-format switch:

- **Local Path** (`text_based` + markdown extracted): enqueue as `RAW` with the extracted markdown supplied as the `input` field, `parse_engine` set to `"pdf_inspector"` as a provenance record, and `file_paths` preserved for citation. The parser chain is bypassed entirely.
- **API Path** (`scanned` / `image_based` / `mixed`, or non-PDF, or inspector failure): enqueue as `PENDING_PARSE` with the originally-resolved `parse_engine` and `process_options`, exactly as before the feature existed.

### Module interface

The `pre_insert` package exposes:

- `is_pdf(file_path) -> bool` — case-insensitive `.pdf` suffix check; the scope guard (Q4).
- `inspect_pdf(file_path) -> InspectionOutcome | None` — the single entry point. Returns `None` for non-PDFs and for any inspector failure (fail-open, Q5). Returns `InspectionOutcome(pdf_type, confidence, markdown)` for PDFs, where `markdown` is `None` unless the PDF is `text_based` and extraction yielded non-empty content.
- `InspectionOutcome` — a frozen dataclass with `pdf_type`, `confidence`, `markdown`.

The caller wraps `inspect_pdf` in `asyncio.to_thread` because the underlying Rust calls are blocking.

### Failure behavior

Every exception path inside `inspect_pdf` (missing `pdf_inspector` import, file-not-found, Rust panic surfaced as a Python exception, empty markdown from a text-based classification) is caught, logged at WARNING level with the file name and a `(fail-open, proceeding to parser chain)` suffix, and returns `None`. The outer dispatch block in `pipeline_enqueue_file` has its own try/except for the same reason, so a failure in the hook itself cannot break enqueue.

### Domain vocabulary

Four terms were added to `CONTEXT.md` under a new "Pre-Insert Inspection" section: **Pre-Insert Inspection** (the gate), **PdfType** (the four-way classification), **Local Path** (text-based → local extraction), **API Path** (non-text-based → existing OCR-capable parser). These terms are used consistently in logs, ADR, and this spec.

### Architectural decision record

`docs/adr/0001-pre-insert-pdf-inspection.md` records the five decisions (integration point, integration mode, local-path extraction, PDF-only scope, fail-open) and the rejected alternatives (embed in parser routing, HTTP-entry inspection, CLI subprocess, local OCR runtime, legacy parser for local path, fail-closed). The ADR exists because the decision is hard to reverse (external Rust-backed dependency locked into ingestion), surprising without context (PDFs bypass the parser chain), and the result of genuine trade-offs.

### What is not changed

- Parser routing (`routing.py`, `registry.py`) is untouched — the inspection runs before it and only short-circuits when it can.
- The scan spool, admission middleware, and body-limit middleware are untouched.
- The `/documents/text` endpoint (text body, no file on disk) is untouched — it never passes through `pipeline_enqueue_file`.
- The SDK `LightRAG.ainsert` entry is untouched — it enqueues as `RAW` directly and never inspects.

## Testing Decisions

### What makes a good test here

Tests should assert **external routing behavior** at the chokepoint, not implementation details of `inspect_pdf` or the pdf-inspector library. The observable behavior is: given a file on disk, does `pipeline_enqueue_file` enqueue as `RAW` (parser bypassed, markdown present) or as `PENDING_PARSE` (parser chain preserved)? That single assertion captures the entire Local-Path-vs-API-Path decision.

### Seam

One seam: `pipeline_enqueue_file` in `document_routes.py`, exercised directly as an async function. No HTTP client, no parser internals. The test supplies a `LightRAG` double (or the real constructor with stubbed storage) and asserts on the kwargs passed to `apipeline_enqueue_documents` by intercepting that call.

### Test cases

1. **Text-based PDF → Local Path:** a real text-based PDF fixture (generated by `reportlab` at test time, as done in the verification step) is inspected, and the enqueue call is asserted to use `docs_format=RAW` with a non-empty `input` string and `parse_engine="pdf_inspector"`.
2. **Scanned PDF → API Path:** a scanned PDF fixture (a PDF whose pages are raster images, or a hand-rolled PDF with no text operators) is inspected, and the enqueue call is asserted to use `docs_format=PENDING_PARSE` with the originally-resolved engine.
3. **Non-PDF → uninspected passthrough:** a `.txt` or `.md` fixture is enqueued, and the enqueue call is asserted to use `PENDING_PARSE` with no inspection-related log emitted.
4. **Corrupt / missing PDF → fail-open:** a path to a non-existent `.pdf` is enqueued, and the enqueue call is asserted to use `PENDING_PARSE` (fall-through), with a WARNING log containing `fail-open`.

### Prior art

`tests/api/routes/` already exercises document-routes endpoints at the router level. The new tests sit in the same directory and follow the same fixture-and-assertion style. PDF fixtures are generated programmatically (the verification step already proved `reportlab` produces a PDF that pdf-inspector classifies as `text_based` with confidence 1.0); a scanned fixture can be a minimal PDF with image-only content streams.

## Out of Scope

- Local OCR via pdf-inspector's `process_pdf_with_ocr` (would require PDFium + ONNX Runtime DLLs on Windows). OCR is delegated to the existing MinerU/Docling external-API path.
- Per-page OCR routing (pdf-inspector returns `pages_needing_ocr`, but this feature does not split a mixed PDF into text pages vs OCR pages; a mixed PDF goes wholly to the API Path).
- Inspection of non-PDF file types (images, `.docx`, etc.). The gate is PDF-only by design.
- A UI surface for inspection results (the WebUI does not show PdfType or confidence; they appear only in server logs).
- A configuration flag to disable inspection. Disabling is done by uninstalling `pdf-inspector` (the import fails, fail-open fires, ingestion proceeds unchanged). A future spec may add an env-var toggle.
- Caching of inspection results across re-ingestions of the same file.

## Further Notes

- The feature is already implemented and verified. This spec documents the completed work for the issue tracker; an agent picking it up would be writing the test cases described under Testing Decisions, not re-implementing the feature.
- The `pdf-inspector` package (v1.17.0, Rust-backed abi3 wheel) is installed in the project `.venv`. It is a runtime dependency for PDF ingestion but degrades gracefully (fail-open) if absent.
- Benchmark context (from pdf-inspector's README, opendataloader-bench corpus): overall 0.875, reading-order 0.915, tables 0.814, 200 docs in 0.470s — outperforming pymupdf4llm and markitdown on text-based PDFs. This is why the Local Path uses pdf-inspector's own Markdown rather than the legacy parser.
- The `pre_insert/` directory at the repo root predates this feature (it was empty). Its name now matches its purpose.
