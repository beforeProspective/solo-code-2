import requests
import os

BASE_URL = "http://localhost:8000"

test_pdf_path = "test_contract.pdf"

if not os.path.exists(test_pdf_path):
    from reportlab.pdfgen import canvas
    c = canvas.Canvas(test_pdf_path)
    c.setFont("Helvetica", 12)
    c.drawString(100, 750, "测试合同文档")
    c.drawString(100, 730, "这是一个用于测试电子签名平台的 PDF 文件")
    c.showPage()
    c.save()

print("步骤 1: 上传合同")
url = f"{BASE_URL}/api/contracts/upload"
files = {"file": open(test_pdf_path, "rb")}
data = {"title": "下载测试合同"}
response = requests.post(url, files=files, data=data)
print(f"状态码: {response.status_code}")
contract = response.json()
contract_id = contract['id']
print(f"合同 ID: {contract_id}")

print("\n步骤 2: 添加签署人和签名位置")
url = f"{BASE_URL}/api/contracts/{contract_id}/signers"
data = {
    "signers": [{"name": "测试人", "email": "test@example.com"}],
    "positions": [{"page": 1, "x": 200, "y": 400, "width": 200, "height": 80}]
}
response = requests.post(url, json=data)
print(f"状态码: {response.status_code}")
contract = response.json()
sign_token = contract['signers'][0]['sign_token']
print(f"签署令牌: {sign_token}")
print(f"签名位置: {contract['signature_positions']}")

print("\n步骤 3: 提交签名")
from PIL import Image, ImageDraw
import io
import base64

img = Image.new('RGBA', (300, 100), (255, 255, 255, 0))
draw = ImageDraw.Draw(img)
draw.line([(10, 50), (290, 50)], fill=(255, 0, 0, 255), width=5)
draw.line([(10, 10), (10, 90)], fill=(0, 255, 0, 255), width=5)
draw.text((50, 30), "测试签名", fill=(0, 0, 255, 255))

buffer = io.BytesIO()
img.save(buffer, format='PNG')
signature_data = "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode()

url = f"{BASE_URL}/api/sign/{sign_token}"
response = requests.post(url, json={"signature_data": signature_data})
print(f"状态码: {response.status_code}")
print(f"结果: {response.json()}")

print("\n步骤 4: 验证合同状态")
url = f"{BASE_URL}/api/contracts/{contract_id}"
response = requests.get(url)
contract = response.json()
print(f"合同状态: {contract['status']}")
print(f"签署人: {contract['signers'][0]['name']} - 已签署: {contract['signers'][0]['signed']}")
print(f"签名图片路径: {contract['signers'][0]['signature_image_path']}")
print(f"签名位置: {contract['signature_positions']}")

print("\n步骤 5: 下载已签署合同")
url = f"{BASE_URL}/api/contracts/{contract_id}/download"
response = requests.get(url)
print(f"状态码: {response.status_code}")
print(f"文件大小: {len(response.content)} bytes")

output_path = "downloaded_signed.pdf"
with open(output_path, "wb") as f:
    f.write(response.content)
print(f"已保存到: {output_path}")

original_size = os.path.getsize(test_pdf_path)
downloaded_size = len(response.content)
print(f"\n原始 PDF 大小: {original_size} bytes")
print(f"下载 PDF 大小: {downloaded_size} bytes")
if downloaded_size > original_size:
    print("✅ 下载的 PDF 更大，说明签名已合成！")
else:
    print("❌ 下载的 PDF 大小没有变化")
