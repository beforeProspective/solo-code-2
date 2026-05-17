from sqlalchemy.orm import Session
from typing import List, Optional
from app.models.flow import Flow
from app.models.node import Node
from app.models.edge import Edge
from app.schemas.flow import FlowCreate, FlowUpdate
from app.schemas.node import NodeCreate, NodeUpdate
from app.schemas.edge import EdgeCreate, EdgeUpdate


class FlowService:
    @staticmethod
    def get_flows(db: Session, skip: int = 0, limit: int = 100) -> List[Flow]:
        return db.query(Flow).offset(skip).limit(limit).all()

    @staticmethod
    def get_flow(db: Session, flow_id: int) -> Optional[Flow]:
        return db.query(Flow).filter(Flow.id == flow_id).first()

    @staticmethod
    def create_flow(db: Session, flow_data: FlowCreate) -> Flow:
        db_flow = Flow(**flow_data.model_dump())
        db.add(db_flow)
        db.commit()
        db.refresh(db_flow)
        return db_flow

    @staticmethod
    def update_flow(db: Session, flow_id: int, flow_data: FlowUpdate) -> Optional[Flow]:
        db_flow = FlowService.get_flow(db, flow_id)
        if db_flow:
            update_data = flow_data.model_dump(exclude_unset=True)
            for key, value in update_data.items():
                setattr(db_flow, key, value)
            db.commit()
            db.refresh(db_flow)
        return db_flow

    @staticmethod
    def delete_flow(db: Session, flow_id: int) -> bool:
        db_flow = FlowService.get_flow(db, flow_id)
        if db_flow:
            db.query(Node).filter(Node.flow_id == flow_id).delete()
            db.query(Edge).filter(Edge.flow_id == flow_id).delete()
            db.delete(db_flow)
            db.commit()
            return True
        return False

    @staticmethod
    def get_flow_nodes(db: Session, flow_id: int) -> List[Node]:
        return db.query(Node).filter(Node.flow_id == flow_id).all()

    @staticmethod
    def get_flow_edges(db: Session, flow_id: int) -> List[Edge]:
        return db.query(Edge).filter(Edge.flow_id == flow_id).all()

    @staticmethod
    def add_node(db: Session, node_data: NodeCreate) -> Node:
        db_node = Node(**node_data.model_dump())
        db.add(db_node)
        db.commit()
        db.refresh(db_node)
        return db_node

    @staticmethod
    def update_node(db: Session, node_id: str, node_data: NodeUpdate) -> Optional[Node]:
        db_node = db.query(Node).filter(Node.id == node_id).first()
        if db_node:
            update_data = node_data.model_dump(exclude_unset=True)
            for key, value in update_data.items():
                setattr(db_node, key, value)
            db.commit()
            db.refresh(db_node)
        return db_node

    @staticmethod
    def delete_node(db: Session, node_id: str) -> bool:
        db_node = db.query(Node).filter(Node.id == node_id).first()
        if db_node:
            db.query(Edge).filter(
                (Edge.source == node_id) | (Edge.target == node_id)
            ).delete()
            db.delete(db_node)
            db.commit()
            return True
        return False

    @staticmethod
    def add_edge(db: Session, edge_data: EdgeCreate) -> Edge:
        db_edge = Edge(**edge_data.model_dump())
        db.add(db_edge)
        db.commit()
        db.refresh(db_edge)
        return db_edge

    @staticmethod
    def delete_edge(db: Session, edge_id: str) -> bool:
        db_edge = db.query(Edge).filter(Edge.id == edge_id).first()
        if db_edge:
            db.delete(db_edge)
            db.commit()
            return True
        return False
