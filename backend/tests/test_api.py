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
def client(tmp_path, monkeypatch):
    engine = create_engine(f"sqlite:///{tmp_path / 'test.db'}", connect_args={"check_same_thread": False})
    event.listen(engine, "connect", configure_sqlite)
    Base.metadata.create_all(engine)
    import asyncio
    async def idle_scheduler(engine):
        await asyncio.Event().wait()
    monkeypatch.setattr("app.main.scheduler", idle_scheduler)
    monkeypatch.setattr("app.notifications.KEY_PATH", tmp_path / "email.key")
    monkeypatch.setattr("app.main.engine", engine)
    monkeypatch.setattr("app.backgrounds.ASSET_DIR", tmp_path / "backgrounds")
    monkeypatch.setattr("app.music.ASSET_DIR", tmp_path / "music")
    monkeypatch.setattr("app.focus_sounds.ASSET_DIR", tmp_path / "focus-sounds")

    def test_db():
        with Session(engine) as db:
            yield db

    app.dependency_overrides[get_db] = test_db
    with TestClient(app) as client:
        yield client
    app.dependency_overrides.clear()
    engine.dispose()


def test_daily_plan_independence_progress_and_duplicate_suggestions(client):
    day = datetime.now(timezone.utc).date().isoformat()
    c = course(client)
    t = task(client, c["id"])
    payload = {"title": "Work on tree insert", "scheduled_for": day, "task_id": t["id"]}
    first = client.post("/api/todos", json=payload)
    assert first.status_code == 201
    assert client.post("/api/todos", json=payload).json()["id"] == first.json()["id"]
    personal = client.post("/api/todos", json={"title": "Go for a walk", "scheduled_for": day}).json()
    updated = client.patch(f"/api/todos/{first.json()['id']}", json={"progress": 100})
    assert updated.json()["progress"] == 100
    assert client.get(f"/api/tasks/{t['id']}").json()["status"] == "not_started"
    assert len(client.get("/api/todos", params={"day": day}).json()) == 2
    assert client.patch(f"/api/todos/{personal['id']}", json={"progress": 50}).json()["progress"] == 50
    client.delete(f"/api/courses/{c['id']}")
    rows = client.get("/api/todos", params={"day": day}).json()
    assert len(rows) == 2 and rows[0]["task_id"] is None
    assert client.delete(f"/api/todos/{personal['id']}").status_code == 204


def test_daily_plan_date_and_progress_validation(client):
    today = datetime.now(timezone.utc).date()
    yesterday = (today - timedelta(days=1)).isoformat()
    tomorrow = (today + timedelta(days=1)).isoformat()
    assert client.post("/api/todos", json={"title": "Past", "scheduled_for": yesterday}).status_code == 422
    assert client.get("/api/todos", params={"day": yesterday}).status_code == 422
    record = client.post("/api/todos", json={"title": "Future", "scheduled_for": tomorrow}).json()
    assert client.patch(f"/api/todos/{record['id']}", json={"progress": 101}).status_code == 422
    assert client.patch(f"/api/todos/{record['id']}", json={"progress": 3.5}).status_code == 422
    assert client.patch(f"/api/todos/{record['id']}", json={"scheduled_for": yesterday}).status_code == 422
    assert client.patch(f"/api/todos/{record['id']}", json={"title": "Changed", "scheduled_for": today.isoformat()}).status_code == 200
    for offset in [-720, 840]:
        local_day = datetime.now(timezone(timedelta(minutes=offset))).date().isoformat()
        assert client.post("/api/todos", json={"title": "Local today", "scheduled_for": local_day, "utc_offset_minutes": offset}).status_code == 201


def test_background_storage_and_invalid_uploads(client, tmp_path, monkeypatch):
    import base64
    image = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN3sAAAAASUVORK5CYII=")
    result = client.post("/api/backgrounds", content=image, headers={"content-type": "image/png", "x-file-name": "../../photo.png"})
    assert result.status_code == 201
    item = result.json()
    assert client.get(item["url"]).content == image
    assert len(client.get("/api/backgrounds").json()) == 1
    assert all(path.parent == tmp_path / "backgrounds" for path in (tmp_path / "backgrounds").iterdir())
    assert client.post("/api/backgrounds", content=b"<svg/>", headers={"content-type": "image/svg+xml"}).status_code == 415
    assert client.post("/api/backgrounds", content=b"not an image", headers={"content-type": "image/png"}).status_code == 415
    monkeypatch.setattr("app.backgrounds.MAX_BYTES", 10)
    assert client.post("/api/backgrounds", content=image, headers={"content-type": "image/png"}).status_code == 413
    assert len(list((tmp_path / "backgrounds").iterdir())) == 1
    assert client.delete(f"/api/backgrounds/{item['id']}").status_code == 204
    assert client.get(item["url"]).status_code == 404
    assert not list((tmp_path / "backgrounds").iterdir())


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

def meeting(client, **changes):
    body = dict(title='Project check-in', start_local='2026-09-18T10:00', timezone='Asia/Dubai', frequency='weekly', interval=2, count=3)
    body.update(changes)
    return client.post('/api/meetings', json=body)


def test_meeting_crud_fortnight_and_calendar(client):
    result = meeting(client)
    assert result.status_code == 201, result.text
    saved = result.json()
    rows = client.get('/api/meetings/occurrences', params={'start':'2026-09-01T00:00:00Z', 'end':'2026-11-01T00:00:00Z'}).json()
    assert [r['starts_at'][:10] for r in rows] == ['2026-09-18','2026-10-02','2026-10-16']
    assert rows[0]['starts_at'][11:16] == '06:00'
    assert len(client.get('/api/meetings').json()) == 1
    body = {k:v for k,v in saved.items() if k != 'id'}
    body.update(title='Updated check-in', place='Lab 2', link='https://example.com/meeting')
    assert client.put(f"/api/meetings/{saved['id']}", json=body).json()['place'] == 'Lab 2'
    assert client.delete(f"/api/meetings/{saved['id']}").status_code == 204
    assert client.get('/api/meetings').json() == []


def test_meeting_dst_month_end_and_validation(client):
    assert meeting(client, timezone='Invalid/Zone').status_code == 422
    assert meeting(client, link='javascript:alert(1)').status_code == 422
    assert meeting(client, until='2026-01-01').status_code == 422
    assert meeting(client, start_local='2026-03-08T02:30', timezone='America/New_York').status_code == 422
    first = meeting(client, start_local='2026-03-01T10:00', timezone='America/New_York',interval=1,count=2).json()
    rows = client.get('/api/meetings/occurrences',params={'start':'2026-03-01T00:00:00Z','end':'2026-03-10T00:00:00Z'}).json()
    assert [r['starts_at'][11:16] for r in rows] == ['15:00','14:00']
    client.delete(f"/api/meetings/{first['id']}")
    meeting(client,start_local='2026-01-31T10:00',frequency='monthly',interval=1,count=2)
    rows = client.get('/api/meetings/occurrences',params={'start':'2026-01-01T00:00:00Z','end':'2026-05-01T00:00:00Z'}).json()
    assert [r['starts_at'][:10] for r in rows] == ['2026-01-31','2026-03-31']
    assert client.get('/api/meetings/occurrences',params={'start':'2026-01-01','end':'2030-01-01'}).status_code == 422


def test_email_settings_encryption_and_preview(client, monkeypatch):
    from app.models import NotificationSettings
    from app.main import engine
    config = client.get('/api/notifications').json()
    assert config['enabled'] is False
    config.pop('has_password')
    config.update(host='smtp.example.com',sender='me@example.com',recipient='me@example.com',password='secret-test-value')
    response = client.put('/api/notifications',json=config)
    assert response.status_code == 200
    assert response.json()['has_password'] and 'password' not in response.json()
    with Session(engine) as db:
        row=db.get(NotificationSettings,1)
        assert 'secret-test-value' not in row.secret and 'secret-test-value' not in row.config
    config['password']=''
    assert client.put('/api/notifications',json=config).json()['has_password']
    preview=client.get('/api/notifications/preview').json()
    assert 'TO-DO LIST' in preview['body']
    sent=[]
    monkeypatch.setattr('app.notifications.deliver',lambda *args: sent.append(args))
    assert client.post('/api/notifications/test').status_code == 200
    assert len(sent)==1
    assert client.get('/api/notifications/history').json()[0]['status']=='sent'
    config['clear_password']=True
    assert not client.put('/api/notifications',json=config).json()['has_password']
    config['sender']='bad\r\nBcc:other@example.com'
    assert client.put('/api/notifications',json=config).status_code==422


def test_email_scheduler_completion_dedup_and_disabled(client, monkeypatch):
    from app.notifications import tick
    from app.main import engine
    from app.models import Todo
    now=datetime(2026,9,18,17,0,tzinfo=timezone.utc)
    config=dict(host='smtp.example.com',sender='me@example.com',recipient='me@example.com',enabled=False,timezone='Asia/Dubai',daily_time='08:00',unfinished_time='20:00')
    client.put('/api/notifications',json=config)
    sent=[];monkeypatch.setattr('app.notifications.deliver',lambda *args:sent.append(args))
    tick(engine,now);assert not sent
    with Session(engine) as db:
        db.add(Todo(title='Write report',scheduled_for=now.date(),progress=25));db.commit()
    config['enabled']=True;client.put('/api/notifications',json=config)
    tick(engine,now);tick(engine,now)
    assert len(sent)==2 and 'Write report' in sent[1][3]
    with Session(engine) as db:
        todo=db.scalar(__import__('sqlalchemy').select(Todo));todo.progress=100;db.commit()
    tick(engine,now+timedelta(days=1))
    assert len(sent)==3  # daily sends; unfinished reminder skips completed work
    assert client.get('/api/notifications/history').json()[0]['status']=='skipped'


def test_email_failure_is_visible_and_not_retried(client, monkeypatch):
    from app.notifications import tick
    from app.main import engine
    def fail(*args): raise RuntimeError('private-password-must-not-leak')
    monkeypatch.setattr('app.notifications.deliver',fail)
    client.put('/api/notifications',json=dict(host='smtp.example.com',sender='me@example.com',recipient='me@example.com',enabled=True,daily_time='00:00',unfinished=False))
    now=datetime(2026,9,18,17,0,tzinfo=timezone.utc)
    tick(engine,now);tick(engine,now)
    history=client.get('/api/notifications/history').json()
    assert len(history)==1 and history[0]['status']=='failed'
    assert 'private-password' not in str(history)



def test_report_two_days_legacy_setting_timezone_and_deadline(client):
    from app.main import engine
    from app.models import Todo
    from app.notifications import Settings, report_content
    now=datetime(2026,9,20,21,0,tzinfo=timezone.utc)  # Sep 21 in Dubai
    with Session(engine) as db:
        c=Course(name='Test');db.add(c);db.flush()
        task=Task(course_id=c.id,title='Linked assignment',due_at=now+timedelta(days=1));db.add(task);db.flush()
        db.add_all([Todo(title='OLD PLAN',scheduled_for=datetime(2026,9,19).date(),progress=0),Todo(title='YESTERDAY PLAN',scheduled_for=datetime(2026,9,20).date(),progress=25),Todo(title='Today <script>alert(1)</script>',scheduled_for=datetime(2026,9,21).date(),progress=50,task_id=task.id),Todo(title='DONE TODAY',scheduled_for=datetime(2026,9,21).date(),progress=100),Todo(title='FUTURE PLAN',scheduled_for=datetime(2026,9,22).date(),progress=0)])
        db.commit()
        for kind in ['daily','unfinished']:
            result=report_content(db,Settings(include_past_todos=True),kind,now)
            assert 'OLD PLAN' not in result['body'] and 'FUTURE PLAN' not in result['body'] and 'DONE TODAY' not in result['body']
            assert 'YESTERDAY PLAN' in result['body']
            assert 'In progress' in result['body'] and '22 Sep 2026, 01:00' in result['body']
            assert '<script>' not in result['html'] and '&lt;script&gt;' in result['html']
            assert 'Deadline' in result['html'] and '<table' in result['html']


def test_rich_email_html_png_and_plain_fallback(client, monkeypatch):
    from app.notifications import Settings, deliver, report_content
    from app.main import engine
    sent=[]
    class SMTP:
        def __init__(self,*args,**kwargs): pass
        def __enter__(self): return self
        def __exit__(self,*args): pass
        def ehlo(self): pass
        def starttls(self,**kwargs): assert kwargs['context'].check_hostname
        def send_message(self,message): sent.append(message)
    monkeypatch.setattr('app.notifications.smtplib.SMTP',SMTP)
    with Session(engine) as db: content=report_content(db,Settings(),'daily',datetime.now(timezone.utc))
    deliver(Settings(sender='me@example.com',recipient='me@example.com'),'',content['subject'],content['body'],content)
    parts=list(sent[0].walk())
    assert any(p.get_content_type()=='text/plain' for p in parts)
    assert any(p.get_content_type()=='text/html' for p in parts)
    png=next(p for p in parts if p.get_content_type()=='image/png')
    assert png.get_payload(decode=True).startswith(b'\x89PNG')
    assert png.get_filename().endswith('.png')


def test_report_image_pagination():
    from app.email_reports import report_images
    from PIL import Image
    from io import BytesIO
    rows=[('A long coursework title ' * 8,'In progress · 50%','21 Sep 2026, 23:59') for _ in range(20)]
    pages=report_images('Study report','2026-09-20','Asia/Dubai',[('Today',rows)])
    assert len(pages)>1
    for page in pages:
        with Image.open(BytesIO(page)) as im: assert im.width == 1200 and 400 <= im.height <= 1700


def test_music_upload_range_validation_and_delete(client, monkeypatch):
    import io,wave
    with io.BytesIO() as buffer:
        with wave.open(buffer,'wb') as wav:
            wav.setnchannels(1);wav.setsampwidth(2);wav.setframerate(8000);wav.writeframes(b'\0\0'*800)
        data=buffer.getvalue()
    response=client.post('/api/music',content=data,headers={'content-type':'audio/wav','x-file-name':'Study%20song.wav'})
    assert response.status_code==201
    item=response.json();assert item['name']=='Study song.wav'
    assert client.get(item['url']).content==data
    part=client.get(item['url'],headers={'Range':'bytes=0-15'})
    assert part.status_code==206 and part.content==data[:16]
    assert client.post('/api/music',content=b'not audio',headers={'content-type':'audio/wav'}).status_code==415
    assert client.post('/api/music',content=data,headers={'content-type':'text/html'}).status_code==415
    monkeypatch.setattr('app.music.MAX_BYTES',16)
    assert client.post('/api/music',content=data,headers={'content-type':'audio/wav'}).status_code==413
    assert len(client.get('/api/music').json())==1
    assert client.delete('/api/music/'+str(item['id'])).status_code==204
    assert client.get(item['url']).status_code==404


def test_radio_directory_filters_unsafe_urls(client,monkeypatch):
    import json
    class Response:
        def __enter__(self): return self
        def __exit__(self,*args): pass
        def read(self,*args): return json.dumps([{'stationuuid':'1','name':'Jazz','url_resolved':'https://radio.example.com/live'}, {'stationuuid':'2','name':'Unsafe','url_resolved':'javascript:alert(1)'},{'stationuuid':'3','name':'Local','url_resolved':'https://127.0.0.1/'}]).encode()
    monkeypatch.setattr('urllib.request.urlopen',lambda *args,**kwargs:Response())
    rows=client.get('/api/music/radio/search?q=jazz').json()
    assert len(rows)==1 and rows[0]['name']=='Jazz'



def test_meeting_email_one_hour_recurring_dedup_and_late_start(client,monkeypatch):
    from app.notifications import tick
    from app.main import engine
    from app.models import EmailDelivery
    config=dict(host='smtp.example.com',sender='me@example.com',recipient='me@example.com',enabled=True,daily_report=False,unfinished=False,meeting_reminders=True)
    client.put('/api/notifications',json=config)
    meeting(client,start_local='2026-09-22T14:00',frequency='weekly',interval=1,count=3,place='Lab 4',link='https://example.com/join')
    starts=datetime(2026,9,22,10,0,tzinfo=timezone.utc)
    sent=[];monkeypatch.setattr('app.notifications.deliver',lambda *args:sent.append(args))
    tick(engine,starts-timedelta(hours=1,seconds=1));assert not sent
    tick(engine,starts-timedelta(hours=1));tick(engine,starts-timedelta(minutes=59))
    assert len(sent)==1 and '60 min' in sent[0][2] and 'Lab 4' in sent[0][3] and 'Open meeting link' in sent[0][4]['html']
    tick(engine,starts+timedelta(days=7,minutes=-30))
    assert len(sent)==2 and '30 min' in sent[1][2]
    tick(engine,starts+timedelta(days=14,minutes=1));assert len(sent)==2
    assert all(x['kind']=='meeting' for x in client.get('/api/notifications/history').json())


def test_meeting_email_disabled_and_deleted(client,monkeypatch):
    from app.notifications import tick
    from app.main import engine
    config=dict(host='smtp.example.com',sender='me@example.com',recipient='me@example.com',enabled=True,daily_report=False,unfinished=False,meeting_reminders=False)
    client.put('/api/notifications',json=config)
    m=meeting(client,start_local='2026-09-22T14:00',frequency='once').json()
    sent=[];monkeypatch.setattr('app.notifications.deliver',lambda *args:sent.append(args))
    now=datetime(2026,9,22,9,0,tzinfo=timezone.utc)
    tick(engine,now);assert not sent
    client.delete(f"/api/meetings/{m['id']}")
    config['meeting_reminders']=True;client.put('/api/notifications',json=config)
    tick(engine,now);assert not sent


def test_focus_sound_upload_limit_and_removal(client,monkeypatch):
    from app import focus_sounds
    data=b'RIFF'+b'\x00'*4+b'WAVE'+b'\x00'*20
    result=client.post('/api/focus-sounds',content=data,headers={'content-type':'audio/wav','x-file-name':'My%20alert.wav'})
    assert result.status_code==201
    sound=result.json();assert sound['url'].startswith('/api/focus-sounds/')
    assert client.get(sound['url']).content==data
    assert len(client.get('/api/focus-sounds').json())==1
    assert client.get('/api/music').json()==[]
    monkeypatch.setattr(focus_sounds,'MAX_BYTES',16)
    assert client.post('/api/focus-sounds',content=data,headers={'content-type':'audio/wav'}).status_code==413
    assert client.delete('/api/focus-sounds/'+str(sound['id'])).status_code==204
    assert client.get(sound['url']).status_code==404


def test_youtube_search_requires_key_and_normalizes_results(client,monkeypatch):
    import json
    monkeypatch.delenv('YOUTUBE_API_KEY',raising=False)
    assert client.get('/api/music/youtube/search?q=study').status_code==503
    monkeypatch.setenv('YOUTUBE_API_KEY','private-test-key')
    class Response:
        def __enter__(self):return self
        def __exit__(self,*args):pass
        def read(self,*args):return json.dumps({'items':[{'id':{'videoId':'abcdefghijk'},'snippet':{'title':'Study video','channelTitle':'Channel'}},{'id':{'videoId':'bad'},'snippet':{'title':'Bad','channelTitle':'Channel'}}]}).encode()
    monkeypatch.setattr('urllib.request.urlopen',lambda *args,**kwargs:Response())
    result=client.get('/api/music/youtube/search?q=study')
    assert result.json()==[{'id':'abcdefghijk','title':'Study video','channel':'Channel'}]
    assert 'private-test-key' not in result.text


def test_music_settings_secret_preservation_and_search_options(client, monkeypatch):
    import json
    from urllib.parse import parse_qs, urlparse
    from app.models import MusicSettings
    monkeypatch.delenv('YOUTUBE_API_KEY', raising=False)
    assert client.get('/api/settings/music').json()['key_source'] == 'none'
    response = client.put('/api/settings/music', json={'api_key':'private-test-key','result_count':6,'safe_search':'strict'})
    assert response.status_code == 200
    assert 'private-test-key' not in response.text
    assert response.json()['has_key']
    with Session(__import__('app.main', fromlist=['engine']).engine) as db:
        assert 'private-test-key' not in db.get(MusicSettings,1).secret
    assert client.put('/api/settings/music', json={'api_key':'','result_count':18}).json()['has_key']
    seen = {}
    class Reply:
        def __enter__(self): return self
        def __exit__(self,*args): pass
        def read(self,*args): return json.dumps({'items':[]}).encode()
    def fetch(req, **kwargs):
        seen.update(parse_qs(urlparse(req.full_url).query)); return Reply()
    monkeypatch.setattr('urllib.request.urlopen',fetch)
    assert client.get('/api/music/youtube/search?q=test').status_code == 200
    assert seen['key']==['private-test-key'] and seen['maxResults']==['18']
    assert client.put('/api/settings/music',json={'result_count':99}).status_code == 422
    assert client.put('/api/settings/music',json={'api_key':'bad key'}).status_code == 422
    monkeypatch.setenv('YOUTUBE_API_KEY','environment-key')
    assert client.put('/api/settings/music',json={'clear_key':True}).json()['key_source']=='environment'
    client.get('/api/music/youtube/search?q=test')
    assert seen['key']==['environment-key']
