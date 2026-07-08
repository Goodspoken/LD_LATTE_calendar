from fastapi import FastAPI, HTTPException, status, Query, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
from datetime import datetime
from typing import List, Optional
import json
import os
import shutil
import uuid

from app import database, schemas


# ──────────────────────────────────────────────────────────────
# Lifespan (replaces deprecated @app.on_event("startup"))
# ──────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize the SQLite database on startup."""
    database.init_db()
    yield


app = FastAPI(
    title="LD Latte Calendar API",
    description="Backend API for scheduling meetings and preventing overlapping participant bookings",
    version="1.1.0",
    lifespan=lifespan
)

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

# FIX: allow_credentials=True is incompatible with allow_origins=["*"].
# Browsers reject credentialed requests to wildcard origins. Set to False.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ──────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────
def _check_conflicts(
    start_time: str,
    end_time: str,
    participants: List[str],
    exclude_id: Optional[int] = None
) -> list:
    """
    Return a list of conflict dicts for participants who are already booked
    in overlapping meetings during [start_time, end_time).

    FIX: Connection is always closed via try/finally to prevent leaks.
    """
    conn = database.get_db_connection()
    cursor = conn.cursor()
    try:
        if exclude_id is not None:
            cursor.execute(
                "SELECT * FROM meetings WHERE start_time < ? AND end_time > ? AND id != ?",
                (end_time, start_time, exclude_id)
            )
        else:
            cursor.execute(
                "SELECT * FROM meetings WHERE start_time < ? AND end_time > ?",
                (end_time, start_time)
            )
        overlapping_rows = cursor.fetchall()
    finally:
        conn.close()

    conflicts = []
    new_participants_set = {p.lower() for p in participants}

    for row in overlapping_rows:
        existing = dict(row)
        existing_participants = json.loads(existing["participants"])
        for p in existing_participants:
            if p.lower() in new_participants_set:
                conflicts.append({
                    "participant": p,
                    "conflicting_meeting": {
                        "id": existing["id"],
                        "title": existing["title"],
                        "start_time": existing["start_time"],
                        "end_time": existing["end_time"]
                    }
                })
    return conflicts


# ──────────────────────────────────────────────────────────────
# Users Endpoints
# ──────────────────────────────────────────────────────────────

@app.get("/api/users", response_model=List[schemas.UserResponse])
def get_users():
    try:
        return database.get_all_users()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error: {str(e)}"
        )


@app.post("/api/users", response_model=schemas.UserResponse, status_code=status.HTTP_201_CREATED)
def create_user(user: schemas.UserCreate):
    try:
        new_user = database.add_user(user.name)
        if not new_user:
            raise HTTPException(status_code=400, detail="User already exists")
        return new_user
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error: {str(e)}"
        )

@app.delete("/api/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(user_id: int):
    try:
        if not database.delete_user(user_id):
            raise HTTPException(status_code=404, detail="User not found")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error: {str(e)}"
        )

# ──────────────────────────────────────────────────────────────
# Meetings Endpoints
# ──────────────────────────────────────────────────────────────

@app.get("/api/meetings", response_model=List[schemas.MeetingOut])
def get_meetings(
    start: Optional[str] = Query(None, description="Filter: meetings whose end_time >= this ISO datetime"),
    end: Optional[str] = Query(None, description="Filter: meetings whose start_time <= this ISO datetime"),
    limit: int = Query(200, ge=1, le=1000, description="Max number of meetings to return"),
    offset: int = Query(0, ge=0, description="Number of meetings to skip (pagination)")
):
    try:
        return database.get_all_meetings(start_date=start, end_date=end, limit=limit, offset=offset)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error: {str(e)}"
        )


import calendar

def _add_months(dt, months):
    new_month = dt.month - 1 + months
    year = dt.year + new_month // 12
    month = new_month % 12 + 1
    day = dt.day
    while True:
        try:
            return dt.replace(year=year, month=month, day=day)
        except ValueError:
            day -= 1

@app.post("/api/meetings", status_code=status.HTTP_201_CREATED)
def schedule_meeting(meeting: schemas.MeetingCreate):
    from datetime import datetime, timedelta

    if meeting.start_time >= meeting.end_time:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Start time must be strictly before end time"
        )
    
    # Auto-add any new users
    for p in meeting.participants:
        database.add_user(p)

    instances = []
    base_start = datetime.fromisoformat(meeting.start_time.replace('Z', '+00:00'))
    base_end = datetime.fromisoformat(meeting.end_time.replace('Z', '+00:00'))
    
    if meeting.recurrence == "none" or not meeting.recurrence_end_date:
        instances.append((base_start, base_end))
    else:
        end_limit = datetime.fromisoformat(meeting.recurrence_end_date)
        # Limit to 50 occurrences max to avoid abuse/bugs
        curr_start = base_start
        curr_end = base_end
        count = 0
        while curr_start.date() <= end_limit.date() and count < 50:
            instances.append((curr_start, curr_end))
            count += 1
            if meeting.recurrence == "daily":
                curr_start += timedelta(days=1)
                curr_end += timedelta(days=1)
            elif meeting.recurrence == "weekly":
                curr_start += timedelta(weeks=1)
                curr_end += timedelta(weeks=1)
            elif meeting.recurrence == "monthly":
                curr_start = _add_months(curr_start, 1)
                curr_end = _add_months(curr_end, 1)
            else:
                break

    all_conflicts = []
    for s_dt, e_dt in instances:
        c = _check_conflicts(s_dt.isoformat(), e_dt.isoformat(), meeting.participants)
        if c:
            for conf in c:
                conf["instance_date"] = s_dt.isoformat()
            all_conflicts.extend(c)
    
    if all_conflicts:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "message": "Conflict detected for one or more occurrences.",
                "conflicts": all_conflicts
            }
        )

    results = []
    try:
        for s_dt, e_dt in instances:
            res = database.create_meeting(
                title=meeting.title,
                description=meeting.description,
                goal=meeting.goal,
                result=meeting.result,
                priority=meeting.priority,
                start_time=s_dt.isoformat(),
                end_time=e_dt.isoformat(),
                participants=meeting.participants
            )
            results.append(res)
        return results if len(results) > 1 else results[0]
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create meeting: {str(e)}"
        )


@app.put("/api/meetings/{meeting_id}", response_model=schemas.MeetingOut)
def update_meeting(meeting_id: int, meeting: schemas.MeetingUpdate):
    """Edit an existing meeting. Rechecks participant conflicts excluding this meeting itself."""
    existing = database.get_meeting_by_id(meeting_id)
    if not existing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Meeting with ID {meeting_id} not found"
        )

    if meeting.start_time >= meeting.end_time:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Start time must be strictly before end time"
        )
        
    for p in meeting.participants:
        database.add_user(p)

    conflicts = _check_conflicts(
        meeting.start_time, meeting.end_time, meeting.participants,
        exclude_id=meeting_id  # Don't conflict with self
    )
    if conflicts:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "message": "Conflict detected: some participants are already booked during this time range.",
                "conflicts": conflicts
            }
        )

    try:
        result = database.update_meeting(
            meeting_id=meeting_id,
            title=meeting.title,
            description=meeting.description,
            goal=meeting.goal,
            result=meeting.result,
            priority=meeting.priority,
            start_time=meeting.start_time,
            end_time=meeting.end_time,
            participants=meeting.participants
        )
        if not result:
            raise HTTPException(status_code=404, detail="Meeting disappeared during update")
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update meeting: {str(e)}"
        )


@app.delete("/api/meetings/{meeting_id}", status_code=status.HTTP_204_NO_CONTENT)
def cancel_meeting(meeting_id: int):
    meeting = database.get_meeting_by_id(meeting_id)
    if not meeting:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Meeting with ID {meeting_id} not found"
        )

    try:
        database.delete_meeting(meeting_id)
        # Comments are removed automatically via ON DELETE CASCADE (PRAGMA foreign_keys = ON)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete meeting: {str(e)}"
        )


@app.get("/api/meetings/{meeting_id}/comments", response_model=List[schemas.CommentOut])
def get_meeting_comments(meeting_id: int):
    if not database.get_meeting_by_id(meeting_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Meeting with ID {meeting_id} not found"
        )

    try:
        return database.get_comments_for_meeting(meeting_id)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch comments: {str(e)}"
        )


@app.post("/api/meetings/{meeting_id}/comments", response_model=schemas.CommentOut, status_code=status.HTTP_201_CREATED)
def post_comment(meeting_id: int, comment: schemas.CommentCreate):
    if not database.get_meeting_by_id(meeting_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Meeting with ID {meeting_id} not found"
        )

    created_at = datetime.utcnow().isoformat() + "Z"
    try:
        return database.add_comment(
            meeting_id=meeting_id,
            author=comment.author,
            text=comment.text,
            created_at=created_at
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save comment: {str(e)}"
        )


@app.post("/api/meetings/{meeting_id}/attachments", response_model=schemas.AttachmentOut, status_code=status.HTTP_201_CREATED)
async def upload_attachment(meeting_id: int, file: UploadFile = File(...)):
    if not database.get_meeting_by_id(meeting_id):
        raise HTTPException(status_code=404, detail="Meeting not found")
        
    allowed_extensions = {".md", ".txt", ".doc", ".docx", ".pdf"}
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in allowed_extensions:
        raise HTTPException(status_code=400, detail=f"File extension {ext} not allowed. Allowed: {', '.join(allowed_extensions)}")
        
    safe_filename = f"{uuid.uuid4().hex}{ext}"
    file_path = os.path.join(UPLOAD_DIR, safe_filename)
    
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not save file: {e}")
        
    try:
        now_str = datetime.utcnow().isoformat() + "Z"
        # We serve from /uploads/
        url_path = f"/uploads/{safe_filename}"
        new_att = database.add_attachment(meeting_id, file.filename, url_path, now_str)
        return new_att
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")

# Serve frontend static files directly from the backend
from fastapi.staticfiles import StaticFiles
import os

frontend_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "frontend"))
if os.path.exists(frontend_path):
    app.mount("/", StaticFiles(directory=frontend_path, html=True), name="frontend")

