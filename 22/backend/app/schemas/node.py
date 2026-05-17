from pydantic import BaseModel
from typing import Optional


class NodeBase(BaseModel):
    id: str
    node_type: str
    label: str
    content: Optional[str] = None
    field_name: Optional[str] = None
    position_x: int = 0
    position_y: int = 0


class NodeCreate(NodeBase):
    flow_id: int


class NodeUpdate(BaseModel):
    label: Optional[str] = None
    content: Optional[str] = None
    field_name: Optional[str] = None
    position_x: Optional[int] = None
    position_y: Optional[int] = None


class Node(NodeBase):
    flow_id: int

    class Config:
        from_attributes = True
