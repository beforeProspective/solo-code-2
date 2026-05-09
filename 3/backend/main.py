from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import engine, Base, SessionLocal
from routers import planets, events
from seed import seed_data

Base.metadata.create_all(bind=engine)

app = FastAPI(title="太空探索科普站 API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(planets.router)
app.include_router(events.router)


@app.on_event("startup")
def startup_event():
    db = SessionLocal()
    try:
        seed_data(db)
    finally:
        db.close()


@app.get("/")
def root():
    return {
        "message": "Welcome to Space Explorer API",
        "version": "1.0.0",
        "endpoints": {
            "planets": "/api/planets",
            "events": "/api/events",
            "upcoming_events": "/api/events/upcoming"
        }
    }
