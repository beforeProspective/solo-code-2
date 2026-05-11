from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from ..database import get_db
from ..auth import get_current_active_user
from ..scraper import fetch_page_metadata
from ..models import User, Bookmark, Category, Tag
from ..schemas import BookmarkCreate, BookmarkUpdate, BookmarkResponse

router = APIRouter(prefix="/api/bookmarks", tags=["bookmarks"])

def get_or_create_tags(db: Session, tag_names: List[str]) -> List[Tag]:
    tags = []
    for name in tag_names:
        tag = db.query(Tag).filter(Tag.name == name).first()
        if not tag:
            tag = Tag(name=name)
            db.add(tag)
        tags.append(tag)
    return tags

@router.get("", response_model=List[BookmarkResponse])
async def get_bookmarks(
    search: Optional[str] = None,
    category_id: Optional[int] = None,
    tag_id: Optional[int] = None,
    tag_name: Optional[str] = None,
    is_archived: Optional[bool] = None,
    is_favorite: Optional[bool] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    query = db.query(Bookmark).filter(Bookmark.user_id == current_user.id)
    
    if search:
        search_pattern = f"%{search}%"
        query = query.filter(
            (Bookmark.title.ilike(search_pattern)) |
            (Bookmark.description.ilike(search_pattern)) |
            (Bookmark.url.ilike(search_pattern))
        )
    
    if category_id is not None:
        query = query.filter(Bookmark.category_id == category_id)
    
    if is_archived is not None:
        query = query.filter(Bookmark.is_archived == is_archived)
    
    if is_favorite is not None:
        query = query.filter(Bookmark.is_favorite == is_favorite)
    
    if tag_id:
        query = query.join(Bookmark.tags).filter(Tag.id == tag_id)
    elif tag_name:
        query = query.join(Bookmark.tags).filter(Tag.name == tag_name)
    
    query = query.order_by(Bookmark.created_at.desc())
    
    return query.all()

@router.post("", response_model=BookmarkResponse, status_code=status.HTTP_201_CREATED)
async def create_bookmark(
    bookmark_data: BookmarkCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    metadata = await fetch_page_metadata(bookmark_data.url)
    
    bookmark = Bookmark(
        url=bookmark_data.url,
        title=metadata["title"] or bookmark_data.url,
        description=metadata["description"],
        thumbnail=metadata["thumbnail"],
        user_id=current_user.id,
        category_id=bookmark_data.category_id
    )
    
    if bookmark_data.tags:
        tags = get_or_create_tags(db, bookmark_data.tags)
        bookmark.tags = tags
    
    db.add(bookmark)
    db.commit()
    db.refresh(bookmark)
    return bookmark

@router.get("/{bookmark_id}", response_model=BookmarkResponse)
async def get_bookmark(
    bookmark_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    bookmark = db.query(Bookmark).filter(
        Bookmark.id == bookmark_id,
        Bookmark.user_id == current_user.id
    ).first()
    if not bookmark:
        raise HTTPException(status_code=404, detail="Bookmark not found")
    return bookmark

@router.put("/{bookmark_id}", response_model=BookmarkResponse)
async def update_bookmark(
    bookmark_id: int,
    bookmark_data: BookmarkUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    bookmark = db.query(Bookmark).filter(
        Bookmark.id == bookmark_id,
        Bookmark.user_id == current_user.id
    ).first()
    if not bookmark:
        raise HTTPException(status_code=404, detail="Bookmark not found")
    
    update_data = bookmark_data.dict(exclude_unset=True)
    
    if "tags" in update_data:
        tag_names = update_data.pop("tags")
        if tag_names:
            tags = get_or_create_tags(db, tag_names)
            bookmark.tags = tags
    
    for key, value in update_data.items():
        setattr(bookmark, key, value)
    
    db.commit()
    db.refresh(bookmark)
    return bookmark

@router.delete("/{bookmark_id}")
async def delete_bookmark(
    bookmark_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    bookmark = db.query(Bookmark).filter(
        Bookmark.id == bookmark_id,
        Bookmark.user_id == current_user.id
    ).first()
    if not bookmark:
        raise HTTPException(status_code=404, detail="Bookmark not found")
    
    db.delete(bookmark)
    db.commit()
    return {"message": "Bookmark deleted successfully"}

@router.post("/{bookmark_id}/favorite", response_model=BookmarkResponse)
async def toggle_favorite(
    bookmark_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    bookmark = db.query(Bookmark).filter(
        Bookmark.id == bookmark_id,
        Bookmark.user_id == current_user.id
    ).first()
    if not bookmark:
        raise HTTPException(status_code=404, detail="Bookmark not found")
    
    bookmark.is_favorite = not bookmark.is_favorite
    db.commit()
    db.refresh(bookmark)
    return bookmark

@router.post("/{bookmark_id}/archive", response_model=BookmarkResponse)
async def toggle_archive(
    bookmark_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    bookmark = db.query(Bookmark).filter(
        Bookmark.id == bookmark_id,
        Bookmark.user_id == current_user.id
    ).first()
    if not bookmark:
        raise HTTPException(status_code=404, detail="Bookmark not found")
    
    bookmark.is_archived = not bookmark.is_archived
    db.commit()
    db.refresh(bookmark)
    return bookmark
