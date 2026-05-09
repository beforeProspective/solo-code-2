from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from database import get_db
from models import Planet
from schemas import Planet as PlanetSchema

router = APIRouter(prefix="/api/planets", tags=["planets"])


@router.get("/", response_model=List[PlanetSchema])
def get_all_planets(db: Session = Depends(get_db)):
    planets = db.query(Planet).all()
    return planets


@router.get("/{planet_id}", response_model=PlanetSchema)
def get_planet(planet_id: int, db: Session = Depends(get_db)):
    planet = db.query(Planet).filter(Planet.id == planet_id).first()
    if planet is None:
        raise HTTPException(status_code=404, detail="Planet not found")
    return planet
