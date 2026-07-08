import sqlite3
import json
import os
from typing import List, Dict, Any, Optional

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "meetings.db")


def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def _migrate(cursor):
    """
    Non-destructive migration: add new columns to existing tables.
    SQLite does not support IF NOT EXISTS for ALTER TABLE — we catch exceptions instead.
    """
    new_cols = [
        ("goal",     "TEXT"),
        ("result",   "TEXT"),
        ("priority", "TEXT DEFAULT 'normal'"),
    ]
    for col, col_type in new_cols:
        try:
            cursor.execute(f"ALTER TABLE meetings ADD COLUMN {col} {col_type}")
        except Exception:
            pass  # Column already exists — that's fine


def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS meetings (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        title      TEXT NOT NULL,
        description TEXT,
        goal       TEXT,
        result     TEXT,
        priority   TEXT NOT NULL DEFAULT 'normal',
        start_time TEXT NOT NULL,
        end_time   TEXT NOT NULL,
        participants TEXT NOT NULL
    )
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS comments (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        meeting_id INTEGER NOT NULL,
        author     TEXT NOT NULL,
        text       TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (meeting_id) REFERENCES meetings (id) ON DELETE CASCADE
    )
    """)

    _migrate(cursor)  # Safe upgrade for existing databases
    conn.commit()
    conn.close()


def _row_to_meeting(row) -> Dict[str, Any]:
    """Convert a DB row to a dict, ensuring new fields have safe defaults."""
    m = dict(row)
    m["participants"] = json.loads(m["participants"])
    m.setdefault("goal", None)
    m.setdefault("result", None)
    if not m.get("priority"):
        m["priority"] = "normal"
    return m


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
    conn.close()
    return [_row_to_meeting(row) for row in rows]


def get_meeting_by_id(meeting_id: int) -> Optional[Dict[str, Any]]:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM meetings WHERE id = ?", (meeting_id,))
    row = cursor.fetchone()
    conn.close()
    return _row_to_meeting(row) if row else None


def create_meeting(
    title: str,
    description: Optional[str],
    goal: Optional[str],
    result: Optional[str],
    priority: str,
    start_time: str,
    end_time: str,
    participants: List[str]
) -> Dict[str, Any]:
    conn = get_db_connection()
    cursor = conn.cursor()
    participants_json = json.dumps(participants, ensure_ascii=False)

    cursor.execute(
        """INSERT INTO meetings
           (title, description, goal, result, priority, start_time, end_time, participants)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (title, description, goal, result, priority, start_time, end_time, participants_json)
    )
    meeting_id = cursor.lastrowid
    conn.commit()
    conn.close()

    return {
        "id": meeting_id, "title": title, "description": description,
        "goal": goal, "result": result, "priority": priority,
        "start_time": start_time, "end_time": end_time, "participants": participants
    }


def update_meeting(
    meeting_id: int,
    title: str,
    description: Optional[str],
    goal: Optional[str],
    result: Optional[str],
    priority: str,
    start_time: str,
    end_time: str,
    participants: List[str]
) -> Optional[Dict[str, Any]]:
    conn = get_db_connection()
    cursor = conn.cursor()
    participants_json = json.dumps(participants, ensure_ascii=False)

    cursor.execute(
        """UPDATE meetings
           SET title=?, description=?, goal=?, result=?, priority=?,
               start_time=?, end_time=?, participants=?
           WHERE id=?""",
        (title, description, goal, result, priority, start_time, end_time, participants_json, meeting_id)
    )
    affected = cursor.rowcount
    conn.commit()
    conn.close()

    if affected == 0:
        return None
    return {
        "id": meeting_id, "title": title, "description": description,
        "goal": goal, "result": result, "priority": priority,
        "start_time": start_time, "end_time": end_time, "participants": participants
    }


def delete_meeting(meeting_id: int) -> bool:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM meetings WHERE id = ?", (meeting_id,))
    affected = cursor.rowcount
    conn.commit()
    conn.close()
    return affected > 0


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
    return {"id": comment_id, "meeting_id": meeting_id, "author": author,
            "text": text, "created_at": created_at}


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
