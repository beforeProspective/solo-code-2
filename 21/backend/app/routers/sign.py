from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.orm import Session
from datetime import datetime
import io
from app.core.database import get_db
from app.services import ContractService, SignatureService, PDFService
from app.schemas import SignRequest

router = APIRouter()

@router.get("/{token}")
def get_sign_info(token: str, db: Session = Depends(get_db)):
    signer = ContractService.get_signer_by_token(db, token)
    if not signer:
        raise HTTPException(status_code=404, detail="签署链接无效")
    
    if signer.signed:
        raise HTTPException(status_code=400, detail="该合同已完成签署")
    
    if signer.expires_at < datetime.utcnow():
        raise HTTPException(status_code=400, detail="签署链接已过期")
    
    contract = signer.contract
    positions = [
        pos for pos in contract.signature_positions
        if pos.signer_id == signer.id
    ]
    
    return {
        "contract_id": contract.id,
        "contract_title": contract.title,
        "signer_name": signer.name,
        "signer_email": signer.email,
        "total_pages": contract.total_pages,
        "positions": positions,
        "expires_at": signer.expires_at
    }

@router.get("/{token}/preview")
def preview_contract_for_sign(token: str, db: Session = Depends(get_db)):
    signer = ContractService.get_signer_by_token(db, token)
    if not signer:
        raise HTTPException(status_code=404, detail="签署链接无效")
    
    contract = signer.contract
    return FileResponse(
        contract.file_path,
        media_type="application/pdf",
        filename=contract.original_filename
    )

@router.get("/{token}/page/{page_num}")
def get_contract_page_for_sign(
    token: str,
    page_num: int,
    db: Session = Depends(get_db)
):
    signer = ContractService.get_signer_by_token(db, token)
    if not signer:
        raise HTTPException(status_code=404, detail="签署链接无效")
    
    contract = signer.contract
    if page_num < 1 or page_num > contract.total_pages:
        raise HTTPException(status_code=400, detail="页码无效")
    
    img_bytes = PDFService.render_page_to_image(contract.file_path, page_num)
    
    return StreamingResponse(
        io.BytesIO(img_bytes),
        media_type="image/png"
    )

@router.post("/{token}")
def sign_contract(
    token: str,
    request: SignRequest,
    db: Session = Depends(get_db)
):
    signer = ContractService.get_signer_by_token(db, token)
    if not signer:
        raise HTTPException(status_code=404, detail="签署链接无效")
    
    if signer.signed:
        raise HTTPException(status_code=400, detail="该合同已完成签署")
    
    if signer.expires_at < datetime.utcnow():
        raise HTTPException(status_code=400, detail="签署链接已过期")
    
    try:
        signature_bytes = SignatureService.decode_signature(request.signature_data)
    except Exception as e:
        raise HTTPException(status_code=400, detail="签名数据格式无效")
    
    signature_image_path = SignatureService.save_signature_image(signature_bytes)
    
    ContractService.mark_signed(db, signer, signature_image_path)
    
    return {
        "status": "success",
        "message": "签署成功",
        "signed_at": signer.signed_at
    }
