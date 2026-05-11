from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from ..database import get_db
from ..auth import get_current_active_user
from ..models import User, Tag, Bookmark
from ..schemas import TagCreate, TagResponse

router = APIRouter(prefix="/api/tags", tags=["tags"])

@router.get("", response_model=List[TagResponse])
async def get_tags(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    user_bookmarks = db.query(Bookmark).filter(Bookmark.user_id == current_user.id).subquery()
    
    tags = db.query(Tag).distinct().join(Tag.bookmarks).filter(
        Bookmark.user_id == current_user.id
    ).all()
    return tags

@router.get("/{tag_id}", response_model=TagResponse)
async def get_tag(
    tag_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    tag = db.query(Tag).filter(Tag.id == tag_id).first()
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")
    return tag
