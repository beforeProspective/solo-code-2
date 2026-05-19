from fastapi import APIRouter, UploadFile, File, Depends, Request, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app.schemas.file import FileRecordResponse
from app.services.file_service import FileService

router = APIRouter(prefix="/api/files", tags=["files"])


@router.post("/upload", response_model=FileRecordResponse)
async def upload_file(
    request: Request,
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    client_ip = request.client.host if request.client else "unknown"
    file_record = await FileService.save_upload_file(file, client_ip, db)
    return file_record


@router.get("/{file_id}", response_model=FileRecordResponse)
def get_file(file_id: int, db: Session = Depends(get_db)):
    file_record = FileService.get_file_by_id(file_id, db)
    if not file_record:
        raise HTTPException(status_code=404, detail="File not found")
    return file_record


@router.get("", response_model=List[FileRecordResponse])
def list_files(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return FileService.get_all_files(db, skip, limit)


@router.delete("/{file_id}")
def delete_file(file_id: int, db: Session = Depends(get_db)):
    success = FileService.delete_file(file_id, db)
    if not success:
        raise HTTPException(status_code=404, detail="File not found")
    return {"message": "File deleted successfully"}
