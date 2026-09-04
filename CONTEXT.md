# LightRAG WebUI Context

The lightrag_webui frontend and its domain: managing a document library, observing ingestion, and querying a graph-based knowledge base.

## Language

**Document Library**:
The set of all registered documents in a workspace. Its size is surfaced as the Total count in the library summary; per-status counts are the distribution. The pipeline's `docs` field and the document list's `status_counts` are different count perspectives on the same collection.
_Avoid_: uploaded documents

**Document**:
A single registered entry in the Document Library, carrying an id, a status, and metadata. Each row in the document manager table is a Document.

**Pipeline**:
The backend's document-processing run (parsing, analyzing, ingesting) tracked via `/documents/pipeline_status`. It is either running (`pipeline_active`) or idle. The WebUI renders its batch progress as an ingestion progress bar.
_Avoid_: ingestion, ingestion progress — those are UI renderings of the Pipeline, not separate domain concepts

**Ingestion Progress**:
The pipeline's batch progress (`cur_batch`/`batchs`) rendered in the WebUI. It is batch progress, not a smooth per-document percentage, and is shown only while the Pipeline is running.

## Pre-Insert Inspection

**Pre-Insert Inspection**:
A gate that runs after a file is on disk but before it is enqueued for parsing. It classifies a PDF and decides whether the existing parser chain should handle it locally or whether it must be routed to an OCR-capable external service. Non-PDF files pass through uninspected. On inspector failure the gate opens: the file proceeds to the parser chain unchanged.
_Avoid_: pre-processing, validation, filter — those imply rejection or transformation; Inspection only classifies and routes.

**PdfType**:
The classification a Pre-Insert Inspection assigns to a PDF, drawn from pdf-inspector's four categories: `text_based` (born-digital, selectable text), `scanned` (raster images of pages, no text layer), `image_based` (pages are images, e.g. exported slides), `mixed` (some pages have text, some don't). Only `text_based` is guaranteed to skip OCR.
_Avoid_: document type, file type — those are broader and already used for suffix-based routing.

**Local Path**:
The ingestion branch taken when Pre-Insert Inspection classifies a PDF as `text_based`: pdf-inspector extracts Markdown directly from the text layer, no OCR, no external API call. This is the cheap, fast (~150ms) path.
_Avoid_: native path, offline path.

**API Path**:
The ingestion branch taken when Pre-Insert Inspection classifies a PDF as `scanned`, `image_based`, or `mixed`: the file is routed to an OCR-capable external parser (MinerU or Docling) per the existing parser routing. Pre-Insert Inspection does not perform OCR itself.
_Avoid_: OCR path, cloud path — those name the mechanism, not the routing decision.