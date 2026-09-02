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