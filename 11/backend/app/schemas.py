from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime


class UserBase(BaseModel):
    email: EmailStr
    username: str


class UserCreate(UserBase):
    password: str


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserResponse(UserBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class TokenData(BaseModel):
    user_id: Optional[int] = None


class SiteBase(BaseModel):
    domain: str


class SiteCreate(SiteBase):
    pass


class SiteResponse(SiteBase):
    id: int
    site_id: str
    created_at: datetime

    class Config:
        from_attributes = True


class PageViewData(BaseModel):
    path: str
    referrer: Optional[str] = None
    screen_width: Optional[int] = None
    screen_height: Optional[int] = None


class AnalyticsFilter(BaseModel):
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None


class PageViewStats(BaseModel):
    total: int
    unique_visitors: int


class ReferrerStat(BaseModel):
    referrer: str
    count: int


class CountryStat(BaseModel):
    country: str
    count: int


class DeviceStat(BaseModel):
    device_type: str
    count: int


class PathStat(BaseModel):
    path: str
    count: int


class DailyStat(BaseModel):
    date: str
    count: int


class AnalyticsResponse(BaseModel):
    pageviews: PageViewStats
    referrers: List[ReferrerStat]
    countries: List[CountryStat]
    devices: List[DeviceStat]
    paths: List[PathStat]
    daily_stats: List[DailyStat]


class ShareLinkCreate(BaseModel):
    expires_in_days: Optional[int] = None


class ShareLinkResponse(BaseModel):
    token: str
    expires_at: Optional[datetime]
    created_at: datetime
