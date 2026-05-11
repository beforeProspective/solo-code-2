from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
import uuid
from ..database import get_db
from ..auth import get_current_active_user
from ..models import User, PublicList, Bookmark
from ..schemas import PublicListCreate, PublicListResponse, PublicListShare, BookmarkResponse

router = APIRouter(prefix="/api/public-lists", tags=["public_lists"])

@router.get("", response_model=List[PublicListResponse])
async def get_public_lists(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    lists = db.query(PublicList).filter(
        PublicList.user_id == current_user.id
    ).order_by(PublicList.created_at.desc()).all()
    return lists

@router.post("", response_model=PublicListResponse, status_code=status.HTTP_201_CREATED)
async def create_public_list(
    list_data: PublicListCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    public_list = PublicList(
        title=list_data.title,
        description=list_data.description,
        share_token=str(uuid.uuid4()),
        user_id=current_user.id
    )
    db.add(public_list)
    db.commit()
    db.refresh(public_list)
    return public_list

@router.get("/{list_id}", response_model=PublicListResponse)
async def get_public_list(
    list_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    public_list = db.query(PublicList).filter(
        PublicList.id == list_id,
        PublicList.user_id == current_user.id
    ).first()
    if not public_list:
        raise HTTPException(status_code=404, detail="Public list not found")
    return public_list

@router.delete("/{list_id}")
async def delete_public_list(
    list_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    public_list = db.query(PublicList).filter(
        PublicList.id == list_id,
        PublicList.user_id == current_user.id
    ).first()
    if not public_list:
        raise HTTPException(status_code=404, detail="Public list not found")
    
    db.delete(public_list)
    db.commit()
    return {"message": "Public list deleted successfully"}

@router.get("/share/{share_token}", response_model=PublicListShare)
async def get_shared_list(
    share_token: str,
    db: Session = Depends(get_db)
):
    public_list = db.query(PublicList).filter(
        PublicList.share_token == share_token
    ).first()
    if not public_list:
        raise HTTPException(status_code=404, detail="Shared list not found")
    
    bookmarks = db.query(Bookmark).filter(
        Bookmark.user_id == public_list.user_id,
        Bookmark.is_archived == False
    ).order_by(Bookmark.created_at.desc()).all()
    
    return PublicListShare(
        share_token=public_list.share_token,
        title=public_list.title,
        description=public_list.description,
        bookmarks=[BookmarkResponse.from_orm(b) for b in bookmarks]
    )
