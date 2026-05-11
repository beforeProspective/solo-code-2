import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from ..database import get_db
from ..models import User, Site
from ..schemas import SiteCreate, SiteResponse
from ..auth import get_current_user
from ..config import settings

router = APIRouter(prefix="/sites", tags=["Sites"])


@router.get("", response_model=List[SiteResponse])
def get_user_sites(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    sites = db.query(Site).filter(Site.user_id == current_user.id).all()
    return sites


@router.post("", response_model=SiteResponse)
def create_site(
    site_data: SiteCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    existing_site = db.query(Site).filter(
        Site.user_id == current_user.id,
        Site.domain == site_data.domain
    ).first()
    
    if existing_site:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Site already exists for this domain"
        )
    
    new_site = Site(
        domain=site_data.domain,
        site_id=str(uuid.uuid4()).replace("-", ""),
        user_id=current_user.id
    )
    
    db.add(new_site)
    db.commit()
    db.refresh(new_site)
    
    return new_site


@router.delete("/{site_id}")
def delete_site(
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
    
    db.delete(site)
    db.commit()
    
    return {"message": "Site deleted successfully"}


@router.get("/{site_id}/snippet")
def get_tracking_snippet(
    site_id: str,
    db: Session = Depends(get_db)
):
    site = db.query(Site).filter(Site.site_id == site_id).first()
    
    if not site:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Site not found"
        )
    
    snippet = f"""<!-- Analytics Dashboard Tracking Script -->
<script>
(function() {{
    var siteId = '{site.site_id}';
    var backendUrl = '{settings.BACKEND_URL}';
    
    function track() {{
        var data = {{
            path: window.location.pathname,
            referrer: document.referrer || null,
            screen_width: window.screen.width,
            screen_height: window.screen.height
        }};
        
        fetch(backendUrl + '/api/track/' + siteId, {{
            method: 'POST',
            headers: {{
                'Content-Type': 'application/json'
            }},
            body: JSON.stringify(data)
        }}).catch(function(err) {{
            console.warn('Analytics tracking failed:', err);
        }});
    }}
    
    track();
    
    if (window.history && window.history.pushState) {{
        var originalPush = history.pushState;
        history.pushState = function() {{
            originalPush.apply(this, arguments);
            setTimeout(track, 100);
        }};
    }}
}})();
</script>
"""
    
    return {"snippet": snippet, "site_id": site.site_id}
