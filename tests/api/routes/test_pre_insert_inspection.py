"""Pre-Insert PDF Inspection routing at the pipeline_enqueue_file chokepoint.

Exercises the four routing behaviours declared in ADR 0001 through the single
ingestion chokepoint, without mocking parser internals. The enqueue kwargs
captured by a stub RAG are the observable routing decision:

  - text_based PDF  → docs_format=RAW, input=<markdown>, parse_engine="pdf_inspector"
  - scanned PDF     → docs_format=PENDING_PARSE (parser chain preserved)
  - non-PDF         → docs_format=PENDING_PARSE, uninspected
  - corrupt/missing → docs_format=PENDING_PARSE, fail-open

PDF fixtures are generated programmatically (reportlab for text-based; a
minimal no-text-operator PDF for scanned) so the suite has no binary assets.
"""

import asyncio
import importlib
import sys
from pathlib import Path

import pytest

_original_argv = sys.argv[:]
sys.argv = [sys.argv[0]]
_document_routes = importlib.import_module("lightrag.api.routers.document_routes")
sys.argv = _original_argv

pipeline_enqueue_file = _document_routes.pipeline_enqueue_file

pytestmark = pytest.mark.offline


class _EnqueueRag:
    """Minimal RAG stub: captures the enqueue kwargs that encode the routing
    decision. Mirrors the pattern in test_scan_unsafe_source.py."""

    def __init__(self):
        self.captured: dict | None = None
        self.errors: list = []

    addon_params: dict = {}

    async def apipeline_enqueue_documents(self, content, **kwargs):
        self.captured = {"content": content, **kwargs}
        return {"ok": True}

    async def apipeline_enqueue_error_documents(self, error_files, _track_id):
        self.errors.append(error_files)


def _make_text_pdf(path: Path) -> None:
    """A real text-based PDF that pdf-inspector classifies as text_based."""
    from reportlab.pdfgen import canvas

    c = canvas.Canvas(str(path))
    c.drawString(100, 750, "Hello Pre-Insert Inspection")
    c.drawString(100, 730, "A text-based PDF for the Local Path.")
    c.save()


def _make_scanned_pdf(path: Path) -> None:
    """A PDF with no text operators — pdf-inspector classifies it as scanned.

    A one-page PDF whose content stream draws nothing, so there are no Tj/TJ
    operators to find. This is the cheapest scanned surrogate that triggers
    the 'no text layer' branch.
    """
    content = (
        b"%PDF-1.1\n"
        b"1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"
        b"2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n"
        b"3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]"
        b"/Contents 4 0 R/Resources<<>>>>endobj\n"
        b"4 0 obj<</Length 2>>stream\nq Q\nendstream endobj\n"
        b"xref\n0 5\n"
        b"0000000000 65535 f \n"
        b"0000000009 00000 n \n"
        b"0000000058 00000 n \n"
        b"0000000115 00000 n \n"
        b"0000000214 00000 n \n"
        b"trailer<</Size 5/Root 1 0 R>>\nstartxref\n265\n%%EOF"
    )
    path.write_bytes(content)


def test_text_based_pdf_takes_local_path(tmp_path):
    """A text-based PDF is extracted to Markdown locally and enqueued as RAW,
    bypassing the parser chain (the Local Path, ADR 0001 Q3=A)."""

    async def _run():
        rag = _EnqueueRag()
        pdf = tmp_path / "text.pdf"
        _make_text_pdf(pdf)

        success, _track = await pipeline_enqueue_file(rag, pdf, "track-local")

        assert success is True
        assert rag.errors == []
        cap = rag.captured
        assert cap is not None
        assert cap["docs_format"] == "raw"
        assert cap["parse_engine"] == "pdf_inspector"
        assert isinstance(cap["content"], str) and cap["content"].strip()
        assert "Hello Pre-Insert Inspection" in cap["content"]
        assert cap["file_paths"] == str(pdf)

    asyncio.run(_run())


def test_scanned_pdf_falls_through_to_parser_chain(tmp_path):
    """A scanned PDF (no text layer) is routed to the existing parser chain
    via PENDING_PARSE (the API Path, ADR 0001 Q3)."""

    async def _run():
        rag = _EnqueueRag()
        pdf = tmp_path / "scan.pdf"
        _make_scanned_pdf(pdf)

        success, _track = await pipeline_enqueue_file(rag, pdf, "track-api")

        assert success is True
        assert rag.errors == []
        cap = rag.captured
        assert cap is not None
        assert cap["docs_format"] == "pending_parse"
        # parse_engine is whatever resolve_parser_directives chose (legacy by
        # default for .pdf), NOT "pdf_inspector" — inspection did not extract.
        assert cap["parse_engine"] != "pdf_inspector"
        # No pre-extracted content on the API Path.
        assert cap["content"] == ""

    asyncio.run(_run())


def test_non_pdf_passes_through_uninspected(tmp_path, caplog):
    """A non-PDF file (.txt) is never inspected and enqueues as PENDING_PARSE
    (scope is PDF-only, ADR 0001 Q4=A). No inspection-related log is emitted."""

    async def _run():
        rag = _EnqueueRag()
        txt = tmp_path / "notes.txt"
        txt.write_text("just text", encoding="utf-8")

        success, _track = await pipeline_enqueue_file(rag, txt, "track-txt")

        assert success is True
        cap = rag.captured
        assert cap is not None
        assert cap["docs_format"] == "pending_parse"
        assert cap["parse_engine"] != "pdf_inspector"

    asyncio.run(_run())
    # The gate is PDF-only: a .txt must not trigger any inspection log.
    assert not any("[Pre-Insert]" in r.message for r in caplog.records)


def test_missing_pdf_fails_open_to_parser_chain(tmp_path, caplog):
    """A corrupt or missing PDF fails open: the file proceeds to the parser
    chain unchanged (fail-open, ADR 0001 Q5=A). The enqueue still happens
    with PENDING_PARSE because the inspection returned None, and a WARNING
    log containing 'fail-open' is emitted."""

    async def _run():
        rag = _EnqueueRag()
        missing = tmp_path / "ghost.pdf"  # never created

        success, _track = await pipeline_enqueue_file(rag, missing, "track-missing")

        # Fail-open: enqueue proceeds (PENDING_PARSE), not rejected.
        assert success is True
        cap = rag.captured
        assert cap is not None
        assert cap["docs_format"] == "pending_parse"
        assert cap["parse_engine"] != "pdf_inspector"

    asyncio.run(_run())
    # Fail-open must be logged at WARNING so operators can diagnose routing.
    assert any(
        "fail-open" in r.message and r.levelname == "WARNING"
        for r in caplog.records
    )
