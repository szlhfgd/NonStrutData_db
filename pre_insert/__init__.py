"""Pre-Insert PDF Inspection.

Classifies a PDF before it is enqueued for parsing, using the ``pdf-inspector``
Rust/Python library. Text-based PDFs are extracted to Markdown locally and
returned for ``RAW`` enqueue (parser bypass, the Local Path); all other types
(scanned, image-based, mixed) return ``None`` so the caller falls through to
the existing parser chain (the API Path). Non-PDF files return ``None``
uninspected. Any inspector error is caught and logged; the function returns
``None`` so ingestion proceeds (fail-open). See
``docs/adr/0001-pre-insert-pdf-inspection.md``.

The module exposes two interfaces:

- :func:`inspect_for_enqueue` — the deep interface. Returns an
  :class:`EnqueueDirective` carrying the complete routing decision (docs
  format, parse engine, pre-extracted content) so the caller merges it into
  its enqueue kwargs without knowing what ``"pdf_inspector"`` means or which
  format the Local Path uses. Returns ``None`` for fall-through (non-PDF,
  inspector failure, or non-text-based PDF), leaving the caller's
  already-resolved directives unchanged.
- :func:`inspect_pdf` — the low-level classification+extraction interface.
  Returns an :class:`InspectionOutcome` carrying the PdfType and markdown.
  Kept for callers (e.g. tests, future scan-time pre-filters) that want the
  classification without the enqueue-routing decision.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from lightrag.constants import FULL_DOCS_FORMAT_RAW
from lightrag.utils import logger

PdfType = Literal["text_based", "scanned", "image_based", "mixed"]

#: Engine name stamped into the persisted ``parse_engine`` field when the
#: Local Path bypasses the parser chain (ADR 0001 Q3=A).
PARSER_ENGINE_PDF_INSPECTOR = "pdf_inspector"


@dataclass(frozen=True)
class InspectionOutcome:
    """Result of a pre-insert inspection.

    ``markdown`` is set only when the PDF is ``text_based`` and was successfully
    extracted locally. When ``None``, the caller must fall through to the
    existing parser chain (PENDING_PARSE).
    """

    pdf_type: PdfType
    confidence: float
    markdown: str | None


@dataclass(frozen=True)
class EnqueueDirective:
    """Complete enqueue-routing decision for the Local Path.

    Returned by :func:`inspect_for_enqueue` when a text-based PDF is extracted
    locally. The caller merges these fields into its enqueue kwargs, overriding
    the ``docs_format`` and ``parse_engine`` it resolved from suffix/hint/env
    routing. When :func:`inspect_for_enqueue` returns ``None`` the caller
    keeps its own resolved values unchanged (fall-through to PENDING_PARSE).
    """

    docs_format: str
    parse_engine: str
    content: str


def is_pdf(file_path: Path) -> bool:
    """True only for ``.pdf`` files (case-insensitive). Q4: only PDFs inspected."""
    return file_path.suffix.lower() == ".pdf"


def inspect_pdf(file_path: Path) -> InspectionOutcome | None:
    """Inspect a single file on disk.

    Returns:
        - ``InspectionOutcome`` with ``markdown`` set when the PDF is
          ``text_based`` and local extraction succeeded.
        - ``InspectionOutcome`` with ``markdown=None`` when the PDF is
          ``scanned``/``image_based``/``mixed`` (caller routes to OCR-capable
          parser).
        - ``None`` when the file is not a PDF, or when the inspector failed
          (fail-open: caller proceeds to the parser chain unchanged).

    This function is synchronous and may block for ~10-200ms (classification +
    extraction). The caller wraps it in ``asyncio.to_thread``.
    """
    if not is_pdf(file_path):
        return None

    try:
        import pdf_inspector
    except ImportError:
        logger.warning(
            "[Pre-Insert] pdf-inspector not installed; "
            f"{file_path.name} proceeds uninspected (fail-open)"
        )
        return None

    try:
        classification = pdf_inspector.classify_pdf(str(file_path))
        pdf_type: PdfType = classification.pdf_type  # type: ignore[assignment]
        confidence = float(classification.confidence)

        logger.info(
            f"[Pre-Insert] {file_path.name}: pdf_type={pdf_type} "
            f"confidence={confidence:.2f} pages_needing_ocr="
            f"{list(classification.pages_needing_ocr)}"
        )

        if pdf_type != "text_based":
            # scanned / image_based / mixed → route to existing OCR-capable parser
            return InspectionOutcome(pdf_type=pdf_type, confidence=confidence, markdown=None)

        # text_based → extract Markdown locally (Q3=A: pdf-inspector's own output)
        result = pdf_inspector.process_pdf(str(file_path))
        markdown = result.markdown
        if not markdown or not markdown.strip():
            logger.warning(
                f"[Pre-Insert] {file_path.name} classified text_based but "
                "extracted no markdown (fail-open, proceeding to parser chain)"
            )
            return None

        return InspectionOutcome(
            pdf_type=pdf_type, confidence=confidence, markdown=markdown
        )
    except Exception as e:  # fail-open (Q5=A)
        logger.warning(
            "[Pre-Insert] Inspection failed for "
            f"{file_path.name}: {e!r} (fail-open, proceeding to parser chain)"
        )
        return None


def inspect_for_enqueue(file_path: Path) -> EnqueueDirective | None:
    """Return the enqueue-routing directive for a file, or ``None`` for fall-through.

    This is the deep interface. When a text-based PDF is successfully extracted
    locally (the Local Path, ADR 0001 Q3=A), returns an
    :class:`EnqueueDirective` carrying:

    - ``docs_format`` = :data:`FULL_DOCS_FORMAT_RAW` (parser bypass)
    - ``parse_engine`` = :data:`PARSER_ENGINE_PDF_INSPECTOR`
    - ``content`` = the pre-extracted Markdown

    Returns ``None`` in every other case — non-PDF, non-text-based PDF
    (scanned/image_based/mixed → API Path), inspector failure (fail-open), or
    ``pdf_inspector`` not installed. The caller keeps its already-resolved
    ``docs_format`` and ``parse_engine`` unchanged in all these cases.

    Synchronous; the caller wraps it in ``asyncio.to_thread``.
    """
    outcome = inspect_pdf(file_path)
    if outcome is None or outcome.markdown is None:
        return None
    return EnqueueDirective(
        docs_format=FULL_DOCS_FORMAT_RAW,
        parse_engine=PARSER_ENGINE_PDF_INSPECTOR,
        content=outcome.markdown,
    )
