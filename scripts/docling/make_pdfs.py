"""
Generates the four source policy documents as PDFs.

These are the SOURCE OF TRUTH the policy library cites back to. In a real
deployment these would be the organisation's existing policy documents; here we
author them once, as realistic corporate policies, so that Docling has genuine
PDFs to parse and every citation in data/seed/*.json traces to a real sentence
in a real document.

Run once:  python scripts/docling/make_pdfs.py
"""
from pathlib import Path

from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer

OUT = Path("data/policies")

# Each document: (filename, title, subtitle, [(section, heading, body), ...])
DOCUMENTS = [
    (
        "finance-approval-matrix.pdf",
        "Finance Approval Matrix",
        "Version 2.1 — Effective 1 January 2026",
        [
            (
                "s2.1",
                "Expenditure Approval — Standard Threshold",
                "Expenditures exceeding GBP 10,000 require Finance Director approval. "
                "This applies to all purchase categories and cannot be waived by "
                "departmental managers.",
            ),
            (
                "s2.2",
                "Expenditure Approval — Elevated Threshold",
                "Expenditures exceeding GBP 50,000 require CFO approval, in addition "
                "to the Finance Director sign-off required under s2.1.",
            ),
        ],
    ),
    (
        "approved-vendor-list.pdf",
        "Approved Vendor List",
        "2026 Q2 — IT Equipment Suppliers",
        [
            ("AVL-1", "Dell", "Dell is an approved supplier for IT equipment with established contract terms."),
            ("AVL-2", "HP", "HP is an approved supplier for IT equipment with established contract terms."),
            ("AVL-3", "Lenovo", "Lenovo is an approved supplier for IT equipment with established contract terms."),
            ("AVL-4", "Apple", "Apple is an approved supplier for IT equipment with established contract terms."),
        ],
    ),
    (
        "procurement-policy.pdf",
        "Corporate Procurement Policy",
        "Version 3.0 — Effective 1 January 2026",
        [
            (
                "s1.1",
                "Approved Vendors Only",
                "All purchases must be made from approved vendors listed in the Approved Vendor List.",
            ),
            (
                "s1.3",
                "Security Compliance",
                "All IT equipment purchases must comply with corporate security standards.",
            ),
        ],
    ),
    (
        "security-requirements.pdf",
        "Corporate Security Standards",
        "Version 4.2 — Effective 1 January 2026",
        [
            (
                "s3.1",
                "Encryption and Boot Integrity",
                "All IT equipment must support full-disk encryption and secure boot.",
            ),
            (
                "s3.2",
                "Laptop Hardware Requirements",
                "All laptops must include TPM 2.0 chip and biometric authentication.",
            ),
            (
                "s3.5",
                "Asset Logging",
                "All equipment purchases must be logged in the asset management system within 24 hours.",
            ),
        ],
    ),
]


def build() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle("T", parent=styles["Title"], fontSize=20)
    sub_style = ParagraphStyle("Sub", parent=styles["Normal"], fontSize=11, textColor="#555555")
    sec_style = ParagraphStyle("Sec", parent=styles["Heading2"], fontSize=13)

    for filename, title, subtitle, sections in DOCUMENTS:
        path = OUT / filename
        doc = SimpleDocTemplate(str(path), pagesize=LETTER, topMargin=inch, bottomMargin=inch)
        flow = [Paragraph(title, title_style), Paragraph(subtitle, sub_style), Spacer(1, 0.3 * inch)]

        for section, heading, body in sections:
            flow.append(Paragraph(f"{section} &nbsp; {heading}", sec_style))
            flow.append(Paragraph(body, styles["BodyText"]))
            flow.append(Spacer(1, 0.18 * inch))

        doc.build(flow)
        print(f"  wrote {path}")

    print(f"\n{len(DOCUMENTS)} policy PDFs written to {OUT}/")


if __name__ == "__main__":
    build()
