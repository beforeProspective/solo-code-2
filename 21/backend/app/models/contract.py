from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Float, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime, timedelta
import uuid
from app.core.database import Base

class Contract(Base):
    __tablename__ = "contracts"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, index=True)
    original_filename = Column(String)
    stored_filename = Column(String)
    file_path = Column(String)
    total_pages = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    status = Column(String, default="draft")

    signers = relationship("Signer", back_populates="contract", cascade="all, delete-orphan")
    signature_positions = relationship("SignaturePosition", back_populates="contract", cascade="all, delete-orphan")

class Signer(Base):
    __tablename__ = "signers"

    id = Column(Integer, primary_key=True, index=True)
    contract_id = Column(Integer, ForeignKey("contracts.id"))
    name = Column(String)
    email = Column(String)
    sign_token = Column(String, unique=True, index=True)
    signed = Column(Boolean, default=False)
    signed_at = Column(DateTime, nullable=True)
    signature_image_path = Column(String, nullable=True)
    expires_at = Column(DateTime)

    contract = relationship("Contract", back_populates="signers")

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        if not self.sign_token:
            self.sign_token = str(uuid.uuid4())
        if not self.expires_at:
            self.expires_at = datetime.utcnow() + timedelta(days=7)

class SignaturePosition(Base):
    __tablename__ = "signature_positions"

    id = Column(Integer, primary_key=True, index=True)
    contract_id = Column(Integer, ForeignKey("contracts.id"))
    page = Column(Integer)
    x = Column(Float)
    y = Column(Float)
    width = Column(Float)
    height = Column(Float)
    signer_id = Column(Integer, nullable=True)

    contract = relationship("Contract", back_populates="signature_positions")
