import os
import uuid
from typing import Optional
from sqlalchemy.orm import Session
from fastapi import UploadFile, HTTPException
from app.models.file import FileRecord
from app.schemas.file import FileRecordCreate
from app.config import settings


class FileService:
    @staticmethod
    def generate_unique_filename(original_filename: str) -> str:
        ext = os.path.splitext(original_filename)[1]
        return f"{uuid.uuid4().hex}{ext}"

    @staticmethod
    async def save_upload_file(file: UploadFile, uploader_ip: str, db: Session) -> FileRecord:
        if file.size and file.size > settings.MAX_FILE_SIZE:
            raise HTTPException(status_code=400, detail="File too large")

        stored_filename = FileService.generate_unique_filename(file.filename or "unknown")
        file_path = os.path.join(settings.UPLOAD_DIR, stored_filename)

        content = await file.read()
        with open(file_path, "wb") as f:
            f.write(content)

        file_record = FileRecord(
            original_filename=file.filename or "unknown",
            stored_filename=stored_filename,
            file_path=file_path,
            file_size=len(content),
            content_type=file.content_type or "application/octet-stream",
            uploader_ip=uploader_ip
        )

        db.add(file_record)
        db.commit()
        db.refresh(file_record)

        return file_record

    @staticmethod
    def get_file_by_id(file_id: int, db: Session) -> Optional[FileRecord]:
        return db.query(FileRecord).filter(FileRecord.id == file_id).first()

    @staticmethod
    def get_all_files(db: Session, skip: int = 0, limit: int = 100):
        return db.query(FileRecord).order_by(FileRecord.upload_time.desc()).offset(skip).limit(limit).all()

    @staticmethod
    def delete_file(file_id: int, db: Session) -> bool:
        file_record = FileService.get_file_by_id(file_id, db)
        if not file_record:
            return False

        if os.path.exists(file_record.file_path):
            os.remove(file_record.file_path)

        db.delete(file_record)
        db.commit()
        return True
