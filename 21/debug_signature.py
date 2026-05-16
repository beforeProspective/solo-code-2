import os
import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))

from app.services.signature_service import SignatureService
from app.services.pdf_service import PDFService
from PIL import Image, ImageDraw
import io
import base64

test_pdf_path = "test_contract.pdf"
if not os.path.exists(test_pdf_path):
    from reportlab.pdfgen import canvas as rl_canvas
    c = rl_canvas.Canvas(test_pdf_path)
    c.setFont("Helvetica", 12)
    c.drawString(100, 750, "测试合同文档")
    c.drawString(100, 730, "这是一个用于测试电子签名平台的 PDF 文件")
    c.drawString(100, 710, "合同内容...")
    c.showPage()
    c.save()
    print(f"测试 PDF 已创建: {test_pdf_path}")

print("\n" + "="*60)
print("检查 PDF 信息")
print("="*60)
total_pages = PDFService.get_total_pages(test_pdf_path)
print(f"总页数: {total_pages}")
page_size = PDFService.get_page_size(test_pdf_path, 0)
print(f"页面尺寸: {page_size}")

print("\n" + "="*60)
print("创建测试签名图片")
print("="*60)
img = Image.new('RGBA', (400, 150), (255, 255, 255, 0))
draw = ImageDraw.Draw(img)
draw.line([(20, 75), (380, 75)], fill=(255, 0, 0, 255), width=5)
draw.line([(20, 20), (20, 130)], fill=(0, 255, 0, 255), width=5)
draw.line([(380, 20), (380, 130)], fill=(0, 0, 255, 255), width=5)
draw.text((50, 50), "测试签名", fill=(0, 0, 0, 255))

sig_path = "test_signature.png"
img.save(sig_path)
print(f"签名图片已保存: {sig_path}")
print(f"签名图片尺寸: {img.size}")

print("\n" + "="*60)
print("测试签名合成")
print("="*60)

page_width, page_height = page_size
print(f"PDF 页面尺寸: 宽={page_width}, 高={page_height}")

test_positions = [
    {"page": 1, "x": 100, "y": 100, "width": 200, "height": 80},
]

print(f"测试位置: {test_positions}")
print(f"计算后的 PDF y 坐标: {page_height} - {test_positions[0]['y']} - {test_positions[0]['height']} = {page_height - test_positions[0]['y'] - test_positions[0]['height']}")

output_path = "debug_signed.pdf"
result = SignatureService.apply_signature_to_pdf(
    test_pdf_path,
    sig_path,
    test_positions,
    output_path
)
print(f"合成结果: {result}")
print(f"输出文件存在: {os.path.exists(output_path)}")
if os.path.exists(output_path):
    print(f"输出文件大小: {os.path.getsize(output_path)} bytes")

print("\n" + "="*60)
print("测试多签名合成")
print("="*60)

sig2 = Image.new('RGBA', (300, 100), (255, 255, 255, 0))
draw2 = ImageDraw.Draw(sig2)
draw2.text((50, 30), "签名2", fill=(0, 0, 255, 255))
sig2_path = "test_signature2.png"
sig2.save(sig2_path)

output_path2 = "debug_signed_multi.pdf"
result2 = SignatureService.apply_multiple_signatures(
    test_pdf_path,
    [
        {"image_path": sig_path, "positions": [{"page": 1, "x": 100, "y": 100, "width": 200, "height": 80}]},
        {"image_path": sig2_path, "positions": [{"page": 1, "x": 100, "y": 300, "width": 200, "height": 80}]},
    ],
    output_path2
)
print(f"多签名合成结果: {result2}")
print(f"输出文件存在: {os.path.exists(output_path2)}")
if os.path.exists(output_path2):
    print(f"输出文件大小: {os.path.getsize(output_path2)} bytes")

print("\n" + "="*60)
print("✅ 调试完成")
print("="*60)
