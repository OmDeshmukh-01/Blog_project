from sqlalchemy import Column, Integer, String, Text, DateTime
import datetime
from database import Base

class Blog(Base):
    __tablename__ = "blogs"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, index=True)
    topic = Column(String)
    genre = Column(String)
    content = Column(Text)
    thread_id = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
