from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import Session

from app.database import Base, configure_sqlite, get_db
from app.main import app
from app.migrations import ensure_stable_ids
from app.models import Course, Task
from sqlalchemy.schema import CreateTable, CreateIndex
from sqlalchemy.dialects import sqlite


@pytest.fixture
def client(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'test.db'}", connect_args={"check_same_thread": False})
    event.listen(engine, "connect", configure_sqlite)
    Base.metadata.create_all(engine)

    def test_db():
        with Session(engine) as db:
            yield db

    app.dependency_overrides[get_db] = test_db
    with TestClient(app) as client:
        yield client
    app.dependency_overrides.clear()
    engine.dispose()


def course(client):
    response = client.post("/api/courses", json={"name": "Data Structures", "color": "#A99BFF", "syllabus": "Trees and graphs"})
    assert response.status_code == 201
    return response.json()


def task(client, course_id, **overrides):
    payload = {"course_id": course_id, "title": "Implement a binary tree", "due_at": "2026-09-15T21:00:00+04:00", **overrides}
    response = client.post("/api/tasks", json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def focus_payload(task_id):
    end = datetime.now(timezone.utc)
    return {"client_session_id": str(uuid4()), "task_id": task_id, "started_at": (end - timedelta(minutes=25)).isoformat(), "ended_at": end.isoformat(), "elapsed_seconds": 1500}


def test_course_and_task_crud_progress_and_dates(client):
    c = course(client)
    assert c["progress"] == 0
    t1 = task(client, c["id"])
    t2 = task(client, c["id"], title="Graph quiz", task_type="quiz")
    assert t1["due_at"] == "2026-09-15T17:00:00Z"
    assert client.patch(f"/api/tasks/{t1['id']}", json={"status": "completed"}).status_code == 200
    updated = client.get(f"/api/courses/{c['id']}").json()
    assert updated["progress"] == 50
    assert updated["completed_tasks"] == 1
    assert len(client.get("/api/tasks", params={"status": "completed", "course_id": c["id"]}).json()) == 1
    assert client.patch(f"/api/courses/{c['id']}", json={"name": "Algorithms", "syllabus": "Dynamic programming"}).json()["name"] == "Algorithms"
    assert client.delete(f"/api/tasks/{t2['id']}").status_code == 204
    assert client.get(f"/api/courses/{c['id']}").json()["progress"] == 100
    assert client.delete(f"/api/courses/{c['id']}").status_code == 204
    assert client.get("/api/tasks").json() == []


def test_checklist_progress_order_and_independent_status(client):
    t = task(client, course(client)["id"], task_type="project")
    a = client.post(f"/api/tasks/{t['id']}/subtasks", json={"title": "Second", "position": 1}).json()
    b = client.post(f"/api/tasks/{t['id']}/subtasks", json={"title": "First", "position": 0}).json()
    assert client.patch(f"/api/subtasks/{a['id']}", json={"is_completed": True, "title": "Tests pass"}).status_code == 200
    read = client.get(f"/api/tasks/{t['id']}").json()
    assert [s["id"] for s in read["subtasks"]] == [b["id"], a["id"]]
    assert read["checklist_progress"] == 50
    client.patch(f"/api/subtasks/{b['id']}", json={"is_completed": True})
    read = client.get(f"/api/tasks/{t['id']}").json()
    assert read["checklist_progress"] == 100
    assert read["status"] == "not_started"
    assert client.delete(f"/api/subtasks/{a['id']}").status_code == 204


def test_focus_idempotency_totals_and_cascade_history(client):
    c = course(client)
    t = task(client, c["id"])
    sub = client.post(f"/api/tasks/{t['id']}/subtasks", json={"title": "Research"}).json()
    payload = focus_payload(t["id"])
    first = client.post("/api/focus-sessions", json=payload)
    assert first.status_code == 201, first.text
    retry = client.post("/api/focus-sessions", json=payload)
    assert retry.status_code == 200
    assert first.json()["id"] == retry.json()["id"]
    assert client.get(f"/api/tasks/{t['id']}").json()["focus_seconds"] == 1500
    assert client.get("/api/tasks").json()[0]["focus_seconds"] == 1500
    assert client.post("/api/focus-sessions", json={**payload, "elapsed_seconds": 100}).status_code == 409
    client.delete(f"/api/courses/{c['id']}")
    assert client.patch(f"/api/subtasks/{sub['id']}", json={"title": "Gone"}).status_code == 404
    history = client.get("/api/focus-sessions").json()
    assert len(history) == 1 and history[0]["task_id"] is None
    assert client.post("/api/focus-sessions", json=payload).status_code == 200
    replacement = task(client, course(client)["id"])
    assert replacement["id"] != t["id"]
    assert client.post("/api/focus-sessions", json=focus_payload(t["id"])).status_code == 404


@pytest.mark.parametrize("change", [
    {"title": "   "}, {"due_at": "2026-09-15T12:00:00"}, {"priority": "critical"},
    {"status": "done"}, {"task_type": "essay"}, {"title": "a" * 201},
])
def test_invalid_tasks_rejected(client, change):
    c = course(client)
    payload = {"course_id": c["id"], "title": "A task", "due_at": "2026-09-15T12:00:00Z", **change}
    assert client.post("/api/tasks", json=payload).status_code == 422


def test_missing_references_and_null_patch(client):
    assert client.post("/api/tasks", json={"course_id": 999, "title": "Missing course", "due_at": "2026-09-15T12:00:00Z"}).status_code == 404
    c = course(client)
    t = task(client, c["id"])
    assert client.patch(f"/api/tasks/{t['id']}", json={"due_at": None}).status_code == 422
    assert client.patch(f"/api/tasks/{t['id']}", json={"course_id": 999}).status_code == 404
    assert client.post("/api/courses", json={"name": "Invalid", "color": "red"}).status_code == 422
    assert client.post("/api/courses", json={"name": "    "}).status_code == 422
    assert client.get("/api/health").json() == {"status": "ok"}


def test_bad_focus_intervals(client):
    payload = focus_payload(None)
    assert client.post("/api/focus-sessions", json={**payload, "elapsed_seconds": -1}).status_code == 422
    assert client.post("/api/focus-sessions", json={**payload, "started_at": payload["ended_at"]}).status_code == 422
    assert client.post("/api/focus-sessions", json={**payload, "elapsed_seconds": 1501}).status_code == 422
    assert client.post("/api/focus-sessions", json={**payload, "client_session_id": "invalid"}).status_code == 422


def test_database_enforces_foreign_keys(client):
    session = next(app.dependency_overrides[get_db]())
    with session:
        assert session.scalar(text("PRAGMA foreign_keys")) == 1
        assert session.execute(text("PRAGMA foreign_key_check")).all() == []


def test_initial_schema_upgrade_preserves_records_and_prevents_id_reuse(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'legacy.db'}")
    event.listen(engine, "connect", configure_sqlite)
    with engine.begin() as connection:
        for table in Base.metadata.sorted_tables:
            connection.exec_driver_sql(str(CreateTable(table).compile(dialect=sqlite.dialect())).replace(" AUTOINCREMENT", ""))
            for index in table.indexes:
                connection.exec_driver_sql(str(CreateIndex(index).compile(dialect=sqlite.dialect())))
    with Session(engine) as db:
        c = Course(name="Preserve my coursework")
        db.add(c); db.flush()
        t = Task(course_id=c.id, title="Keep this task", due_at=datetime.now(timezone.utc))
        db.add(t); db.commit()
        course_id, task_id = c.id, t.id
    ensure_stable_ids(engine)
    ensure_stable_ids(engine)  # Safe on repeated startup.
    with Session(engine) as db:
        assert db.get(Course, course_id).name == "Preserve my coursework"
        assert db.get(Task, task_id).title == "Keep this task"
        db.delete(db.get(Task, task_id)); db.commit()
        new_task = Task(course_id=course_id, title="New task", due_at=datetime.now(timezone.utc))
        db.add(new_task); db.commit()
        assert new_task.id > task_id
        assert db.execute(text("PRAGMA foreign_key_check")).all() == []
    engine.dispose()
