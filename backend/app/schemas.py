from pydantic import BaseModel, Field, field_validator
from typing import List, Optional
from datetime import datetime


class _MeetingBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=2000)
    goal: Optional[str] = Field(None, max_length=1000, description="Цель встречи")
    result: Optional[str] = Field(None, max_length=1000, description="Результат встречи")
    priority: str = Field("normal", description="Приоритет: 'normal' или 'important'")
    start_time: str
    end_time: str
    participants: List[str]

    @field_validator('start_time', 'end_time')
    def validate_datetime(cls, v):
        try:
            datetime.fromisoformat(v.replace('Z', '+00:00'))
            return v
        except ValueError:
            raise ValueError("Time must be in valid ISO 8601 format (YYYY-MM-DDTHH:MM:SS)")

    @field_validator('participants')
    def validate_participants(cls, v):
        if not v:
            raise ValueError("At least one participant required")
        cleaned = [p.strip() for p in v if p.strip()]
        if not cleaned:
            raise ValueError("Participants cannot consist only of empty strings")
        return cleaned

    @field_validator('priority')
    def validate_priority(cls, v):
        if v not in ('normal', 'important'):
            raise ValueError("Priority must be 'normal' or 'important'")
        return v


class MeetingCreate(_MeetingBase):
    recurrence: Optional[str] = Field("none", description="none, daily, weekly, monthly")
    recurrence_end_date: Optional[str] = Field(None, description="ISO Date string (YYYY-MM-DD)")

    @field_validator('recurrence')
    def validate_recurrence(cls, v):
        if v and v not in ('none', 'daily', 'weekly', 'monthly'):
            raise ValueError("Invalid recurrence value")
        return v or "none"


class MeetingUpdate(_MeetingBase):
    pass


class UserCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)


class UserResponse(BaseModel):
    id: int
    name: str


class AttachmentOut(BaseModel):
    id: int
    meeting_id: int
    filename: str
    file_path: str
    uploaded_at: str


class MeetingOut(BaseModel):
    id: int
    title: str
    description: Optional[str]
    goal: Optional[str]
    result: Optional[str]
    priority: str
    start_time: str
    end_time: str
    participants: List[str]
    attachments: List[AttachmentOut] = []


class CommentCreate(BaseModel):
    author: str = Field(..., min_length=1, max_length=50)
    text: str = Field(..., min_length=1, max_length=500)


class CommentOut(BaseModel):
    id: int
    meeting_id: int
    author: str
    text: str
    created_at: str
