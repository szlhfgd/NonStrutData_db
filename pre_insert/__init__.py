"""Pre-Insert PDF Inspection.

Classifies a PDF before it is enqueued for parsing, using the ``pdf-inspector``
Rust/Python library. Text-based PDFs are extracted to Markdown locally and
returned for ``RAW`` enqueue (parser bypass); all other types (scanned,
image-based, mixed) return ``None`` so the caller falls through to the existing
parser chain. Non-PDF files return ``None`` uninspected. Any inspector error is
caught and logged; the function returns ``None`` so ingestion proceeds
(fail-open). See ``docs/adr/0001-pre-insert-pdf-inspection.md``.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from lightrag.utils import logger

PdfType = Literal["text_based", "scanned", "image_based", "mixed"]


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
