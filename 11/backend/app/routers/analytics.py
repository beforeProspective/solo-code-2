from fastapi import APIRouter, Depends, HTTPException, status, Request, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import func, distinct
from sqlalchemy.orm import Session
from typing import Optional, List
from datetime import datetime, timedelta
import csv
import io
import re

from ..database import get_db
from ..models import User, Site, PageView
from ..schemas import PageViewData, AnalyticsResponse, PageViewStats
from ..auth import get_current_user

router = APIRouter(tags=["Analytics"])


def parse_user_agent(user_agent: str) -> tuple:
    device_type = "desktop"
    browser = "Unknown"
    os = "Unknown"
    
    if user_agent:
        if re.search(r"Mobile|Android|iPhone|iPad|iPod", user_agent, re.I):
            device_type = "mobile"
            if re.search(r"iPad|Tablet", user_agent, re.I):
                device_type = "tablet"
        
        if "Chrome" in user_agent and "Edg" not in user_agent:
            browser = "Chrome"
        elif "Firefox" in user_agent:
            browser = "Firefox"
        elif "Safari" in user_agent and "Chrome" not in user_agent:
            browser = "Safari"
        elif "Edg" in user_agent:
            browser = "Edge"
        elif "MSIE" in user_agent or "Trident" in user_agent:
            browser = "Internet Explorer"
        
        if "Windows" in user_agent:
            os = "Windows"
        elif "Mac OS" in user_agent:
            os = "macOS"
        elif "Linux" in user_agent:
            os = "Linux"
        elif "Android" in user_agent:
            os = "Android"
        elif "iPhone" in user_agent or "iPad" in user_agent:
            os = "iOS"
    
    return device_type, browser, os


def get_country_from_ip(ip: str) -> str:
    return "Unknown"


def extract_domain(referrer: str) -> str:
    if not referrer:
        return "Direct"
    try:
        match = re.search(r"https?://([^/]+)", referrer)
        if match:
            domain = match.group(1).replace("www.", "")
            if "google" in domain.lower():
                return "Google"
            elif "bing" in domain.lower():
                return "Bing"
            elif "yahoo" in domain.lower():
                return "Yahoo"
            elif "duckduckgo" in domain.lower():
                return "DuckDuckGo"
            return domain
    except:
        pass
    return "Other"


@router.post("/api/track/{site_id_str}")
async def track_page_view(
    site_id_str: str,
    data: PageViewData,
    request: Request,
    db: Session = Depends(get_db)
):
    site = db.query(Site).filter(Site.site_id == site_id_str).first()
    
    if not site:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Site not found"
        )
    
    user_agent = request.headers.get("User-Agent", "")
    device_type, browser, os = parse_user_agent(user_agent)
    
    referrer_domain = extract_domain(data.referrer)
    
    new_pageview = PageView(
        site_id=site.id,
        path=data.path or "/",
        referrer=referrer_domain,
        country=get_country_from_ip(request.client.host if request.client else ""),
        device_type=device_type,
        browser=browser,
        os=os,
        screen_width=data.screen_width,
        screen_height=data.screen_height
    )
    
    db.add(new_pageview)
    db.commit()
    
    return {"status": "success"}


def build_query_filters(site_id: int, start_date: Optional[datetime], end_date: Optional[datetime]):
    filters = [PageView.site_id == site_id]
    
    if start_date:
        filters.append(PageView.timestamp >= start_date)
    if end_date:
        filters.append(PageView.timestamp <= end_date)
    
    return filters


@router.get("/api/sites/{site_id}/analytics", response_model=AnalyticsResponse)
def get_site_analytics(
    site_id: int,
    start_date: Optional[datetime] = Query(None),
    end_date: Optional[datetime] = Query(None),
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


@router.get("/api/sites/{site_id}/realtime")
def get_realtime_stats(
    site_id: int,
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
    
    five_minutes_ago = datetime.utcnow() - timedelta(minutes=5)
    
    recent_visitors = db.query(
        PageView.path,
        PageView.device_type,
        PageView.country,
        PageView.timestamp
    ).filter(
        PageView.site_id == site.id,
        PageView.timestamp >= five_minutes_ago
    ).order_by(PageView.timestamp.desc()).limit(20).all()
    
    count_last_5 = db.query(func.count(PageView.id)).filter(
        PageView.site_id == site.id,
        PageView.timestamp >= five_minutes_ago
    ).scalar() or 0
    
    return {
        "recent_visitors": [
            {
                "path": v[0],
                "device_type": v[1],
                "country": v[2],
                "timestamp": v[3].isoformat()
            } for v in recent_visitors
        ],
        "active_visitors": count_last_5
    }


@router.get("/api/sites/{site_id}/export")
def export_analytics_csv(
    site_id: int,
    start_date: Optional[datetime] = Query(None),
    end_date: Optional[datetime] = Query(None),
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
    
    filters = build_query_filters(site.id, start_date, end_date)
    
    pageviews = db.query(
        PageView.path,
        PageView.referrer,
        PageView.country,
        PageView.device_type,
        PageView.browser,
        PageView.os,
        PageView.timestamp
    ).filter(*filters).order_by(PageView.timestamp.desc()).all()
    
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Timestamp", "Path", "Referrer", "Country",
        "Device Type", "Browser", "Operating System"
    ])
    
    for pv in pageviews:
        writer.writerow([
            pv[6].isoformat() if pv[6] else "",
            pv[0],
            pv[1] or "Direct",
            pv[2] or "Unknown",
            pv[3] or "Unknown",
            pv[4] or "Unknown",
            pv[5] or "Unknown"
        ])
    
    output.seek(0)
    
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="analytics_{site.domain}_{datetime.utcnow().strftime("%Y%m%d")}.csv"'
        }
    )
