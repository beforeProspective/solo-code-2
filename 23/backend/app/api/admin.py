from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app.schemas.file import ShareLinkListItem
from app.services.share_service import ShareService

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/shares", response_model=List[ShareLinkListItem])
def get_all_shares(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return ShareService.get_all_shares(db, skip, limit)


@router.post("/shares/{share_id}/deactivate")
def deactivate_share(share_id: int, db: Session = Depends(get_db)):
    success = ShareService.deactivate_share(share_id, db)
    if not success:
        return {"success": False, "message": "Share not found"}
    return {"success": True, "message": "Share deactivated"}
