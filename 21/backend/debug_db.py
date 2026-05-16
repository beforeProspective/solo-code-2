import os
import sys

from app.core.database import SessionLocal
from app.models import Contract, Signer, SignaturePosition

db = SessionLocal()

print("="*60)
print("数据库内容调试")
print("="*60)

contracts = db.query(Contract).all()
print(f"\n合同数量: {len(contracts)}")

for contract in contracts:
    print(f"\n{'='*40}")
    print(f"合同 ID: {contract.id}")
    print(f"标题: {contract.title}")
    print(f"状态: {contract.status}")
    print(f"文件路径: {contract.file_path}")
    print(f"总页数: {contract.total_pages}")
    
    print(f"\n签署人列表 ({len(contract.signers)} 人):")
    for signer in contract.signers:
        print(f"  - ID={signer.id}, 姓名={signer.name}, 邮箱={signer.email}")
        print(f"    已签署={signer.signed}, 签署时间={signer.signed_at}")
        print(f"    签名图片路径={signer.signature_image_path}")
        print(f"    令牌={signer.sign_token}")
    
    print(f"\n签名位置列表 ({len(contract.signature_positions)} 个):")
    for pos in contract.signature_positions:
        print(f"  - ID={pos.id}, 签署人ID={pos.signer_id}")
        print(f"    页码={pos.page}, 位置=({pos.x}, {pos.y}), 尺寸=({pos.width}x{pos.height})")

db.close()
print("\n" + "="*60)
