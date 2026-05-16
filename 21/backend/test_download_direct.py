import sys
import os

sys.path.insert(0, os.path.dirname(__file__))

from app.core.database import SessionLocal
from app.services import ContractService
from app.models import Contract

db = SessionLocal()

contract_id = 4
print(f"测试合同 ID={contract_id} 的下载功能")
print("="*60)

contract = db.query(Contract).filter(Contract.id == contract_id).first()
if not contract:
    print(f"合同 {contract_id} 不存在")
    exit()

print(f"合同标题: {contract.title}")
print(f"合同状态: {contract.status}")
print(f"原始文件: {contract.file_path}")
print(f"文件存在: {os.path.exists(contract.file_path)}")

print(f"\n签署人信息:")
for signer in contract.signers:
    print(f"  - {signer.name}: 已签署={signer.signed}")
    print(f"    签名图片: {signer.signature_image_path}")
    print(f"    图片存在: {os.path.exists(signer.signature_image_path) if signer.signature_image_path else 'N/A'}")

print(f"\n签名位置:")
for pos in contract.signature_positions:
    print(f"  - 页码={pos.page}, 位置=({pos.x}, {pos.y}), 尺寸=({pos.width}x{pos.height})")
    print(f"    签署人ID={pos.signer_id}")

if contract.status != "signed":
    print(f"\n❌ 合同状态不是 signed，无法下载")
    exit()

print(f"\n开始生成已签署 PDF...")
final_path = ContractService.get_final_signed_pdf(db, contract_id)
print(f"生成的文件路径: {final_path}")
print(f"文件存在: {os.path.exists(final_path) if final_path else False}")

if final_path and os.path.exists(final_path):
    original_size = os.path.getsize(contract.file_path)
    final_size = os.path.getsize(final_path)
    print(f"\n原始文件大小: {original_size} bytes")
    print(f"已签文件大小: {final_size} bytes")
    if final_size > original_size:
        print(f"✅ 文件变大了 {final_size - original_size} bytes，说明签名已合成！")
    else:
        print(f"❌ 文件大小没有变化")
    
    import shutil
    shutil.copy(final_path, f"../test_download_contract_{contract_id}.pdf")
    print(f"\n已复制到 ../test_download_contract_{contract_id}.pdf 供查看")

db.close()
