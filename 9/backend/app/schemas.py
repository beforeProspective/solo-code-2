from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List
from datetime import datetime

class TagBase(BaseModel):
    name: str

class TagCreate(TagBase):
    pass

class TagResponse(TagBase):
    id: int

    class Config:
        from_attributes = True

class CategoryBase(BaseModel):
    name: str
    color: Optional[str] = "#3B82F6"

class CategoryCreate(CategoryBase):
    pass

class CategoryResponse(CategoryBase):
    id: int

    class Config:
        from_attributes = True

class BookmarkBase(BaseModel):
    url: str
    title: Optional[str] = ""
    description: Optional[str] = ""
    thumbnail: Optional[str] = ""
    category_id: Optional[int] = None
    tags: List[str] = []

class BookmarkCreate(BaseModel):
    url: str
    category_id: Optional[int] = None
    tags: List[str] = []

class BookmarkUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    thumbnail: Optional[str] = None
    category_id: Optional[int] = None
    tags: Optional[List[str]] = None
    is_archived: Optional[bool] = None
    is_favorite: Optional[bool] = None

class BookmarkResponse(BaseModel):
    id: int
    url: str
    title: str
    description: str
    thumbnail: str
    is_archived: bool
    is_favorite: bool
    created_at: datetime
    updated_at: datetime
    category: Optional[CategoryResponse] = None
    tags: List[TagResponse] = []

    class Config:
        from_attributes = True

class UserBase(BaseModel):
    username: str
    email: EmailStr

class UserCreate(UserBase):
    password: str = Field(..., min_length=6)

class UserLogin(BaseModel):
    username: str
    password: str

class UserResponse(UserBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse

class PublicListBase(BaseModel):
    title: str
    description: Optional[str] = ""

class PublicListCreate(PublicListBase):
    bookmark_ids: List[int] = []

class PublicListResponse(BaseModel):
    id: int
    title: str
    description: str
    share_token: str
    created_at: datetime
    bookmarks: List[BookmarkResponse] = []

    class Config:
        from_attributes = True

class PublicListShare(BaseModel):
    share_token: str
    title: str
    description: str
    bookmarks: List[BookmarkResponse]
