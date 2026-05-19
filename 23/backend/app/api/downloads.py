from fastapi import APIRouter, Depends, HTTPException, Header
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
import os
from app.database import get_db
from app.schemas.file import DownloadVerifyRequest
from app.services.share_service import ShareService

router = APIRouter(prefix="/api/downloads", tags=["downloads"])


@router.post("/{share_code}/verify")
def verify_download(
    share_code: str,
    request: DownloadVerifyRequest,
    db: Session = Depends(get_db)
):
    share = ShareService.verify_and_get_share(share_code, request.password, db)
    return {
        "valid": True,
        "filename": share.file.original_filename,
        "file_size": share.file.file_size,
        "content_type": share.file.content_type
    }


@router.get("/{share_code}")
def download_file(
    share_code: str,
    password: str = None,
    db: Session = Depends(get_db)
):
    share = ShareService.verify_and_get_share(share_code, password, db)

    if not os.path.exists(share.file.file_path):
        raise HTTPException(status_code=404, detail="File not found on server")

    ShareService.increment_download_count(share, db)

    return FileResponse(
        path=share.file.file_path,
        filename=share.file.original_filename,
        media_type=share.file.content_type or "application/octet-stream"
    )
