import uuid
import hashlib
import secrets
from datetime import datetime, timedelta
from typing import Optional
from sqlalchemy.orm import Session
from fastapi import HTTPException
from app.models.file import ShareLink, FileRecord
from app.schemas.file import ShareLinkCreate, ShareLinkResponse, ShareLinkListItem
from app.services.file_service import FileService


class ShareService:
    @staticmethod
    def generate_share_code() -> str:
        return uuid.uuid4().hex[:12]

    @staticmethod
    def hash_password(password: str) -> str:
        salt = secrets.token_hex(16)
        password_hash = hashlib.sha256((salt + password).encode()).hexdigest()
        return f"{salt}${password_hash}"

    @staticmethod
    def verify_password(plain_password: str, hashed_password: str) -> bool:
        try:
            salt, stored_hash = hashed_password.split("$", 1)
            computed_hash = hashlib.sha256((salt + plain_password).encode()).hexdigest()
            return computed_hash == stored_hash
        except (ValueError, AttributeError):
            return False

    @staticmethod
    def create_share_link(share_data: ShareLinkCreate, db: Session) -> ShareLink:
        file_record = FileService.get_file_by_id(share_data.file_id, db)
        if not file_record:
            raise HTTPException(status_code=404, detail="File not found")

        share_code = ShareService.generate_share_code()
        expire_at = None
        if share_data.expire_hours:
            expire_at = datetime.utcnow() + timedelta(hours=share_data.expire_hours)

        password_hash = None
        if share_data.password:
            password_hash = ShareService.hash_password(share_data.password)

        share_link = ShareLink(
            file_id=share_data.file_id,
            share_code=share_code,
            password_hash=password_hash,
            expire_at=expire_at,
            max_downloads=share_data.max_downloads,
            download_count=0,
            is_active=True
        )

        db.add(share_link)
        db.commit()
        db.refresh(share_link)

        return share_link

    @staticmethod
    def get_share_by_code(share_code: str, db: Session) -> Optional[ShareLink]:
        return db.query(ShareLink).filter(ShareLink.share_code == share_code).first()

    @staticmethod
    def is_share_valid(share: ShareLink) -> bool:
        if not share.is_active:
            return False
        if share.expire_at and datetime.utcnow() > share.expire_at:
            return False
        if share.max_downloads and share.download_count >= share.max_downloads:
            return False
        return True

    @staticmethod
    def verify_and_get_share(share_code: str, password: Optional[str], db: Session) -> ShareLink:
        share = ShareService.get_share_by_code(share_code, db)
        if not share:
            raise HTTPException(status_code=404, detail="Share link not found")

        if not ShareService.is_share_valid(share):
            raise HTTPException(status_code=410, detail="Share link has expired or is no longer active")

        if share.password_hash:
            if not password or not ShareService.verify_password(password, share.password_hash):
                raise HTTPException(status_code=401, detail="Invalid password")

        return share

    @staticmethod
    def increment_download_count(share: ShareLink, db: Session) -> None:
        share.download_count += 1
        if share.max_downloads and share.download_count >= share.max_downloads:
            share.is_active = False
        db.commit()

    @staticmethod
    def get_all_shares(db: Session, skip: int = 0, limit: int = 100):
        shares = db.query(ShareLink).join(FileRecord).order_by(ShareLink.created_at.desc()).offset(skip).limit(limit).all()
        result = []
        for share in shares:
            result.append(ShareLinkListItem(
                id=share.id,
                share_code=share.share_code,
                original_filename=share.file.original_filename,
                file_size=share.file.file_size,
                expire_at=share.expire_at,
                created_at=share.created_at,
                download_count=share.download_count,
                max_downloads=share.max_downloads,
                is_active=share.is_active,
                has_password=share.password_hash is not None
            ))
        return result

    @staticmethod
    def deactivate_share(share_id: int, db: Session) -> bool:
        share = db.query(ShareLink).filter(ShareLink.id == share_id).first()
        if not share:
            return False
        share.is_active = False
        db.commit()
        return True

    @staticmethod
    def to_response(share: ShareLink) -> ShareLinkResponse:
        return ShareLinkResponse(
            id=share.id,
            share_code=share.share_code,
            file_id=share.file_id,
            expire_at=share.expire_at,
            created_at=share.created_at,
            download_count=share.download_count,
            max_downloads=share.max_downloads,
            is_active=share.is_active,
            has_password=share.password_hash is not None,
            file=share.file
        )
