"""Single-process scheduler with persistent delivery claims; no SMTP secrets in responses."""
import asyncio
import json
import os
import re
import smtplib
import ssl
import threading
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from uuid import uuid4
from zoneinfo import ZoneInfo
from typing import Annotated, Literal
from cryptography.fernet import Fernet
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session
from .database import data_dir, get_db
from .models import EmailDelivery, NotificationSettings, Task, TaskStatus, Todo, Meeting
from .meetings import MeetingInput, occurrences
from .email_reports import html_report, report_images

router = APIRouter(prefix='/api/notifications', tags=['Email notifications'])
DB = Annotated[Session, Depends(get_db)]
KEY_PATH = data_dir / 'email.key'
lock = threading.Lock()

class Settings(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)
    enabled: bool = False
    host: str = Field(default='', max_length=255)
    port: int = Field(default=587, ge=1, le=65535)
    security: Literal['starttls', 'ssl'] = 'starttls'
    username: str = Field(default='', max_length=300)
    sender: str = Field(default='', max_length=300)
    recipient: str = Field(default='', max_length=300)
    timezone: str = 'Asia/Dubai'
    daily_report: bool = True
    daily_time: str = '08:00'
    unfinished: bool = True
    unfinished_time: str = '20:00'
    meeting_reminders: bool = True
    upcoming_days: int = Field(default=7, ge=1, le=30)
    include_past_todos: bool = False  # Legacy input accepted, always ignored.
    password: Annotated[str, StringConstraints(strip_whitespace=False, max_length=2000)] | None = None
    clear_password: bool = False

    @field_validator('timezone')
    @classmethod
    def zone(cls, v): return MeetingInput.valid_zone(v)
    @field_validator('daily_time', 'unfinished_time')
    @classmethod
    def clock(cls, v):
        if not re.fullmatch(r'([01]\d|2[0-3]):[0-5]\d', v): raise ValueError('Use HH:MM (24-hour time)')
        return v
    @field_validator('sender', 'recipient')
    @classmethod
    def address(cls, v):
        if v and not re.fullmatch(r'[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+', v): raise ValueError('Enter one valid email address')
        return v
    @field_validator('host', 'username')
    @classmethod
    def single_line(cls, v):
        if '\r' in v or '\n' in v: raise ValueError('Must be a single line')
        return v

def get_settings(db):
    row = db.get(NotificationSettings, 1)
    return row, Settings.model_validate_json(row.config) if row else Settings()

def cipher():
    if not KEY_PATH.exists():
        KEY_PATH.parent.mkdir(parents=True, exist_ok=True)
        try:
            fd = os.open(KEY_PATH, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
            with os.fdopen(fd, 'wb') as f: f.write(Fernet.generate_key())
        except FileExistsError: pass
    return Fernet(KEY_PATH.read_bytes())

def public(row, config):
    config.include_past_todos = False
    return {**config.model_dump(exclude={'password', 'clear_password'}), 'has_password': bool(row and row.secret)}

@router.get('')
def read_settings(db: DB):
    row, config = get_settings(db)
    return public(row, config)

@router.put('')
def save_settings(body: Settings, db: DB):
    if body.enabled and not all([body.host, body.sender, body.recipient]):
        raise HTTPException(422, 'SMTP host, sender and recipient are required before enabling email')
    with lock:
        row = db.get(NotificationSettings, 1) or NotificationSettings(id=1, secret='')
        if body.clear_password: row.secret = ''
        elif body.password: row.secret = cipher().encrypt(body.password.encode()).decode()
        row.config = body.model_dump_json(exclude={'password', 'clear_password'})
        db.add(row); db.commit()
    return public(row, body)

def report_content(db, config, kind, now):
    local = now.astimezone(ZoneInfo(config.timezone)); today = local.date()
    todos = list(db.scalars(select(Todo).where(Todo.scheduled_for.between(today - timedelta(days=1), today), Todo.progress < 100).order_by(Todo.id)))
    tasks = list(db.scalars(select(Task).where(Task.status != TaskStatus.COMPLETED, Task.due_at < now + timedelta(days=config.upcoming_days)).order_by(Task.due_at)))
    heading = 'Unfinished work' if kind == 'unfinished' else 'Your daily study report'
    subject = f'Studyspace · {heading} · {today}'
    def deadline(task):
        return task.due_at.astimezone(ZoneInfo(config.timezone)).strftime('%d %b %Y, %H:%M')
    today_rows, yesterday_rows = [], []
    for todo in todos:
        linked = db.get(Task, todo.task_id) if todo.task_id else None
        state = 'Not started' if todo.progress == 0 else 'In progress'
        rows = today_rows if todo.scheduled_for == today else yesterday_rows
        rows.append((todo.title, f'{state} · {todo.progress}%', deadline(linked) if linked else 'No deadline'))
    task_rows = [(t.title, ('Overdue · ' if t.due_at < now else '') + t.status.value.replace('_', ' ').capitalize(), deadline(t)) for t in tasks]
    sections = [("Today’s unfinished to-dos", today_rows), (f"Yesterday’s unfinished to-dos · {today - timedelta(days=1)}", yesterday_rows), ('Upcoming & overdue coursework', task_rows)]
    lines = [heading, f'{today} · {config.timezone}', '', 'TODAY’S UNFINISHED TO-DO LIST', 'Task | Status | Deadline']
    lines += [' | '.join(row) for row in today_rows] or ['No unfinished to-dos today.']
    lines += ['', f'YESTERDAY’S UNFINISHED TO-DO LIST · {today - timedelta(days=1)}', 'Task | Status | Deadline']
    lines += [' | '.join(row) for row in yesterday_rows] or ['No unfinished to-dos yesterday.']
    lines += ['', 'UPCOMING & OVERDUE COURSEWORK', 'Task | Status | Deadline']
    lines += [' | '.join(row) for row in task_rows] or ['No coursework to report.']
    return {'subject': subject, 'body': '\n'.join(lines), 'has_work': bool(todos or tasks), 'html': html_report(heading, str(today), config.timezone, sections), 'heading': heading, 'date': str(today), 'zone': config.timezone, 'sections': sections}


def report(db, config, kind, now):
    content = report_content(db, config, kind, now)
    return content['subject'], content['body'], content['has_work']


def deliver(config, secret, subject, body, rich=None):
    message = EmailMessage(); message['From'] = config.sender; message['To'] = config.recipient; message['Subject'] = subject
    message.set_content(body)
    if rich:
        message.add_alternative(rich["html"], subtype="html")
        for i, image in enumerate(report_images(rich["heading"], rich["date"], rich["zone"], rich["sections"]) if "sections" in rich else [], 1):
            message.add_attachment(image, maintype="image", subtype="png", filename=f"studyspace-{rich['date']}-{i}.png")
    smtp_class = smtplib.SMTP_SSL if config.security == 'ssl' else smtplib.SMTP
    kwargs = {'context': ssl.create_default_context()} if config.security == 'ssl' else {}
    with smtp_class(config.host, config.port, timeout=20, **kwargs) as smtp:
        if config.security == 'starttls': smtp.ehlo(); smtp.starttls(context=ssl.create_default_context()); smtp.ehlo()
        if config.username: smtp.login(config.username, cipher().decrypt(secret.encode()).decode() if secret else '')
        smtp.send_message(message)

@router.get('/preview')
def preview(db: DB, kind: Literal['daily', 'unfinished'] = 'daily'):
    _, config = get_settings(db)
    content = report_content(db, config, kind, datetime.now(timezone.utc))
    return {key: content[key] for key in ('subject', 'body', 'html', 'has_work')}

@router.get('/history')
def history(db: DB):
    return [{'id': x.id, 'kind': x.kind, 'status': x.status, 'detail': x.detail, 'created_at': x.created_at} for x in db.scalars(select(EmailDelivery).order_by(EmailDelivery.id.desc()).limit(20))]

@router.post('/test')
def test_email(db: DB):
    row, config = get_settings(db)
    if not row or not all([config.host, config.sender, config.recipient]): raise HTTPException(422, 'Save SMTP settings first')
    # Explicit UI action authorizes this single test; automatic delivery stays opt-in.
    attempt = EmailDelivery(delivery_key=str(uuid4()), kind='test', status='sending')
    db.add(attempt); db.commit()
    try:
        content = report_content(db, config, 'daily', datetime.now(timezone.utc))
        deliver(config, row.secret, 'TEST · ' + content['subject'], content['body'], content)
        attempt.status = 'sent'; attempt.detail = 'Accepted by SMTP server'
    except Exception:
        attempt.status = 'failed'; attempt.detail = 'Connection or authentication failed. Check host, port, credentials and network.'
    db.commit()
    if attempt.status == 'failed': raise HTTPException(502, attempt.detail)
    return {'message': attempt.detail}

def tick(engine, now=None):
    now = now or datetime.now(timezone.utc)
    with lock, Session(engine) as db:
        row, config = get_settings(db)
        if not row or not config.enabled: return
        local = now.astimezone(ZoneInfo(config.timezone))
        for kind, enabled, at in [('daily', config.daily_report, config.daily_time), ('unfinished', config.unfinished, config.unfinished_time)]:
            if not enabled or local.strftime('%H:%M') < at: continue
            key = f'{local.date()}:{kind}'
            if db.scalar(select(EmailDelivery.id).where(EmailDelivery.delivery_key == key)): continue
            content = report_content(db, config, kind, now)
            subject, body, work = content['subject'], content['body'], content['has_work']
            attempt = EmailDelivery(delivery_key=key, kind=kind, status='sending' if kind == 'daily' or work else 'skipped')
            db.add(attempt); db.commit()  # claim before SMTP; never resend an ambiguous delivery automatically
            if attempt.status == 'skipped': continue
            try:
                deliver(config, row.secret, subject, body, content)
                attempt.status = 'sent'; attempt.detail = 'Accepted by SMTP server'
            except Exception:
                attempt.status = 'failed'; attempt.detail = 'SMTP failed; check settings and send a test. Automatic retry disabled to avoid duplicate email.'
            db.commit()

        if config.meeting_reminders:
            # Scan the coming hour, including an exact one-hour boundary.
            for meeting in db.scalars(select(Meeting)):
                for occurrence in occurrences(meeting, now, now + timedelta(hours=1, seconds=1)):
                    starts = occurrence['starts_at']
                    if not now < starts <= now + timedelta(hours=1): continue
                    key = f"meeting:{meeting.id}:{starts.isoformat()}"
                    if db.scalar(select(EmailDelivery.id).where(EmailDelivery.delivery_key == key)): continue
                    attempt = EmailDelivery(delivery_key=key, kind='meeting', status='sending')
                    db.add(attempt); db.commit()
                    local_start = starts.astimezone(ZoneInfo(config.timezone))
                    minutes = max(1, int((starts - now).total_seconds() // 60))
                    subject = f'Studyspace · Meeting in {minutes} min · {meeting.title}'
                    body = f"{meeting.title}\nStarts: {local_start:%d %b %Y, %H:%M} ({config.timezone})\nDuration: {meeting.duration} minutes\nPlace: {meeting.place or 'Not specified'}\nLink: {meeting.link or 'Not specified'}\n\n{meeting.notes}"
                    from html import escape
                    html = f'<html><body style="font:16px Arial,sans-serif;line-height:1.7;color:#202638"><h1 style="color:#6d52b6">Meeting in {minutes} minutes</h1><h2>{escape(meeting.title)}</h2><table cellpadding="12" style="border-collapse:collapse;background:#f2f4f8"><tr><th align="left">Starts</th><td>{local_start:%d %b %Y, %H:%M} ({escape(config.timezone)})</td></tr><tr><th align="left">Duration</th><td>{meeting.duration} minutes</td></tr><tr><th align="left">Place</th><td>{escape(meeting.place or "Not specified")}</td></tr></table>'
                    if meeting.link: html += f'<p><a href="{escape(meeting.link, quote=True)}">Open meeting link</a></p>'
                    html += f'<p style="white-space:pre-wrap">{escape(meeting.notes)}</p></body></html>'
                    try:
                        deliver(config, row.secret, subject, body, {'html': html})
                        attempt.status = 'sent'; attempt.detail = f'Meeting reminder accepted: {local_start:%Y-%m-%d %H:%M}'
                    except Exception:
                        attempt.status = 'failed'; attempt.detail = 'Meeting email failed; check SMTP settings. Automatic retry disabled to avoid duplicate email.'
                    db.commit()

async def scheduler(engine):
    while True:
        try: await asyncio.to_thread(tick, engine)
        except Exception:
            import logging
            logging.getLogger(__name__).warning('Email scheduler check failed; it will check again in 30 seconds.')
        await asyncio.sleep(30)
