from pydantic import BaseModel, Field, field_validator
from typing import List, Optional
from datetime import datetime

class MeetingCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=1000)
    start_time: str
    end_time: str
    participants: List[str]

    @field_validator('start_time', 'end_time')
    def validate_datetime(cls, v):
        try:
            # Validate ISO format
            # e.g., 2026-07-08T10:00:00 or 2026-07-08T10:00:00.000Z
            # Let's replace 'Z' with '+00:00' to parse timezones if present, or strip timezone if needed.
            cleaned = v.replace('Z', '+00:00')
            datetime.fromisoformat(cleaned)
            return v
        except ValueError:
            raise ValueError("Time must be in valid ISO 8601 format (YYYY-MM-DDTHH:MM:SS)")

    @field_validator('participants')
    def validate_participants(cls, v):
        if not v or len(v) == 0:
            raise ValueError("At least one participant must be specified")
        # Strip whitespace and remove empty strings
        v_cleaned = [p.strip() for p in v if p.strip()]
        if not v_cleaned:
            raise ValueError("Participants list cannot consist only of empty names")
        return v_cleaned

class MeetingOut(BaseModel):
    id: int
    title: str
    description: Optional[str]
    start_time: str
    end_time: str
    participants: List[str]

class CommentCreate(BaseModel):
    author: str = Field(..., min_length=1, max_length=50)
    text: str = Field(..., min_length=1, max_length=500)

class CommentOut(BaseModel):
    id: int
    meeting_id: int
    author: str
    text: str
    created_at: str
