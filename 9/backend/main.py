import traceback
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.database import engine, Base
from app.routers import auth, bookmarks, categories, tags, import_export, public_lists

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Bookmark Manager API", version="1.0.0")

@app.middleware("http")
async def error_handling_middleware(request: Request, call_next):
    try:
        return await call_next(request)
    except Exception as e:
        error_traceback = traceback.format_exc()
        print(f"ERROR: {str(e)}")
        print(f"TRACEBACK: {error_traceback}")
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"detail": str(e), "traceback": error_traceback}
        )

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

app.include_router(auth.router)
app.include_router(bookmarks.router)
app.include_router(categories.router)
app.include_router(tags.router)
app.include_router(import_export.router)
app.include_router(public_lists.router)

@app.get("/")
async def root():
    return {"message": "Bookmark Manager API is running"}

@app.get("/health")
async def health_check():
    return {"status": "healthy"}
