from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Dict, Any, List, Optional
from pydantic import BaseModel
from app.database import get_db
from app.services.chat_service import ChatService
from app.schemas.submission import Submission

router = APIRouter(prefix="/api/chat", tags=["chat"])


class ChatRequest(BaseModel):
    flow_id: int
    session_id: str
    current_node_id: Optional[str] = None
    answer: Optional[str] = None
    collected_data: Dict[str, Any] = {}


class ChatResponse(BaseModel):
    message: Dict[str, Any] = None
    is_completed: bool
    next_node_id: Optional[str] = None


@router.post("/start", response_model=ChatResponse)
def start_chat(flow_id: int, session_id: str, db: Session = Depends(get_db)):
    node = ChatService.get_start_node(db, flow_id)
    if not node:
        raise HTTPException(status_code=404, detail="Flow not found or has no nodes")
    message = ChatService.process_node_message(node)
    return ChatResponse(
        message=message,
        is_completed=False,
        next_node_id=node.id
    )


@router.post("/next", response_model=ChatResponse)
def next_message(request: ChatRequest, db: Session = Depends(get_db)):
    from app.models.node import Node
    
    if request.current_node_id and request.answer is not None:
        prev_node = db.query(Node).filter(Node.id == request.current_node_id).first()
        if prev_node and prev_node.field_name:
            request.collected_data[prev_node.field_name] = request.answer

    next_node = ChatService.get_next_node(
        db,
        request.flow_id,
        request.current_node_id,
        request.answer
    )

    if not next_node:
        ChatService.save_submission(
            db,
            request.flow_id,
            request.session_id,
            request.collected_data
        )
        return ChatResponse(
            message={
                "node_type": "end",
                "label": "对话结束",
                "content": "感谢您的参与！",
                "is_question": False
            },
            is_completed=True,
            next_node_id=None
        )

    if next_node.node_type == "end":
        message = ChatService.process_node_message(next_node)
        ChatService.save_submission(
            db,
            request.flow_id,
            request.session_id,
            request.collected_data
        )
        return ChatResponse(
            message=message,
            is_completed=True,
            next_node_id=None
        )

    message = ChatService.process_node_message(next_node)
    return ChatResponse(
        message=message,
        is_completed=False,
        next_node_id=next_node.id
    )


@router.get("/submissions/{flow_id}", response_model=List[Submission])
def get_submissions(flow_id: int, skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return ChatService.get_submissions(db, flow_id, skip=skip, limit=limit)
