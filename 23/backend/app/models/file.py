from sqlalchemy import Column, Integer, String, DateTime, Boolean, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base


class FileRecord(Base):
    __tablename__ = "files"

    id = Column(Integer, primary_key=True, index=True)
    original_filename = Column(String, index=True)
    stored_filename = Column(String, unique=True, index=True)
    file_path = Column(String)
    file_size = Column(Integer)
    content_type = Column(String)
    upload_time = Column(DateTime, default=datetime.utcnow)
    uploader_ip = Column(String)

    shares = relationship("ShareLink", back_populates="file", cascade="all, delete-orphan")


class ShareLink(Base):
    __tablename__ = "share_links"

    id = Column(Integer, primary_key=True, index=True)
    file_id = Column(Integer, ForeignKey("files.id"))
    share_code = Column(String, unique=True, index=True)
    password_hash = Column(String, nullable=True)
    expire_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    download_count = Column(Integer, default=0)
    max_downloads = Column(Integer, nullable=True)
    is_active = Column(Boolean, default=True)

    file = relationship("FileRecord", back_populates="shares")
