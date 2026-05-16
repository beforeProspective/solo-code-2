import requests
import os

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

url = "http://localhost:8000/api/contracts/upload"
files = {"file": open(test_pdf_path, "rb")}
data = {"title": "测试合同"}

try:
    response = requests.post(url, files=files, data=data)
    print(f"状态码: {response.status_code}")
    print(f"响应内容: {response.text}")
except Exception as e:
    print(f"请求失败: {e}")
