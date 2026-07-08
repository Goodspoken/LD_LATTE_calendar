from fastapi import FastAPI, HTTPException, status, Query
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime
from typing import List, Optional

from app import database, schemas

app = FastAPI(
    title="Interactive Meeting Calendar API",
    description="Backend API for scheduling meetings and preventing overlapping participant bookings",
    version="1.0.0"
)

# Enable CORS to allow the frontend (hosted anywhere) to communicate with this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def startup_event():
    # Initialize SQLite database and create tables if not exist
    database.init_db()

@app.get("/api/meetings", response_model=List[schemas.MeetingOut])
def get_meetings(
    start: Optional[str] = Query(None, description="Filter meetings starting after this ISO date"),
    end: Optional[str] = Query(None, description="Filter meetings ending before this ISO date")
):
    try:
        return database.get_all_meetings(start_date=start, end_date=end)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error: {str(e)}"
        )

@app.post("/api/meetings", response_model=schemas.MeetingOut, status_code=status.HTTP_201_CREATED)
def schedule_meeting(meeting: schemas.MeetingCreate):
    # Ensure start_time is before end_time
    if meeting.start_time >= meeting.end_time:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Start time must be strictly before end time"
        )

    # 1. Fetch potential overlapping meetings from DB
    # A meeting overlaps if existing_start < new_end AND existing_end > new_start
    conn = database.get_db_connection()
    cursor = conn.cursor()
    
    # Simple check for any meeting overlapping this time window
    cursor.execute(
        "SELECT * FROM meetings WHERE start_time < ? AND end_time > ?",
        (meeting.end_time, meeting.start_time)
    )
    overlapping_rows = cursor.fetchall()
    conn.close()

    # 2. Check if any participant overlaps
    conflicts = []
    new_participants_set = {p.lower() for p in meeting.participants}

    import json
    for row in overlapping_rows:
        existing_meeting = dict(row)
        existing_participants = json.loads(existing_meeting["participants"])
        
        # Check intersection
        for p in existing_participants:
            if p.lower() in new_participants_set:
                conflicts.append({
                    "participant": p,
                    "conflicting_meeting": {
                        "id": existing_meeting["id"],
                        "title": existing_meeting["title"],
                        "start_time": existing_meeting["start_time"],
                        "end_time": existing_meeting["end_time"]
                    }
                })

    if conflicts:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "message": "Conflict detected: some participants are already booked in other meetings during this time range.",
                "conflicts": conflicts
            }
        )

    # 3. Create the meeting
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

@app.delete("/api/meetings/{meeting_id}", status_code=status.HTTP_204_NO_CONTENT)
def cancel_meeting(meeting_id: int):
    # Verify meeting exists
    meeting = database.get_meeting_by_id(meeting_id)
    if not meeting:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Meeting with ID {meeting_id} not found"
        )
    
    try:
        database.delete_meeting(meeting_id)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete meeting: {str(e)}"
        )

@app.get("/api/meetings/{meeting_id}/comments", response_model=List[schemas.CommentOut])
def get_meeting_comments(meeting_id: int):
    # Verify meeting exists
    meeting = database.get_meeting_by_id(meeting_id)
    if not meeting:
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
    # Verify meeting exists
    meeting = database.get_meeting_by_id(meeting_id)
    if not meeting:
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
