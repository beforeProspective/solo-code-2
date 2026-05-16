from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.orm import Session
from typing import List
import io
from app.core.database import get_db
from app.services import ContractService, PDFService
from app.schemas import (
    ContractResponse,
    ContractListResponse,
    AddSignersRequest,
    SignerResponse,
)

router = APIRouter()

@router.post("/upload", response_model=ContractResponse)
async def upload_contract(
    title: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="只支持 PDF 文件")
    
    file_content = await file.read()
    stored_filename, file_path = PDFService.save_uploaded_file(
        file_content, file.filename
    )
    
    total_pages = PDFService.get_total_pages(file_path)
    
    contract = ContractService.create_contract(
        db=db,
        title=title,
        original_filename=file.filename,
        stored_filename=stored_filename,
        file_path=file_path,
        total_pages=total_pages
    )
    
    return contract

@router.get("", response_model=List[ContractListResponse])
def list_contracts(db: Session = Depends(get_db)):
    contracts = ContractService.get_all_contracts(db)
    return contracts

@router.get("/{contract_id}", response_model=ContractResponse)
def get_contract(contract_id: int, db: Session = Depends(get_db)):
    contract = ContractService.get_contract(db, contract_id)
    if not contract:
        raise HTTPException(status_code=404, detail="合同不存在")
    return contract

@router.get("/{contract_id}/preview")
def preview_contract(contract_id: int, db: Session = Depends(get_db)):
    contract = ContractService.get_contract(db, contract_id)
    if not contract:
        raise HTTPException(status_code=404, detail="合同不存在")
    
    return FileResponse(
        contract.file_path,
        media_type="application/pdf",
        filename=contract.original_filename
    )

@router.get("/{contract_id}/page/{page_num}")
def get_contract_page(
    contract_id: int,
    page_num: int,
    db: Session = Depends(get_db)
):
    contract = ContractService.get_contract(db, contract_id)
    if not contract:
        raise HTTPException(status_code=404, detail="合同不存在")
    
    if page_num < 1 or page_num > contract.total_pages:
        raise HTTPException(status_code=400, detail="页码无效")
    
    img_bytes = PDFService.render_page_to_image(contract.file_path, page_num)
    
    return StreamingResponse(
        io.BytesIO(img_bytes),
        media_type="image/png"
    )

@router.post("/{contract_id}/signers", response_model=ContractResponse)
def add_signers(
    contract_id: int,
    request: AddSignersRequest,
    db: Session = Depends(get_db)
):
    contract = ContractService.get_contract(db, contract_id)
    if not contract:
        raise HTTPException(status_code=404, detail="合同不存在")
    
    if len(request.signers) != len(request.positions):
        raise HTTPException(
            status_code=400,
            detail="签署人数量必须与签名位置数量一致"
        )
    
    contract = ContractService.add_signers(
        db, contract, request.signers, request.positions
    )
    
    return contract

@router.get("/{contract_id}/signers", response_model=List[SignerResponse])
def get_contract_signers(contract_id: int, db: Session = Depends(get_db)):
    contract = ContractService.get_contract(db, contract_id)
    if not contract:
        raise HTTPException(status_code=404, detail="合同不存在")
    return contract.signers

@router.get("/{contract_id}/download")
def download_signed_contract(contract_id: int, db: Session = Depends(get_db)):
    contract = ContractService.get_contract(db, contract_id)
    if not contract:
        raise HTTPException(status_code=404, detail="合同不存在")
    
    if contract.status != "signed":
        raise HTTPException(status_code=400, detail="合同尚未完成签署")
    
    final_pdf_path = ContractService.get_final_signed_pdf(db, contract_id)
    if not final_pdf_path:
        raise HTTPException(status_code=500, detail="生成已签署合同失败")
    
    download_name = f"signed_{contract.original_filename}"
    
    return FileResponse(
        final_pdf_path,
        media_type="application/pdf",
        filename=download_name
    )
