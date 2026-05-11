from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from bs4 import BeautifulSoup
from io import StringIO, BytesIO
from datetime import datetime
from typing import List
from ..database import get_db
from ..auth import get_current_active_user
from ..models import User, Bookmark, Category, Tag

router = APIRouter(prefix="/api", tags=["import_export"])

def get_or_create_tags(db: Session, tag_names: List[str]) -> List[Tag]:
    tags = []
    for name in tag_names:
        tag = db.query(Tag).filter(Tag.name == name).first()
        if not tag:
            tag = Tag(name=name)
            db.add(tag)
        tags.append(tag)
    return tags

def parse_bookmarks_html(html_content: str):
    soup = BeautifulSoup(html_content, "html.parser")
    bookmarks = []
    
    for dt in soup.find_all("dt"):
        link = dt.find("a")
        if link:
            url = link.get("href")
            title = link.text or url
            add_date = link.get("add_date")
            tags = link.get("tags", "")
            tag_list = [t.strip() for t in tags.split(",") if t.strip()] if tags else []
            
            description = ""
            next_dd = dt.find_next_sibling("dd")
            if next_dd:
                description = next_dd.text.strip()
            
            bookmarks.append({
                "url": url,
                "title": title,
                "description": description,
                "tags": tag_list
            })
    
    return bookmarks

def generate_bookmarks_html(bookmarks: List[Bookmark]):
    lines = []
    lines.append("<!DOCTYPE NETSCAPE-Bookmark-file-1>")
    lines.append("<!-- This is an automatically generated file.")
    lines.append("     It will be read and overwritten.")
    lines.append("     DO NOT EDIT! -->")
    lines.append('<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">')
    lines.append("<TITLE>Bookmarks</TITLE>")
    lines.append("<H1>Bookmarks</H1>")
    lines.append('<DL><p>')
    
    for bookmark in bookmarks:
        add_date = int(bookmark.created_at.timestamp())
        tags = ",".join([tag.name for tag in bookmark.tags])
        
        href = bookmark.url.replace('"', "&quot;")
        title = bookmark.title.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;")
        desc = bookmark.description.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;")
        
        link_tag = f'<DT><A HREF="{href}" ADD_DATE="{add_date}" TAGS="{tags}">{title}</A>'
        lines.append(link_tag)
        
        if desc:
            lines.append(f'<DD>{desc}')
    
    lines.append('</DL><p>')
    
    return "\n".join(lines)

@router.post("/import")
async def import_bookmarks(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    if not file.filename.endswith('.html') and not file.filename.endswith('.htm'):
        raise HTTPException(status_code=400, detail="Please upload an HTML file")
    
    content = await file.read()
    try:
        html_content = content.decode('utf-8')
    except UnicodeDecodeError:
        html_content = content.decode('latin-1')
    
    parsed = parse_bookmarks_html(html_content)
    
    imported_count = 0
    for item in parsed:
        existing = db.query(Bookmark).filter(
            Bookmark.user_id == current_user.id,
            Bookmark.url == item["url"]
        ).first()
        
        if not existing:
            bookmark = Bookmark(
                url=item["url"],
                title=item["title"],
                description=item["description"],
                user_id=current_user.id
            )
            
            if item["tags"]:
                tags = get_or_create_tags(db, item["tags"])
                bookmark.tags = tags
            
            db.add(bookmark)
            imported_count += 1
    
    db.commit()
    
    return {
        "message": f"Successfully imported {imported_count} bookmarks",
        "imported_count": imported_count,
        "total_parsed": len(parsed)
    }

@router.get("/export")
async def export_bookmarks(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    bookmarks = db.query(Bookmark).filter(
        Bookmark.user_id == current_user.id
    ).order_by(Bookmark.created_at.desc()).all()
    
    html_content = generate_bookmarks_html(bookmarks)
    
    output = BytesIO(html_content.encode('utf-8'))
    filename = f"bookmarks_{datetime.now().strftime('%Y%m%d_%H%M%S')}.html"
    
    return StreamingResponse(
        output,
        media_type="text/html",
        headers={
            "Content-Disposition": f"attachment; filename={filename}"
        }
    )
