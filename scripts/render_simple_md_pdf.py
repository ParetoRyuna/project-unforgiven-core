#!/usr/bin/env python3
from __future__ import annotations

import re
import sys
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer


def esc(text: str) -> str:
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


def add_footer(canvas, doc):
    canvas.saveState()
    canvas.setFont("Helvetica", 9)
    canvas.setFillColor(colors.HexColor("#8A8F98"))
    footer = f"{doc.page}"
    canvas.drawRightString(doc.pagesize[0] - 18 * mm, 10 * mm, footer)
    canvas.restoreState()


def parse_markdown(lines: list[str], styles: dict[str, ParagraphStyle]):
    story = []
    para_buf: list[str] = []
    title_used = False

    def flush_paragraph():
        nonlocal para_buf
        if not para_buf:
            return
        text = " ".join(s.strip() for s in para_buf if s.strip())
        text = esc(text)
        if text:
            story.append(Paragraph(text, styles["body"]))
            story.append(Spacer(1, 3.5 * mm))
        para_buf = []

    total = len(lines)
    for idx, raw in enumerate(lines):
        line = raw.rstrip("\n")
        stripped = line.strip()

        if not stripped:
            flush_paragraph()
            continue

        if stripped == "---":
            flush_paragraph()
            story.append(Spacer(1, 2 * mm))
            story.append(Paragraph("• • •", styles["sep"]))
            story.append(Spacer(1, 2.5 * mm))
            continue

        if stripped.startswith("# "):
            flush_paragraph()
            story.append(Paragraph(esc(stripped[2:]), styles["h1"]))
            story.append(Spacer(1, 3 * mm))
            continue

        if stripped.startswith("## "):
            flush_paragraph()
            story.append(Paragraph(esc(stripped[3:]), styles["h2"]))
            story.append(Spacer(1, 2.5 * mm))
            continue

        if stripped.startswith("### "):
            flush_paragraph()
            story.append(Paragraph(esc(stripped[4:]), styles["h3"]))
            story.append(Spacer(1, 2 * mm))
            continue

        # External doc format: first non-empty line is title
        if not title_used:
            flush_paragraph()
            story.append(Paragraph(esc(stripped), styles["h1"]))
            story.append(Spacer(1, 3 * mm))
            title_used = True
            continue

        # External doc format: numeric headings like "1. xxx" / "2.1 xxx"
        if re.match(r"^\d+\.\d+\s+", stripped):
            flush_paragraph()
            story.append(Paragraph(esc(stripped), styles["h3"]))
            story.append(Spacer(1, 2 * mm))
            continue

        if re.match(r"^\d+\.\s+", stripped):
            flush_paragraph()
            story.append(Paragraph(esc(stripped), styles["h2"]))
            story.append(Spacer(1, 2.5 * mm))
            continue

        # Section labels like "A. xxx"
        if re.match(r"^[A-Z]\.\s+", stripped):
            flush_paragraph()
            story.append(Paragraph(esc(stripped), styles["h3"]))
            story.append(Spacer(1, 2 * mm))
            continue

        if stripped.startswith("> "):
            flush_paragraph()
            note = esc(stripped[2:])
            story.append(Paragraph(note, styles["note"]))
            story.append(Spacer(1, 2.5 * mm))
            continue

        if re.match(r"^\d+\.\s+", stripped):
            flush_paragraph()
            num, body = stripped.split(".", 1)
            bullet = f"<b>{esc(num)}.</b> {esc(body.strip())}"
            story.append(Paragraph(bullet, styles["bullet"]))
            story.append(Spacer(1, 1.8 * mm))
            continue

        # Common Chinese list numbering "1）xxx"
        if re.match(r"^\d+）", stripped):
            flush_paragraph()
            story.append(Paragraph(esc(stripped), styles["bullet"]))
            story.append(Spacer(1, 1.5 * mm))
            continue

        if stripped.startswith("- "):
            flush_paragraph()
            body = stripped[2:].strip()
            story.append(Paragraph(f"• {esc(body)}", styles["bullet"]))
            story.append(Spacer(1, 1.5 * mm))
            continue

        para_buf.append(stripped)

    flush_paragraph()
    return story


def build_styles():
    font_name = "STSong-Light"
    # Prefer a system TTF/TTC font for better mixed CJK+Latin spacing.
    for candidate in [
        "/System/Library/Fonts/STHeiti Medium.ttc",
        "/System/Library/Fonts/STHeiti Light.ttc",
    ]:
        try:
            pdfmetrics.registerFont(TTFont("DocCJK", candidate))
            font_name = "DocCJK"
            break
        except Exception:
            continue
    if font_name == "STSong-Light":
        pdfmetrics.registerFont(UnicodeCIDFont("STSong-Light"))
    base = getSampleStyleSheet()

    styles = {
        "h1": ParagraphStyle(
            "H1",
            parent=base["Heading1"],
            fontName=font_name,
            fontSize=21,
            leading=26,
            alignment=TA_CENTER,
            textColor=colors.HexColor("#111111"),
            spaceAfter=5,
        ),
        "h2": ParagraphStyle(
            "H2",
            parent=base["Heading2"],
            fontName=font_name,
            fontSize=12.2,
            leading=16.5,
            textColor=colors.HexColor("#C85E1B"),
            spaceBefore=2,
        ),
        "h3": ParagraphStyle(
            "H3",
            parent=base["Heading3"],
            fontName=font_name,
            fontSize=11,
            leading=14.5,
            textColor=colors.HexColor("#222222"),
        ),
        "body": ParagraphStyle(
            "Body",
            parent=base["BodyText"],
            fontName=font_name,
            fontSize=10.7,
            leading=15.8,
            textColor=colors.HexColor("#222222"),
        ),
        "bullet": ParagraphStyle(
            "Bullet",
            parent=base["BodyText"],
            fontName=font_name,
            fontSize=10.4,
            leading=15,
            leftIndent=3 * mm,
            firstLineIndent=0,
            textColor=colors.HexColor("#222222"),
        ),
        "note": ParagraphStyle(
            "Note",
            parent=base["BodyText"],
            fontName=font_name,
            fontSize=9.9,
            leading=14.2,
            alignment=TA_CENTER,
            leftIndent=8 * mm,
            rightIndent=8 * mm,
            textColor=colors.HexColor("#5D4A3A"),
            backColor=colors.HexColor("#F7EFE8"),
            borderPadding=6,
            borderRadius=4,
        ),
        "sep": ParagraphStyle(
            "Sep",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=10,
            alignment=TA_CENTER,
            textColor=colors.HexColor("#999999"),
        ),
    }
    return styles


def main():
    if len(sys.argv) != 3:
        print("Usage: render_simple_md_pdf.py <input.md> <output.pdf>")
        sys.exit(1)

    in_path = Path(sys.argv[1])
    out_path = Path(sys.argv[2])
    if not in_path.exists():
        print(f"Input not found: {in_path}")
        sys.exit(1)

    styles = build_styles()
    lines = in_path.read_text(encoding="utf-8").splitlines()
    story = parse_markdown(lines, styles)
    doc_title = in_path.stem
    for raw in lines:
        stripped = raw.strip()
        if not stripped:
            continue
        if stripped.startswith("# "):
            doc_title = stripped[2:].strip()
        else:
            doc_title = stripped
        break

    out_path.parent.mkdir(parents=True, exist_ok=True)
    doc = SimpleDocTemplate(
        str(out_path),
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=16 * mm,
        bottomMargin=16 * mm,
        title=doc_title,
        author="Codex",
    )
    doc.build(story, onFirstPage=add_footer, onLaterPages=add_footer)
    print(f"Wrote {out_path}")


if __name__ == "__main__":
    main()
