from sqlalchemy import Column, Integer, String, Text, ForeignKey
from sqlalchemy.orm import relationship
from app.database import Base


class Node(Base):
    __tablename__ = "nodes"

    id = Column(String(100), primary_key=True)
    flow_id = Column(Integer, ForeignKey("flows.id"), nullable=False)
    node_type = Column(String(50), nullable=False)
    label = Column(String(255), nullable=False)
    content = Column(Text, nullable=True)
    field_name = Column(String(100), nullable=True)
    position_x = Column(Integer, default=0)
    position_y = Column(Integer, default=0)

    flow = relationship("Flow")
