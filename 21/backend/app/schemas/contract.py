from pydantic import BaseModel, EmailStr
from datetime import datetime
from typing import List, Optional

class SignaturePositionCreate(BaseModel):
    page: int
    x: float
    y: float
    width: float
    height: float
    signer_id: Optional[int] = None

class SignaturePositionResponse(BaseModel):
    id: int
    contract_id: int
    page: int
    x: float
    y: float
    width: float
    height: float
    signer_id: Optional[int]

    class Config:
        from_attributes = True

class SignerCreate(BaseModel):
    name: str
    email: EmailStr

class SignerResponse(BaseModel):
    id: int
    contract_id: int
    name: str
    email: str
    sign_token: str
    signed: bool
    signed_at: Optional[datetime]
    expires_at: datetime
    signature_image_path: Optional[str]

    class Config:
        from_attributes = True

class ContractCreate(BaseModel):
    title: str

class ContractResponse(BaseModel):
    id: int
    title: str
    original_filename: str
    total_pages: int
    created_at: datetime
    status: str
    signers: List[SignerResponse]
    signature_positions: List[SignaturePositionResponse]

    class Config:
        from_attributes = True

class ContractListResponse(BaseModel):
    id: int
    title: str
    original_filename: str
    status: str
    created_at: datetime

    class Config:
        from_attributes = True

class AddSignersRequest(BaseModel):
    signers: List[SignerCreate]
    positions: List[SignaturePositionCreate]

class SignRequest(BaseModel):
    signature_data: str
