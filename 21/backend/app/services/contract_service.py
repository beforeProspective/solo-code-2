from sqlalchemy.orm import Session
from typing import List, Optional
from app.models import Contract, Signer, SignaturePosition
from app.schemas import SignerCreate, SignaturePositionCreate
import os
import uuid
from datetime import datetime

class ContractService:
    @staticmethod
    def create_contract(
        db: Session,
        title: str,
        original_filename: str,
        stored_filename: str,
        file_path: str,
        total_pages: int
    ) -> Contract:
        contract = Contract(
            title=title,
            original_filename=original_filename,
            stored_filename=stored_filename,
            file_path=file_path,
            total_pages=total_pages,
            status="draft"
        )
        db.add(contract)
        db.commit()
        db.refresh(contract)
        return contract

    @staticmethod
    def get_contract(db: Session, contract_id: int) -> Optional[Contract]:
        return db.query(Contract).filter(Contract.id == contract_id).first()

    @staticmethod
    def get_all_contracts(db: Session) -> List[Contract]:
        return db.query(Contract).order_by(Contract.created_at.desc()).all()

    @staticmethod
    def add_signers(
        db: Session,
        contract: Contract,
        signers_data: List[SignerCreate],
        positions_data: List[SignaturePositionCreate]
    ) -> Contract:
        for signer_data in signers_data:
            signer = Signer(
                contract_id=contract.id,
                name=signer_data.name,
                email=signer_data.email
            )
            db.add(signer)
        
        db.flush()
        
        signers = db.query(Signer).filter(Signer.contract_id == contract.id).all()
        
        scale = 2.0
        for i, pos_data in enumerate(positions_data):
            position = SignaturePosition(
                contract_id=contract.id,
                page=pos_data.page,
                x=pos_data.x / scale,
                y=pos_data.y / scale,
                width=pos_data.width / scale,
                height=pos_data.height / scale,
                signer_id=signers[i].id if i < len(signers) else None
            )
            db.add(position)
        
        contract.status = "pending"
        db.commit()
        db.refresh(contract)
        return contract

    @staticmethod
    def get_signer_by_token(db: Session, token: str) -> Optional[Signer]:
        return db.query(Signer).filter(Signer.sign_token == token).first()

    @staticmethod
    def mark_signed(
        db: Session,
        signer: Signer,
        signature_image_path: str
    ) -> Signer:
        signer.signed = True
        signer.signed_at = datetime.utcnow()
        signer.signature_image_path = signature_image_path
        db.commit()
        db.refresh(signer)
        
        contract = signer.contract
        all_signed = all(s.signed for s in contract.signers)
        if all_signed:
            contract.status = "signed"
            db.commit()
        
        return signer

    @staticmethod
    def generate_signed_pdf_path(contract: Contract) -> str:
        os.makedirs("signed", exist_ok=True)
        relative_path = f"signed/signed_{contract.id}_{uuid.uuid4()}.pdf"
        return os.path.abspath(relative_path)

    @staticmethod
    def get_final_signed_pdf(db: Session, contract_id: int) -> Optional[str]:
        contract = ContractService.get_contract(db, contract_id)
        if not contract or contract.status != "signed":
            return None
        
        output_path = ContractService.generate_signed_pdf_path(contract)
        from app.services import SignatureService
        
        all_signatures = []
        for signer in contract.signers:
            if signer.signature_image_path and signer.signed:
                positions = [
                    {
                        "page": pos.page,
                        "x": pos.x,
                        "y": pos.y,
                        "width": pos.width,
                        "height": pos.height
                    }
                    for pos in contract.signature_positions
                    if pos.signer_id == signer.id
                ]
                if positions:
                    all_signatures.append({
                        "image_path": signer.signature_image_path,
                        "positions": positions
                    })
        
        if all_signatures:
            SignatureService.apply_multiple_signatures(
                contract.file_path,
                all_signatures,
                output_path
            )
            return output_path
        
        return contract.file_path
