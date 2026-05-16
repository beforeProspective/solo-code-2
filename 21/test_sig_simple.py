import os
import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))

from reportlab.pdfgen import canvas as rl_canvas
from app.services.signature_service import SignatureService
from PIL import Image, ImageDraw

test_pdf = "simple_test.pdf"
c = rl_canvas.Canvas(test_pdf)
c.setFont("Helvetica", 14)
c.drawString(100, 700, "=== 测试合同 ===")
c.drawString(100, 680, "这是一个简单的测试文档")
c.drawString(100, 660, "签名应该出现在下方:")
c.save()
print(f"1. 创建测试 PDF: {test_pdf}")

img = Image.new('RGBA', (200, 80), (255, 255, 255, 0))
draw = ImageDraw.Draw(img)
draw.line([(10, 40), (190, 40)], fill=(255, 0, 0), width=4)
draw.line([(10, 10), (10, 70)], fill=(0, 255, 0), width=4)
draw.rectangle([0, 0, 199, 79], outline=(0, 0, 255), width=2)
sig_path = "simple_sig.png"
img.save(sig_path)
print(f"2. 创建签名图片: {sig_path}")

output = "simple_signed.pdf"
positions = [{"page": 1, "x": 100, "y": 500, "width": 200, "height": 80}]
print(f"3. 合成签名到 PDF，位置: {positions}")
result = SignatureService.apply_signature_to_pdf(test_pdf, sig_path, positions, output)
print(f"4. 结果: {result}")
print(f"5. 文件存在: {os.path.exists(output)}")
if os.path.exists(output):
    size = os.path.getsize(output)
    print(f"6. 文件大小: {size} bytes")
    original_size = os.path.getsize(test_pdf)
    print(f"7. 原始大小: {original_size} bytes")
    if size > original_size:
        print("✅ 签名已合成！文件变大说明内容增加了")
    else:
        print("❌ 签名可能未合成")
