from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, Index
from sqlalchemy.orm import relationship
from datetime import datetime
from .database import Base


class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    username = Column(String(100), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    sites = relationship("Site", back_populates="owner", cascade="all, delete-orphan")


class Site(Base):
    __tablename__ = "sites"
    
    id = Column(Integer, primary_key=True, index=True)
    domain = Column(String(255), index=True, nullable=False)
    site_id = Column(String(64), unique=True, index=True, nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    owner = relationship("User", back_populates="sites")
    pageviews = relationship("PageView", back_populates="site", cascade="all, delete-orphan")


class PageView(Base):
    __tablename__ = "pageviews"
    
    id = Column(Integer, primary_key=True, index=True)
    site_id = Column(Integer, ForeignKey("sites.id"), nullable=False)
    path = Column(String(1000), index=True)
    referrer = Column(String(1000), nullable=True)
    country = Column(String(100), index=True, nullable=True)
    device_type = Column(String(50), index=True, nullable=True)
    browser = Column(String(100), nullable=True)
    os = Column(String(100), nullable=True)
    screen_width = Column(Integer, nullable=True)
    screen_height = Column(Integer, nullable=True)
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)
    
    site = relationship("Site", back_populates="pageviews")
    
    __table_args__ = (
        Index('ix_pageviews_site_timestamp', 'site_id', 'timestamp'),
    )


class ShareLink(Base):
    __tablename__ = "share_links"
    
    id = Column(Integer, primary_key=True, index=True)
    site_id = Column(Integer, ForeignKey("sites.id"), nullable=False)
    token = Column(String(64), unique=True, index=True, nullable=False)
    expires_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
