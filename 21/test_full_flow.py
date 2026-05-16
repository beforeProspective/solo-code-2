import requests
import os

BASE_URL = "http://localhost:8000"
FRONTEND_URL = "http://localhost:5173"

test_pdf_path = "test_contract.pdf"

if not os.path.exists(test_pdf_path):
    from reportlab.pdfgen import canvas
    c = canvas.Canvas(test_pdf_path)
    c.setFont("Helvetica", 12)
    c.drawString(100, 750, "测试合同文档")
    c.drawString(100, 730, "这是一个用于测试电子签名平台的 PDF 文件")
    c.drawString(100, 710, "合同内容...")
    c.showPage()
    c.drawString(100, 750, "第二页")
    c.drawString(100, 730, "更多内容...")
    c.showPage()
    c.save()
    print(f"测试 PDF 已创建: {test_pdf_path}")

print("\n" + "="*50)
print("步骤 1: 上传合同")
print("="*50)
url = f"{BASE_URL}/api/contracts/upload"
files = {"file": open(test_pdf_path, "rb")}
data = {"title": "测试合同 - 完整流程"}
response = requests.post(url, files=files, data=data)
print(f"状态码: {response.status_code}")
contract = response.json()
print(f"合同 ID: {contract['id']}")
print(f"总页数: {contract['total_pages']}")
print(f"状态: {contract['status']}")
contract_id = contract['id']

print("\n" + "="*50)
print("步骤 2: 添加签署人和签名位置")
print("="*50)
url = f"{BASE_URL}/api/contracts/{contract_id}/signers"
data = {
    "signers": [
        {"name": "张三", "email": "zhangsan@example.com"}
    ],
    "positions": [
        {"page": 1, "x": 200, "y": 300, "width": 200, "height": 80}
    ]
}
response = requests.post(url, json=data)
print(f"状态码: {response.status_code}")
contract = response.json()
print(f"签署人数量: {len(contract['signers'])}")
print(f"签名位置数量: {len(contract['signature_positions'])}")
print(f"签署人: {contract['signers'][0]['name']}")
sign_token = contract['signers'][0]['sign_token']
print(f"签署令牌: {sign_token}")

print("\n" + "="*50)
print("步骤 3: 获取签署链接")
print("="*50)
sign_url = f"{FRONTEND_URL}/sign/{sign_token}"
print(f"签署链接: {sign_url}")

print("\n" + "="*50)
print("步骤 4: 验证签署页面 API")
print("="*50)
url = f"{BASE_URL}/api/sign/{sign_token}"
response = requests.get(url)
print(f"状态码: {response.status_code}")
sign_info = response.json()
print(f"合同标题: {sign_info['contract_title']}")
print(f"签署人: {sign_info['signer_name']}")
print(f"签署位置: {sign_info['positions']}")

print("\n" + "="*50)
print("步骤 5: 模拟签署（提交签名）")
print("="*50)
from PIL import Image, ImageDraw
import io
import base64

img = Image.new('RGBA', (300, 100), (255, 255, 255, 0))
draw = ImageDraw.Draw(img)
draw.line([(10, 50), (290, 50)], fill=(0, 0, 0, 255), width=3)
draw.line([(10, 30), (10, 70)], fill=(0, 0, 0, 255), width=3)
draw.line([(290, 30), (290, 70)], fill=(0, 0, 0, 255), width=3)

buffer = io.BytesIO()
img.save(buffer, format='PNG')
signature_data = "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode()

url = f"{BASE_URL}/api/sign/{sign_token}"
response = requests.post(url, json={"signature_data": signature_data})
print(f"状态码: {response.status_code}")
print(f"结果: {response.json()}")

print("\n" + "="*50)
print("步骤 6: 验证合同已签署")
print("="*50)
url = f"{BASE_URL}/api/contracts/{contract_id}"
response = requests.get(url)
contract = response.json()
print(f"合同状态: {contract['status']}")
print(f"签署人状态: {contract['signers'][0]['signed']}")
print(f"签署时间: {contract['signers'][0]['signed_at']}")

print("\n" + "="*50)
print("步骤 7: 下载已签署合同")
print("="*50)
url = f"{BASE_URL}/api/contracts/{contract_id}/download"
response = requests.get(url)
print(f"状态码: {response.status_code}")
print(f"文件大小: {len(response.content)} bytes")

output_path = "signed_test_contract.pdf"
with open(output_path, "wb") as f:
    f.write(response.content)
print(f"已保存到: {output_path}")

print("\n" + "="*50)
print("✅ 所有测试通过！")
print("="*50)
print(f"前端地址: {FRONTEND_URL}")
print(f"合同列表: {FRONTEND_URL}/contracts")
print(f"合同详情: {FRONTEND_URL}/contracts/{contract_id}")
print(f"签署链接: {sign_url}")
