from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.schemas.file import ShareLinkCreate, ShareLinkResponse
from app.services.share_service import ShareService

router = APIRouter(prefix="/api/shares", tags=["shares"])


@router.post("", response_model=ShareLinkResponse)
def create_share(share_data: ShareLinkCreate, db: Session = Depends(get_db)):
    share = ShareService.create_share_link(share_data, db)
    return ShareService.to_response(share)


@router.get("/{share_code}", response_model=ShareLinkResponse)
def get_share_info(share_code: str, db: Session = Depends(get_db)):
    share = ShareService.get_share_by_code(share_code, db)
    if not share:
        raise HTTPException(status_code=404, detail="Share link not found")
    return ShareService.to_response(share)


@router.post("/{share_code}/deactivate")
def deactivate_share(share_id: int, db: Session = Depends(get_db)):
    success = ShareService.deactivate_share(share_id, db)
    if not success:
        raise HTTPException(status_code=404, detail="Share link not found")
    return {"message": "Share link deactivated successfully"}
