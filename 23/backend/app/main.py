from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database import Base, engine
from app.api import files, shares, downloads, admin

Base.metadata.create_all(bind=engine)

app = FastAPI(title="File Share API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(files.router)
app.include_router(shares.router)
app.include_router(downloads.router)
app.include_router(admin.router)


@app.get("/api/health")
async def health_check():
    return {"status": "healthy"}
