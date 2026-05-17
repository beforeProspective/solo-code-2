from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app.schemas.flow import Flow, FlowCreate, FlowUpdate, FlowDetail
from app.schemas.node import Node, NodeCreate, NodeUpdate
from app.schemas.edge import Edge, EdgeCreate
from app.services.flow_service import FlowService

router = APIRouter(prefix="/api/flows", tags=["flows"])


@router.get("", response_model=List[Flow])
def list_flows(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return FlowService.get_flows(db, skip=skip, limit=limit)


@router.post("", response_model=Flow)
def create_flow(flow_data: FlowCreate, db: Session = Depends(get_db)):
    return FlowService.create_flow(db, flow_data)


@router.get("/{flow_id}", response_model=FlowDetail)
def get_flow(flow_id: int, db: Session = Depends(get_db)):
    flow = FlowService.get_flow(db, flow_id)
    if not flow:
        raise HTTPException(status_code=404, detail="Flow not found")
    nodes = FlowService.get_flow_nodes(db, flow_id)
    edges = FlowService.get_flow_edges(db, flow_id)
    return FlowDetail(
        id=flow.id,
        name=flow.name,
        description=flow.description,
        start_node_id=flow.start_node_id,
        created_at=flow.created_at,
        updated_at=flow.updated_at,
        nodes=nodes,
        edges=edges
    )


@router.put("/{flow_id}", response_model=Flow)
def update_flow(flow_id: int, flow_data: FlowUpdate, db: Session = Depends(get_db)):
    flow = FlowService.update_flow(db, flow_id, flow_data)
    if not flow:
        raise HTTPException(status_code=404, detail="Flow not found")
    return flow


@router.delete("/{flow_id}")
def delete_flow(flow_id: int, db: Session = Depends(get_db)):
    success = FlowService.delete_flow(db, flow_id)
    if not success:
        raise HTTPException(status_code=404, detail="Flow not found")
    return {"message": "Flow deleted successfully"}


@router.post("/{flow_id}/nodes", response_model=Node)
def add_node(flow_id: int, node_data: NodeCreate, db: Session = Depends(get_db)):
    flow = FlowService.get_flow(db, flow_id)
    if not flow:
        raise HTTPException(status_code=404, detail="Flow not found")
    node_data.flow_id = flow_id
    return FlowService.add_node(db, node_data)


@router.put("/nodes/{node_id}", response_model=Node)
def update_node(node_id: str, node_data: NodeUpdate, db: Session = Depends(get_db)):
    node = FlowService.update_node(db, node_id, node_data)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    return node


@router.delete("/nodes/{node_id}")
def delete_node(node_id: str, db: Session = Depends(get_db)):
    success = FlowService.delete_node(db, node_id)
    if not success:
        raise HTTPException(status_code=404, detail="Node not found")
    return {"message": "Node deleted successfully"}


@router.post("/{flow_id}/edges", response_model=Edge)
def add_edge(flow_id: int, edge_data: EdgeCreate, db: Session = Depends(get_db)):
    flow = FlowService.get_flow(db, flow_id)
    if not flow:
        raise HTTPException(status_code=404, detail="Flow not found")
    edge_data.flow_id = flow_id
    return FlowService.add_edge(db, edge_data)


@router.delete("/edges/{edge_id}")
def delete_edge(edge_id: str, db: Session = Depends(get_db)):
    success = FlowService.delete_edge(db, edge_id)
    if not success:
        raise HTTPException(status_code=404, detail="Edge not found")
    return {"message": "Edge deleted successfully"}
