from fastapi import FastAPI, HTTPException, status, Query
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from datetime import datetime
from typing import List, Optional
import json

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
# Endpoints
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


@app.post("/api/meetings", response_model=schemas.MeetingOut, status_code=status.HTTP_201_CREATED)
def schedule_meeting(meeting: schemas.MeetingCreate):
    if meeting.start_time >= meeting.end_time:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Start time must be strictly before end time"
        )

    conflicts = _check_conflicts(meeting.start_time, meeting.end_time, meeting.participants)
    if conflicts:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "message": "Conflict detected: some participants are already booked in other meetings during this time range.",
                "conflicts": conflicts
            }
        )

    try:
        return database.create_meeting(
            title=meeting.title,
            description=meeting.description,
            start_time=meeting.start_time,
            end_time=meeting.end_time,
            participants=meeting.participants
        )
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
