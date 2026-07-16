"""
Offline policy-document parsing with IBM Docling.

Runs ONCE, by hand, never at request time. Reads the policy PDFs in
data/policies/, converts them to structured text with Docling, and verifies that
every citation in data/seed/*.json appears verbatim in the parsed text — so the
policy library's citations provably trace back to a real source document.

A parser is not an authority: this does not invent rules. It confirms that the
human-reviewed rules in data/seed/ actually say what their source documents say.

Run:  python scripts/docling/extract.py
"""
import json
import sys
from pathlib import Path

from docling.document_converter import DocumentConverter, PdfFormatOption
from docling.datamodel.base_models import InputFormat
from docling.datamodel.pipeline_options import PdfPipelineOptions

POLICIES = Path("data/policies")
SEED = Path("data/seed")


def make_converter() -> DocumentConverter:
    """
    A text-first converter. Our policy PDFs are digital text, not scans, so OCR
    and table-structure models are turned off — they add heavy model
    dependencies and are not needed to read the sentences we cite.
    """
    opts = PdfPipelineOptions()
    opts.do_ocr = False
    opts.do_table_structure = False
    return DocumentConverter(
        format_options={InputFormat.PDF: PdfFormatOption(pipeline_options=opts)}
    )

# Maps each seed JSON to its source PDF.
PAIRS = [
    ("finance-approval-matrix.json", "finance-approval-matrix.pdf"),
    ("approved-vendor-list.json", "approved-vendor-list.pdf"),
    ("procurement-policy.json", "procurement-policy.pdf"),
    ("security-requirements.json", "security-requirements.pdf"),
]


def citation_sentence(source_passage: str) -> str:
    """
    Strips the citation label from a source passage, leaving the sentence that
    must appear in the document.

    "Finance Approval Matrix s2.1: Expenditures exceeding GBP 10,000 ..."
        -> "Expenditures exceeding GBP 10,000 ..."
    """
    return source_passage.split(": ", 1)[-1].strip().rstrip(".")


def normalise(text: str) -> str:
    return " ".join(text.split()).lower()


def main() -> int:
    if not POLICIES.exists():
        print(f"No {POLICIES}/ — run `python scripts/docling/make_pdfs.py` first.", file=sys.stderr)
        return 1

    converter = make_converter()
    all_ok = True

    for seed_file, pdf_file in PAIRS:
        pdf_path = POLICIES / pdf_file
        if not pdf_path.exists():
            print(f"Missing {pdf_path}", file=sys.stderr)
            all_ok = False
            continue

        print(f"\nParsing {pdf_file} with Docling ...")
        result = converter.convert(str(pdf_path))
        markdown = result.document.export_to_markdown()

        # Keep the parsed text next to the seed file so a reviewer can diff it.
        parsed_path = SEED / f"{pdf_path.stem}.parsed.md"
        parsed_path.write_text(markdown, encoding="utf-8")
        haystack = normalise(markdown)

        seed = json.loads((SEED / seed_file).read_text(encoding="utf-8"))
        for rule in seed.get("rules", []):
            sentence = citation_sentence(rule["sourcePassage"])
            if normalise(sentence) in haystack:
                print(f"  OK   {sentence[:60]}...")
            else:
                print(f"  FAIL not found in source: {sentence}")
                all_ok = False

    if all_ok:
        print("\nEvery citation traces to a sentence in its source document. ✅")
        return 0

    print("\nSome citations do not appear in their source. Fix the SEED JSON to", file=sys.stderr)
    print("match the document — never the other way around.", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
