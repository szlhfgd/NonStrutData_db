# Pre-Insert PDF Inspection Gate

A PDF inspection stage (`pre_insert/`) runs after a file is on disk but before it is enqueued for parsing, using the `pdf-inspector` Rust/Python library to classify each PDF as `text_based`, `scanned`, `image_based`, or `mixed`. Text-based PDFs are extracted to Markdown locally by pdf-inspector and enqueued as `RAW` (skipping the parser chain); the other three types fall through to the existing parser routing (MinerU/Docling) which performs OCR via external API. Non-PDF files pass through uninspected. On inspector failure the gate opens (fail-open): the file proceeds to the parser chain unchanged.

## Context

LightRAG's ingestion sent every PDF through the same parser chain, which meant text-based PDFs paid OCR-API latency and cost they didn't need. Firecrawl's `pdf-inspector` classifies a PDF in ~10-50ms by sampling content streams, enabling cheap local extraction for the ~54% of PDFs that are already text-based.

## Decision

- **Integration point (Q1=B):** standalone stage at `pipeline_enqueue_file` (`document_routes.py:2413`), the single chokepoint where all file-based ingestion (upload + scan) converges. Not inside parser routing, not at HTTP entry.
- **Integration mode (Q2=detect-only):** Python package `pdf-inspector`, classification + local text extraction only. No local OCR runtime (PDFium/ONNX). OCR-eligible PDFs are routed to the existing external OCR-capable parsers.
- **Local path (Q3=A):** text-based PDFs use pdf-inspector's own `result.markdown` (benchmark overall 0.875), enqueued as `RAW` so the parser is bypassed entirely.
- **Scope (Q4=A):** only `.pdf` files are inspected. All other supported types (`.docx`, `.md`, `.txt`, images) pass through to the existing chain unchanged.
- **Failure behavior (Q5=A):** fail-open. Any inspector error is logged and the file proceeds to the parser chain as if uninspected. Inspection is an optimization, not a gate that can block ingestion.

## Considered Options

- **Embed in parser routing (Q1=C):** rejected — couples classification with parsing and only sees PDFs after engine selection, too late to short-circuit.
- **Inspect at HTTP upload entry (Q1=A):** rejected — misses the scan path, and the HTTP layer is the wrong place for file-content logic.
- **CLI subprocess (Q2=cli):** rejected — extra binary dependency, no Rust toolchain guaranteed on Windows host.
- **Python pkg with local OCR (Q2=python-ocr):** rejected — requires manual PDFium + ONNX Runtime DLL placement on Windows; the existing MinerU/Docling external-API path already handles OCR.
- **Legacy parser for local path (Q3=B):** rejected — reintroduces the cost pdf-inspector avoids, and pdf-inspector outperforms pymupdf4llm in the benchmark.
- **Fail-closed (Q5=B):** rejected — a Rust-backed dependency crash must not be able to halt all document ingestion.

## Consequences

- A new external dependency (`pdf-inspector`, Rust-backed wheel) is locked into the ingestion path. Swapping it requires editing one module in `pre_insert/`.
- Text-based PDFs no longer pass through `LegacyParser`/`NativeParser`; their Markdown comes straight from pdf-inspector. Citation `file_path` is preserved.
- The `pre_insert/` directory at repo root, previously empty, now holds the inspection module — matching its name's intent.
- Fail-open means a corrupt or unsupported PDF that pdf-inspector rejects silently falls back to the parser chain, which may then fail separately. This is intentional: the parser chain is the source of truth for ingestion errors.
