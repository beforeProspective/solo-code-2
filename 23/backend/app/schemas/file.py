from pydantic import BaseModel
from datetime import datetime
from typing import Optional


class FileRecordBase(BaseModel):
    original_filename: str
    file_size: int
    content_type: str


class FileRecordCreate(FileRecordBase):
    stored_filename: str
    file_path: str
    uploader_ip: str


class FileRecordResponse(FileRecordBase):
    id: int
    upload_time: datetime

    class Config:
        from_attributes = True


class ShareLinkCreate(BaseModel):
    file_id: int
    password: Optional[str] = None
    expire_hours: Optional[int] = None
    max_downloads: Optional[int] = None


class ShareLinkResponse(BaseModel):
    id: int
    share_code: str
    file_id: int
    expire_at: Optional[datetime] = None
    created_at: datetime
    download_count: int
    max_downloads: Optional[int] = None
    is_active: bool
    has_password: bool
    file: FileRecordResponse

    class Config:
        from_attributes = True


class ShareLinkDetail(ShareLinkResponse):
    pass


class FileShareDetail(BaseModel):
    file: FileRecordResponse
    share: ShareLinkResponse


class DownloadVerifyRequest(BaseModel):
    password: Optional[str] = None


class ShareLinkListItem(BaseModel):
    id: int
    share_code: str
    original_filename: str
    file_size: int
    expire_at: Optional[datetime] = None
    created_at: datetime
    download_count: int
    max_downloads: Optional[int] = None
    is_active: bool
    has_password: bool

    class Config:
        from_attributes = True
