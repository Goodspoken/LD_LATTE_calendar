import sqlite3
import json
import os
from typing import List, Dict, Any, Optional

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "meetings.db")


def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    # FIX: SQLite does NOT enforce foreign keys by default.
    # This PRAGMA enables ON DELETE CASCADE so comments are removed with their meeting.
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS meetings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        participants TEXT NOT NULL
    )
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        meeting_id INTEGER NOT NULL,
        author TEXT NOT NULL,
        text TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (meeting_id) REFERENCES meetings (id) ON DELETE CASCADE
    )
    """)

    conn.commit()
    conn.close()


def get_all_meetings(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    limit: int = 200,
    offset: int = 0
) -> List[Dict[str, Any]]:
    conn = get_db_connection()
    cursor = conn.cursor()

    query = "SELECT * FROM meetings"
    params: list = []

    conditions = []
    if start_date:
        conditions.append("end_time >= ?")
        params.append(start_date)
    if end_date:
        conditions.append("start_time <= ?")
        params.append(end_date)

    if conditions:
        query += " WHERE " + " AND ".join(conditions)

    query += " ORDER BY start_time ASC LIMIT ? OFFSET ?"
    params.extend([limit, offset])

    cursor.execute(query, params)
    rows = cursor.fetchall()

    meetings = []
    for row in rows:
        meeting = dict(row)
        meeting["participants"] = json.loads(meeting["participants"])
        meetings.append(meeting)

    conn.close()
    return meetings


def get_meeting_by_id(meeting_id: int) -> Optional[Dict[str, Any]]:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM meetings WHERE id = ?", (meeting_id,))
    row = cursor.fetchone()
    conn.close()

    if row:
        meeting = dict(row)
        meeting["participants"] = json.loads(meeting["participants"])
        return meeting
    return None


def create_meeting(
    title: str,
    description: Optional[str],
    start_time: str,
    end_time: str,
    participants: List[str]
) -> Dict[str, Any]:
    conn = get_db_connection()
    cursor = conn.cursor()

    participants_json = json.dumps(participants, ensure_ascii=False)

    cursor.execute(
        "INSERT INTO meetings (title, description, start_time, end_time, participants) VALUES (?, ?, ?, ?, ?)",
        (title, description, start_time, end_time, participants_json)
    )
    meeting_id = cursor.lastrowid
    conn.commit()
    conn.close()

    return {
        "id": meeting_id,
        "title": title,
        "description": description,
        "start_time": start_time,
        "end_time": end_time,
        "participants": participants
    }


def update_meeting(
    meeting_id: int,
    title: str,
    description: Optional[str],
    start_time: str,
    end_time: str,
    participants: List[str]
) -> Optional[Dict[str, Any]]:
    """Update an existing meeting. Returns None if meeting_id does not exist."""
    conn = get_db_connection()
    cursor = conn.cursor()

    participants_json = json.dumps(participants, ensure_ascii=False)

    cursor.execute(
        "UPDATE meetings SET title=?, description=?, start_time=?, end_time=?, participants=? WHERE id=?",
        (title, description, start_time, end_time, participants_json, meeting_id)
    )
    affected = cursor.rowcount
    conn.commit()
    conn.close()

    if affected == 0:
        return None

    return {
        "id": meeting_id,
        "title": title,
        "description": description,
        "start_time": start_time,
        "end_time": end_time,
        "participants": participants
    }


def delete_meeting(meeting_id: int) -> bool:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM meetings WHERE id = ?", (meeting_id,))
    affected_rows = cursor.rowcount
    conn.commit()
    conn.close()
    return affected_rows > 0


def add_comment(meeting_id: int, author: str, text: str, created_at: str) -> Dict[str, Any]:
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute(
        "INSERT INTO comments (meeting_id, author, text, created_at) VALUES (?, ?, ?, ?)",
        (meeting_id, author, text, created_at)
    )
    comment_id = cursor.lastrowid
    conn.commit()
    conn.close()

    return {
        "id": comment_id,
        "meeting_id": meeting_id,
        "author": author,
        "text": text,
        "created_at": created_at
    }


def get_comments_for_meeting(meeting_id: int) -> List[Dict[str, Any]]:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT * FROM comments WHERE meeting_id = ? ORDER BY created_at ASC",
        (meeting_id,)
    )
    rows = cursor.fetchall()
    conn.close()

    return [dict(row) for row in rows]
