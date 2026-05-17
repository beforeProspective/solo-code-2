from sqlalchemy.orm import Session
from typing import Optional, Dict, Any, Tuple
from app.models.flow import Flow
from app.models.node import Node
from app.models.edge import Edge
from app.models.submission import Submission
from app.schemas.submission import SubmissionCreate


class ChatService:
    @staticmethod
    def get_start_node(db: Session, flow_id: int) -> Optional[Node]:
        flow = db.query(Flow).filter(Flow.id == flow_id).first()
        if not flow:
            return None
        if flow.start_node_id:
            return db.query(Node).filter(Node.id == flow.start_node_id).first()
        nodes = db.query(Node).filter(Node.flow_id == flow_id).all()
        if nodes:
            return nodes[0]
        return None

    @staticmethod
    def get_next_node(db: Session, flow_id: int, current_node_id: str, answer: Optional[str] = None) -> Optional[Node]:
        edges = db.query(Edge).filter(
            Edge.flow_id == flow_id,
            Edge.source == current_node_id
        ).all()
        if not edges:
            return None
        if len(edges) == 1:
            return db.query(Node).filter(Node.id == edges[0].target).first()
        for edge in edges:
            if edge.source_handle == "yes" and answer and answer.lower() in ["是", "yes", "y", "true", "1"]:
                return db.query(Node).filter(Node.id == edge.target).first()
            if edge.source_handle == "no" and answer and answer.lower() in ["否", "no", "n", "false", "0"]:
                return db.query(Node).filter(Node.id == edge.target).first()
        return db.query(Node).filter(Node.id == edges[0].target).first()

    @staticmethod
    def process_node_message(node: Node) -> Dict[str, Any]:
        return {
            "node_id": node.id,
            "node_type": node.node_type,
            "label": node.label,
            "content": node.content,
            "field_name": node.field_name,
            "is_question": node.node_type in ["input", "select", "confirm"]
        }

    @staticmethod
    def save_submission(db: Session, flow_id: int, session_id: str, data: Dict[str, Any]) -> Submission:
        submission_data = SubmissionCreate(
            flow_id=flow_id,
            session_id=session_id,
            data=data
        )
        db_submission = Submission(**submission_data.model_dump())
        db.add(db_submission)
        db.commit()
        db.refresh(db_submission)
        return db_submission

    @staticmethod
    def get_submissions(db: Session, flow_id: int, skip: int = 0, limit: int = 100):
        return db.query(Submission).filter(Submission.flow_id == flow_id).offset(skip).limit(limit).all()
