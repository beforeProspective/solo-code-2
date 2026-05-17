from pydantic import BaseModel
from typing import Dict, Any, Optional
from datetime import datetime


class SubmissionBase(BaseModel):
    flow_id: int
    session_id: str
    data: Dict[str, Any]


class SubmissionCreate(SubmissionBase):
    pass


class Submission(SubmissionBase):
    id: int
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True
