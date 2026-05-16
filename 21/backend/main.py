from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.database import Base, engine
from app.routers import contracts, sign

Base.metadata.create_all(bind=engine)

app = FastAPI(title="电子合同签署平台 API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(contracts.router, prefix="/api/contracts", tags=["contracts"])
app.include_router(sign.router, prefix="/api/sign", tags=["sign"])

@app.get("/api/health")
def health_check():
    return {"status": "ok"}
