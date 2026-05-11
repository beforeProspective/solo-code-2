from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    APP_NAME: str = "Analytics Dashboard"
    APP_VERSION: str = "1.0.0"
    
    SECRET_KEY: str = "your-super-secret-key-change-this-in-production-please-1234567890"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24
    
    DATABASE_URL: str = "sqlite:///./analytics.db"
    
    CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]
    
    RATE_LIMIT: str = "100/minute"
    RATE_LIMIT_PER_USER: str = "500/minute"
    
    BACKEND_URL: str = "http://localhost:8000"
    
    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
