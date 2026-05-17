from sqlalchemy import Column, Integer, String, ForeignKey
from sqlalchemy.orm import relationship
from app.database import Base


class Edge(Base):
    __tablename__ = "edges"

    id = Column(String(100), primary_key=True)
    flow_id = Column(Integer, ForeignKey("flows.id"), nullable=False)
    source = Column(String(100), nullable=False)
    target = Column(String(100), nullable=False)
    source_handle = Column(String(50), nullable=True)

    flow = relationship("Flow")
