import os
import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))

from reportlab.pdfgen import canvas as rl_canvas
from pypdf import PdfReader
from PIL import Image, ImageDraw
import io

test_pdf = "test_sig_issue.pdf"
c = rl_canvas.Canvas(test_pdf)
c.setFont("Helvetica", 14)
c.drawString(100, 700, "=== 测试合同 ===")
c.drawString(100, 680, "测试签名合成")
c.save()

reader = PdfReader(test_pdf)
page = reader.pages[0]
page_width = float(page.mediabox.width)
page_height = float(page.mediabox.height)
print(f"PDF 页面尺寸: {page_width} x {page_height}")

img = Image.new('RGBA', (200, 80), (255, 255, 255, 0))
draw = ImageDraw.Draw(img)
draw.line([(10, 40), (190, 40)], fill=(255, 0, 0), width=4)
draw.text((20, 20), "SIGNATURE", fill=(0, 0, 255))
sig_path = "debug_sig.png"
img.save(sig_path)
print(f"签名图片尺寸: {img.size}")

from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader

print("\n--- 测试 1: 使用 reportlab 直接绘制 ---")
x, y, width, height = 100, 500, 200, 80
pdf_y = page_height - y - height
print(f"位置: x={x}, y={y}, width={width}, height={height}")
print(f"转换后的 PDF y 坐标: {page_height} - {y} - {height} = {pdf_y}")

packet = io.BytesIO()
c = canvas.Canvas(packet, pagesize=(page_width, page_height))
sig_img = Image.open(sig_path).convert("RGBA")
c.drawImage(ImageReader(sig_img), x, pdf_y, width=width, height=height, mask='auto')
c.save()
packet.seek(0)

from pypdf import PdfReader as PdfReader2, PdfWriter
reader = PdfReader2(test_pdf)
writer = PdfWriter()
page = reader.pages[0]
overlay = PdfReader2(packet)
page.merge_page(overlay.pages[0])
writer.add_page(page)

output = "test_sig_issue_signed.pdf"
with open(output, "wb") as f:
    writer.write(f)

print(f"已保存到: {output}")
print(f"原始大小: {os.path.getsize(test_pdf)} bytes")
print(f"合成后大小: {os.path.getsize(output)} bytes")

reader_final = PdfReader2(output)
print(f"最终 PDF 页数: {len(reader_final.pages)}")
print("\n✅ 测试完成！请打开 test_sig_issue_signed.pdf 查看是否有红色线条和蓝色文字")
