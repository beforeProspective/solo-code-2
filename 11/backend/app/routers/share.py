import uuid
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import Optional
from datetime import datetime, timedelta
from sqlalchemy import func, distinct

from ..database import get_db
from ..models import User, Site, ShareLink, PageView
from ..schemas import ShareLinkCreate, ShareLinkResponse, AnalyticsResponse, PageViewStats
from ..auth import get_current_user

router = APIRouter(prefix="/share", tags=["Share"])


@router.post("/sites/{site_id}", response_model=ShareLinkResponse)
def create_share_link(
    site_id: int,
    share_data: ShareLinkCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    site = db.query(Site).filter(
        Site.id == site_id,
        Site.user_id == current_user.id
    ).first()
    
    if not site:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Site not found"
        )
    
    expires_at = None
    if share_data.expires_in_days:
        expires_at = datetime.utcnow() + timedelta(days=share_data.expires_in_days)
    
    share_link = ShareLink(
        site_id=site.id,
        token=str(uuid.uuid4()).replace("-", ""),
        expires_at=expires_at,
        created_by=current_user.id
    )
    
    db.add(share_link)
    db.commit()
    db.refresh(share_link)
    
    return share_link


def build_query_filters(site_id: int, start_date: Optional[datetime], end_date: Optional[datetime]):
    filters = [PageView.site_id == site_id]
    
    if start_date:
        filters.append(PageView.timestamp >= start_date)
    if end_date:
        filters.append(PageView.timestamp <= end_date)
    
    return filters


@router.get("/{token}/analytics", response_model=AnalyticsResponse)
def get_shared_analytics(
    token: str,
    start_date: Optional[datetime] = Query(None),
    end_date: Optional[datetime] = Query(None),
    db: Session = Depends(get_db)
):
    share_link = db.query(ShareLink).filter(ShareLink.token == token).first()
    
    if not share_link:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invalid share link"
        )
    
    if share_link.expires_at and share_link.expires_at < datetime.utcnow():
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="Share link has expired"
        )
    
    site = db.query(Site).filter(Site.id == share_link.site_id).first()
    
    if not site:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Site not found"
        )
    
    filters = build_query_filters(site.id, start_date, end_date)
    
    total_pageviews = db.query(func.count(PageView.id)).filter(*filters).scalar() or 0
    unique_visitors = db.query(func.count(distinct(PageView.path))).filter(*filters).scalar() or 0
    
    referrers = db.query(
        PageView.referrer,
        func.count(PageView.id).label('count')
    ).filter(*filters).group_by(PageView.referrer).order_by(func.count(PageView.id).desc()).limit(10).all()
    
    countries = db.query(
        PageView.country,
        func.count(PageView.id).label('count')
    ).filter(*filters).group_by(PageView.country).order_by(func.count(PageView.id).desc()).limit(10).all()
    
    devices = db.query(
        PageView.device_type,
        func.count(PageView.id).label('count')
    ).filter(*filters).group_by(PageView.device_type).order_by(func.count(PageView.id).desc()).limit(5).all()
    
    paths = db.query(
        PageView.path,
        func.count(PageView.id).label('count')
    ).filter(*filters).group_by(PageView.path).order_by(func.count(PageView.id).desc()).limit(15).all()
    
    daily_stats_query = db.query(
        func.date(PageView.timestamp).label('date'),
        func.count(PageView.id).label('count')
    ).filter(*filters).group_by(func.date(PageView.timestamp)).order_by('date').all()
    
    return AnalyticsResponse(
        pageviews=PageViewStats(total=total_pageviews, unique_visitors=unique_visitors),
        referrers=[{"referrer": r[0] or "Direct", "count": r[1]} for r in referrers],
        countries=[{"country": c[0] or "Unknown", "count": c[1]} for c in countries],
        devices=[{"device_type": d[0] or "Unknown", "count": d[1]} for d in devices],
        paths=[{"path": p[0], "count": p[1]} for p in paths],
        daily_stats=[{"date": str(d[0]), "count": d[1]} for d in daily_stats_query]
    )


@router.delete("/{token}")
def revoke_share_link(
    token: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    share_link = db.query(ShareLink).filter(
        ShareLink.token == token,
        ShareLink.created_by == current_user.id
    ).first()
    
    if not share_link:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Share link not found"
        )
    
    db.delete(share_link)
    db.commit()
    
    return {"message": "Share link revoked"}
