from pydantic import BaseModel
from datetime import date
from typing import Optional


class PlanetBase(BaseModel):
    name: str
    name_cn: str
    description: str
    diameter: float
    distance_from_sun: float
    orbital_period: float
    number_of_moons: int
    image_url: str


class Planet(PlanetBase):
    id: int

    class Config:
        from_attributes = True


class AstronomyEventBase(BaseModel):
    title: str
    title_cn: str
    event_date: date
    description: str
    category: str


class AstronomyEvent(AstronomyEventBase):
    id: int

    class Config:
        from_attributes = True
