import os
import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))

from reportlab.pdfgen import canvas as rl_canvas
from PIL import Image, ImageDraw
import io
import base64

test_pdf = "complete_test.pdf"
c = rl_canvas.Canvas(test_pdf)
c.setFont("Helvetica", 14)
c.drawString(100, 700, "=== 完整流程测试合同 ===")
c.drawString(100, 680, "测试签名合成功能")
c.drawString(100, 660, "签名应该出现在页面中下部")
c.save()
print(f"1. 创建测试 PDF: {test_pdf}")

img = Image.new('RGBA', (400, 150), (255, 255, 255, 0))
draw = ImageDraw.Draw(img)
draw.line([(20, 75), (380, 75)], fill=(255, 0, 0, 255), width=5)
draw.line([(20, 20), (20, 130)], fill=(0, 255, 0, 255), width=5)
draw.line([(380, 20), (380, 130)], fill=(0, 0, 255, 255), width=5)
draw.text((50, 50), "张三的签名", fill=(0, 0, 0, 255))

buffer = io.BytesIO()
img.save(buffer, format='PNG')
signature_data = "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode()
print(f"2. 创建签名数据 (base64 长度: {len(signature_data)})")

from app.services.signature_service import SignatureService

sig_bytes = SignatureService.decode_signature(signature_data)
sig_path = SignatureService.save_signature_image(sig_bytes)
print(f"3. 保存签名图片: {sig_path}")

positions = [{"page": 1, "x": 100, "y": 300, "width": 250, "height": 100}]
output_pdf = "complete_test_signed.pdf"
result = SignatureService.apply_signature_to_pdf(test_pdf, sig_path, positions, output_pdf)
print(f"4. 签名合成结果: {result}")

original_size = os.path.getsize(test_pdf)
signed_size = os.path.getsize(output_pdf)
print(f"5. 原始 PDF 大小: {original_size} bytes")
print(f"6. 已签 PDF 大小: {signed_size} bytes")
if signed_size > original_size:
    print("✅ 签名已合成到 PDF 中！")
    print(f"请打开 {output_pdf} 查看效果")
else:
    print("❌ 签名可能未正确合成")

print("\n" + "="*60)
print("测试完成！")
print("="*60)
