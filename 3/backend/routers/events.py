from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List
from datetime import date
from database import get_db
from models import AstronomyEvent
from schemas import AstronomyEvent as EventSchema

router = APIRouter(prefix="/api/events", tags=["events"])


@router.get("/", response_model=List[EventSchema])
def get_events(year: int = None, month: int = None, db: Session = Depends(get_db)):
    query = db.query(AstronomyEvent)
    
    if year:
        query = query.filter(AstronomyEvent.event_date.between(
            date(year, 1, 1), date(year, 12, 31)
        ))
    
    if month:
        if not year:
            year = date.today().year
        start_date = date(year, month, 1)
        if month == 12:
            end_date = date(year + 1, 1, 1)
        else:
            end_date = date(year, month + 1, 1)
        query = query.filter(AstronomyEvent.event_date.between(start_date, end_date))
    
    query = query.order_by(AstronomyEvent.event_date)
    return query.all()


@router.get("/upcoming", response_model=List[EventSchema])
def get_upcoming_events(limit: int = 5, db: Session = Depends(get_db)):
    events = db.query(AstronomyEvent).filter(
        AstronomyEvent.event_date >= date.today()
    ).order_by(AstronomyEvent.event_date).limit(limit).all()
    return events
