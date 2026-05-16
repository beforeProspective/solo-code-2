import requests
import os

BASE_URL = "http://localhost:8000"

print("获取合同列表...")
response = requests.get(f"{BASE_URL}/api/contracts")
contracts = response.json()
print(f"共 {len(contracts)} 个合同")

for c in contracts:
    print(f"  ID={c['id']}, 标题={c['title']}, 状态={c['status']}")

if len(contracts) == 0:
    print("\n没有合同，退出")
    exit()

latest = contracts[0]
contract_id = latest['id']
print(f"\n使用最新合同 ID={contract_id}")

if latest['status'] != 'signed':
    print(f"合同状态是 {latest['status']}，不是 signed，跳过下载")
    exit()

print(f"\n尝试下载已签署合同...")
response = requests.get(f"{BASE_URL}/api/contracts/{contract_id}/download")
print(f"状态码: {response.status_code}")
if response.status_code == 200:
    size = len(response.content)
    print(f"文件大小: {size} bytes")
    with open(f"test_downloaded_{contract_id}.pdf", "wb") as f:
        f.write(response.content)
    print(f"已保存到 test_downloaded_{contract_id}.pdf")
else:
    print(f"错误: {response.text}")
