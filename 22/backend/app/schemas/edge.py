from pydantic import BaseModel
from typing import Optional


class EdgeBase(BaseModel):
    id: str
    source: str
    target: str
    source_handle: Optional[str] = None


class EdgeCreate(EdgeBase):
    flow_id: int


class EdgeUpdate(BaseModel):
    source: Optional[str] = None
    target: Optional[str] = None
    source_handle: Optional[str] = None


class Edge(EdgeBase):
    flow_id: int

    class Config:
        from_attributes = True
