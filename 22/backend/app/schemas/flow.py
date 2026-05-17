from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


class FlowBase(BaseModel):
    name: str
    description: Optional[str] = None
    start_node_id: Optional[str] = None


class FlowCreate(FlowBase):
    pass


class FlowUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    start_node_id: Optional[str] = None


class Flow(FlowBase):
    id: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class FlowDetail(Flow):
    nodes: List["Node"] = []
    edges: List["Edge"] = []


from .node import Node
from .edge import Edge
FlowDetail.model_rebuild()
