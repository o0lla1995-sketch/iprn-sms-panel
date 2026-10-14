#!/usr/bin/env python3
"""Stamp page numbers onto the report PDF.
Scheme (pagination.md): cover=hidden, TOC=roman i, body=arabic 1..N.
Position: bottom-center, 9pt, color #5a7a96. RTL document — digits are LTR-safe.
"""
import io
from pypdf import PdfReader, PdfWriter
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor

SRC = "/home/z/my-project/scripts/report_final.pdf"
DST = "/home/z/my-project/scripts/report_numbered.pdf"

reader = PdfReader(SRC)
writer = PdfWriter()
n = len(reader.pages)
W = float(reader.pages[0].mediabox.width)   # 540pt
H = float(reader.pages[0].mediabox.height)  # 765pt

for idx, page in enumerate(reader.pages):
    label = None
    if idx == 0:
        label = None            # cover — hidden
    elif idx == 1:
        label = "i"             # TOC — front matter roman
    else:
        label = str(idx - 1)    # body — arabic starting at 1
    if label:
        buf = io.BytesIO()
        c = canvas.Canvas(buf, pagesize=(W, H))
        c.setFont("Helvetica", 9)
        c.setFillColor(HexColor("#5a7a96"))
        c.drawCentredString(W / 2, 20, label)
        c.save()
        buf.seek(0)
        overlay = PdfReader(buf).pages[0]
        page.merge_page(overlay)
    writer.add_page(page)

# carry metadata forward
if reader.metadata:
    writer.add_metadata({k: v for k, v in reader.metadata.items() if isinstance(v, str)})

with open(DST, "wb") as f:
    writer.write(f)
print(f"stamped {n} pages -> {DST}")
