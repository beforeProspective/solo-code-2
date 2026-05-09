from sqlalchemy import Column, Integer, String, Float, Date
from database import Base


class Planet(Base):
    __tablename__ = "planets"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(50), unique=True, index=True)
    name_cn = Column(String(50))
    description = Column(String(500))
    diameter = Column(Float)
    distance_from_sun = Column(Float)
    orbital_period = Column(Float)
    number_of_moons = Column(Integer)
    image_url = Column(String(200))


class AstronomyEvent(Base):
    __tablename__ = "astronomy_events"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(100))
    title_cn = Column(String(100))
    event_date = Column(Date)
    description = Column(String(500))
    category = Column(String(50))
